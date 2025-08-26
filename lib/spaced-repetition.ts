import { db, type Note, type Block, type Folder, type StudyItem, type ReviewSession } from '@/lib/db';
import { Rating } from 'ts-fsrs';

export interface StudyItemWithBlock extends StudyItem {
  block: Block;
  note: Note;
}

export interface ReviewResult {
  studyItem: StudyItem;
  nextReview: Date;
  ease: number;
  interval: number;
  streak: number;
}

export class SpacedRepetitionService {
  /**
   * Check if database schema is properly defined for version 7
   */
  static checkDatabaseSchema(): boolean {
    // Version 7 only needs notes and folders tables
    const hasNotes = db.notes && typeof db.notes.get === 'function';
    const hasFolders = db.folders && typeof db.folders.get === 'function';

    if (!hasNotes || !hasFolders) {
      console.error('Database schema check failed:');
      console.error('- notes table:', hasNotes ? 'OK' : 'MISSING');
      console.error('- folders table:', hasFolders ? 'OK' : 'MISSING');
      console.error('- Current database version:', db.verno);
      console.error('- Working with version 7');
      return false;
    }

    return true;
  }

  /**
   * Simple method to ensure database is ready
   */
  static async ensureDatabaseReady(): Promise<void> {
    if (!db.isOpen()) {
      await db.open();
    }

    // Wait a moment for database to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if basic database structure is accessible
    if (!this.checkDatabaseSchema()) {
      console.error('Basic database structure not accessible');
      throw new Error('Database is not properly initialized');
    }

    console.log('Database is ready and accessible (version 7)');
  }

  /**
   * Manually initialize database (for debugging)
   */
  static async initializeDatabase(): Promise<boolean> {
    try {
      console.log('Manually initializing database...');
      await this.ensureDatabaseReady();

      if (this.checkDatabaseSchema()) {
        console.log('Database initialized successfully');
        return true;
      } else {
        console.error('Database initialization failed');
        return false;
      }
    } catch (error) {
      console.error('Database initialization error:', error);
      return false;
    }
  }

  /**
   * Create study items from blocks in a note
   */
  static async createStudyItemsFromBlocks(blocks: Block[], note: Note): Promise<StudyItem[]> {
    try {
      console.log('🔄 createStudyItemsFromBlocks called - Version 7 compatible mode');
      await this.ensureDatabaseReady();

      const studyItems: StudyItem[] = [];

      for (const block of blocks) {
        if (block.type === 'who' || block.type === 'what') {
          const studyItem: StudyItem = {
            id: `study-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            blockId: block.id,
            noteId: note.id,
            folderId: note.folderId,
            type: block.type,
            nextReview: Date.now() + (24 * 60 * 60 * 1000), // Review tomorrow (24 hours from now)
            suspended: false,
          };

          studyItems.push(studyItem);
        }
      }

      // Store study data within the note's studyStats (version 7 compatible)
      if (studyItems.length > 0) {
        const updatedNote = {
          ...note,
          studyStats: {
            quizAttempts: note.studyStats?.quizAttempts || 0,
            quizCorrect: note.studyStats?.quizCorrect || 0,
            flashcardReviews: note.studyStats?.flashcardReviews || 0,
            studyItems: studyItems,
            lastStudied: Date.now()
          }
        };

        await db.notes.put(updatedNote);
        console.log(`Added ${studyItems.length} study items to note: ${note.title}`);
      }

      return studyItems;
    } catch (error) {
      console.error('Error creating study items:', error);
      return [];
    }
  }

  /**
   * Get due study items for review
   */
  static async getDueStudyItems(folderId?: string): Promise<StudyItemWithBlock[]> {
    try {
      await this.ensureDatabaseReady();

      const now = Date.now();
      let notes: Note[];

      if (folderId) {
        notes = await db.notes.where('folderId').equals(folderId).toArray();
      } else {
        notes = await db.notes.toArray();
      }

      const studyItemsWithBlocks: StudyItemWithBlock[] = [];

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          for (const studyItem of note.studyStats.studyItems) {
            if (!studyItem.suspended && (studyItem.nextReview || 0) <= now) {
              const block = note.blocks.find(b => b.id === studyItem.blockId);
              if (block) {
                studyItemsWithBlocks.push({
                  ...studyItem,
                  block,
                  note
                });
              }
            }
          }
        }
      }

      return studyItemsWithBlocks.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    } catch (error) {
      console.error('Error getting due study items:', error);
      return [];
    }
  }

  /**
   * Get study statistics for a folder or all items
   */
  static async getStudyStats(folderId?: string) {
    try {
      await this.ensureDatabaseReady();

      let notes: Note[];
      if (folderId) {
        notes = await db.notes.where('folderId').equals(folderId).toArray();
      } else {
        notes = await db.notes.toArray();
      }

      let total = 0;
      let suspended = 0;
      let due = 0;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          for (const studyItem of note.studyStats.studyItems) {
            total++;
            if (studyItem.suspended) {
              suspended++;
            } else if ((studyItem.nextReview || 0) <= Date.now()) {
              due++;
            }
          }
        }
      }

      return {
        total,
        suspended,
        due,
        mature: 0,
        totalReviews: 0,
        totalCorrect: 0,
        accuracy: 0
      };
    } catch (error) {
      console.error('Error getting study stats:', error);
      return {
        total: 0,
        suspended: 0,
        due: 0,
        mature: 0,
        totalReviews: 0,
        totalCorrect: 0,
        accuracy: 0
      };
    }
  }

  /**
   * Review a study item and update its next review time
   */
  static async reviewStudyItem(studyItemId: string, rating: Rating): Promise<ReviewResult> {
    try {
      await this.ensureDatabaseReady();

      // Find the note containing this study item
      const notes = await db.notes.toArray();
      let foundNote: Note | null = null;
      let foundStudyItem: StudyItem | null = null;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          const studyItem = note.studyStats.studyItems.find(item => item.id === studyItemId);
          if (studyItem) {
            foundNote = note;
            foundStudyItem = studyItem;
            break;
          }
        }
      }

      if (!foundNote || !foundStudyItem) {
        throw new Error('Study item not found');
      }

      // Calculate next review based on rating
      let newInterval = 1; // Default to 1 day

      switch (rating) {
        case Rating.Again:
          newInterval = 0; // Review again tomorrow
          break;
        case Rating.Hard:
          newInterval = 1; // Review in 1 day
          break;
        case Rating.Good:
          newInterval = 3; // Review in 3 days
          break;
        case Rating.Easy:
          newInterval = 7; // Review in 1 week
          break;
        default:
          newInterval = 3; // Default to 3 days
          break;
      }

      // Calculate next review time
      const nextReviewTime = Date.now() + (newInterval * 24 * 60 * 60 * 1000);

      // Update the study item with new next review time
      const updatedStudyItem = { ...foundStudyItem, nextReview: nextReviewTime };

      // Update the note's studyStats
      const updatedStudyItems = foundNote.studyStats!.studyItems!.map(item =>
        item.id === studyItemId ? updatedStudyItem : item
      );

      const updatedNote = {
        ...foundNote,
        studyStats: {
          ...foundNote.studyStats!,
          studyItems: updatedStudyItems,
          lastStudied: Date.now()
        }
      };

      await db.notes.put(updatedNote);

      return {
        studyItem: updatedStudyItem,
        nextReview: new Date(nextReviewTime),
        ease: 2.5,
        interval: newInterval,
        streak: 1
      };
    } catch (error) {
      console.error('Error reviewing study item:', error);
      throw error;
    }
  }

  /**
   * Suspend or unsuspend a study item
   */
  static async toggleStudyItemSuspension(studyItemId: string): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      // Find the note containing this study item
      const notes = await db.notes.toArray();
      let foundNote: Note | null = null;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          const studyItem = note.studyStats.studyItems.find(item => item.id === studyItemId);
          if (studyItem) {
            foundNote = note;
            break;
          }
        }
      }

      if (!foundNote) {
        throw new Error('Study item not found');
      }

      // Update the study item's suspension status
      const updatedStudyItems = foundNote.studyStats!.studyItems!.map(item =>
        item.id === studyItemId ? { ...item, suspended: !item.suspended } : item
      );

      const updatedNote = {
        ...foundNote,
        studyStats: {
          ...foundNote.studyStats!,
          studyItems: updatedStudyItems
        }
      };

      await db.notes.put(updatedNote);
    } catch (error) {
      console.error('Error toggling study item suspension:', error);
      throw error;
    }
  }

  /**
   * Reset a study item's progress
   */
  static async resetStudyItem(studyItemId: string): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      // Find the note containing this study item
      const notes = await db.notes.toArray();
      let foundNote: Note | null = null;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          const studyItem = note.studyStats.studyItems.find(item => item.id === studyItemId);
          if (studyItem) {
            foundNote = note;
            break;
          }
        }
      }

      if (!foundNote) {
        throw new Error('Study item not found');
      }

      // Reset the study item
      const updatedStudyItems = foundNote.studyStats!.studyItems!.map(item =>
        item.id === studyItemId ? { ...item, nextReview: Date.now(), suspended: false } : item
      );

      const updatedNote = {
        ...foundNote,
        studyStats: {
          ...foundNote.studyStats!,
          studyItems: updatedStudyItems
        }
      };

      await db.notes.put(updatedNote);
    } catch (error) {
      console.error('Error resetting study item:', error);
      throw error;
    }
  }

  /**
   * Get review history for a study item
   */
  static async getReviewHistory(studyItemId: string): Promise<ReviewSession[]> {
    try {
      await this.ensureDatabaseReady();

      // Since we're not using reviewSessions table, return empty array
      // Review history is now stored in the note's studyStats
      console.log('Review history is stored in note studyStats, not in separate table');
      return [];
    } catch (error) {
      console.error('Error getting review history:', error);
      return [];
    }
  }

  /**
   * Get all study items, optionally filtered by note or folder
   */
  static async getStudyItems(noteId?: string, folderId?: string): Promise<StudyItemWithBlock[]> {
    try {
      await this.ensureDatabaseReady();

      let notes: Note[];
      if (noteId) {
        const note = await db.notes.get(noteId);
        notes = note ? [note] : [];
      } else if (folderId) {
        notes = await db.notes.where('folderId').equals(folderId).toArray();
      } else {
        notes = await db.notes.toArray();
      }

      const studyItemsWithBlocks: StudyItemWithBlock[] = [];

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          for (const studyItem of note.studyStats.studyItems) {
            const block = note.blocks.find(b => b.id === studyItem.blockId);
            if (block) {
              studyItemsWithBlocks.push({
                ...studyItem,
                block,
                note
              });
            }
          }
        }
      }

      return studyItemsWithBlocks.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    } catch (error) {
      console.error('Error getting study items:', error);
      return [];
    }
  }

  /**
   * Get database status information for debugging
   */
  static async getDatabaseStatus(): Promise<{
    isOpen: boolean;
    version: number;
    hasNotes: boolean;
    hasFolders: boolean;
    notesCount: number;
    studyItemsCount: number;
  }> {
    try {
      const status = {
        isOpen: db.isOpen(),
        version: db.verno,
        hasNotes: !!db.notes,
        hasFolders: !!db.folders,
        notesCount: 0,
        studyItemsCount: 0
      };

      if (status.hasNotes) {
        try {
          status.notesCount = await db.notes.count();
          // Count total study items across all notes
          const notes = await db.notes.toArray();
          for (const note of notes) {
            if (note.studyStats?.studyItems) {
              status.studyItemsCount += note.studyStats.studyItems.length;
            }
          }
        } catch (error) {
          console.error('Error counting notes:', error);
        }
      }

      return status;
    } catch (error) {
      console.error('Error getting database status:', error);
      return {
        isOpen: false,
        version: 0,
        hasNotes: false,
        hasFolders: false,
        notesCount: 0,
        studyItemsCount: 0
      };
    }
  }

  /**
   * Simple debug function
   */
  static async debugDatabase(): Promise<void> {
    console.log('=== Database Debug Information ===');

    try {
      const status = await this.getDatabaseStatus();
      console.log('Database Status:', status);

      if (!status.isOpen) {
        console.log('Database is not open. Attempting to open...');
        await db.open();
        console.log('Database opened successfully');
      }

      console.log('=== End Debug Information ===');
    } catch (error) {
      console.error('Debug failed:', error);
    }
  }

  /**
   * Reset the database tables (use with caution - this will clear all study data)
   */
  static async resetDatabaseTables(): Promise<boolean> {
    try {
      console.log('Resetting database tables...');

      // Close the database
      if (db.isOpen()) {
        await db.close();
      }

      // Delete the database completely
      await db.delete();
      console.log('Database deleted');

      // Reopen the database
      await db.open();
      console.log('Database reopened');

      console.log('Database tables successfully reset');
      return true;
    } catch (error) {
      console.error('Error resetting database tables:', error);
      return false;
    }
  }
}

// Make debug functions available globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).debugDatabase = () => SpacedRepetitionService.debugDatabase();
  (window as any).resetDatabase = () => SpacedRepetitionService.resetDatabaseTables();
  (window as any).getDatabaseStatus = () => SpacedRepetitionService.getDatabaseStatus();
  (window as any).initializeDatabase = () => SpacedRepetitionService.initializeDatabase();
  (window as any).checkDatabaseHealth = () => SpacedRepetitionService.checkDatabaseSchema();
  (window as any).upgradeDatabase = () => SpacedRepetitionService.ensureDatabaseReady();
}
