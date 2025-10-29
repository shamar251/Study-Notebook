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
   * Create study items from blocks in a note based on WHO-HOW/WHO-WHAT relationships
   */
  static async createStudyItemsFromBlocks(blocks: Block[], note: Note, forceCreate: boolean = false): Promise<StudyItem[]> {
    try {
      console.log('🔄 createStudyItemsFromBlocks called - Version 7 compatible mode');
      await this.ensureDatabaseReady();

      const studyItems: StudyItem[] = [];

      // If forceCreate is true (for flashcard ratings), create study items for any WHO block
      if (forceCreate) {
        console.log('🔄 Force creating study items for flashcard rating');

        // Fetch the latest note from database to ensure we have fresh data
        const latestNote = await db.notes.get(note.id);
        if (!latestNote) {
          console.error(`Note not found in database: ${note.id}`);
          return [];
        }

        const whoBlocks = blocks.filter(b => b.type === 'who');

        for (const whoBlock of whoBlocks) {
          // Check if study item already exists for this block in the latest note
          const existingStudyItem = latestNote.studyStats?.studyItems?.find(item => item.blockId === whoBlock.id);

          if (existingStudyItem) {
            console.log(`🔧 Study item already exists for block ${whoBlock.id}, returning existing item`);
            studyItems.push(existingStudyItem);
            continue;
          }

          const studyItem: StudyItem = {
            id: `study-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            blockId: whoBlock.id,
            noteId: latestNote.id,
            folderId: latestNote.folderId,
            type: "who",
            nextReview: Date.now(), // New items are immediately due for their first review
            suspended: false,
            // Initialize SRS data
            interval: 1,
            repetitions: 0,
            easeFactor: 2.5,
            isLearning: true,
            learningStep: 0,
          };

          console.log(`🔧 Force created study item for WHO block:`, {
            id: studyItem.id,
            blockId: whoBlock.id,
            blockContent: whoBlock.content?.substring(0, 50)
          });

          studyItems.push(studyItem);
        }

        // Store only new study items (not existing ones) - merge with existing
        const existingBlockIds = new Set((latestNote.studyStats?.studyItems || []).map(item => item.blockId));
        const newStudyItems = studyItems.filter(item => !existingBlockIds.has(item.blockId));

        if (newStudyItems.length > 0) {
          const updatedNote = {
            ...latestNote,
            studyStats: {
              quizAttempts: latestNote.studyStats?.quizAttempts || 0,
              quizCorrect: latestNote.studyStats?.quizCorrect || 0,
              flashcardReviews: latestNote.studyStats?.flashcardReviews || 0,
              studyItems: [...(latestNote.studyStats?.studyItems || []), ...newStudyItems],
              lastStudied: Date.now()
            }
          };

          await db.notes.put(updatedNote);
          console.log(`Force added ${newStudyItems.length} new study items to note: ${latestNote.title} (preserved ${latestNote.studyStats?.studyItems?.length || 0} existing items)`);
        }

        return studyItems;
      }

      // Normal mode: Only create study items for WHO blocks that have valid relationships
      const whoBlocks = blocks.filter(b => b.type === 'who');

      for (const whoBlock of whoBlocks) {
        let shouldCreateStudyItem = false;
        let relatedBlock: Block | null = null;

        // Check if WHO block has linked blocks
        if (whoBlock.linkedBlockIds && whoBlock.linkedBlockIds.length > 0) {
          // Case 1: WHO -> single HOW (acts as WHAT)
          const linkedHowBlocks = whoBlock.linkedBlockIds
            .map(id => blocks.find(b => b.id === id && b.type === 'how'))
            .filter(Boolean) as Block[];

          if (linkedHowBlocks.length === 1) {
            const howBlock = linkedHowBlocks[0];
            // Check if this HOW block is NOT linked to another HOW block (making it a terminal/WHAT-like block)
            const howLinksToOtherHow = howBlock.linkedBlockIds?.some(id =>
              blocks.find(b => b.id === id && b.type === 'how')
            );

            if (!howLinksToOtherHow) {
              shouldCreateStudyItem = true;
              relatedBlock = howBlock;
              console.log(`🔧 Found WHO -> single terminal HOW relationship: WHO(${whoBlock.content?.substring(0, 30)}) -> HOW(${howBlock.content?.substring(0, 30)})`);
            } else {
              console.log(`🔧 Skipping WHO -> HOW chain (not terminal): WHO(${whoBlock.content?.substring(0, 30)}) -> HOW(${howBlock.content?.substring(0, 30)})`);
            }
          }

          // Case 2: WHO -> WHAT block
          if (!shouldCreateStudyItem) {
            const linkedWhatBlocks = whoBlock.linkedBlockIds
              .map(id => blocks.find(b => b.id === id && b.type === 'what'))
              .filter(Boolean) as Block[];

            if (linkedWhatBlocks.length > 0) {
              shouldCreateStudyItem = true;
              relatedBlock = linkedWhatBlocks[0]; // Use first WHAT block
              console.log(`🔧 Found WHO -> WHAT relationship: WHO(${whoBlock.content?.substring(0, 30)}) -> WHAT(${relatedBlock.content?.substring(0, 30)})`);
            }
          }
        }

        // Create study item for valid WHO blocks
        if (shouldCreateStudyItem && relatedBlock) {
          const studyItem: StudyItem = {
            id: `study-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            blockId: whoBlock.id,
            noteId: note.id,
            folderId: note.folderId,
            type: "who", // Always "who" since we only create study items for WHO blocks
            nextReview: Date.now(), // New items are immediately due for their first review
            suspended: false,
            // Initialize SRS data
            interval: 1,
            repetitions: 0,
            easeFactor: 2.5,
            isLearning: true,
            learningStep: 0,
          };

          console.log(`🔧 Created study item for WHO block:`, {
            id: studyItem.id,
            blockId: whoBlock.id,
            nextReview: studyItem.nextReview ? new Date(studyItem.nextReview).toISOString() : 'null',
            whoBlockContent: whoBlock.content?.substring(0, 50),
            relatedBlockType: relatedBlock.type,
            relatedBlockContent: relatedBlock.content?.substring(0, 50)
          });

          studyItems.push(studyItem);
        } else {
          console.log(`🔧 Skipped WHO block (no valid relationship): WHO(${whoBlock.content?.substring(0, 30)})`);
        }
      }

      // Store study data within the note's studyStats (version 7 compatible)
      if (studyItems.length > 0) {
        // CRITICAL: Always fetch the latest note from database before merging
        // This prevents stale data from overwriting freshly saved ratings
        const latestNote = await db.notes.get(note.id);
        if (!latestNote) {
          console.error(`Note not found in database: ${note.id}`);
          return studyItems;
        }

        // Merge with existing study items from the LATEST note (not the stale one passed in)
        // This preserves review data that was saved during flashcard sessions
        const existingStudyItems = latestNote.studyStats?.studyItems || [];
        const existingBlockIds = new Set(existingStudyItems.map(item => item.blockId));

        // Only add study items that don't already exist (by blockId)
        const newStudyItems = studyItems.filter(item => !existingBlockIds.has(item.blockId));
        const mergedStudyItems = [...existingStudyItems, ...newStudyItems];

        console.log(`🔧 Merging study items for note "${latestNote.title}" (using latest DB data):`, {
          existing: existingStudyItems.length,
          new: newStudyItems.length,
          total: mergedStudyItems.length,
          noteHadRatings: existingStudyItems.some(item => (item.repetitions || 0) > 0 || (item.nextReview && item.nextReview > 0))
        });

        const updatedNote = {
          ...latestNote,
          studyStats: {
            quizAttempts: latestNote.studyStats?.quizAttempts || 0,
            quizCorrect: latestNote.studyStats?.quizCorrect || 0,
            flashcardReviews: latestNote.studyStats?.flashcardReviews || 0,
            studyItems: mergedStudyItems,
            lastStudied: Date.now()
          }
        };

        await db.notes.put(updatedNote);
        console.log(`Added ${newStudyItems.length} new study items to note: ${latestNote.title} (preserved ${existingStudyItems.length} existing items with review data)`);
      } else {
        console.log(`No valid study items created for note: ${note.title}`);
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

      console.log('🔍 getDueStudyItems called with:', { folderId, now: new Date(now).toISOString() });

      if (folderId) {
        notes = await db.notes.where('folderId').equals(folderId).toArray();
        console.log(`📁 Found ${notes.length} notes in folder ${folderId}`);
      } else {
        notes = await db.notes.toArray();
        console.log(`📚 Found ${notes.length} total notes`);
      }

      const studyItemsWithBlocks: StudyItemWithBlock[] = [];
      let totalStudyItems = 0;
      let itemsWithoutBlocks = 0;
      let suspendedItems = 0;
      let futureItems = 0;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          console.log(`📝 Note "${note.title}" has ${note.studyStats.studyItems.length} study items`);

          for (const studyItem of note.studyStats.studyItems) {
            totalStudyItems++;

            // Only consider items with valid review dates
            const hasValidReviewDate = studyItem.nextReview !== null && studyItem.nextReview !== undefined && studyItem.nextReview > 0;
            const isDue = hasValidReviewDate && studyItem.nextReview! <= now;

            console.log(`  📋 Study item ${studyItem.id}:`, {
              type: studyItem.type,
              nextReview: studyItem.nextReview ? new Date(studyItem.nextReview).toISOString() : 'null',
              suspended: studyItem.suspended,
              blockId: studyItem.blockId,
              hasValidReviewDate,
              isDue: isDue && !studyItem.suspended
            });

            if (studyItem.suspended) {
              suspendedItems++;
              continue;
            }

            // Skip items without valid review dates
            if (!hasValidReviewDate) {
              console.log(`  ⏭️ Skipping item without valid review date: ${studyItem.id}`);
              continue;
            }

            // Skip items that are not yet due
            if (studyItem.nextReview! > now) {
              futureItems++;
              continue;
            }

            const block = note.blocks.find(b => b.id === studyItem.blockId);
            if (block) {
              console.log(`  ✅ Found matching block for ${studyItem.blockId}: "${block.content?.substring(0, 50)}..."`);
              studyItemsWithBlocks.push({
                ...studyItem,
                block,
                note
              });
            } else {
              itemsWithoutBlocks++;
              console.warn(`  ❌ No matching block found for study item ${studyItem.id} (blockId: ${studyItem.blockId})`);
              console.warn(`    Available blocks in note:`, note.blocks.map(b => ({ id: b.id, type: b.type, content: b.content?.substring(0, 30) })));
            }
          }
        } else {
          console.log(`📝 Note "${note.title}" has no study items`);
        }
      }

      console.log('🔍 getDueStudyItems summary:', {
        totalStudyItems,
        dueItemsFound: studyItemsWithBlocks.length,
        itemsWithoutBlocks,
        suspendedItems,
        futureItems,
        folderId: folderId || 'all'
      });

      return studyItemsWithBlocks.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    } catch (error) {
      console.error('❌ Error getting due study items:', error);
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

      // Initialize SRS data if not present
      const currentInterval = foundStudyItem.interval || 1;
      const currentRepetitions = foundStudyItem.repetitions || 0;
      const currentEaseFactor = foundStudyItem.easeFactor || 2.5;
      const isCurrentlyLearning = foundStudyItem.isLearning !== false; // Default to learning for new items
      const currentLearningStep = foundStudyItem.learningStep || 0;

      // Learning phase steps (in minutes): 1 hour (minimum), 1 day, 3 days
      // CRITICAL: Changed first step from 10 minutes to 60 minutes (1 hour) to prevent
      // items from having past review dates if the session takes longer than 10 minutes
      const learningSteps = [60, 1440, 4320]; // 1 hour, 1 day, 3 days in minutes

      let newInterval: number = 1; // Default to 1 day
      let newRepetitions = currentRepetitions;
      let newEaseFactor = currentEaseFactor;
      let newIsLearning = isCurrentlyLearning;
      let newLearningStep = currentLearningStep;

      if (isCurrentlyLearning) {
        // Learning phase algorithm
        switch (rating) {
          case Rating.Again:
            // Reset to first learning step (1 hour minimum to ensure future date)
            newLearningStep = 0;
            newInterval = learningSteps[0] / (24 * 60); // Convert to days (1 hour = ~0.042 days)
            break;

          case Rating.Hard:
            // Stay at current step or go back one
            newLearningStep = Math.max(0, currentLearningStep - 1);
            newInterval = learningSteps[newLearningStep] / (24 * 60); // Convert to days
            break;

          case Rating.Good:
            // Advance to next learning step
            if (currentLearningStep < learningSteps.length - 1) {
              newLearningStep = currentLearningStep + 1;
              newInterval = learningSteps[newLearningStep] / (24 * 60); // Convert to days
            } else {
              // Graduate from learning phase
              newIsLearning = false;
              newRepetitions = 1;
              newInterval = 1; // Start with 1 day graduated interval
            }
            break;

          case Rating.Easy:
            // Graduate immediately with longer initial interval
            newIsLearning = false;
            newRepetitions = 1;
            newInterval = 4; // Start with 4 days for easy graduation
            break;
        }
      } else {
        // Review phase - SM-2 based algorithm
        switch (rating) {
          case Rating.Again:
            // Reset to learning phase
            newIsLearning = true;
            newLearningStep = 0;
            newRepetitions = 0;
            newInterval = learningSteps[0] / (24 * 60); // 1 hour converted to days (~0.042 days)
            // Reduce ease factor
            newEaseFactor = Math.max(1.3, currentEaseFactor - 0.2);
            break;

          case Rating.Hard:
            // Reduce interval and ease factor slightly
            newInterval = Math.max(1, Math.floor(currentInterval * 1.2));
            newEaseFactor = Math.max(1.3, currentEaseFactor - 0.15);
            newRepetitions = currentRepetitions + 1;
            break;

          case Rating.Good:
            // Standard SM-2 progression
            newRepetitions = currentRepetitions + 1;
            // Check repetitions AFTER incrementing to properly handle first review
            if (newRepetitions === 1 || currentRepetitions === 0) {
              newInterval = 6; // First/second review after 6 days
            } else {
              newInterval = Math.round(currentInterval * currentEaseFactor);
            }
            break;

          case Rating.Easy:
            // Faster progression with ease factor increase
            newRepetitions = currentRepetitions + 1;
            newEaseFactor = Math.min(4.0, currentEaseFactor + 0.1); // Increase ease
            // Check repetitions AFTER incrementing to properly handle first review
            if (currentRepetitions === 0) {
              newInterval = 6; // First review after 6 days
            } else {
              newInterval = Math.round(currentInterval * currentEaseFactor * 1.3); // 30% bonus
            }
            break;
        }
      }

      // Calculate next review time
      const intervalInMs = newInterval < 1
        ? newInterval * 24 * 60 * 60 * 1000 // For sub-day intervals (learning phase)
        : newInterval * 24 * 60 * 60 * 1000; // For day intervals

      // CRITICAL: Ensure nextReview is always at least 1 hour in the future
      // This prevents items from having past dates and disappearing from upcoming reviews
      const minIntervalMs = 60 * 60 * 1000; // 1 hour in milliseconds
      const calculatedNextReview = Date.now() + intervalInMs;
      const nextReviewTime = Math.max(calculatedNextReview, Date.now() + minIntervalMs);

      console.log(`🎯 Review update for item ${studyItemId}:`, {
        rating,
        currentInterval,
        newInterval,
        intervalInMs,
        currentTime: new Date(Date.now()).toISOString(),
        nextReviewTime: new Date(nextReviewTime).toISOString(),
        isLearning: newIsLearning,
        learningStep: newLearningStep,
        repetitions: newRepetitions
      });

      // Update the study item with new SRS data
      const updatedStudyItem = {
        ...foundStudyItem,
        nextReview: nextReviewTime,
        interval: newInterval,
        repetitions: newRepetitions,
        easeFactor: newEaseFactor,
        isLearning: newIsLearning,
        learningStep: newLearningStep
      };

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
 * Ensure study items exist for notes with valid WHO block relationships
 * IMPORTANT: Always fetches latest note from DB to prevent overwriting saved ratings
 */
  static async ensureStudyItemsExist(): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      console.log('🔧 Ensuring study items exist for all notes...');
      const noteIds = await db.notes.toCollection().keys();
      let notesUpdated = 0;

      // Fetch notes one by one to ensure we always have the latest version
      for (const noteId of noteIds) {
        // CRITICAL: Always fetch the latest note from DB to prevent race conditions
        // where stale data overwrites freshly saved ratings
        const latestNote = await db.notes.get(noteId);
        if (!latestNote) continue;

        const whoBlocks = latestNote.blocks.filter(b => b.type === 'who');

        // Only process notes that have WHO blocks with valid relationships
        if (whoBlocks.length > 0) {
          let hasValidRelationships = false;

          // Check if any WHO block has valid relationships
          for (const whoBlock of whoBlocks) {
            if (whoBlock.linkedBlockIds && whoBlock.linkedBlockIds.length > 0) {
              // Check for WHO -> terminal HOW relationship
              const linkedHowBlocks = whoBlock.linkedBlockIds
                .map(id => latestNote.blocks.find(b => b.id === id && b.type === 'how'))
                .filter(Boolean) as Block[];

              if (linkedHowBlocks.length === 1) {
                const howBlock = linkedHowBlocks[0];
                const howLinksToOtherHow = howBlock.linkedBlockIds?.some(id =>
                  latestNote.blocks.find(b => b.id === id && b.type === 'how')
                );
                if (!howLinksToOtherHow) {
                  hasValidRelationships = true;
                  break;
                }
              }

              // Check for WHO -> WHAT relationship
              const linkedWhatBlocks = whoBlock.linkedBlockIds
                .map(id => latestNote.blocks.find(b => b.id === id && b.type === 'what'))
                .filter(Boolean) as Block[];

              if (linkedWhatBlocks.length > 0) {
                hasValidRelationships = true;
                break;
              }
            }
          }

          if (hasValidRelationships) {
            // CRITICAL: Check the LATEST note from DB (not stale data)
            // Only create if there are truly no study items in the latest DB state
            const existingStudyItems = latestNote.studyStats?.studyItems || [];
            if (existingStudyItems.length === 0) {
              console.log(`🔧 Creating study items for note: ${latestNote.title}`);
              // createStudyItemsFromBlocks will also fetch latest note internally, but pass latestNote anyway
              await this.createStudyItemsFromBlocks(latestNote.blocks, latestNote);
              notesUpdated++;
            } else {
              console.log(`🔧 Note ${latestNote.title} already has ${existingStudyItems.length} study items (preserving review data)`);
            }
          } else {
            console.log(`🔧 Note ${latestNote.title} has WHO blocks but no valid relationships for study items`);
          }
        }
      }

      console.log(`🔧 Ensured study items exist: ${notesUpdated} notes updated`);
    } catch (error) {
      console.error('❌ Error ensuring study items exist:', error);
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

  /**
   * Clear all existing study items and regenerate them with correct logic
   */
  static async regenerateAllStudyItems(): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      console.log('🔧 Regenerating all study items with correct logic...');
      const notes = await db.notes.toArray();
      let notesUpdated = 0;

      for (const note of notes) {
        // Clear existing study items
        if (note.studyStats?.studyItems) {
          console.log(`🔧 Clearing ${note.studyStats.studyItems.length} existing study items from note: ${note.title}`);

          const updatedNote = {
            ...note,
            studyStats: {
              ...note.studyStats,
              studyItems: []
            }
          };

          await db.notes.put(updatedNote);
        }

        // Regenerate study items with correct logic
        await this.createStudyItemsFromBlocks(note.blocks, note);
        notesUpdated++;
      }

      console.log(`🔧 Regenerated study items for ${notesUpdated} notes`);
    } catch (error) {
      console.error('❌ Error regenerating study items:', error);
    }
  }

  /**
   * Fix all study items that are incorrectly due today by spreading them out over future dates
   */
  static async fixIncorrectDueDates(): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      console.log('🔧 Fixing incorrect due dates for study items...');
      const notes = await db.notes.toArray();
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      let totalFixed = 0;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          let noteUpdated = false;
          const updatedStudyItems = note.studyStats.studyItems.map((item, index) => {
            // If item is due today or in the past, spread it out over the next few days
            if ((item.nextReview || 0) <= now + oneDayMs) {
              // Spread items over the next 1-7 days randomly
              const daysToAdd = Math.floor(Math.random() * 7) + 1;
              const newDueDate = now + (daysToAdd * oneDayMs);

              console.log(`🔧 Fixing due date for item in note "${note.title}": ${new Date(item.nextReview || 0).toISOString()} → ${new Date(newDueDate).toISOString()}`);

              noteUpdated = true;
              totalFixed++;

              return {
                ...item,
                nextReview: newDueDate
              };
            }
            return item;
          });

          if (noteUpdated) {
            const updatedNote = {
              ...note,
              studyStats: {
                ...note.studyStats,
                studyItems: updatedStudyItems
              }
            };

            await db.notes.put(updatedNote);
            console.log(`🔧 Updated due dates for note: ${note.title}`);
          }
        }
      }

      console.log(`🔧 Fixed ${totalFixed} study items with incorrect due dates`);
    } catch (error) {
      console.error('❌ Error fixing due dates:', error);
    }
  }

  /**
   * Clear all review dates from study items that haven't been actually studied
   */
  static async clearAllReviewDates(): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      console.log('🔧 Clearing all review dates from unstudied items...');
      const notes = await db.notes.toArray();
      let totalCleared = 0;

      for (const note of notes) {
        if (note.studyStats?.studyItems) {
          let noteUpdated = false;
          const updatedStudyItems = note.studyStats.studyItems.map(item => {
            // Clear the nextReview date - items should only have dates after being studied
            if (item.nextReview) {
              console.log(`🔧 Clearing review date for item in note "${note.title}": ${new Date(item.nextReview).toISOString()}`);
              noteUpdated = true;
              totalCleared++;

              return {
                ...item,
                nextReview: undefined
              };
            }
            return item;
          });

          if (noteUpdated) {
            const updatedNote = {
              ...note,
              studyStats: {
                ...note.studyStats,
                studyItems: updatedStudyItems
              }
            };

            await db.notes.put(updatedNote);
            console.log(`🔧 Cleared review dates for note: ${note.title}`);
          }
        }
      }

      console.log(`🔧 Cleared ${totalCleared} review dates from unstudied items`);
    } catch (error) {
      console.error('❌ Error clearing review dates:', error);
    }
  }

  /**
   * Debug function to analyze study items and their dates
   */
  static async debugStudyItemDates(): Promise<void> {
    try {
      await this.ensureDatabaseReady();

      console.log('🔍 Debugging study item dates...');
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const allStudyItems = await this.getStudyItems();
      console.log(`📊 Total study items found: ${allStudyItems.length}`);

      let dueToday = 0;
      let upcoming = 0;
      let withoutDates = 0;
      let suspended = 0;
      let nullDates = 0;
      let zeroDates = 0;
      let undefinedDates = 0;

      const dateBreakdown: { [key: string]: number } = {};

      allStudyItems.forEach((item, index) => {
        const nextReview = item.nextReview;

        if (item.suspended) {
          suspended++;
          return;
        }

        // More detailed analysis of missing dates
        if (nextReview === null) {
          nullDates++;
          withoutDates++;
          if (index < 5) console.log(`📋 Item with NULL date: ${item.id} in note "${item.note.title}"`);
          return;
        }

        if (nextReview === undefined) {
          undefinedDates++;
          withoutDates++;
          if (index < 5) console.log(`📋 Item with UNDEFINED date: ${item.id} in note "${item.note.title}"`);
          return;
        }

        if (nextReview === 0) {
          zeroDates++;
          withoutDates++;
          if (index < 5) console.log(`📋 Item with ZERO date: ${item.id} in note "${item.note.title}"`);
          return;
        }

        const reviewDate = new Date(nextReview);
        const dayKey = reviewDate.toDateString();
        dateBreakdown[dayKey] = (dateBreakdown[dayKey] || 0) + 1;

        if (nextReview <= now + oneDayMs) {
          dueToday++;
        } else {
          upcoming++;
        }

        if (index < 10) {
          console.log(`📋 Item ${index + 1}: ${item.note.title} - Due: ${reviewDate.toISOString()}`);
        }
      });

      console.log('📊 Study Items Summary:');
      console.log(`  Due today/past: ${dueToday}`);
      console.log(`  Upcoming (with valid dates): ${upcoming}`);
      console.log(`  Without dates (total): ${withoutDates}`);
      console.log(`    - NULL dates: ${nullDates}`);
      console.log(`    - UNDEFINED dates: ${undefinedDates}`);
      console.log(`    - ZERO dates: ${zeroDates}`);
      console.log(`  Suspended: ${suspended}`);

      console.log('📅 Date breakdown:');
      Object.entries(dateBreakdown)
        .sort()
        .forEach(([date, count]) => {
          console.log(`  ${date}: ${count} items`);
        });

    } catch (error) {
      console.error('❌ Error debugging study item dates:', error);
    }
  }

  /**
   * Simulate spaced repetition intervals for different rating patterns
   */
  static simulateSpacedRepetitionIntervals(): any {
    console.log('🧮 Simulating Spaced Repetition Intervals...');

    const startDate = Date.now();
    const simulation = {
      startDate: new Date(startDate).toLocaleDateString(),
      scenarios: {} as any
    };

    // Define rating scenarios
    const scenarios = [
      { name: 'Perfect Student (All Easy)', ratings: [Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy, Rating.Easy] },
      { name: 'Good Student (Mostly Good)', ratings: [Rating.Good, Rating.Good, Rating.Easy, Rating.Good, Rating.Easy] },
      { name: 'Struggling Student (Mixed)', ratings: [Rating.Hard, Rating.Good, Rating.Hard, Rating.Good, Rating.Good] },
      { name: 'Difficult Card (Many Again)', ratings: [Rating.Again, Rating.Hard, Rating.Again, Rating.Good, Rating.Good] },
      { name: 'Consistent Good', ratings: [Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good] }
    ];

    scenarios.forEach(scenario => {
      let currentDate = startDate;
      const reviews: any[] = [];
      let interval = 1; // Start with 1 day base interval

      // Track SRS state for simulation
      let repetitions = 0;
      let easeFactor = 2.5;
      let isLearning = true;
      let learningStep = 0;

      scenario.ratings.forEach((rating, index) => {
        const learningSteps = [10 / 1440, 1, 3]; // 10 minutes, 1 day, 3 days (in days)

        if (isLearning) {
          // Learning phase
          switch (rating) {
            case Rating.Again:
              learningStep = 0;
              interval = learningSteps[0];
              break;
            case Rating.Hard:
              learningStep = Math.max(0, learningStep - 1);
              interval = learningSteps[learningStep];
              break;
            case Rating.Good:
              if (learningStep < learningSteps.length - 1) {
                learningStep++;
                interval = learningSteps[learningStep];
              } else {
                // Graduate from learning
                isLearning = false;
                repetitions = 1;
                interval = 1;
              }
              break;
            case Rating.Easy:
              // Graduate immediately
              isLearning = false;
              repetitions = 1;
              interval = 4;
              break;
          }
        } else {
          // Review phase - SM-2 based
          switch (rating) {
            case Rating.Again:
              isLearning = true;
              learningStep = 0;
              repetitions = 0;
              interval = learningSteps[0];
              easeFactor = Math.max(1.3, easeFactor - 0.2);
              break;
            case Rating.Hard:
              interval = Math.max(1, Math.floor(interval * 1.2));
              easeFactor = Math.max(1.3, easeFactor - 0.15);
              repetitions++;
              break;
            case Rating.Good:
              if (repetitions === 1) {
                interval = 6;
              } else {
                interval = Math.round(interval * easeFactor);
              }
              repetitions++;
              break;
            case Rating.Easy:
              if (repetitions === 1) {
                interval = 6;
              } else {
                interval = Math.round(interval * easeFactor * 1.3);
              }
              easeFactor = Math.min(4.0, easeFactor + 0.1);
              repetitions++;
              break;
          }
        }

        currentDate = currentDate + (interval * 24 * 60 * 60 * 1000);

        reviews.push({
          reviewNumber: index + 1,
          rating: this.getRatingName(rating),
          interval: interval < 1 ? `${Math.round(interval * 1440)} min` : `${Math.round(interval)} day${Math.round(interval) !== 1 ? 's' : ''}`,
          nextReviewDate: new Date(currentDate).toLocaleDateString(),
          daysFromStart: Math.ceil((currentDate - startDate) / (24 * 60 * 60 * 1000)),
          phase: isLearning ? 'Learning' : 'Review',
          easeFactor: Math.round(easeFactor * 100) / 100,
          repetitions
        });
      });

      simulation.scenarios[scenario.name] = {
        ratings: scenario.ratings.map(r => this.getRatingName(r)),
        reviews,
        totalDaysSpanned: Math.ceil((currentDate - startDate) / (24 * 60 * 60 * 1000))
      };
    });

    console.log('📈 Spaced Repetition Simulation Results:', simulation);
    return simulation;
  }

  /**
   * Get rating name for display
   */
  private static getRatingName(rating: Rating): string {
    switch (rating) {
      case Rating.Again: return 'Again';
      case Rating.Hard: return 'Hard';
      case Rating.Good: return 'Good';
      case Rating.Easy: return 'Easy';
      default: return 'Unknown';
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
  (window as any).ensureStudyItemsExist = () => SpacedRepetitionService.ensureStudyItemsExist();
  (window as any).getDueStudyItems = (folderId?: string) => SpacedRepetitionService.getDueStudyItems(folderId);
  (window as any).getStudyItems = (noteId?: string, folderId?: string) => SpacedRepetitionService.getStudyItems(noteId, folderId);
  (window as any).regenerateAllStudyItems = () => SpacedRepetitionService.regenerateAllStudyItems();
  (window as any).fixIncorrectDueDates = () => SpacedRepetitionService.fixIncorrectDueDates();
  (window as any).debugStudyItemDates = () => SpacedRepetitionService.debugStudyItemDates();
  (window as any).clearAllReviewDates = () => SpacedRepetitionService.clearAllReviewDates();
  (window as any).simulateIntervals = () => SpacedRepetitionService.simulateSpacedRepetitionIntervals();
  (window as any).debugDueItems = async (folderId?: string) => {
    const now = Date.now();
    const dueItems = await SpacedRepetitionService.getDueStudyItems(folderId);

    console.log('=== DUE ITEMS DEBUG ===');
    console.log(`Current time: ${new Date(now).toISOString()}`);
    console.log(`Total due items: ${dueItems.length}`);

    dueItems.forEach((item, index) => {
      console.log(`\n--- Due Item ${index + 1} ---`);
      console.log(`ID: ${item.id}`);
      console.log(`Type: ${item.type}`);
      console.log(`Note: ${item.note?.title || 'Unknown'}`);
      console.log(`Block Content: ${item.block?.content?.substring(0, 50) || 'No content'}`);
      console.log(`Next Review: ${item.nextReview ? new Date(item.nextReview).toISOString() : 'null'}`);
      console.log(`Is Due: ${item.nextReview ? (item.nextReview <= now) : false}`);
      console.log(`Suspended: ${item.suspended}`);
      console.log(`Is Learning: ${item.isLearning}`);
      console.log(`Learning Step: ${item.learningStep}`);
      console.log(`Repetitions: ${item.repetitions}`);
      console.log(`Interval: ${item.interval} days`);
    });

    console.log('=== END DUE ITEMS DEBUG ===');
    return dueItems;
  };
  (window as any).debugAllStudyItems = async (folderId?: string) => {
    const now = Date.now();
    const allItems = await SpacedRepetitionService.getStudyItems(undefined, folderId);

    console.log('=== ALL STUDY ITEMS DEBUG ===');
    console.log(`Current time: ${new Date(now).toISOString()}`);
    console.log(`Total study items: ${allItems.length}`);

    let dueCount = 0;
    let futureCount = 0;
    let nullCount = 0;

    allItems.forEach((item, index) => {
      const isDue = item.nextReview && item.nextReview <= now && !item.suspended;
      const isFuture = item.nextReview && item.nextReview > now;
      const isNull = !item.nextReview;

      if (isDue) dueCount++;
      if (isFuture) futureCount++;
      if (isNull) nullCount++;

      console.log(`\n--- Study Item ${index + 1} ---`);
      console.log(`ID: ${item.id}`);
      console.log(`Type: ${item.type}`);
      console.log(`Note: ${item.note?.title || 'Unknown'}`);
      console.log(`Block Content: ${item.block?.content?.substring(0, 50) || 'No content'}`);
      console.log(`Next Review: ${item.nextReview ? new Date(item.nextReview).toISOString() : 'null'}`);
      console.log(`Status: ${isDue ? 'DUE' : isFuture ? 'FUTURE' : isNull ? 'NO DATE' : 'OTHER'}`);
      console.log(`Suspended: ${item.suspended}`);
      console.log(`Is Learning: ${item.isLearning}`);
      console.log(`Learning Step: ${item.learningStep}`);
      console.log(`Repetitions: ${item.repetitions}`);
      console.log(`Interval: ${item.interval} days`);
    });

    console.log(`\n=== SUMMARY ===`);
    console.log(`Due items: ${dueCount}`);
    console.log(`Future items: ${futureCount}`);
    console.log(`Items with no review date: ${nullCount}`);
    console.log('=== END ALL STUDY ITEMS DEBUG ===');

    return { dueCount, futureCount, nullCount, total: allItems.length };
  };
}
