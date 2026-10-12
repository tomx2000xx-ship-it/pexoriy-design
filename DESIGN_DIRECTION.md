# Pexoriy Product & Design Direction

## Brand
Pexoriy is energetic, community-driven, premium, intelligent, and approachable. PXY is the working ticker for the project's proposed token.

## Visual system
- Primary accent: acid lime `#B7F34A`
- Background: deep charcoal `#10120F`
- Surface: `#171A15`
- Elevated surface: `#20231D`
- Muted text: `#92978A`
- AI accent: lavender `#B9A3FF`
- Negative state: `#FF8585`

## Product economy
- **TC (Trade Credits):** used to open simulated practice positions. The intended product direction is for eligible TC to be convertible into PXY later; the rate, eligibility, caps, timing, and anti-abuse rules must be finalized and published before conversion launches.
- **AC (AI Credits):** used to run AI workspace actions, such as market briefs, scenario exploration, and risk checks.
- **PXY:** working ticker for the Pexoriy token. Community Challenges are the primary PXY reward pathway. Missions primarily award TC; rare PXY mission rewards are reserved for manually configured special campaigns. PXY may also be awarded through eligible AI Credit purchase campaigns. Token supply, chain, launch details, distribution rules, and monetary value are not defined by this prototype.
- Never imply TC, AC, or simulated P&L are cash. Do not promise token value, exchange listings, guaranteed returns, or a fixed conversion rate.

## Product experience principles
- Build activity workspaces, not tutorial/placeholder pages. A primary action must open a real interaction or clearly state what backend is missing.
- Community Challenges are a core destination and should have prominent placement on the dashboard and mobile navigation.
- Mobile-first responsive layout with persistent bottom navigation for key destinations.
- Practice Trading must put an obvious asset selector before the trade ticket, use familiar Buy/Long and Sell/Short labels, show TC allocation clearly, and support simulated open/closed positions.
- AI Trading should prioritize automated simulated trading: users choose guardrails, AI selects an opportunity and allocation from available TC, opens/monitors practice positions, and can be paused by the user. Continuous execution requires connected AI and live market services.
- Missions must be actionable and primarily award TC. PXY rewards are scarce and should only appear for manually configured special campaigns. The homepage must link directly to Missions & Rewards and restore the daily streak/check-in feature.
- Preserve simple, classic, polished styling; avoid generic exchange templates, excessive gradients, clutter, and childish gamification.

## Screen roadmap
Overview, Practice Trading terminal, AI Trading Centre, Community Challenge hub/detail/leaderboard, Missions & Rewards, PXY & Rewards, Referrals, Activity Centre, profile/settings, onboarding, and loading/empty/error/success/disabled states.

## Implementation constraints
React JSX with Vite; no TypeScript/TSX and no Next.js. Preserve the repository structure. Use mock state only until a real backend, live market data, AI service, and reward engine are connected.
