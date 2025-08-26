import { SpacedRepetitionService } from '../lib/spaced-repetition';
import { db } from '../lib/db';

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

describe('SpacedRepetitionService', () => {
  let service: SpacedRepetitionService;

  beforeEach(() => {
    service = new SpacedRepetitionService();
  });

  afterEach(async () => {
    // Clean up database after each test
    try {
      await db.delete();
      await db.open();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Database Operations', () => {
    test('should check database schema correctly', () => {
      expect(db.verno).toBeGreaterThan(0);
      expect(db.tables).toBeDefined();
    });

    test('should ensure database is ready', async () => {
      await expect(db.open()).resolves.not.toThrow();
      expect(db.isOpen()).toBe(true);
    });

    test('should get database status', async () => {
      await db.open();
      const status = await service.getDatabaseStatus();
      expect(status).toBeDefined();
      expect(status.notesCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Study Item Creation', () => {
    test('should create study items from blocks', async () => {
      await db.open();

      // Add test data
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);

      // Create study items
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      expect(studyItems).toHaveLength(2); // Only 'who' and 'what' blocks should create study items
      expect(studyItems[0].blockId).toBe('block-1');
      expect(studyItems[1].blockId).toBe('block-2');
    });

    test('should not create study items for non-study block types', async () => {
      await db.open();

      // Add test data
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);

      // Create study items
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      // 'note' type blocks should not create study items
      const noteBlockStudyItem = studyItems.find(item => item.blockId === 'block-3');
      expect(noteBlockStudyItem).toBeUndefined();
    });

    test('should store study items in note studyStats', async () => {
      await db.open();

      // Add test data
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);

      // Create study items
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      // Verify study items are stored
      const storedItems = await service.getAllStudyItems();
      expect(storedItems).toHaveLength(2);
    });
  });

  describe('Study Item Retrieval', () => {
    test('should get all study items', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      const allItems = await service.getAllStudyItems();
      expect(allItems).toHaveLength(2);
    });

    test('should get due study items', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      const dueItems = await service.getDueStudyItems();
      expect(dueItems).toHaveLength(2); // All new items should be due
    });
  });

  describe('Study Item Review', () => {
    test('should review study item with Good rating', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      // Review first item
      const reviewResult = await service.reviewStudyItem(studyItems[0].id, 'Good');

      expect(reviewResult.success).toBe(true);
      expect(reviewResult.nextReview).toBeDefined();
    });

    test('should update next review time in database', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      // Review item
      await service.reviewStudyItem(studyItems[0].id, 'Good');

      // Check database was updated
      const updatedItem = await service.getStudyItem(studyItems[0].id);
      expect(updatedItem).toBeDefined();
      expect(updatedItem!.nextReview).toBeGreaterThan(Date.now());
    });
  });

  describe('Study Item Management', () => {
    test('should toggle study item suspension', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      // Suspend item
      await service.toggleStudyItemSuspension(studyItems[0].id);

      // Check suspension status
      const suspendedItem = await service.getStudyItem(studyItems[0].id);
      expect(suspendedItem!.suspended).toBe(true);

      // Unsuspend item
      await service.toggleStudyItemSuspension(studyItems[0].id);

      // Check suspension status
      const unsuspendedItem = await service.getStudyItem(studyItems[0].id);
      expect(unsuspendedItem!.suspended).toBe(false);
    });

    test('should get study statistics', async () => {
      await db.open();

      // Add test data and create study items
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);
      await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);

      const stats = await service.getStudyStatistics();
      expect(stats.totalItems).toBe(2);
      expect(stats.dueItems).toBe(2);
      expect(stats.suspendedItems).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await db.close();

      try {
        await service.getAllStudyItems();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Full Workflow', () => {
    test('should complete full study workflow', async () => {
      await db.open();

      // Add test data
      await db.folders.add(mockFolder);
      await db.notes.add(mockNote);

      // Create study items
      const studyItems = await service.createStudyItemsFromBlocks(mockNote.blocks, mockNote.id);
      expect(studyItems).toHaveLength(2);

      // Review items
      await service.reviewStudyItem(studyItems[0].id, 'Good');
      await service.reviewStudyItem(studyItems[1].id, 'Again');

      // Check final state
      const finalStats = await service.getStudyStatistics();
      expect(finalStats.totalItems).toBe(2);
      expect(finalStats.dueItems).toBe(1); // 'Again' rating should keep item due
    });
  });
});
