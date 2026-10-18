import { test, expect } from '@playwright/test';

async function enterApp(page, path = '/', marketMode = 'live', workspaceMode = 'demo') {
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
  await page.addInitScript((mode) => {
    localStorage.setItem('pexoriy-demo-entered', '1');
    localStorage.setItem('pexoriy-workspace-mode', mode);
    localStorage.setItem('pexoriy-onboarding-complete', '1');
  }, workspaceMode);
  await page.goto(path);
}

async function goTo(page, label) {
  const mobile = (page.viewportSize()?.width || 1200) <= 600;
  if (mobile && label === 'Activity') {
    await page.locator('.topbar').getByRole('button', { name: 'Activity', exact: true }).click();
    return;
  }
  const mobileLabels = { 'Practice Trading': 'Practice', 'AI Trading': 'AI Centre', 'Community Challenges': 'Challenges', 'Invite & Grow': 'Invite', 'Referrals': 'Invite' };
  if (mobile && ['Learning Center', 'PXY Pre-sale', 'PXY Presale Preview'].includes(label)) {
    await page.locator('.menu-button').click();
    await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
    return;
  }
  const visibleLabel = mobile ? (mobileLabels[label] || label) : label;
  const nav = mobile
    ? page.locator('.mobile-bottom-nav')
    : page.locator('.sidebar');
  await nav.getByRole('button', { name: visibleLabel, exact: true }).click();
}

test('daily check-in is persisted through the server and refreshes the account streak', async ({ page }) => {
  let balance = 1000;
  let postCount = 0;
  await page.route('**/api/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'checkin-user', email: 'checkin@example.test', displayName: 'Check-in User', balances: { TC: balance, AC: 10, PXY: 0 } } }) }));
  await page.route('**/api/trading/positions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }));
  await page.route('**/api/trading/history', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/missions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missions: [] }) }));
  await page.route('**/api/learning', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lessons: [], completed: 0 }) }));
  await page.route('**/api/checkins', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkedInToday: false, streakDays: 2, rewardTC: 50, history: [] }) });
      return;
    }
    postCount += 1;
    balance = 1050;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'checked_in', duplicate: false, checkedInToday: true, streakDays: 3, rewardTC: 50 }) });
  });
  await enterApp(page, '/', 'live', 'account');
  await expect(page.getByText('2 day streak')).toBeVisible();
  await page.getByRole('button', { name: 'Check in · +50 TC' }).click();
  await expect(page.getByRole('button', { name: 'Checked in' })).toBeDisabled();
  await expect(page.getByText('+50 TC added to your account.')).toBeVisible();
  expect(postCount).toBe(1);
});

test('registration signs in immediately while email verification and recovery remain deferred', async ({ page }) => {
  await page.route('**/api/auth/register', route => route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({user:{id:'test-user',email:'verified@example.test',displayName:'Verified User',balances:{TC:12450,AC:840,PXY:0}}})}));
  await page.goto('/');
  await page.getByRole('button', {name:/Log in or create account/}).click();
  await expect(page.getByRole('heading',{name:'Log in to Pexoriy'})).toBeVisible();
  await page.getByRole('button',{name:'Forgot password?'}).click();
  await expect(page.getByRole('heading',{name:'Recover your account'})).toBeVisible();
  await expect(page.getByText('Password recovery will be available after domain-based email delivery is configured.')).toBeVisible();
  await page.getByRole('button',{name:'Back to sign in'}).click();
  await page.getByRole('button',{name:'Create an account'}).click();
  await page.getByLabel('Display name').fill('Verified User');
  await page.getByLabel('Email address').fill('verified@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Verified-Test-Password-932!');
  await page.getByRole('button',{name:'Create account'}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Check your inbox'})).toHaveCount(0);
});

test('verification links open the account verification screen', async ({ page }) => {
  await page.route('**/api/auth/verify-email', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,message:'Email verified. You can now sign in securely.'})}));
  await page.goto('/?auth=verify&token='+'a'.repeat(64));
  await expect(page.getByRole('heading',{name:'Verify your email'})).toBeVisible();
  await expect(page.getByText('Email verified. You can now sign in securely.')).toBeVisible();
});

test('password reset requires matching new passwords', async ({ page }) => {
  await page.route('**/api/auth/reset-password', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,message:'Password updated. Sign in with your new password.'})}));
  await page.goto('/?auth=reset&token='+'b'.repeat(64));
  await expect(page.getByRole('heading',{name:'Choose a new password'})).toBeVisible();
  await page.getByLabel('New password',{exact:true}).fill('New-Verified-Password-932!');
  await page.getByLabel('Confirm new password',{exact:true}).fill('New-Verified-Password-932!');
  await page.getByRole('button',{name:'Update password'}).click();
  await expect(page.getByRole('heading',{name:'Log in to Pexoriy'})).toBeVisible();
});

test('demo balances are explicitly labelled and remain separate from account data', async ({ page }) => {
  await enterApp(page);
  await expect(page.getByText('DEMO MODE', { exact: true })).toBeVisible();
  await expect(page.getByText('Illustrative balances only — not saved to an account.')).toBeVisible();
});

test('an expired account session returns to sign-in instead of showing demo balances', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Not signed in' }) }));
  await enterApp(page, '/', 'live', 'account');
  await expect(page.getByRole('heading', { name: 'Log in to Pexoriy' })).toBeVisible();
  await expect(page.getByText('DEMO MODE', { exact: true })).toHaveCount(0);
});

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
  await expect(page.getByRole('heading', { name: /Market opportunities/ })).toBeVisible();
});

test('stale market data disables new practice orders', async ({ page }) => {
  await enterApp(page, '/', 'stale');
  await goTo(page, 'Practice Trading');
  await expect(page.getByRole('heading', { name: 'Practice Trading' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review Buy \/ Long order/ })).toBeDisabled();
  await expect(page.getByText(/Live market data is unavailable/).first()).toBeVisible();
});

test('AI Centre stays rendered when live market quotes are stale or unavailable', async ({ page }) => {
  await enterApp(page, '/', 'stale');
  await goTo(page, 'AI Trading');
  await expect(page.getByRole('heading', { name: /AI-assisted practice/ })).toBeVisible();
  await expect(page.getByText('Sign in to connect the server-backed AI session.', { exact: false })).toBeVisible();
  await expect(page.locator('.page-render-error')).toHaveCount(0);
});

test('AI execution stays disabled until the server-side provider and credit settlement are ready', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'AI Trading');
  await expect(page.getByText('Sign in to connect the server-backed AI session.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start AI session/ })).toBeDisabled();
  await expect(page.locator('.ai-action-review')).toHaveCount(0);

  await goTo(page, 'Practice Trading');
  await expect(page.getByText('No open positions')).toBeVisible();

  await goTo(page, 'Activity');
  await expect(page.getByRole('heading', { name: 'Your activity, in one place.' })).toBeVisible();
  await expect(page.getByText('AI-assisted position opened')).toHaveCount(0);
});

test('AI execution remains disabled regardless of the displayed AI Credit balance', async ({ page }) => {
  await enterApp(page, '/?e2e=low-balance');
  await goTo(page, 'AI Trading');
  await expect(page.locator('.ai-balance-purchase strong')).toContainText('0');
  await expect(page.getByText('Sign in to connect the server-backed AI session.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start AI session/ })).toBeDisabled();
  await expect(page.locator('.ai-action-review')).toHaveCount(0);
  await expect(page.locator('.ai-balance-purchase strong')).toContainText('0');
});

test('authenticated AI session creates a server proposal and charges AC only after a simulated trade opens', async ({ page }) => {
  let session = { id: 'ai-session-1', state: 'idle', risk_profile: 'Balanced', market_symbol: 'DOGE/USDT' };
  let proposal = null;
  let openedPosition = null;
  let acBalance = 840;
  let tcBalance = 12450;
  await page.route('**/api/me', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'test-user', email: 'tester@example.com', displayName: 'Tester', balances: { TC: tcBalance, AC: acBalance, PXY: 0 } } })
  }));
  await page.route('**/api/trading/positions', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ positions: openedPosition ? [openedPosition] : [] })
  }));
  await page.route('**/api/trading/history', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/ai/config', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ provider: 'cloudflare-workers-ai', providerConfigured: true, executionEnabled: true, model: '@cf/google/gemma-4-26b-a4b-it', operationCostAC: 1.5 })
  }));
  await page.route('**/api/ai/session', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session }) });
    const body = route.request().postDataJSON();
    if (body.action === 'start') session = { ...session, state: 'active', risk_profile: body.riskProfile, market_symbol: body.marketSymbol };
    if (body.action === 'pause') session = { ...session, state: 'paused' };
    if (body.action === 'resume') session = { ...session, state: 'active' };
    if (body.action === 'stop') session = { ...session, state: 'stopped' };
    if (body.action === 'configure') session = { ...session, risk_profile: body.riskProfile, market_symbol: body.marketSymbol };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session }) });
  });
  await page.route('**/api/ai/activity', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));
  await page.route('**/api/ai/proposals', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ proposals: proposal ? [proposal] : [] }) });
    proposal = {
      id: 'proposal-1', symbol: 'DOGE/USDT', side: 'short', risk_profile: 'Balanced',
      quotePrice: 0.1642, rationale: 'Short-term momentum is elevated; keep the simulation risk controlled.',
      confidence: 64, status: 'pending', expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString()
    };
    acBalance = 838.5;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ proposal: { ...proposal, reservedAC: 1.5, chargedAC: 0 } }) });
  });
  await page.route('**/api/ai/proposals/execute', async route => {
    openedPosition = {
      id: 'position-1', symbol: 'DOGE/USDT', market: 'DOGE/USDT', side: 'short', direction: 'Short',
      status: 'open', reserved_tc: 2490, amount: 2490, entry: 0.1642, markPrice: 0.1642,
      time: '10:00 AM', opened_at: new Date().toISOString(), aiManaged: true, aiCreditCost: 1.5
    };
    acBalance = 838.5;
    tcBalance = 9958;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'executed', chargedAC: 1.5, order: { id: 'order-1' }, position: openedPosition }) });
  });
  await enterApp(page, '/', 'live', 'account');
  await goTo(page, 'AI Trading');
  await expect(page.getByRole('heading', { name: /AI-assisted practice/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start AI session/ })).toBeEnabled();
  await page.getByRole('button', { name: /Start AI session/ }).click();
  await expect(page.locator('.ai-status-pill')).toContainText('ACTIVE');
  await page.getByRole('button', { name: /Review AI trade/ }).click();
  await expect(page.locator('.ai-action-review')).toBeVisible();
  await expect(page.locator('.ai-proposal-rationale')).toContainText('Short-term momentum');
  await expect(page.locator('.ai-action-review')).toContainText('1.5 AC');
  await page.getByRole('button', { name: /Confirm trade/ }).click();
  await expect(page.getByText(/Simulated AI position opened through the server/)).toBeVisible();
  await expect(page.locator('.ai-managed-list')).toContainText('DOGE/USDT');
  await expect(page.locator('.ai-managed-list')).toContainText('1.5 AC charged');
});

test('AI Credit Store shows real network logos and live SOL and GRAM token equivalents', async ({ page }) => {
  await page.route('**/api/payments/solana/config', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false})}));
  await page.route('**/api/payments/ton/config', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,network:'ton-mainnet',asset:'GRAM'})}));
  await page.route('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({solana:{usd:100}})}));
  await page.route('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({'the-open-network':{usd:5}})}));
  await enterApp(page);
  await goTo(page, 'Overview');
  await expect(page.locator('.stat-card').filter({hasText:'AI Credits · AC'}).locator('.ai-credit-mark')).toBeVisible();
  await goTo(page, 'AI Trading');
  await page.getByRole('button', { name: /Buy more AI Credits/ }).click();

  await expect(page.getByRole('heading', { name: 'Get AI Credits.' })).toBeVisible();
  await expect(page.locator('.ai-store-page-mark .ai-credit-mark')).toBeVisible();
  await expect(page.locator('.ai-package-card.ai-package-popular')).toHaveCount(1);
  await expect(page.locator('.ai-package-card.ai-package-popular')).toContainText('MOST POPULAR');
  await expect(page.locator('.ai-store-selected-summary button')).toContainText('Purchases temporarily unavailable');
  const entryPackage = page.locator('.ai-package-card').first();
  await expect(entryPackage.locator('.ai-package-payment strong')).toContainText('0.0500');
  await expect(entryPackage.locator('.ai-package-payment strong')).toContainText('SOL');
  await expect(entryPackage.locator('.ai-package-payment')).toContainText('≈ $5 USD · live estimate');
  await expect(page.locator('.solana-network-icon img')).toHaveCount(1);
  await expect(page.locator('.gram-network-icon svg')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: /GRAM \(TON\)/ })).toBeVisible();
  await page.getByRole('tab', { name: /GRAM \(TON\)/ }).click();
  await expect(page.locator('.ai-package-card').first().locator('.ai-package-payment strong')).toContainText('1 GRAM');
  await expect(page.locator('.ai-package-card').first().locator('.ai-package-payment strong')).toContainText('GRAM');
  await expect(page.locator('.ai-store-selected-summary button')).toContainText('GRAM checkout unavailable');
  await expect(page.locator('.ai-store-gram-panel')).toContainText('Native GRAM is sent on TON mainnet.');
  await expect(page.locator('.ai-store-gram-panel')).toContainText('Connect wallet');
});

test('AI Credit Store restores a pending native GRAM payment and verifies through the TON API', async ({ page }) => {
  await page.route('**/api/me', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'test-user', email: 'tester@example.com', displayName: 'Tester', balances: { TC: 12450, AC: 840, PXY: 0 } } })
  }));
  await page.route('**/api/payments/ton/config', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ enabled: true, network: 'ton-mainnet', asset: 'GRAM', quoteCurrency: 'USD', walletProtocol: 'ton-connect' })
  }));
  await page.route('**/api/payments/ton/orders', async route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ orders: [{
      id: '7f5e4c3b-2a19-4d8e-9f01-123456789abc',
      network: 'ton-mainnet', asset: 'GRAM', status: 'pending',
      expectedAmountAtoms: 250000000, amountGram: '0.25', aiCredits: 70,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      txHash: null, createdAt: new Date().toISOString(),
      recipientAddress: 'UQDONKXS7co5fixO6FDnicHEcdCtBRF_arFw0dgvFyjgQqoW',
      referenceKey: 'PEXORIY:7f5e4c3b-2a19-4d8e-9f01-123456789abc'
    }] })
  }));
  await page.route('**/api/payments/ton/verify', async route => route.fulfill({
    status: 202, contentType: 'application/json',
    body: JSON.stringify({ status: 'pending', message: 'No matching confirmed GRAM payment is visible yet. You can safely check again.' })
  }));
  await enterApp(page, '/', 'live', 'account');
  await goTo(page, 'AI Trading');
  await page.getByRole('button', { name: /Buy more AI Credits/ }).click();
  await page.getByRole('tab', { name: /GRAM \(TON\)/ }).click();
  await expect(page.locator('.ai-store-payment-order')).toBeVisible();
  await expect(page.locator('.ai-store-order-amount')).toContainText('0.25 GRAM');
  await expect(page.locator('.ai-store-order-status')).toContainText('PENDING');
  await expect(page.locator('.ai-store-payment-order')).toContainText('PEXORIY:7f5e4c3b-2a19-4d8e-9f01-123456789abc');
  await page.getByRole('button', { name: 'I’ve paid — verify' }).click();
  await expect(page.getByText('No matching confirmed GRAM payment is visible yet.')).toBeVisible();
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

  await enterApp(page, '/', 'live', 'account');
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
    tc -= body.allocationTc + 1;
    openPosition = {
      id: 'position-server-001', symbol: body.symbol, market: body.symbol, side: body.side, direction: body.side === 'long' ? 'Long' : 'Short',
      status: 'open', leverage: 1, quantity_atoms: body.allocationTc * 1000000, entry_price_micros: 67482200000,
      mark_price_micros: 67482200000, reserved_tc: body.allocationTc, amount: body.allocationTc, entry: 67482.2,
      markPrice: 67482.2, realized_pnl_tc: 0, open_fee_tc: 1, unrealizedPnlTc: -3, quoteStatus: 'live', opened_at: openedAt, openedAt, time: '04:20 AM', aiManaged: false
    };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ order: { id: 'order-server-001' }, position: openPosition }) });
  });
  await page.route('**/api/trading/history', async route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ history: closedHistory })
  }));
  await page.route('**/api/trading/positions/close', async route => {
    const returned = Number(openPosition?.reserved_tc || 0) + 3;
    tc += returned;
    const closed = {
      ...openPosition, status: 'closed', exit: 68000, mark_price_micros: 68000000000,
      realizedPnl: 2, realized_pnl_tc: 2, tcReturned: returned, closedAtIso: new Date().toISOString()
    };
    closedHistory = [{
      id: closed.id, market: closed.market, direction: closed.direction, amount: closed.amount,
      entry: closed.entry, exit: closed.exit, realizedPnl: 2, tcReturned: returned,
      time: '04:20 AM', closedAt: '04:21 AM', closedAtIso: closed.closedAtIso
    }];
    openPosition = null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ closed: true, position: closed }) });
  });

  await enterApp(page, '/', 'live', 'account');
  await goTo(page, 'Practice Trading');
  await expect(page.getByRole('heading', { name: 'Practice Trading' })).toBeVisible();
  await page.getByRole('button', { name: /Review Buy \/ Long order/ }).click();
  await page.getByRole('button', { name: /Confirm simulated entry/ }).click();
  await expect(page.getByText('Practice position', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('11,949', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.position-card').first()).toContainText('-3 TC');
  await page.getByRole('button', { name: 'Review close' }).click();
  await page.getByRole('button', { name: 'Confirm close' }).click();
  await expect(page.getByText('Position closed and settlement recorded.')).toBeVisible();
  await expect(page.getByText('+2 TC', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('12,452', { exact: false }).first()).toBeVisible();
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


test('community challenge preview does not pretend to save entries or pay prizes', async ({ page }) => {
  await enterApp(page, '/', 'demo', 'demo');
  await goTo(page, 'Community Challenges');
  await expect(page.getByRole('heading', { name: /Compete together/ })).toBeVisible();
  await expect(page.getByText(/Entries, ranking, and PXY settlement remain disabled/)).toBeVisible();
  await expect(page.getByText('Entry opens after scoring, reserve, and launch checks are complete.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Review eligibility/ }).first()).toBeVisible();
});

test('learning and PXY pre-sale page are discoverable without falsely enabling payment', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'Learning Center');
  await expect(page.getByRole('heading', { name: /Learn the market/ })).toBeVisible();
  if (page.viewportSize().width <= 760) {
    await expect(page.locator('.learning-mobile-preview-note')).toBeVisible();
  } else {
    await expect(page.locator('.learning-lesson').getByText(/Preview mode: sign in to take scored quizzes/)).toBeVisible();
  }
  await goTo(page, 'PXY Pre-sale');
  await expect(page.getByRole('heading', { name: /The PXY pre-sale/ })).toBeVisible();
  await expect(page.getByText('PRE-SALE PAGE LIVE')).toBeVisible();
  await expect(page.getByRole('button', { name: /Buy PXY|Purchase tokens|Connect wallet/i })).toHaveCount(0);
});

test('learning and PXY pre-sale page remain reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterApp(page);
  await goTo(page, 'Learning Center');
  await expect(page.getByRole('heading', { name: /Learn the market/ })).toBeVisible();
  await goTo(page, 'PXY Pre-sale');
  await expect(page.getByRole('heading', { name: /The PXY pre-sale/ })).toBeVisible();
});


test('public landing exposes the PXY pre-sale page without requiring sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PXY Pre-sale', exact: true }).click();
  await expect(page.getByRole('heading', { name: /The PXY pre-sale/ })).toBeVisible();
  await expect(page.getByText('PRE-SALE PAGE LIVE')).toBeVisible();
});


test('referral progress is not fabricated in demo mode', async ({ page }) => {
  await enterApp(page);
  await goTo(page, 'Invite & Grow');
  await expect(page.getByRole('heading', { name: /Invite friends. Grow together./ })).toBeVisible();
  await expect(page.getByText('Sign in to track your squad and claim team quest rewards.')).toBeVisible();
  await expect(page.getByText('Verified referral progress is account-backed')).toBeVisible();
});


test('team quest rewards are shown only after the server confirms the claim', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }));
  let questPaid = false;
  await page.route('**/api/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'account-user', email: 'account@example.test', displayName: 'Account User', balances: { TC: 1000, AC: 10, PXY: 0 } } }) }));
  await page.route('**/api/trading/positions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }));
  await page.route('**/api/trading/history', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/missions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missions: [
    { id: 'first-practice-trade', title: 'Make a practice trade', rewardCurrency: 'TC', rewardAmount: 250, rules: { prerequisite: 'practice_trade' }, claim: null },
    { id: 'review-ai-setup', title: 'Review an AI trading setup', rewardCurrency: 'TC', rewardAmount: 150, rules: { prerequisite: 'ai_setup' }, claim: null }
  ] }) }));
  await page.route('**/api/learning', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lessons: [], completed: 0 }) }));
  await page.route('**/api/referrals/activate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'not_referred' }) }));
  await page.route('**/api/referrals', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    code: 'AB12CD34EF56', invited: 3, activated: 3,
    milestones: [{ id: 'first', target: 1, reached: true }, { id: 'squad', target: 3, reached: true }],
    rewards: { referrerTC: 250, referredTC: 100, currency: 'TC' },
    quests: [{ id: 'squad-three', title: 'Build your squad', description: 'Activate three referred members through verified email and a first simulated trade.', target: 3, rewardTC: 300, progress: 3, claim: questPaid ? { status: 'paid', ledger_transaction_id: 'tx-team-1' } : null }]
  }) }));
  await page.route('**/api/referrals/quests/claim', async route => {
    questPaid = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'paid', duplicate: false, rewardTC: 300, questId: 'squad-three' }) });
  });
  await enterApp(page, '/', 'live', 'account');
  await goTo(page, 'Referrals');
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Your personal invite link has been copied.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team quests' })).toBeVisible();
  await page.getByRole('button', { name: 'Claim reward' }).click();
  await expect(page.getByText('Team quest completed: +300 TC recorded.')).toBeVisible();
  await expect(page.getByText('REWARD CLAIMED')).toBeVisible();
});


test('PXY pre-sale page is live while unverified purchase settlement remains unavailable', async ({ page }) => {
  await page.route('**/api/presale/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ previewEnabled: false, saleEnabled: true, launchState: 'active', purchaseFlowReady: false }) }));
  await enterApp(page);
  await goTo(page, 'PXY Pre-sale');
  await expect(page.getByText('PRE-SALE PAGE LIVE')).toBeVisible();
  await expect(page.getByText(/page is live, but the token-purchase flow still needs/i)).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Buy PXY|Purchase tokens|Connect wallet/i })).toHaveCount(0);
});
