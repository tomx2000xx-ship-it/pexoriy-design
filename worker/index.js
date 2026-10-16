import { postLedgerTransaction } from "./ledger.js";
import { calculateRealizedSettlement, calculateUnrealizedPnlTc, isFreshValidatedQuote, calculateSimulatedFillPrice, calculateTakerFeeTc, SIMULATION_MODEL_VERSION, MAX_OPEN_POSITIONS, MAX_POSITION_EQUITY_BPS, MAX_TOTAL_EXPOSURE_EQUITY_BPS } from "./trading.js";
import { normalizeMarketQuote } from "./market-feed.js";
import {
  AI_CREDIT_PACKAGES,
  SOLANA_NETWORK,
  encodeBase58,
  decodeBase58,
  makeSolanaPayUrl,
  validateSolPaymentTransaction,
  formatLamports,
} from "./solana-payments.js";

const SESSION_COOKIE = "px_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 210_000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      ...extraHeaders,
    },
  });
}

function cookieValue(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function passwordHash(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return bytesToHex(bits);
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function appendAudit(env, { actorUserId = null, eventType, entityType, entityId = null, requestId, details = {} }) {
  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), actorUserId, eventType, entityType, entityId, requestId, JSON.stringify(details)).run();
}

async function recordSolanaPaymentEvent(env, { orderId, signature, eventType, processingStatus, slot }) {
  const payloadHash = await sha256Hex(`${signature}:${eventType}:${slot}`);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO payment_events (id, payment_order_id, provider_event_id, event_type, payload_hash, processing_status, processed_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
  ).bind(crypto.randomUUID(), orderId, `solana:${signature}`, eventType, payloadHash, processingStatus).run();
}

async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.status, s.id AS session_id, s.expires_at
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
  ).bind(tokenHash).first();
  if (!session || session.status !== "active" || Date.parse(session.expires_at) <= Date.now()) return null;
  return session;
}

async function balancesForUser(env, userId) {
  const result = await env.DB.prepare(
    `SELECT a.currency,
       COALESCE(SUM(CASE WHEN t.status = 'posted' THEN p.amount_atoms ELSE 0 END), 0) AS balance
     FROM ledger_accounts a
     LEFT JOIN ledger_postings p ON p.account_key = a.account_key
     LEFT JOIN ledger_transactions t ON t.id = p.transaction_id
     WHERE a.owner_user_id = ?
     GROUP BY a.currency`,
  ).bind(userId).all();
  const balances = { TC: 0, AC: 0, PXY: 0 };
  for (const row of result.results || []) {
    if (Object.hasOwn(balances, row.currency)) balances[row.currency] = Number(row.balance);
  }
  return balances;
}

async function publicUser(env, user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    balances: await balancesForUser(env, user.id),
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();

  if (path === "/api/health" && request.method === "GET") {
    try {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").first();
      return json({ ok: true, service: "pexoriy-api", database: "connected", tables: Number(row?.count || 0) });
    } catch {
      return json({ ok: false, service: "pexoriy-api", database: "unavailable" }, 503);
    }
  }

  if (path === "/api/markets" && request.method === "GET") {
    // GRAM is the post-migration ticker for the former TON asset. Do not query
    // TONUSDT: Binance completed its GRAM rebrand and opened GRAM spot pairs.
    const marketCatalogue = [
      { symbol: "BTC/USDT", name: "Bitcoin", binance: "BTCUSDT", okx: "BTC-USDT" },
      { symbol: "ETH/USDT", name: "Ethereum", binance: "ETHUSDT", okx: "ETH-USDT" },
      { symbol: "SOL/USDT", name: "Solana", binance: "SOLUSDT", okx: "SOL-USDT" },
      { symbol: "DOGE/USDT", name: "Dogecoin", binance: "DOGEUSDT", okx: "DOGE-USDT" },
      { symbol: "GRAM/USDT", name: "Gram", binance: "GRAMUSDT", okx: "GRAM-USDT" },
    ];
    const now = Date.now();
    const maxQuoteAgeMs = 90000;
    const latestRows = await env.DB.prepare(
      "SELECT symbol, price_micros, provider_timestamp_ms, validation_status, provider, received_at FROM market_snapshots WHERE id IN (SELECT id FROM market_snapshots s2 WHERE s2.symbol = market_snapshots.symbol ORDER BY provider_timestamp_ms DESC, received_at DESC LIMIT 1)",
    ).all().catch(() => ({ results: [] }));
    const latest = new Map((latestRows.results || []).map((row) => [row.symbol, row]));
    const isUsableTimestamp = (timestamp) => Boolean(normalizeMarketQuote({
      price: 1, timestamp, provider: "timestamp-check",
    }, now, maxQuoteAgeMs));
    const toMarket = (market, row, statusOverride) => {
      const timestamp = Number(row?.provider_timestamp_ms || 0);
      const fresh = Boolean(row && row.validation_status === "valid" && isUsableTimestamp(timestamp));
      return {
        symbol: market.symbol, name: market.name,
        price: row && Number(row.price_micros) > 0 ? Number(row.price_micros) / 1000000 : null,
        updatedAt: row && timestamp > 0 ? new Date(timestamp).toISOString() : null,
        provider: row?.provider || null,
        status: statusOverride || (fresh ? "cached" : "stale"),
      };
    };


    const binanceHosts = [
      "https://data-api.binance.vision",
      "https://api.binance.com",
      "https://api-gcp.binance.com",
      "https://api1.binance.com",
    ];
    const fetchJson = async (url) => {
      const response = await fetch(url, {
        headers: { "accept": "application/json" },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) throw new Error("Market provider returned HTTP " + response.status);
      return response.json();
    };
    const fetchBinanceQuote = async (market) => {
      for (const host of binanceHosts) {
        try {
          const trades = await fetchJson(host + "/api/v3/trades?symbol=" + encodeURIComponent(market.binance) + "&limit=1");
          // Use the latest actual trade, including its exchange-assigned time.
          // avgPrice is a rolling five-minute average and is not a fill quote.
          const quote = Array.isArray(trades) ? trades[trades.length - 1] : null;
          const normalized = normalizeMarketQuote({
            price: quote?.price, timestamp: quote?.time, provider: "binance-spot-public",
          }, now, maxQuoteAgeMs);
          if (normalized) return { ...normalized, change24h: null };
        } catch {
          // Try the next official public-data hostname before changing provider.
        }
      }
      return null;
    };
    const fetchOkxQuote = async (market) => {
      if (!market.okx) return null;
      try {
        const payload = await fetchJson("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(market.okx));
        const quote = payload?.code === "0" ? payload?.data?.[0] : null;
        const normalized = normalizeMarketQuote({
          price: quote?.last, timestamp: quote?.ts, provider: "okx-spot-public",
        }, now, maxQuoteAgeMs);
        if (normalized) return { ...normalized, change24h: null };
      } catch {
        // Keep this optional fallback isolated; stale data is never promoted to live.
      }
      return null;
    };

    const fetched = await Promise.all(marketCatalogue.map(async (market) => {
      const cachedRow = latest.get(market.symbol);
      const cachedAt = Date.parse(cachedRow?.received_at || "");
      const cacheUsable = cachedRow && cachedRow.validation_status === "valid" &&
        isUsableTimestamp(Number(cachedRow.provider_timestamp_ms)) &&
        Number.isFinite(cachedAt) && now - cachedAt >= -1000 && now - cachedAt <= 10000;
      if (cacheUsable) return { market, quote: null, cachedRow };
      // Live smoke checks showed OKX returning fresh quotes while Binance
      // did not validate reliably from the deployed Worker. Prefer OKX and
      // retain Binance as a per-market fallback.
      const previous = latest.get(market.symbol);
      const previousIsFresh = previous && isFreshValidatedQuote(previous, now);
      const preferPrevious = (quote) => Boolean(quote && previousIsFresh &&
        Number(previous.provider_timestamp_ms) >= Number(quote.timestamp));
      const primary = await fetchOkxQuote(market);
      if (primary) {
        if (preferPrevious(primary)) return { market, quote: null, cachedRow: previous };
        return { market, quote: primary, cachedRow: null };
      }
      const secondary = await fetchBinanceQuote(market);
      if (secondary && preferPrevious(secondary)) {
        // Do not let a provider with an older exchange timestamp roll a market
        // backwards after a newer valid quote was already seen.
        return { market, quote: null, cachedRow: previous };
      }
      return { market, quote: secondary, cachedRow: null };
    }));
    const statements = [];
    const markets = [];
    for (const { market, quote, cachedRow } of fetched) {
      if (cachedRow) {
        markets.push(toMarket(market, cachedRow, "cached"));
        continue;
      }
      if (quote) {
        const priceMicros = Math.round(quote.price * 1000000);
        statements.push(env.DB.prepare(
          "INSERT INTO market_snapshots (id, provider, symbol, price_micros, provider_timestamp_ms, validation_status, model_version) VALUES (?, ?, ?, ?, ?, 'valid', 'market-feed-v3')",
        ).bind(crypto.randomUUID(), quote.provider, market.symbol, priceMicros, quote.timestamp));
        markets.push({
          symbol: market.symbol, name: market.name, price: quote.price,
          updatedAt: new Date(quote.timestamp).toISOString(), provider: quote.provider, status: "live",
        });
      } else {
        const row = latest.get(market.symbol);
        markets.push(toMarket(market, row));
      }
    }
    try {
      if (statements.length) await env.DB.batch(statements);
    } catch {
      // A quote is not reported as persisted/live if its snapshot write failed.
      for (const market of markets) {
        if (market.status === "live") {
          const row = latest.get(market.symbol);
          Object.assign(market, toMarket(marketCatalogue.find((item) => item.symbol === market.symbol), row));
        }
      }
    }
    const hasTradableMarket = markets.some((market) =>
      ["live", "cached"].includes(market.status) && Number.isFinite(Number(market.price)) && Number(market.price) > 0);
    const providers = [...new Set(markets.filter((market) => ["live", "cached"].includes(market.status)).map((market) => market.provider).filter(Boolean))];
    return json({
      provider: providers.length === 1 ? providers[0] : providers.length ? "multi-provider" : "unavailable",
      quoteCurrency: "USDT", fetchedAt: new Date(now).toISOString(), staleAfterMs: maxQuoteAgeMs,
      markets,
      ...(hasTradableMarket ? {} : { message: "Live market quotes are temporarily unavailable. Stale markets must not accept new simulated orders." }),
    }, hasTradableMarket ? 200 : 503);
  }

  if (request.method !== "GET" && !requireSameOrigin(request)) {
    return json({ error: "Cross-origin request rejected." }, 403);
  }

  if (path === "/api/auth/register" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    if (displayName.length < 2 || displayName.length > 60) {
      return json({ error: "Display name must be between 2 and 60 characters." }, 400);
    }
    if (password.length < 12 || password.length > 128) {
      return json({ error: "Password must be 12–128 characters." }, 400);
    }

    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = randomHex(32);
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    try {
      const welcomeTcTransactionId = crypto.randomUUID();
      const welcomeAcTransactionId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id, email, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)")
          .bind(userId, email, displayName, salt, hash),
        env.DB.prepare("INSERT INTO ledger_accounts (account_key, owner_user_id, currency, account_type) VALUES (?, ?, 'TC', 'user'), (?, ?, 'AC', 'user'), (?, ?, 'PXY', 'user')")
          .bind(`user:${userId}:TC`, userId, `user:${userId}:AC`, userId, `user:${userId}:PXY`, userId),
        env.DB.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
          .bind(sessionId, userId, tokenHash, expiresAt),
        env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, 'account.registered', 'user', ?, ?, '{}')")
          .bind(crypto.randomUUID(), userId, userId, requestId),
        env.DB.prepare("INSERT INTO ledger_transactions (id, idempotency_key, user_id, event_type, status, metadata_json) VALUES (?, ?, ?, 'account.welcome_tc_issued', 'pending', '{}'), (?, ?, ?, 'account.welcome_ac_issued', 'pending', '{}')")
          .bind(welcomeTcTransactionId, `welcome-tc:${userId}`, userId, welcomeAcTransactionId, `welcome-ac:${userId}`, userId),
        env.DB.prepare("INSERT INTO ledger_postings (id, transaction_id, account_key, amount_atoms, currency) VALUES (?, ?, ?, 12450, 'TC'), (?, ?, 'system:issuance:TC', -12450, 'TC'), (?, ?, ?, 840, 'AC'), (?, ?, 'system:issuance:AC', -840, 'AC')")
          .bind(crypto.randomUUID(), welcomeTcTransactionId, `user:${userId}:TC`, crypto.randomUUID(), welcomeTcTransactionId, crypto.randomUUID(), welcomeAcTransactionId, `user:${userId}:AC`, crypto.randomUUID(), welcomeAcTransactionId),
        env.DB.prepare("UPDATE ledger_transactions SET status = 'posted', posted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (?, ?)")
          .bind(welcomeTcTransactionId, welcomeAcTransactionId),
      ]);
    } catch (error) {
      const message = String(error?.message || "");
      if (/unique|constraint/i.test(message)) return json({ error: "An account with that email may already exist." }, 409);
      return json({ error: "Account creation could not be completed." }, 500);
    }
    const user = { id: userId, email, display_name: displayName };
    return json({ user: await publicUser(env, user) }, 201, { "set-cookie": sessionCookie(token) });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password || password.length > 128) return json({ error: "Email and password are required." }, 400);
    const user = await env.DB.prepare(
      "SELECT id, email, display_name, password_salt, password_hash, status FROM users WHERE email = ?",
    ).bind(email).first();
    if (!user || user.status !== "active") return json({ error: "Email or password is incorrect." }, 401);
    const attemptedHash = await passwordHash(password, user.password_salt);
    if (!constantTimeEqual(attemptedHash, user.password_hash)) {
      await appendAudit(env, { eventType: "auth.login_failed", entityType: "user", entityId: user.id, requestId });
      return json({ error: "Email or password is incorrect." }, 401);
    }
    const sessionId = crypto.randomUUID();
    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .bind(sessionId, user.id, tokenHash, expiresAt),
      env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, 'auth.login_succeeded', 'user', ?, ?, '{}')")
        .bind(crypto.randomUUID(), user.id, user.id, requestId),
    ]);
    return json({ user: await publicUser(env, user) }, 200, { "set-cookie": sessionCookie(token) });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    const user = await currentUser(request, env);
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await env.DB.prepare(
        "UPDATE auth_sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash = ? AND revoked_at IS NULL",
      ).bind(tokenHash).run();
    }
    if (user) await appendAudit(env, { actorUserId: user.id, eventType: "auth.logout", entityType: "user", entityId: user.id, requestId });
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  if (path === "/api/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    return json({ user: await publicUser(env, user) });
  }

  if (path === "/api/ledger" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));
    const result = await env.DB.prepare(
      `SELECT t.id AS transaction_id, t.event_type, t.status, t.created_at, t.posted_at,
              p.amount_atoms, p.currency, a.account_key
       FROM ledger_transactions t
       JOIN ledger_postings p ON p.transaction_id = t.id
       JOIN ledger_accounts a ON a.account_key = p.account_key
       WHERE t.status = 'posted' AND a.owner_user_id = ?
       ORDER BY t.created_at DESC LIMIT ?`,
    ).bind(user.id, limit).all();
    return json({ entries: result.results || [] });
  }

  if (path === "/api/trading/positions" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const result = await env.DB.prepare(
      "SELECT id, symbol, side, status, leverage, quantity_atoms, entry_price_micros, mark_price_micros, reserved_tc, realized_pnl_tc, open_fee_tc, opened_at, closed_at FROM trading_positions WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 100",
    ).bind(user.id).all();
    const now = Date.now();
    const quoteRows = await env.DB.prepare(
      "SELECT symbol, price_micros, provider_timestamp_ms, validation_status, provider FROM market_snapshots WHERE id IN (SELECT id FROM market_snapshots s2 WHERE s2.symbol = market_snapshots.symbol ORDER BY provider_timestamp_ms DESC, received_at DESC LIMIT 1)",
    ).all().catch(() => ({ results: [] }));
    const quotes = new Map((quoteRows.results || []).map((quote) => [quote.symbol, quote]));
    const positions = (result.results || []).map((row) => {
      const entryPriceMicros = Number(row.entry_price_micros);
      const entry = entryPriceMicros / 1000000;
      const allocation = Number(row.reserved_tc);
      const quote = quotes.get(row.symbol);
      const hasFreshQuote = isFreshValidatedQuote(quote, now);
      const markPriceMicros = hasFreshQuote ? Number(quote.price_micros) : Number(row.mark_price_micros);
      const mark = markPriceMicros / 1000000;
      let pnl = null;
      if (hasFreshQuote) {
        try {
          pnl = calculateUnrealizedPnlTc({
            allocationTc: allocation, side: row.side, entryPriceMicros,
            markQuotePriceMicros: markPriceMicros, openFeeTc: Number(row.open_fee_tc || 0),
          });
        } catch {
          pnl = null;
        }
      }
      return { ...row, mark_price_micros: markPriceMicros, amount: allocation, market: row.symbol,
        direction: row.side === "long" ? "Long" : "Short",
        entry, markPrice: mark, unrealizedPnlTc: pnl, quoteStatus: hasFreshQuote ? "live" : "stale",
        quoteProvider: hasFreshQuote ? quote.provider : null,
        time: new Date(row.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        openedAt: row.opened_at, aiManaged: false };
    });
    return json({ positions, serverTime: new Date(now).toISOString() });
  }

  if (path === "/api/trading/history" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const result = await env.DB.prepare(
      "SELECT id, symbol, side, reserved_tc, entry_price_micros, mark_price_micros, realized_pnl_tc, close_return_tc, opened_at, closed_at FROM trading_positions WHERE user_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 100",
    ).bind(user.id).all();
    return json({ history: (result.results || []).map((row) => ({
      id: row.id, market: row.symbol, direction: row.side === "long" ? "Long" : "Short",
      amount: Number(row.reserved_tc), entry: Number(row.entry_price_micros) / 1000000,
      exit: Number(row.mark_price_micros) / 1000000, realizedPnl: Number(row.realized_pnl_tc || 0),
      tcReturned: Number(row.close_return_tc || 0),
      openedAt: row.opened_at, closedAtIso: row.closed_at,
      time: new Date(row.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      closedAt: row.closed_at ? new Date(row.closed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
    })) });
  }

  if (path === "/api/trading/positions" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const side = typeof body?.side === "string" ? body.side.trim().toLowerCase() : "";
    const allocationTc = Number(body?.allocationTc);
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const allowedSymbols = new Set(["BTC/USDT", "ETH/USDT", "SOL/USDT", "DOGE/USDT", "GRAM/USDT"]);
    if (!allowedSymbols.has(symbol) || !["long", "short"].includes(side)) return json({ error: "Choose a supported market and direction." }, 400);
    if (!Number.isSafeInteger(allocationTc) || allocationTc < 1 || allocationTc > 100000000) return json({ error: "Trade Credit allocation must be a whole number between 1 and 100,000,000 TC." }, 400);
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey)) return json({ error: "A valid idempotency key is required." }, 400);

    const existing = await env.DB.prepare(
      "SELECT o.id AS order_id, o.position_id, o.symbol, o.side, o.quantity_atoms, p.status AS position_status FROM trade_orders o LEFT JOIN trading_positions p ON p.id = o.position_id WHERE o.idempotency_key = ? AND o.user_id = ?",
    ).bind(idempotencyKey, user.id).first();
    if (existing) {
      if (existing.symbol !== symbol || existing.side !== side || Number(existing.quantity_atoms) !== allocationTc * 1000000) return json({ error: "This idempotency key was already used for a different order." }, 409);
      const position = await env.DB.prepare(
        "SELECT id, symbol, side, status, leverage, quantity_atoms, entry_price_micros, mark_price_micros, reserved_tc, realized_pnl_tc, opened_at, closed_at FROM trading_positions WHERE id = ? AND user_id = ?",
      ).bind(existing.position_id, user.id).first();
      if (!position) return json({ error: "The original order could not be recovered. Contact support." }, 409);
      if (position.status !== "open") return json({ error: "This idempotency key belongs to a position that is no longer open. Refresh your trade history." }, 409);
      return json({ order: { id: existing.order_id, duplicate: true }, position: {
        ...position, amount: Number(position.reserved_tc), market: position.symbol,
        direction: position.side === "long" ? "Long" : "Short",
        entry: Number(position.entry_price_micros) / 1000000,
        markPrice: Number(position.mark_price_micros) / 1000000,
        time: new Date(position.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        openedAt: position.opened_at, aiManaged: false,
      } });
    }

    const quote = await env.DB.prepare(
      "SELECT price_micros, provider_timestamp_ms, validation_status FROM market_snapshots WHERE symbol = ? ORDER BY provider_timestamp_ms DESC, received_at DESC LIMIT 1",
    ).bind(symbol).first();
    if (!isFreshValidatedQuote(quote, Date.now())) {
      return json({ error: "A fresh, validated market quote is required. Refresh the market and try again." }, 503);
    }
    const balances = await balancesForUser(env, user.id);
    const exposure = await env.DB.prepare(
      "SELECT COUNT(*) AS open_count, COALESCE(SUM(reserved_tc), 0) AS open_reserved_tc FROM trading_positions WHERE user_id = ? AND status = 'open'",
    ).bind(user.id).first();
    const openCount = Number(exposure?.open_count || 0);
    const openReservedTc = Number(exposure?.open_reserved_tc || 0);
    const accountEquityTc = balances.TC + openReservedTc;
    const maxPositionTc = Math.floor(accountEquityTc * MAX_POSITION_EQUITY_BPS / 10000);
    const maxExposureTc = Math.floor(accountEquityTc * MAX_TOTAL_EXPOSURE_EQUITY_BPS / 10000);
    const openFeeTc = calculateTakerFeeTc(allocationTc);
    if (balances.TC < allocationTc + openFeeTc) return json({ error: "Not enough Trade Credits to cover the position and its simulated opening fee." }, 409);
    if (openCount >= MAX_OPEN_POSITIONS) return json({ error: "You have reached the maximum of 5 open practice positions." }, 409);
    if (allocationTc > maxPositionTc) return json({ error: "This position exceeds the current per-position limit of " + maxPositionTc.toLocaleString() + " TC." }, 409);
    if (openReservedTc + allocationTc > maxExposureTc) return json({ error: "This position would exceed the account's total open-exposure limit." }, 409);

    const positionId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    const quotePriceMicros = Number(quote.price_micros);
    const priceMicros = calculateSimulatedFillPrice({ quotePriceMicros, action: side === "long" ? "buy" : "sell" });
    const quantityAtoms = allocationTc * 1000000;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO ledger_transactions (id, idempotency_key, user_id, event_type, status, metadata_json) VALUES (?, ?, ?, 'practice.trade_opened', 'pending', ?)")
          .bind(transactionId, "trade-open:" + idempotencyKey, user.id, JSON.stringify({ symbol, side, allocationTc, priceMicros, leverage: 1 })),
        env.DB.prepare("INSERT INTO ledger_postings (id, transaction_id, account_key, amount_atoms, currency) VALUES (?, ?, ?, ?, 'TC'), (?, ?, 'system:reserve:TC', ?, 'TC'), (?, ?, 'system:fees:TC', ?, 'TC')")
          .bind(crypto.randomUUID(), transactionId, "user:" + user.id + ":TC", -(allocationTc + openFeeTc), crypto.randomUUID(), transactionId, allocationTc, crypto.randomUUID(), transactionId, openFeeTc),
        env.DB.prepare("UPDATE ledger_transactions SET status = 'posted', posted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'")
          .bind(transactionId),
        env.DB.prepare("INSERT INTO trading_positions (id, user_id, symbol, side, status, leverage, quantity_atoms, entry_price_micros, mark_price_micros, reserved_tc, realized_pnl_tc, open_fee_tc, entry_quote_price_micros, open_transaction_id, model_version) VALUES (?, ?, ?, ?, 'open', 1, ?, ?, ?, ?, 0, ?, ?, ?, 'simulation-v3')")
          .bind(positionId, user.id, symbol, side, quantityAtoms, priceMicros, quotePriceMicros, allocationTc, openFeeTc, quotePriceMicros, transactionId),
        env.DB.prepare("INSERT INTO trade_orders (id, user_id, position_id, idempotency_key, symbol, side, order_type, status, quantity_atoms, requested_price_micros, fill_price_micros, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, 'market', 'filled', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
          .bind(orderId, user.id, positionId, idempotencyKey, symbol, side, quantityAtoms, quotePriceMicros, priceMicros),
        env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, 'practice.trade_opened', 'trading_position', ?, ?, ?)")
          .bind(crypto.randomUUID(), user.id, positionId, requestId, JSON.stringify({ symbol, side, allocationTc, quotePriceMicros, fillPriceMicros: priceMicros, openFeeTc, modelVersion: SIMULATION_MODEL_VERSION })),
      ]);
    } catch (error) {
      const winner = await env.DB.prepare("SELECT id, symbol, side, position_id FROM trade_orders WHERE idempotency_key = ? AND user_id = ?").bind(idempotencyKey, user.id).first().catch(() => null);
      if (winner) return json({ error: "This order has already been processed. Refresh your positions before retrying.", orderId: winner.id }, 409);
      if (/insufficient_ledger_balance/i.test(String(error?.message || ""))) return json({ error: "Not enough Trade Credits. Refresh your balance and reduce the allocation." }, 409);
      if (/position_limit_exceeded|position_size_limit_exceeded|total_exposure_limit_exceeded/i.test(String(error?.message || ""))) return json({ error: "This order exceeds the current practice-trading exposure limits. Refresh your balance and open positions." }, 409);
      return json({ error: "The simulated order could not be committed. No position was opened." }, 500);
    }
    return json({ order: { id: orderId, duplicate: false }, position: {
      id: positionId, symbol, market: symbol, side, direction: side === "long" ? "Long" : "Short",
      status: "open", leverage: 1, quantity_atoms: quantityAtoms, quantityAtoms,
      entry_price_micros: priceMicros, mark_price_micros: quotePriceMicros, entry: priceMicros / 1000000,
      markPrice: quotePriceMicros / 1000000, reserved_tc: allocationTc, amount: allocationTc, realized_pnl_tc: 0,
      unrealizedPnlTc: calculateUnrealizedPnlTc({ allocationTc, side, entryPriceMicros: priceMicros, markQuotePriceMicros: quotePriceMicros, openFeeTc }),
      quoteStatus: "live", open_fee_tc: openFeeTc, entry_quote_price_micros: quotePriceMicros, modelVersion: SIMULATION_MODEL_VERSION,
      opened_at: new Date().toISOString(), openedAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), aiManaged: false,
    } }, 201);
  }

  if (path === "/api/trading/positions/close" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const positionId = typeof body?.positionId === "string" ? body.positionId : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!positionId || positionId.length > 100 || !/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey)) {
      return json({ error: "A valid position and idempotency key are required." }, 400);
    }
    const existingOrder = await env.DB.prepare("SELECT id, position_id FROM trade_orders WHERE idempotency_key = ? AND user_id = ?")
      .bind(idempotencyKey, user.id).first();
    if (existingOrder) {
      const position = await env.DB.prepare("SELECT id, symbol, side, status, reserved_tc, entry_price_micros, mark_price_micros, realized_pnl_tc, opened_at, closed_at FROM trading_positions WHERE id = ? AND user_id = ?")
        .bind(existingOrder.position_id, user.id).first();
      if (position?.status === "closed") return json({ closed: true, duplicate: true, position });
      return json({ error: "This close request was already received. Refresh your positions before retrying." }, 409);
    }
    const position = await env.DB.prepare("SELECT * FROM trading_positions WHERE id = ? AND user_id = ?")
      .bind(positionId, user.id).first();
    if (!position) return json({ error: "Position not found." }, 404);
    if (position.status !== "open") return json({ error: "This position is no longer open." }, 409);
    const quote = await env.DB.prepare("SELECT price_micros, provider_timestamp_ms, validation_status FROM market_snapshots WHERE symbol = ? ORDER BY provider_timestamp_ms DESC, received_at DESC LIMIT 1")
      .bind(position.symbol).first();
    if (!isFreshValidatedQuote(quote, Date.now())) {
      return json({ error: "A fresh, validated market quote is required to close this position. Refresh the market and try again." }, 503);
    }
    const exitQuotePriceMicros = Number(quote.price_micros);
    const exitPriceMicros = calculateSimulatedFillPrice({
      quotePriceMicros: exitQuotePriceMicros, action: position.side === "long" ? "sell" : "buy",
    });
    const allocation = Number(position.reserved_tc);
    const entryPriceMicros = Number(position.entry_price_micros);
    let settlement;
    try {
      const beforeFee = calculateRealizedSettlement({ allocationTc: allocation, side: position.side, entryPriceMicros, exitPriceMicros });
      settlement = calculateRealizedSettlement({
        allocationTc: allocation, side: position.side, entryPriceMicros, exitPriceMicros,
        openFeeTc: Number(position.open_fee_tc || 0),
        closeFeeTc: calculateTakerFeeTc(beforeFee.grossReturnedTc),
      });
    } catch {
      return json({ error: "The close settlement could not be calculated safely." }, 500);
    }
    const { returnedTc, realizedPnlTc } = settlement;
    const transactionId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const accountKeys = { user: "user:" + user.id + ":TC", reserve: "system:reserve:TC", issuance: "system:issuance:TC", fees: "system:fees:TC" };
    const sqlPostings = settlement.postings.map((p) => env.DB.prepare(
      "INSERT INTO ledger_postings (id, transaction_id, account_key, amount_atoms, currency) VALUES (?, ?, ?, ?, 'TC')",
    ).bind(crypto.randomUUID(), transactionId, accountKeys[p.account], p.amount));
    const quantityAtoms = Number(position.quantity_atoms);
    const statements = [];
    if (settlement.postings.length) {
      statements.push(env.DB.prepare("INSERT INTO ledger_transactions (id, idempotency_key, user_id, event_type, status, metadata_json) SELECT ?, ?, ?, 'practice.trade_closed', 'pending', ? WHERE EXISTS (SELECT 1 FROM trading_positions WHERE id = ? AND user_id = ? AND status = 'open')")
        .bind(transactionId, "trade-close:" + idempotencyKey, user.id, JSON.stringify({ positionId, exitQuotePriceMicros, exitPriceMicros, realizedPnlTc, returnedTc, closeFeeTc: settlement.closeFeeTc, modelVersion: SIMULATION_MODEL_VERSION }), positionId, user.id));
      statements.push(...sqlPostings);
      statements.push(env.DB.prepare("UPDATE ledger_transactions SET status = 'posted', posted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'").bind(transactionId));
    }
    statements.push(
        env.DB.prepare("UPDATE trading_positions SET status = 'closed', mark_price_micros = ?, realized_pnl_tc = ?, close_return_tc = ?, close_transaction_id = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ? AND status = 'open'")
          .bind(exitPriceMicros, realizedPnlTc, returnedTc, settlement.postings.length ? transactionId : null, positionId, user.id),
        env.DB.prepare("INSERT INTO trade_orders (id, user_id, position_id, idempotency_key, symbol, side, order_type, status, quantity_atoms, requested_price_micros, fill_price_micros, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, 'market', 'filled', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
          .bind(orderId, user.id, positionId, idempotencyKey, position.symbol, position.side, quantityAtoms, exitQuotePriceMicros, exitPriceMicros),
        env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, 'practice.trade_closed', 'trading_position', ?, ?, ?)")
          .bind(crypto.randomUUID(), user.id, positionId, requestId, JSON.stringify({ symbol: position.symbol, side: position.side, allocationTc: allocation, exitQuotePriceMicros, exitPriceMicros, realizedPnlTc, returnedTc, closeFeeTc: settlement.closeFeeTc, modelVersion: SIMULATION_MODEL_VERSION })),
      );
    try {
      await env.DB.batch(statements);
    } catch (error) {
      const current = await env.DB.prepare("SELECT status FROM trading_positions WHERE id = ? AND user_id = ?").bind(positionId, user.id).first().catch(() => null);
      if (current?.status === "closed") return json({ error: "This position has already been closed. Refresh your trade history." }, 409);
      return json({ error: "The position could not be closed. No settlement was applied." }, 500);
    }
    return json({ closed: true, duplicate: false, position: { id: positionId, symbol: position.symbol, market: position.symbol,
      side: position.side, direction: position.side === "long" ? "Long" : "Short", status: "closed",
      reserved_tc: allocation, amount: allocation, entry_price_micros: entryPriceMicros,
      mark_price_micros: exitPriceMicros, entry: entryPriceMicros / 1000000, exit: exitPriceMicros / 1000000,
      realized_pnl_tc: realizedPnlTc, realizedPnl: realizedPnlTc, tcReturned: returnedTc,
      open_fee_tc: Number(position.open_fee_tc || 0), close_fee_tc: settlement.closeFeeTc, modelVersion: SIMULATION_MODEL_VERSION,
      opened_at: position.opened_at, closedAtIso: new Date().toISOString(),
    } });
  }


  if (path === "/api/payments/solana/config" && request.method === "GET") {
    return json({
      enabled: Boolean(env.SOLANA_RECEIVE_ADDRESS),
      network: SOLANA_NETWORK,
      asset: "SOL", quoteCurrency: "USD",
    });
  }

  if (path === "/api/payments/solana/order" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const packageId = typeof body?.packageId === "string" ? body.packageId : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const pack = AI_CREDIT_PACKAGES[packageId];
    if (!pack) return json({ error: "Choose an available AI Credit package." }, 400);
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey)) {
      return json({ error: "A valid idempotency key is required." }, 400);
    }
    const recipient = env.SOLANA_RECEIVE_ADDRESS;
    if (!recipient) return json({ error: "Solana payments are not configured yet." }, 503);
    let payUrl, reference, expectedLamports, solUsdPrice;
    try {
      decodeBase58(recipient);
      const quoteResponse = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { headers: { accept: "application/json" } });
      if (!quoteResponse.ok) throw new Error("SOL_PRICE_UNAVAILABLE");
      const quote = await quoteResponse.json();
      solUsdPrice = Number(quote?.data?.amount);
      if (!Number.isFinite(solUsdPrice) || solUsdPrice <= 0) throw new Error("SOL_PRICE_INVALID");
      expectedLamports = Math.round((pack.usdCents / 100 / solUsdPrice) * 1_000_000_000);
      if (!Number.isSafeInteger(expectedLamports) || expectedLamports <= 0) throw new Error("SOL_AMOUNT_INVALID");
      const referenceBytes = new Uint8Array(32);
      crypto.getRandomValues(referenceBytes);
      reference = encodeBase58(referenceBytes);
      payUrl = makeSolanaPayUrl({ recipient, amountLamports: expectedLamports, reference, label: "Pexoriy", message: `${pack.aiCredits} AI Credits · ${pack.id}` });
    } catch {
      return json({ error: "A live SOL quote is unavailable or the receiving address is invalid. Please retry shortly." }, 503);
    }

    const prior = await env.DB.prepare(
      "SELECT id, status, reference_key, expected_amount_atoms, credited_ac, expires_at, recipient_address, package_id FROM payment_orders WHERE idempotency_key = ? AND user_id = ?",
    ).bind(idempotencyKey, user.id).first();
    if (prior) {
      const priorPack = AI_CREDIT_PACKAGES[prior.package_id || packageId] || pack;
      let priorUrl;
      try {
        priorUrl = makeSolanaPayUrl({
          recipient: prior.recipient_address || recipient,
          amountLamports: Number(prior.expected_amount_atoms),
          reference: prior.reference_key,
          label: "Pexoriy",
          message: `${priorPack.aiCredits} AI Credits · ${priorPack.id}`,
        });
      } catch {
        return json({ error: "This payment order needs support review." }, 409);
      }
      return json({
        order: { id: prior.id, status: prior.status, asset: "SOL", network: SOLANA_NETWORK,
          expectedAmountAtoms: Number(prior.expected_amount_atoms), amountSol: formatLamports(Number(prior.expected_amount_atoms)), aiCredits: Number(prior.credited_ac || priorPack.aiCredits),
          expiresAt: prior.expires_at, paymentUrl: priorUrl },
        reused: true,
      });
    }

    const orderId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders
          (id, user_id, idempotency_key, provider, network, asset, expected_amount_atoms,
           usd_equivalent_micros, status, reference_key, token_mint, package_id, credited_ac,
           expires_at, recipient_address)
         VALUES (?, ?, ?, 'solana-rpc', ?, 'SOL', ?, ?, 'created', ?, NULL, ?, ?, ?, ?)`,
      ).bind(
        orderId, user.id, idempotencyKey, SOLANA_NETWORK, expectedLamports,
        pack.usdCents * 10_000, reference, pack.id, pack.aiCredits,
        expiresAt, recipient,
      ).run();
      await appendAudit(env, {
        actorUserId: user.id, eventType: "payment.solana_order_created", entityType: "payment_order",
        entityId: orderId, requestId, details: { packageId: pack.id, asset: "SOL", network: SOLANA_NETWORK },
      });
    } catch (error) {
      const priorAfterRace = await env.DB.prepare(
        "SELECT id, status, reference_key, expected_amount_atoms, credited_ac, expires_at, recipient_address, package_id FROM payment_orders WHERE idempotency_key = ? AND user_id = ?",
      ).bind(idempotencyKey, user.id).first();
      if (!priorAfterRace) throw error;
      const racedPack = AI_CREDIT_PACKAGES[priorAfterRace.package_id] || pack;
      return json({ order: {
        id: priorAfterRace.id, status: priorAfterRace.status, asset: "SOL", network: SOLANA_NETWORK,
        expectedAmountAtoms: Number(priorAfterRace.expected_amount_atoms), amountSol: formatLamports(Number(priorAfterRace.expected_amount_atoms)), aiCredits: racedPack.aiCredits,
        expiresAt: priorAfterRace.expires_at,
        paymentUrl: makeSolanaPayUrl({ recipient: priorAfterRace.recipient_address || recipient,
          amountLamports: Number(priorAfterRace.expected_amount_atoms), reference: priorAfterRace.reference_key,
          label: "Pexoriy", message: `${racedPack.aiCredits} AI Credits · ${racedPack.id}` }),
      }, reused: true });
    }

    return json({
      order: {
        id: orderId, status: "created", asset: "SOL", network: SOLANA_NETWORK,
        expectedAmountAtoms: expectedLamports, amountSol: formatLamports(expectedLamports), amountUsd: (pack.usdCents / 100).toFixed(2), quotedSolUsd: solUsdPrice,
        aiCredits: pack.aiCredits, expiresAt, paymentUrl: payUrl,
      },
      instructions: "Open the payment link in a compatible Solana wallet. Credits are added only after server-side verification.",
    }, 201);
  }

  if (path === "/api/payments/solana/verify" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "A valid payment order is required." }, 400);

    const order = await env.DB.prepare(
      "SELECT * FROM payment_orders WHERE id = ? AND user_id = ?",
    ).bind(orderId, user.id).first();
    if (!order) return json({ error: "Payment order not found." }, 404);
    if (order.status === "credited") {
      return json({ status: "credited", aiCredits: Number(order.credited_ac), duplicate: true });
    }
    if (["underpaid", "overpaid", "review", "refunded", "reversed"].includes(order.status)) {
      return json({ status: order.status, message: "This payment needs support review." }, 409);
    }
    // Public Solana RPC is a fail-closed bootstrap; set SOLANA_RPC_URL to a dedicated provider for production volume.
    const rpcUrl = env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const rpc = async (method, params) => {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      });
      if (!response.ok) throw new Error("SOLANA_RPC_HTTP_ERROR");
      const payload = await response.json();
      if (payload.error) throw new Error("SOLANA_RPC_ERROR");
      return payload.result;
    };

    let signatures;
    try {
      signatures = await rpc("getSignaturesForAddress", [
        order.reference_key, { commitment: "finalized", limit: 20 },
      ]);
    } catch {
      return json({ error: "The Solana network could not be checked. Please retry shortly." }, 503);
    }
    let match = null;
    let mismatch = null;
    for (const item of signatures || []) {
      if (!item?.signature || item.err) continue;
      if (order.tx_hash && order.tx_hash !== item.signature) continue;
      let transaction;
      try {
        transaction = await rpc("getTransaction", [
          item.signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]);
      } catch {
        continue;
      }
      if (!transaction || transaction.meta?.err) continue;
      try {
        const validation = validateSolPaymentTransaction(transaction, {
          recipient: order.recipient_address,
          reference: order.reference_key,
          expectedLamports: Number(order.expected_amount_atoms),
        });
        if (validation.valid) {
          match = { signature: item.signature, slot: Number(transaction.slot) };
          break;
        }
        if (Number(validation.receivedLamports) > 0) {
          mismatch = { signature: item.signature, slot: Number(transaction.slot), reason: validation.reason, receivedLamports: validation.receivedLamports };
        }
      } catch {
        // A transaction with a matching reference but wrong mint/recipient is never credited.
      }
    }

    if (!match && mismatch) {
      const status = mismatch.reason === "underpaid" ? "underpaid" : "overpaid";
      await env.DB.prepare(
        "UPDATE payment_orders SET received_amount_atoms = ?, status = ? WHERE id = ? AND status IN ('created','pending')",
      ).bind(Number(mismatch.receivedLamports), status, order.id).run();
      await recordSolanaPaymentEvent(env, {
        orderId: order.id, signature: mismatch.signature, eventType: "transaction.amount_mismatch",
        processingStatus: "review", slot: mismatch.slot,
      });
      await appendAudit(env, {
        actorUserId: user.id, eventType: `payment.solana_${status}`, entityType: "payment_order",
        entityId: order.id, requestId, details: { signature: mismatch.signature, slot: mismatch.slot, receivedLamports: mismatch.receivedLamports },
      });
      return json({
        status,
        message: "A SOL transfer was found, but its amount does not exactly match this order. No credits were added. Create a new order if the quote has expired, or contact support.",
      }, 409);
    }
    if (!match) {
      if (Date.parse(order.expires_at || 0) <= Date.now()) {
        await env.DB.prepare("UPDATE payment_orders SET status = 'failed' WHERE id = ? AND status IN ('created','pending')")
          .bind(order.id).run();
        return json({ status: "expired", message: "No matching finalized payment was found before this request expired. Create a new order." }, 410);
      }
      if (order.status === "created") {
        await env.DB.prepare("UPDATE payment_orders SET status = 'pending' WHERE id = ? AND status = 'created'").bind(order.id).run();
      }
      return json({ status: "pending", message: "No matching finalized payment was found yet. You can safely check again." }, 202);
    }

    try {
      await env.DB.prepare(
        "UPDATE payment_orders SET status = 'confirmed', tx_hash = ?, received_amount_atoms = expected_amount_atoms, confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), confirmed_slot = ?, chain_finality = 'finalized' WHERE id = ? AND tx_hash IS NULL AND status IN ('created','pending','confirmed')",
      ).bind(match.signature, match.slot, order.id).run();
    } catch {
      // A concurrent verifier may already have confirmed or credited this exact transaction.
    }

    const latestConfirmation = await env.DB.prepare(
      "SELECT status, tx_hash FROM payment_orders WHERE id = ?",
    ).bind(order.id).first();
    if (latestConfirmation?.tx_hash !== match.signature) {
      // A different signature cannot claim this order, but must not interrupt the first
      // verifier that already bound a valid finalized transaction to it.
      if (latestConfirmation && !latestConfirmation.tx_hash && latestConfirmation.status !== "credited") {
        await env.DB.prepare(
          "UPDATE payment_orders SET status = 'review' WHERE id = ? AND tx_hash IS NULL AND status <> 'credited'",
        ).bind(order.id).run();
      }
      return json({ status: "review", message: "This transaction is already associated with another payment or needs review." }, 409);
    }
    if (latestConfirmation.status === "credited") {
      return json({ status: "credited", aiCredits: Number(order.credited_ac), duplicate: true });
    }
    if (latestConfirmation.status !== "confirmed") {
      return json({ status: "review", message: "Payment confirmation needs support review before credits can be issued." }, 409);
    }

    await recordSolanaPaymentEvent(env, {
      orderId: order.id, signature: match.signature, eventType: "transaction.payment_verified",
      processingStatus: "processed", slot: match.slot,
    });
    const ledgerTransactionId = crypto.randomUUID();
    const idempotencyKey = "solana-sol-payment:" + order.id + ":ai-credits";
    let ledgerResult;
    try {
      ledgerResult = await postLedgerTransaction(env.DB, {
        id: ledgerTransactionId,
        idempotencyKey,
        userId: user.id,
        eventType: "payment.ai_credits_purchased",
        metadata: { paymentOrderId: order.id, chain: SOLANA_NETWORK, signature: match.signature, packageId: order.package_id },
        postings: [
          { accountKey: "user:" + user.id + ":AC", currency: "AC", amountAtoms: Number(order.credited_ac) },
          { accountKey: "system:issuance:AC", currency: "AC", amountAtoms: -Number(order.credited_ac) },
        ],
      });
    } catch {
      // Keep the payment confirmed, not credited. A retry safely resumes via the ledger idempotency key.
      return json({ status: "confirmed", message: "Payment verified. Account credit is retrying safely; check again shortly." }, 202);
    }

    const postedLedger = await env.DB.prepare(
      "SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?",
    ).bind(idempotencyKey).first();
    if (!postedLedger || postedLedger.status !== "posted" || postedLedger.id !== ledgerResult.transactionId) {
      return json({ status: "confirmed", message: "Payment verified. Account credit is reconciling; check again shortly." }, 202);
    }

    try {
      const creditUpdate = await env.DB.prepare(
        "UPDATE payment_orders SET status = 'credited', credited_transaction_id = ? WHERE id = ? AND status = 'confirmed' AND tx_hash = ? AND chain_finality = 'finalized'",
      ).bind(postedLedger.id, order.id, match.signature).run();
      if (Number(creditUpdate.meta?.changes || 0) !== 1) {
        const latestOrder = await env.DB.prepare(
          "SELECT status, credited_ac FROM payment_orders WHERE id = ?",
        ).bind(order.id).first();
        if (latestOrder?.status === "credited") {
          return json({ status: "credited", aiCredits: Number(latestOrder.credited_ac), duplicate: true });
        }
        return json({ status: "review", message: "Payment is verified but its order state changed during crediting. Please contact support." }, 409);
      }
    } catch {
      const latestOrder = await env.DB.prepare(
        "SELECT status, credited_ac FROM payment_orders WHERE id = ?",
      ).bind(order.id).first();
      if (latestOrder?.status === "credited") {
        return json({ status: "credited", aiCredits: Number(latestOrder.credited_ac), duplicate: true });
      }
      // If the credit status write failed, the immutable ledger transaction makes the next retry safe.
      return json({ status: "confirmed", message: "Payment verified. Account credit is reconciling; check again shortly." }, 202);
    }

    await appendAudit(env, {
      actorUserId: user.id, eventType: "payment.solana_credited", entityType: "payment_order",
      entityId: order.id, requestId, details: { signature: match.signature, slot: match.slot, aiCredits: Number(order.credited_ac) },
    });
    return json({ status: "credited", aiCredits: Number(order.credited_ac), signature: match.signature });
  }

  if (path === "/api/payments/solana/orders" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const result = await env.DB.prepare(
      "SELECT id, network, asset, expected_amount_atoms, credited_ac, status, expires_at, tx_hash, created_at, reference_key, recipient_address, package_id FROM payment_orders WHERE user_id = ? AND network = ? ORDER BY created_at DESC LIMIT 25",
    ).bind(user.id, SOLANA_NETWORK).all();
    const orders = (result.results || []).map((row) => {
      const pack = AI_CREDIT_PACKAGES[row.package_id];
      const amountLamports = Number(row.expected_amount_atoms);
      return {
        id: row.id,
        network: row.network,
        asset: row.asset,
        status: row.status,
        expectedAmountAtoms: amountLamports,
        amountSol: formatLamports(amountLamports),
        aiCredits: Number(row.credited_ac || pack?.aiCredits || 0),
        expiresAt: row.expires_at,
        txHash: row.tx_hash,
        createdAt: row.created_at,
        paymentUrl: pack && row.reference_key && row.recipient_address
          ? makeSolanaPayUrl({
              recipient: row.recipient_address,
              amountLamports,
              reference: row.reference_key,
              label: "Pexoriy",
              message: String(pack.aiCredits) + " AI Credits · " + pack.id,
            })
          : null,
      };
    });
    return json({ orders });
  }

  return json({ error: "API route not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "api.unhandled_error", message: String(error?.message || "unknown") }));
        return json({ error: "The request could not be completed." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
