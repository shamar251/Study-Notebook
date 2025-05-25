import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, Folder } from '@/lib/db';

export function useNotes() {
  const notes = useLiveQuery(() => db.notes.toArray());
  return notes || [];
}

export function useFolders() {
  const folders = useLiveQuery(() => db.folders.toArray());
  return folders || [];
}

export function useNote(id: string) {
  return useLiveQuery(() => db.notes.get(id));
}

export function useFolder(id: string) {
  return useLiveQuery(() => db.folders.get(id));
}

export async function addNote(note: Note) {
  return await db.notes.add(note);
}

export async function updateNote(note: Note) {
  return await db.notes.put(note);
}

export async function deleteNote(id: string) {
  return await db.notes.delete(id);
}

export async function addFolder(folder: Folder) {
  return await db.folders.add(folder);
}

export async function updateFolder(folder: Folder) {
  return await db.folders.put(folder);
}

export async function deleteFolder(id: string) {
  return await db.folders.delete(id);
}

export async function getNotesByFolder(folderId: string) {
  return await db.notes.where('folderId').equals(folderId).toArray();
}

export async function getNotesByTag(tag: string) {
  return await db.notes.filter(note => note.tags.includes(tag)).toArray();
}

export async function searchNotes(query: string) {
  const notes = await db.notes.toArray();
  return notes.filter(note =>
    note.title.toLowerCase().includes(query.toLowerCase()) ||
    note.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())) ||
    note.blocks.some(block => block.content.toLowerCase().includes(query.toLowerCase()))
  );
}

export async function getChildFolders(parentId: string) {
  return await db.folders.where('parentId').equals(parentId).toArray();
}

export async function getAllChildFolderIds(parentId: string): Promise<string[]> {
  // Get all folders from the database at once to avoid multiple queries
  const allFolders = await db.folders.toArray();

  // Use an iterative approach instead of recursion
  const result: string[] = [];
  const queue: string[] = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    // Find all direct children of the current folder
    const children = allFolders.filter(folder => folder.parentId === currentId);

    for (const child of children) {
      result.push(child.id);
      queue.push(child.id); // Add to queue to process its children
    }
  }

  return result;
}
