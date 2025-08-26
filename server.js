const fs = require('fs');
if (fs.existsSync('.env.local')) {
  require('dotenv').config({ path: '.env.local' });
} else {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const { getEmbedding, searchQdrant } = require('./lib/brain/processors/embed.js');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { Block } = require('./lib/db.js');

function isSummarizationQuery(query) {
  const q = query.toLowerCase();
  return q.includes('summarize') || q.includes('summary') || q.includes('main points') || q.includes('overview');
}

async function generateAlternativeQueries(question, numVariants = 5) {
  const prompt = `You are an AI language model assistant. Your task is to generate ${numVariants} different versions of the given user question to retrieve relevant documents from a vector database. By generating multiple perspectives on the user question, your goal is to help the user overcome some of the limitations of the distance-based similarity search. Provide these alternative questions separated by newlines.\nOriginal question: ${question}`;
  try {
    const ollamaRes = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-llm:7b',
      prompt
    });
    const data = ollamaRes.data;
    if (data.response) {
      return data.response.split('\n').map(q => q.trim()).filter(Boolean);
    }
  } catch (err) {
    console.error('Failed to generate alternative queries:', err);
  }
  return [question];
}

function blockToFactLine(block, allBlocks) {
  if (!block) return '';
  switch (block.type) {
    case 'who':
    case 'what':
      return `Entity: ${block.content || 'Unknown'} | Description/Action/Definition: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map(id => {
            const linked = allBlocks.find(b => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
    case 'when':
      return `Time: ${block.content || 'Unknown'} | Event: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map(id => {
            const linked = allBlocks.find(b => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
    case 'where':
      return `Place: ${block.content || 'Unknown'} | Event: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map(id => {
            const linked = allBlocks.find(b => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
    case 'why':
      return `Reason: ${block.content || ''}`;
    case 'how':
      return `Method: ${block.content || ''}`;
    case 'image':
      return `Media: Image | Description: ${block.content || ''}`;
    case 'video':
      return `Media: Video | Description: ${block.content || ''}`;
    case 'code':
      return `Code: ${block.content || ''}`;
    case 'note':
      return `Note: ${block.content || ''}`;
    case 'check':
      return `Check: ${block.content || ''}`;
    default:
      return `${block.type}: ${block.content || ''}`;
  }
}

app.post('/api/rag', async (req, res) => {
  const startTotal = Date.now();
  const { note_id, query, topK = 10, allBlocks, folder_id } = req.body;
  if (!note_id || !query || !allBlocks) {
    return res.status(400).json({ error: 'Missing note_id, query, or allBlocks' });
  }

  const t0 = Date.now();
  const altQueries = await generateAlternativeQueries(query, 3);
  const t1 = Date.now();
  console.log(`[TIMING] generateAlternativeQueries: ${t1 - t0}ms`);

  let allResults = [];
  let embeddingTime = 0;
  let qdrantTime = 0;

  for (const altQuery of altQueries) {
    const tEmbedStart = Date.now();
    const queryEmbedding = await getEmbedding(altQuery);
    embeddingTime += Date.now() - tEmbedStart;

    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      return res.status(500).json({ error: 'Embedding failed or returned wrong dimension (expected 768).' });
    }

    const filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
    const tQdrantStart = Date.now();
    const results = await searchQdrant({ queryEmbedding, filter, topK: 15 });
    qdrantTime += Date.now() - tQdrantStart;
    allResults = allResults.concat(results);
  }

  const t2 = Date.now();
  console.log(`[TIMING] Query embedding total: ${embeddingTime}ms`);
  console.log(`[TIMING] Qdrant search total: ${qdrantTime}ms`);
  console.log(`[TIMING] Retrieval loop: ${t2 - t1}ms`);

  // Deduplicate results by payload content (or id if available)
  const seen = new Set();
  const dedupedResults = allResults.filter(r => {
    const key = r.payload?.content || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const t3 = Date.now();
  console.log(`[TIMING] Deduplication: ${t3 - t2}ms`);

  const blockTypesInContext = dedupedResults.map(r => r.payload?.type).filter(Boolean);
  console.log('Block types in context:', blockTypesInContext);

  const instructions = `Instructions:\n- Each line below is a fact, with the format depending on the type of information (Entity, Time, Place, Reason, Method, Media, Check, etc.).\n- Use these facts to answer the question.\n- Do not repeat identical facts or answers.\n- If you can infer a likely time, place, or connection, state your reasoning.\n`;

  const factLines = dedupedResults
    .map(r => r.payload && r.payload.blockId
      ? blockToFactLine(allBlocks.find(b => b.id === r.payload.blockId), allBlocks)
      : `${r.payload?.type}: ${r.payload?.content || ''}`)
    .filter(Boolean);
  const context = `${instructions}\nFacts:\n${factLines.join('\n')}\n`;
  const t4 = Date.now();
  console.log(`[TIMING] Context building: ${t4 - t3}ms`);

  const prompt = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question. If the answer is not in the context, say "I don't know."\n\n${context}\nQuestion: ${query}\nAnswer:`;

  let answer = '';
  console.log('[RAG] Final context for Ollama:', context);
  console.log('[RAG] Prompt sent to Ollama:', prompt);

  if (context) {
    try {
      const tLLMStart = Date.now();
      const url = new URL('http://localhost:11434/api/generate');
      const isHttps = url.protocol === 'https:';
      const reqModule = isHttps ? https : http;
      const postData = JSON.stringify({ model: 'llama3.1', prompt });
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      answer = await new Promise((resolve, reject) => {
        const req = reqModule.request(options, res2 => {
          let buffer = '';
          res2.on('data', chunk => {
            buffer += chunk.toString();
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.response) answer += data.response;
                if (data.done) {
                  resolve(answer.trim() || 'No answer generated by model.');
                  return;
                }
              } catch (e) {
                // Ignore parse errors for incomplete lines
              }
            }
          });
          res2.on('end', () => resolve(answer.trim() || 'No answer generated by model.'));
        });
        req.on('error', err => reject('Failed to generate answer.'));
        req.write(postData);
        req.end();
      });
      console.log('[Ollama] Full answer:', answer);
      console.log(`[TIMING] LLM call: ${Date.now() - tLLMStart}ms`);
    } catch (err) {
      answer = 'Failed to generate answer.';
    }
  } else {
    answer = 'No relevant content found to answer the question.';
  }
  console.log(`[TIMING] Total endpoint time: ${Date.now() - startTotal}ms`);
  return res.json({ results: dedupedResults, answer });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
}); 