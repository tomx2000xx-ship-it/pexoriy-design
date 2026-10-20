# Pexoriy production-readiness checkpoint — 2026-10-20

## Repository and release state
- Repository: `tomx2000xx-ship-it/pexoriy-design`
- Working branch: `scope/finish-production-20261020`
- Correct write connection: GitHub `Remote` / `tomx2000xx-ship-it`
- The branch contains incremental commits; none of this checkpoint's changes has been merged or deployed. Before release, consolidate the incremental branch commits into one reviewed release commit so unfinished work is not left scattered across `main`.
- Production Worker deployment observed: version `a8e318b1-9a49-4c45-a485-47e184d1c724`, 100% traffic, deployment created 2026-10-19 23:45:53 UTC.
- Added `.github/workflows/validate.yml` to run unit tests and a production build on pushes to `main` and `scope/**`. The GitHub connector returned no legacy commit statuses and does not expose the push-run result here yet. Full repository build and unit suite have not been run in this execution environment because it could not resolve GitHub for a clone/install. Do not describe this branch as build-verified or production-deployed.

## Direct production D1 inspection (read-only)
- Database: `pexoriy-core`, ID `3add741b-bda8-4f47-b857-538ff9a1dae8`.
- Migration ledger contains `0001_core.sql` through `0018_risk_aware_competition_scoring.sql` (18 entries).
- Core tables for ledger, users, trading, payments, missions, learning, competitions, referrals and PXY pack controls exist.
- PXY issuance controls remain closed: reserve verification = 0, launch approval = 0, issuance enabled = 0.
- Presale settings remain closed: `sale_enabled=0`, `launch_state='disabled'`.
- Current data counts observed: users 0; payment orders 0; referral pool awards 0; mission claims 0; competition rounds 0. Competition rounds are created by the authenticated competitions API when used; their absence alone is not evidence of a missing migration.
- Referral policy row is active: 10,000 TC per 7-day cycle; maximum 1,000 TC per eligible referrer.
- Do not apply migration 0019 until the D1 operation limit is confirmed safe. No production database writes were made during this checkpoint.

## Changes prepared on the working branch
- Referral rewards: removed the fixed 250 TC inviter payment; verified referred members retain the idempotent 100 TC new-member reward. Email verification is currently optional for referral activation; set Worker variable `REQUIRE_EMAIL_VERIFICATION=1` when email verification is enabled for launch. Inviter TC rewards are now allocated proportionally from a funded 10,000 TC weekly reserve, capped at 1,000 TC per referrer, finalized on cycle close, and claimed through an idempotent ledger transaction.
- Weekly pool uses Monday 00:00 UTC to next Monday. Scheduled maintenance finalizes closed rounds and opens/funds the current cycle. PXY issuance is not enabled by this work.
- Referral UI now shows the weekly pool ceiling, per-user cap, verified activity, and explicit pending/claimable/settled states.
- GRAM pricing: catalog display and checkout calculate nano-GRAM from the USD tier and a fresh GRAM/USD quote. A quote failure blocks pack-price confirmation rather than showing a stale value as current.
- Migration `0019_seed_community_pxy_pack_catalog.sql` prepares seven PXY bundle rows matching the existing planned bonus tiers: 100, 200, 500, 1,000, 2,000, 5,000 and 10,000 PXY. These remain hidden and unpurchasable until the PXY reserve and launch approval gates are enabled. The seed is idempotent and has not been applied to production.
- The 50,000 PXY pack cap is described in UI as a sub-reserve within the community allocation, not additional token supply.
- Added focused unit tests for referral pool calculation and GRAM amount conversion.

## Validation performed
- Re-read changed source files from the working branch and checked expected imports, route names, pool ledger debit, UI claim wiring, migration seed and test files.
- Ran 9 focused helper-logic checks in an isolated Node harness: 9 passed. This is not a substitute for running `npm run build` and `npm run test:unit` against the complete repository.
- No migration was applied, no PXY issuance gate was opened, no production Worker was updated, and no live payment was claimed as verified.

## Next required steps
1. Run the full build and `npm run test:unit` against this exact branch in an environment with the repository and dependencies available.
2. Fix any integration/build failures, especially the Worker route and JSX render paths.
3. Reconcile all 18 applied migrations against the repository migration directory.
4. When the D1 daily limit is safe, apply migration 0019 and verify its recorded migration entry and seven catalog rows. Keep PXY issuance disabled.
5. Deploy the validated code to the connected Cloudflare Worker, then verify the active version and production API/UI behavior. Do not claim deployment until the Worker version confirms it.
