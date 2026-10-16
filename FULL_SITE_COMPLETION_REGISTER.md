# Pexoriy — Full-Site Completion and Go-Live Register

Updated: 16 October 2026 (Stage 2 market-feed and server-trading closeout)  
Purpose: internal implementation tracker. This is not customer-facing copy and does not declare production readiness.

## Release rule

Do not hand off for owner testing until all launch-critical site functionality is implemented, automated checks pass, production configuration is validated, and release gates below have evidence. Never report a capability as live merely because a UI control or database table exists. Never bypass a safety or verification failure to meet a launch date.

## Confirmed product constraints

- React + Vite, JSX (not TypeScript/Next.js), preserve the current repository structure.
- Cloudflare Workers + D1 are the production backend direction.
- Practice trading uses real crypto market prices but simulated execution only; no exchange execution and no forex.
- Manual trading does not require AI Credits. AI and manual users share one leaderboard and the same execution/risk/anti-abuse rules.
- TC is simulated-trading utility, AC pays for defined AI operations, PXY is the actual intended project token and remains pre-launch until genuinely issued.
- Challenge direction: 24-hour Sprint (5,000 PXY), 7-day Consistency League (12,000 PXY), 14-day Challenge (25,000 PXY). Prize pools must be budgeted/funded before activation.
- AI Credit package schedule remains the approved schedule: $5/70 AC/100 PXY; $10/140 AC/200 PXY; $25/350 AC/500 PXY; $50/700 AC/1,000 PXY; $100/1,400 AC/2,000 PXY; $250/3,500 AC/5,000 PXY; $500/7,000 AC/10,000 PXY. Token bonuses must not be issued until allocation/reserve controls are approved and funded.
- Solana payment means native SOL only; no USDC. GRAM checkout requires the exact network/token/recipient and a reliable verification design before activation.
- No real private keys or seed phrases are to be requested or stored by the app.

## Current implementation evidence

- [x] React/Vite application and responsive visual foundation.
- [x] Cloudflare Worker and D1 database binding.
- [x] Core account/session and ledger schema; immutable posted-ledger safeguards.
- [x] Server-side Solana payment-order and transaction-verification foundation.
- [x] Native-SOL package quote shown separately from USD package price.
- [x] Duplicate-credit/concurrent-verification safeguards and resumable pending-order lookup.
- [x] Automated CI: production build, deterministic unit tests, Playwright desktop/mobile flows, authenticated local-D1 trading integration, fee-aware server P&L, distinct-order exposure stress tests, and deployed market-feed smoke checks passed on commit `c3b297d4e49106a0b0e64be58f2202058b18db64` (run [38851136150](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38851136150)).
- [x] Production Worker health and D1 connection verified; all five supported markets returned fresh quotes on the first request and valid cached quotes on the second request five seconds later.
- [x] Applied and verified production D1 migration `0005_trade_execution_risk.sql`; `open_fee_tc`, `entry_quote_price_micros`, and `close_return_tc` columns plus the database-enforced position/exposure trigger are present in the live database.
- [x] Server P&L is calculated by the shared Worker settlement helper, returned on initial position open, and refreshed with persisted positions/balances/history every 15 seconds; stale server P&L is shown as unavailable rather than recomputed in the browser.
- [x] Removed browser-only manual trade fallback: unauthenticated/demo users cannot open or close practice positions as if they were persisted account trades. AI-assisted execution remains disabled until the server-side AI provider and AC settlement are implemented and verified.
- [ ] Passing automated checks are not a substitute for provider-term review and final production configuration evidence.

## Stage 2 closeout — live market feed and server-authoritative practice trading (16 October 2026)

- [x] Complete: multi-provider, exchange-timestamped market data for BTC, ETH, SOL, DOGE, and GRAM; stale quotes block order entry and close settlement.
- [x] Complete: authenticated manual simulated-trade open/close, integer TC ledger settlement, idempotency, fee-aware unrealized/realized P&L, persisted history, and database-enforced position/exposure caps.
- [x] Complete: browser UI consumes server P&L and periodically refreshes persisted account/trade state; no browser-only manual-trade fallback.
- [x] Complete: latest full automated workflow and deployed API smoke checks passed in run [38851136150](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38851136150).
- [x] Complete: live D1 migration and risk trigger verified; latest live snapshots showed fresh, validated exchange timestamps for all five supported markets.
- [ ] Overall product launch is **not** declared complete: the other P0/P1 items below remain separate release gates. AI execution, public competitions, token bonuses, and unverified payment methods remain disabled until their server-side controls are ready.

## Stage 3 progress — account security, identity flows, and reliability

- [x] Add durable D1-backed registration and sign-in throttles keyed by hashed client/IP and normalized identity; return HTTP 429 with retry guidance when limits are exceeded.
- [x] Reject unsafe cross-origin mutation requests when the request does not provide a matching Origin (or same-origin Fetch Metadata).
- [x] Add a page-level React error boundary and guard AI opportunity cards against null/stale prices and percentage changes.
- [x] Preserve the AI Centre regression coverage for stale/missing market quotes and verify the page remains navigable after a rendering failure.
- [x] Keep password hashing (PBKDF2-SHA-256), HTTP-only/Secure/SameSite session cookies, session expiry, sign-out revocation, login/register rate limits, origin checks, and audit events in place.
- [x] Apply and verify production D1 migration `0006_auth_lifecycle.sql`; the `email_verified_at`, `auth_rate_limits`, and `auth_tokens` schema objects are present and the migration is recorded.
- [x] For the current pre-domain phase, allow account registration to create a session immediately and allow password sign-in without requiring email verification. This is an intentional temporary product decision, not a claim that email verification is complete.
- [x] Update account-screen copy so sign-up/sign-in work with the supplied email and password; password recovery is clearly deferred until domain-based email delivery is configured.
- [x] Verify registration creates a session without email verification, password sign-in succeeds for an unverified account, logout/session invalidation, throttling, and authenticated trading against local D1 with the test verification bypass removed; all checks passed in [workflow run 38882484317](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38882484317).
- [ ] Configure an owned sending domain and `AUTH_EMAIL_FROM` after the domain purchase; then restore and test provider-backed verification and password recovery.
- [x] Improve AI Credit Store payment-method branding: use the actual Solana logo and existing GRAM logo, and label the latter `GRAM (TON)`.
- [x] Add a one-minute-refresh SOL/USD quote for visible package estimates; GRAM (TON) retains its live quote and dynamic amount. Server-side Solana orders still obtain their own fresh authoritative quote and exact SOL amount.
- [ ] Keep native-SOL checkout disabled until the production receiver/configuration and on-chain verification path are confirmed. GRAM wallet connection is present, but verified GRAM payment and credit delivery remain disabled.
- [x] Production build, 26 deterministic unit tests, desktop/mobile rendered-flow E2E tests (23 passed), authenticated local-D1 trading integration, and production API/market-feed smoke checks passed in [workflow run 38882484317](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38882484317).
- [x] Confirm the latest production Cloudflare Worker deployment after the account/demo isolation changes: deployment `66c5e08b-3c67-4088-a078-2bb196cf1dc2`, version `792ba79b-3ac4-42ec-847d-920621b7b6c8` (version 210), became 100% active at 2026-10-16 09:44:46 UTC. The deployed Worker bundle no longer contains the email-verification sign-in gate; live API health and market-feed smoke checks passed in [workflow run 38882484317](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38882484317).
- [x] Run post-deployment API health and market-feed smoke checks without modifying or resetting production D1 data; Worker health reported 21 D1 tables and both market-feed requests returned fresh/cached validated quotes for BTC, ETH, SOL, DOGE, and GRAM. Account registration, unverified password sign-in, demo/account separation, trading settlement, and throttling were regression-tested against isolated local D1 rather than creating test users in production; see [workflow run 38882484317](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38882484317).


## Launch work remaining

### P0 — Account, identity, and session lifecycle
- [x] Server-side email-verification/resend and single-use password-reset flows; live sending is gated on sender-domain configuration.
- [x] Session expiry checks, reset-time session revocation, sign-out UI, and registration/login/recovery rate limits.
- [ ] Configure and verify the production sender domain; then test real email delivery end to end.
- [x] Brute-force protection uses IP and normalized-email throttles with temporary rate limiting; prefer this over permanent account lockout, which can enable denial-of-service. Provider-backed recovery remains deferred until domain email is configured.
- [x] Keep registered-account balances sourced from persisted server state and isolate demo mode: demo balances carry a visible DEMO MODE banner, account entry clears demo balances before loading, and expired sessions return to sign-in instead of falling back to illustrative balances. Regression coverage passed in [workflow run 38882484317](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38882484317).
- [x] Source review confirms HTTP-only/Secure/SameSite session cookies, same-origin mutation checks, PBKDF2-SHA-256 password hashing, audit logging, generic incorrect-credential errors, and registration/login throttling; local-D1 integration tests passed.

### P0 — Live market data
- [x] Add server-side market feed for BTC, ETH, SOL, DOGE, and GRAM, with provider timestamps, positive-price/precision checks, and D1 snapshots.
- [x] Prefer the timestamped OKX public Spot ticker for BTC, ETH, SOL, DOGE, and GRAM; use Binance public Spot recent-trades data and official host failover as the fallback.
- [x] Use GRAMUSDT rather than the retired TONUSDT ticker after Binance's announced TON-to-GRAM rebrand; GRAM-USDT is also configured as an OKX fallback following OKX's completed migration/listing announcement.
- [x] Keep provider timestamps separate from Worker fetch time; only exchange-timestamped, validated quotes can be marked live or used to open/close simulated positions.
- [x] Keep stale/missing quotes non-tradable and return a clear market-paused state; retain only still-fresh cached snapshots when providers are unavailable.
- [x] Add deterministic tests for timestamp/price normalization and preserve the deployed API smoke gate.
- [x] Confirm the multi-provider adapter returns fresh quotes for BTC, ETH, SOL, DOGE, and GRAM from the deployed Worker; repeated smoke requests verify fresh quotes and D1-cached quotes.
- [ ] Review provider terms, rate limits, regional reachability, quote source disclosure, and commercial-use requirements before public launch.

#### Market-feed research decision (16 October 2026)
- Primary: OKX public Spot ticker with its exchange timestamp for BTC/USDT, ETH/USDT, SOL/USDT, DOGE/USDT, and GRAM/USDT. Deployed smoke evidence showed OKX returning fresh quotes for the four major markets while Binance did not validate consistently, so OKX is the first-choice provider.
- Fallback: Binance public Spot recent-trades data, GET /api/v3/trades?symbol=...&limit=1, which provides the latest actual trade price and exchange trade timestamp. Use the market-data-only host first, then official Binance API host alternatives. [Binance public-data endpoint docs](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md).
- OKX announced GRAM/USDT Spot trading after completing the token migration. [OKX migration and listing announcement](https://www.okx.com/en-sg/help/okx-completed-ton-token-migration).
- GRAM: Binance's official announcement says the GRAM/USDT Spot pair opened after the TON-to-GRAM rebrand; the adapter must use GRAMUSDT, never silently substitute the retired TONUSDT symbol. [Binance rebrand announcement](https://www.binance.com/en-NG/support/announcement/detail/8177254072cf4da3b9d8fcaacceb0a2c).
- Why not rely on CoinGecko's keyless public endpoint for trade execution: its public data can be cached and may not meet a strict 90-second quote freshness gate under all conditions. Its Demo plan documents a 60-second starting freshness and rate limits, so it remains a possible display/reference source but is not the primary execution quote.
- Safety policy: no fabricated prices, no marking Worker fetch time as exchange time, no silently mixing quote currencies, no new simulated trade when the selected market has no valid quote inside the freshness window. An available provider is not considered production-ready until deployed smoke checks and repeat observations pass.

### P0 — Server-authoritative practice trading
- [x] Implement authenticated order/open-position/close-position endpoints; verify them against a real local Worker with local D1 migrations and seeded market snapshots in CI.
- [x] Require a fresh, validated server-side market quote to open or close; stale/missing quotes block execution.
- [x] Use integer micro-prices and integer TC ledger settlement; D1 triggers reject negative user balances and enforce balanced postings before ledger transactions can post.
- [x] Persist open/closed positions, orders/fills, realized P&L, ledger postings, audit events, and market snapshots; calculate unrealized P&L from the latest fresh server-side quote.
- [x] Add idempotent open/close retry paths; integration tests verify duplicate requests do not reserve or return TC twice.
- [x] Implement versioned simulated market fills: adverse 13 bps per fill (3 bps half-spread plus 10 bps conservative slippage where reliable depth is unavailable), plus a 5 bps taker fee. Maker fees are not offered because only market orders are currently supported; simulated fees are internal TC accounting, never reported as real revenue.
- [x] Add D1-enforced caps: maximum 5 open positions, each position no more than 25% of account equity, and aggregate open collateral no more than 75% of account equity. Added concurrency stress coverage for simultaneous distinct orders; competitive exposure remains gated on a separately approved virtual-reserve budget.
- [x] Preserve the existing 12,450 TC welcome balance and 1x leverage. Relative exposure limits are conservative practice-mode defaults; higher leverage and public competition exposure remain disabled until the virtual-reserve budget and tier schedule are reviewed.

### P0 — AI operation service
- [ ] Replace client-side “AI-like” selection logic with a real server-side AI provider/service.
- [ ] Define the billable AI operation/cycle; reserve, charge, refund, and log AC exactly once.
- [ ] Enforce user-authorized risk limits and the same trading controls used by manual traders.
- [ ] Implement real session start/pause/resume/stop state, operation logs, safe failure behavior, and credit reconciliation.
- [ ] Configure and protect the AI provider credentials; disable AI execution until verified.

### P0 — Native SOL checkout and revenue reconciliation
- [x] Confirmed the production Worker has the `SOLANA_RECEIVE_ADDRESS` secret binding configured and has deployed the authenticated order-creation and server-side verification routes. This confirms configuration is present, not yet that a real transaction has passed end-to-end verification.
- [ ] Run a controlled real-SOL transaction against the configured receiver; verify the destination, quote, expiry, unique reference, exact amount, finality, under/overpayment, wrong-recipient, replay, and duplicate-transaction cases before announcing payment production readiness.
- [ ] Verify the full payment-to-credit path is crash-safe/idempotent; reconcile confirmed-but-not-credited orders and duplicate verification requests.
- [ ] Add internal payment/revenue reconciliation views or reports: confirmed receipts, pending/review, AC credits delivered, fees/costs where available, refunds/reversals, and mismatches.
- [ ] Do not count pending/unconfirmed transfers as revenue.
- [ ] Do not activate token bonus issuance until approved PXY reserves and cumulative bonus liabilities are enforced.
- [ ] Keep the native-SOL purchase path available whenever server configuration is valid; do not disable it merely to defer implementation. Fail closed if the receiver, quote, or verification provider is invalid or unavailable.

### P0 — GRAM checkout
- [ ] Confirm the exact GRAM asset/network and recipient wallet; the current Store only displays a live estimate and does not implement verified GRAM order creation/settlement.
- [ ] Implement server-side chain verification with unique order binding, amount/asset/recipient/finality checks, idempotent AC delivery, and reconciliation.
- [ ] Confirm TON Connect manifest/domain/origin and production wallet compatibility.
- [ ] Do not label GRAM as a live purchase method until its server-side payment verification and automatic AC delivery are implemented; wallet connection alone is not payment verification.

### P1 — Missions, check-ins, streaks, and achievements
- [ ] Move check-ins, streaks, mission progress/claims, and reward grants from browser state into D1.
- [ ] Define server-verifiable mission prerequisites, cooldowns, caps, idempotency, and abuse checks.
- [ ] Credit TC/AC through ledger transactions only; explicit PXY campaigns must have a budget and review path.
- [ ] Show durable pending/approved/rejected/paid states and reasons.

### P1 — Competitions and leaderboard
- [ ] Persist challenge instances, joins, entry windows, starting/ending equity, scores, rank, and settlement status.
- [ ] Implement server-authoritative scoring, drawdown/consistency eligibility, deterministic tie-breaks, anti-abuse review, and immutable finalized results.
- [ ] Implement near-you rank and personal progress views.
- [ ] Enforce approved 24-hour/7-day/14-day formats and PXY prize-pool reserve checks; never publish an unfunded pool as guaranteed.
- [ ] Make settlement idempotent and auditable.

### P1 — Referrals, teams, and community
- [ ] Generate unique referral codes/links and persist attribution.
- [ ] Reward verified activation/meaningful activity rather than raw sign-ups.
- [ ] Prevent self-referrals, duplicate-account farming, automated abuse, and repeated reward claims.
- [ ] Add team/community quest participation and reviewable reward states.

### P1 — Profile, support, activity, and admin operations
- [ ] Persist profile/settings and account/security actions.
- [ ] Replace session-only activity with a server-backed, filterable event/ledger history.
- [ ] Add support/dispute and payment-recovery routes.
- [ ] Add role-protected operational review for payment mismatches, ledger reconciliation, reward disputes, competition abuse, and audit trails.
- [ ] Add notification preferences and durable notification states where included in launch scope.

### P0 — Production deployment and release gates
- [ ] Add repeatable migration/deployment procedure and confirm production D1 migrations match repository schema.
- [ ] Confirm all required Worker bindings/secrets and external-provider configuration without exposing secret values.
- [ ] Confirm custom domain, HTTPS, CORS/origin policy, security headers, error handling, and production environment.
- [ ] Add monitoring/alerts for Worker errors, payment review backlog, ledger mismatches, stale feeds, and provider failures.
- [ ] Run security and abuse tests plus all required concurrency/idempotency/recovery tests.
- [ ] Reconcile database, ledger, payment orders, and reports in a controlled end-to-end run.
- [ ] Verify production build and deployed health after the final commit.
- [ ] Only then hand over for owner testing.

## Explicit unresolved release gates

These are not reasons to stop coding around them; implement safe defaults and keep affected capabilities disabled until evidence/configuration exists:
1. Final market provider approval and its production access/terms.
2. Public competition exposure and any leverage above 1x remain gated on the reserve budget; the current 12,450 TC welcome balance, 1x leverage, 13 bps adverse fill model, 5 bps taker fee, and relative exposure limits are implemented as the conservative practice-mode baseline.
3. AI provider and credentials plus the final definition of a billable AI operation.
4. Email delivery provider/domain for verification and recovery.
5. GRAM asset/network/recipient and verification details.
6. PXY token deployment/issuance and funded reserve for any PXY bonuses/prizes.
7. Production domain and final deployment environment.
8. Legal, security, and operational review appropriate to the launch jurisdictions.

## Definition of “finished”

A screen is finished only when its primary actions call an authenticated backend, persist authoritative state, handle loading/error/empty/success/pending states, are covered by automated tests, and cannot issue balances/rewards or claim payment success from client-side state alone. External credentials, domain ownership, provider terms, and on-chain events must be configured/verified—not faked—to close their release gates.


## AI Credit Store conversion UX pass — 16 October 2026

- Replaced the generic sparkle icon on the Overview AI Credits card and Store heading with a custom Pexoriy AC mark.
- Restructured the Store purchase sequence so users choose a package first, select a payment network next, then see one persistent selection summary and one primary checkout CTA.
- Added a clear “Most Popular” treatment to the existing $25 package without changing the approved package schedule or amounts.
- Removed the duplicate Solana purchase CTA and the GRAM wallet-connect CTA while GRAM checkout remains unverified; wallet connection must not be mistaken for a working payment flow.
- Kept package amounts, live SOL/GRAM estimates, and PXY bonus disclosures. PXY bonus figures remain explicitly planned/not active and are not included in checkout until reserve controls are approved.
- Added responsive selected-package CTA styling and a mobile-friendly sticky order summary. Payment actions remain disabled unless the server reports checkout as configured.
- Added E2E assertions for the custom AC mark, popular package, single CTA, and truthful disabled payment states.
- **Verification status:** this UX pass has been committed to the default branch, but its fresh build, browser regression, and post-deployment visual check still need to be observed before marking the Store section complete. Solana checkout and GRAM payment/credit delivery remain disabled until their existing production release gates are satisfied.


## Owner testing direction — 16 October 2026

- Owner has explicitly directed that Pexoriy be prepared as a fully working, production-like application for end-to-end owner testing; do not intentionally leave launch functionality unfinished merely to postpone testing.
- Keep implementing the complete backend and persistence paths. Where an external service, wallet/recipient, domain, or provider credential is required, make the dependency explicit and finish everything that can be verified without inventing credentials or falsely reporting a payment as complete.
- Native SOL order/verification routes and the receiver secret binding are present in the deployed Worker. A controlled real-transaction test and revenue reconciliation remain required evidence; configured binding alone does not prove a payment has settled correctly.
- The GRAM panel is currently presentation/quote only and needs a real server-side payment integration. AI-assisted execution also still requires a server-side AI provider, billable-operation rules, and idempotent AC settlement.

## GRAM (TON) native-coin payment decision — 16 October 2026

- [x] Owner confirmed the GRAM-branded checkout is paid in the **native TON coin on The Open Network mainnet**, not a GRAM Jetton/token contract and not USDT.
- [x] Owner supplied the intended receiving wallet address: `UQDONKXS7co5fixO6FDnicHEcdCtBRF_arFw0dgvFyjgQqoW`.
- [ ] Validate the address against TON's address format and confirm it resolves on TON mainnet before enabling customer orders.
- [ ] Implement TON Connect payment requests with a unique, order-bound comment/reference; verify on-chain inbound native TON value, recipient, amount, order association, and confirmation state on the server before credit delivery.
- [ ] Add replay-safe/idempotent AC ledger crediting, expired-order and under/overpayment handling, pending/recovery reconciliation, and payment audit events; test these cases against TON testnet and then perform a controlled mainnet transaction before treating the path as live.
- [ ] Host a valid TON Connect manifest on the eventual owned domain; use the current Worker URL only as a temporary integration origin until the domain is configured. Official TON documentation identifies TON Connect as the wallet-to-dApp protocol and documents native TON transfer amounts in nanoTON (1 TON = 10^9 nanoTON).
- [ ] Until server-side chain verification and reconciliation pass, never show a payment as successful or issue AI Credits from wallet UI state alone.
