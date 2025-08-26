# Spaced Repetition Feature Test Suite

This directory contains comprehensive tests for the spaced repetition functionality in your Study Notebook application.

## Test Files

### 1. Unit Tests (`spaced-repetition.test.ts`)
Comprehensive unit tests covering all aspects of the `SpacedRepetitionService`:
- Database operations and schema validation
- Study item creation and management
- Review functionality with different ratings
- Suspension and reset capabilities
- Statistics and reporting
- Error handling and edge cases

### 2. End-to-End Tests (`e2e/spaced-repetition.spec.ts`)
Playwright-based E2E tests that verify the complete user workflow:
- Creating notes with study blocks
- Navigating study mode
- Reviewing items with different ratings
- Managing study item states
- Verifying UI interactions

### 3. Browser Console Tests (`browser-console-test.js`)
JavaScript code that can be run directly in the browser console to test the feature:
- Quick verification of service availability
- Database health checks
- Performance testing
- Manual verification guidance

### 4. Test Runner (`scripts/test-spaced-repetition.js`)
Automated test runner script that orchestrates all tests:
- Dependency checking
- Test execution
- Results reporting
- Error handling

## Running the Tests

### Option 1: Automated Test Runner (Recommended)

```bash
# Make the script executable (Unix/Linux/macOS)
chmod +x scripts/test-spaced-repetition.js

# Run the complete test suite
node scripts/test-spaced-repetition.js
```

### Option 2: Individual Test Execution

#### Unit Tests (if Jest is available)
```bash
# Install Jest if not already installed
npm install --save-dev jest @types/jest

# Run unit tests
npx jest tests/spaced-repetition.test.ts --verbose
```

#### E2E Tests (if Playwright is available)
```bash
# Install Playwright if not already installed
npm install --save-dev @playwright/test

# Install browsers
npx playwright install

# Run E2E tests
npx playwright test tests/e2e/spaced-repetition.spec.ts
```

### Option 3: Browser Console Testing

1. Open your application in a browser
2. Open the browser's developer console (F12)
3. Copy and paste the contents of `tests/browser-console-test.js`
4. Press Enter to run the tests
5. Review the test results in the console

## What the Tests Verify

### Core Functionality
- ✅ Study item creation from "who" and "what" blocks
- ✅ Proper storage in database with correct relationships
- ✅ Due item calculation and filtering
- ✅ Review process with rating-based intervals
- ✅ Next review time calculations

### Rating System
- ✅ **Again**: Review tomorrow (0 days)
- ✅ **Hard**: Review in 1 day
- ✅ **Good**: Review in 3 days
- ✅ **Easy**: Review in 1 week

### Management Features
- ✅ Study item suspension/unsuspension
- ✅ Progress reset functionality
- ✅ Statistics calculation and display
- ✅ Folder-based filtering

### Database Operations
- ✅ Schema validation
- ✅ Connection management
- ✅ Data persistence
- ✅ Error handling

## Test Data

The tests use mock data that represents:
- A test note with multiple block types
- A test folder structure
- Study items with various states
- Realistic content for testing

## Expected Test Results

When all tests pass, you should see:
```
🎉 All tests passed! The spaced repetition feature is working correctly.
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Ensure the database is properly initialized
   - Check browser storage permissions
   - Verify Dexie is working correctly

2. **Missing Dependencies**
   - Install required packages: `ts-fsrs`, `dexie`
   - Check that all imports are resolving correctly

3. **Test Environment Issues**
   - Ensure you're running tests in the correct environment
   - Check that the database can be reset between tests

### Debug Commands

The spaced repetition service provides several debug functions available in the browser console:

```javascript
// Check database status
debugDatabase()

// Get detailed database information
getDatabaseStatus()

// Initialize/reset database
initializeDatabase()

// Check database schema
checkDatabaseHealth()

// Reset database completely (use with caution)
resetDatabase()
```

## Manual Testing Checklist

Even with automated tests, it's good to manually verify:

1. **Create a note** with "who" and "what" blocks
2. **Navigate to study mode** and verify items appear
3. **Review items** with different ratings
4. **Check next review times** are calculated correctly
5. **Test suspension** and reset functionality
6. **Verify persistence** across browser sessions

## Contributing

When adding new features to the spaced repetition system:

1. Add corresponding unit tests
2. Update E2E tests if UI changes are involved
3. Ensure all tests pass before merging
4. Update this README if test procedures change

## Performance Considerations

The tests include performance checks to ensure:
- Database operations complete within reasonable time
- UI interactions are responsive
- Memory usage remains stable during testing

## Security Notes

- Tests use isolated test data
- Database is reset between test runs
- No production data is accessed during testing
- Debug functions are only available in development mode
