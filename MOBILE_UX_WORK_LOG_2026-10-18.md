# Mobile UX production handover — 2026-10-18

## Changes committed to main
- `src/mobile-ux-overrides.css`: responsive mobile spacing, touch targets, mission/challenge card layout, lesson readability, referral wrapping, reduced-motion support, and mobile lesson-preview guidance.
- `src/main.jsx`: imports the mobile UX stylesheet.
- `src/App.jsx`: mobile Learning Center opens a dedicated lesson view with an “All lessons” back control; the lesson-list screen keeps a preview/sign-in hint visible. No lesson submission or reward API behavior was changed.
- `wrangler.frontend-release.jsonc`: production release config binds `DB` to production `pexoriy-core` and omits migration configuration.
- `tests/e2e/product-flow.spec.js`: responsive assertion distinguishes the mobile lesson-list hint from the desktop lesson-detail note.
- `.github/workflows/verify-product-flow.yml`: added a public static-asset smoke test that checks the production homepage and its JS/CSS bundles without calling API/D1 endpoints; live DB-backed API smoke checks require the explicit `[db-validation]` commit marker.

## Confirmed production deployment
- Cloudflare Workers Build `ee5cab17-10d9-43c9-99f5-72a17e74b02b` completed successfully for app commit `c53031efcbb0ed30924212107fa18d8b75ecf149`.
- Active production deployment: `b0894665-a543-4b8e-92dc-3cdf6001018a`.
- Active Worker version: `eacfa347-a9be-4823-a049-7ef93617f416` (version 238), serving 100% of traffic.
- Version metadata confirms `DB` points to production `pexoriy-core` database ID `3add741b-bda8-4f47-b857-538ff9a1dae8`, not the preview database.
- Cloudflare logs confirm the JS/CSS assets were uploaded and the Worker deployed at https://pexoriy-design.mails4dikewills.workers.dev.
- Cloudflare production build settings now use `npx wrangler deploy --config wrangler.frontend-release.jsonc`; the successful release did not run a D1 migration command.

## D1 quota issue
- Earlier builds using `npx wrangler d1 migrations apply pexoriy-core --remote` failed with Cloudflare error 7500 because the account's daily D1 row-read limit was exceeded.
- Those attempts failed before deployment. The later migration-free frontend deployment succeeded.
- No schema/data consolidation or database migration was performed.

## Validation status
- Earlier GitHub Actions run [39121997223](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/39121997223) had 46 browser tests pass, one skipped, and one mobile Learning Center assertion fail. The UI was adjusted to keep the preview hint visible on the lesson list, and the test was updated to distinguish mobile from desktop behavior.
- Latest GitHub Actions run [39122491018](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/39122491018) was still running at the last check (Chromium setup); it includes the updated assertion and a live static-asset smoke test. Its final result must be checked before calling the suite green.
- The live DB-backed API smoke step is gated behind `[db-validation]` and was not intentionally invoked by this frontend-only work.
- Direct public HTTP inspection from this session was unavailable; the GitHub static-asset smoke test is the pending independent HTTP verification.

## Tomorrow's handover
- Do not redo the responsive stylesheet, stylesheet import, Learning Center mobile detail/back navigation, or preview hint.
- Resume D1 usage/schema/migration reconciliation from `CHECKPOINT_2026-10-18_MOBILE_COMPETITION_REFERRALS.md`.
- Compare `pexoriy-preview` and `pexoriy-core` schema, migration history, dependencies, and necessary data before any consolidation or deletion.


## Signature UI/UX implementation — 18 October 2026 (latest)

### Direct-to-main commits
- Dashboard quick-action command bar and balance prioritisation: `314ccddcf8d39ad96b628de49959fb70eaa4e09b`.
- Compact mobile-first dashboard layout and spacing: `a0cfc0b07f9c82b3d86c28b9e01b0a4ad22bf91b`.
- Responsive AI Credit Store, challenge/Arena, referral and PXY token layouts: `390ed54e13cbdaff5083f5a21eaa02040443bb78`.

### What changed
- Added a visible mobile dashboard command bar for Practice, AI Centre, Challenges and Invite Friends so the primary destinations are immediately discoverable.
- Reordered dashboard presentation so the primary trading/challenge hero is followed by balances before the streak/referral modules; retained the full content and destinations.
- Tightened mobile header, page spacing, hero height, balance cards, streak, referral, AI Centre, challenge cards, market rows, missions and bottom navigation for small screens and touch.
- Added responsive AI Credit Store package sizing/labels, clearer selected-package treatment, and mobile payment-method layout; added responsive challenge, referral and PXY token screens.
- Preserved the dark graphite/acid-lime visual identity and the existing TC/AC/PXY messaging, payment behavior, reward gates, market data, and API/backend logic.

### Production evidence
- Active production deployment: `a2e2bdbf-23ff-4fe6-ab5b-77744e5f13a5`.
- Active Worker version: `cdd19380-617a-44b2-b817-d7241e3d0ad1` (version 241), serving 100% of production traffic.
- Version metadata confirms `DB` remains bound to production `pexoriy-core` (`3add741b-bda8-4f47-b857-538ff9a1dae8`).
- This was a frontend-only release. No D1 migration, schema change, data copy, or database write was performed as part of the UI work.
- Production URL: https://pexoriy-design.mails4dikewills.workers.dev

### Validation boundary
- Cloudflare confirms version 241 is deployed to 100% of traffic. This confirms deployment, not a human visual review of every screen.
- Do not claim the new screens were visually inspected on a physical phone unless an actual browser/device review is completed.
- Next review should focus on visible production rendering at mobile widths (360–430 px) and tablet widths; preserve this work and do not redo the UI changes during the separate D1 reconciliation phase.


## Full action-first UX pass — 18 October 2026 (follow-up)

### Direct-to-main commits
- Mobile information architecture, dashboard balance spotlight, AI Centre removal from top-level navigation, practice-mode switch, presale discoverability, and referral activity launchpad: `75ee29e0744f27f41fb83bc9794b879c10d6714f`.
- Mobile quick actions and active-state refinement for AI-assisted mode nested under Practice: `9aca87626dd7f0e3a45a9fbd58f6d4fba288f84a`.
- Recorded closed-trade simulated P&L, TC allocated to open positions, and open-position count in the balance spotlight; updated the header context for AI-assisted practice: `cb7bf1f8af1283800d6e7f610ed1144adf8b0398`.
- Balance metrics and compact mobile hero refinement: `459b86d9f90b235ea8aaa086c3150de83fbb6cfe`.

### Experience changes
- Mobile overview now leads with a large available Practice Balance and includes recorded closed-trade simulated P&L, TC allocated to open positions, open-position count, a primary Practice Trading action, Activity access, and direct AI Credit Store / PXY presale links.
- Daily check-in and streak progress are ordered immediately after the balance. The welcome hero is compacted on mobile so it does not crowd out actionable content.
- Removed the redundant AI Centre dashboard panel and AI Centre from primary sidebar and bottom navigation. AI-assisted practice is presented as a mode reached from the Practice Trading workspace; the Practice item remains active while that mode is open.
- Mobile primary navigation is now Overview, Practice, Challenges, Missions, and Invite. Quick actions are Challenges, Missions, and Invite; the balance card is the main Practice Trading CTA.
- Added a community activity launchpad on Referrals with routes to Missions, Learning, Practice, and Challenges. It explicitly distinguishes useful participation from the server-listed quests that alone count toward verified team progress/rewards.
- Made PXY Presale Preview searchable, linked from the mobile balance spotlight, and available through Profile product resources. Presale/payment state remains unchanged.
- Practice Trading presents a compact mode selector and prioritises the order ticket ahead of the market chart on mobile; the responsive layout reduces unnecessary scrolling.
- Added compact recorded-performance metrics and smaller-screen adaptations at 320–430 px, plus focus/reduced-motion-aware styling.

### Scope and guardrails
- Frontend JSX/CSS only. No D1 access, migration, schema edit, ledger write, reward-rule change, trade-rule change, payment-provider change, or backend/API behavior change was performed.
- Existing simulated-trading disclosures and server-backed trade/AI/reward gates are retained. P&L shown in the spotlight is calculated from the loaded trade-history records; it is labelled as simulated.
- GitHub source assertions confirmed the new balance spotlight, Missions bottom-nav item, removed dashboard AI Centre card, nested AI practice label, referral activity grid, and searchable presale destination.
- Deployment must be verified against the latest frontend commit below before reporting it live. A successful GitHub write alone is not proof of a production deployment.
