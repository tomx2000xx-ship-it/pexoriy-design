import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.env.PEXORIY_LOCAL_API_BASE || "http://127.0.0.1:8787";
const email = `stage2-${Date.now()}@example.test`;
const origin = base;
let cookie = "";

async function call(path, { method = "GET", body, authenticated = true } = {}) {
  const headers = { accept: "application/json" };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    headers.origin = origin;
  }
  if (authenticated && cookie) headers.cookie = cookie;
  const response = await fetch(base + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const registered = await call("/api/auth/register", {
  method: "POST",
  authenticated: false,
  body: { email, displayName: "Stage Two Test", password: "Stage2-Test-Password-932!" },
});
assert.equal(registered.response.status, 201, JSON.stringify(registered.payload));
const setCookie = registered.response.headers.get("set-cookie") || "";
cookie = setCookie.split(";")[0];
assert.match(cookie, /^px_session=/, "registration must issue a session cookie");
assert.equal(Number(registered.payload?.user?.balances?.TC), 12450, "new account starts with expected TC balance");
assert.equal(registered.payload?.user?.emailVerified, false, "normal registration must not pretend the email was verified");

const signedIn = await call("/api/auth/login", {
  method: "POST",
  authenticated: false,
  body: { email, password: "Stage2-Test-Password-932!" },
});
assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.payload));
assert.equal(signedIn.payload?.user?.emailVerified, false, "password sign-in must work while email verification is deferred");
const loginCookie = signedIn.response.headers.get("set-cookie") || "";
cookie = loginCookie.split(";")[0];
assert.match(cookie, /^px_session=/, "password sign-in must issue a session cookie");

const account = await call("/api/me");
assert.equal(account.response.status, 200, JSON.stringify(account.payload));
assert.equal(Number(account.payload?.user?.balances?.TC), 12450);

const loginAttempts = await Promise.all(Array.from({ length: 6 }, () => call("/api/auth/login", {
  method: "POST",
  authenticated: false,
  body: { email, password: "Definitely-Wrong-Password-932!" },
})));
assert.ok(loginAttempts.slice(0, 5).every((item) => item.response.status === 401),
  "incorrect credentials should receive a generic sign-in failure before the email rate limit");
assert.equal(loginAttempts[5].response.status, 429, "repeated sign-in failures must be throttled");

const missingQuote = await call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "ETH/USDT", side: "long", allocationTc: 100, idempotencyKey: `stage2-missing-${Date.now()}` },
});
assert.equal(missingQuote.response.status, 503, "an unsupported/stale market snapshot must block opening");

const openKey = `stage2-open-${Date.now()}`;
const opened = await call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "BTC/USDT", side: "long", allocationTc: 500, idempotencyKey: openKey },
});
assert.equal(opened.response.status, 201, JSON.stringify(opened.payload));
assert.equal(opened.payload?.position?.status, "open");
assert.equal(Number(opened.payload?.position?.reserved_tc), 500);
assert.equal(Number(opened.payload?.position?.unrealizedPnlTc), -3, "open response must include fee-aware server P&L immediately");
assert.equal(Number(opened.payload?.position?.mark_price_micros), 67482200000, "stored mark price must be the exchange quote, not the adverse entry fill");
assert.ok(Number(opened.payload?.position?.entry_price_micros) > Number(opened.payload?.position?.mark_price_micros), "long entry fill should include the adverse simulated execution adjustment");

const duplicateOpen = await call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "BTC/USDT", side: "long", allocationTc: 500, idempotencyKey: openKey },
});
assert.equal(duplicateOpen.response.status, 200, JSON.stringify(duplicateOpen.payload));
assert.equal(duplicateOpen.payload?.order?.duplicate, true);

const afterOpen = await call("/api/me");
assert.equal(Number(afterOpen.payload?.user?.balances?.TC), 11949, "open must reserve TC and the disclosed taker fee exactly once");

const positions = await call("/api/trading/positions");
assert.equal(positions.response.status, 200, JSON.stringify(positions.payload));
assert.equal(positions.payload?.positions?.length, 1);
assert.equal(positions.payload?.positions?.[0]?.quoteStatus, "live");
assert.equal(Number(positions.payload?.positions?.[0]?.unrealizedPnlTc), -3, "immediate mark reflects the adverse spread/slippage and fees");

// Simulate a later exchange snapshot and confirm the API marks the open
// position from the fresh server-side quote, not a browser-only price.
const nextTimestamp = Date.now();
const updatedPriceMicros = 68157022000; // +1% from the seeded BTC entry
const quoteSql = "INSERT INTO market_snapshots (id, provider, symbol, price_micros, provider_timestamp_ms, validation_status, model_version) VALUES ('ci-market-btc-updated', 'ci-fixture', 'BTC/USDT', " + updatedPriceMicros + ", " + nextTimestamp + ", 'valid', 'ci-test')";
execFileSync("npx", ["wrangler", "d1", "execute", "pexoriy-core", "--local", "--command", quoteSql], { stdio: "pipe" });
const markedPositions = await call("/api/trading/positions");
assert.equal(markedPositions.response.status, 200);
assert.equal(Number(markedPositions.payload?.positions?.[0]?.unrealizedPnlTc), 2, "mark-to-market must include adverse fill costs and estimated closing fee");

const tooLarge = await call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "BTC/USDT", side: "long", allocationTc: 12000, idempotencyKey: `stage2-overdraw-${Date.now()}` },
});
assert.equal(tooLarge.response.status, 409, "ledger balance guard must reject an overdraw");

const closeKey = `stage2-close-${Date.now()}`;
const closed = await call("/api/trading/positions/close", {
  method: "POST",
  body: { positionId: opened.payload.position.id, idempotencyKey: closeKey },
});
assert.equal(closed.response.status, 200, JSON.stringify(closed.payload));
assert.equal(closed.payload?.closed, true);
assert.equal(Number(closed.payload?.realizedPnl ?? closed.payload?.position?.realized_pnl_tc ?? 0), 2);

const duplicateClose = await call("/api/trading/positions/close", {
  method: "POST",
  body: { positionId: opened.payload.position.id, idempotencyKey: closeKey },
});
assert.equal(duplicateClose.response.status, 200, JSON.stringify(duplicateClose.payload));
assert.equal(duplicateClose.payload?.duplicate, true);

const afterClose = await call("/api/me");
assert.equal(Number(afterClose.payload?.user?.balances?.TC), 12452, "close must return collateral and net simulated P&L after fees exactly once");
const history = await call("/api/trading/history");
assert.equal(history.response.status, 200);
assert.equal(history.payload?.history?.length, 1);
assert.equal(history.payload?.history?.[0]?.id, opened.payload.position.id);
assert.equal(Number(history.payload?.history?.[0]?.realizedPnl), 2);

// Four simultaneous distinct orders must not exceed the database-enforced 75% exposure ceiling.
const concurrentStamp = Date.now();
const concurrentOrders = await Promise.all(Array.from({ length: 4 }, (_, index) => call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "BTC/USDT", side: index % 2 ? "short" : "long", allocationTc: 3000, idempotencyKey: "stage2-concurrent-" + concurrentStamp + "-" + index },
})));
assert.ok(concurrentOrders.every((item) => [201, 409].includes(item.response.status)),
  "concurrent risk-limited orders should either open or be rejected safely: " + concurrentOrders.map((item) => item.response.status).join(","));
assert.equal(concurrentOrders.filter((item) => item.response.status === 201).length, 3,
  "only three 3,000-TC positions fit within the 75% account exposure ceiling");
const afterConcurrent = await call("/api/trading/positions");
assert.equal(afterConcurrent.payload?.positions?.length, 3);
assert.ok(afterConcurrent.payload.positions.reduce((sum, item) => sum + Number(item.reserved_tc), 0) <= 9339,
  "persisted open collateral must remain under the account exposure ceiling");

console.log("Local D1 trading integration passed: auth, fresh quote gate, fees, fill pricing, open/idempotency, balance reservation, mark-to-market, overdraw and exposure limits, close settlement/idempotency, and history.");
