import { expect, test } from '@playwright/test';

/**
 * Smoke test: the app loads, the brand shows, and unauthenticated users
 * are redirected to /auth. Real user journeys ship with Issue 8.2.
 */
test('redirects unauthenticated visitors to /auth', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});
