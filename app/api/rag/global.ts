import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, searchQdrant } from '@/lib/brain/processors/embed';

export async function POST(req: NextRequest) {
  const startTotal = Date.now();
  const { query, topK = 10 } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }
  const t0 = Date.now();
  const queryEmbedding = await getEmbedding(query);
  const t1 = Date.now();
  console.log(`[TIMING] Embedding: ${t1 - t0}ms`);
  const results = await searchQdrant({ queryEmbedding, topK });
  const t2 = Date.now();
  console.log(`[TIMING] Qdrant search: ${t2 - t1}ms`);
  console.log(`[TIMING] Total endpoint time: ${Date.now() - startTotal}ms`);
  return NextResponse.json({ results });
} 