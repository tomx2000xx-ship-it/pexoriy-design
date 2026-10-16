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
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id, email, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)")
          .bind(userId, email, displayName, salt, hash),
        env.DB.prepare("INSERT INTO ledger_accounts (account_key, owner_user_id, currency, account_type) VALUES (?, ?, 'TC', 'user'), (?, ?, 'AC', 'user'), (?, ?, 'PXY', 'user')")
          .bind(`user:${userId}:TC`, userId, `user:${userId}:AC`, userId, `user:${userId}:PXY`, userId),
        env.DB.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
          .bind(sessionId, userId, tokenHash, expiresAt),
        env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id, request_id, details_json) VALUES (?, ?, 'account.registered', 'user', ?, ?, '{}')")
          .bind(crypto.randomUUID(), userId, userId, requestId),
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
