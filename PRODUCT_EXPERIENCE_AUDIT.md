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

### Decisions that must remain open until explicitly finalized
- Exact AI Credit package tiers beyond the confirmed minimum package.
- Current confirmed minimum package direction: $5 equivalent in GRAM for 70 AI Credits + 10 PXY bonus; the maximum package is capped at 500 AI Credits. Do not keep the older README's $10–$500 schedule or larger PXY bonuses as if approved.
- The community allocation percentage in PXY tokenomics needs reconciliation; do not present the repository's 60% figure as final until confirmed.
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
- **Required:** Asset search/category/watchlist, chart and timeframe controls, market status/freshness, trade ticket, risk/size preview, confirmation, open positions, close confirmation, realized/unrealized simulated P&L, history.
- **Current gaps:** Current implementation returns allocated TC on close and does not calculate P&L; static sample market prices are used; no explicit order summary or complete trade audit is visible.
- **Design standard:** Keep “Practice Mode” clear, but do not clutter every section with disclaimers. Pause affected markets when quotes are stale or unavailable.

### AI Trading
- **Required:** User-defined guardrails, eligible market selection, AI plan/decision summary, operation-cost confirmation, start/pause/stop, live status, activity log, per-operation credit ledger, risk-limit events and service-error recovery.
- **Current gaps:** The frontend simulates AI selection locally; the displayed “session active” state is not a connected persistent automation service. The selected-market filtering bug was corrected in the first design pass (15 October 2026), but the broader AI workflow still needs a full design review.
- **Design standard:** AI operates only within user-approved controls; never imply continuous monitoring or market analysis that is not actually running.

### AI Credit Store
- **Required:** Approved packages only; AI Credit amount and PXY bonus separated; GRAM estimate and quote timestamp; wallet connect/disconnect; payment review; pending/confirmed/failed/refunded states.
- **Current gap:** The current code/README contain an older package schedule (up to 7,000 AC and up to 10,000 PXY bonuses) that conflicts with the latest recorded direction of a $5 minimum package for 70 AC + 10 PXY and a maximum of 500 AC.
- **Design decision:** Remove unapproved tiers/bonuses from the design. Do not fabricate intermediate tiers to fill the grid. Use a compact confirmed package card and an intentional “more packages” area only after the tiers are approved.
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
- **Required:** Pre-launch/not-listed state, token purpose, distribution pathways, project-level supply/allocation only when approved, eligibility explanation and launch updates.
- **Current gap:** The current page exposes a 60% community allocation as a working plan; this must not be presented as final until the latest allocation decision is reconciled.
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

1. Reconcile product rules and mark unresolved economics as open.
2. Update this document whenever a decision is explicitly approved.
3. Refine entry/onboarding and shared navigation.
4. Refine Practice Trading and its complete trade lifecycle.
5. Refine AI Trading and the AI Credit Store, using only approved package terms.
6. Refine Challenges, Missions, Referrals, and PXY Token.
7. Complete Activity, Profile/Settings, and global states.
8. Validate responsive behavior and interaction consistency.
9. Only then implement backend-connected functionality against an approved functional specification.

## 7. Known repository mismatches to fix during the design pass

- README and AI Store contain an outdated purchase schedule and PXY bonus quantities.
- PXY page's community allocation needs reconciliation before being treated as final.
- Current Practice Trading closes positions without simulated P&L.
- Current market data is static and must have a clear illustrative/unavailable state until a verified feed is connected.
- AI Trading locally simulates AI behavior and must not imply an active connected AI service.
- First design pass completed 15 October 2026: added this product-experience audit, refined dashboard copy to remove session/demo notices, and corrected AI Trading's selected-market filter. These changes were committed directly to main; no production backend was added.
- Referral sharing currently shares a generic platform URL rather than a unique tracked referral.
- Mission and challenge completion currently depend on local state rather than verified completion.
- Activity history is local and incomplete.
- Profile/settings controls are descriptive placeholders rather than functional settings.
