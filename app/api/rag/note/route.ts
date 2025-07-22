import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, searchQdrant } from '@/lib/brain/processors/embed';
import axios from 'axios';
import type { Block } from '@/lib/db';
import http from 'http';
import https from 'https';

// Helper to detect summarization queries
function isSummarizationQuery(query: string) {
  const q = query.toLowerCase();
  return q.includes('summarize') || q.includes('summary') || q.includes('main points') || q.includes('overview');
}

// Generate alternative queries using Ollama
async function generateAlternativeQueries(question: string, numVariants = 5): Promise<string[]> {
  const prompt = `You are an AI language model assistant. Your task is to generate ${numVariants} different versions of the given user question to retrieve relevant documents from a vector database. By generating multiple perspectives on the user question, your goal is to help the user overcome some of the limitations of the distance-based similarity search. Provide these alternative questions separated by newlines.\nOriginal question: ${question}`;
  try {
    const ollamaRes = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt
    });
    const data = ollamaRes.data as { response: string };
    if (data.response) {
      return data.response.split('\n').map(q => q.trim()).filter(Boolean);
    }
  } catch (err) {
    console.error('Failed to generate alternative queries:', err);
  }
  return [question]; // fallback to original question
}

// Helper to embed and store note content in Qdrant
async function embedAndStoreNote(note_id: string, folder_id: string, allBlocks: Block[]) {
  console.log(`[RAG] No embeddings found for note ${note_id}, embedding and storing now...`);

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: allBlocks,
        note_id,
        folder_id
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to embed note: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[RAG] Successfully embedded note ${note_id}:`, result);
    return true;
  } catch (error) {
    console.error(`[RAG] Failed to embed note ${note_id}:`, error);
    return false;
  }
}

// --- NEW: Block-to-fact mapping for all block types ---
function blockToFactLine(block: Block, allBlocks: Block[]): string {
  switch (block.type) {
    case 'who':
      return `Entity: ${block.content || 'Unknown'} | Description/Action/Definition: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map(id => {
            const linked = allBlocks.find(b => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
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

export async function POST(req: NextRequest) {
  const startTotal = Date.now();
  const { note_id, query, topK = 10, allBlocks, folder_id } = await req.json();
  if (!note_id || !query || !allBlocks) {
    return NextResponse.json({ error: 'Missing note_id, query, or allBlocks' }, { status: 400 });
  }

  // OPTIMIZATION: This endpoint now uses pre-stored embeddings from Qdrant
  // instead of generating embeddings on-the-fly during chat requests.
  // This significantly improves performance by eliminating redundant embedding generation.

  const t0 = Date.now();

  // Generate alternative queries for better retrieval
  const altQueries = await generateAlternativeQueries(query, 3); // Reduced from 5 to 3 for efficiency
  const t1 = Date.now();
  console.log(`[TIMING] generateAlternativeQueries: ${t1 - t0}ms`);

  // Retrieve results using pre-stored embeddings in Qdrant
  let allResults: any[] = [];
  let embeddingTime = 0;
  let qdrantTime = 0;

  for (const altQuery of altQueries) {
    const tEmbedStart = Date.now();
    // Only embed the user query - use pre-stored embeddings for content
    const queryEmbedding = await getEmbedding(altQuery);
    embeddingTime += Date.now() - tEmbedStart;

    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      throw new Error('Embedding failed or returned wrong dimension (expected 768).');
    }

    // Search Qdrant for pre-stored embeddings matching this note
    const filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
    const tQdrantStart = Date.now();
    const results = await searchQdrant({ queryEmbedding, filter, topK: 15 }); // Increased topK since we're not doing entity grouping
    qdrantTime += Date.now() - tQdrantStart;
    allResults = allResults.concat(results);
  }

  const t2 = Date.now();
  console.log(`[TIMING] Query embedding total: ${embeddingTime}ms`);
  console.log(`[TIMING] Qdrant search total: ${qdrantTime}ms`);
  console.log(`[TIMING] Retrieval loop: ${t2 - t1}ms`);

  // FALLBACK: If no results found, the note might not be embedded yet
  // This handles cases where:
  // 1. A note was just created and hasn't been saved/embedded yet
  // 2. A note exists but its embeddings were deleted from Qdrant
  // 3. A note was imported but not yet indexed
  // Automatically embed it and retry the search
  if (allResults.length === 0 && allBlocks.length > 0) {
    console.log(`[RAG] No results found for note ${note_id}, attempting to embed note...`);

    const embedSuccess = await embedAndStoreNote(note_id, folder_id, allBlocks);

    if (embedSuccess) {
      // Retry the search with the newly embedded content
      console.log(`[RAG] Retrying search after embedding note ${note_id}...`);
      allResults = [];

      for (const altQuery of altQueries) {
        const queryEmbedding = await getEmbedding(altQuery);
        const filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
        const results = await searchQdrant({ queryEmbedding, filter, topK: 15 });
        allResults = allResults.concat(results);
      }

      console.log(`[RAG] Found ${allResults.length} results after embedding note ${note_id}`);
    }
  }

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

  // After deduplication, log the deduped results
  console.log('Deduped results:', dedupedResults);
  // Log all block types included in the context
  const blockTypesInContext = dedupedResults.map(r => r.payload?.type).filter(Boolean);
  console.log('Block types in context:', blockTypesInContext);

  // Build LLM-friendly context using blockToFactLine
  const instructions = `Instructions:\n- Each line below is a fact, with the format depending on the type of information (Entity, Time, Place, Reason, Method, Media, Check, etc.).\n- Use these facts to answer the question.\n- Do not repeat identical facts or answers.\n- If you can infer a likely time, place, or connection, state your reasoning.\n`;

  // Use all deduped results' blockIds to build the context
  const factLines = dedupedResults
    .map(r => r.payload && r.payload.blockId
      ? blockToFactLine(allBlocks.find((b: Block) => b.id === r.payload.blockId) as Block, allBlocks)
      : `${r.payload?.type}: ${r.payload?.content || ''}`)
    .filter(Boolean);
  const context = `${instructions}\nFacts:\n${factLines.join('\n')}\n`;
  const t4 = Date.now();
  console.log(`[TIMING] Context building: ${t4 - t3}ms`);

  const prompt = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question. If the answer is not in the context, say "I don't know."\n\n${context}\nQuestion: ${query}\nAnswer:`;

  let answer = '';
  // Before sending to Ollama, log the context
  console.log('[RAG] Final context for Ollama:', context);

  console.log('[RAG] Context sent to Ollama:', context);
  console.log('[RAG] Prompt sent to Ollama:', prompt);

  if (context) {
    try {
      const tLLMStart = Date.now();
      // Use Node.js http/https for streaming
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
        const req = reqModule.request(options, res => {
          let buffer = '';
          res.on('data', chunk => {
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
          res.on('end', () => resolve(answer.trim() || 'No answer generated by model.'));
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
  return NextResponse.json({ results: dedupedResults, answer });
} 