// This file is intended for use in the Electron main process (Node.js context)
import { getEmbedding, searchQdrant } from './brain/processors/embed';
import * as axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// Types for blocks and results (replace with your actual types if available)
type Block = {
  id: string;
  type: string;
  content?: string;
  linkedBlockIds?: string[];
};

type QdrantResult = {
  id: string;
  payload?: {
    content?: string;
    type?: string;
    blockId?: string;
  };
  score?: number; // <-- Add this line
};

interface RagPipelineArgs {
  note_id: string;
  query: string;
  topK?: number;
  allBlocks: Block[];
  folder_id?: string;
}

async function generateAlternativeQueries(question: string, numVariants = 3): Promise<string[]> {
  const prompt = `You are an AI language model assistant. Your task is to generate ${numVariants} different versions of the given user question to retrieve relevant documents from a vector database. By generating multiple perspectives on the user question, your goal is to help the user overcome some of the limitations of the distance-based similarity search. Provide these alternative questions separated by newlines.\nOriginal question: ${question}`;
  try {
    const ollamaRes = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-llm:7b',
      prompt
    });
    const data = ollamaRes.data as any;
    if (data.response) {
      return data.response.split('\n').map((q: string) => q.trim()).filter((q: string) => Boolean(q));
    }
  } catch (err) {
    console.error('Failed to generate alternative queries:', err);
  }
  return [question];
}

function blockToFactLine(block: Block | undefined, allBlocks: Block[]): string {
  if (!block) return '';
  switch (block.type) {
    case 'who':
    case 'what':
      return `Entity: ${block.content || 'Unknown'} | Description/Action/Definition: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map((id: string) => {
            const linked = allBlocks.find((b: Block) => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
    case 'when':
      return `Time: ${block.content || 'Unknown'} | Event: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map((id: string) => {
            const linked = allBlocks.find((b: Block) => b.id === id);
            return linked && linked.content ? linked.content : '';
          }).filter(Boolean).join('; ')
          : '');
    case 'where':
      return `Place: ${block.content || 'Unknown'} | Event: ` +
        (block.linkedBlockIds && block.linkedBlockIds.length > 0
          ? block.linkedBlockIds.map((id: string) => {
            const linked = allBlocks.find((b: Block) => b.id === id);
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

function logToFile(message: any) {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  const logPath = path.join(logDir, 'rag-debug.txt');
  const timestamp = new Date().toISOString();
  let msg;
  if (typeof message === 'string') {
    msg = message;
  } else if (typeof message === 'object') {
    try {
      msg = JSON.stringify(message, null, 2);
    } catch {
      msg = String(message);
    }
  } else {
    msg = String(message);
  }
  fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`, 'utf-8');
}

export async function runRagPipeline({ note_id, query, topK = 10, allBlocks, folder_id }: RagPipelineArgs): Promise<{ results: QdrantResult[]; answer: string; facts: any[] }> {
  // logToFile('[RAG DEBUG] runRagPipeline received allBlocks:');
  if (allBlocks && allBlocks.length > 0) {
    // logToFile('[RAG DEBUG] allBlocks IDs and types:');
  }
  const startTotal = Date.now();
  // Detect if the question is a summary request
  const isSummaryRequest = /summari[sz]e|overview|all note data|entire note|main points/i.test(query);

  // 1. Generate alternative queries
  const t0 = Date.now();
  const altQueries = await generateAlternativeQueries(query, 3);
  const t1 = Date.now();
  // logToFile(`[TIMING] generateAlternativeQueries: ${t1 - t0}ms`);

  // 2. Retrieve results using pre-stored embeddings in Qdrant
  let allResults: QdrantResult[] = [];
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
    const results: QdrantResult[] = await searchQdrant({ queryEmbedding, filter, topK: 10 });
    qdrantTime += Date.now() - tQdrantStart;
    allResults = allResults.concat(results);
  }
  const t2 = Date.now();
  // logToFile(`[TIMING] Query embedding total: ${embeddingTime}ms`);
  // logToFile(`[TIMING] Qdrant search total: ${qdrantTime}ms`);
  // logToFile(`[TIMING] Retrieval loop: ${t2 - t1}ms`);
  // Log allResults before deduplication
  console.log('[RAG DEBUG] allResults length:', allResults.length);
  console.log('[RAG DEBUG] allResults:', allResults.map(r => ({ id: r.id, content: r.payload?.content, blockId: r.payload?.blockId, score: r.score })));

  // 3. Fallback: If no results found, attempt to embed the note and retry
  if (allResults.length === 0 && allBlocks.length > 0) {
    // logToFile(`[RAG] No results found for note ${note_id}, attempting to embed note...`);
    // You may need to implement embedAndStoreNote for Electron/Node context
    // For now, just log and skip
    // await embedAndStoreNote(note_id, folder_id, allBlocks);
    // Retry logic can be added here if embedding is implemented
  }

  // 4. Deduplicate results by id only (less aggressive)
  const seen = new Set<string>();
  const dedupedResults = allResults.filter((r: QdrantResult) => {
    const key = r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const t3 = Date.now();
  // logToFile(`[TIMING] Deduplication: ${t3 - t2}ms`);
  // Log dedupedResults after deduplication
  // logToFile('[RAG DEBUG] dedupedResults length:');
  // logToFile('[RAG DEBUG] dedupedResults:');

  // Warn if payload.content is empty or repeated
  const contentSet = new Set<string>();
  let emptyContentCount = 0;
  let repeatedContentCount = 0;
  for (const r of dedupedResults) {
    if (!r.payload?.content) emptyContentCount++;
    if (r.payload?.content && contentSet.has(r.payload.content)) repeatedContentCount++;
    if (r.payload?.content) contentSet.add(r.payload.content);
  }
  if (emptyContentCount > 0) {
    // logToFile(`[RAG WARNING] ${emptyContentCount} deduped results have empty payload.content. Check your embedding/chunking pipeline!`);
  }
  if (repeatedContentCount > 0) {
    // logToFile(`[RAG WARNING] ${repeatedContentCount} deduped results have repeated payload.content. Check your embedding/chunking pipeline!`);
  }

  // 5. Log deduped results and block types
  // logToFile('Deduped results:');
  const blockTypesInContext = dedupedResults.map(r => r.payload?.type).filter(Boolean);
  // logToFile('Block types in context:');

  // Optimize for speed
  const SPEED_TOP_K = 10;
  const SPEED_MAX_CONTEXT_CHARS = 16000;
  // Only use the top 30 results by score
  const sortedResults = allResults.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, SPEED_TOP_K);

  const instructions = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question.\nIf the answer is not in the context, say \"I don't know.\"\nDo NOT show your reasoning, thoughts, explanations, or process—output ONLY the final answer.\nIf the question asks for a summary, provide a concise summary as a bullet list.\nOtherwise, answer the question as directly as possible using the facts below.\nDo NOT include any text like <think>, \"Step\", \"Let me think\", or similar. Output ONLY the answer.\nUnder NO circumstances should you output your reasoning, thoughts, process, or any meta-commentary. Your answer must be ONLY the final answer or summary, with no preamble, no steps, and no explanations.`;
  const MAX_CONTEXT_CHARS = SPEED_MAX_CONTEXT_CHARS;
  let contextFacts: string[] = [];
  let currentLength = 0;
  let truncated = false;
  const factSet = new Set<string>();
  for (const r of sortedResults) {
    const fact = r.payload && r.payload.blockId
      ? blockToFactLine(allBlocks.find((b: Block) => b.id === r.payload!.blockId), allBlocks)
      : `${r.payload?.type}: ${r.payload?.content || ''}`;
    if (!fact || factSet.has(fact)) continue; // Skip duplicates
    if (currentLength + fact.length > MAX_CONTEXT_CHARS) {
      truncated = true;
      break;
    }
    contextFacts.push(fact);
    factSet.add(fact);
    currentLength += fact.length + 1;
    console.log('[RAG DEBUG] Added fact to contextFacts:', fact);
  }
  if (truncated) {
    console.warn(`[RAG] Context truncated to ${MAX_CONTEXT_CHARS} characters. Some facts omitted.`);
  }
  console.log(`[RAG] Number of facts included in LLM context: ${contextFacts.length}`);
  console.log('[RAG] Facts included in LLM context:', contextFacts);
  // 7. Collect fact details for debugging/logging/return
  const factDetails = contextFacts.map((fact, idx) => ({
    fact,
    score: dedupedResults[idx]?.score ?? null,
    blockId: dedupedResults[idx]?.payload?.blockId ?? null,
    content: dedupedResults[idx]?.payload?.content ?? null,
  }));
  // logToFile('Facts and Qdrant scores used in context:');
  factDetails.forEach((f, i) => {
    // logToFile(`#${i + 1}: Score=${f.score}, BlockId=${f.blockId}, Content=${f.content}`);
  });
  const context = `${instructions}\nFacts:\n${contextFacts.join('\n')}\n`;
  const prompt = `${context}\nQuestion: ${query}\nAnswer:`;

  // 8. LLM call with timing
  let answer = '';
  if (context) {
    const url = new URL('http://localhost:11434/api/generate');
    const isHttps = url.protocol === 'https:';
    const reqModule = isHttps ? https : http;
    const postData = JSON.stringify({ model: 'deepseek-llm:7b', prompt });
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
    const tLLMStart = Date.now();
    answer = await new Promise((resolve, reject) => {
      let answerStr = '';
      const req = reqModule.request(options, (res2: any) => {
        let buffer = '';
        res2.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) answerStr += data.response;
              if (data.done) {
                // Log the raw LLM output for debugging
                // logToFile('[LLM RAW OUTPUT]');
                resolve(answerStr.trim() || 'No answer generated by model.');
                return;
              }
            } catch (e) { }
          }
        });
        res2.on('end', () => {
          // Log the raw LLM output for debugging
          // logToFile('[LLM RAW OUTPUT]');
          resolve(answerStr.trim() || 'No answer generated by model.');
        });
      });
      req.on('error', (err: any) => reject('Failed to generate answer.'));
      req.write(postData);
      req.end();
    });
    // logToFile(`[TIMING] LLM call: ${Date.now() - tLLMStart}ms`);
  } else {
    answer = 'No relevant content found to answer the question.';
  }
  // logToFile(`[TIMING] Total pipeline time: ${Date.now() - startTotal}ms`);
  return { results: dedupedResults, answer, facts: factDetails };
} 