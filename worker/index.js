import { postLedgerTransaction } from "./ledger.js";
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
      "SELECT id, symbol, side, status, leverage, quantity_atoms, entry_price_micros, mark_price_micros, reserved_tc, realized_pnl_tc, opened_at, closed_at FROM trading_positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT 100",
    ).bind(user.id).all();
    return json({ positions: result.results || [] });
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
        "UPDATE payment_orders SET received_amount_atoms = ?, status = 'pending' WHERE id = ? AND status IN ('created','pending')",
      ).bind(Number(mismatch.receivedLamports), order.id).run();
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
        message: "A USDC transfer was found, but its amount does not exactly match this order. No credits were added. You may send the exact requested amount or contact support.",
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
      const latest = await env.DB.prepare("SELECT status, tx_hash FROM payment_orders WHERE id = ?").bind(order.id).first();
      if (latest?.tx_hash !== match.signature) {
        await env.DB.prepare("UPDATE payment_orders SET status = 'review' WHERE id = ? AND status <> 'credited'").bind(order.id).run();
        return json({ status: "review", message: "This transaction is already associated with another payment or needs review." }, 409);
      }
    }

    await recordSolanaPaymentEvent(env, {
      orderId: order.id, signature: match.signature, eventType: "transaction.payment_verified",
      processingStatus: "processed", slot: match.slot,
    });
    const ledgerTransactionId = crypto.randomUUID();
    try {
      await postLedgerTransaction(env.DB, {
        id: ledgerTransactionId,
        idempotencyKey: `solana-sol-payment:${order.id}:ai-credits`,
        userId: user.id,
        eventType: "payment.ai_credits_purchased",
        metadata: { paymentOrderId: order.id, chain: SOLANA_NETWORK, signature: match.signature, packageId: order.package_id },
        postings: [
          { accountKey: `user:${user.id}:AC`, currency: "AC", amountAtoms: Number(order.credited_ac) },
          { accountKey: "system:issuance:AC", currency: "AC", amountAtoms: -Number(order.credited_ac) },
        ],
      });
    } catch {
      // Keep the payment confirmed, not credited. A retry safely resumes via the ledger idempotency key.
      return json({ status: "confirmed", message: "Payment verified. Account credit is retrying safely; check again shortly." }, 202);
    }

    try {
      await env.DB.prepare(
        "UPDATE payment_orders SET status = 'credited', credited_transaction_id = ? WHERE id = ? AND status <> 'credited'",
      ).bind(
        (await env.DB.prepare("SELECT id FROM ledger_transactions WHERE idempotency_key = ?").bind(`solana-sol-payment:${order.id}:ai-credits`).first())?.id,
        order.id,
      ).run();
    } catch {
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
      "SELECT id, network, asset, expected_amount_atoms, credited_ac, status, expires_at, tx_hash, created_at FROM payment_orders WHERE user_id = ? AND network = ? ORDER BY created_at DESC LIMIT 25",
    ).bind(user.id, SOLANA_NETWORK).all();
    return json({ orders: result.results || [] });
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
