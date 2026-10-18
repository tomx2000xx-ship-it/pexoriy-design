# Pexoriy Community Hub & Trade Success Card
## Product and implementation specification

**Status:** Product decisions approved; implementation specification in progress  
**Date:** 2026-10-18  
**Repository:** `tomx2000xx-ship-it/pexoriy-design`  
**Scope:** Community Hub, weekly community reward cycle, verifiable growth campaigns, community communications, and standardized Trade Success Card.

> This document defines intended behavior. It does not claim that proposed screens, tracking, rewards, communications, or tables already exist. Before implementation, reconcile every proposed requirement with the current Worker/API code, migration files, reward ledger, production configuration, and the Master Vision & Product Brief. No database migration, production-data change, reward issuance, or deployment is authorized by this specification alone.

## 1. Product principles and non-negotiable guardrails

1. Community growth should result in real onboarding, practice activity, and member retention—not raw registrations, spam, or recruitment chains.
2. The weekly cycle is seven days. The pool is funded from the **existing approved Pexoriy community reward budget**. Do not invent a second budget, increase the approved allocation, or assume the available balance until the current source of truth has been inspected.
3. Both community leaders and eligible members must benefit. Leaders earn for legitimate organizing and retention; members earn for their own qualifying activity.
4. TC, AI Credits, PXY, simulated P&L, and a community activity score are different concepts and must never be presented as interchangeable.
5. TC is not USDT, withdrawable money, or a currently exchangeable token. The Master Vision & Product Brief says verified TC history **may be one input** to a future PXY allocation formula. Do not promise a fixed conversion rate, token value, minimum allocation, or guaranteed airdrop amount.
6. AI Credits are a separate consumable allowance. Any earned AI Credits must respect the approved reward budget and the existing earned-credit rules/caps; purchased and earned credits must remain distinguishable.
7. Practice trades use real crypto market data but simulated execution. Never label simulated P&L as real exchange profit.
8. Reward grants must be server-authoritative, auditable, idempotent, budget-capped, and resistant to abuse.
9. No multi-level recruitment rewards, coercive invites, fake engagement, or rewards based only on raw clicks/sign-ups.
10. Mobile-first, premium Pexoriy UI. Keep the current React JSX/Vite architecture; do not migrate to TypeScript/Next.js or restructure folders without a separate reason and approval.

## 2. Approved product decisions

- **Community cycle:** 7 days, with a countdown to the exact cycle end/settlement deadline.
- **Funding:** existing approved community reward budget, after its actual configured balance, denomination, scope, and restrictions are verified.
- **Verification:** reward-bearing campaigns must have a credible verification path. If a task cannot be verified reliably enough, do not launch it as a paid task on that platform. Use automatic checks where reliable and human review for uncertain cases.
- **Effort-based rewards:** a more demanding task may receive a higher TC reward and, where relevant and budgeted, a limited AI Credit reward. Difficulty alone is insufficient; the task must produce useful, verifiable outcomes.
- **Communication:** in-app community feed plus group chat, with moderation, reporting, blocking, notification preferences, rate limits, and anti-spam controls.
- **Incentives:** member activity rewards plus leader milestone bonuses and an eligible share of the weekly community reward pool. The final formula and amounts must be approved before a cycle begins.
- **Standardized Trade Success Card:** one immutable template for all users. No template chooser and no user editing of verified trade values or card fields.
- **Manual practice mode:** Pexoriy suggests eligible profitable closed trades; the user chooses which trade to share.
- **AI-assisted mode:** Pexoriy automatically selects the user's best eligible completed trade according to a published, deterministic ranking rule. The user may review and share the recommendation; the user does not manually alter the underlying trade data.
- **Weekly community report:** generated from verified aggregate data; leaders can share it once per eligible cycle after reviewing it.
- **Specification before implementation:** first inspect existing APIs, ledger, migrations, budget configuration, and deployment bindings. Do not touch production D1 or issue rewards as part of documentation/specification work.

## 3. Information architecture

The existing Invite/Referrals experience should evolve into **Community Hub**, with these sections:

1. **Overview:** community identity, member count, qualified active members, first-practice activations, return activity, current cycle, community score, rank, pool status, next deadline.
2. **Members:** attributed member list and privacy-safe activity states; member-specific reminder action.
3. **Feed & Chat:** announcements, posts, group chat, event posts, reports, moderation tools.
4. **Weekly Pool:** actual approved pool amount/denomination, cycle start/end, countdown, score breakdown, leaderboard, eligibility rules, settlement status, previous cycles.
5. **Growth Campaigns:** available campaigns, instructions, evidence requirements, reward terms, submission state, review result, earned reward ledger reference.
6. **Weekly Report:** verified aggregate report and one standardized community-achievement image.
7. **Share a Trade:** eligible closed trades, automatic AI-mode recommendation, generated Trade Success Card, share/download fallback.

Do not expose fabricated sample metrics as live account data. Empty, loading, unavailable, ineligible, pending-review, rejected, paid, and error states are required.

## 4. Community creation, membership, and attribution

### Community identity
- A user can create or lead a community only under published eligibility and anti-abuse rules.
- Each community has a stable ID, public name/slug, creator/leader, creation timestamp, status, and invitation URL/code.
- The invitation link attributes a new account to the relevant community using server-validated attribution. Client-side query parameters alone are not proof of activation.
- A referral should count once, for one qualifying community, under an announced attribution policy. No multi-level referral tree.
- Existing users joining or switching communities must follow a clear policy. Recommended initial rule: one active community attribution at a time; no retroactive re-attribution to claim rewards. Switching policy must be confirmed before launch.
- A user cannot qualify as their own referral or repeatedly generate rewards through duplicate accounts.
- A community can be paused, restricted, or closed for abuse; legitimate members' existing ledger history must not be silently rewritten.

### Privacy-safe member activity states
Expose only what the leader needs to help the member:
- Joined
- Onboarding incomplete
- First practice trade completed
- Active this cycle
- Needs a reminder (based on a configurable inactivity threshold)
- Reward eligibility pending/review (only if appropriate to disclose)

Do not expose balances, private trade history, individual positions, detailed P&L, email, wallet details, or private account data to community leaders. A leader can see a milestone such as “first practice trade completed,” not the member's private trade details.

## 5. Seven-day community cycle and reward pool

### Cycle lifecycle
1. **Scheduled/open:** cycle boundaries and rules are visible before the cycle starts.
2. **Active:** verified qualifying events accrue activity points; show a countdown to the published deadline.
3. **Closing:** at the deadline, stop accepting events for that cycle according to the announced cutoff.
4. **Review:** deduplicate events, run anti-abuse checks, and hold suspicious claims.
5. **Settling:** calculate eligible allocations using the frozen rules and approved budget.
6. **Distributed:** post ledger transactions idempotently and show the completed settlement summary.
7. **Reconciliation/paused:** if the ledger, budget, or settlement fails, show a clear pending state; never claim payment before a posted ledger transaction is verified.

Use a single authoritative timezone/UTC timestamps for storage. Display the deadline in the user's local timezone while retaining an unambiguous date/time. The countdown must be calculated from server cycle boundaries, not reset independently on each client.

### Separate score from pool
- **Community Activity Score** is a non-cash metric used for ranking/eligibility.
- **Reward pool** is the real approved TC and/or other explicitly authorized reward allocation.
- **Simulated trading profit** is neither the score nor the funding source.
- Display the pool denomination clearly. Never label TC as USDT or cash.
- Show exact funding amount only after reading the authoritative budget configuration and reservation/ledger state.
- Reserve or allocate budget before publishing a cycle. Do not publish a pool larger than available approved funds.
- Final scoring weights, leader/member split, minimum eligibility, per-user/community caps, tie-breaking, and rollover/forfeiture policy remain explicit approval gates. Do not guess these in code.

### Recommended scoring principles (weights not yet approved)
Use a balanced, capped score based on verified outcomes:
- new attributed member completes onboarding and first eligible practice trade;
- existing member returns on a later day and completes eligible practice activity;
- sustained eligible activity across multiple days;
- verified learning-to-practice milestone;
- verified onboarding event participation;
- moderation/quality adjustments for confirmed abuse.

Do not rank by raw number of trades, wins, referrals, clicks, or simulated profit alone. Count only completed, valid events; impose per-user and per-event caps; use risk/quality controls to prevent tiny/repeated trades from dominating. Publish scoring rules before the cycle begins and freeze them for that cycle.

### Reward allocation
Recommended structure:
- **Member activity rewards:** earned by the individual for their own qualifying actions.
- **Leader milestone bonuses:** one-time or cycle-limited bonuses for verified activation/retention milestones.
- **Community pool distribution:** allocated to eligible communities using the approved score and published formula, with both members and leader benefiting.
- **Campaign rewards:** granted only for a verified campaign outcome, with explicit per-user/per-cycle limits.

The system must not double-pay the same qualifying event across a mission, referral reward, campaign, and pool unless the published reward policy explicitly allows stacking. Use unique event IDs and reward idempotency keys.

### Required audit fields
Every reward/balance event must record a unique ID/idempotency key, user, community/cycle if applicable, currency, amount, source event, reason, rule/version, status, timestamps, and any reversal/adjustment reference. Never mutate a posted ledger entry to hide a correction; use an auditable reversal/adjustment.

## 6. Community communications and reactivation

### Feed and group chat
- Community feed supports pinned leader announcements, goals, weekly results, events, and member posts.
- Group chat supports basic text messages and appropriate reactions; attachments can be a later phase unless an existing safe implementation is available.
- Add report, block/mute, leader moderation, spam controls, message rate limits, and clear community rules.
- Restrict sensitive personal data and financial claims; prevent unsolicited bulk messages and deceptive trading-profit claims.
- Define moderation permissions, audit records, and escalation flow before public launch.

### Reminders
- Members can opt into/disable community reminders.
- Leaders can send an individual reminder or a limited group reminder to members whose status qualifies as inactive.
- Use configurable cooldowns and daily/weekly rate caps. No repeated pings, harassment, or leader access to private contact details.
- A reminder links directly to an appropriate in-app next step (resume onboarding, Practice Trading, learning milestone, or community event).
- Track send, delivery where supported, open/click where privacy policy permits, and subsequent qualifying activity. A reminder itself is not a reward event.
- In-app reminders are the initial reliable method. External push/email/Telegram integrations require a separate permission and architecture check.

## 7. Growth campaigns and verification policy

Every reward-bearing campaign must define: purpose, audience, steps, evidence, automatic checks, manual-review fallback, reward currency/amount, cap, repeat window, disqualification reasons, appeal route, and tracking events.

### A. Build Your Community
**Goal:** grow a group whose members become active and return to Practice Mode.

Verification:
- unique server-attributed referral/community link;
- verified account registration;
- qualifying onboarding/first completed practice trade;
- return activity in the cycle;
- deduplication and suspicious-account review.

Reward:
- milestone rewards for activated/retained members;
- leader bonus and community pool eligibility;
- members still receive their own eligible task rewards.
Raw clicks or registrations alone do not trigger the activation reward.

### B. Publish a 30-second product demo
Verification:
- user submits a public post URL and platform;
- verify URL format and public accessibility where possible;
- check campaign-specific tracking link for attributable visits/activations;
- automated checks where supported, otherwise trained moderation review;
- a screenshot may support review but must not automatically guarantee a reward.

Do not promise verification of private/disappearing stories without a reliable method. Do not launch reward-bearing placements on platforms where proof cannot be assessed to an acceptable standard.

### C. Share a learning-to-practice story
Generate a truthful story draft from completed Pexoriy milestones; do not fabricate achievements or claim real trading profit. Verify a submitted public post URL where possible and review uncertain cases. Limit to one approved reward per user per cycle unless a different cap is explicitly approved.

### D. Host a community onboarding hour
Prefer an in-app scheduled event:
- leader creates event with time and agenda;
- attendees join/check in through authenticated accounts;
- qualifying onboarding milestones are measured server-side;
- reward eligibility requires minimum verified attendance/participation and a host-quality check;
- prevent the host from counting duplicate or self-created accounts.

The event is not rewarded merely because it was scheduled or claimed to have happened.

### E. Share weekly community progress
- generate a report from the closed/settled cycle;
- show only aggregate, privacy-safe figures;
- user submits public post URL if external publication is required;
- one eligible submission per community per cycle;
- campaign reward is separate from the underlying community pool distribution, unless stacking rules say otherwise.

### Verification policy
If platform access/API support is unavailable, use review only if the evidence is credible and staff can process it. If neither automated verification nor credible manual review is possible, disable that campaign as a paid task. Do not substitute unverified claims for evidence.

## 8. Standardized Trade Success Card

### One immutable template
Every user gets the same template, dimensions/layout, Pexoriy logo, typography, colors, disclosure placement, and invitation footer. No template picker and no user edits to the card fields or verified trade figures.

Required fields:
- Pexoriy branding;
- verified username/display name;
- market symbol and trade direction;
- realized simulated TC P&L and return percentage (if the calculation is valid and the displayed units are clear);
- clear “Simulated practice trade — not real exchange profit” disclosure;
- referral URL/QR code and consistent invitation CTA.

Never show unrealized P&L as a realized win. Do not display balances as USDT. Never generate a success card for an open trade, a failed/invalid result, or a trade whose result is still being reconciled.

### Manual mode
- On a qualifying profitable closed trade, show a non-blocking “Share your trade” prompt.
- The prompt may recommend the newly closed trade and list other eligible profitable closed trades from history.
- The user chooses which trade to share.
- Once selected, the server-verified trade fields populate the fixed template.
- Dismissal does not remove the trade from the reusable Share a Trade area/history.

### AI-assisted mode
- Pexoriy selects the best eligible completed trade according to a deterministic, documented ranking rule.
- Do not use an opaque model-only judgement for financial figures.
- Proposed ranking candidate: rank eligible profitable closed trades by percentage return only after enforcing minimum meaningful size/validity rules; apply deterministic tie-breakers such as absolute realized TC P&L, then close timestamp. This ranking rule is a proposal and must be validated against manipulation risks before coding.
- Suppress outliers and suspicious trades from recommendation until reviewed.
- Show the recommended trade and fixed card. The user may approve sharing or dismiss it; they cannot edit the underlying result.

### Share flow
1. Render card from trusted trade-history data.
2. Show a preview and generated caption with referral URL.
3. Use the device's native share sheet when available.
4. Provide “Download image” and “Copy caption/link” fallbacks.
5. Never promise direct story publishing to every social platform; platform capabilities vary by OS/app.
6. Keep a Share a Trade entry point in Practice Trading/Trade History so the opportunity remains available later.
7. Track card generation and share-sheet invocation as events, not proof that a post was successfully published. External publication only counts toward campaign rewards when independently verified.

### Privacy and accuracy
- No other users' private trade information.
- Do not expose internal user IDs or private referral attribution metadata on public cards.
- Referral URL must be the authenticated user's legitimate referral URL, not a client-supplied arbitrary URL.
- Freeze card values from the authoritative closed-trade record. Client payload must only identify the trade; server validates ownership and eligibility.
- If the user has no eligible winning trade, show an empty state and offer a truthful learning/consistency achievement card only if that separate card type is approved. Do not fake a win.

## 9. Proposed event taxonomy

Names are suggestions pending alignment with existing event/audit conventions:
- `community.created`
- `community.member_joined`
- `community.attribution_verified`
- `community.member_activated`
- `community.member_returned`
- `community.reminder_sent`
- `community.event_created`
- `community.event_attendance_verified`
- `community.cycle_opened`
- `community.cycle_closed`
- `community.score_calculated`
- `community.reward_reserved`
- `community.reward_settlement_started`
- `community.reward_distributed`
- `community.reward_settlement_failed`
- `campaign.submitted`
- `campaign.evidence_verified`
- `campaign.review_required`
- `campaign.approved`
- `campaign.rejected`
- `campaign.reward_issued`
- `trade_card.eligible_trade_detected`
- `trade_card.generated`
- `trade_card.share_invoked`
- `trade_card.downloaded`

Each event should include timestamp, authenticated actor/user, relevant community/cycle/trade/campaign ID, unique event/idempotency key, schema/rule version, and a minimal privacy-safe metadata payload. Do not use client-generated events as sole proof for balance-changing rewards.

## 10. Initial code inventory (read-only inspection, 2026-10-18)

The current `worker/index.js` was inspected through GitHub on `main` (blob SHA `f95e299440945968bfb2433174fa88579321452e`). This is a source-code inventory only; it is not proof that every production schema or deployment matches the repository.

### Relevant routes already present
- `GET /api/referrals`
- `POST /api/referrals/quests/claim`
- `POST /api/referrals/activate`
- `GET /api/missions`
- `POST /api/missions/claim`
- `GET /api/ledger`
- `GET /api/trading/history`
- `GET /api/trading/positions`
- `POST /api/trading/positions`
- `POST /api/trading/positions/close`
- Existing learning and daily check-in endpoints.

### Relevant storage names referenced by Worker source
The Worker references existing structures including `users`, `referral_codes`, `referral_attributions`, `referral_team_quests`, `referral_team_quest_claims`, `mission_definitions`, `mission_claims`, `trading_positions`, `trade_orders`, `ledger_accounts`, `ledger_postings`, `ledger_transactions`, `audit_events`, and `competition_entries`, among others.

### Initial gap assessment
- The inspected route list does **not** show dedicated community creation/membership, community feed/chat, community cycle/pool, campaign evidence/review, reminder-management, or trade-card endpoints.
- Existing referral, mission, trade history, ledger, and audit services should be evaluated for reuse; do not create duplicate versions before reading their full implementation and current schema.
- The UI currently maps trade history into frontend state; a trade card must request or derive data from the authoritative server-side closed-trade record, never from a client-supplied P&L.
- The presence of a table name in Worker source does not establish all constraints, indexes, migration history, production row state, or production binding. Those remain to be checked in the separate authorized schema-review phase.
- No D1 query or mutation was run for this specification. No schema change or reward issuance was performed.

## 10. Candidate data model (not an approved migration)

Inspect current schema and reuse existing tables/services before proposing new ones. Candidate logical entities, only if no equivalent already exists:

- communities and community membership/leadership;
- referral/community attribution;
- community cycles and versioned cycle rules;
- community activity events and aggregated cycle scores;
- reward budget reservations and settlement records;
- campaign definitions, submissions, evidence, reviews and outcomes;
- community posts, messages, moderation reports, blocks and notification preferences;
- community events and attendance;
- share-card generation/audit events.

Do not duplicate existing users, referral, mission, trade history, ledger, audit, or notification records. Use foreign keys/constraints where supported, unique idempotency keys, indexed user/community/cycle/time lookups, explicit status enums/check constraints, and transactional/atomic reward posting consistent with the existing ledger architecture.

Before any migration:
1. Inventory current migration files and live schema using the approved low-cost method.
2. Identify existing ledger, audit, referrals, missions, users, trading history, notification, and budget structures.
3. Map each requirement to existing tables/API or a proven gap.
4. Write forward migration and rollback/forward-recovery plan.
5. Test against a non-production database and run idempotency, race, budget-cap, and abuse tests.
6. Confirm production binding and backup/recovery plan before production execution.
7. Obtain explicit authorization for schema/data changes and deployment.

## 11. API/architecture requirements

Current Worker/API routes and storage behavior must be inspected before adding endpoints. Reuse established authentication, request validation, audit logging, ledger posting, rate limiting, and idempotency helpers.

Potential endpoint families (illustrative; not yet implemented or final):
- `/api/communities` — create/list/join/leave under policy;
- `/api/communities/:id/members` — privacy-safe membership/activity view;
- `/api/communities/:id/feed` and `/chat` — feed/chat with moderation;
- `/api/communities/:id/cycles/current` and `/history` — cycle, score, pool and settlement state;
- `/api/communities/:id/reminders` — rate-limited member reminders;
- `/api/campaigns` and `/api/campaigns/:id/submissions` — tasks/evidence/review status;
- `/api/trade-cards/eligible`, `/api/trade-cards/:tradeId` — server-validated eligible trades and card data;
- `/api/trade-cards/:tradeId/share-event` — telemetry only, never proof of external publication.

Every route needs authentication/authorization, ownership checks, schema validation, request size limits, abuse/rate controls, stable error responses, structured audit events where sensitive/reward-impacting, and tests. Never trust client-supplied reward amounts, pool balances, trade P&L, community score, attribution, or approval status.

## 12. Required UI states and accessibility

For every feature include:
- loading and skeleton state;
- first-use/empty state;
- normal active state;
- no eligible activity / ineligible state;
- pending verification/review;
- successful settlement or reward posting only after confirmed ledger status;
- failed/retryable state with no false success;
- paused/restricted state;
- responsive mobile and desktop behavior;
- keyboard navigation, visible focus, meaningful labels, adequate contrast, reduced-motion support, and screen-reader status announcements.

Do not present sample numbers as live values. Any mockups must be labeled illustrative in design documents only, not in a way that leaks into production UI.

## 13. Acceptance tests and release gates

### Rewards and pool
- Same event/cycle cannot be credited twice, including concurrent retries.
- Total settlement never exceeds reserved approved budget.
- Failed ledger post leaves cycle pending/reconciling; UI never claims success.
- Rule version and cycle boundary remain stable after cycle opens.
- Closing the cycle excludes late events according to the published cutoff.
- Suspicious or duplicate accounts are held/rejected by defined policy.
- Members and leaders receive only their approved shares.
- TC/AI Credit ledgers remain separate; no silent PXY issuance.
- User-facing text never states that TC is USDT, cash, or guaranteed token conversion.

### Referral and campaigns
- Raw clicks and sign-ups do not trigger activation rewards.
- Referral attribution is server-validated and resistant to self-referral/replay.
- Each campaign's repeat/cap policy is enforced server-side.
- Invalid, inaccessible, duplicate, or suspicious evidence cannot auto-pay.
- Manual review decision and reason are auditable.
- A task without reliable verification cannot be enabled as a paid task.

### Community communication
- Members can mute/disable reminders and report/block abusive users.
- Leader cannot view private balances or trade history.
- Rate limits prevent reminder/message spam.
- Access checks prevent reading or posting to communities the user does not belong to, except explicitly public content.

### Trade card
- Card can only be generated from a closed, verified trade owned by the requester.
- Manual mode lets the user choose among eligible profitable closed trades.
- AI mode deterministically selects a best eligible trade and safely handles ties/no eligible trades.
- Card values are server-derived and cannot be edited by client payload.
- One fixed template is used across users and devices.
- Card includes simulated-trading disclosure and valid referral link.
- Share/download failure does not mutate trading history or rewards.
- No event claims an external social post was published merely because the share sheet opened.

### Release
- Unit tests and relevant integration tests pass.
- Production Worker build/deployment is verified against the intended commit.
- Production D1 binding is verified before any database operation.
- No migration or new reward issuance is deployed until schema, budget, and anti-abuse gates pass.
- Perform real-device Android responsive QA before declaring UI work complete.

## 14. Open approval gates

Do not silently decide the following during implementation:
1. Actual available community budget, currency denomination, and budget reservation source.
2. Whether weekly pool pays TC only or includes any separately approved reward currency.
3. Score weights, leader/member split, eligibility thresholds, per-user/community caps, ties, and unclaimed reward policy.
4. Exact TC and AI Credit values for each campaign and any interaction with existing mission rewards.
5. Attribution and community-switch policy.
6. Inactivity threshold, reminder cooldowns, and moderation/retention policy.
7. Social platforms where publication can be reliably verified and staff capacity for manual review.
8. AI best-trade ranking thresholds and tie-breakers.
9. Whether a separate non-profit learning/consistency share-card is approved for users with no profitable closed trade.
10. Exact migration/API design after current schema and route inventory is complete.

## 15. Implementation sequence after specification and schema review

1. Read-only audit of current API routes, migrations/schema, ledger/reward services, referral/missions logic, deployment binding, and configured community budget.
2. Produce a mapping: requirement → existing code/table/endpoint → gap → proposed minimal change.
3. Finalize open reward/verification decisions and test cases.
4. Build server-side data and authorization in small, testable units; no reward UI may pretend an endpoint exists.
5. Implement community overview, member statuses, weekly pool, campaign verification states, and share-card UI against real APIs.
6. Add in-app feed/chat and moderation with security/rate controls.
7. Test ledger idempotency, settlement caps, referral abuse, privacy boundaries, and trade-card integrity.
8. Deploy directly through the established GitHub/Cloudflare workflow only after checks; verify live version and perform Android QA.

**Specification baseline:** This document itself is a product/implementation specification; it does not change database schema/data, reward budget, reward balances, or deployment.

**2026-10-18 UI-only implementation checkpoint (GitHub main):**
- Invite & Grow now exposes dedicated Clans, Tasks & Quests, Community Feed, Group Chats, Growth Campaigns, Weekly Report, and Community Success Card sections.
- Added clan create/join draft forms and an explanation of the intended seven-day team cycle, shared-benefit principle, and pending reward-rule approvals.
- Restored the existing Build Your Squad (3 verified activations / 300 TC) and Grow the Arena (5 verified activations / 600 TC) concepts in a dedicated task view, plus the cooperative learning/practice and consistency quests.
- Reworked the weekly report into verified-activity, retention, practice, and confirmed-ledger-settlement sections; added a distinct community success-card preview with no fabricated metrics.
- Added responsive styles for the new views.
- The forms/cards are UI scaffolding only where server endpoints do not yet exist. Clan creation/joining, community aggregate reporting, community success-card generation/sharing, and persistent community feed/chat remain inactive until backend work is completed.
- No D1 queries, schema changes, migrations, reward issuance, or ledger mutations were performed as part of this UI work. Database/schema reconciliation and migration remain deferred to the next planned session.
- The changes were committed directly to `main`; a production build and live deployment of these exact commits have **not yet been verified**. Do not call the UI work production-verified until the build and deployment are checked.

The open approval gates in Section 14 remain open; this UI work does not silently finalize pool currency, budget, scoring, leader/member split, eligibility caps, or unverified campaign rewards.
