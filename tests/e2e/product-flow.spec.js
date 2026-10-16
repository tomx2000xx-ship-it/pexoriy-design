import { test, expect } from '@playwright/test';

async function enterApp(page, path = '/', marketMode = 'live') {
  await page.route('**/api/markets', async route => {
    const stale = marketMode === 'stale';
    const markets = [
      { symbol: 'BTC/USDT', name: 'Bitcoin', price: stale ? null : 67482.2, change24h: stale ? null : 2.84, updatedAt: stale ? null : new Date().toISOString(), status: stale ? 'stale' : 'live' },
      { symbol: 'ETH/USDT', name: 'Ethereum', price: stale ? null : 3521.84, change24h: stale ? null : 1.26, updatedAt: stale ? null : new Date().toISOString(), status: stale ? 'stale' : 'live' },
      { symbol: 'SOL/USDT', name: 'Solana', price: stale ? null : 182.67, change24h: stale ? null : -0.48, updatedAt: stale ? null : new Date().toISOString(), status: stale ? 'stale' : 'live' },
      { symbol: 'DOGE/USDT', name: 'Dogecoin', price: stale ? null : 0.1642, change24h: stale ? null : 4.12, updatedAt: stale ? null : new Date().toISOString(), status: stale ? 'stale' : 'live' },
      { symbol: 'GRAM/USDT', name: 'Gram', price: stale ? null : 5.42, change24h: stale ? null : -1.18, updatedAt: stale ? null : new Date().toISOString(), status: stale ? 'stale' : 'live' },
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'test-fixture', quoteCurrency: 'USD', markets }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('pexoriy-demo-entered', '1');
    localStorage.setItem('pexoriy-onboarding-complete', '1');
  });
  await page.goto(path);
}

async function goTo(page, label) {
  const mobile = (page.viewportSize()?.width || 1200) <= 600;
  if (mobile && label === 'Activity') {
    await page.locator('.topbar').getByRole('button', { name: 'Activity', exact: true }).click();
    return;
  }
  const mobileLabels = { 'Practice Trading': 'Practice', 'AI Trading': 'AI Centre' };
  const visibleLabel = mobile ? (mobileLabels[label] || label) : label;
  const nav = mobile
    ? page.locator('.mobile-bottom-nav')
    : page.locator('.sidebar');
  await nav.getByRole('button', { name: visibleLabel, exact: true }).click();
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

test('stale market data disables new practice orders', async ({ page }) => {
  await enterApp(page, '/', 'stale');
  await goTo(page, 'Practice Trading');
  await expect(page.getByRole('heading', { name: 'Practice Trading' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review Buy \/ Long order/ })).toBeDisabled();
  await expect(page.getByText(/Live market data is unavailable/).first()).toBeVisible();
});

test('AI session lifecycle, trade open/close, and Activity Centre ledger work', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'AI Trading');
  await expect(page.getByText('READY TO START')).toBeVisible();

  await page.getByRole('button', { name: /Start AI session/ }).click();
  await expect(page.getByText('ACTIVE · AWAITING ACTION')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
  await expect(page.getByText(/No new AI trade actions can be confirmed until you resume/).first()).toBeVisible();
  await page.getByRole('button', { name: /Resume session/ }).click();
  await expect(page.getByText('ACTIVE · AWAITING ACTION')).toBeVisible();

  await page.getByRole('button', { name: /Review AI trade/ }).click();
  await expect(page.locator('.ai-action-review')).toBeVisible();
  await expect(page.getByText('1.5 AC', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm trade' }).click();
  await expect(page.getByText(/Simulated position opened/)).toBeVisible();

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('STOPPED', { exact: true })).toBeVisible();

  await goTo(page, 'Practice Trading');
  await expect(page.getByText('AI-assisted position', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review close' }).click();
  await expect(page.getByRole('dialog', { name: 'Review your exit' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm close' }).click();
  await expect(page.getByText(/Position closed/)).toBeVisible();

  await goTo(page, 'Activity');
  await expect(page.getByRole('heading', { name: 'Your activity, in one place.' })).toBeVisible();
  await expect(page.getByText('AI session started')).toBeVisible();
  await expect(page.getByText('AI session paused')).toBeVisible();
  await expect(page.getByText('AI session resumed')).toBeVisible();
  await expect(page.getByText('AI-assisted position opened')).toBeVisible();
  await expect(page.getByText('AI-assisted position closed')).toBeVisible();
  await expect(page.getByText('AI session stopped')).toBeVisible();
});

test('AI trading blocks a proposed action when AI Credit balance is insufficient', async ({ page }) => {
  await enterApp(page, '/?e2e=low-balance');
  await goTo(page, 'AI Trading');
  await expect(page.locator('.ai-balance-purchase strong')).toContainText('0');
  await page.getByRole('button', { name: /Start AI session/ }).click();
  await page.getByRole('button', { name: /Review AI trade/ }).click();
  await expect(page.getByText(/Not enough AI Credits/)).toBeVisible();
  await expect(page.locator('.ai-action-review')).toHaveCount(0);
  await expect(page.locator('.ai-balance-purchase strong')).toContainText('0');
});

test('AI Credit Store separates the USD package price from the exact SOL quote and requires sign-in', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'AI Trading');
  await page.getByRole('button', { name: /Buy more AI Credits/ }).click();

  await expect(page.getByRole('heading', { name: 'Power your next AI session.' })).toBeVisible();
  const entryPackage = page.locator('.ai-package-card').first();
  await expect(entryPackage.locator('.ai-package-payment strong')).toContainText('$5');
  await expect(entryPackage.locator('.ai-package-payment strong')).toContainText('USD');
  await expect(entryPackage.locator('.ai-package-payment')).toContainText('Exact SOL quote at checkout');
  await expect(page.locator('.ai-store-selected-summary button')).toContainText('Sign in to buy AI Credits');
});

test('AI Credit Store restores an existing pending Solana order after navigation', async ({ page }) => {
  await page.route('**/api/me', async route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'test-user', email: 'tester@example.com', displayName: 'Tester', balances: { TC: 12450, AC: 840, PXY: 0 } } })
  }));
  await page.route('**/api/payments/solana/config', async route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ enabled: true, network: 'solana-mainnet', asset: 'SOL', quoteCurrency: 'USD' })
  }));
  await page.route('**/api/payments/solana/orders', async route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ orders: [{
      id: 'order-restore-001',
      network: 'solana-mainnet',
      asset: 'SOL',
      status: 'pending',
      expectedAmountAtoms: 12300000,
      amountSol: '0.0123',
      aiCredits: 70,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      txHash: null,
      createdAt: new Date().toISOString(),
      paymentUrl: 'solana:11111111111111111111111111111111?amount=0.0123&reference=11111111111111111111111111111111'
    }] })
  }));
  await page.route('**/api/payments/solana/verify', async route => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'pending', message: 'No matching finalized payment was found yet. You can safely check again.' })
  }));

  await enterApp(page);
  await goTo(page, 'AI Trading');
  await page.getByRole('button', { name: /Buy more AI Credits/ }).click();

  await expect(page.locator('.ai-store-payment-order')).toBeVisible();
  await expect(page.locator('.ai-store-order-amount')).toContainText('0.0123 SOL');
  await expect(page.locator('.ai-store-order-status')).toContainText('PENDING');
  await page.getByRole('button', { name: 'I’ve paid — verify' }).click();
  await expect(page.getByText('No matching finalized payment was found yet.')).toBeVisible();
});

test('authenticated practice orders persist through the server API and settle the ledger balance', async ({ page }) => {
  let tc = 12450;
  let openPosition = null;
  let closedHistory = [];
  const openedAt = new Date().toISOString();
  await page.route('**/api/me', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'account-user', email: 'account@example.com', displayName: 'Account User', balances: { TC: tc, AC: 840, PXY: 0 } } })
  }));
  await page.route('**/api/trading/positions', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: openPosition ? [openPosition] : [] }) });
    }
    const body = route.request().postDataJSON();
    tc -= body.allocationTc;
    openPosition = {
      id: 'position-server-001', symbol: body.symbol, market: body.symbol, side: body.side, direction: body.side === 'long' ? 'Long' : 'Short',
      status: 'open', leverage: 1, quantity_atoms: body.allocationTc * 1000000, entry_price_micros: 67482200000,
      mark_price_micros: 67482200000, reserved_tc: body.allocationTc, amount: body.allocationTc, entry: 67482.2,
      markPrice: 67482.2, realized_pnl_tc: 0, opened_at: openedAt, openedAt, time: '04:20 AM', aiManaged: false
    };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ order: { id: 'order-server-001' }, position: openPosition }) });
  });
  await page.route('**/api/trading/history', async route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ history: closedHistory })
  }));
  await page.route('**/api/trading/positions/close', async route => {
    const returned = Number(openPosition?.reserved_tc || 0) + 4;
    tc += returned;
    const closed = {
      ...openPosition, status: 'closed', exit: 68000, mark_price_micros: 68000000000,
      realizedPnl: 4, realized_pnl_tc: 4, tcReturned: returned, closedAtIso: new Date().toISOString()
    };
    closedHistory = [{
      id: closed.id, market: closed.market, direction: closed.direction, amount: closed.amount,
      entry: closed.entry, exit: closed.exit, realizedPnl: 4, tcReturned: returned,
      time: '04:20 AM', closedAt: '04:21 AM', closedAtIso: closed.closedAtIso
    }];
    openPosition = null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ closed: true, position: closed }) });
  });

  await enterApp(page);
  await goTo(page, 'Practice Trading');
  await expect(page.getByRole('heading', { name: 'Practice Trading' })).toBeVisible();
  await page.getByRole('button', { name: /Review Buy \/ Long order/ }).click();
  await page.getByRole('button', { name: /Confirm simulated entry/ }).click();
  await expect(page.getByText('Practice position', { exact: false })).toBeVisible();
  await expect(page.getByText('11,950', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Review close' }).click();
  await page.getByRole('button', { name: 'Confirm close' }).click();
  await expect(page.getByText('Position closed and settlement recorded.')).toBeVisible();
  await expect(page.getByText('+4 TC', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('12,454', { exact: false }).first()).toBeVisible();
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
