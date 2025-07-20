import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, searchQdrant } from '@/lib/brain/processors/embed';
import axios from 'axios';
import { BlockConnectionManager } from '@/lib/block-connections';
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
      model: 'llama3.1',
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

// Helper to group linked blocks by entity (WHO block and its connected WHAT blocks)
function groupBlocksByEntity(blocks: Block[]): { entityId: string, combinedContent: string, blocks: Block[] }[] {
  // Compute groups using BlockConnectionManager
  const groupMap = BlockConnectionManager['computeGroupsSync'](blocks);
  const groups: Record<string, Block[]> = {};
  for (const block of blocks) {
    const groupId = groupMap[block.id];
    if (!groups[groupId]) groups[groupId] = [];
    groups[groupId].push(block);
  }
  // For each group, combine the content of all blocks
  return Object.entries(groups).map(([entityId, groupBlocks]) => ({
    entityId,
    combinedContent: groupBlocks.map(b => b.content).filter(Boolean).join('\n'),
    blocks: groupBlocks
  }));
}

export async function POST(req: NextRequest) {
  const { note_id, query, topK = 10, allBlocks } = await req.json();
  if (!note_id || !query || !allBlocks) {
    return NextResponse.json({ error: 'Missing note_id, query, or allBlocks' }, { status: 400 });
  }

  // Group blocks by entity (linked blocks)
  const entities = groupBlocksByEntity(allBlocks);

  // Generate alternative queries
  const altQueries = await generateAlternativeQueries(query, 5);

  // Retrieve results for each alternative query using combined entity content
  let allResults: any[] = [];
  for (const altQuery of altQueries) {
    const queryEmbedding = await getEmbedding(altQuery);
    // For each entity, embed the combined content and search Qdrant
    for (const entity of entities) {
      const entityEmbedding = await getEmbedding(entity.combinedContent);
      const filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
      const results = await searchQdrant({ queryEmbedding: entityEmbedding, filter, topK: 10 });
      console.log('Qdrant raw results:', results); // DEBUG: log raw Qdrant results
      allResults = allResults.concat(results);
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

  // After deduplication, log the deduped results
  console.log('Deduped results:', dedupedResults);

  let context = '';
  let prompt = '';
  let answer = '';

  if (isSummarizationQuery(query)) {
    // Summarization: use all chunks for this note, regardless of score
    const allChunks = dedupedResults
      .map(r => {
        const meta = r.payload ? `[${r.payload.position ?? ''} ${r.payload.type ?? ''}]` : '';
        return `${meta} ${r.payload?.content || ''}`;
      })
      .filter(Boolean);
    context = allChunks.join('\n---\n');
    prompt = `You are a helpful assistant summarizing a user's notes. Based on the following notes, generate a concise summary of the main ideas.\n\nNotes:\n${context}`;
  } else {
    // Q&A: use only chunks with high similarity
    let relevantChunks = dedupedResults
      .filter(r => typeof r.score === 'number' && r.score > 0.5)
      .map(r => {
        const meta = r.payload ? `[${r.payload.position ?? ''} ${r.payload.type ?? ''}]` : '';
        return `${meta} ${r.payload?.content || ''}`;
      })
      .filter(Boolean);
    // Fallback: if context is empty, use all deduped results' content
    if (relevantChunks.length === 0) {
      relevantChunks = dedupedResults
        .map(r => {
          const meta = r.payload ? `[${r.payload.position ?? ''} ${r.payload.type ?? ''}]` : '';
          return `${meta} ${r.payload?.content || ''}`;
        })
        .filter(Boolean);
    }
    context = relevantChunks.join('\n---\n');
    prompt = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question. If the answer is not in the context, say "I don't know."\n\nContext:\n${context}\n\nQuestion: ${query}\nAnswer:`;
  }

  // Before sending to Ollama, log the context
  console.log('[RAG] Final context for Ollama:', context);

  console.log('[RAG] Context sent to Ollama:', context);
  console.log('[RAG] Prompt sent to Ollama:', prompt);

  if (context) {
    try {
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
    } catch (err) {
      answer = 'Failed to generate answer.';
    }
  } else {
    answer = 'No relevant content found to answer the question.';
  }

  return NextResponse.json({ results: dedupedResults, answer });
} 