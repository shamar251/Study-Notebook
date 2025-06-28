import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, Folder } from '@/lib/db';
import { useMemo, useCallback } from 'react';

// Cache for frequently accessed data
const noteCache = new Map<string, Note>();
const folderCache = new Map<string, Folder>();

export function useNotes() {
  const notes = useLiveQuery(() => db.notes.toArray());

  // Update cache when notes change
  useMemo(() => {
    if (notes) {
      noteCache.clear();
      notes.forEach(note => noteCache.set(note.id, note));
    }
  }, [notes]);

  return notes || [];
}

export function useFolders() {
  const folders = useLiveQuery(() => db.folders.toArray());

  // Update cache when folders change
  useMemo(() => {
    if (folders) {
      folderCache.clear();
      folders.forEach(folder => folderCache.set(folder.id, folder));
    }
  }, [folders]);

  return folders || [];
}

export function useNote(id: string) {
  // Check cache first for better performance
  const cachedNote = noteCache.get(id);

  const note = useLiveQuery(() => db.notes.get(id));

  // Update cache when note changes
  useMemo(() => {
    if (note) {
      noteCache.set(id, note);
    }
  }, [note, id]);

  return note || cachedNote;
}

export function useFolder(id: string) {
  // Check cache first for better performance
  const cachedFolder = folderCache.get(id);

  const folder = useLiveQuery(() => db.folders.get(id));

  // Update cache when folder changes
  useMemo(() => {
    if (folder) {
      folderCache.set(id, folder);
    }
  }, [folder, id]);

  return folder || cachedFolder;
}

// Optimized note operations with cache updates
export async function addNote(note: Note) {
  const result = await db.notes.add(note);
  noteCache.set(note.id, note);
  return result;
}

export async function updateNote(note: Note) {
  const result = await db.notes.put(note);
  noteCache.set(note.id, note);
  return result;
}

export async function deleteNote(id: string) {
  const result = await db.notes.delete(id);
  noteCache.delete(id);
  return result;
}

// Optimized folder operations with cache updates
export async function addFolder(folder: Folder) {
  const result = await db.folders.add(folder);
  folderCache.set(folder.id, folder);
  return result;
}

export async function updateFolder(folder: Folder) {
  const result = await db.folders.put(folder);
  folderCache.set(folder.id, folder);
  return result;
}

export async function deleteFolder(id: string) {
  const result = await db.folders.delete(id);
  folderCache.delete(id);
  return result;
}

// Optimized query functions with better indexing
export async function getNotesByFolder(folderId: string) {
  return await db.notes.where('folderId').equals(folderId).toArray();
}

export async function getNotesByTag(tag: string) {
  // Use more efficient filtering
  const notes = await db.notes.toArray();
  return notes.filter(note =>
    note.tags && note.tags.includes(tag)
  );
}

// Optimized search with early termination
export async function searchNotes(query: string) {
  if (!query.trim()) return [];

  const notes = await db.notes.toArray();
  const lowerQuery = query.toLowerCase();

  return notes.filter(note => {
    // Check title first (most common search target)
    if (note.title.toLowerCase().includes(lowerQuery)) return true;

    // Check tags
    if (note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) return true;

    // Check block content (most expensive, do last)
    return note.blocks && note.blocks.some(block =>
      block.content && block.content.toLowerCase().includes(lowerQuery)
    );
  });
}

export async function getChildFolders(parentId: string) {
  return await db.folders.where('parentId').equals(parentId).toArray();
}

// Optimized recursive folder traversal with memoization
const folderHierarchyCache = new Map<string, string[]>();

export async function getAllChildFolderIds(parentId: string): Promise<string[]> {
  // Check cache first
  const cached = folderHierarchyCache.get(parentId);
  if (cached) return cached;

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

  // Cache the result
  folderHierarchyCache.set(parentId, result);

  return result;
}

// Clear cache when needed
export function clearCache() {
  noteCache.clear();
  folderCache.clear();
  folderHierarchyCache.clear();
}
