# Pexoriy Product & Design Direction

## Brand
Pexoriy is energetic, community-driven, premium, intelligent, and approachable. PYX is the working ticker for the project's proposed token.

## Visual system
- Primary accent: acid lime `#B7F34A`
- Background: deep charcoal `#10120F`
- Surface: `#171A15`
- Elevated surface: `#20231D`
- Muted text: `#92978A`
- AI accent: lavender `#B9A3FF`
- Negative state: `#FF8585`

## Product economy
- **TC (Trade Credits):** used to open simulated practice positions. The intended product direction is for eligible TC to be convertible into PYX later; the rate, eligibility, caps, timing, and anti-abuse rules must be finalized and published before conversion launches.
- **AC (AI Credits):** used to run AI workspace actions, such as market briefs, scenario exploration, and risk checks.
- **PYX:** working ticker for the Pexoriy token. Missions and community challenges are intended reward pathways. Token supply, chain, launch details, distribution rules, and monetary value are not defined by this prototype.
- Never imply TC, AC, or simulated P&L are cash. Do not promise token value, exchange listings, guaranteed returns, or a fixed conversion rate.

## Product experience principles
- Build activity workspaces, not tutorial/placeholder pages. A primary action must open a real interaction or clearly state what backend is missing.
- Community Challenges are a core destination and should have prominent placement on the dashboard and mobile navigation.
- Mobile-first responsive layout with persistent bottom navigation for key destinations.
- Practice Trading must include market selection, long/short selection, TC allocation, simulated open positions, and clear simulation boundaries.
- AI Trading must provide selectable analysis actions, asset/risk controls, AI-credit usage, and a dedicated results area.
- Missions must be actionable, track completion, and show PYX reward previews with clear prototype/pending rules.
- Preserve simple, classic, polished styling; avoid generic exchange templates, excessive gradients, clutter, and childish gamification.

## Screen roadmap
Overview, Practice Trading terminal, AI Trading Centre, Community Challenge hub/detail/leaderboard, Missions & Rewards, PYX & Rewards, Referrals, Activity Centre, profile/settings, onboarding, and loading/empty/error/success/disabled states.

## Implementation constraints
React JSX with Vite; no TypeScript/TSX and no Next.js. Preserve the repository structure. Use mock state only until a real backend, live market data, AI service, and reward engine are connected.
