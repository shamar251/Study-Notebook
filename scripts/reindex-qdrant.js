// scripts/reindex-qdrant.js

(async () => {
  const { initializeDatabase, db } = await import('../lib/db.js').catch(() => require('../lib/db'));
  const { getEmbedding, upsertQdrantVector } = await import('../lib/brain/processors/embed.js').catch(() => require('../lib/brain/processors/embed'));
  const { v4: uuidv4 } = await import('uuid').catch(() => require('uuid'));
  const { chunkText } = await import('../lib/brain/processors/chunk.js').catch(() => require('../lib/brain/processors/chunk'));

  async function reindexAllNotes() {
    await initializeDatabase();
    const notes = await db.notes.toArray();
    const report = [];
    for (const note of notes) {
      const blocks = note.blocks || [];
      const processedBlockIds = new Set();
      let allChunks = [];
      let noteChunkReport = { noteId: note.id, noteTitle: note.title, chunks: [] };
      for (const block of blocks) {
        if (processedBlockIds.has(block.id)) continue;
        if (block.type === 'who') {
          let combined = block.content || '';
          let whatIds = [];
          if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
            const connectedWhats = block.linkedBlockIds
              .map((id) => blocks.find((b) => b.id === id && b.type === 'what'))
              .filter(Boolean);
            for (const whatBlock of connectedWhats) {
              if (whatBlock && !processedBlockIds.has(whatBlock.id)) {
                combined += '\n' + (whatBlock.content || '');
                processedBlockIds.add(whatBlock.id);
                whatIds.push(whatBlock.id);
              }
            }
          }
          const chunks = chunkText(combined);
          allChunks = allChunks.concat(chunks);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            noteChunkReport.chunks.push({ blockId: block.id, blockType: 'who+what', position: i, content: chunk });
            const embedding = await getEmbedding(chunk);
            await upsertQdrantVector({
              id: uuidv4(),
              embedding,
              payload: {
                note_id: note.id,
                folder_id: note.folderId,
                content: chunk,
                position: i,
                type: 'who+what',
                whoId: block.id,
                whatIds: whatIds,
              },
            });
          }
          processedBlockIds.add(block.id);
        } else {
          const chunks = chunkText(block.content || '');
          allChunks = allChunks.concat(chunks);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            noteChunkReport.chunks.push({ blockId: block.id, blockType: block.type, position: i, content: chunk });
            const embedding = await getEmbedding(chunk);
            await upsertQdrantVector({
              id: uuidv4(),
              embedding,
              payload: {
                note_id: note.id,
                folder_id: note.folderId,
                content: chunk,
                position: i,
                type: block.type,
                blockId: block.id,
              },
            });
          }
          processedBlockIds.add(block.id);
        }
      }
      report.push(noteChunkReport);
      console.log(`[QDRANT DEBUG] Total unique chunks for note ${note.title} (${note.id}):`, new Set(allChunks).size);
      console.log(`Re-indexed note: ${note.title} (${note.id})`);
    }
    const fs = await import('fs').catch(() => require('fs'));
    fs.writeFileSync('qdrant-chunk-report.json', JSON.stringify(report, null, 2), 'utf-8');
    console.log('Wrote qdrant-chunk-report.json');
    console.log('Re-indexing complete.');
  }

  reindexAllNotes().catch(err => {
    console.error('Error during re-indexing:', err);
    process.exit(1);
  });
})(); 