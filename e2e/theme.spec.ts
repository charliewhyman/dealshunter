import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
    test('respects system preference for dark mode', async ({ page }) => {
        // Light mode
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/');

        // Check background color for light mode (gray-50 is #f9fafb or similar)
        // We can just check it's not the dark one.
        const mainDiv = page.locator('div.min-h-screen').first();
        const lightBg = await mainDiv.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });

        // Dark mode
        await page.emulateMedia({ colorScheme: 'dark' });
        // might need reload or just wait for style recalc
        // responsive tailwind usually updates on media query change immediately
        await page.waitForTimeout(500);

        const darkBg = await mainDiv.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });

        expect(lightBg).not.toBe(darkBg);
        // dark:bg-gray-950 is usually very dark (e.g. rgb(3, 7, 18))
        // light bg-gray-50 is very light (e.g. rgb(249, 250, 251))
    });
});
