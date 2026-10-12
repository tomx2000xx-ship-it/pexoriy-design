# Pexoriy Product & Design Direction

## Brand
Pexoriy is energetic, community-driven, premium, intelligent, and approachable. PXY is the project's actual token ticker. The token is distinct from TC and AC.

## Visual system
- Primary accent: acid lime `#B7F34A`
- Background: deep charcoal `#10120F`
- Surface: `#171A15`
- Elevated surface: `#20231D`
- Muted text: `#92978A`
- AI accent: lavender `#B9A3FF`
- Negative state: `#FF8585`

## Product economy
- **TC (Trade Credits):** used to open simulated practice positions. Do not imply automatic TC-to-PXY conversion. PXY earning is primarily challenge-led, with occasional manually configured campaign rewards and eligible AI Credit purchase campaigns.
- **AC (AI Credits):** used to run AI workspace actions, including automated simulated trading once the connected AI service is enabled.
- **PXY:** the Pexoriy project token, not a points balance. Community challenges are the primary distribution path; selected campaigns may also include token allocations. Missions primarily award TC. Do not invent token supply, conversion ratios, prices, or guarantees.
- Never imply TC, AC, or simulated P&L are cash. Do not promise token value, exchange listings, guaranteed returns, or a fixed conversion rate.

## Finished-product UX standard
- Design every screen as a shipped product interface, never as a designer's presentation or an explanation of the design.
- Let hierarchy, familiar controls, clear labels, and meaningful defaults teach the experience. Remove step-by-step narration, repetitive helper paragraphs, internal commentary, and redundant disclaimers.
- Keep only concise operational status where users need it (for example, unavailable data, a pending action, or a reward rule). Do not expose internal build notes such as "sample", "demo", "not connected", or "prototype" as routine page copy.
- Never fabricate social proof, live market values, account status, reward totals, or launch terms. If product data is unavailable, use a polished empty/connection state rather than invented metrics.
- Each page should feel complete: deliberate visual hierarchy, aligned content, clear primary actions, consistent component behavior, responsive layouts, and no orphaned or empty labels.
- Prefer intuitive, action-oriented language. A user should understand what a control does from its placement and label without being told why the control exists.

## Product experience principles
- Build activity workspaces, not tutorial/placeholder pages. A primary action must open a real interaction or clearly state what backend is missing.
- Community Challenges are a core destination and should have prominent placement on the dashboard and mobile navigation.
- Mobile-first responsive layout with persistent bottom navigation for key destinations.
- Practice Trading must put an obvious asset selector before the trade ticket, use familiar Buy/Long and Sell/Short labels, show TC allocation clearly, and support simulated open/closed positions.
- AI Trading should prioritize automated simulated trading: users choose guardrails, AI selects an opportunity and allocation from available TC, opens/monitors practice positions, and can be paused by the user. Continuous execution requires connected AI and live market services.
- Missions must be actionable and primarily award TC. PXY rewards are scarce and should only appear for manually configured special campaigns. The homepage must make the daily streak/check-in and referrals immediately visible. Referrals should center on verified activation, meaningful participation, milestone progress, cooperative quests, and shareable achievements—not raw sign-ups or recruitment chains.
- Preserve simple, classic, polished styling; avoid generic exchange templates, excessive gradients, clutter, and childish gamification.

## Screen roadmap
Overview, Practice Trading terminal, AI Trading Centre, Community Challenge hub/detail/leaderboard, Missions & Rewards, PXY Token, Referrals, Activity Centre, profile/settings, onboarding, and loading/empty/error/success/disabled states.

## Additional product clarity
- Onboarding should briefly and visually explain the platform loop and the distinction between TC (practice allowance), AC (AI operation allowance), and PXY (the project token) before users enter the main experience.
- Keep the asset logo marks unboxed on the existing dark surface so their real brand colors remain legible without adding low-contrast circular backgrounds. Use the current Gram (GRAM) token mark and label; TON refers to the blockchain, not the native token ticker.
- The market chart should use a clear candlestick language, restrained grid, trend line, volume, and readable timeframe controls rather than decorative bars.
- Referral placement is a primary growth surface: show it on the dashboard and in persistent mobile navigation. Use a clear Invite → Activate → Grow Together journey, milestone cards, and transparent reward eligibility.

## Implementation constraints
React JSX with Vite; no TypeScript/TSX and no Next.js. Preserve the repository structure. Use mock state only until a real backend, live market data, AI service, and reward engine are connected.
