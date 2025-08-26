/**
 * Browser Console Test for Spaced Repetition Feature
 * 
 * Copy and paste this code into your browser console to test the spaced repetition functionality
 * Make sure you're on a page where the SpacedRepetitionService is available
 */

(function() {
  'use strict';
  
  console.log('🧪 Starting Spaced Repetition Feature Tests...');
  
  // Test results storage
  const testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
  };
  
  function logTest(name, passed, details = '') {
    testResults.total++;
    if (passed) {
      testResults.passed++;
      console.log(`✅ ${name} - PASSED`);
    } else {
      testResults.failed++;
      console.log(`❌ ${name} - FAILED`);
      if (details) console.log(`   Details: ${details}`);
    }
    testResults.details.push({ name, passed, details });
  }
  
  function logSection(title) {
    console.log(`\n📋 ${title}`);
    console.log('─'.repeat(title.length + 2));
  }
  
  function logSummary() {
    console.log('\n📊 Test Summary');
    console.log('─'.repeat(15));
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.details
        .filter(test => !test.passed)
        .forEach(test => console.log(`   • ${test.name}: ${test.details}`));
    } else {
      console.log('\n🎉 All tests passed! The spaced repetition feature is working correctly.');
    }
  }
  
  // Test 1: Check if service is available
  logSection('Service Availability');
  
  if (typeof window.SpacedRepetitionService !== 'undefined') {
    logTest('SpacedRepetitionService available', true);
  } else if (typeof window.debugDatabase === 'function') {
    logTest('Global debug functions available', true);
    // Try to access the service through the global scope
    window.SpacedRepetitionService = {
      checkDatabaseSchema: window.checkDatabaseHealth,
      ensureDatabaseReady: window.upgradeDatabase,
      getDatabaseStatus: window.getDatabaseStatus,
      initializeDatabase: window.initializeDatabase,
      debugDatabase: window.debugDatabase
    };
  } else {
    logTest('SpacedRepetitionService available', false, 'Service not found in global scope');
    console.log('⚠️  Make sure you\'re on a page where the spaced repetition service is loaded');
    return;
  }
  
  // Test 2: Database operations
  logSection('Database Operations');
  
  try {
    const schemaCheck = window.SpacedRepetitionService.checkDatabaseSchema();
    logTest('Database schema check', typeof schemaCheck === 'boolean', `Result: ${schemaCheck}`);
  } catch (error) {
    logTest('Database schema check', false, error.message);
  }
  
  // Test 3: Database initialization
  logSection('Database Initialization');
  
  try {
    const initPromise = window.SpacedRepetitionService.initializeDatabase();
    if (initPromise && typeof initPromise.then === 'function') {
      logTest('Database initialization method', true, 'Returns Promise');
      
      // Test async initialization
      initPromise.then(result => {
        logTest('Database initialization result', typeof result === 'boolean', `Result: ${result}`);
      }).catch(error => {
        logTest('Database initialization execution', false, error.message);
      });
    } else {
      logTest('Database initialization method', false, 'Does not return Promise');
    }
  } catch (error) {
    logTest('Database initialization method', false, error.message);
  }
  
  // Test 4: Database status
  logSection('Database Status');
  
  try {
    const statusPromise = window.SpacedRepetitionService.getDatabaseStatus();
    if (statusPromise && typeof statusPromise.then === 'function') {
      logTest('Database status method', true, 'Returns Promise');
      
      statusPromise.then(status => {
        if (status && typeof status === 'object') {
          logTest('Database status structure', true, 'Valid status object');
          console.log('   Database Status:', status);
        } else {
          logTest('Database status structure', false, 'Invalid status object');
        }
      }).catch(error => {
        logTest('Database status execution', false, error.message);
      });
    } else {
      logTest('Database status method', false, 'Does not return Promise');
    }
  } catch (error) {
    logTest('Database status method', false, error.message);
  }
  
  // Test 5: Debug functions
  logSection('Debug Functions');
  
  try {
    const debugPromise = window.SpacedRepetitionService.debugDatabase();
    if (debugPromise && typeof debugPromise.then === 'function') {
      logTest('Debug database method', true, 'Returns Promise');
    } else {
      logTest('Debug database method', false, 'Does not return Promise');
    }
  } catch (error) {
    logTest('Debug database method', false, error.message);
  }
  
  // Test 6: Check for required dependencies
  logSection('Dependencies Check');
  
  // Check if ts-fsrs Rating enum is available
  if (typeof window.Rating !== 'undefined') {
    logTest('ts-fsrs Rating enum', true, 'Available in global scope');
  } else {
    logTest('ts-fsrs Rating enum', false, 'Not available in global scope');
  }
  
  // Check if Dexie is available
  if (typeof window.Dexie !== 'undefined') {
    logTest('Dexie database', true, 'Available in global scope');
  } else {
    logTest('Dexie database', false, 'Not available in global scope');
  }
  
  // Test 7: Manual verification prompts
  logSection('Manual Verification');
  
  console.log('🔍 To manually verify the feature is working:');
  console.log('1. Create a note with "who" and "what" blocks');
  console.log('2. Navigate to study mode');
  console.log('3. Check if study items are created');
  console.log('4. Try reviewing items with different ratings');
  console.log('5. Verify next review times are calculated correctly');
  
  // Test 8: Performance check
  logSection('Performance Check');
  
  const startTime = performance.now();
  try {
    // Try to call a simple method
    const schemaCheck = window.SpacedRepetitionService.checkDatabaseSchema();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (duration < 100) {
      logTest('Performance check', true, `Schema check took ${duration.toFixed(2)}ms`);
    } else {
      logTest('Performance check', false, `Schema check took ${duration.toFixed(2)}ms (slow)`);
    }
  } catch (error) {
    logTest('Performance check', false, error.message);
  }
  
  // Wait a bit for async tests to complete, then show summary
  setTimeout(() => {
    logSummary();
    
    // Provide helpful commands for further testing
    console.log('\n🔧 Useful console commands for further testing:');
    console.log('• debugDatabase() - Check database status');
    console.log('• getDatabaseStatus() - Get detailed database info');
    console.log('• initializeDatabase() - Initialize database');
    console.log('• checkDatabaseHealth() - Check database schema');
    
    // Store results in global scope for inspection
    window.spacedRepetitionTestResults = testResults;
    console.log('\n💾 Test results stored in window.spacedRepetitionTestResults');
    
  }, 2000); // Wait 2 seconds for async operations
  
})();
