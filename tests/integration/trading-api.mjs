import assert from "node:assert/strict";

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

const account = await call("/api/me");
assert.equal(account.response.status, 200, JSON.stringify(account.payload));
assert.equal(Number(account.payload?.user?.balances?.TC), 12450);

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

const duplicateOpen = await call("/api/trading/positions", {
  method: "POST",
  body: { symbol: "BTC/USDT", side: "long", allocationTc: 500, idempotencyKey: openKey },
});
assert.equal(duplicateOpen.response.status, 200, JSON.stringify(duplicateOpen.payload));
assert.equal(duplicateOpen.payload?.order?.duplicate, true);

const afterOpen = await call("/api/me");
assert.equal(Number(afterOpen.payload?.user?.balances?.TC), 11950, "open must reserve TC exactly once");

const positions = await call("/api/trading/positions");
assert.equal(positions.response.status, 200, JSON.stringify(positions.payload));
assert.equal(positions.payload?.positions?.length, 1);
assert.equal(positions.payload?.positions?.[0]?.quoteStatus, "live");
assert.equal(Number(positions.payload?.positions?.[0]?.unrealizedPnlTc), 0);

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
assert.equal(Number(closed.payload?.realizedPnl ?? closed.payload?.position?.realized_pnl_tc ?? 0), 0);

const duplicateClose = await call("/api/trading/positions/close", {
  method: "POST",
  body: { positionId: opened.payload.position.id, idempotencyKey: closeKey },
});
assert.equal(duplicateClose.response.status, 200, JSON.stringify(duplicateClose.payload));
assert.equal(duplicateClose.payload?.duplicate, true);

const afterClose = await call("/api/me");
assert.equal(Number(afterClose.payload?.user?.balances?.TC), 12450, "flat close must return reserved TC exactly once");
const history = await call("/api/trading/history");
assert.equal(history.response.status, 200);
assert.equal(history.payload?.history?.length, 1);
assert.equal(history.payload?.history?.[0]?.id, opened.payload.position.id);

console.log("Local D1 trading integration passed: auth, fresh quote gate, open/idempotency, balance reservation, mark-to-market, overdraw protection, close/idempotency, and history.");
