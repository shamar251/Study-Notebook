// Chunking utility for notes/folders
export function chunkText(text: string, chunkSize: number = 300, overlap: number = 50): string[] {
  // Simple sliding window chunking
  const words = text.split(' ');
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
} 