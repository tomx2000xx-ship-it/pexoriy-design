# Pexoriy — Full-Site Completion and Go-Live Register

Updated: 17 October 2026 (checkpoint audit, payment reconciliation, persistent check-ins, and UX closeout)  
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
- Solana payment means native SOL only; no USDC. Owner confirmed the GRAM-branded checkout uses the native coin on TON mainnet, displayed as GRAM, with the supplied receiving address. Server verification and deployment remain release gates.
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
- [x] Removed browser-only manual trade fallback: unauthenticated/demo users cannot open or close practice positions as if they were persisted account trades. Server-side AI proposal/execution and AC settlement are implemented; live authenticated inference/settlement acceptance remains a release gate.
- [ ] Passing automated checks are not a substitute for provider-term review and final production configuration evidence.

## Stage 2 closeout — live market feed and server-authoritative practice trading (16 October 2026)

- [x] Complete: multi-provider, exchange-timestamped market data for BTC, ETH, SOL, DOGE, and GRAM; stale quotes block order entry and close settlement.
- [x] Complete: authenticated manual simulated-trade open/close, integer TC ledger settlement, idempotency, fee-aware unrealized/realized P&L, persisted history, and database-enforced position/exposure caps.
- [x] Complete: browser UI consumes server P&L and periodically refreshes persisted account/trade state; no browser-only manual-trade fallback.
- [x] Complete: latest full automated workflow and deployed API smoke checks passed in run [38851136150](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/38851136150).
- [x] Complete: live D1 migration and risk trigger verified; latest live snapshots showed fresh, validated exchange timestamps for all five supported markets.
- [ ] Overall product launch is **not** declared complete: the other P0/P1 items below remain separate release gates. AI execution code is present but needs live authenticated acceptance; public competition entry and PXY bonus issuance remain gated; payment paths are not end-to-end verified until controlled mainnet transactions pass.

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
- [x] Server-side Cloudflare Workers AI inference is implemented through the production Worker's `AI` binding; model output is validated before a proposal is saved.
- [x] The defined AI setup operation reserves 1.5 AC, releases the reservation on provider/validation failure, and charges only after a simulated trade executes. Ledger idempotency keys and audit events protect retries.
- [x] Session/proposal state, fresh-market-quote checks, user risk profile, and shared server-side simulated-trade controls are implemented.
- [x] Cloudflare production settings confirm the `AI` binding is present.
- [ ] Run authenticated live AI inference and the complete reserve/release/charge cycle with a real test account. Production currently has no verified users, so this live acceptance test is still outstanding.

### P0 — Native SOL checkout and revenue reconciliation
- [x] Production Worker has the `SOLANA_RECEIVE_ADDRESS` secret binding and authenticated server-side order/verification routes.
- [x] Payment-order idempotency, unique transaction hashes/references, finalized-credit guards, and ledger-based AC delivery are implemented in code and checked by CI schema tests.
- [x] Added `ops/payment-reconciliation.sql` with read-only checks for order states, confirmed-but-uncredited orders, credited orders without posted ledger transactions, review/refund states, failed events, and duplicate hashes.
- [x] Executed all six reconciliation queries against production D1; all succeeded and reported zero rows written and `changed_db=false`.
- [ ] Run a controlled real-SOL transaction and confirm exact amount, recipient, expiry, finality, under/overpayment, wrong-recipient, replay, and duplicate-transaction behavior end-to-end. No production payment orders/events exist yet, so real settlement is not verified.
- [x] Pending/unconfirmed transfers are not counted as completed revenue in the reconciliation report.
- [ ] Keep PXY bonus issuance disabled until reserves and cumulative bonus liabilities are approved.
- [x] Keep the native-SOL path available when its server configuration is valid; fail closed on invalid/unavailable receiver, quote, or verification.

### P0 — GRAM checkout
- [x] Authenticated GRAM (TON mainnet) order creation, unique order reference/comment, server-side chain verification, and idempotent AC ledger delivery are implemented in the candidate code.
- [x] Existing payment orders can be restored and verified again; the UI does not credit AI Credits until the server reports a verified payment.
- [ ] Run a controlled real GRAM transaction through TON Connect and verify recipient, exact amount, order comment/reference, finality, replay handling, and automatic AC delivery. No production payment events exist yet.
- [ ] Confirm TON Connect manifest/domain/origin and production wallet compatibility. The connected Cloudflare account has no configured custom domain, and email sender configuration is also pending.
- [ ] Do not describe GRAM checkout as end-to-end verified until the controlled mainnet acceptance test passes.

### P1 — Missions, check-ins, streaks, and achievements
- [x] Added `0010_daily_checkins.sql` on the isolated candidate: check-ins/streak days are persisted in D1, with one 50 TC reward per user per UTC day, a ledger transaction reference, and immutable history. Production has not received migration 0010.
- [x] Current learning completions, mission claims, referral rewards, and check-in rewards use server-side eligibility and ledger idempotency.
- [x] Reward/check-in responses preserve pending/reconciliation states rather than optimistically claiming a balance change.
- [ ] Permanent achievements and evidence-based Trader Rating still need persistent server-side unlock/scoring rules.

### P1 — Competitions and leaderboard
- [x] The challenge page now presents the approved 24-hour, 7-day, and 14-day formats and the planned 5,000 / 12,000 / 25,000 PXY allocations as planned, not payable rewards. The misleading session-only “join” action has been removed.
- [ ] Competition instances, entries, server-authoritative scores, leaderboards, anti-abuse review, and idempotent settlement are not implemented yet. Entry remains intentionally closed until scoring/eligibility rules and funded reserves are approved.

### P1 — Referrals, teams, and community
- [x] Unique invite codes/links and sign-up attribution are persisted. Activation requires verified email plus a recorded simulated trade; rewards are 250 TC to the referrer and 100 TC to the referred user, posted idempotently.
- [x] Personal team quests at 3 and 5 activated referrals are server-verified and paid once through the ledger; the invite page now has distinct Copy link and Share actions and shows Pexoriy-wide verified activation progress.
- [ ] The planned shared community reward pool is not implemented. Pool size and equal-versus-proportional distribution remain an open product/economic decision; no shared payout is being fabricated.
- [ ] Stronger suspicious-account/device-pattern detection and admin investigation tools remain outstanding. Existing verified-email, unique-attribution, self-referral, rate-limit, and idempotency controls are foundational, not a complete anti-fraud system.

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
3. Live authenticated AI inference/AC settlement acceptance; the Cloudflare AI binding and 1.5 AC operation lifecycle are implemented, but must be exercised with a real test account.
4. Email delivery provider/domain for verification and recovery.
5. Controlled GRAM mainnet payment, TON Connect manifest/domain/origin, and exactly-once AC delivery acceptance.
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

## Native GRAM (TON) checkout implementation pass — 16 October 2026

- [x] Added native TON mainnet address parsing/checksum validation and canonical address comparison. Testnet-formatted receiving addresses are rejected.
- [x] Added authenticated TON payment-order creation using server-owned AI Credit packages and a fresh GRAM/TON USD quote; each order has a unique `PEXORIY:<order-uuid>` comment and a 20-minute quote window.
- [x] Added TON Connect transaction submission from the AI Credit Store. The wallet request sends the exact nano-unit amount to the configured receiving address with the unique comment; the UI never treats wallet approval alone as payment success.
- [x] Added server-side TONCenter transaction lookup and checks for the destination, order comment, amount, transaction time, aborted status, and transaction hash before crediting.
- [x] Added idempotent AC ledger delivery and order-state recovery, duplicate-transaction protection through the payment-order transaction hash, audit events, and explicit pending/underpaid/overpaid/review outcomes.
- [x] Added TON checkout UI for wallet connection, order restoration, payment request, verification, pending states, and balance refresh after server-confirmed crediting.
- [x] Added unit coverage for the provided wallet address, checksum validation, amount formatting, exact order references, recipient mismatch, aborted/pre-order transactions, and under/overpayment. **Six focused helper tests passed in a local Node test run.**
- [x] Added an E2E regression test for restoring and verifying a pending native GRAM order.
- [ ] Run the full project unit/build/E2E regression against the current branch. The GitHub status endpoint has not reported a fresh check for this pass, so no full-suite pass is claimed.
- [ ] Deploy the latest Worker and static build, then smoke-test the TON config/order/verify routes in the deployed environment. The latest observed Cloudflare deployment predates these commits.
- [x] Changed the TON Connect manifest icon to `/pexoriy-icon.png`; the Worker serves a valid 180×180 PNG from the existing Pexoriy brand mark and adds public CORS headers to the manifest route.
- [ ] Verify the manifest and icon from a wallet client after deployment, then update the manifest URL when the custom domain is configured.
- [ ] Perform a controlled mainnet transaction and reconcile the confirmed on-chain transfer, payment order, ledger transaction, and user AC balance before describing the checkout as production-verified. Never use a real customer payment as a test.
- [ ] Add operational reconciliation for payments that arrive after quote expiry, mismatched transfers, provider downtime, and confirmed payments whose ledger delivery needs retry.
- [ ] The user-supplied receiving address is implemented as the public fallback address; the wallet owner must verify it is the intended receiving wallet before launch. No private keys or seed phrases are required or stored by Pexoriy.

## Next implementation phase — server-authoritative AI execution

Proceed next with the AI execution service rather than polishing more UI. Required order:
1. Select/configure the server-side AI provider and verify its availability in the deployed Worker.
2. Implement authenticated AI operation/session endpoints with explicit idempotency keys, credit reservation, and operation logs.
3. Charge AC only for a successful, defined billable operation; release/refund reservations on provider errors, rejected actions, timeouts, or failed trade settlement.
4. Route any AI-proposed trade through the same server-authoritative quote freshness, risk/exposure, position, and TC ledger rules as manual practice trades.
5. Persist session state and activity history; ensure the UI can never create an AI trade or charge AC from client-side state alone.
6. Add provider failure, timeout, duplicate-request, concurrent-session, insufficient-AC, insufficient-TC, and ledger-reconciliation tests before enabling AI execution.

## AI backend foundation — updated 17 October 2026

- [x] Configured the Cloudflare Workers AI binding and selected the server-side model.
- [x] Implemented server-authoritative AI sessions and persisted proposals with unique idempotency keys.
- [x] Implemented AC reservation before provider work, charge of 1.5 AC only after successful simulated execution, and release on provider/validation/trade failure.
- [x] Route AI-confirmed trades through the existing fresh-quote, exposure, position, fee, and TC ledger controls.
- [x] Structured output validation, operation states, and audit events are implemented.
- [ ] Keep the live release gate open until authenticated AI inference, concurrent retry, provider timeout, and AC reconciliation acceptance tests are demonstrated.

## AI execution implementation pass — 16 October 2026

- [x] Added persistent AI session state with start, pause, resume, stop, and strategy configuration endpoints.
- [x] Added a server-side proposal endpoint using Cloudflare Workers AI model `@cf/meta/llama-3.1-8b-instruct`, fresh validated market snapshots, recent price history, and the persisted risk profile. Model output is parsed and validated server-side before a proposal is saved.
- [x] Added an AC reservation ledger transaction for 1.5 AC (3 half-credit atoms). Credits are reserved before inference, released if the provider fails or the proposal is cancelled/expires, and moved from the reserve account to fees only after the server-authoritative simulated trade opens successfully.
- [x] Added a proposal expiry window, idempotency keys, duplicate execution protection through the existing trade-order idempotency path, and recovery for expired proposals or stale operations.
- [x] Added guarded AI trade execution by invoking the same server-authoritative practice-trading route used by manual traders. The AI path does not bypass fresh quote checks, TC ledger debits, simulated fees, position caps, or exposure limits.
- [x] Added a persisted AI activity endpoint and made the AI Trading screen use backend session/proposal state, show the server-generated rationale, cancel reservations, execute through the server, refresh balances, and identify AI-managed positions after refresh.
- [x] Added E2E coverage for authenticated AI session start, server proposal, successful simulated execution, AC charge, and AI-managed position display.
- [x] Added `.github/workflows/pexoriy-validation.yml` to run Worker syntax validation, unit tests, production build, and desktop/mobile Playwright flows on pushes to `main`.
- [ ] Wait for and inspect the new CI run. No fresh build/E2E result has been observed yet; the current code is not claimed to have passed the full suite.
- [ ] Deploy the Worker and static build so migrations `0007_ai_credit_half_units.sql` and `0008_ai_sessions_proposals.sql` are applied before the new endpoints run.
- [ ] Verify the configured Workers AI binding and run a controlled inference against the deployed provider; provider failures must release the AC reservation.
- [ ] Verify the complete AI lifecycle in the deployed app: start/pause/resume/stop, proposal generation, cancellation/expiry refund, execution, duplicate retries, failed trade settlement, and account/activity refresh.
- [ ] Native TON checkout and AI execution are source-implemented but **not production-deployed or end-to-end verified yet**. Do not invite the owner to the final test pass until CI and deployment smoke checks are green.

## Release-note correction — TON Connect asset and AI provider

- [x] The TON Connect manifest now points to `/pexoriy-icon.png`, served by the Worker from the existing Pexoriy brand mark as a real 180×180 PNG. The Worker also adds public CORS and cache headers to `/tonconnect-manifest.json`, matching TON Connect's documented manifest requirements. <https://docs.ton.org/applications/ton-connect/get-started>
- [x] AI inference parsing now handles Cloudflare Workers AI's documented chat-completion response shape (`choices[0].message.content`) and uses the currently documented `@cf/google/gemma-4-26b-a4b-it` model with reasoning disabled. <https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/>
- [ ] These Worker and asset changes still need deployment and live smoke tests. The repository code is updated, but the currently observed Cloudflare deployment predates this implementation pass.


## Verified growth, learning and presale implementation — 16 October 2026

### Implemented in the staged scope branch

- [x] Added migration `0009_verified_growth_learning_presale.sql` for unique referral codes and attribution, learning lessons/attempts/progress, and an explicit presale settings row. The default is `preview_enabled=1`, `sale_enabled=0`, `launch_state='disabled'`.
- [x] Seeded five short learning lessons covering market pairs and quote freshness, long/short, position sizing and leverage risk, AI Credits and AI proposals, and shared challenge rules.
- [x] Added authenticated server endpoints for learning content and quiz attempts. Correct answers remain server-side; the server scores attempts, rate-limits attempts, persists progress, issues TC through the existing balanced ledger with a unique idempotency key, and records an audit event.
- [x] Added server-verified mission claim endpoints. The server checks the underlying trading/AI/challenge/learning records before a TC reward can be posted. Client-only mission completion no longer issues account-mode TC.
- [x] Added unique referral links and registration attribution, plus verified activation based on email verification and a recorded simulated trade. TC referral rewards use idempotent ledger transactions; PXY is not issued through referrals.
- [x] Added server-verified referral team quests (3 and 5 activated referrals) with TC-only milestone rewards, one-time claim records, ledger idempotency, and audit events. Demo mode shows no fabricated referral counts or milestone progress.
- [x] Added the Learning Center page, persistent mission/reward UI, referral stats and team quests based on server counts, and a PXY Presale Preview page reachable from the public landing page, sidebar, and PXY Token page.
- [x] Added mobile-responsive styles for the learning and presale preview pages.
- [x] Added a CI step that executes the ordered SQL migrations against an in-memory SQLite database and checks the expected tables, five learning lessons, and active referral team quests.
- [x] Latest scope-branch commit `6cb2b1f3e9e3a607e838bff8eef8e4fc55cc0d32` passed Worker syntax validation, ordered migration validation, unit tests, production bundle build, and desktop/mobile Playwright tests. E2E coverage includes the public presale CTA, mobile route access, verified team-quest claim flow, demo referral-state honesty, and the sale-activation guard.



### Isolated preview environment

- [x] Created a separate Cloudflare D1 database named `pexoriy-preview` (UUID `c70a09f0-8d61-45ed-b207-c6418e42998b`) for preview testing; it is not the production database.
- [x] Configured Wrangler preview bindings to use the preview D1 database, so preview traffic cannot accidentally read or mutate production account data.
- [x] Configured the dedicated scope-branch preview build to apply ordered migrations to the preview database before creating the preview Worker. The first preview attempt exposed a Wrangler requirement for `--remote --preview`; the trigger command was corrected and the latest preview build succeeded.
- [x] Verified the preview migration ledger contains migrations 0001–0009, five active lessons, two active team quests, and a presale row with `sale_enabled=0`.
- [x] Configured the production build trigger to run `npx wrangler d1 migrations apply pexoriy-core --remote` before `npx wrangler deploy`. This will apply only unapplied migrations, capture a Cloudflare backup, and halt deployment if the migration fails. The production trigger ran successfully after promotion to `main`; the release evidence is recorded below.

### Still required before production activation

- [x] Review the latest CI run after the UX-safety and team-quest patches; the latest scope-branch CI and preview build succeeded.
- [x] Promoted the verified scope branch to `main`. The production Wrangler migration step applied `0009_verified_growth_learning_presale.sql` and the production build succeeded. Cloudflare reports 100% traffic on Worker version `4c29d79d-2d84-442d-8afd-db8bf5da063f` (deployment `9d5950c8-4e0f-4a06-aaa7-d6e302b971a1`). Production D1 history contains `0001`–`0009`; the production Worker binding remains `3add741b-bda8-4f47-b857-538ff9a1dae8`; five lessons and two team quests are present; `sale_enabled=0` and `launch_state='disabled'`.
- [ ] Review referral abuse monitoring and campaign economics before broad promotion. Current safeguards include verified email, a unique attribution per referred account, a first simulated trade requirement, request rate limits, self-referral rejection, and idempotent rewards; they are foundational, not a complete device/IP fraud-detection system.
- [ ] Complete a full-site UX review for long pages, navigation consistency, keyboard focus, touch targets, and screen-size behavior beyond the newly added pages.
- [ ] Review the presale with qualified legal/compliance advisers for applicable jurisdictions, offering terms, eligibility, token contract/allocation, payment/refund, and consumer disclosures before any sale is enabled.
- [x] Confirmed the production Worker and static assets deployed successfully through Cloudflare deployment/version metadata, and verified the production D1 schema/state directly.
- [x] Automated live production smoke checks passed after deployment: `GET /api/presale/status` returns `previewEnabled=true`, `saleEnabled=false`, and `launchState='disabled'`; unauthenticated `GET /api/learning` returns HTTP 401.
- [ ] Run the remaining live authenticated user-flow checks on the public app: registration without a referral code, referral registration/activation, quiz retries and duplicate claims, mission eligibility rejection, and account ledger display. CI covers the UI flows locally; these authenticated checks still require a real verified test account.
- [x] Verified `sale_enabled=0` and `launch_state='disabled'`. The preview contains no purchase flow, and sale activation remains a separate owner-approved launch decision.


## Production-readiness recheck — 17 October 2026

### Live state verified read-only

- [x] Cloudflare Worker metadata confirms production Worker `pexoriy-design` is at 100% traffic on version `4c29d79d-2d84-442d-8afd-db8bf5da063f`, deployment `9d5950c8-4e0f-4a06-aaa7-d6e302b971a1` (deployed 16 October 2026).
- [x] Production D1 read-only queries confirm migrations `0001`–`0009`, five active learning lessons, two active referral quests, and presale state `preview_enabled=1`, `sale_enabled=0`, `launch_state='disabled'`. All audit queries reported zero rows written and `changed_db=false`.
- [x] The isolated preview D1 database also has migrations `0001`–`0009`, five lessons, two active referral quests, and the same disabled sale state. Read-only checks made no changes.
- [x] The connected Cloudflare account has no configured zones/custom domains returned by the Zones API. The production Worker has an `EMAIL` binding, but this does not prove verification-email delivery is configured; referral activation still requires verified email.
- [x] Production D1 currently contains zero payment orders/events and zero verified users. No real payment settlement or authenticated referral activation has therefore been evidenced by production ledger data.

### Release candidate isolated from production

- [x] Created `scope/production-readiness-reconcile-20261017` from current `main` to avoid promoting a divergent branch wholesale.
- [x] Staged the referral-activation helper and safe retry behavior on this candidate branch, together with the production-safe validation workflow. Candidate commits: `2e3999377651b2df8cbd92b1b4351a9b50f1688e` and `8c90be8ccf9b07cde12b2f933b637d35afff58ad`.
- [x] Cloudflare candidate preview build `e57ecd09-ccdc-4bd9-b5d2-452f363ef0c0` completed successfully for commit `8c90be8ccf9b07cde12b2f933b637d35afff58ad`; preview URL: `https://scope-production-readiness-reconcile-20261017-pexoriy-design.mails4dikewills.workers.dev`.
- [ ] GitHub Actions combined-status endpoint currently returns no check entries for the candidate commits; full unit and Playwright CI results are not yet independently confirmed.
- [ ] The preview URL and API routes are inaccessible to the external browser checker in this session, so browser-level smoke tests and authenticated acceptance tests are still outstanding.
- [ ] Build output remains large: approximately 1,210 kB minified JavaScript (about 362 kB gzip), above Vite's 500 kB chunk warning threshold. Build logs also confirm no committed package-manager lockfile; dependency reproducibility/cache remains a release-hardening task.
- [ ] No production merge/deploy of this candidate has been performed. Production D1 was only read. Presale remains disabled.

### Production gates still open

1. Obtain confirmed GitHub CI results for syntax validation, ordered migrations, unit tests, and desktop/mobile Playwright flows.
2. Complete authenticated acceptance tests for registration/email verification, referral attribution and activation, duplicate trade retry, learning reward idempotency, mission rejection, and ledger/account display.
3. Configure and test verification-email delivery using a verified sender domain; do not relax verified-email referral controls as a shortcut.
4. Test payment verification and credit allocation with a controlled supported-wallet transaction; no on-chain payment has been verified yet.
5. Address dependency lockfile/reproducibility and evaluate safe route-level code splitting without changing product behavior.
6. Promote only after the candidate passes tests and a production smoke check. Keep PXY presale activation as a separate explicit launch decision after legal/compliance and payment/refund readiness.


## Superseding checkpoint audit — 17 October 2026

This section supersedes older checklist statements above where they conflict with the newer evidence.

### Candidate changes and verification evidence

- [x] Committed `bun.lock`, pinned direct dependencies, and switched CI to `bun install --frozen-lockfile`. The latest candidate CI run passed the frozen install.
- [x] Split the main JavaScript and vendor libraries into separate cached chunks. Latest successful Cloudflare build has no chunk over Vite's 500 kB warning threshold; the largest emitted chunk is the TON Connect UI vendor chunk at about 357 kB minified. This improves caching/chunk size but does not mean the total initial-download bytes have fallen by the same amount.
- [x] Candidate preview build `4ef6f5dc-bf23-419e-9d32-184ad2ae53b6` completed successfully for the latest UI/test branch state; preview migration command found no pending migrations.
- [x] Preview D1 has migrations `0001`–`0010`, including daily check-ins; presale remains `preview_enabled=1`, `sale_enabled=0`, `launch_state='disabled'`.
- [x] GitHub Actions run [`39025850882`](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/39025850882) passed Worker syntax validation, ordered migrations, payment schema safety checks, unit tests, production bundle build, desktop/mobile Playwright flows, and candidate preview endpoint smoke tests. The production smoke step was correctly skipped because this was a candidate-branch run.
- [x] Production D1 was rechecked read-only: migrations remain `0001`–`0009`; `daily_checkins` is absent from production; presale remains disabled; payment orders/events, verified users, and activated referrals are all zero. All queries reported zero writes and `changed_db=false`.
- [x] The candidate branch is based on current `main` and is ahead by 38 commits with zero commits behind. It has not been merged or deployed to production.

### Still open before production sign-off

1. **Real payment acceptance:** run a controlled SOL and GRAM mainnet payment through the actual checkout, confirm the on-chain transaction and exactly-once AC delivery, then run the reconciliation report. The report is ready, but production has no payment evidence yet.
2. **Email verification:** intentionally deferred until the owner creates/configures the sending domain and sender identity. Cloudflare has an `EMAIL` binding, but no sender variables/custom domain are configured; do not weaken the verified-email referral gate.
3. **Shared referral reward pool:** the page now shows global community progress, but the shared pool and its payout rule remain unimplemented until pool budget and equal-versus-proportional distribution are decided.
4. **Competition service:** the UI is an honest launch-gated preview; persistent entries, scoring, leaderboards, anti-abuse review, and prize settlement still need implementation and approval of rules/reserves.
5. **Operations and progression:** persistent achievements/Trader Rating, role-protected admin review, support/dispute recovery, and stronger duplicate-account/device-pattern fraud review remain incomplete.
6. **Live authenticated acceptance:** test account registration/verification, referral activation, check-in, AI inference/credit settlement, and the account ledger. Email-dependent tests must wait for the sender domain.
7. **Promotion:** do not merge/deploy this candidate or apply migration `0010` to production until the relevant gates above are passed and the owner approves promotion. Keep PXY presale disabled.
