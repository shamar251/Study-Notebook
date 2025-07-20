import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, searchQdrant } from '@/lib/brain/processors/embed';

export async function POST(req: NextRequest) {
  const { query, topK = 10 } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }
  const queryEmbedding = await getEmbedding(query);
  const results = await searchQdrant({ queryEmbedding, topK });
  return NextResponse.json({ results });
} 