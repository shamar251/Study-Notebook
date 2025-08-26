// Import the service and database directly from relative paths
import { SpacedRepetitionService } from '../lib/spaced-repetition';
import { db } from '../lib/db';
import { Rating } from 'ts-fsrs';

// Mock data for testing
const mockBlocks = [
  {
    id: 'block-1',
    type: 'who' as const,
    content: 'Who is the main character?',
    createdAt: new Date(),
    lastModified: new Date(),
    sortOrder: 0
  },
  {
    id: 'block-2',
    type: 'what' as const,
    content: 'What happened in the story?',
    createdAt: new Date(),
    lastModified: new Date(),
    sortOrder: 1
  },
  {
    id: 'block-3',
    type: 'note' as const,
    content: 'This is a regular note block',
    createdAt: new Date(),
    lastModified: new Date(),
    sortOrder: 2
  }
];

const mockNote = {
  id: 'test-note-1',
  title: 'Test Note',
  blocks: mockBlocks,
  tags: ['test'],
  folderId: 'test-folder-1',
  updatedAt: Date.now(),
  order: 0
};

const mockFolder = {
  id: 'test-folder-1',
  name: 'Test Folder',
  parentId: null,
  createdAt: Date.now(),
  order: 0,
  path: ['Test Folder']
};

// Simple test runner for environments without Jest
function runTests() {
  console.log('🧪 Running Spaced Repetition Tests...');

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, testFn: () => void | Promise<void>) {
    totalTests++;
    try {
      const result = testFn();
      if (result instanceof Promise) {
        result.then(() => {
          console.log(`✅ ${name} - PASSED`);
          passedTests++;
        }).catch((error) => {
          console.log(`❌ ${name} - FAILED: ${error.message}`);
        });
      } else {
        console.log(`✅ ${name} - PASSED`);
        passedTests++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${name} - FAILED: ${errorMessage}`);
    }
  }

  function describe(name: string, testSuite: () => void) {
    console.log(`\n📋 ${name}`);
    console.log('─'.repeat(name.length + 2));
    testSuite();
  }

  function expect(value: any) {
    return {
      toBe: (expected: any) => {
        if (value !== expected) {
          throw new Error(`Expected ${value} to be ${expected}`);
        }
      },
      toHaveLength: (expected: number) => {
        if (value.length !== expected) {
          throw new Error(`Expected length ${value.length} to be ${expected}`);
        }
      },
      toBeDefined: () => {
        if (value === undefined) {
          throw new Error('Expected value to be defined');
        }
      },
      toBeGreaterThan: (expected: number) => {
        if (value <= expected) {
          throw new Error(`Expected ${value} to be greater than ${expected}`);
        }
      },
      toBeLessThanOrEqual: (expected: number) => {
        if (value > expected) {
          throw new Error(`Expected ${value} to be less than or equal to ${expected}`);
        }
      },
      toEqual: (expected: any) => {
        if (JSON.stringify(value) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
        }
      }
    };
  }

  // Test suite
  describe('SpacedRepetitionService', () => {
    let studyItemId: string;

    test('should check database schema correctly', () => {
      const result = SpacedRepetitionService.checkDatabaseSchema();
      expect(result).toBe(true);
    });

    test('should ensure database is ready', async () => {
      await SpacedRepetitionService.ensureDatabaseReady();
    });

    test('should get database status', async () => {
      const status = await SpacedRepetitionService.getDatabaseStatus();
      expect(status.isOpen).toBe(true);
      expect(status.hasNotes).toBe(true);
      expect(status.hasFolders).toBe(true);
    });

    test('should create study items from blocks', async () => {
      // Reset database first
      await SpacedRepetitionService.resetDatabaseTables();

      // Add test data
      await db.notes.add(mockNote);
      await db.folders.add(mockFolder);

      const studyItems = await SpacedRepetitionService.createStudyItemsFromBlocks(
        mockNote.blocks,
        mockNote
      );

      expect(studyItems).toHaveLength(2);
      expect(studyItems[0].type).toBe('who');
      expect(studyItems[1].type).toBe('what');
      expect(studyItems[0].noteId).toBe(mockNote.id);
      expect(studyItems[0].folderId).toBe(mockNote.folderId);
      expect(studyItems[0].suspended).toBe(false);

      // Store ID for later tests
      studyItemId = studyItems[0].id;
    });

    test('should not create study items for non-study block types', async () => {
      const noteBlocks = mockNote.blocks.filter(block => block.type === 'note');
      const studyItems = await SpacedRepetitionService.createStudyItemsFromBlocks(
        noteBlocks,
        mockNote
      );

      expect(studyItems).toHaveLength(0);
    });

    test('should store study items in note studyStats', async () => {
      const updatedNote = await db.notes.get(mockNote.id);
      expect(updatedNote?.studyStats?.studyItems).toBeDefined();
      expect(updatedNote?.studyStats?.studyItems).toHaveLength(2);
    });

    test('should get all study items', async () => {
      const studyItems = await SpacedRepetitionService.getStudyItems();
      expect(studyItems).toHaveLength(2);
      expect(studyItems[0].block.type).toBe('who');
      expect(studyItems[1].block.type).toBe('what');
    });

    test('should get due study items', async () => {
      const dueItems = await SpacedRepetitionService.getDueStudyItems();
      expect(dueItems).toHaveLength(2);
    });

    test('should review study item with Good rating', async () => {
      const result = await SpacedRepetitionService.reviewStudyItem(studyItemId, Rating.Good);

      expect(result.studyItem.id).toBe(studyItemId);
      expect(result.interval).toBe(3);
      expect(result.nextReview.getTime()).toBeGreaterThan(Date.now());
    });

    test('should update next review time in database', async () => {
      const originalTime = Date.now();
      await SpacedRepetitionService.reviewStudyItem(studyItemId, Rating.Good);

      const updatedNote = await db.notes.get(mockNote.id);
      const updatedStudyItem = updatedNote?.studyStats?.studyItems?.find(
        item => item.id === studyItemId
      );

      expect(updatedStudyItem?.nextReview).toBeGreaterThan(originalTime);
    });

    test('should toggle study item suspension', async () => {
      // Initially not suspended
      let studyItems = await SpacedRepetitionService.getStudyItems();
      expect(studyItems.find(item => item.id === studyItemId)?.suspended).toBe(false);

      // Suspend the item
      await SpacedRepetitionService.toggleStudyItemSuspension(studyItemId);
      studyItems = await SpacedRepetitionService.getStudyItems();
      expect(studyItems.find(item => item.id === studyItemId)?.suspended).toBe(true);

      // Unsuspend the item
      await SpacedRepetitionService.toggleStudyItemSuspension(studyItemId);
      studyItems = await SpacedRepetitionService.getStudyItems();
      expect(studyItems.find(item => item.id === studyItemId)?.suspended).toBe(false);
    });

    test('should get study statistics', async () => {
      const stats = await SpacedRepetitionService.getStudyStats();

      expect(stats.total).toBe(2);
      expect(stats.suspended).toBe(0);
      expect(stats.due).toBe(2);
    });

    test('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await db.close();

      const studyItems = await SpacedRepetitionService.getStudyItems();
      expect(studyItems).toEqual([]);

      // Reopen database for cleanup
      await db.open();
    });

    test('should complete full study workflow', async () => {
      // 1. Create study items
      const studyItems = await SpacedRepetitionService.createStudyItemsFromBlocks(
        mockNote.blocks,
        mockNote
      );
      expect(studyItems).toHaveLength(2);

      // 2. Get due items
      const dueItems = await SpacedRepetitionService.getDueStudyItems();
      expect(dueItems).toHaveLength(2);

      // 3. Review first item
      const reviewResult = await SpacedRepetitionService.reviewStudyItem(
        studyItems[0].id,
        Rating.Good
      );
      expect(reviewResult.interval).toBe(3);

      // 4. Check that item is no longer due
      const updatedDueItems = await SpacedRepetitionService.getDueStudyItems();
      expect(updatedDueItems).toHaveLength(1);

      // 5. Suspend second item
      await SpacedRepetitionService.toggleStudyItemSuspension(studyItems[1].id);

      // 6. Check statistics
      const stats = await SpacedRepetitionService.getStudyStats();
      expect(stats.total).toBe(2);
      expect(stats.suspended).toBe(1);
      expect(stats.due).toBe(0);
    });
  });

  // Show results after a delay to allow async tests to complete
  setTimeout(() => {
    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! The spaced repetition feature is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.');
    }
  }, 2000);
}

// Export for use in other test runners
export { runTests };

// Auto-run if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  (window as any).runSpacedRepetitionTests = runTests;
} else if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { runTests };
}
