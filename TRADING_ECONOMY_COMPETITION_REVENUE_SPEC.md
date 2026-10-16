# Pexoriy — Trading Economy, Competition Integrity & Revenue Verification Baseline

**Status:** Functional specification baseline for review and test planning  
**Prepared:** 16 October 2026  
**Scope:** Research-to-implementation handoff. This document does not claim that trading functionality, financial reconciliation, provider access, or revenue has been tested in production.

## 1. Binding product boundaries

- Pexoriy is a simulated crypto-trading and community competition platform. Market data may be real; user orders are never routed to an exchange in this scope.
- TC (Trade Credits) are practice-trading units, not money, USDT, a redeemable asset, or a promise of a token allocation.
- AI Credits pay for clearly disclosed AI operations. They do not fund trade collateral and are tracked separately from free-earned credits.
- PXY is the planned project token. Until a genuine launch and distribution, show a pre-launch/not-listed state. Never invent a price, guarantee value/listing/liquidity, or present an unfinalized airdrop formula as fixed.
- Manual and AI-assisted participants share one leaderboard and the same execution, position, fee, risk, eligibility, and anti-abuse rules. AI Credits purchase AI capability, not a more permissive risk tier.
- The product remains crypto-only; no forex and no real-money exchange execution.

## 2. Simulated trade lifecycle and accounting

Every order must follow one server-authoritative path:

1. Validate account status, supported asset, market freshness, order type, price/size precision, exposure limits, available collateral, and virtual-reserve risk budget.
2. Capture the quote/feed timestamp and execution-model version used.
3. Apply the documented spread, slippage, and fee model to each actual simulated fill exactly once.
4. Reserve or release collateral atomically and create immutable ledger entries with unique operation IDs.
5. Revalue open positions using the selected mark-price methodology; calculate unrealized P&L without posting it as realized balance.
6. On close, settle realized P&L, fees, collateral release, and reserve movement in one idempotent transaction.
7. Record the full event trail, including rejected orders and the reason for rejection.

Use fixed-precision decimal arithmetic for authoritative balances. Client-side balances and P&L are display-only and never authoritative.

Definitions:
- B = wallet balance after posted realized P&L and fees.
- U = net unrealized P&L on open positions.
- M = collateral reserved for open positions.
- Trading Equity = B + U.
- Available Equity = B + U - M.

Collateral reservation restricts availability; it is not a second debit. Every ledger event must have an event type, amount, asset/unit, timestamp, unique operation ID, related trade/order ID where relevant, and reason/source.

## 3. Execution and risk baseline

These are conservative starting parameters for simulation and must be versioned/configurable, not presented as universal exchange rules.

### Leverage ceilings
- BTC/ETH: maximum 10×.
- Other approved large-cap assets: maximum 5×.
- Approved high-volatility or thinner-liquidity assets: maximum 3×.
- Users may select lower leverage. The system must reject unsupported assets and positions exceeding per-position, per-account, or reserve-risk limits.
- Exact notional ceilings must be calculated from the initial TC allocation and reserve budget before production enablement; do not guess an absolute amount.

### Fees and slippage
- Simulated maker fee: 0.02% of filled notional, only when the order genuinely qualifies as maker.
- Simulated taker fee: 0.05% of filled notional.
- Initial slippage assumptions per fill: 0.02% for major/high-liquidity assets, 0.05% for approved large-cap assets, 0.10% for high-volatility/thinner-liquidity assets.
- Increase modeled slippage with order size relative to available depth. If reliable depth is unavailable, use a conservative documented fallback and label the model version.
- Apply buy/sell spread consistently (buy at simulated ask, sell at simulated bid). Do not claim a limit order filled merely because a candle briefly touched its price; use a conservative fill/queue model.
- These are simulation parameters, not claims about current exchange fees or executable real-world prices.

### Margin and liquidation
- Use isolated margin for the initial version.
- Start with a 1% maintenance-margin baseline tier and increase requirements for larger exposure tiers. The tier schedule must be published internally, versioned, and tested before production.
- Liquidation decisions use a validated mark price, not an unverified last trade. Include estimated close fees and slippage in the safety calculation.
- Do not add a separate liquidation penalty in the initial baseline.
- If a reliable mark price is unavailable, pause price-dependent actions rather than invent a price or trigger a liquidation from stale data.
- Do not simulate periodic funding or borrow interest in the first release. Disclose that the practice model omits these costs.

### Supported orders
Initial scope: market, limit, stop-loss, and take-profit. Defer trailing stops until the core lifecycle is tested.

## 4. Market-data safety

Use a primary public market-data feed and an independently sourced fallback only after confirming terms of use, symbol mapping, regional availability, and operational suitability. Candidate provider documentation to verify includes Binance public streams, Coinbase Advanced Trade WebSocket feeds, and Kraken market-data feeds. No provider is approved merely because its documentation exists.

Initial safety thresholds:
- Price update older than 3 seconds: block new market orders for the affected symbol.
- No valid update for 10 seconds: mark the symbol stale and pause new orders and price-dependent execution.
- Cross-feed disagreement above 1% for BTC/ETH or 2% for other supported assets: flag the symbol and pause new orders pending validation.
- Normalize symbol names and timestamps; compare only equivalent markets and quote currencies.
- Reconnect, rate-limit, clock-skew, missing-depth, and provider-outage paths must be tested.
- Stale data must never be used to manufacture a liquidation or competition result. Preserve existing positions and ledger state while unsafe price-dependent operations are suspended.

Thresholds are initial operational defaults; tune them using observed feed latency and price divergence before release.

## 5. Virtual reserve and solvency controls

The reserve is an internal simulation-risk ledger, not a real-money fund and not a claim that the platform holds users' practice balances as cash.

- A user's positive realized simulated P&L increases that user's TC balance and debits the virtual reserve by the same amount.
- A user's negative realized simulated P&L reduces that user's TC balance and credits the virtual reserve by the same amount.
- Simulated fees are posted to a separately identified internal fee account; they are not reported as real revenue.
- Reconcile each settlement atomically. Never create unlimited TC to pay winning simulated positions.
- Enforce a reserve risk budget, total open notional ceiling, per-account exposure ceiling, and per-position limit.
- If reserve headroom is low, reduce or pause new exposure; never silently confiscate earned balances or alter settled history.
- Reserve equation, before other explicit adjustments: R_close = R_open - net_user_realized_PnL, where positive net user P&L means users collectively won TC and the reserve is debited.
- Reconcile user TC liabilities, open-position exposure, pending settlements, and reserve accounting continuously and after restarts.

## 6. TC issuance policy

Let S be the approved standard initial TC allocation per eligible user. Every eligible user receives the same starting allocation, subject to the final eligibility rules.

Provisional calibration defaults for mission/community-earned TC:
- Per-user daily earned-TC cap: 5% of S.
- Rolling seven-day earned-TC cap: 20% of S.
- Routine mission reward: 0.25–0.5% of S.
- Meaningful mission reward: 1–2% of S.
- Major, infrequent mission reward: 2–5% of S, only when campaign budget and anti-abuse review support it.

These percentages are a baseline for simulation, not verified final issuance amounts. Before production, run them against expected active users, mission completion distributions, reserve headroom, and abuse scenarios. A platform-wide issuance budget must adapt to reserve health, outstanding TC balances, recent issuance, and projected commitments. A cap limits new community issuance only; it does not erase past rewards or restrict initial allocation, trading activity, simulated P&L, purchased AI Credits, or approved PXY awards.

Rewards do not expire merely because time passes. Pending rewards remain pending until claimed/settled under published rules. Invalidated rewards require an explicit status and reason; never silently rewrite history.

## 7. Competition integrity and scoring

Use one shared leaderboard for manual and AI-assisted traders. Use a single documented scoring formula, identical timestamps/cutoffs, supported markets, execution assumptions, and risk rules.

### Primary ranking
1. Rank by percentage return on starting competition equity, not raw TC profit, so starting balance differences do not distort ranking.
2. Calculate return from the competition's frozen starting equity and finalized realized plus mark-to-market P&L under the published cutoff policy.
3. Do not allow deposits, mission rewards, referrals, or external balance changes during an event to inflate performance. Competition accounting must isolate the event balance and record any permitted adjustments.
4. Publish the scoring formula, included fees/slippage, eligible assets, minimum activity requirements, cutoff time zone, open-position treatment, and dispute window before entries open.

### Tie-breakers
Apply in this order:
1. Lower maximum peak-to-trough equity drawdown.
2. Higher risk-adjusted return using the same fixed event methodology for all participants.
3. Higher realized return after modeled fees.
4. Earlier timestamp of reaching the final score, using server time.
5. If still tied, share the tied rank and split the relevant prize pool evenly unless the event rules explicitly announce a different lawful allocation before entry.

### End-of-event and eligibility
- Freeze new entries at the published end time.
- Mark all open positions using the validated cutoff mark price and apply the same conservative close/settlement policy to every participant. Never selectively grant favorable fills.
- If price data is invalid at cutoff, pause finalization, record the incident, and apply the published recovery policy; do not use a fabricated price.
- Require minimum eligible activity and risk-policy compliance, but do not require AI use or AI-credit purchases.
- Flag wash-like activity, exploit attempts, duplicate accounts, abnormal correlated behavior, scripted manipulation, and suspicious referral patterns for documented review.
- Keep provisional, under-review, finalized, and paid/awarded states distinct. Prize decisions need an immutable audit record.
- Announced PXY prize pools remain separate from TC balances and simulated P&L: 24-hour Sprint 5,000 PXY; 7-day Consistency League 12,000 PXY; 14-day Challenge 25,000 PXY. These are commitments only if the relevant campaign is actually approved and funded from its defined token allocation. Never imply a token is already claimable before the distribution conditions are met.

## 8. Revenue verification — what counts and what does not

Revenue verification must be based on completed, reconciled payment records, not package prices displayed in the UI, attempted transactions, simulated trading fees, TC balances, or estimated PXY value.

### Recognized AI Credit sales
Count a sale only when all are true:
- A unique order/payment ID exists.
- The correct wallet/payment network and asset were used.
- The transaction is confirmed to the required finality standard.
- The received GRAM amount is reconciled against the order and a documented conversion-rate source/time.
- The purchase is credited exactly once in the ledger.
- Refunds, reversals, duplicates, underpayments, overpayments, and suspicious transactions have explicit states and handling.

Do not recognize failed, pending, unconfirmed, duplicate, or reversed payments as settled sales. Keep gross receipts, refunds/reversals, network/wallet fees, AI inference costs, infrastructure costs, fraud losses, taxes, and net contribution separately visible.

### Revenue formulas
- Gross settled sales (USD-equivalent) = sum of confirmed eligible payment value at the documented transaction-time conversion rate.
- Net collected sales = gross settled sales - refunds - reversals - chargebacks (if applicable).
- Contribution before shared overhead = net collected sales - payment/network fees - attributable AI inference costs - variable provider costs - fraud losses.
- Operating contribution = contribution before shared overhead - allocated infrastructure/monitoring/support costs - applicable taxes and compliance costs.
- Track realized GRAM units and the USD-equivalent valuation separately. State the price source, timestamp, and conversion method. If a reliable conversion source is unavailable, report GRAM units only; do not invent a USD value.
- Report token bonuses as token-denominated promotional liabilities/allocations, not cash revenue. Do not assign PXY a speculative market price or count it as a cash expense/income without a defensible, approved accounting basis.
- TC movement and simulated trading outcomes are not revenue, cash, or user profit.

### Unit economics and package gate
For each AI Credit package, verify:
- Actual confirmed payment amount and net collected amount.
- AI Credits purchased and any promotional bonus separately.
- Expected and observed AI operations per credit, including failed-operation refunds.
- Average and p95 inference cost per operation.
- Network/payment cost, fraud/refund allowance, and allocated service cost.
- Gross margin and contribution margin using realized costs, not optimistic assumptions.
- Whether purchase bonus issuance is within the approved PXY allocation and campaign budget.

Do not publish a package as profitable until its observed unit economics support that claim. Package prices and bonus ratios remain commercial settings that require explicit approval and token-allocation checks before they are enabled. A UI price or a spreadsheet estimate alone is not revenue verification.

## 9. AI operation and credit integrity

- Display the exact AI Credit cost and what the operation will do before the user confirms.
- Reserve the necessary credits atomically before an operation begins; settle once on success according to the disclosed policy.
- Define and implement explicit behavior for timeouts, provider errors, cancelled requests, retries, and partially completed operations. Do not double-charge retries; refund/rescind reservations when an operation was not delivered under the published policy.
- Keep purchased and free-earned AI Credits separately auditable, without implying that either has cash value.
- AI proposals must pass the same server-side order, leverage, asset, collateral, exposure, and stale-data checks as manual orders. AI Credits never bypass trade limits.
- Exhausting AI Credits stops new AI operations; it does not forcibly close already-open simulated positions.

## 10. Mandatory acceptance tests

Release is blocked until automated tests demonstrate:
- Concurrent orders cannot reserve the same collateral twice or exceed a risk cap.
- Duplicate payment callbacks, order submissions, closes, and reward claims settle at most once.
- Every ledger entry balances with its corresponding user/reserve/fee-account movement.
- A duplicate or retried AI request cannot double-charge credits or create duplicate orders.
- Stale or conflicting market data blocks unsafe operations and does not trigger a fabricated liquidation.
- Mark-price liquidation is deterministic for a given input snapshot and model version.
- Oversized manual and AI orders are rejected consistently.
- A crash during settlement recovers without losing or duplicating ledger movements.
- Competition cutoff, open-position settlement, tie-breaks, and dispute handling produce repeatable results.
- Payment underpayment, overpayment, pending status, failed confirmation, reversal, refund, and duplicate callback scenarios are reconciled correctly.
- Revenue reports reconcile to the payment ledger and costs ledger; displayed revenue excludes simulated activity and unconfirmed payments.
- Mission caps, platform issuance budget, and reserve headroom work under load and abuse simulations.

## 11. Verification register and release gates

| Item | Status | Evidence required to close |
|---|---|---|
| Trading fee/slippage model | Baseline defined; not empirically validated | Backtests across asset volatility, order size, and spread conditions |
| Leverage/margin/liquidation | Baseline defined; tier schedule still needs calibration | Deterministic unit tests and stress tests across price gaps |
| Market-data provider | Not approved | Confirmed terms, symbol coverage, latency, regional access, failover tests |
| Starting TC allocation S | Not recorded in this specification | Recover the latest approved value from the master brief/decision record |
| Absolute per-position/account limits | Blocked on S and reserve budget | Exposure simulation and reserve stress test |
| TC mission caps | Provisional percentages | Issuance distribution simulation and abuse testing |
| Competition score/cutoff rules | Baseline defined | Reproducible event simulations and published rules review |
| AI package unit economics | Not verified | Confirmed package configuration, actual payment records, inference costs, network fees |
| Revenue reconciliation | Not verified | End-to-end test payments and ledger-to-report reconciliation |
| PXY bonus affordability | Not verified | Approved token allocation, campaign reserve, and cumulative commitment reconciliation |
| Production readiness | Not approved by this document | All mandatory acceptance tests pass; security, legal, and operations reviews complete |

## 12. Final operating decision

Adopt this specification as the working baseline for implementation and testing. Do not keep reopening settled principles. The remaining items in the verification register are evidence gates, not open-ended product debates. Where a gate fails, disable the affected capability or limit exposure until it passes; never bypass the control to meet a launch date.

The system must not claim live revenue, verified profitability, provider readiness, or production integrity until the relevant evidence is collected and independently reconciled.
