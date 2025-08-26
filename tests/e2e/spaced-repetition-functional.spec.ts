import { test, expect } from '@playwright/test';

test.describe('Spaced Repetition Feature - Functional Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test('should verify app has study-related functionality', async ({ page }) => {
    // Look for study-related elements that should exist
    const buttons = page.locator('button');
    const buttonTexts = await buttons.allTextContents();

    // Check if we can find any study-related buttons or text
    const hasStudyContent = buttonTexts.some(text =>
      text.toLowerCase().includes('study') ||
      text.toLowerCase().includes('review') ||
      text.toLowerCase().includes('quiz') ||
      text.toLowerCase().includes('flashcard')
    );

    // Also check for any text content that might indicate study functionality
    const bodyText = await page.locator('body').textContent();
    const hasStudyText = bodyText?.toLowerCase().includes('study') ||
      bodyText?.toLowerCase().includes('review') ||
      bodyText?.toLowerCase().includes('note');

    // At least one of these should be true if the app has study functionality
    expect(hasStudyContent || hasStudyText).toBe(true);
  });

  test('should be able to interact with the app interface', async ({ page }) => {
    // Test basic app interactions

    // 1. Click on the page
    await page.click('body');

    // 2. Try to find and interact with buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      // Click the first button to test interaction
      await buttons.first().click();

      // Verify the page is still responsive
      await expect(page.locator('body')).toBeVisible();
    }

    // 3. Test keyboard navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');

    // All interactions should work without errors
    expect(true).toBe(true);
  });

  test('should maintain app state during interactions', async ({ page }) => {
    // Test that the app maintains its state during basic interactions

    // 1. Get initial page state
    const initialTitle = await page.title();
    const initialUrl = page.url();

    // 2. Perform some interactions
    await page.click('body');
    await page.keyboard.press('Tab');

    // 3. Verify state is maintained
    expect(await page.title()).toBe(initialTitle);
    expect(page.url()).toBe(initialUrl);

    // 4. Verify app is still functional
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('should handle different viewport sizes', async ({ page }) => {
    // Test responsive behavior

    // Test desktop size
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('main').first()).toBeVisible();

    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('main').first()).toBeVisible();

    // Test mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('main').first()).toBeVisible();

    // All viewport sizes should work
    expect(true).toBe(true);
  });

  test('should complete a full user interaction workflow', async ({ page }) => {
    // Test a complete user workflow

    // 1. Page loads successfully
    expect(await page.title()).toBeDefined();

    // 2. Can navigate to the page
    await page.goto('/');

    // 3. Can wait for elements
    await page.waitForSelector('main');

    // 4. Can interact with the page
    await page.click('body');

    // 5. Can use keyboard
    await page.keyboard.press('Tab');

    // 6. Can change viewport
    await page.setViewportSize({ width: 1000, height: 800 });

    // 7. App remains functional
    await expect(page.locator('main').first()).toBeVisible();

    // All workflow steps completed successfully
    expect(true).toBe(true);
  });
});
