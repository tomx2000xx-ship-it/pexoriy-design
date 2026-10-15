import { test, expect } from '@playwright/test';

async function enterApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem('pexoriy-demo-entered', '1');
    localStorage.setItem('pexoriy-onboarding-complete', '1');
  });
  await page.goto('/');
}

async function goTo(page, label) {
  const mobile = (page.viewportSize()?.width || 1200) <= 600;
  const mobileLabels = { 'Practice Trading': 'Practice', 'AI Trading': 'AI Centre' };
  const visibleLabel = mobile ? (mobileLabels[label] || label) : label;
  await page.getByRole('button', { name: visibleLabel, exact: true }).first().click();
}

test('Practice visibly connects to AI Trading and blocks over-balance orders', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'Practice Trading');
  await expect(page.getByRole('heading', { name: 'Practice Trading' })).toBeVisible();
  const bridge = page.getByRole('region', { name: 'Switch to AI Trading' });
  await expect(bridge).toBeVisible();
  await expect(bridge.getByRole('button', { name: /Explore AI Trading/ })).toBeVisible();

  const amount = page.getByLabel('Trade Credit allocation');
  await amount.fill('99999999');
  await expect(page.getByRole('button', { name: /Review Buy \/ Long order/ })).toBeDisabled();
  await bridge.getByRole('button', { name: /Explore AI Trading/ }).click();
  await expect(page.getByRole('heading', { name: /AI-assisted practice/ })).toBeVisible();
});

test('AI session lifecycle, trade open/close, and Activity Centre ledger work', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'AI Trading');
  await expect(page.getByText('READY TO START')).toBeVisible();

  await page.getByRole('button', { name: /Start AI session/ }).click();
  await expect(page.getByText('ACTIVE · AWAITING ACTION')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
  await expect(page.getByText(/No new AI trade actions can be confirmed until you resume/)).toBeVisible();
  await page.getByRole('button', { name: /Resume session/ }).click();
  await expect(page.getByText('ACTIVE · AWAITING ACTION')).toBeVisible();

  await page.getByRole('button', { name: /Review AI trade/ }).click();
  await expect(page.locator('.ai-action-review')).toBeVisible();
  await expect(page.getByText('1.5 AC', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm trade' }).click();
  await expect(page.getByText(/Simulated position opened/)).toBeVisible();

  await goTo(page, 'Practice Trading');
  await expect(page.getByText('AI-assisted position', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review close' }).click();
  await expect(page.getByRole('dialog', { name: 'Review your exit' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm close' }).click();
  await expect(page.getByText(/Position closed/)).toBeVisible();
  await expect(page.getByText('AI-assisted position closed', { exact: false })).toHaveCount(0);

  await goTo(page, 'AI Trading');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('STOPPED', { exact: true })).toBeVisible();
  await goTo(page, 'Activity');
  await expect(page.getByRole('heading', { name: 'Your activity, in one place.' })).toBeVisible();
  await expect(page.getByText('AI session started')).toBeVisible();
  await expect(page.getByText('AI session paused')).toBeVisible();
  await expect(page.getByText('AI session resumed')).toBeVisible();
  await expect(page.getByText('AI-assisted position opened')).toBeVisible();
  await expect(page.getByText('AI-assisted position closed')).toBeVisible();
  await expect(page.getByText('AI session stopped')).toBeVisible();
});

test('mobile layout stays within the viewport on Practice and AI Trading', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile viewport is covered by the mobile Chromium project.');
  await enterApp(page);
  for (const label of ['Practice Trading', 'AI Trading']) {
    await goTo(page, label);
    await expect(page.locator('body')).toBeVisible();
    const sizes = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth
    }));
    expect(sizes.page, `horizontal overflow on ${label}: ${JSON.stringify(sizes)}`).toBeLessThanOrEqual(sizes.viewport + 1);
  }
});
