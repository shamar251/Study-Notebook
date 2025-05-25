import Dexie, { Table } from 'dexie';

export interface Note {
  id: string;
  title: string;
  blocks: Block[];
  tags: string[];
  folderId: string;
  updatedAt: number;
  lastStudied?: number;
  order: number;
  studyStats?: {
    quizAttempts: number;
    quizCorrect: number;
    flashcardReviews: number;
  };
}

export interface Block {
  id: string;
  type: "who" | "what" | "note" | "image" | "video" | "code";
  content: string;
  linkedBlockIds?: string[];
  language?: string;
  image?: string;
  math?: boolean;
  truthState?: "true" | "false";
  originalContent?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  description?: string;
  createdAt: number;
  order: number;
  path: string[];
}

export interface Operation {
  id?: number;
  type: 'move' | 'reorder';
  timestamp: number;
  data: {
    itemId: string;
    itemType: 'folder' | 'note';
    oldParentId: string | null;
    newParentId: string | null;
    oldOrder: number;
    newOrder: number;
  };
}

export class StudyNotebookDB extends Dexie {
  notes!: Table<Note>;
  folders!: Table<Folder>;
  operations!: Table<Operation>;

  constructor() {
    super('StudyNotebookDB');

    this.version(1).stores({
      notes: 'id, title, folderId, updatedAt, lastStudied, tags',
      folders: 'id, name, parentId'
    });

    this.version(2).stores({
      notes: 'id, title, folderId, updatedAt, lastStudied, tags',
      folders: 'id, name, parentId, description'
    });

    this.version(3).stores({
      notes: 'id, title, folderId, updatedAt, lastStudied, tags',
      folders: 'id, name, parentId, description, createdAt'
    });

    this.version(4).stores({
      notes: 'id, title, folderId, updatedAt, lastStudied, tags, order',
      folders: 'id, name, parentId, description, createdAt, order, path',
      operations: '++id, type, timestamp, data'
    });
  }

  async undoLastOperation(): Promise<boolean> {
    const lastOperation = await this.operations.orderBy('timestamp').reverse().first();
    if (!lastOperation) return false;

    const { data } = lastOperation;

    if (lastOperation.type === 'move') {
      if (data.itemType === 'folder') {
        const folder = await this.folders.get(data.itemId);
        if (folder) {
          await this.folders.put({
            ...folder,
            parentId: data.oldParentId,
            order: data.oldOrder
          });
          await updateFolderPath(data.itemId, data.oldParentId);
        }
      } else {
        const note = await this.notes.get(data.itemId);
        if (note) {
          await this.notes.put({
            ...note,
            folderId: data.oldParentId || 'root',
            order: data.oldOrder
          });
        }
      }
    }

    await this.operations.delete(lastOperation.id!);
    return true;
  }
}

export const db = new StudyNotebookDB();

// Initialize database with root folder if empty
export async function initializeDatabase() {
  const folderCount = await db.folders.count();

  if (folderCount === 0) {
    const firstFolder: Folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "My Notes",
      parentId: null,
      createdAt: Date.now(),
      order: 0,
      path: []
    };
    await db.folders.add(firstFolder);
  }
}

// Helper functions for folder operations
export async function getFolderPath(folderId: string): Promise<string[]> {
  const path: string[] = [folderId];
  let currentFolder = await db.folders.get(folderId);

  while (currentFolder?.parentId) {
    path.unshift(currentFolder.parentId);
    currentFolder = await db.folders.get(currentFolder.parentId);
  }

  return path;
}

export async function updateFolderPath(folderId: string, newParentId: string | null): Promise<void> {
  const folder = await db.folders.get(folderId);
  if (!folder) return;

  const newPath = newParentId ? [...(await getFolderPath(newParentId)), folderId] : [folderId];

  // Update the folder's path
  await db.folders.put({ ...folder, path: newPath });

  // Update paths for all child folders
  const childFolders = await db.folders.where('parentId').equals(folderId).toArray();
  for (const child of childFolders) {
    await updateFolderPath(child.id, folderId);
  }
}

export async function getNextOrder(parentId: string | null, itemType: 'folder' | 'note'): Promise<number> {
  if (itemType === 'folder') {
    const folders = await db.folders
      .where('parentId')
      .equals(parentId || '')
      .toArray();
    return folders.length;
  } else {
    const notes = await db.notes
      .where('folderId')
      .equals(parentId || 'root')
      .toArray();
    return notes.length;
  }
}

export async function reorderItems(
  parentId: string | null,
  itemType: 'folder' | 'note',
  itemId: string,
  newOrder: number
): Promise<void> {
  if (itemType === 'folder') {
    const folders = await db.folders
      .where('parentId')
      .equals(parentId || 'root')
      .toArray();

    const itemIndex = folders.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;

    const folder = folders[itemIndex];
    const oldOrder = folder.order;

    // Update the moved folder's order
    await db.folders.put({ ...folder, order: newOrder });

    // Update orders of affected folders
    if (oldOrder < newOrder) {
      // Moving down: decrease order of folders in between
      for (let i = itemIndex + 1; i < folders.length; i++) {
        if (folders[i].order <= newOrder) {
          await db.folders.put({ ...folders[i], order: folders[i].order - 1 });
        }
      }
    } else {
      // Moving up: increase order of folders in between
      for (let i = itemIndex - 1; i >= 0; i--) {
        if (folders[i].order >= newOrder) {
          await db.folders.put({ ...folders[i], order: folders[i].order + 1 });
        }
      }
    }
  } else {
    const notes = await db.notes
      .where('folderId')
      .equals(parentId || 'root')
      .toArray();

    const itemIndex = notes.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;

    const note = notes[itemIndex];
    const oldOrder = note.order;

    // Update the moved note's order
    await db.notes.put({ ...note, order: newOrder });

    // Update orders of affected notes
    if (oldOrder < newOrder) {
      // Moving down: decrease order of notes in between
      for (let i = itemIndex + 1; i < notes.length; i++) {
        if (notes[i].order <= newOrder) {
          await db.notes.put({ ...notes[i], order: notes[i].order - 1 });
        }
      }
    } else {
      // Moving up: increase order of notes in between
      for (let i = itemIndex - 1; i >= 0; i--) {
        if (notes[i].order >= newOrder) {
          await db.notes.put({ ...notes[i], order: notes[i].order + 1 });
        }
      }
    }
  }
}

export async function recordOperation(operation: Omit<Operation, 'id'>): Promise<void> {
  await db.operations.add(operation);
}
