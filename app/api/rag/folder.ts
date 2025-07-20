import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, searchQdrant } from '@/lib/brain/processors/embed';

export async function POST(req: NextRequest) {
  const { folder_id, query, topK = 8 } = await req.json();
  if (!folder_id || !query) {
    return NextResponse.json({ error: 'Missing folder_id or query' }, { status: 400 });
  }
  const queryEmbedding = await getEmbedding(query);
  const filter = { must: [{ key: 'folder_id', match: { value: folder_id } }] };
  const results = await searchQdrant({ queryEmbedding, filter, topK });
  return NextResponse.json({ results });
} 