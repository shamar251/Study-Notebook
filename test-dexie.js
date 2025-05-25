// Simple script to test Dexie database functionality
const Dexie = require('dexie');

// Create a test database
const testDb = new Dexie('TestDatabase');

// Define schema
testDb.version(1).stores({
  items: '++id, name, category'
});

// Function to test basic CRUD operations
async function testDexieOperations() {
  console.log('Starting Dexie test...');

  try {
    // Clear any existing data
    await testDb.items.clear();
    console.log('Database cleared');

    // Add items
    const id1 = await testDb.items.add({ name: 'Item 1', category: 'Test' });
    const id2 = await testDb.items.add({ name: 'Item 2', category: 'Test' });
    console.log(`Added items with IDs: ${id1}, ${id2}`);

    // Get all items
    const allItems = await testDb.items.toArray();
    console.log('All items:', allItems);

    // Get item by ID
    const item = await testDb.items.get(id1);
    console.log('Item by ID:', item);

    // Update item
    await testDb.items.update(id1, { name: 'Updated Item 1' });
    const updatedItem = await testDb.items.get(id1);
    console.log('Updated item:', updatedItem);

    // Delete item
    await testDb.items.delete(id2);
    const remainingItems = await testDb.items.toArray();
    console.log('Remaining items after deletion:', remainingItems);

    // Query by index
    const testItems = await testDb.items.where('category').equals('Test').toArray();
    console.log('Items with category "Test":', testItems);

    console.log('Dexie test completed successfully!');
  } catch (error) {
    console.error('Error during Dexie test:', error);
  } finally {
    // Clean up
    await testDb.delete();
    console.log('Test database deleted');
  }
}

// Run the test
testDexieOperations();
