import { NextRequest, NextResponse } from 'next/server';
import { chunkText } from '@/lib/brain/processors/chunk';
import { getEmbedding, upsertQdrantVector } from '@/lib/brain/processors/embed';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  const { content, note_id, folder_id, blocks } = await req.json();
  if ((!content && !blocks) || !note_id) {
    return NextResponse.json({ error: 'Missing content/blocks or note_id' }, { status: 400 });
  }

  // If blocks are provided, use semantic chunking
  if (blocks && Array.isArray(blocks)) {
    const processedBlockIds = new Set();
    // For each WHO block, concatenate its content with all connected WHAT blocks (legacy combined chunk)
    for (const block of blocks) {
      if (processedBlockIds.has(block.id)) continue; // Skip already processed blocks
      if (block.type === 'who') {
        let combined = block.content || '';
        let whatIds = [];
        let connectedWhats = [];
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
          connectedWhats = block.linkedBlockIds
            .map((id: string) => blocks.find((b: any) => b.id === id && b.type === 'what'))
            .filter(Boolean);
          for (const whatBlock of connectedWhats) {
            if (whatBlock && !processedBlockIds.has(whatBlock.id)) {
              combined += '\n' + (whatBlock.content || '');
              processedBlockIds.add(whatBlock.id); // Mark what block as processed
              whatIds.push(whatBlock.id);
            }
          }
        }
        // Chunk the combined content if needed (legacy combined chunk)
        const chunks = chunkText(combined);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await getEmbedding(chunk);
          await upsertQdrantVector({
            id: uuidv4(),
            embedding,
            payload: {
              note_id,
              folder_id,
              content: chunk, // Ensure content is always present
              position: i,
              type: 'who+what',
              whoId: block.id,
              whatIds: whatIds,
              // For legacy combined chunk, also include block type info
              blockId: block.id,
              linkedBlocks: connectedWhats.map((b: any) => ({ id: b.id, type: b.type })),
            },
          });
        }
        processedBlockIds.add(block.id); // Mark who block as processed
      }
    }
    // Index all blocks individually, with type, blockId, and linkedBlocks
    for (const block of blocks) {
      if (processedBlockIds.has(block.id)) continue; // Skip already processed blocks
      const chunks = chunkText(block.content || '');
      // Build linkedBlocks array if block has linkedBlockIds
      let linkedBlocks = [];
      if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
        linkedBlocks = block.linkedBlockIds
          .map((id: string) => {
            const linked = blocks.find((b: any) => b.id === id);
            return linked ? { id: linked.id, type: linked.type } : null;
          })
          .filter(Boolean);
      }
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await getEmbedding(chunk);
        await upsertQdrantVector({
          id: uuidv4(),
          embedding,
          payload: {
            note_id,
            folder_id,
            content: chunk, // Ensure content is always present
            position: i,
            type: block.type,
            blockId: block.id,
            ...(linkedBlocks.length > 0 ? { linkedBlocks } : {}),
          },
        });
      }
      processedBlockIds.add(block.id); // Mark as processed
    }
    return NextResponse.json({ success: true, blocks: blocks.length });
  }

  // Fallback: old behavior for plain content
  if (content) {
    const chunks = chunkText(content);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      await upsertQdrantVector({
        id: uuidv4(),
        embedding,
        payload: {
          note_id,
          folder_id,
          content: chunk,
          position: i,
        },
      });
    }
    return NextResponse.json({ success: true, chunks: chunks.length });
  }

  return NextResponse.json({ error: 'No content or blocks to embed.' }, { status: 400 });
} 