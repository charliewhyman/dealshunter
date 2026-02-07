import { test, expect } from '@playwright/test';

test.describe('Responsiveness', () => {
    test('desktop layout shows filters sidebar', async ({ page }) => {
        // Desktop viewport
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Check if filter sidebar is visible
        // "Filters" heading is hidden on specific viewports but visible on desktop?
        // In HomePage.tsx: <h3 className="font-semibold ... hidden lg:block">Filters</h3>
        const filterHeading = page.getByRole('heading', { name: 'Filters' });
        await expect(filterHeading).toBeVisible();

        // Check grid layout (approximate check by class or structure)
        // We expect multiple columns
        const gridContainer = page.locator('[data-grid-container]');
        await expect(gridContainer).toHaveClass(/lg:grid-cols-4/);
    });

    test('mobile layout hides filters sidebar initially', async ({ page }) => {
        // Mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');

        // Filter heading should be hidden or inside a closed drawer
        const filterHeading = page.getByRole('heading', { name: 'Filters' });
        await expect(filterHeading).not.toBeVisible();

        // Toggle button should be visible
        const toggleButton = page.getByRole('button', { name: 'Toggle filter panel' });
        await expect(toggleButton).toBeVisible();

        // Open filters
        await toggleButton.click();

        // Now heading should be visible (if it's in the mobile drawer)
        // The mobile drawer header: <h2 ...>Filters</h2>
        // Note: The desktop one is h3, mobile one is h2
        const mobileFilterHeading = page.getByRole('heading', { name: 'Filters', level: 2 });
        await expect(mobileFilterHeading).toBeVisible();
    });
});
