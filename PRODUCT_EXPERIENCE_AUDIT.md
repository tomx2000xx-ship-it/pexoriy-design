# Pexoriy Product Experience Audit
**Status:** Working design specification  
**Updated:** 15 October 2026  
**Purpose:** Align the current React/Vite experience with the intended launch product before backend implementation. This is an internal working document, not customer-facing copy.

## 1. Product standard

Pexoriy is being built for a future launch. There are no current customers to support, so screens should describe and design the intended product journey rather than expose development-stage limitations. Keep the frontend honest during development, but do not let “not connected yet” notices become the finished UI.

The experience must be one coherent, mobile-first product: premium, confident, community-driven, clear about simulated trading, transparent about AI Credit costs, and careful not to imply that practice balances or simulated P&L are real money.

## 2. Source-of-truth hierarchy

Use the latest explicitly agreed project decisions in the conversation when they supersede the older 12 October working brief. Preserve unresolved decisions as unresolved; do not fill gaps with invented token economics or trading rules.

### Current directions to preserve
- Crypto only; no forex.
- Practice Trading uses real crypto market prices with simulated execution. It does not send real exchange orders.
- Manual simulated trading must remain usable without AI Credits.
- TC funds practice positions. It is not cash and has no present fixed conversion to PXY.
- AI Credits pay for clearly defined AI operations. Display the cost before confirmation; purchased credits do not count toward any free-earned cap.
- PXY is the actual intended project token, currently pre-launch. Do not invent a market price, listing date, guaranteed value, or guaranteed individual allocation.
- GRAM is the intended payment-asset branding for the AI Credit Store; the technical wallet/network/token path must be validated before payments are implemented.
- Current competition direction: 24-hour Sprint (5,000 PXY), 7-day Consistency League (12,000 PXY), and 14-day Challenge (25,000 PXY). These more recent decisions supersede the older 20-day format in the working brief.
- TC history may contribute to a future airdrop calculation, but no conversion rate or guaranteed allocation is promised.
- User preference: React JSX + Vite, preserve repository structure, direct commits to the connected Remote GitHub repository and Cloudflare workflow; no PRs or Lovable.

### Decisions already finalized — preserve without reopening
- **AI Credit Store package schedule is fixed and must remain unchanged:** $5 equivalent in GRAM = 70 AI Credits + 100 PXY; $10 = 140 AI Credits + 200 PXY; $25 = 350 AI Credits + 500 PXY; $50 = 700 AI Credits + 1,000 PXY; $100 = 1,400 AI Credits + 2,000 PXY; $250 = 3,500 AI Credits + 5,000 PXY; $500 = 7,000 AI Credits + 10,000 PXY. Do not replace, reduce, cap, or reinterpret these approved packages or PXY bonuses without the user's explicit instruction.
- **PXY community allocation is fixed at 60% of the 100,000,000 supply (60,000,000 PXY):** 30% initial airdrop (30,000,000 PXY), 20% ongoing community rewards (20,000,000 PXY), and 10% future community reserve (10,000,000 PXY). Do not mark this as unresolved or ask the user to reconfirm it.
- Final simulated execution rules: spread/fees, leverage, order types, position sizing/risk limits and P&L calculation.
- Market-data provider, freshness thresholds and final asset catalogue.
- Exact definition of one billable AI operation/cycle and when credits are reserved, charged or refunded.
- Competition scoring, eligibility, tie-breakers, anti-abuse review and settlement rules.
- Wallet/network implementation, purchase confirmation rules, and token issuance mechanics.

## 3. Intended customer journey

1. **Discover Pexoriy:** Understand practice trading, optional AI assistance, community challenges, and the difference between TC, AI Credits, and PXY.
2. **Create account:** Register by email, verify email, handle errors/resend/recovery, and establish a secure session.
3. **First-run onboarding:** Explain the product loop concisely; establish the practice balance; show the first-trade path; introduce AI and its credit costs without overwhelming the user.
4. **Overview:** See practice balance, AI Credit balance, next useful action, current streak/check-in, challenge progress, mission progress, referrals, and open positions. All balances and claims must be backed by the account state.
5. **Practice Trading:** Search/select a market, inspect market status and update time, choose long/short, set position size and permitted controls, review an order summary, confirm a simulated entry, monitor open positions and simulated P&L, close a position, then inspect trade history.
6. **AI Trading:** Choose markets and risk guardrails, inspect the operation cost, review what AI is allowed to do, confirm start, monitor AI actions and credit usage, pause/stop, and inspect position/action logs. Insufficient credits, stale data, breached limits, and service failures need distinct states.
7. **AI Credit Store:** Select a confirmed package, review AI Credits and any PXY bonus separately, see a GRAM estimate with quote freshness, connect a supported wallet if needed, review payment details, confirm in wallet, see pending-chain confirmation, then receive a verified success or actionable failure. Never imply payment succeeded before chain verification.
8. **Community Challenges:** Browse open/active/ended challenges, inspect a detail page with schedule, entry window, rules, eligibility, scoring, fixed prize pool, and settlement status; join; track personal progress and rank; view a useful “near you” leaderboard; see results and pending/reviewed/settled rewards.
9. **Missions & Rewards:** Browse learning, daily, practice, and community missions; see prerequisites, progress, reward type, cap and claim state; earn primarily TC, with occasional capped AC or explicitly budgeted PXY campaigns.
10. **Referrals & teams:** Create/copy/share a unique referral link, track verified activation rather than raw sign-ups, see milestones and team quests, understand eligibility before participating, and see pending/approved/rejected reward statuses with reasons.
11. **PXY Token:** Show clear pre-launch/not-listed status, explain PXY's role and distribution pathways, distinguish project-level plans from personal eligibility, and avoid implying that TC/AC are tokens or that any reward is guaranteed.
12. **Activity & history:** Provide a chronological, filterable ledger of trades, balance changes, AI usage, purchases, challenge entries, mission rewards, referral events, and adjustments with timestamps, status and reason.
13. **Profile & settings:** Manage verified account details, password/recovery, sessions/security, notifications, privacy/data preferences, connected wallet, support and account actions.
14. **Trust and support:** Provide clear notices, help/dispute routes, and accessible feedback for failed or reversed actions. Admin review tools and audit logs are backend requirements, not customer-facing dashboard clutter.

## 4. Screen-by-screen audit

### Entry and onboarding
- **Required:** Landing, create account, email verification, resend verification, login, forgotten password/reset, session-expired, and onboarding completion states.
- **Current gap:** The repository has entry/login/register presentation, but account flows are not connected. The final UX should be designed around the real secure flow, not a demo-entry workaround.
- **Design standard:** One primary CTA per step; concise explanation of simulated trading and balances; defer optional wallet connection.

### Overview
- **Required:** Clear balance hierarchy; next recommended action; check-in/streak; challenge summary; mission progress; referral entry; open positions; latest activity.
- **Current gap:** Several repeated “demo/session-only/not connected” notices expose implementation status; balance/market widgets currently use local illustrative values.
- **Design standard:** Finished-product layout; if data is unavailable, use a purposeful loading/empty/unavailable state rather than fake account metrics.

### Practice Trading
- **Design pass completed:** Added a review-before-entry step, an explicit simulated entry confirmation, open-position cards with entry/reference prices and unrealized simulated P&L, a close-position review dialog, and a closed-trade history with exit price, realized simulated P&L, and returned TC.
- **Balance behavior:** Opening reserves the chosen TC allocation. Closing returns the allocation adjusted by the simulated price-move result, with a non-negative return floor; the position is removed once and recorded in history. AI-managed positions remain visible in the same position list and are labelled as AI-assisted.
- **Important data boundary:** P&L is derived from the repository's existing static market snapshot. It will often remain unchanged until the displayed reference price changes; it is not a live quote or real-money return. No exchange execution or backend persistence was added.
- **Remaining validation:** Run a fresh production build and test desktop/tablet/mobile layouts and the open-review-close-history path before treating this pass as verified.
### AI Trading
- **Required:** User-defined guardrails, eligible market selection, AI plan/decision summary, operation-cost confirmation, start/pause/stop, live status, activity log, per-operation credit ledger, risk-limit events and service-error recovery.
- **Current gaps:** The frontend simulates AI selection locally; the displayed “session active” state is not a connected persistent automation service. The selected-market filtering bug was corrected in the first design pass (15 October 2026).
- **Design pass completed:** Replaced the small, cramped Market Opportunities preview inside AI strategy controls with a dedicated full-width Market Radar section, responsive market cards, All/Gainers/Decliners filters, relative-move visualisation, market-focus selection, and a direct path to review a selected asset in Practice Trading. The ranking is explicitly described as a comparison of the displayed market snapshot, not an AI prediction. The broader AI workflow still needs a full design review.
- **Design standard:** AI operates only within user-approved controls; never imply continuous monitoring or market analysis that is not actually running.
- **AI lifecycle design pass completed:** Replaced the single toggle with distinct Start, Pause, Resume, and Stop states. Starting/resuming/stopping a session does not consume AI Credits; pausing prevents trade confirmation; stopping ends the session without silently closing existing positions.
- **Per-action cost confirmation:** Each proposed AI-assisted trade is reviewed before execution. The review shows market, direction, reference entry, TC allocation, risk profile, remaining balances, and the approved 1.5 AC cost. AC is deducted only when the simulated position is successfully opened.
- **AI action ledger:** Session starts, pauses, resumes, stops, and confirmed AI-assisted position openings and closures are timestamped in shared in-session state. Trade events record market, direction, allocated TC, reference entry/exit where available, AC cost, realized simulated P&L on closure, and AC/TC balance deltas. The AI Trading screen and Activity Centre display these records; AI positions remain in the shared Practice Trading position list.
- **Accuracy boundary:** The current UI executes one confirmed simulated action per user request. It does not run a persistent autonomous strategy, stream live quotes, or call a connected AI service. Records are currently held in frontend memory and are not durable across a full page reload or backed by a server ledger.
- **Logic walkthrough completed:** Checked session start without a fee; a successful reviewed action deducting 1.5 AC and the selected TC allocation once; insufficient AC blocking an action; pause/resume/stop behavior; stop preserving open positions; simulated P&L and returned-TC arithmetic; and long/short P&L direction. These are focused logic checks, not an execution of the rendered app.
- **Validation still required:** A production build and browser-based desktop/tablet/mobile interaction test have not been run. GitHub returned no status checks for the latest commit, and the connected Cloudflare account currently lists no Pages projects, so there is no deployment build result to rely on.

### AI Credit Store
- **Required:** Preserve the seven approved packages exactly; display AI Credit quantity and PXY bonus separately; GRAM estimate and quote timestamp; wallet connect/disconnect; payment review; pending/confirmed/failed/refunded states.
- **Approved package schedule:** $5/70 AC/100 PXY; $10/140 AC/200 PXY; $25/350 AC/500 PXY; $50/700 AC/1,000 PXY; $100/1,400 AC/2,000 PXY; $250/3,500 AC/5,000 PXY; $500/7,000 AC/10,000 PXY. Prices are USD equivalents paid in GRAM.
- **Design decision:** Improve the store's hierarchy, responsiveness, GRAM payment journey, package comparison, and transaction states without changing any approved package value or bonus.
- **Implementation caution:** A displayed GRAM quote is an estimate until the actual supported payment quote and transaction are verified. Do not charge or issue balances based on client-side state.

### Community Challenges
- **Required:** Hub filters; detail view; countdown/schedule; rules and eligibility; fixed preannounced pool; participation progress; personal rank and nearby leaderboard; results; review/settlement states.
- **Current gap:** The hub currently offers a local “join/save” interaction and abbreviated expandable rules, not a full competition detail, participant progress or leaderboard journey.
- **Design decision:** Use the current agreed 24h/7d/14d formats and prize pools. Clearly separate a published pool from a user's estimated or settled reward.

### Missions & Rewards
- **Required:** Mission categories, prerequisites, completion evidence, progress, reward type, cap, claim/ledger status, streak and achievement history.
- **Current gap:** The current mission state is local and awards TC when clicked through the prototype; it does not establish verified completion.
- **Design standard:** Missions primarily award TC. AC rewards are small and capped; PXY is limited to explicit, budgeted campaigns. Achievements, streaks and Trader Rating are progression/recognition—not currencies.

### Referrals
- **Required:** Unique tracked link, copy/share, verified activation, milestone progress, team/cooperative missions, campaign rules, anti-abuse status and reward history.
- **Current gap:** The current share action shares the platform URL, not a user-specific tracked referral link.
- **Design standard:** Reward legitimate participation, not raw sign-ups or recruitment chains. Do not show fake referral counts.

### PXY Token
- **Required:** Pre-launch/not-listed state, token purpose, distribution pathways, approved supply/allocation, eligibility explanation and launch updates.
- **Confirmed allocation:** 60% community allocation (60,000,000 PXY): 30% initial airdrop (30,000,000 PXY), 20% ongoing community rewards (20,000,000 PXY), and 10% future community reserve (10,000,000 PXY). Keep this split consistent wherever tokenomics are shown.
- **Design standard:** No invented price, value, launch date, listing, guaranteed reward or personal airdrop amount.

### Activity and Profile
- **Required:** Durable filterable event history with statuses/reasons; real profile/security/notification/wallet controls; account recovery and support.
- **Current gap:** Activity is assembled from local session state, and profile rows are currently descriptive rather than actual settings.
- **Design standard:** Design each control and outcome, but do not claim a change was saved unless the service confirms it.

## 5. Global interaction and visual states

Every important action needs applicable versions of:
- Default / ready
- Loading / processing
- Disabled with a clear reason
- Confirmation before consequential actions
- Success with a next step
- Failure with a useful reason and retry/recovery path
- Pending verification/review/settlement
- Empty state with a relevant next action
- Stale/unavailable data state
- Permission/session/wallet disconnected state
- Reversal or invalidation with an explicit reason

Use concise operational messages rather than repeated global disclaimers. Keep the interface responsive at phone, tablet portrait/landscape and desktop sizes. Preserve clear focus/keyboard states, contrast, semantic labels and touch-sized controls.

## 6. Implementation and validation sequence

1. Preserve all already-approved product rules and economics; do not reopen them without an explicit user change.
2. Update this document only when a decision is explicitly changed or newly approved.
3. Refine entry/onboarding and shared navigation.
4. Refine Practice Trading and its complete trade lifecycle.
5. Refine AI Trading and the AI Credit Store, using only approved package terms.
6. Refine Challenges, Missions, Referrals, and PXY Token.
7. Complete Activity, Profile/Settings, and global states.
8. Validate responsive behavior and interaction consistency.
9. Only then implement backend-connected functionality against an approved functional specification.

## 7. Known repository mismatches to fix during the design pass

- The AI Store and README package schedule must match the approved seven-tier schedule exactly; improve presentation without changing values.
- PXY page must consistently show the approved 60% community allocation split (30% initial airdrop, 20% ongoing rewards, 10% future community reserve).
- Current Practice Trading closes positions without simulated P&L.
- Current market data is static and must have a clear illustrative/unavailable state until a verified feed is connected.
- AI Trading locally simulates AI behavior and must not imply an active connected AI service.
- First design pass completed 15 October 2026: added this product-experience audit, refined dashboard copy to remove session/demo notices, and corrected AI Trading's selected-market filter. The subsequent AI Center design pass adds a full-width responsive Market Radar and changes the misleading “Market to exclude” label to “Market focus.” These changes were committed directly to main; no production backend was added.
- Referral sharing currently shares a generic platform URL rather than a unique tracked referral.
- Mission and challenge completion currently depend on local state rather than verified completion.
- Activity history is local and incomplete.
- Profile/settings controls are descriptive placeholders rather than functional settings.

## 8. Build and rendered-flow verification gate — 15 October 2026

- Added a prominent Practice Trading bridge to AI Trading near the top of the Practice screen. It explains the value of AI-assisted practice and leads directly to the AI Trading Centre.
- Added GitHub Actions workflow `.github/workflows/verify-product-flow.yml`: install dependencies, run the production Vite build, then run Playwright Chromium browser tests.
- Added desktop and mobile Chromium test projects in `playwright.config.js` and rendered-flow tests in `tests/e2e/product-flow.spec.js`.
- Automated browser coverage is intended to check the Practice-to-AI route, over-balance manual order prevention, AI session start/pause/resume/stop, the 1.5 AC trade confirmation flow, position opening and closing, AI event ledger entries in Activity Centre, and mobile horizontal overflow. The stop test deliberately verifies that an already-open position remains available to close after the AI session is stopped.
- **Verification status: pending a genuine CI run.** The GitHub connector did not return any commit status checks at the last inspection, and no successful build/browser run has been observed. Do not describe the production bundle or rendered mobile flow as verified until the workflow reports a completed result and failures, if any, are fixed.
- Cloudflare account inspection found a deployed Worker script named `pexoriy-design`, no Cloudflare Pages projects, and no Workers Builds trigger associated with that script. The current script's settings report no bindings. This means a Cloudflare build pipeline and database bindings are not yet verified as configured. Do not create or migrate infrastructure as part of this UI verification step.
- Architecture direction recorded for the backend phase: keep GitHub as the source-control workflow and use Cloudflare as the default platform foundation. Evaluate D1 for relational application data, Workers for edge APIs, and other Cloudflare services only when justified by the approved requirements. Do not claim database persistence or server-side validation until real bindings, schema, API paths, authorization, and migrations are implemented and tested.
- This verification gate must be cleared before starting another product area: obtain a successful production build, inspect the actual rendered desktop/mobile flows, fix any failures, and re-run the suite.

### Rendered production verification — 15 October 2026

- Cloudflare Workers Builds has produced successful production build/deploy outcomes for the current product code, including commit `22e0a984bec1d478281e2f478dee88461eb254cf` and the later CI-only low-balance test-seam change `86eabcfd4df7cbe14171d5f2f4bee5de092fd17e`. Newer commits that adjust the test file are being rebuilt separately; verify the latest build record before treating the very latest commit as deployed.
- Opened the deployed Worker at `https://pexoriy-design.mails4dikewills.workers.dev` with Cloudflare Browser Rendering. The rendered Practice page contains the new `practice-ai-bridge` entry point and the Explore AI Trading button.
- Mobile viewport tested at 393 × 852: Practice rendered with document width 393 px and scroll width 393 px (no horizontal overflow). AI Centre rendered at the same viewport with document width 393 px and scroll width 393 px (no horizontal overflow).
- Rendered browser interactions passed: start session, pause, resume, prepare/review an AI trade with the 1.5 AC cost visible, confirm the simulated AI trade, stop the session, navigate to Practice, review and confirm position closure, then open Activity Centre. The Activity Centre contained all six expected records: AI session started, paused, resumed, AI-assisted position opened, AI-assisted position closed, and AI session stopped.
- Added a CI-only low-balance test mode guarded by `VITE_E2E_TESTS=true`; normal Cloudflare production builds do not set this variable, so the public build does not enable the test-only query override. The Playwright suite now tests the insufficient-AC path in that isolated CI build. Its automated test-run result has not yet been observed; do not mark that specific CI assertion as passed until the runner reports it.
- The Cloudflare account currently has **no D1 databases**. No database has been created or bound yet. That is deliberate for this gate: define the approved application schema and server-side balance/ledger rules before adding persistence, then configure D1 and Worker bindings together rather than attaching an empty database to the frontend.
