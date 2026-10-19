import { postLedgerTransaction, getLedgerBalance } from "./ledger.js";
import { TON_NETWORK, TON_RECEIVE_ADDRESS, normalizeTonAddress, formatNanoTon, makeTonComment, validateTonIncomingTransaction } from "./ton-payments.js";
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
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function consumeAuthRateLimit(request, env, scope, identity, limit, windowSeconds) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown-client";
  const keyHash = await sha256Hex([scope, ip, String(identity || "").trim().toLowerCase()].join("|"));
  const now = Math.floor(Date.now() / 1000);
  const sql = "INSERT INTO auth_rate_limits (key_hash, window_started_at, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(key_hash) DO UPDATE SET " +
    "attempts = CASE WHEN auth_rate_limits.window_started_at <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END, " +
    "window_started_at = CASE WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END " +
    "RETURNING attempts";
  const row = await env.DB.prepare(sql).bind(keyHash, now, now - windowSeconds, now - windowSeconds).first();
  return Number(row?.attempts || 0) <= limit;
}


function authEmailConfigured(env) {
  return typeof env.EMAIL?.send === "function" && typeof env.AUTH_EMAIL_FROM === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.AUTH_EMAIL_FROM.trim());
}
async function sendAuthEmail(env, to, subject, link, purpose) {
  if (!authEmailConfigured(env)) return false;
  const verify=purpose==="email_verification", action=verify?"verify your email address":"reset your password";
  const text="Use this secure Pexoriy link to "+action+":\n\n"+link+"\n\nThis link expires shortly and can be used once. If you did not request this, ignore this email.";
  const html="<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#20221c\"><h1 style=\"color:#7dbb29\">Pexoriy</h1><p>Use the link below to "+action+".</p><p><a href=\""+link+"\" style=\"display:inline-block;padding:12px 18px;background:#b7f34a;color:#171912;text-decoration:none;border-radius:8px;font-weight:700\">"+(verify?"Verify email":"Reset password")+"</a></p><p>This link expires shortly and can be used once.</p><p>If you did not request this, ignore this email. Pexoriy will never ask for your password, private key, or seed phrase.</p></div>";
  try { await env.EMAIL.send({to,from:{email:env.AUTH_EMAIL_FROM.trim(),name:"Pexoriy"},subject,text,html}); return true; }
  catch(error) { console.error("Pexoriy transactional email failed:",error?.code||"delivery_error"); return false; }
}
async function issueAuthToken(env, request, userId, purpose) {
  const token=randomHex(32), tokenHash=await sha256Hex(token), expiresAt=new Date(Date.now()+(purpose==="email_verification"?60:30)*60*1000).toISOString(), id=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose=? AND consumed_at IS NULL").bind(userId,purpose),
    env.DB.prepare("INSERT INTO auth_tokens (id,user_id,purpose,token_hash,expires_at) VALUES (?,?,?,?,?)").bind(id,userId,purpose,tokenHash,expiresAt),
  ]);
  const url=new URL(request.url);url.pathname="/";url.search="";url.searchParams.set("auth",purpose==="email_verification"?"verify":"reset");url.searchParams.set("token",token);
  const account=await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(userId).first();
  return {sent:await sendAuthEmail(env,account?.email||"",purpose==="email_verification"?"Verify your Pexoriy email":"Reset your Pexoriy password",url.toString(),purpose),expiresAt};
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

const PEXORIY_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAACdUlEQVR42u3dy1UCQRRFUbtWz2GRgIEQiREaiYGYiVMHOhCpep/aJwI+m1stgh7X2+VF+qnhIRAcgkNwCA7BITgEh+AQHIJDgkNwCA7BITgEh+AQHOramerWvH/eN38+3l4/8tyYI/wDxkCkhRKGg4n8SgJwYFGFyFIcWNQiMsio1cqHccVyYFF0QgYZJiQGBxmlH95BBh+rcZDRwMcgg491OMho42OQwUfYj7Kq28gsV7FPwSCDD8eKgnCYjZbjYTk0E4fZ6DoelkNwaD0OZ0rjk8VyCA7BoSw4XHD0vuywHIJDcAgOwSE4BIfgEBxq31nr5qb6e2p/quK7yafXx2LWhZQ4VgKUVNk/OJyPcPABBx9w8AEHH3Aopw84+IBDcBiPJ7bd2+ePvXtd93c6lkNwOFngEByCQ3AIDsEhwSE4BIfgEByCQ99K9ZUnOPRr232eY89PZlgOZwocgsNswKGkMuAgAw4y4CADDjLgICM6fzAOCziYgMNT65pDcAgOwSE4BIfgEBwSHIJDcAgOwSE4BIfgEByCQ4JDcAgOwSE4BIfgEBxqV7GvQ+75tUTLITgEh+AQHIJDgkNwKBCH/12SvH8+QZZDcAgOJcLhsqPrBYflEByKwuFkaXmmWA7Nx2E8+s2G5dASHMaj2Ww8eTn46CTDsaKFOIxHm9mYshx89JAx61jho4GMidccfFSXMfeClI/SMqb/tMJH6Yd3VL8DZMzruN4ua+6ML8iXe72NfneJjHrLYULKvboCcCBSZXTDcFCS/yCOxwFK2iuzXDiUKr+yFxyCQ3AIDsEhOASH4BAcgkOCQ3AIDsEhOASH4BAcatsXTvunfsDp5OUAAAAASUVORK5CYII=";
const AI_MODEL_NAME = "@cf/google/gemma-4-26b-a4b-it";
const AI_TRADE_RESERVATION_ATOMS = 3; // 1.5 displayed AC; migration 0007 defines 2 ledger atoms per displayed AC.
const AI_ALLOWED_SYMBOLS = new Set(["BTC/USDT", "ETH/USDT", "SOL/USDT", "DOGE/USDT", "GRAM/USDT"]);
const AI_ALLOWED_RISKS = new Set(["Cautious", "Balanced", "Aggressive"]);

async function releaseAIReservation(env, userId, operation, finalStatus, requestId) {
  const amount = Number(operation?.reserved_credits || 0);
  if (!operation?.id || amount <= 0) throw new Error("AI_RESERVATION_INVALID");
  const result = await postLedgerTransaction(env.DB, {
    id: crypto.randomUUID(),
    idempotencyKey: "ai-reservation-release:" + operation.id,
    userId,
    eventType: "ai.credits_released",
    metadata: { operationId: operation.id, reason: finalStatus },
    postings: [
      { accountKey: "user:" + userId + ":AC", currency: "AC", amountAtoms: amount },
      { accountKey: "system:reserve:AC", currency: "AC", amountAtoms: -amount },
    ],
  });
  const posted = await env.DB.prepare("SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?")
    .bind("ai-reservation-release:" + operation.id).first();
  if (!posted || posted.status !== "posted" || posted.id !== result.transactionId) throw new Error("AI_RELEASE_NOT_POSTED");
  await env.DB.prepare(
    "UPDATE ai_operations SET status = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'reserved'",
  ).bind(finalStatus, operation.id).run();
  await appendAudit(env, {
    actorUserId: userId, eventType: "ai.reservation_released", entityType: "ai_operation",
    entityId: operation.id, requestId, details: { releasedAtoms: amount, finalStatus },
  });
  return result.transactionId;
}

async function chargeAIReservation(env, userId, operation, requestId) {
  const amount = Number(operation?.reserved_credits || 0);
  if (!operation?.id || amount <= 0) throw new Error("AI_RESERVATION_INVALID");
  const result = await postLedgerTransaction(env.DB, {
    id: crypto.randomUUID(),
    idempotencyKey: "ai-reservation-charge:" + operation.id,
    userId,
    eventType: "ai.trade_fee_charged",
    metadata: { operationId: operation.id, chargedAtoms: amount },
    postings: [
      { accountKey: "system:reserve:AC", currency: "AC", amountAtoms: -amount },
      { accountKey: "system:fees:AC", currency: "AC", amountAtoms: amount },
    ],
  });
  const posted = await env.DB.prepare("SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?")
    .bind("ai-reservation-charge:" + operation.id).first();
  if (!posted || posted.status !== "posted" || posted.id !== result.transactionId) throw new Error("AI_CHARGE_NOT_POSTED");
  await env.DB.prepare(
    "UPDATE ai_operations SET status = 'succeeded', charged_credits = reserved_credits, ledger_transaction_id = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'reserved'",
  ).bind(posted.id, operation.id).run();
  await appendAudit(env, {
    actorUserId: userId, eventType: "ai.trade_fee_charged", entityType: "ai_operation",
    entityId: operation.id, requestId, details: { chargedAtoms: amount, chargedAC: amount / 2 },
  });
  return posted.id;
}

async function reconcileStaleAIReservations(env, userId, requestId) {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare(
    "SELECT p.*, o.reserved_credits, o.status AS operation_status FROM ai_trade_proposals p JOIN ai_operations o ON o.id = p.operation_id WHERE p.user_id = ? AND p.status = 'pending' AND p.expires_at <= ?",
  ).bind(userId, now).all();
  for (const proposal of expired.results || []) {
    const operation = await env.DB.prepare("SELECT * FROM ai_operations WHERE id = ?").bind(proposal.operation_id).first();
    if (operation?.status === "reserved") {
      try { await releaseAIReservation(env, userId, operation, "cancelled", requestId); }
      catch { continue; }
    }
    await env.DB.prepare("UPDATE ai_trade_proposals SET status='expired' WHERE id=? AND status='pending'").bind(proposal.id).run();
  }
  const orphaned = await env.DB.prepare(
    "SELECT o.* FROM ai_operations o LEFT JOIN ai_trade_proposals p ON p.operation_id = o.id WHERE o.user_id = ? AND o.status = 'reserved' AND p.id IS NULL AND datetime(o.created_at) < datetime('now','-15 minutes')",
  ).bind(userId).all();
  for (const operation of orphaned.results || []) {
    const reservation = await env.DB.prepare("SELECT status FROM ledger_transactions WHERE idempotency_key = ?")
      .bind("ai-reservation:" + operation.id).first();
    if (reservation?.status === "posted") {
      try { await releaseAIReservation(env, userId, operation, "failed", requestId); } catch {}
    } else {
      await env.DB.prepare("UPDATE ai_operations SET status='failed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='reserved'")
        .bind(operation.id).run();
    }
  }
}

async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.status, u.email_verified_at, s.id AS session_id, s.expires_at
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
    if (Object.hasOwn(balances, row.currency)) balances[row.currency] = row.currency === "AC" ? Number(row.balance) / 2 : Number(row.balance);
  }
  return balances;
}

async function publicUser(env, user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: Boolean(user.email_verified_at),
    balances: await balancesForUser(env, user.id),
  };
}

async function activateReferralForUser(env, user, requestId) {
  if (!user?.email_verified_at) return { status: "pending", message: "Verify your email before referral activation can be checked." };
  const qualifyingTrade = await env.DB.prepare("SELECT id FROM trading_positions WHERE user_id = ? LIMIT 1").bind(user.id).first();
  if (!qualifyingTrade) return { status: "pending", message: "Complete your first simulated trade to qualify." };
  const attribution = await env.DB.prepare("SELECT id, referrer_user_id, status FROM referral_attributions WHERE referred_user_id = ?").bind(user.id).first();
  if (!attribution) return { status: "not_referred", message: "No referral is attached to this account." };
  if (attribution.referrer_user_id === user.id) return { status: "rejected", message: "Self-referrals are not eligible." };
  if (attribution.status === "pending") {
    await env.DB.prepare("UPDATE referral_attributions SET status='activated', activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(attribution.id).run();
  }
  const latest = await env.DB.prepare("SELECT status FROM referral_attributions WHERE id=?").bind(attribution.id).first();
  if (latest?.status !== "activated") return { status: latest?.status || "pending" };
  const referrerId = attribution.referrer_user_id;
  try {
    await postLedgerTransaction(env.DB, { id: crypto.randomUUID(), idempotencyKey: "referral:" + attribution.id + ":referrer", userId: referrerId, eventType: "referral.activation_reward", metadata: { attributionId: attribution.id, role: "referrer" }, postings: [{ accountKey: "user:" + referrerId + ":TC", currency: "TC", amountAtoms: 250 }, { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -250 }] });
    await postLedgerTransaction(env.DB, { id: crypto.randomUUID(), idempotencyKey: "referral:" + attribution.id + ":referred", userId: user.id, eventType: "referral.activation_reward", metadata: { attributionId: attribution.id, role: "referred" }, postings: [{ accountKey: "user:" + user.id + ":TC", currency: "TC", amountAtoms: 100 }, { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -100 }] });
  } catch {
    return { status: "activated", rewardStatus: "retrying", message: "Your activation is recorded. Reward delivery will retry safely." };
  }
  try {
    await appendAudit(env, { actorUserId: user.id, eventType: "referral.activated", entityType: "referral_attribution", entityId: attribution.id, requestId, details: { referrerRewardTC: 250, referredRewardTC: 100 } });
  } catch {}
  return { status: "activated", rewardStatus: "paid", referrerRewardTC: 250, referredRewardTC: 100 };
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
    if (!(await consumeAuthRateLimit(request,env,"register-ip","",8,3600))) return json({error:"Too many account-creation attempts. Please wait before trying again."},429,{"retry-after":"3600"});
    const body=await readJson(request),email=typeof body?.email==="string"?body.email.trim().toLowerCase():"",displayName=typeof body?.displayName==="string"?body.displayName.trim():"",password=typeof body?.password==="string"?body.password:"";
    const referralCode = typeof body?.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";
    if (referralCode && !/^[A-F0-9]{8,16}$/.test(referralCode)) return json({ error: "This referral code is invalid." }, 400);
    const referralSchema = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='referral_codes'").first().catch(() => null);
    if (referralCode && !referralSchema) return json({ error: "Referral sign-up is temporarily unavailable. Please try again shortly." }, 503);
    const referralOwner = referralCode && referralSchema ? await env.DB.prepare("SELECT user_id FROM referral_codes WHERE code = ?").bind(referralCode).first() : null;
    if (referralCode && !referralOwner) return json({ error: "This referral code is not recognised." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return json({error:"Enter a valid email address."},400);
    if (displayName.length<2||displayName.length>60) return json({error:"Display name must be between 2 and 60 characters."},400);
    if (password.length<12||password.length>128) return json({error:"Password must be 12–128 characters."},400);
    if (!(await consumeAuthRateLimit(request,env,"register-email",email,3,3600))) return json({error:"Too many account-creation attempts. Please wait before trying again."},429,{"retry-after":"3600"});
    const testBypass=env.PEXORIY_TEST_AUTH_BYPASS==="1";
    
    const userId=crypto.randomUUID(),sessionId=crypto.randomUUID(),token=randomHex(32),salt=randomHex(16),hash=await passwordHash(password,salt),tokenHash=await sha256Hex(token),expiresAt=new Date(Date.now()+SESSION_TTL_SECONDS*1000).toISOString();
    try {
      const tcTx=crypto.randomUUID(),acTx=crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id,email,display_name,password_salt,password_hash,email_verified_at) VALUES (?,?,?,?,?,?)").bind(userId,email,displayName,salt,hash,testBypass?new Date().toISOString():null),
        ...(referralSchema ? [env.DB.prepare("INSERT INTO referral_codes (user_id, code) VALUES (?, ?)").bind(userId, randomHex(6).toUpperCase())] : []),
        ...(referralOwner && referralOwner.user_id !== userId ? [env.DB.prepare("INSERT INTO referral_attributions (id, referrer_user_id, referred_user_id, referral_code, status) VALUES (?, ?, ?, ?, 'pending')").bind(crypto.randomUUID(), referralOwner.user_id, userId, referralCode)] : []),
        env.DB.prepare("INSERT INTO ledger_accounts (account_key,owner_user_id,currency,account_type) VALUES (?,?,'TC','user'),(?,?,'AC','user'),(?,?,'PXY','user')").bind("user:"+userId+":TC",userId,"user:"+userId+":AC",userId,"user:"+userId+":PXY",userId),
        env.DB.prepare("INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)").bind(sessionId,userId,tokenHash,expiresAt),
        env.DB.prepare("INSERT INTO audit_events (id,actor_user_id,event_type,entity_type,entity_id,request_id,details_json) VALUES (?,?,'account.registered','user',?,?,'{}')").bind(crypto.randomUUID(),userId,userId,requestId),
        env.DB.prepare("INSERT INTO ledger_transactions (id,idempotency_key,user_id,event_type,status,metadata_json) VALUES (?, ?, ?, 'account.welcome_tc_issued','pending','{}'),(?, ?, ?, 'account.welcome_ac_issued','pending','{}')").bind(tcTx,"welcome-tc:"+userId,userId,acTx,"welcome-ac:"+userId,userId),
        env.DB.prepare("INSERT INTO ledger_postings (id,transaction_id,account_key,amount_atoms,currency) VALUES (?, ?, ?, 12450,'TC'),(?, ?, 'system:issuance:TC',-12450,'TC'),(?, ?, ?,1680,'AC'),(?, ?, 'system:issuance:AC',-1680,'AC')").bind(crypto.randomUUID(),tcTx,"user:"+userId+":TC",crypto.randomUUID(),tcTx,crypto.randomUUID(),acTx,"user:"+userId+":AC",crypto.randomUUID(),acTx),
        env.DB.prepare("UPDATE ledger_transactions SET status='posted',posted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (?,?)").bind(tcTx,acTx),
      ]);
    } catch(error) {
      if (/unique|constraint/i.test(String(error?.message||""))) return json({ok:true,verificationRequired:true,message:"If this address can be registered, verification instructions will be sent. If you already have an account, sign in."},202);
      return json({error:"Account creation could not be completed."},500);
    }
    const user={id:userId,email,display_name:displayName,email_verified_at:testBypass?new Date().toISOString():null};
    return json({user:await publicUser(env,user)},201,{"set-cookie":sessionCookie(token)});
  }

  if (path === "/api/auth/verify-email" && request.method === "POST") {
    if(!(await consumeAuthRateLimit(request,env,"verify-ip","",10,3600)))return json({error:"Too many verification attempts. Request a new link later."},429,{"retry-after":"3600"});
    const body=await readJson(request),raw=typeof body?.token==="string"?body.token.trim():"";
    if(!/^[a-f0-9]{64}$/i.test(raw))return json({error:"This verification link is invalid or expired. Request a new one."},400);
    const hash=await sha256Hex(raw),record=await env.DB.prepare("SELECT id,user_id,expires_at,consumed_at FROM auth_tokens WHERE token_hash=? AND purpose='email_verification'").bind(hash).first();
    if(!record||record.consumed_at||Date.parse(record.expires_at)<=Date.now())return json({error:"This verification link is invalid or expired. Request a new one."},400);
    const marker=new Date().toISOString()+"#"+crypto.randomUUID(),verifiedAt=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?").bind(marker,record.id,verifiedAt),
      env.DB.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND EXISTS (SELECT 1 FROM auth_tokens WHERE id=? AND consumed_at=?)").bind(verifiedAt,record.user_id,record.id,marker),
    ]);
    const verified=await env.DB.prepare("SELECT email_verified_at FROM users WHERE id=?").bind(record.user_id).first();
    if(!verified?.email_verified_at)return json({error:"This verification link has already been used or expired. Request a new one."},400);
    await appendAudit(env,{actorUserId:record.user_id,eventType:"auth.email_verified",entityType:"user",entityId:record.user_id,requestId});
    return json({ok:true,message:"Email verified. You can now sign in securely."});
  }

  if (path === "/api/auth/resend-verification" && request.method === "POST") {
    const body=await readJson(request),email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    if(!(await consumeAuthRateLimit(request,env,"resend-ip","",5,3600))||!(await consumeAuthRateLimit(request,env,"resend-email",email,3,3600)))return json({error:"Too many requests. Please wait before trying again."},429,{"retry-after":"3600"});
    if(!authEmailConfigured(env))return json({error:"Email delivery is not configured yet. Verification links cannot be sent."},503);
    const user=await env.DB.prepare("SELECT id,email_verified_at FROM users WHERE email=?").bind(email).first();
    if(user&&!user.email_verified_at)await issueAuthToken(env,request,user.id,"email_verification");
    return json({ok:true,message:"If the account needs verification, a new link will be sent."});
  }

  if (path === "/api/auth/forgot-password" && request.method === "POST") {
    const body=await readJson(request),email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    if(!(await consumeAuthRateLimit(request,env,"forgot-ip","",5,3600))||!(await consumeAuthRateLimit(request,env,"forgot-email",email,3,3600)))return json({error:"Too many recovery requests. Please wait before trying again."},429,{"retry-after":"3600"});
    if(!authEmailConfigured(env))return json({error:"Password recovery email is not configured yet."},503);
    const user=await env.DB.prepare("SELECT id,email_verified_at FROM users WHERE email=? AND status='active'").bind(email).first();
    if(user?.email_verified_at)await issueAuthToken(env,request,user.id,"password_reset");
    return json({ok:true,message:"If a verified account matches that address, password reset instructions will be sent."});
  }

  if (path === "/api/auth/reset-password" && request.method === "POST") {
    if(!(await consumeAuthRateLimit(request,env,"reset-ip","",10,3600)))return json({error:"Too many password reset attempts. Request a new link later."},429,{"retry-after":"3600"});
    const body=await readJson(request),raw=typeof body?.token==="string"?body.token.trim():"",password=typeof body?.password==="string"?body.password:"";
    if(!/^[a-f0-9]{64}$/i.test(raw))return json({error:"This reset link is invalid or expired. Request a new one."},400);
    if(password.length<12||password.length>128)return json({error:"Password must be 12–128 characters."},400);
    const tokenHash=await sha256Hex(raw),record=await env.DB.prepare("SELECT id,user_id,expires_at,consumed_at FROM auth_tokens WHERE token_hash=? AND purpose='password_reset'").bind(tokenHash).first();
    if(!record||record.consumed_at||Date.parse(record.expires_at)<=Date.now())return json({error:"This reset link is invalid or expired. Request a new one."},400);
    const salt=randomHex(16),hash=await passwordHash(password,salt),marker=new Date().toISOString()+"#"+crypto.randomUUID(),nowIso=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?").bind(marker,record.id,nowIso),
      env.DB.prepare("UPDATE users SET password_salt=?,password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND EXISTS (SELECT 1 FROM auth_tokens WHERE id=? AND consumed_at=?)").bind(salt,hash,record.user_id,record.id,marker),
      env.DB.prepare("UPDATE auth_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND revoked_at IS NULL").bind(record.user_id),
    ]);
    const changed=await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(record.user_id).first();
    if(!changed||!constantTimeEqual(changed.password_hash,hash))return json({error:"This reset link has already been used or expired. Request a new one."},400);
    await appendAudit(env,{actorUserId:record.user_id,eventType:"auth.password_reset",entityType:"user",entityId:record.user_id,requestId});
    return json({ok:true,message:"Password updated. Sign in with your new password."},200,{"set-cookie":clearSessionCookie()});
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!(await consumeAuthRateLimit(request, env, "login-ip", "", 12, 900)) ||
        !(await consumeAuthRateLimit(request, env, "login-email", email, 5, 900))) {
      return json({ error: "Too many sign-in attempts. Please wait before trying again." }, 429, { "retry-after": "900" });
    }
    if (!email || !password || password.length > 128) return json({ error: "Email and password are required." }, 400);
    const user = await env.DB.prepare(
      "SELECT id, email, display_name, password_salt, password_hash, status, email_verified_at FROM users WHERE email = ?",
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


  if (path === "/api/competitions" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekStart = new Date(dayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const rounds = [
      { slug: "daily-sprint", title: "24h Sprint", start: dayStart, days: 1, prize: 5000 },
      { slug: "consistency-league", title: "7-day Consistency League", start: weekStart, days: 7, prize: 12000 },
      { slug: "community-challenge", title: "14-day Challenge", start: new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() - 7)), days: 14, prize: 25000 },
    ];
    for (const round of rounds) {
      const end = new Date(round.start.getTime() + round.days * 86400000);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO competition_rounds (id,slug,title,period_start,period_end,prize_pool_pxy,status,payouts_enabled) VALUES (?,?,?,?,?,?,'open',0)"
      ).bind(round.slug + ":" + round.start.toISOString().slice(0,10), round.slug, round.title, round.start.toISOString(), end.toISOString(), round.prize).run();
    }
    const result = await env.DB.prepare(
      "SELECT r.id,r.slug,r.title,r.period_start,r.period_end,r.prize_pool_pxy,r.status,r.payouts_enabled,p.id AS participant_id,p.score_points,p.verified_trades,p.completed_lessons,p.daily_checkins FROM competition_rounds r LEFT JOIN competition_participants p ON p.round_id=r.id AND p.user_id=? WHERE r.period_end>? ORDER BY r.period_start ASC"
    ).bind(user.id, now.toISOString()).all();
    return json({ competitions: (result.results || []).map(row => ({
      id: row.id, slug: row.slug, title: row.title, startsAt: row.period_start, endsAt: row.period_end,
      prizePoolPXY: Number(row.prize_pool_pxy), status: row.status, joined: Boolean(row.participant_id),
      scorePoints: Number(row.score_points || 0), verifiedTrades: Number(row.verified_trades || 0),
      completedLessons: Number(row.completed_lessons || 0), dailyCheckins: Number(row.daily_checkins || 0),
      prizeStatus: row.payouts_enabled ? "approved" : "gated",
    })), scoring: "Scores are updated only from verified server-side activity; PXY awards remain gated pending final review." });
  }

  if (path === "/api/competitions/join" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "competition-join", user.id, 10, 3600))) return json({ error: "Too many join attempts. Try again later." }, 429);
    const body = await readJson(request);
    const roundId = typeof body?.roundId === "string" ? body.roundId.trim() : "";
    if (!roundId || roundId.length > 100) return json({ error: "Choose a valid competition." }, 400);
    const round = await env.DB.prepare("SELECT id,title,period_start,period_end,status FROM competition_rounds WHERE id=?").bind(roundId).first();
    const now = new Date().toISOString();
    if (!round || round.status !== "open" || round.period_start > now || round.period_end <= now) return json({ error: "This competition is not open for entry." }, 409);
    const already = await env.DB.prepare("SELECT id FROM competition_participants WHERE round_id=? AND user_id=?").bind(roundId,user.id).first();
    if (already) return json({ status: "joined", duplicate: true, roundId });
    const balance = await getLedgerBalance(env.DB, "user:" + user.id + ":TC");
    const startingEquity = Math.max(1, Math.floor(balance));
    try {
      await env.DB.prepare("INSERT INTO competition_participants (id,round_id,user_id,score_points,verified_trades,completed_lessons,daily_checkins) VALUES (?,?,?,0,0,0,0)")
        .bind(crypto.randomUUID(), roundId, user.id).run();
    } catch (error) {
      const winner = await env.DB.prepare("SELECT id FROM competition_participants WHERE round_id=? AND user_id=?").bind(roundId,user.id).first();
      if (winner) return json({ status: "joined", duplicate: true, roundId });
      throw error;
    }
    await appendAudit(env, { actorUserId: user.id, eventType: "competition.joined", entityType: "competition_round", entityId: roundId, requestId, details: { title: round.title, scoringVersion: "risk-aware-v1" } });
    return json({ status: "joined", duplicate: false, roundId, message: "Entry recorded. Scores and prizes remain subject to server verification and published rules." }, 201);
  }

  if (path === "/api/referrals" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    let ownCode = await env.DB.prepare("SELECT code FROM referral_codes WHERE user_id = ?").bind(user.id).first();
    if (!ownCode) {
      const code = randomHex(6).toUpperCase();
      try { await env.DB.prepare("INSERT OR IGNORE INTO referral_codes (user_id, code) VALUES (?, ?)").bind(user.id, code).run(); } catch {}
      ownCode = await env.DB.prepare("SELECT code FROM referral_codes WHERE user_id = ?").bind(user.id).first();
    }
    const counts = await env.DB.prepare("SELECT COUNT(*) AS invited, SUM(CASE WHEN status='activated' THEN 1 ELSE 0 END) AS activated FROM referral_attributions WHERE referrer_user_id = ?").bind(user.id).first();
    const [rows, quests, questClaims, community] = await Promise.all([
      env.DB.prepare("SELECT status, created_at, activated_at FROM referral_attributions WHERE referrer_user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all(),
      env.DB.prepare("SELECT id,title,description,target_activations,reward_tc FROM referral_team_quests WHERE active=1 ORDER BY target_activations").all(),
      env.DB.prepare("SELECT quest_id,status,ledger_transaction_id,created_at FROM referral_team_quest_claims WHERE user_id=?").bind(user.id).all(),
      env.DB.prepare("SELECT COUNT(*) AS activated FROM referral_attributions WHERE status='activated'").first()
    ]);
    const activated = Number(counts?.activated || 0);
    const claimByQuest = new Map((questClaims.results || []).map(row => [row.quest_id, row]));
    return json({ code: ownCode?.code || null, invited: Number(counts?.invited || 0), activated, community: { verifiedActivations: Number(community?.activated || 0) }, milestones: [{ id: "first", target: 1, reached: activated >= 1 }, { id: "squad", target: 3, reached: activated >= 3 }, { id: "community", target: 5, reached: activated >= 5 }], quests: (quests.results || []).map(quest => ({ id: quest.id, title: quest.title, description: quest.description, target: Number(quest.target_activations), rewardTC: Number(quest.reward_tc), progress: activated, claim: claimByQuest.get(quest.id) || null })), referrals: rows.results || [], rewards: { referrerTC: 250, referredTC: 100, currency: "TC" } });
  }

  if (path === "/api/referrals/quests/claim" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "referral-quest-claim", user.id, 10, 3600))) return json({ error: "Too many quest claims. Try again later." }, 429);
    const body = await readJson(request);
    const questId = typeof body?.questId === "string" ? body.questId.trim() : "";
    const quest = await env.DB.prepare("SELECT id,title,target_activations,reward_tc FROM referral_team_quests WHERE id=? AND active=1").bind(questId).first();
    if (!quest || Number(quest.reward_tc) <= 0) return json({ error: "This team quest is not available." }, 404);
    const count = await env.DB.prepare("SELECT COUNT(*) AS activated FROM referral_attributions WHERE referrer_user_id=? AND status='activated'").bind(user.id).first();
    if (Number(count?.activated || 0) < Number(quest.target_activations)) return json({ error: "The squad has not reached this activation milestone yet.", progress: Number(count?.activated || 0), target: Number(quest.target_activations) }, 409);
    const idempotencyKey = "referral-quest:" + user.id + ":" + quest.id;
    await env.DB.prepare("INSERT OR IGNORE INTO referral_team_quest_claims (id,user_id,quest_id,idempotency_key,status) VALUES (?,?,?,?,'pending')").bind(crypto.randomUUID(), user.id, quest.id, idempotencyKey).run();
    const existing = await env.DB.prepare("SELECT * FROM referral_team_quest_claims WHERE user_id=? AND quest_id=?").bind(user.id, quest.id).first();
    if (existing?.status === "paid" && existing?.ledger_transaction_id) return json({ status: "paid", duplicate: true, rewardTC: Number(quest.reward_tc), questId: quest.id });
    let rewardResult;
    try {
      rewardResult = await postLedgerTransaction(env.DB, { id: crypto.randomUUID(), idempotencyKey, userId: user.id, eventType: "referral.team_quest_reward", metadata: { questId: quest.id, targetActivations: Number(quest.target_activations) }, postings: [{ accountKey: "user:" + user.id + ":TC", currency: "TC", amountAtoms: Number(quest.reward_tc) }, { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -Number(quest.reward_tc) }] });
      await env.DB.prepare("UPDATE referral_team_quest_claims SET status='paid',ledger_transaction_id=? WHERE user_id=? AND quest_id=?").bind(rewardResult.transactionId, user.id, quest.id).run();
    } catch {
      return json({ status: "pending", rewardStatus: "retrying", message: "Quest eligibility is recorded. Reward delivery will retry safely." }, 202);
    }
    await appendAudit(env, { actorUserId: user.id, eventType: "referral.team_quest_reward_paid", entityType: "referral_team_quest_claim", entityId: existing?.id || quest.id, requestId, details: { questId: quest.id, rewardTC: Number(quest.reward_tc), duplicate: rewardResult.duplicate } });
    return json({ status: "paid", duplicate: Boolean(rewardResult.duplicate), rewardTC: Number(quest.reward_tc), questId: quest.id });
  }

  if (path === "/api/referrals/activate" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "referral-activation", user.id, 10, 3600))) return json({ error: "Too many activation checks. Try again later." }, 429);
    return json(await activateReferralForUser(env, user, requestId));
  }

  if (path === "/api/learning" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const [lessons, progress] = await Promise.all([
      env.DB.prepare("SELECT id, slug, title, category, summary, content_json, questions_json, reward_tc FROM learning_lessons WHERE active=1 ORDER BY sort_order, id").all(),
      env.DB.prepare("SELECT lesson_id, best_score, completed_at, reward_transaction_id FROM learning_progress WHERE user_id=?").bind(user.id).all(),
    ]);
    const progressById = new Map((progress.results || []).map(row => [row.lesson_id, row]));
    return json({ lessons: (lessons.results || []).map(row => ({ id: row.id, slug: row.slug, title: row.title, category: row.category, summary: row.summary, content: JSON.parse(row.content_json), questions: JSON.parse(row.questions_json), rewardTC: Number(row.reward_tc), progress: progressById.get(row.id) || null })), completed: (progress.results || []).length });
  }

  if (path === "/api/learning/attempt" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "learning-attempt", user.id, 30, 3600))) return json({ error: "Too many quiz attempts. Take a short break and try again." }, 429);
    const body = await readJson(request);
    const lessonId = typeof body?.lessonId === "string" ? body.lessonId.trim() : "";
    const answers = Array.isArray(body?.answers) && body.answers.length <= 20 ? body.answers : null;
    if (!/^[a-z0-9-]{2,80}$/.test(lessonId) || !answers || answers.some(value => !Number.isInteger(value) || value < 0 || value > 8)) return json({ error: "Submit a valid lesson and quiz response." }, 400);
    const lesson = await env.DB.prepare("SELECT id, answer_key_json, reward_tc FROM learning_lessons WHERE id=? AND active=1").bind(lessonId).first();
    if (!lesson) return json({ error: "This lesson is not available." }, 404);
    const keys = JSON.parse(lesson.answer_key_json);
    if (answers.length !== keys.length) return json({ error: "Answer every question before submitting." }, 400);
    const score = answers.reduce((total, answer, index) => total + (answer === keys[index] ? 1 : 0), 0);
    const passed = score >= Math.ceil(keys.length * 2 / 3);
    const attemptId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO learning_attempts (id,user_id,lesson_id,answers_json,score,total_questions,passed) VALUES (?,?,?,?,?,?,?)").bind(attemptId, user.id, lessonId, JSON.stringify(answers), score, keys.length, passed ? 1 : 0).run();
    if (!passed) return json({ passed: false, score, total: keys.length, threshold: Math.ceil(keys.length * 2 / 3), message: "Review the lesson and try again." });
    await env.DB.prepare("INSERT OR IGNORE INTO learning_progress (user_id,lesson_id,best_score,completed_at) VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(user.id, lessonId, score).run();
    const progress = await env.DB.prepare("SELECT * FROM learning_progress WHERE user_id=? AND lesson_id=?").bind(user.id, lessonId).first();
    let rewardResult;
    try {
      rewardResult = await postLedgerTransaction(env.DB, { id: crypto.randomUUID(), idempotencyKey: "learning-lesson:" + user.id + ":" + lessonId, userId: user.id, eventType: "learning.lesson_reward", metadata: { lessonId, attemptId, score, total: keys.length }, postings: [{ accountKey: "user:" + user.id + ":TC", currency: "TC", amountAtoms: Number(lesson.reward_tc) }, { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -Number(lesson.reward_tc) }] });
      await env.DB.prepare("UPDATE learning_progress SET reward_transaction_id=? WHERE user_id=? AND lesson_id=? AND reward_transaction_id IS NULL").bind(rewardResult.transactionId, user.id, lessonId).run();
    } catch {
      return json({ passed: true, score, total: keys.length, rewardStatus: "retrying", message: "Lesson completed. Your TC reward is being reconciled safely." }, 202);
    }
    await appendAudit(env, { actorUserId: user.id, eventType: "learning.lesson_completed", entityType: "learning_lesson", entityId: lessonId, requestId, details: { score, total: keys.length, rewardTC: Number(lesson.reward_tc), duplicateReward: rewardResult.duplicate } });
    return json({ passed: true, score, total: keys.length, rewardTC: Number(lesson.reward_tc), duplicate: Boolean(progress?.reward_transaction_id || rewardResult.duplicate) });
  }

  if (path === "/api/checkins" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const [todayRow, latest, history] = await Promise.all([
      env.DB.prepare("SELECT checkin_date, streak_days, reward_tc FROM daily_checkins WHERE user_id=? AND checkin_date=?").bind(user.id, today).first(),
      env.DB.prepare("SELECT checkin_date, streak_days FROM daily_checkins WHERE user_id=? ORDER BY checkin_date DESC LIMIT 1").bind(user.id).first(),
      env.DB.prepare("SELECT checkin_date, streak_days, reward_tc FROM daily_checkins WHERE user_id=? ORDER BY checkin_date DESC LIMIT 7").bind(user.id).all(),
    ]);
    const currentStreak = latest && (latest.checkin_date === today || latest.checkin_date === yesterday) ? Number(latest.streak_days) : 0;
    return json({
      checkedInToday: Boolean(todayRow),
      streakDays: currentStreak,
      rewardTC: 50,
      history: (history.results || []).map(row => ({ date: row.checkin_date, streakDays: Number(row.streak_days), rewardTC: Number(row.reward_tc) })),
    });
  }

  if (path === "/api/checkins" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "daily-checkin", user.id, 10, 3600))) return json({ error: "Too many check-in attempts. Try again later." }, 429);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const existing = await env.DB.prepare("SELECT streak_days, reward_tc FROM daily_checkins WHERE user_id=? AND checkin_date=?").bind(user.id, today).first();
    if (existing) return json({ status: "already_checked_in", duplicate: true, checkedInToday: true, streakDays: Number(existing.streak_days), rewardTC: Number(existing.reward_tc) });
    const previous = await env.DB.prepare("SELECT checkin_date, streak_days FROM daily_checkins WHERE user_id=? AND checkin_date<? ORDER BY checkin_date DESC LIMIT 1").bind(user.id, today).first();
    const streakDays = previous && previous.checkin_date === yesterday ? Number(previous.streak_days) + 1 : 1;
    const idempotencyKey = "daily-checkin:" + user.id + ":" + today;
    let ledgerResult;
    try {
      ledgerResult = await postLedgerTransaction(env.DB, {
        id: crypto.randomUUID(), idempotencyKey, userId: user.id, eventType: "daily.checkin_reward",
        metadata: { checkinDate: today, streakDays, rewardTC: 50 },
        postings: [
          { accountKey: "user:" + user.id + ":TC", currency: "TC", amountAtoms: 50 },
          { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -50 },
        ],
      });
    } catch {
      return json({ error: "The check-in reward could not be recorded safely. Please retry; duplicate rewards are prevented." }, 503);
    }
    const ledger = await env.DB.prepare("SELECT id,status FROM ledger_transactions WHERE idempotency_key=?").bind(idempotencyKey).first();
    if (!ledger || ledger.status !== "posted" || ledger.id !== ledgerResult.transactionId) return json({ error: "The check-in reward is reconciling. Refresh your balance and retry shortly." }, 202);
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO daily_checkins (id,user_id,checkin_date,streak_days,reward_tc,ledger_transaction_id) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user.id, today, streakDays, 50, ledger.id).run();
    } catch {
      return json({ error: "The check-in was recorded in the ledger and is reconciling. Retry safely shortly." }, 202);
    }
    const recorded = await env.DB.prepare("SELECT streak_days,reward_tc FROM daily_checkins WHERE user_id=? AND checkin_date=?").bind(user.id, today).first();
    if (!recorded) return json({ error: "The reward was recorded and the check-in record is reconciling. Please retry shortly." }, 202);
    await appendAudit(env, { actorUserId: user.id, eventType: "daily.checkin_recorded", entityType: "daily_checkin", entityId: user.id + ":" + today, requestId, details: { checkinDate: today, streakDays: Number(recorded.streak_days), rewardTC: Number(recorded.reward_tc), duplicate: Boolean(ledgerResult.duplicate) } });
    return json({ status: "checked_in", duplicate: Boolean(ledgerResult.duplicate), checkedInToday: true, streakDays: Number(recorded.streak_days), rewardTC: Number(recorded.reward_tc) });
  }

  if (path === "/api/community" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    await env.DB.prepare("INSERT OR IGNORE INTO community_memberships (community_id,user_id,role) VALUES ('community-general',?,'member')").bind(user.id).run();
    const result = await env.DB.prepare(
      "SELECT c.id,c.slug,c.name,c.description,c.visibility,c.posting_policy,COUNT(DISTINCT m.user_id) AS member_count,MAX(CASE WHEN mine.user_id IS NULL THEN 0 ELSE 1 END) AS joined FROM communities c LEFT JOIN community_memberships m ON m.community_id=c.id LEFT JOIN community_memberships mine ON mine.community_id=c.id AND mine.user_id=? WHERE c.active=1 AND (c.visibility='public' OR mine.user_id IS NOT NULL) GROUP BY c.id ORDER BY CASE c.slug WHEN 'general' THEN 0 WHEN 'trading-lab' THEN 1 WHEN 'learning-lounge' THEN 2 ELSE 3 END"
    ).bind(user.id).all();
    return json({ communities: (result.results || []).map(row => ({ ...row, memberCount: Number(row.member_count), joined: Boolean(row.joined) })) });
  }

  if (path === "/api/community/join" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const communityId = typeof body?.communityId === "string" ? body.communityId.trim() : "";
    const community = await env.DB.prepare("SELECT id,visibility FROM communities WHERE id=? AND active=1").bind(communityId).first();
    if (!community || community.visibility !== "public") return json({ error: "That community is not available to join." }, 404);
    await env.DB.prepare("INSERT OR IGNORE INTO community_memberships (community_id,user_id,role) VALUES (?,?,'member')").bind(communityId,user.id).run();
    await appendAudit(env, { actorUserId:user.id,eventType:"community.joined",entityType:"community",entityId:communityId,requestId });
    return json({ joined:true, communityId });
  }

  if (path === "/api/community/comments" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const postId=url.searchParams.get("postId")||"";
    const post=await env.DB.prepare("SELECT community_id FROM community_posts WHERE id=? AND status='published'").bind(postId).first();
    if(!post)return json({error:"Post not found."},404);
    const member=await env.DB.prepare("SELECT 1 AS ok FROM community_memberships WHERE community_id=? AND user_id=?").bind(post.community_id,user.id).first();
    if(!member)return json({error:"Join this community to read comments."},403);
    const result=await env.DB.prepare("SELECT c.id,c.post_id,c.user_id,c.body,c.created_at,u.display_name FROM community_post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.status='published' ORDER BY c.created_at ASC LIMIT 100").bind(postId).all();
    return json({comments:result.results||[]});
  }

  if (path === "/api/community/comments" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    if(!(await consumeAuthRateLimit(request,env,"community-comment",user.id,30,3600)))return json({error:"You're commenting too quickly. Please try again later."},429);
    const body=await readJson(request);
    const postId=typeof body?.postId==="string"?body.postId.trim():"";
    const text=typeof body?.body==="string"?body.body.trim():"";
    if(!text||text.length>1000)return json({error:"Comments must contain 1–1,000 characters."},400);
    if(/https?:\/\/|www\.|\b\d{7,}\b/i.test(text))return json({error:"For member safety, links and phone-number-like strings are not allowed in comments."},400);
    const post=await env.DB.prepare("SELECT community_id FROM community_posts WHERE id=? AND status='published'").bind(postId).first();
    if(!post)return json({error:"Post not found."},404);
    const member=await env.DB.prepare("SELECT muted_until FROM community_memberships WHERE community_id=? AND user_id=?").bind(post.community_id,user.id).first();
    if(!member)return json({error:"Join this community to comment."},403);
    if(member.muted_until&&Date.parse(member.muted_until)>Date.now())return json({error:"Commenting is temporarily paused for this account in this community."},403);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO community_post_comments(id,post_id,user_id,body) VALUES (?,?,?,?)").bind(id,postId,user.id,text).run();
    await appendAudit(env,{actorUserId:user.id,eventType:"community.comment_created",entityType:"community_comment",entityId:id,requestId,details:{postId,characters:text.length}});
    return json({comment:{id,postId,userId:user.id,displayName:user.display_name,body:text,createdAt:new Date().toISOString()}},201);
  }

  if (path === "/api/community/posts" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const communityId = url.searchParams.get("communityId") || "community-general";
    const member = await env.DB.prepare("SELECT 1 AS ok FROM community_memberships WHERE community_id=? AND user_id=?").bind(communityId,user.id).first();
    if (!member) return json({ error: "Join this community to view its posts." }, 403);
    const result = await env.DB.prepare(
      "SELECT p.id,p.community_id,p.user_id,p.body,p.created_at,p.edited_at,u.display_name,(SELECT COUNT(*) FROM community_post_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,(SELECT COUNT(*) FROM community_post_reactions r WHERE r.post_id=p.id) AS reaction_count,EXISTS(SELECT 1 FROM community_post_reactions r WHERE r.post_id=p.id AND r.user_id=? AND r.reaction='like') AS liked FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.community_id=? AND p.status='published' ORDER BY p.created_at DESC LIMIT 50"
    ).bind(user.id,communityId).all();
    return json({ posts:(result.results||[]).map(row=>({...row,commentCount:Number(row.comment_count),reactionCount:Number(row.reaction_count),liked:Boolean(row.liked)})) });
  }

  if (path === "/api/community/posts" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request,env,"community-post",user.id,10,3600))) return json({ error:"You're posting too quickly. Please try again later." },429);
    const body = await readJson(request);
    const communityId = typeof body?.communityId === "string" ? body.communityId.trim() : "community-general";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 2000) return json({ error:"Posts must contain 1–2,000 characters." },400);
    if (/https?:\/\/|www\.|\b\d{7,}\b/i.test(text)) return json({ error:"For member safety, links and phone-number-like strings are not allowed in community posts." },400);
    const member = await env.DB.prepare("SELECT role,muted_until FROM community_memberships WHERE community_id=? AND user_id=?").bind(communityId,user.id).first();
    if (!member) return json({ error:"Join this community before posting." },403);
    if (member.muted_until && Date.parse(member.muted_until)>Date.now()) return json({ error:"Posting is temporarily paused for this account in this community." },403);
    const community = await env.DB.prepare("SELECT posting_policy FROM communities WHERE id=? AND active=1").bind(communityId).first();
    if (!community) return json({ error:"Community not found." },404);
    if (community.posting_policy==="moderators" && !["owner","moderator"].includes(member.role)) return json({ error:"Only community moderators can post here." },403);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO community_posts (id,community_id,user_id,body) VALUES (?,?,?,?)").bind(id,communityId,user.id,text).run();
    await appendAudit(env,{actorUserId:user.id,eventType:"community.post_created",entityType:"community_post",entityId:id,requestId,details:{communityId,characters:text.length}});
    return json({ post:{id,communityId,userId:user.id,displayName:user.display_name,body:text,createdAt:new Date().toISOString(),commentCount:0,reactionCount:0,liked:false} },201);
  }

  if (path === "/api/community/messages" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const communityId = url.searchParams.get("communityId") || "community-general";
    const member = await env.DB.prepare("SELECT 1 AS ok FROM community_memberships WHERE community_id=? AND user_id=?").bind(communityId,user.id).first();
    if (!member) return json({ error:"Join this community to access its group chat." },403);
    const result=await env.DB.prepare("SELECT m.id,m.community_id,m.user_id,m.body,m.created_at,u.display_name FROM community_messages m JOIN users u ON u.id=m.user_id WHERE m.community_id=? AND m.status='published' ORDER BY m.created_at DESC LIMIT 100").bind(communityId).all();
    return json({ messages:(result.results||[]).reverse() });
  }

  if (path === "/api/community/messages" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request,env,"community-message",user.id,30,60))) return json({ error:"You're sending messages too quickly. Please slow down." },429);
    const body=await readJson(request);
    const communityId=typeof body?.communityId==="string"?body.communityId.trim():"community-general";
    const text=typeof body?.body==="string"?body.body.trim():"";
    if(!text||text.length>1500)return json({error:"Messages must contain 1–1,500 characters."},400);
    if(/https?:\/\/|www\.|\b\d{7,}\b/i.test(text))return json({error:"For member safety, links and phone-number-like strings are not allowed in group chat."},400);
    const member=await env.DB.prepare("SELECT muted_until FROM community_memberships WHERE community_id=? AND user_id=?").bind(communityId,user.id).first();
    if(!member)return json({error:"Join this community before sending messages."},403);
    if(member.muted_until&&Date.parse(member.muted_until)>Date.now())return json({error:"Messaging is temporarily paused for this account in this community."},403);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO community_messages (id,community_id,user_id,body) VALUES (?,?,?,?)").bind(id,communityId,user.id,text).run();
    await appendAudit(env,{actorUserId:user.id,eventType:"community.message_sent",entityType:"community_message",entityId:id,requestId,details:{communityId,characters:text.length}});
    return json({message:{id,communityId,userId:user.id,displayName:user.display_name,body:text,createdAt:new Date().toISOString()}},201);
  }

  if (path === "/api/community/react" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const body=await readJson(request);
    const postId=typeof body?.postId==="string"?body.postId.trim():"";
    const reaction=["like","insightful","support"].includes(body?.reaction)?body.reaction:"like";
    const post=await env.DB.prepare("SELECT community_id FROM community_posts WHERE id=? AND status='published'").bind(postId).first();
    if(!post)return json({error:"Post not found."},404);
    const member=await env.DB.prepare("SELECT 1 AS ok FROM community_memberships WHERE community_id=? AND user_id=?").bind(post.community_id,user.id).first();
    if(!member)return json({error:"Join this community to react."},403);
    const prior=await env.DB.prepare("SELECT 1 AS ok FROM community_post_reactions WHERE post_id=? AND user_id=? AND reaction=?").bind(postId,user.id,reaction).first();
    if(prior)await env.DB.prepare("DELETE FROM community_post_reactions WHERE post_id=? AND user_id=? AND reaction=?").bind(postId,user.id,reaction).run();
    else await env.DB.prepare("INSERT OR IGNORE INTO community_post_reactions(post_id,user_id,reaction) VALUES (?,?,?)").bind(postId,user.id,reaction).run();
    return json({reacted:!prior,postId,reaction});
  }

  if (path === "/api/community/report" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const body=await readJson(request);
    const contentType=["post","comment","message"].includes(body?.contentType)?body.contentType:"";
    const contentId=typeof body?.contentId==="string"?body.contentId.trim():"";
    const reason=["spam","harassment","scam","unsafe","other"].includes(body?.reason)?body.reason:"other";
    const details=typeof body?.details==="string"?body.details.trim().slice(0,500):"";
    if(!contentType||!contentId)return json({error:"Choose a community item to report."},400);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT OR IGNORE INTO community_moderation_reports(id,reporter_user_id,content_type,content_id,reason,details) VALUES (?,?,?,?,?,?)").bind(id,user.id,contentType,contentId,reason,details).run();
    return json({reported:true});
  }

  if (path === "/api/packs" && request.method === "GET") {
    const result=await env.DB.prepare("SELECT pack_id,title,price_gram_atoms,ai_credits,pxy_amount FROM pxy_pack_catalog WHERE active=1 ORDER BY price_gram_atoms").all();
    const reserve=await env.DB.prepare("SELECT cap_pxy,issuance_enabled,reserve_verified,launch_approved,approval_reference FROM pxy_pack_reserve WHERE id=1").first();
    const totals=await env.DB.prepare("SELECT COALESCE(SUM(pxy_amount),0) AS reserved FROM pxy_pack_issuances WHERE status IN ('reserved','issued')").first();
    return json({packs:(result.results||[]).map(p=>({...p,priceGramAtoms:Number(p.price_gram_atoms),aiCredits:Number(p.ai_credits),pxyAmount:Number(p.pxy_amount)})),reserve:{capPxy:Number(reserve?.cap_pxy||50000),reservedPxy:Number(totals?.reserved||0),remainingPxy:Math.max(0,Number(reserve?.cap_pxy||50000)-Number(totals?.reserved||0)),issuanceEnabled:Boolean(reserve?.issuance_enabled&&reserve?.reserve_verified&&reserve?.launch_approved&&reserve?.approval_reference)}});
  }

  if (path === "/api/admin/packs" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const admins=String(env.PXY_PACK_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).filter(Boolean);
    if(!admins.includes(user.id))return json({error:"Pack administration is not enabled for this account."},403);
    const body=await readJson(request);
    const packId=typeof body?.packId==="string"?body.packId.trim():"";
    const title=typeof body?.title==="string"?body.title.trim():"";
    const price=Number(body?.priceGramAtoms),credits=Number(body?.aiCredits),pxy=Number(body?.pxyAmount||0);
    if(!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(packId)||!title||title.length>80||!Number.isSafeInteger(price)||price<1||!Number.isSafeInteger(credits)||credits<0||!Number.isSafeInteger(pxy)||pxy<0||pxy>50000)return json({error:"Invalid pack settings. PXY per pack must be between 0 and 50,000."},400);
    const existing=await env.DB.prepare("SELECT pack_id FROM pxy_pack_catalog WHERE pack_id=?").bind(packId).first();
    if(existing)await env.DB.prepare("UPDATE pxy_pack_catalog SET title=?,price_gram_atoms=?,ai_credits=?,pxy_amount=?,active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE pack_id=?").bind(title,price,credits,pxy,body.active===false?0:1,packId).run();
    else await env.DB.prepare("INSERT INTO pxy_pack_catalog(pack_id,title,price_gram_atoms,ai_credits,pxy_amount,active) VALUES (?,?,?,?,?,?)").bind(packId,title,price,credits,pxy,body.active===false?0:1).run();
    await appendAudit(env,{actorUserId:user.id,eventType:"pxy_pack.configured",entityType:"pxy_pack",entityId:packId,requestId,details:{priceGramAtoms:price,aiCredits:credits,pxyAmount:pxy,active:body.active!==false}});
    return json({saved:true,packId,issuanceEnabled:false,message:"Pack configuration saved. PXY issuance remains separately gated."});
  }

  if (path === "/api/admin/packs/reserve" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const admins=String(env.PXY_PACK_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).filter(Boolean);
    if(!admins.includes(user.id))return json({error:"Pack reserve administration is not enabled for this account."},403);
    const body=await readJson(request);
    const reserveVerified=body?.reserveVerified===true,launchApproved=body?.launchApproved===true;
    const approvalReference=typeof body?.approvalReference==="string"?body.approvalReference.trim().slice(0,120):"";
    if(reserveVerified&&launchApproved&&!approvalReference)return json({error:"An approval reference is required before enabling PXY issuance."},400);
    const enabled=reserveVerified&&launchApproved&&Boolean(approvalReference)&&body?.issuanceEnabled===true;
    await env.DB.batch([
      env.DB.prepare("UPDATE pxy_pack_reserve SET reserve_verified=?,launch_approved=?,approval_reference=?,issuance_enabled=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1").bind(Number(reserveVerified),Number(launchApproved),approvalReference||null,Number(enabled)),
      env.DB.prepare("UPDATE pxy_issuance_controls SET reserves_verified=?,launch_approved=?,approval_reference=?,issuance_enabled=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1").bind(Number(reserveVerified),Number(launchApproved),approvalReference||null,Number(enabled))
    ]);
    await appendAudit(env,{actorUserId:user.id,eventType:"pxy_pack.reserve_gate_updated",entityType:"pxy_pack_reserve",entityId:"1",requestId,details:{reserveVerified,launchApproved,issuanceEnabled:enabled,approvalReference:approvalReference||null}});
    return json({saved:true,issuanceEnabled:enabled,capPxy:50000});
  }

  if (path === "/api/packs/issue" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const body=await readJson(request);
    const packId=typeof body?.packId==="string"?body.packId.trim():"";
    const orderId=typeof body?.orderId==="string"?body.orderId.trim():"";
    if(!packId||!orderId)return json({error:"A verified pack and payment order are required."},400);
    const pack=await env.DB.prepare("SELECT * FROM pxy_pack_catalog WHERE pack_id=? AND active=1").bind(packId).first();
    const order=await env.DB.prepare("SELECT id,user_id,status,package_id,credited_ac,asset FROM payment_orders WHERE id=? AND user_id=?").bind(orderId,user.id).first();
    if(!pack||!order||order.status!=="credited"||order.package_id!==packId||Number(order.credited_ac)!==Number(pack.ai_credits))return json({error:"This payment does not match an active, verified pack. No PXY was issued."},409);
    if(Number(pack.pxy_amount)<=0)return json({status:"no_pxy_component",issuedPxy:0,aiCreditsAlreadySettled:Number(order.credited_ac)});
    const gate=await env.DB.prepare("SELECT issuance_enabled,reserve_verified,launch_approved,approval_reference FROM pxy_pack_reserve WHERE id=1").first();
    const globalGate=await env.DB.prepare("SELECT issuance_enabled,reserves_verified,launch_approved,approval_reference FROM pxy_issuance_controls WHERE id=1").first();
    if(!gate?.issuance_enabled||!gate?.reserve_verified||!gate?.launch_approved||!gate?.approval_reference||!globalGate?.issuance_enabled||!globalGate?.reserves_verified||!globalGate?.launch_approved||!globalGate?.approval_reference)return json({error:"PXY issuance is locked until reserve and launch safeguards are approved."},423);
    const prior=await env.DB.prepare("SELECT id,status,pxy_amount FROM pxy_pack_issuances WHERE payment_order_id=?").bind(orderId).first();
    if(prior?.status==="issued")return json({status:"issued",issuedPxy:Number(prior.pxy_amount),duplicate:true});
    if(prior)return json({status:"reserved",issuedPxy:0,duplicate:true,message:"Pack allocation is reserved and needs safe settlement retry."},202);
    const issuanceId=crypto.randomUUID();
    try{await env.DB.prepare("INSERT INTO pxy_pack_issuances(id,pack_id,user_id,payment_order_id,pxy_amount,status) VALUES (?,?,?,?,?,'reserved')").bind(issuanceId,packId,user.id,orderId,Number(pack.pxy_amount)).run();}
    catch(error){const latest=await env.DB.prepare("SELECT id,status,pxy_amount FROM pxy_pack_issuances WHERE payment_order_id=?").bind(orderId).first();if(latest?.status==="issued")return json({status:"issued",issuedPxy:Number(latest.pxy_amount),duplicate:true});return json({error:String(error?.message||"PXY reserve cap or allocation conflict.").includes("PXY_PACK_RESERVE_CAP_EXCEEDED")?"The 50,000 PXY pack reserve is fully reserved.":"This pack allocation could not be reserved."},409);}
    let ledger;
    try{ledger=await postLedgerTransaction(env.DB,{id:crypto.randomUUID(),idempotencyKey:"pxy-pack:"+orderId,userId:user.id,eventType:"pxy.pack_issued",metadata:{packId,orderId,issuanceId,approvalReference:gate.approval_reference},postings:[{accountKey:"user:"+user.id+":PXY",currency:"PXY",amountAtoms:Number(pack.pxy_amount)},{accountKey:"system:issuance:PXY",currency:"PXY",amountAtoms:-Number(pack.pxy_amount)}]});}
    catch{return json({status:"reserved",issuedPxy:0,message:"The pack is safely reserved. PXY ledger settlement will retry without issuing twice."},202);}
    await env.DB.prepare("UPDATE pxy_pack_issuances SET status='issued',ledger_transaction_id=?,issued_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='reserved'").bind(ledger.transactionId,issuanceId).run();
    await appendAudit(env,{actorUserId:user.id,eventType:"pxy.pack_issued",entityType:"pxy_pack_issuance",entityId:issuanceId,requestId,details:{packId,orderId,pxyAmount:Number(pack.pxy_amount),ledgerTransactionId:ledger.transactionId,duplicate:ledger.duplicate}});
    return json({status:"issued",issuedPxy:Number(pack.pxy_amount),aiCreditsAlreadySettled:Number(order.credited_ac),duplicate:ledger.duplicate},201);
  }

  if (path === "/api/missions/activity" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!user)return json({error:"Authentication required."},401);
    const body=await readJson(request);
    const eventType=["market_viewed","journey_review"].includes(body?.eventType)?body.eventType:"";
    const idempotencyKey=typeof body?.idempotencyKey==="string"?body.idempotencyKey.trim():"";
    if(!eventType||!/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey))return json({error:"A supported activity and idempotency key are required."},400);
    await env.DB.prepare("INSERT OR IGNORE INTO mission_activity_events(id,user_id,event_type,idempotency_key,metadata_json) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),user.id,eventType,idempotencyKey,JSON.stringify({source:"authenticated-client"})).run();
    return json({recorded:true,eventType});
  }

  if (path === "/api/missions" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    await env.DB.prepare("INSERT OR IGNORE INTO mission_journeys(user_id,started_at) SELECT id,created_at FROM users WHERE id=?").bind(user.id).run();
    const journey=await env.DB.prepare("SELECT user_id,started_at,status FROM mission_journeys WHERE user_id=?").bind(user.id).first();
    if(!journey)return json({error:"Mission journey could not be initialized."},503);
    const startedDate=String(journey.started_at).slice(0,10);
    const today=new Date().toISOString().slice(0,10);
    const currentDay=Math.max(1,Math.min(30,Math.floor((Date.parse(today+"T00:00:00Z")-Date.parse(startedDate+"T00:00:00Z"))/86400000)+1));
    await env.DB.prepare("WITH RECURSIVE days(day) AS (SELECT 1 UNION ALL SELECT day+1 FROM days WHERE day<30) INSERT OR IGNORE INTO mission_journey_days(user_id,day_number,mission_id,unlock_at,status) SELECT ?,day,'journey-'||printf('%02d',day),datetime(?,'+'||(day-1)||' days'),CASE WHEN day<=? THEN 'available' ELSE 'locked' END FROM days").bind(user.id,journey.started_at,currentDay).run();
    await env.DB.prepare("UPDATE mission_journey_days SET status='available' WHERE user_id=? AND day_number<=? AND status='locked'").bind(user.id,currentDay).run();
    await env.DB.prepare("UPDATE mission_journey_days SET status='locked' WHERE user_id=? AND day_number>? AND status='available'").bind(user.id,currentDay).run();
    const [missions,claims,journeyStats]=await Promise.all([
      env.DB.prepare("SELECT d.id,d.title,d.reward_currency,d.reward_amount,d.rules_json,j.day_number,j.unlock_at,j.status AS day_status,j.completed_at FROM mission_journey_days j JOIN mission_definitions d ON d.id=j.mission_id WHERE j.user_id=? ORDER BY j.day_number").bind(user.id).all(),
      env.DB.prepare("SELECT mission_id,status,ledger_transaction_id,created_at FROM mission_claims WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(),
      env.DB.prepare("SELECT COUNT(*) AS completed FROM mission_journey_days WHERE user_id=? AND status='completed'").bind(user.id).first()
    ]);
    const claimed=new Map((claims.results||[]).map(row=>[row.mission_id,row]));
    return json({journey:{startedAt:journey.started_at,currentDay,status:journey.status,completed:Number(journeyStats?.completed||0),totalDays:30},missions:(missions.results||[]).map(row=>({id:row.id,title:row.title,rewardCurrency:row.reward_currency,rewardAmount:Number(row.reward_amount),rules:JSON.parse(row.rules_json||"{}"),day:Number(row.day_number),unlockAt:row.unlock_at,dayStatus:row.day_status,available:row.day_status==="available",completedAt:row.completed_at,claim:claimed.get(row.id)||null}))});
  }

  if (path === "/api/missions/claim" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!(await consumeAuthRateLimit(request, env, "mission-claim", user.id, 20, 3600))) return json({ error: "Too many reward claims. Try again later." }, 429);
    const body = await readJson(request);
    const missionId = typeof body?.missionId === "string" ? body.missionId.trim() : "";
    const mission = await env.DB.prepare("SELECT d.id,d.reward_currency,d.reward_amount,d.rules_json,j.day_number,j.unlock_at,j.status AS day_status FROM mission_definitions d JOIN mission_journey_days j ON j.mission_id=d.id AND j.user_id=? WHERE d.id=? AND d.active=1").bind(user.id,missionId).first();
    if (!mission || mission.reward_currency !== "TC" || Number(mission.reward_amount) <= 0) return json({ error: "This reward is not currently claimable." }, 404);
    if(mission.day_status==="completed")return json({status:"paid",missionId,duplicate:true,message:"This day's reward is already recorded."});
    if(mission.day_status!=="available")return json({error:"This mission unlocks on Day "+Number(mission.day_number)+". Complete the current day's mission first."},409);
    const rules = JSON.parse(mission.rules_json || "{}");
    let eligible = false;
    if (rules.prerequisite === "practice_trade") eligible = Boolean(await env.DB.prepare("SELECT id FROM trading_positions WHERE user_id=? AND opened_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "ai_setup") eligible = Boolean(await env.DB.prepare("SELECT id FROM ai_trade_proposals WHERE user_id=? AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "community_challenge") eligible = Boolean(await env.DB.prepare("SELECT id FROM competition_entries WHERE user_id=? AND entered_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "learning_complete") eligible = Boolean(await env.DB.prepare(typeof rules.lessonId==="string"?"SELECT user_id FROM learning_progress WHERE user_id=? AND lesson_id=? AND completed_at>=?":"SELECT user_id FROM learning_progress WHERE user_id=? AND completed_at>=? LIMIT 1").bind(...(typeof rules.lessonId==="string"?[user.id,rules.lessonId,mission.unlock_at]:[user.id,mission.unlock_at])).first());
    else if (rules.prerequisite === "quiz_passed") eligible = Boolean(await env.DB.prepare("SELECT id FROM learning_attempts WHERE user_id=? AND passed=1 AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "checkin_today") eligible = Boolean(await env.DB.prepare("SELECT id FROM daily_checkins WHERE user_id=? AND checkin_date=?").bind(user.id,new Date().toISOString().slice(0,10)).first());
    else if (rules.prerequisite === "market_viewed") eligible = Boolean(await env.DB.prepare("SELECT id FROM mission_activity_events WHERE user_id=? AND event_type='market_viewed' AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "community_post") eligible = Boolean(await env.DB.prepare("SELECT id FROM community_posts WHERE user_id=? AND status='published' AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "group_message") eligible = Boolean(await env.DB.prepare("SELECT id FROM community_messages WHERE user_id=? AND status='published' AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "journey_review") eligible = Boolean(await env.DB.prepare("SELECT id FROM mission_activity_events WHERE user_id=? AND event_type='journey_review' AND created_at>=? LIMIT 1").bind(user.id,mission.unlock_at).first());
    else if (rules.prerequisite === "journey_complete") eligible = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM mission_journey_days WHERE user_id=? AND day_number<30 AND status='completed'").bind(user.id).first())?.n||0)>=29;
    if (!eligible) return json({ error: "Complete the required activity first. The server has not issued a reward." }, 409);
    const idempotencyKey = "mission:" + user.id + ":" + mission.id;
    await env.DB.prepare("INSERT OR IGNORE INTO mission_claims (id,user_id,mission_id,idempotency_key,status,evidence_json) VALUES (?,?,?,?,'approved',?)").bind(crypto.randomUUID(), user.id, mission.id, idempotencyKey, JSON.stringify({ prerequisite: rules.prerequisite })).run();
    const claim = await env.DB.prepare("SELECT * FROM mission_claims WHERE user_id=? AND mission_id=?").bind(user.id, mission.id).first();
    if (claim?.status === "rejected") return json({ error: "This claim was rejected." }, 409);
    let rewardResult;
    try {
      rewardResult = await postLedgerTransaction(env.DB, { id: crypto.randomUUID(), idempotencyKey, userId: user.id, eventType: "mission.tc_reward", metadata: { missionId: mission.id }, postings: [{ accountKey: "user:" + user.id + ":TC", currency: "TC", amountAtoms: Number(mission.reward_amount) }, { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -Number(mission.reward_amount) }] });
      await env.DB.prepare("UPDATE mission_claims SET status='paid', ledger_transaction_id=? WHERE user_id=? AND mission_id=? AND status IN ('approved','paid')").bind(rewardResult.transactionId, user.id, mission.id).run();
      await env.DB.prepare("UPDATE mission_journey_days SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND mission_id=? AND status='available'").bind(user.id,mission.id).run();
      const remaining=await env.DB.prepare("SELECT COUNT(*) AS n FROM mission_journey_days WHERE user_id=? AND status<>'completed'").bind(user.id).first();
      if(Number(remaining?.n||0)===0)await env.DB.prepare("UPDATE mission_journeys SET status='completed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?").bind(user.id).run();
    } catch {
      return json({ status: "approved", rewardStatus: "retrying", message: "Eligibility is recorded. Reward delivery will retry safely." }, 202);
    }
    await appendAudit(env, { actorUserId: user.id, eventType: "mission.reward_paid", entityType: "mission_claim", entityId: claim?.id || mission.id, requestId, details: { missionId: mission.id, rewardTC: Number(mission.reward_amount), duplicate: rewardResult.duplicate } });
    return json({ status: "paid", missionId: mission.id, rewardTC: Number(mission.reward_amount), duplicate: rewardResult.duplicate });
  }

  if (path === "/api/presale/status" && request.method === "GET") {
    try {
      const setting = await env.DB.prepare("SELECT preview_enabled, sale_enabled, launch_state FROM presale_settings WHERE id=1").first();
      return json({ previewEnabled: Boolean(setting?.preview_enabled), saleEnabled: Boolean(setting?.sale_enabled), launchState: setting?.launch_state || "disabled" });
    } catch {
      return json({ previewEnabled: true, saleEnabled: false, launchState: "disabled" });
    }
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
      "SELECT p.id, p.symbol, p.side, p.status, p.leverage, p.quantity_atoms, p.entry_price_micros, p.mark_price_micros, p.reserved_tc, p.realized_pnl_tc, p.open_fee_tc, p.opened_at, p.closed_at, EXISTS (SELECT 1 FROM ai_trade_proposals ap JOIN trade_orders o ON o.id = ap.trade_order_id WHERE o.position_id = p.id AND ap.user_id = p.user_id AND ap.status IN ('executed','review','executing')) AS ai_managed FROM trading_positions p WHERE p.user_id = ? AND p.status = 'open' ORDER BY p.opened_at DESC LIMIT 100",
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
        openedAt: row.opened_at, aiManaged: Boolean(row.ai_managed) };
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
      let referralActivation = null;
      try { referralActivation = await activateReferralForUser(env, user, requestId); }
      catch { referralActivation = { status: "retrying", message: "Referral activation could not be checked yet. Your existing trade is safe; retry from Referrals." }; }
      return json({ order: { id: existing.order_id, duplicate: true }, position: {
        ...position, amount: Number(position.reserved_tc), market: position.symbol,
        direction: position.side === "long" ? "Long" : "Short",
        entry: Number(position.entry_price_micros) / 1000000,
        markPrice: Number(position.mark_price_micros) / 1000000,
        time: new Date(position.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        openedAt: position.opened_at, aiManaged: false,
      }, referralActivation });
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
    let referralActivation = null;
    try { referralActivation = await activateReferralForUser(env, user, requestId); } catch {}
    return json({ order: { id: orderId, duplicate: false }, position: {
      id: positionId, symbol, market: symbol, side, direction: side === "long" ? "Long" : "Short",
      status: "open", leverage: 1, quantity_atoms: quantityAtoms, quantityAtoms,
      entry_price_micros: priceMicros, mark_price_micros: quotePriceMicros, entry: priceMicros / 1000000,
      markPrice: quotePriceMicros / 1000000, reserved_tc: allocationTc, amount: allocationTc, realized_pnl_tc: 0,
      unrealizedPnlTc: calculateUnrealizedPnlTc({ allocationTc, side, entryPriceMicros: priceMicros, markQuotePriceMicros: quotePriceMicros, openFeeTc }),
      quoteStatus: "live", open_fee_tc: openFeeTc, entry_quote_price_micros: quotePriceMicros, modelVersion: SIMULATION_MODEL_VERSION,
      opened_at: new Date().toISOString(), openedAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), aiManaged: false,
    }, referralActivation }, 201);
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


  if (path === "/api/ai/config" && request.method === "GET") {
    return json({
      provider: "cloudflare-workers-ai",
      providerConfigured: Boolean(env.AI && typeof env.AI.run === "function"),
      executionEnabled: Boolean(env.AI && typeof env.AI.run === "function"),
      model: AI_MODEL_NAME,
      operationCostAC: 1.5,
      network: "simulated-practice-only",
    });
  }

  if (path === "/api/ai/activity" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const result = await env.DB.prepare(
      "SELECT id, event_type, entity_type, entity_id, details_json, created_at FROM audit_events WHERE actor_user_id = ? AND event_type LIKE 'ai.%' ORDER BY created_at DESC LIMIT 50",
    ).bind(user.id).all();
    const titles = {
      "ai.session_start": "AI session started", "ai.session_pause": "AI session paused",
      "ai.session_resume": "AI session resumed", "ai.session_stop": "AI session stopped",
      "ai.session_configure": "AI strategy updated", "ai.trade_proposal_created": "AI setup generated",
      "ai.credits_reserved": "AI Credits reserved", "ai.reservation_released": "AI Credit reservation released",
      "ai.trade_fee_charged": "AI trade fee charged", "ai.trade_executed": "AI-assisted position opened",
    };
    const events = (result.results || []).map(row => {
      let details = {};
      try { details = JSON.parse(row.details_json || "{}"); } catch {}
      const reserved = Number(details.reservedAC ?? (Number(details.reservedAtoms || 0) / 2));
      const released = Number(details.releasedAtoms || 0) / 2;
      const charged = Number(details.chargedAC || 0);
      const isRelease = row.event_type === "ai.reservation_released";
      const isReserve = row.event_type === "ai.credits_reserved";
      const isCharge = row.event_type === "ai.trade_fee_charged";
      const acDelta = isRelease ? released : isReserve ? -reserved : 0;
      const detail = row.event_type === "ai.trade_executed"
        ? String(details.side || "AI setup") + " · " + String(details.symbol || "") + " · " + Number(details.allocationTc || 0) + " TC"
        : row.event_type === "ai.trade_proposal_created"
          ? String(details.side || "Setup") + " · " + String(details.symbol || "") + " · " + Number(details.confidence || 0) + "% model confidence"
          : isReserve ? "1.5 AC held until trade execution or cancellation."
          : isRelease ? "Reservation released: " + String(details.finalStatus || "complete") + "."
          : isCharge ? "1.5 AC charged after successful simulated trade execution."
          : "Server-backed AI session event.";
      return { id: row.id, type: row.event_type, title: titles[row.event_type] || "AI activity", detail, time: row.created_at, acDelta, tcDelta: 0, market: details.symbol, direction: details.side };
    });
    return json({ events });
  }

  if (path === "/api/ai/session" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const session = await env.DB.prepare("SELECT id, state, risk_profile, market_symbol, started_at, ended_at, created_at, updated_at FROM ai_sessions WHERE user_id = ?")
      .bind(user.id).first();
    return json({ session: session || { state: "idle", risk_profile: "Balanced", market_symbol: "BTC/USDT", started_at: null, ended_at: null } });
  }

  if (path === "/api/ai/session" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const action = typeof body?.action === "string" ? body.action : "";
    const riskProfile = typeof body?.riskProfile === "string" ? body.riskProfile : "Balanced";
    const marketSymbol = typeof body?.marketSymbol === "string" ? body.marketSymbol.trim().toUpperCase() : "BTC/USDT";
    if (!["start", "pause", "resume", "stop", "configure"].includes(action)) return json({ error: "Choose a valid AI session action." }, 400);
    if (!AI_ALLOWED_RISKS.has(riskProfile) || !AI_ALLOWED_SYMBOLS.has(marketSymbol)) return json({ error: "Choose a supported risk profile and market." }, 400);
    let session = await env.DB.prepare("SELECT * FROM ai_sessions WHERE user_id = ?").bind(user.id).first();
    const now = new Date().toISOString();
    if (action === "configure") {
      if (!session || !["active", "paused"].includes(session.state)) return json({ error: "Start an AI session before changing its active strategy." }, 409);
      await env.DB.prepare("UPDATE ai_sessions SET risk_profile=?, market_symbol=?, updated_at=? WHERE user_id=?")
        .bind(riskProfile, marketSymbol, now, user.id).run();
    } else if (action === "start") {
      if (session?.state === "active") return json({ session, duplicate: true });
      if (session?.state === "paused") return json({ error: "Resume the paused session instead of starting another." }, 409);
      if (session) {
        await env.DB.prepare("UPDATE ai_sessions SET state='active', risk_profile=?, market_symbol=?, started_at=?, ended_at=NULL, updated_at=? WHERE user_id=?")
          .bind(riskProfile, marketSymbol, now, now, user.id).run();
      } else {
        await env.DB.prepare("INSERT INTO ai_sessions (id,user_id,state,risk_profile,market_symbol,started_at,updated_at) VALUES (?,?,'active',?,?,?,?)")
          .bind(crypto.randomUUID(), user.id, riskProfile, marketSymbol, now, now).run();
      }
    } else {
      if (!session) return json({ error: "Start an AI session before using this action." }, 409);
      const expected = action === "pause" ? "active" : action === "resume" ? "paused" : ["active", "paused"].includes(session.state) ? session.state : "";
      const next = action === "pause" ? "paused" : action === "resume" ? "active" : "stopped";
      if (!expected || session.state !== expected) return json({ error: action === "pause" ? "Only an active session can be paused." : action === "resume" ? "Only a paused session can be resumed." : "This session is already stopped." }, 409);
      await env.DB.prepare("UPDATE ai_sessions SET state=?, ended_at=?, updated_at=? WHERE user_id=? AND state=?")
        .bind(next, action === "stop" ? now : null, now, user.id, expected).run();
    }
    session = await env.DB.prepare("SELECT id, state, risk_profile, market_symbol, started_at, ended_at, created_at, updated_at FROM ai_sessions WHERE user_id = ?")
      .bind(user.id).first();
    await appendAudit(env, { actorUserId: user.id, eventType: "ai.session_" + action, entityType: "ai_session", entityId: session?.id || null, requestId, details: { state: session?.state, riskProfile, marketSymbol } });
    return json({ session });
  }

  if (path === "/api/ai/proposals" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    await reconcileStaleAIReservations(env, user.id, requestId);
    const result = await env.DB.prepare(
      "SELECT id, symbol, side, risk_profile, quote_price_micros, quote_timestamp_ms, rationale, confidence_bps, status, expires_at, trade_order_id, created_at, executed_at FROM ai_trade_proposals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    ).bind(user.id).all();
    return json({ proposals: (result.results || []).map(row => ({ ...row, quotePrice: Number(row.quote_price_micros) / 1000000, confidence: Number(row.confidence_bps) / 100 })) });
  }

  if (path === "/api/ai/proposals" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!env.AI || typeof env.AI.run !== "function") return json({ error: "The server-side AI provider is not configured yet. No AI Credits were reserved." }, 503);
    const body = await readJson(request);
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const clientKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!AI_ALLOWED_SYMBOLS.has(symbol)) return json({ error: "Choose a supported crypto market." }, 400);
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(clientKey)) return json({ error: "A valid idempotency key is required." }, 400);
    const idempotencyKey = "ai-proposal:" + user.id + ":" + clientKey;
    const priorOperation = await env.DB.prepare("SELECT * FROM ai_operations WHERE idempotency_key = ? AND user_id = ?")
      .bind(idempotencyKey, user.id).first();
    if (priorOperation) {
      const priorProposal = await env.DB.prepare("SELECT * FROM ai_trade_proposals WHERE operation_id = ?").bind(priorOperation.id).first();
      if (priorProposal) return json({ proposal: { ...priorProposal, quotePrice: Number(priorProposal.quote_price_micros) / 1000000, confidence: Number(priorProposal.confidence_bps) / 100 }, reused: true });
      if (priorOperation.status === "reserved") return json({ status: "pending", message: "This AI operation is already being processed. Retry shortly." }, 202);
      return json({ error: "This AI operation has already completed or failed. Create a new request." }, 409);
    }
    const session = await env.DB.prepare("SELECT * FROM ai_sessions WHERE user_id = ?").bind(user.id).first();
    if (!session || session.state !== "active") return json({ error: "Start or resume your AI session before requesting a trade setup." }, 409);
    await reconcileStaleAIReservations(env, user.id, requestId);
    const pending = await env.DB.prepare("SELECT id FROM ai_trade_proposals WHERE user_id = ? AND status IN ('pending','executing','review') LIMIT 1")
      .bind(user.id).first();
    if (pending) return json({ error: "Finish, execute, or cancel your existing AI proposal before requesting another." }, 409);
    const quote = await env.DB.prepare("SELECT price_micros, provider_timestamp_ms, validation_status, provider FROM market_snapshots WHERE symbol = ? ORDER BY provider_timestamp_ms DESC, received_at DESC LIMIT 1")
      .bind(symbol).first();
    if (!isFreshValidatedQuote(quote, Date.now())) return json({ error: "A fresh validated market quote is required before AI can prepare a setup." }, 503);
    const recentQuoteRows = await env.DB.prepare(
      "SELECT price_micros, provider_timestamp_ms FROM market_snapshots WHERE symbol = ? AND validation_status = 'valid' ORDER BY provider_timestamp_ms DESC LIMIT 6",
    ).bind(symbol).all();
    const recentSnapshots = (recentQuoteRows.results || []).slice().reverse().map(row => ({
      price: Number(row.price_micros) / 1000000,
      timestamp: new Date(Number(row.provider_timestamp_ms)).toISOString(),
    }));

    const availableAcAtoms = await getLedgerBalance(env.DB, "user:" + user.id + ":AC");
    if (availableAcAtoms < AI_TRADE_RESERVATION_ATOMS) return json({ error: "Not enough AI Credits to reserve 1.5 AC for this setup." }, 409);
    const operationId = crypto.randomUUID();
    try {
      await env.DB.prepare("INSERT INTO ai_operations (id,user_id,idempotency_key,operation_type,reserved_credits,charged_credits,status) VALUES (?,?,?,'trade_proposal',?,0,'reserved')")
        .bind(operationId, user.id, idempotencyKey, AI_TRADE_RESERVATION_ATOMS).run();
    } catch {
      return json({ error: "The AI operation could not be started. Retry with a new request key." }, 409);
    }
    const operation = { id: operationId, reserved_credits: AI_TRADE_RESERVATION_ATOMS };
    try {
      await postLedgerTransaction(env.DB, {
        id: crypto.randomUUID(), idempotencyKey: "ai-reservation:" + operationId, userId: user.id,
        eventType: "ai.credits_reserved", metadata: { operationId, purpose: "trade_proposal" },
        postings: [
          { accountKey: "user:" + user.id + ":AC", currency: "AC", amountAtoms: -AI_TRADE_RESERVATION_ATOMS },
          { accountKey: "system:reserve:AC", currency: "AC", amountAtoms: AI_TRADE_RESERVATION_ATOMS },
        ],
      });
    } catch {
      await env.DB.prepare("UPDATE ai_operations SET status='failed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='reserved'")
        .bind(operationId).run();
      return json({ error: "Not enough AI Credits to reserve 1.5 AC for this setup. No trade was opened." }, 409);
    }

    await appendAudit(env, { actorUserId: user.id, eventType: "ai.credits_reserved", entityType: "ai_operation", entityId: operationId, requestId, details: { reservedAtoms: AI_TRADE_RESERVATION_ATOMS, reservedAC: 1.5 } });
    let aiResult;
    try {
      aiResult = await env.AI.run(AI_MODEL_NAME, {
        messages: [
          { role: "system", content: "You are Pexoriy's simulated crypto trading setup analyst. This is educational simulated trading, not financial advice. Use only the supplied market snapshot and risk profile. Do not invent prices, news, or indicators. Return ONLY valid JSON with keys side (long or short), rationale (plain text under 350 characters), and confidence (integer 0 to 100). Be conservative and explicitly acknowledge uncertainty." },
          { role: "user", content: JSON.stringify({ market: symbol, referencePrice: Number(quote.price_micros) / 1000000, quoteProvider: quote.provider, quoteTimestamp: new Date(Number(quote.provider_timestamp_ms)).toISOString(), riskProfile: session.risk_profile, recentSnapshots, task: "Suggest one direction for a simulated practice setup based on the supplied recent price snapshots. Do not claim certainty." }) },
        ],
        max_tokens: 280,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
      });
      const responseText = typeof aiResult?.choices?.[0]?.message?.content === "string" ? aiResult.choices[0].message.content : typeof aiResult?.response === "string" ? aiResult.response : typeof aiResult?.result === "string" ? aiResult.result : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI_OUTPUT_NOT_JSON");
      const parsed = JSON.parse(jsonMatch[0]);
      if (!["long", "short"].includes(parsed.side) || typeof parsed.rationale !== "string" || !parsed.rationale.trim() || parsed.rationale.length > 350) throw new Error("AI_OUTPUT_INVALID");
      const confidence = Number(parsed.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error("AI_CONFIDENCE_INVALID");
      aiResult = { side: parsed.side, rationale: parsed.rationale.trim(), confidence };
    } catch {
      try { await releaseAIReservation(env, user.id, operation, "failed", requestId); } catch {
        return json({ status: "review", message: "The AI provider failed and the AC reservation is being reconciled. No trade was opened." }, 202);
      }
      return json({ error: "The AI provider could not produce a valid setup. The 1.5 AC reservation was released; no trade was opened." }, 503);
    }

    const proposalId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    try {
      await env.DB.prepare(
        "INSERT INTO ai_trade_proposals (id,user_id,operation_id,idempotency_key,symbol,side,risk_profile,quote_price_micros,quote_timestamp_ms,model_name,rationale,confidence_bps,status,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?)",
      ).bind(proposalId, user.id, operationId, idempotencyKey, symbol, aiResult.side, session.risk_profile,
        Number(quote.price_micros), Number(quote.provider_timestamp_ms), AI_MODEL_NAME, aiResult.rationale,
        Math.round(aiResult.confidence * 100), expiresAt).run();
    } catch {
      try { await releaseAIReservation(env, user.id, operation, "failed", requestId); } catch {}
      return json({ error: "The AI setup could not be saved. Any AC reservation is being reconciled; no trade was opened." }, 503);
    }
    await appendAudit(env, { actorUserId: user.id, eventType: "ai.trade_proposal_created", entityType: "ai_trade_proposal", entityId: proposalId, requestId, details: { symbol, side: aiResult.side, confidence: aiResult.confidence, model: AI_MODEL_NAME } });
    return json({ proposal: {
      id: proposalId, symbol, side: aiResult.side, risk_profile: session.risk_profile,
      quote_price_micros: Number(quote.price_micros), quotePrice: Number(quote.price_micros) / 1000000,
      quote_timestamp_ms: Number(quote.provider_timestamp_ms), rationale: aiResult.rationale,
      confidence_bps: Math.round(aiResult.confidence * 100), confidence: aiResult.confidence,
      status: "pending", expires_at: expiresAt, chargedAC: 0, reservedAC: 1.5,
    } }, 201);
  }

  if (path === "/api/ai/proposals/cancel" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
    const proposal = await env.DB.prepare("SELECT * FROM ai_trade_proposals WHERE id = ? AND user_id = ?")
      .bind(proposalId, user.id).first();
    if (!proposal) return json({ error: "AI proposal not found." }, 404);
    if (proposal.status === "cancelled") return json({ status: "cancelled", duplicate: true });
    if (proposal.status === "executed" || proposal.trade_order_id || proposal.status === "executing") return json({ error: "This AI proposal already has an executed or in-progress trade. Use trade history and support review instead of cancelling its AC reservation." }, 409);
    const operation = await env.DB.prepare("SELECT * FROM ai_operations WHERE id = ? AND user_id = ?").bind(proposal.operation_id, user.id).first();
    if (!operation) return json({ error: "AI operation not found. Contact support." }, 409);
    try { await releaseAIReservation(env, user.id, operation, "cancelled", requestId); }
    catch { return json({ status: "review", message: "The AC reservation release is being reconciled. Please retry shortly." }, 202); }
    await env.DB.prepare("UPDATE ai_trade_proposals SET status='cancelled' WHERE id=? AND status IN ('pending','review','executing')").bind(proposal.id).run();
    return json({ status: "cancelled", releasedAC: 1.5 });
  }

  if (path === "/api/ai/proposals/execute" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
    const allocationTc = Number(body?.allocationTc);
    if (!Number.isSafeInteger(allocationTc) || allocationTc < 1 || allocationTc > 100000000) return json({ error: "Choose a whole-number TC allocation." }, 400);
    const proposal = await env.DB.prepare("SELECT * FROM ai_trade_proposals WHERE id = ? AND user_id = ?")
      .bind(proposalId, user.id).first();
    if (!proposal) return json({ error: "AI proposal not found." }, 404);
    if (proposal.status === "executed") return json({ status: "executed", duplicate: true, tradeOrderId: proposal.trade_order_id });
    if (!["pending", "executing", "review"].includes(proposal.status)) return json({ error: "This AI proposal is no longer executable." }, 409);
    const session = await env.DB.prepare("SELECT state FROM ai_sessions WHERE user_id = ?").bind(user.id).first();
    if (session?.state !== "active") return json({ error: "Resume your AI session before executing this proposal." }, 409);
    if (Date.parse(proposal.expires_at) <= Date.now() && proposal.status === "pending") {
      const operation = await env.DB.prepare("SELECT * FROM ai_operations WHERE id = ? AND user_id = ?").bind(proposal.operation_id, user.id).first();
      try { await releaseAIReservation(env, user.id, operation, "cancelled", requestId); } catch { return json({ status: "review", message: "Expired proposal AC is being reconciled." }, 202); }
      await env.DB.prepare("UPDATE ai_trade_proposals SET status='expired' WHERE id=? AND status='pending'").bind(proposal.id).run();
      return json({ error: "This AI setup expired. Its 1.5 AC reservation has been released; request a fresh setup." }, 410);
    }
    await env.DB.prepare("UPDATE ai_trade_proposals SET status='executing' WHERE id=? AND status='pending'").bind(proposal.id).run();
    const innerHeaders = new Headers(request.headers);
    innerHeaders.delete("content-length");
    innerHeaders.set("content-type", "application/json");
    const innerRequest = new Request(new URL("/api/trading/positions", request.url), {
      method: "POST", headers: innerHeaders,
      body: JSON.stringify({ symbol: proposal.symbol, side: proposal.side, allocationTc, idempotencyKey: "ai-trade:" + proposal.id }),
    });
    const tradeResponse = await handleApi(innerRequest, env);
    const tradeData = await tradeResponse.json().catch(() => ({}));
    if (!tradeResponse.ok) {
      await env.DB.prepare("UPDATE ai_trade_proposals SET status='pending' WHERE id=? AND status='executing'").bind(proposal.id).run();
      return json({ error: tradeData.error || "The simulated trade was rejected. No TC position was opened and no AC was charged." }, tradeResponse.status);
    }
    const operation = await env.DB.prepare("SELECT * FROM ai_operations WHERE id = ? AND user_id = ?").bind(proposal.operation_id, user.id).first();
    try {
      await chargeAIReservation(env, user.id, operation, requestId);
    } catch {
      await env.DB.prepare("UPDATE ai_trade_proposals SET status='review', trade_order_id=? WHERE id=?").bind(tradeData?.order?.id || null, proposal.id).run();
      return json({ status: "review", message: "The simulated trade was opened, but AC fee settlement is being reconciled. Do not retry with a different allocation.", order: tradeData.order, position: tradeData.position }, 202);
    }
    await env.DB.prepare("UPDATE ai_trade_proposals SET status='executed', trade_order_id=?, executed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(tradeData?.order?.id || null, proposal.id).run();
    await appendAudit(env, { actorUserId: user.id, eventType: "ai.trade_executed", entityType: "ai_trade_proposal", entityId: proposal.id, requestId, details: { symbol: proposal.symbol, side: proposal.side, allocationTc, tradeOrderId: tradeData?.order?.id } });
    return json({ status: "executed", chargedAC: 1.5, order: tradeData.order, position: { ...tradeData.position, aiManaged: true } }, tradeResponse.status);
  }

  if (path === "/api/payments/ton/config" && request.method === "GET") {
    const recipient = (env.TON_RECEIVE_ADDRESS || TON_RECEIVE_ADDRESS).trim();
    let enabled = false;
    try { normalizeTonAddress(recipient); enabled = true; } catch {}
    return json({ enabled, network: TON_NETWORK, asset: "GRAM", quoteCurrency: "USD", walletProtocol: "ton-connect" });
  }

  if (path === "/api/payments/ton/order" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const packageId = typeof body?.packageId === "string" ? body.packageId : "";
    const clientKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const pack = AI_CREDIT_PACKAGES[packageId];
    if (!pack) return json({ error: "Choose an available AI Credit package." }, 400);
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(clientKey)) return json({ error: "A valid idempotency key is required." }, 400);
    const idempotencyKey = "ton:" + user.id + ":" + clientKey;
    const recipient = (env.TON_RECEIVE_ADDRESS || TON_RECEIVE_ADDRESS).trim();
    try { normalizeTonAddress(recipient); } catch { return json({ error: "The TON receiving wallet is not valid. No payment order was created." }, 503); }

    const prior = await env.DB.prepare(
      "SELECT id, status, reference_key, expected_amount_atoms, credited_ac, expires_at, recipient_address, package_id, created_at FROM payment_orders WHERE idempotency_key = ? AND user_id = ?",
    ).bind(idempotencyKey, user.id).first();
    if (prior) {
      const priorPack = AI_CREDIT_PACKAGES[prior.package_id] || pack;
      return json({ order: {
        id: prior.id, status: prior.status, asset: "GRAM", network: TON_NETWORK,
        expectedAmountAtoms: Number(prior.expected_amount_atoms), amountGram: formatNanoTon(Number(prior.expected_amount_atoms)),
        amountUsd: (priorPack.usdCents / 100).toFixed(2), aiCredits: Number(prior.credited_ac || priorPack.aiCredits),
        expiresAt: prior.expires_at, recipientAddress: prior.recipient_address || recipient,
        referenceKey: prior.reference_key, createdAt: prior.created_at,
      }, reused: true });
    }

    let tonUsdPrice;
    let expectedNanoTon;
    try {
      const quoteResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd", { headers: { accept: "application/json" } });
      if (!quoteResponse.ok) throw new Error("TON_PRICE_UNAVAILABLE");
      const quote = await quoteResponse.json();
      tonUsdPrice = Number(quote?.["the-open-network"]?.usd);
      if (!Number.isFinite(tonUsdPrice) || tonUsdPrice <= 0) throw new Error("TON_PRICE_INVALID");
      expectedNanoTon = Math.round((pack.usdCents / 100 / tonUsdPrice) * 1_000_000_000);
      if (!Number.isSafeInteger(expectedNanoTon) || expectedNanoTon <= 0) throw new Error("TON_AMOUNT_INVALID");
    } catch {
      return json({ error: "A live GRAM (TON) quote is unavailable. Please retry shortly; no payment order was created." }, 503);
    }

    const orderId = crypto.randomUUID();
    const reference = makeTonComment("PEXORIY:" + orderId);
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders
          (id, user_id, idempotency_key, provider, network, asset, expected_amount_atoms,
           usd_equivalent_micros, status, reference_key, token_mint, package_id, credited_ac,
           expires_at, recipient_address)
         VALUES (?, ?, ?, 'toncenter-rpc', ?, 'GRAM', ?, ?, 'created', ?, NULL, ?, ?, ?, ?)`,
      ).bind(orderId, user.id, idempotencyKey, TON_NETWORK, expectedNanoTon, pack.usdCents * 10_000,
        reference, pack.id, pack.aiCredits, expiresAt, recipient).run();
      await appendAudit(env, {
        actorUserId: user.id, eventType: "payment.ton_order_created", entityType: "payment_order",
        entityId: orderId, requestId, details: { packageId: pack.id, asset: "GRAM", network: TON_NETWORK },
      });
    } catch (error) {
      const raced = await env.DB.prepare(
        "SELECT id, status, reference_key, expected_amount_atoms, credited_ac, expires_at, recipient_address, package_id, created_at FROM payment_orders WHERE idempotency_key = ? AND user_id = ?",
      ).bind(idempotencyKey, user.id).first();
      if (!raced) throw error;
      const racedPack = AI_CREDIT_PACKAGES[raced.package_id] || pack;
      return json({ order: {
        id: raced.id, status: raced.status, asset: "GRAM", network: TON_NETWORK,
        expectedAmountAtoms: Number(raced.expected_amount_atoms), amountGram: formatNanoTon(Number(raced.expected_amount_atoms)),
        amountUsd: (racedPack.usdCents / 100).toFixed(2), aiCredits: Number(raced.credited_ac || racedPack.aiCredits),
        expiresAt: raced.expires_at, recipientAddress: raced.recipient_address || recipient,
        referenceKey: raced.reference_key, createdAt: raced.created_at,
      }, reused: true });
    }
    return json({ order: {
      id: orderId, status: "created", asset: "GRAM", network: TON_NETWORK,
      expectedAmountAtoms: expectedNanoTon, amountGram: formatNanoTon(expectedNanoTon),
      amountUsd: (pack.usdCents / 100).toFixed(2), quotedGramUsd: tonUsdPrice,
      aiCredits: pack.aiCredits, expiresAt, recipientAddress: recipient, referenceKey: reference,
      createdAt: new Date().toISOString(),
    }, instructions: "Use the connected TON wallet to send the exact native GRAM amount with the order comment. Credits are added only after server-side chain verification." }, 201);
  }

  if (path === "/api/payments/ton/verify" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await readJson(request);
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "A valid payment order is required." }, 400);
    const order = await env.DB.prepare("SELECT * FROM payment_orders WHERE id = ? AND user_id = ? AND network = ?")
      .bind(orderId, user.id, TON_NETWORK).first();
    if (!order) return json({ error: "TON payment order not found." }, 404);
    if (order.status === "credited") return json({ status: "credited", aiCredits: Number(order.credited_ac), duplicate: true });
    if (["underpaid", "overpaid", "review", "refunded", "reversed"].includes(order.status)) {
      return json({ status: order.status, message: "This payment needs support review. No AI Credits were added." }, 409);
    }

    let transactions;
    try {
      const endpoint = new URL("https://toncenter.com/api/v2/getTransactions");
      endpoint.searchParams.set("address", order.recipient_address || (env.TON_RECEIVE_ADDRESS || TON_RECEIVE_ADDRESS));
      endpoint.searchParams.set("limit", "100");
      endpoint.searchParams.set("archival", "true");
      const response = await fetch(endpoint.toString(), { headers: { accept: "application/json", ...(env.TONCENTER_API_KEY ? { "X-API-Key": env.TONCENTER_API_KEY } : {}) } });
      if (!response.ok) throw new Error("TONCENTER_HTTP_ERROR");
      const payload = await response.json();
      if (payload?.ok !== true || !Array.isArray(payload.result)) throw new Error("TONCENTER_RESPONSE_INVALID");
      transactions = payload.result;
    } catch {
      return json({ error: "The TON network could not be checked right now. Please retry shortly." }, 503);
    }

    let match = null;
    let mismatch = null;
    for (const transaction of transactions) {
      const incoming = transaction?.in_msg;
      const comment = typeof incoming?.message === "string" ? incoming.message : (typeof incoming?.msg_data?.text === "string" ? incoming.msg_data.text : "");
      if (comment !== order.reference_key) continue;
      try {
        const validation = validateTonIncomingTransaction(transaction, {
          recipient: order.recipient_address || (env.TON_RECEIVE_ADDRESS || TON_RECEIVE_ADDRESS),
          reference: order.reference_key,
          expectedNanoTon: Number(order.expected_amount_atoms),
          createdAt: order.created_at,
        });
        if (validation.valid) { match = validation; break; }
        mismatch = validation;
      } catch (error) {
        // A comment match with an invalid recipient, aborted transaction, or stale transaction is never credited.
        if (String(error?.message || "").includes("TON_RECIPIENT_MISMATCH")) {
          await appendAudit(env, { actorUserId: user.id, eventType: "payment.ton_recipient_mismatch", entityType: "payment_order", entityId: order.id, requestId, details: {} });
        }
      }
    }

    if (!match && mismatch) {
      const status = mismatch.reason === "underpaid" ? "underpaid" : "overpaid";
      await env.DB.prepare("UPDATE payment_orders SET received_amount_atoms = ?, status = ? WHERE id = ? AND status IN ('created','pending','confirmed')")
        .bind(mismatch.receivedNanoTon, status, order.id).run();
      await appendAudit(env, { actorUserId: user.id, eventType: "payment.ton_" + status, entityType: "payment_order", entityId: order.id, requestId, details: { txHash: mismatch.hash, receivedNanoTon: mismatch.receivedNanoTon } });
      return json({ status, message: "A native GRAM transfer was found, but its amount does not exactly match this order. No credits were added; support review is required." }, 409);
    }

    if (!match) {
      if (Date.parse(order.expires_at || 0) <= Date.now()) {
        await env.DB.prepare("UPDATE payment_orders SET status = 'failed' WHERE id = ? AND status IN ('created','pending')")
          .bind(order.id).run();
        return json({ status: "expired", message: "No matching on-chain payment was found before this order expired. If you already sent funds, contact support before sending again." }, 410);
      }
      if (order.status === "created") await env.DB.prepare("UPDATE payment_orders SET status = 'pending' WHERE id = ? AND status = 'created'").bind(order.id).run();
      return json({ status: "pending", message: "No matching confirmed GRAM payment is visible yet. You can safely check again." }, 202);
    }

    try {
      await env.DB.prepare(
        "UPDATE payment_orders SET status = 'confirmed', tx_hash = ?, received_amount_atoms = ?, confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), chain_finality = 'finalized' WHERE id = ? AND tx_hash IS NULL AND status IN ('created','pending','confirmed')",
      ).bind(match.hash, match.receivedNanoTon, order.id).run();
    } catch {
      // A concurrent verifier may already have bound this transaction to the order.
    }
    const confirmed = await env.DB.prepare("SELECT status, tx_hash FROM payment_orders WHERE id = ?").bind(order.id).first();
    if (confirmed?.tx_hash !== match.hash) {
      await env.DB.prepare("UPDATE payment_orders SET status = 'review' WHERE id = ? AND tx_hash IS NULL AND status <> 'credited'").bind(order.id).run();
      return json({ status: "review", message: "This transaction is already associated with another order or requires support review." }, 409);
    }
    if (confirmed.status === "credited") return json({ status: "credited", aiCredits: Number(order.credited_ac), duplicate: true });
    if (confirmed.status !== "confirmed") return json({ status: "review", message: "Payment is verified but needs support review before crediting." }, 409);

    const ledgerIdempotencyKey = "ton-native-payment:" + order.id + ":ai-credits";
    let ledgerResult;
    try {
      ledgerResult = await postLedgerTransaction(env.DB, {
        id: crypto.randomUUID(), idempotencyKey: ledgerIdempotencyKey, userId: user.id,
        eventType: "payment.ai_credits_purchased",
        metadata: { paymentOrderId: order.id, chain: TON_NETWORK, txHash: match.hash, packageId: order.package_id },
        postings: [
          { accountKey: "user:" + user.id + ":AC", currency: "AC", amountAtoms: Number(order.credited_ac) * 2 },
          { accountKey: "system:issuance:AC", currency: "AC", amountAtoms: -Number(order.credited_ac) * 2 },
        ],
      });
    } catch {
      return json({ status: "confirmed", message: "Payment verified. AI Credit delivery is retrying safely; check again shortly." }, 202);
    }
    const postedLedger = await env.DB.prepare("SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?")
      .bind(ledgerIdempotencyKey).first();
    if (!postedLedger || postedLedger.status !== "posted" || postedLedger.id !== ledgerResult.transactionId) {
      return json({ status: "confirmed", message: "Payment verified. AI Credit delivery is reconciling; check again shortly." }, 202);
    }
    try {
      const update = await env.DB.prepare(
        "UPDATE payment_orders SET status = 'credited', credited_transaction_id = ? WHERE id = ? AND status = 'confirmed' AND tx_hash = ?",
      ).bind(postedLedger.id, order.id, match.hash).run();
      if (Number(update.meta?.changes || 0) !== 1) {
        const latest = await env.DB.prepare("SELECT status, credited_ac FROM payment_orders WHERE id = ?").bind(order.id).first();
        if (latest?.status === "credited") return json({ status: "credited", aiCredits: Number(latest.credited_ac), duplicate: true });
        return json({ status: "review", message: "Payment is verified but order state changed during crediting. Please contact support." }, 409);
      }
    } catch {
      return json({ status: "confirmed", message: "Payment verified. AI Credit delivery is reconciling; check again shortly." }, 202);
    }
    const payloadHash = await sha256Hex(match.hash + ":payment.ton_credited");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO payment_events (id, payment_order_id, provider_event_id, event_type, payload_hash, processing_status, processed_at) VALUES (?, ?, ?, ?, ?, 'processed', strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    ).bind(crypto.randomUUID(), order.id, "ton:" + match.hash, "transaction.ton_credited", payloadHash).run();
    await appendAudit(env, { actorUserId: user.id, eventType: "payment.ton_credited", entityType: "payment_order", entityId: order.id, requestId, details: { txHash: match.hash, aiCredits: Number(order.credited_ac) } });
    return json({ status: "credited", aiCredits: Number(order.credited_ac), txHash: match.hash });
  }

  if (path === "/api/payments/ton/orders" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    const result = await env.DB.prepare(
      "SELECT id, network, asset, expected_amount_atoms, credited_ac, status, expires_at, tx_hash, created_at, reference_key, recipient_address, package_id FROM payment_orders WHERE user_id = ? AND network = ? ORDER BY created_at DESC LIMIT 25",
    ).bind(user.id, TON_NETWORK).all();
    const orders = (result.results || []).map((row) => {
      const pack = AI_CREDIT_PACKAGES[row.package_id];
      return {
        id: row.id, network: row.network, asset: row.asset, status: row.status,
        expectedAmountAtoms: Number(row.expected_amount_atoms), amountGram: formatNanoTon(Number(row.expected_amount_atoms)),
        aiCredits: Number(row.credited_ac || pack?.aiCredits || 0), expiresAt: row.expires_at, txHash: row.tx_hash,
        createdAt: row.created_at, recipientAddress: row.recipient_address, referenceKey: row.reference_key,
      };
    });
    return json({ orders });
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
          { accountKey: "user:" + user.id + ":AC", currency: "AC", amountAtoms: Number(order.credited_ac) * 2 },
          { accountKey: "system:issuance:AC", currency: "AC", amountAtoms: -Number(order.credited_ac) * 2 },
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
    if (url.pathname === "/pexoriy-icon.png") {
      const binary = atob(PEXORIY_ICON_PNG_BASE64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Response(bytes, { headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
        "x-content-type-options": "nosniff",
      } });
    }
    if (url.pathname === "/tonconnect-manifest.json") {
      const assetResponse = await env.ASSETS.fetch(request);
      const headers = new Headers(assetResponse.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("access-control-allow-origin", "*");
      headers.set("cache-control", "public, max-age=300");
      headers.set("x-content-type-options", "nosniff");
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }
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
