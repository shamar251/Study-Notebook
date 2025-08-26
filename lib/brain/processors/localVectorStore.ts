import * as fs from 'fs';
import * as path from 'path';

export interface LocalVectorPoint {
  id: string;
  vector: number[];
  payload: any;
}

function ensureBaseDir(): string {
  const baseDir = path.join(process.cwd(), 'data', 'vectors');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

function getFilePathForNote(noteId: string, collection: string = 'notes'): string {
  const baseDir = ensureBaseDir();
  const safeNoteId = noteId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(baseDir, `${collection}-${safeNoteId}.json`);
}

function readPoints(filePath: string): LocalVectorPoint[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LocalVectorPoint[];
    return [];
  } catch {
    return [];
  }
}

function writePoints(filePath: string, points: LocalVectorPoint[]): void {
  fs.writeFileSync(filePath, JSON.stringify(points, null, 2), 'utf-8');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1e-12;
  return dot / denom;
}

export function upsertLocalVector(point: LocalVectorPoint, collection: string = 'notes'): void {
  const noteId: string | undefined = point?.payload?.note_id;
  if (!noteId) {
    throw new Error('upsertLocalVector requires payload.note_id');
  }
  const filePath = getFilePathForNote(noteId, collection);
  const points = readPoints(filePath);
  const index = points.findIndex(p => p.id === point.id);
  if (index >= 0) {
    points[index] = point;
  } else {
    points.push(point);
  }
  writePoints(filePath, points);
}

export function searchLocalVectors(queryEmbedding: number[], {
  filter,
  topK = 20,
  collection = 'notes'
}: { filter?: any; topK?: number; collection?: string; }): Array<{ id: string; payload?: any; score: number; }> {
  let noteId: string | undefined;
  // Basic filter parser for { must: [{ key: 'note_id', match: { value: note_id } }] }
  if (filter && Array.isArray(filter.must)) {
    for (const clause of filter.must) {
      if (clause?.key === 'note_id') {
        noteId = clause?.match?.value;
        break;
      }
    }
  }
  if (!noteId) {
    // If no filter provided, search across all notes/files
    const baseDir = ensureBaseDir();
    const files = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];
    const allPoints: LocalVectorPoint[] = [];
    for (const file of files) {
      if (!file.startsWith(`${collection}-`) || !file.endsWith('.json')) continue;
      const filePath = path.join(baseDir, file);
      allPoints.push(...readPoints(filePath));
    }
    const scored = allPoints.map(p => ({ id: p.id, payload: p.payload, score: cosineSimilarity(queryEmbedding, p.vector) }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
  const filePath = getFilePathForNote(noteId, collection);
  const points = readPoints(filePath);
  const scored = points.map(p => ({ id: p.id, payload: p.payload, score: cosineSimilarity(queryEmbedding, p.vector) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}


