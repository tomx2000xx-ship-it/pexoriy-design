# Pexoriy Work Checkpoint — 2026-10-18

## Stop point
Pause point requested by the project owner after repository/schema inspection became unusually slow. Resume from this file; do not restart discovery from scratch or assume unfinished work is complete.

## Current branch and safety
- Working branch: `scope/mobile-rewards-competition-20261018`
- Branch was created from `main` for the 2026-10-18 mobile/rewards/competition work.
- No application code, database migration, or production setting has been changed on this branch in this session before this checkpoint.
- Do not merge or deploy this branch merely because the checkpoint is saved. Candidate CI and release verification must pass first.
- Production remains on the previously verified app deployment from commit `b80e75eb09c03e9e7af75f1d3d3cdff7179ed1e2`, Cloudflare deployment `ed30bed0-8755-4487-9916-a122edd9e844`, version `eb027413-4eef-4a49-9b8a-19f95fd3b15e` (100% traffic at the last confirmed check). Later main commits were documentation-only. Verify the live deployment again before any future promotion.

## Work confirmed from repository inspection
- Production-ready candidate code was promoted and deployed previously; the currently confirmed deployment includes the prior release scope, not the new items requested on 2026-10-18.
- Existing `worker/solana-payments.js` includes Solana mainnet constants, base58 address validation, Solana Pay URL creation, and transaction validation helpers. This is not evidence of an end-to-end live SOL payment acceptance test.
- Existing `worker/ton-payments.js` contains TON address and incoming transaction validation. This does not prove production payment receipt or credit settlement.
- Migration `0009_verified_growth_learning_presale.sql` creates referral attribution/team quest tables, learning content/progress, and presale launch gates. It seeds 3-activation/300-TC and 5-activation/600-TC team quests, but requires verified email and first simulated trade for activation as described in the schema.
- The current validation workflow `.github/workflows/pexoriy-validation.yml` checks ordered migrations, Worker syntax, unit tests, build, desktop/mobile Playwright flows, candidate preview endpoints, and (on main) HTTP status for the presale status endpoint and authentication on the learning endpoint. It does not yet establish all requested live payment/AI acceptance scenarios or broad HTTP smoke coverage.
- Current UI navigation includes Overview, Practice Trading, AI Trading, Community Challenges, Referrals; the application already has screens named Missions & Rewards, Learning Center, AI Credit Store, PXY Token, Activity, and Profile & Settings. The mobile bottom navigation currently labels AI Trading as “AI Centre”, while the main nav still includes AI Trading as a destination. User requests moving the persistent slot to Missions & Rewards, with AI access reachable from Practice Trading.
- Learning Center currently renders a two-column lesson list and lesson content inline on the same page. On mobile, a selected lesson can appear below the list; this matches the user-reported discoverability problem and should be redesigned as a dedicated lesson view/dialog with an obvious back action.
- Mission completion/check-in code includes demo-only local state paths. Ensure real account rewards remain server-verified and ledger-backed; do not award production TC from client-only mission toggles.
- Challenge UI exists, but the prior checkpoint states persistent competition entries/scoring/leaderboard/prize settlement are not yet complete. Do not describe competitions as finished until backend schema, endpoints, idempotent accounting, rules, and tests are present.
- Existing referral team quests are not the same thing as the proposed community referral packs/shared referral pool. The pool allocation/formula still needs a documented decision and implementation before it can be called complete.

## What stalled
A tool request fetching several migration files plus the large `worker/index.js` was unusually slow. Do not repeat a broad parallel fetch of many large files. Resume with small, targeted file reads (one migration or bounded line ranges at a time) and inspect the exact existing schema before authoring any new migration. No new competition/referral-pool migration has been created in this work.

## Owner's decisions / requirements to preserve
1. Email verification sender/domain work is paused until the owner buys/configures a domain. Do not weaken existing verification gates to work around this.
2. PXY issuance/bonus distribution must stay disabled until reserve backing and launch approval are verified. Do not activate presale or mint/distribute PXY just to mark a task complete.
3. Complete and evidence real Solana/GRAM payment acceptance and AI inference + credit settlement, including explicit live HTTPS HTTP status codes, provider transaction/request evidence, and ledger/balance verification. Do not make fake payments or use production funds without explicit authorization.
4. Finish competitions end-to-end with persistent entries, server-authoritative scoring/leaderboards, clear published rules, anti-abuse/idempotency, and prize settlement gated safely.
5. Decide and document the referral shared-pool math, eligibility, allocation, cap, anti-abuse rules, and settlement; keep actual PXY payouts gated pending approvals/reserves.
6. Mobile-first UX: show balances, TC, AI Credits, PXY status, level/badges/achievements, and mission progress at a glance; replace the mobile AI Centre bottom-nav slot with Missions & Rewards; AI exploration remains accessible from Practice Trading; make lesson cards open an obvious dedicated lesson page/dialog; reduce unnecessary scrolling; add the community/individual referral packs to the Invite page.
7. Keep the existing good desktop visual identity; do not rebuild from scratch or change the brand unnecessarily.

## Next resume sequence
1. Read this checkpoint and verify the actual `main` SHA, Cloudflare build/deployment/version/traffic, D1 bindings and migration ledger before doing new work.
2. Inspect competition-related migrations and `worker/index.js` using narrow line ranges; map existing routes and tables first.
3. Create a completion matrix separating already deployed, newly implemented, verified, and still gated work.
4. Implement in a scoped branch, adding ordered migration(s), server endpoints, unit/schema tests, and mobile UI changes. Keep PXY payouts and live payment acceptance disabled until safe evidence exists.
5. Run frozen-lockfile install, Worker syntax checks, ordered migration tests, unit tests, desktop/mobile Playwright, and candidate preview HTTP checks.
6. Only after all relevant checks pass, promote the exact tested SHA to `main` per `DEPLOYMENT_RELEASE_RUNBOOK.md`, then verify Cloudflare deployed that exact app SHA, 100% traffic, correct production D1 binding/migrations, and live HTTP status-code evidence. Do not call it done from deployment metadata alone.

## Last known live release links
- Main: https://github.com/tomx2000xx-ship-it/pexoriy-design/tree/main
- Deployment runbook: https://github.com/tomx2000xx-ship-it/pexoriy-design/blob/main/DEPLOYMENT_RELEASE_RUNBOOK.md
- Current work branch: https://github.com/tomx2000xx-ship-it/pexoriy-design/tree/scope/mobile-rewards-competition-20261018
