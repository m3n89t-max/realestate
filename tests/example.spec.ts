import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    // Update this to match your actual page title when ready
    await expect(page).toHaveTitle(/./);
});

test('can navigate', async ({ page }) => {
    await page.goto('/');

    // Add more assertions here depending on your home page structure
    const body = page.locator('body');
    await expect(body).toBeVisible();
});
