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

// Helper to gather content from a block and all its direct connections (recursively, bidirectional, no cycles)
function gatherConnectedContentBidirectional(block: Block, allBlocks: Block[], visited = new Set<string>()): string {
  if (!block || visited.has(block.id)) return '';
  visited.add(block.id);
  let content = block.content || '';
  // Forward connections
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && linkedBlock.content) {
        content += '\n' + `[${linkedBlock.type}] ${linkedBlock.content}`;
        content += gatherConnectedContentBidirectional(linkedBlock, allBlocks, visited);
      }
    }
  }
  // Backward connections
  for (const other of allBlocks) {
    if (other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && !visited.has(other.id)) {
      content += '\n' + `[${other.type}] ${other.content}`;
      content += gatherConnectedContentBidirectional(other, allBlocks, visited);
    }
  }
  return content;
}

// Helper to gather and group connected content by type for a block (no repeats)
function gatherGroupedConnectedContent(block: Block, allBlocks: Block[], visited = new Set<string>()): string {
  if (!block || visited.has(block.id)) return '';
  visited.add(block.id);
  let line = `[${block.type}] ${block.content || ''}`;
  // Collect directly connected blocks by type
  const connected: Record<string, Set<string>> = {};
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && !visited.has(linkedBlock.id)) {
        if (!connected[linkedBlock.type]) connected[linkedBlock.type] = new Set();
        connected[linkedBlock.type].add(linkedBlock.content || '');
      }
    }
  }
  // Backward connections
  for (const other of allBlocks) {
    if (other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && !visited.has(other.id)) {
      if (!connected[other.type]) connected[other.type] = new Set();
      connected[other.type].add(other.content || '');
    }
  }
  // Append grouped connected content (deduplicated)
  for (const type of Object.keys(connected)) {
    for (const content of connected[type]) {
      if (content && content.trim().length > 0) {
        line += ` [${type}] ${content}`;
      }
    }
  }
  return line;
}

// Helper to gather and group connected content by type for a block (no repeats, inline [when])
function gatherGroupedConnectedContentInlineWhen(block: Block, allBlocks: Block[], visited = new Set<string>()): string {
  if (!block || visited.has(block.id)) return '';
  visited.add(block.id);
  let line = `[${block.type}] ${block.content || ''}`;
  // Inline [when] blocks directly connected
  let inlinedWhen = '';
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && linkedBlock.type === 'when' && linkedBlock.content && !visited.has(linkedBlock.id)) {
        inlinedWhen += ` [when] ${linkedBlock.content}`;
        visited.add(linkedBlock.id);
      }
    }
  }
  // Backward inline [when]
  for (const other of allBlocks) {
    if (other.type === 'when' && other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && other.content && !visited.has(other.id)) {
      inlinedWhen += ` [when] ${other.content}`;
      visited.add(other.id);
    }
  }
  // Collect other directly connected blocks by type (excluding [when])
  const connected: Record<string, Set<string>> = {};
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && linkedBlock.type !== 'when' && !visited.has(linkedBlock.id)) {
        if (!connected[linkedBlock.type]) connected[linkedBlock.type] = new Set();
        connected[linkedBlock.type].add(linkedBlock.content || '');
      }
    }
  }
  // Backward for other types
  for (const other of allBlocks) {
    if (other.type !== 'when' && other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && other.content && !visited.has(other.id)) {
      if (!connected[other.type]) connected[other.type] = new Set();
      connected[other.type].add(other.content || '');
    }
  }
  // Append grouped connected content (deduplicated, excluding [when])
  for (const type of Object.keys(connected)) {
    for (const content of connected[type]) {
      if (content && content.trim().length > 0) {
        line += ` [${type}] ${content}`;
      }
    }
  }
  line += inlinedWhen;
  return line;
}

// Helper to gather and group connected content by type for a block (no repeats, inline [when] as natural language)
function gatherGroupedConnectedContentInlineWhenNatural(block: Block, allBlocks: Block[], visited = new Set<string>()): string {
  if (!block || visited.has(block.id)) return '';
  visited.add(block.id);
  let line = `[${block.type}] ${block.content || ''}`;
  // Inline [when] blocks directly connected, as natural language
  let whenPhrase = '';
  let whenTimes: string[] = [];
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && linkedBlock.type === 'when' && linkedBlock.content && !visited.has(linkedBlock.id)) {
        whenTimes.push(linkedBlock.content);
        visited.add(linkedBlock.id);
      }
    }
  }
  // Backward inline [when]
  for (const other of allBlocks) {
    if (other.type === 'when' && other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && other.content && !visited.has(other.id)) {
      whenTimes.push(other.content);
      visited.add(other.id);
    }
  }
  if (whenTimes.length === 1) {
    whenPhrase = ` at ${whenTimes[0]}`;
  } else if (whenTimes.length > 1) {
    whenPhrase = ` at ${whenTimes.join(' or ')}`;
  }
  // Collect other directly connected blocks by type (excluding [when])
  const connected: Record<string, Set<string>> = {};
  if (block.linkedBlockIds && block.linkedBlockIds.length > 0) {
    for (const linkedId of block.linkedBlockIds) {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId);
      if (linkedBlock && linkedBlock.type !== 'when' && !visited.has(linkedBlock.id)) {
        if (!connected[linkedBlock.type]) connected[linkedBlock.type] = new Set();
        connected[linkedBlock.type].add(linkedBlock.content || '');
      }
    }
  }
  // Backward for other types
  for (const other of allBlocks) {
    if (other.type !== 'when' && other.linkedBlockIds && other.linkedBlockIds.includes(block.id) && other.content && !visited.has(other.id)) {
      if (!connected[other.type]) connected[other.type] = new Set();
      connected[other.type].add(other.content || '');
    }
  }
  // Append grouped connected content (deduplicated, excluding [when])
  for (const type of Object.keys(connected)) {
    for (const content of connected[type]) {
      if (content && content.trim().length > 0) {
        line += ` [${type}] ${content}`;
      }
    }
  }
  line += whenPhrase;
  return line;
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
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      throw new Error('Embedding failed or returned wrong dimension (expected 768).');
    }
    // For each entity, embed the combined content and search Qdrant
    for (const entity of entities) {
      if (!entity.combinedContent || entity.combinedContent.trim().length === 0) {
        console.warn('Skipping entity with empty combinedContent:', entity.entityId);
        continue;
      }
      const entityEmbedding = await getEmbedding(entity.combinedContent);
      if (!entityEmbedding || !Array.isArray(entityEmbedding) || entityEmbedding.length !== 768) {
        throw new Error('Entity embedding failed or returned wrong dimension (expected 768).');
      }
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
  // Log all block types included in the context
  const blockTypesInContext = dedupedResults.map(r => r.payload?.type).filter(Boolean);
  console.log('Block types in context:', blockTypesInContext);

  // --- NEW: Build LLM-friendly context using blockToFactLine ---
  const instructions = `Instructions:\n- Each line below is a fact, with the format depending on the type of information (Entity, Time, Place, Reason, Method, Media, Check, etc.).\n- Use these facts to answer the question.\n- Do not repeat identical facts or answers.\n- If you can infer a likely time, place, or connection, state your reasoning.\n`;

  // Use all deduped results' blockIds to build the context
  const factLines = dedupedResults
    .map(r => r.payload && r.payload.blockId
      ? blockToFactLine(allBlocks.find((b: Block) => b.id === r.payload.blockId) as Block, allBlocks)
      : `${r.payload?.type}: ${r.payload?.content || ''}`)
    .filter(Boolean);
  const context = `${instructions}\nFacts:\n${factLines.join('\n')}\n`;

  const prompt = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question. If the answer is not in the context, say "I don't know."\n\n${context}\nQuestion: ${query}\nAnswer:`;

  let answer = '';
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