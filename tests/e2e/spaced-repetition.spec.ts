import { test, expect } from '@playwright/test';

test.describe('Spaced Repetition Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 10000 });
  });

  test('should create study items from blocks', async ({ page }) => {
    // Create a new note with study blocks
    await page.click('[data-testid="add-note-button"]');

    // Add a "who" block
    await page.click('[data-testid="add-block-button"]');
    await page.selectOption('[data-testid="block-type-selector"]', 'who');
    await page.fill('[data-testid="block-content-input"]', 'Who is the main character?');
    await page.click('[data-testid="save-block-button"]');

    // Add a "what" block
    await page.click('[data-testid="add-block-button"]');
    await page.selectOption('[data-testid="block-type-selector"]', 'what');
    await page.fill('[data-testid="block-content-input"]', 'What happened in the story?');
    await page.click('[data-testid="save-block-button"]');

    // Save the note
    await page.click('[data-testid="save-note-button"]');

    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Verify study items were created
    await expect(page.locator('[data-testid="study-item"]')).toHaveCount(2);
  });

  test('should display due study items', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Check if due items are displayed
    const dueItems = page.locator('[data-testid="due-study-item"]');
    await expect(dueItems.first()).toBeVisible();

    // Verify due count is displayed
    const dueCount = page.locator('[data-testid="due-count"]');
    await expect(dueCount).toBeVisible();
  });

  test('should allow reviewing study items', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Click on first study item to start review
    await page.click('[data-testid="study-item"]:first-child');

    // Verify review interface is shown
    await expect(page.locator('[data-testid="review-interface"]')).toBeVisible();

    // Rate the item as "Good"
    await page.click('[data-testid="rating-good"]');

    // Verify item is no longer due
    await expect(page.locator('[data-testid="due-study-item"]')).toHaveCount(0);
  });

  test('should handle different rating responses', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Start review
    await page.click('[data-testid="study-item"]:first-child');

    // Test "Again" rating
    await page.click('[data-testid="rating-again"]');
    await expect(page.locator('[data-testid="next-review-tomorrow"]')).toBeVisible();

    // Start another review
    await page.click('[data-testid="study-item"]:first-child');

    // Test "Easy" rating
    await page.click('[data-testid="rating-easy"]');
    await expect(page.locator('[data-testid="next-review-week"]')).toBeVisible();
  });

  test('should suspend and unsuspend study items', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Suspend first study item
    await page.hover('[data-testid="study-item"]:first-child');
    await page.click('[data-testid="suspend-button"]');

    // Verify item is suspended
    await expect(page.locator('[data-testid="suspended-study-item"]')).toBeVisible();

    // Unsuspend the item
    await page.hover('[data-testid="suspended-study-item"]');
    await page.click('[data-testid="unsuspend-button"]');

    // Verify item is no longer suspended
    await expect(page.locator('[data-testid="suspended-study-item"]')).not.toBeVisible();
  });

  test('should reset study item progress', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Review an item first
    await page.click('[data-testid="study-item"]:first-child');
    await page.click('[data-testid="rating-good"]');

    // Verify item is no longer due
    await expect(page.locator('[data-testid="due-study-item"]')).toHaveCount(0);

    // Reset the item
    await page.hover('[data-testid="study-item"]:first-child');
    await page.click('[data-testid="reset-button"]');

    // Verify item is due again
    await expect(page.locator('[data-testid="due-study-item"]')).toHaveCount(1);
  });

  test('should display study statistics', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Check statistics are displayed
    await expect(page.locator('[data-testid="total-study-items"]')).toBeVisible();
    await expect(page.locator('[data-testid="due-study-items"]')).toBeVisible();
    await expect(page.locator('[data-testid="suspended-study-items"]')).toBeVisible();
  });

  test('should filter study items by folder', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Select a specific folder
    await page.click('[data-testid="folder-selector"]');
    await page.click('[data-testid="folder-option"]:first-child');

    // Verify only items from that folder are shown
    const studyItems = page.locator('[data-testid="study-item"]');
    await expect(studyItems).toHaveCount(1); // Assuming only one note in the folder
  });

  test('should handle empty study state', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // If no study items exist, show appropriate message
    const emptyState = page.locator('[data-testid="empty-study-state"]');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toContainText('No study items available');
      await expect(page.locator('[data-testid="create-study-items-button"]')).toBeVisible();
    }
  });

  test('should maintain study progress across sessions', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Review an item
    await page.click('[data-testid="study-item"]:first-child');
    await page.click('[data-testid="rating-good"]');

    // Refresh the page
    await page.reload();

    // Navigate back to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Verify the reviewed item is not due
    await expect(page.locator('[data-testid="due-study-item"]')).toHaveCount(0);
  });

  test('should show correct next review times', async ({ page }) => {
    // Navigate to study mode
    await page.click('[data-testid="study-mode-button"]');

    // Start review
    await page.click('[data-testid="study-item"]:first-child');

    // Rate as "Hard" (1 day)
    await page.click('[data-testid="rating-hard"]');

    // Verify next review time is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString();

    await expect(page.locator('[data-testid="next-review-time"]')).toContainText(tomorrowStr);
  });
});
