// OpenAI and Qdrant embedding/search utility (scaffold)
import axios from 'axios'; // Make sure to install axios: npm install axios @types/axios

// Embedding provider selection
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama'; // 'ollama' or 'openai'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Validate environment variables for Qdrant
const QDRANT_URL = process.env.QDRANT_URL;
if (!QDRANT_URL) {
  throw new Error('QDRANT_URL environment variable is not set.');
}

// Validate OpenAI env only if using OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (EMBEDDING_PROVIDER === 'openai' && !OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

/**
 * Get embedding for a given text using Ollama or OpenAI API.
 * @param text The input text to embed.
 * @param model The embedding model to use (Ollama: 'nomic-embed-text', OpenAI: 'text-embedding-3-small').
 * @param maxRetries Number of retry attempts for transient errors (default: 3).
 * @returns Promise<number[]> The embedding vector.
 */
export async function getEmbedding(
  text: string,
  model: string = EMBEDDING_PROVIDER === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small',
  maxRetries: number = 3
): Promise<number[]> {
  if (EMBEDDING_PROVIDER === 'ollama') {
    // OLLAMA: No strict length limit, but keep reasonable
    try {
      console.log(`[getEmbedding] Requesting embedding from Ollama (${model})...`);
      const response = await axios.post<{ embedding: number[] }>(`${OLLAMA_URL}/api/embeddings`, {
        model,
        prompt: text,
      });
      if (!response.data || !response.data.embedding) {
        throw new Error('No embedding returned from Ollama');
      }
      return response.data.embedding;
    } catch (error: any) {
      console.error('[getEmbedding] Ollama error:', error?.response?.data || error.message || error);
      throw new Error('Failed to fetch embedding from Ollama');
    }
  } else {
    // OpenAI's max input length for text-embedding-3-small is 8191 tokens (roughly 8191 characters for English)
    if (text.length > 8191) {
      throw new Error('Input text too long for embedding model (max 8191 characters).');
    }
    let attempt = 0;
    let lastError: any = null;
    while (attempt < maxRetries) {
      try {
        console.log(`[getEmbedding] Requesting embedding from OpenAI (attempt ${attempt + 1})...`);
        const response = await axios.post<{
          data: { embedding: number[] }[];
        }>(
          'https://api.openai.com/v1/embeddings',
          {
            input: text,
            model,
          },
          {
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const embedding = response.data.data[0]?.embedding;
        if (!embedding) {
          console.error('[getEmbedding] No embedding returned from OpenAI.', response.data);
          throw new Error('No embedding returned from OpenAI.');
        }
        return embedding;
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;
        // Retry on rate limit or server errors
        if (status === 429 || (status >= 500 && status < 600)) {
          const delay = Math.pow(2, attempt) * 500; // Exponential backoff: 0.5s, 1s, 2s
          console.warn(`[getEmbedding] Transient error (status ${status}), retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
          attempt++;
          continue;
        }
        console.error('[getEmbedding] Error fetching embedding:', error?.response?.data || error.message || error);
        throw new Error('Failed to fetch embedding from OpenAI.');
      }
    }
    console.error('[getEmbedding] Failed after retries:', lastError?.response?.data || lastError?.message || lastError);
    throw new Error('Failed to fetch embedding from OpenAI after retries.');
  }
}

export async function upsertQdrantVector({
  id,
  embedding,
  payload,
  collection = 'notes',
}: {
  id: string;
  embedding: number[];
  payload: any;
  collection?: string;
}) {
  try {
    const headers = QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : undefined;
    console.log(`[upsertQdrantVector] Upserting vector to Qdrant collection: ${collection}, id: ${id}`);
    console.log('[upsertQdrantVector] Qdrant endpoint:', `${QDRANT_URL}/collections/${collection}/points`);
    console.log('[upsertQdrantVector] Qdrant headers:', headers);
    await axios.put(`${QDRANT_URL}/collections/${collection}/points`, {
      points: [
        {
          id,
          vector: embedding,
          payload,
        },
      ],
    }, {
      headers
    });
    console.log('[upsertQdrantVector] Upsert successful.');
  } catch (error: any) {
    console.error('[upsertQdrantVector] Error upserting vector to Qdrant:', error?.response?.data || error.message || error);
    throw new Error('Failed to upsert vector to Qdrant.');
  }
}

export async function searchQdrant({
  queryEmbedding,
  filter,
  topK = 5,
  collection = 'notes',
}: {
  queryEmbedding: number[];
  filter?: any;
  topK?: number;
  collection?: string;
}) {
  try {
    const headers = QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : undefined;
    console.log(`[searchQdrant] Searching Qdrant collection: ${collection}, topK: ${topK}`);
    console.log('[searchQdrant] Qdrant endpoint:', `${QDRANT_URL}/collections/${collection}/points/search`);
    console.log('[searchQdrant] Qdrant headers:', headers);
    const response = await axios.post<{
      result: any[];
    }>(`${QDRANT_URL}/collections/${collection}/points/search`, {
      vector: queryEmbedding,
      filter,
      limit: topK,
      with_payload: true,
    }, {
      headers
    });
    console.log('[searchQdrant] Search successful. Results:', response.data.result?.length || 0);
    return response.data.result;
  } catch (error: any) {
    console.error('[searchQdrant] Error searching Qdrant:', error?.response?.data || error.message || error);
    throw new Error('Failed to search Qdrant.');
  }
} 