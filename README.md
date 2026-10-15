# Pexoriy Design Prototype

A mobile-first React + Vite prototype for Pexoriy. It now focuses on activity workspaces instead of explanatory placeholder pages. It uses local demo state only: no account backend, live market data, connected AI service, blockchain token issuance, or real exchange execution.

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Screens and interactions

- **Overview:** balances, market pulse, prominent Community Challenges, missions, and open positions
- **Practice Trading:** asset selector, long/short choice, TC allocation, simulated position opening/closing
- **AI Trading:** automated simulated trading workspace with risk preference, AI-selected TC allocation, sample opportunity scan, and pause control; 1.5 AC charged per successfully executed simulated AI trade
- **Community Challenges:** 24h Sprint (5,000 PXY), 7-day Consistency League (12,000 PXY), and 14-day Challenge (25,000 PXY), with join action and joined filter. Pools are proposed/demo rewards; qualification and issuance are not connected.
- **Missions & Rewards:** completion states and TC reward previews
- **PXY & Rewards:** proposed token concept and separation of TC, AC, and PXY
- **Activity Centre:** demo session actions
- **Referrals, Profile & Settings, Search**
- Responsive desktop sidebar and persistent mobile bottom navigation

## Economy and safety boundaries

- **TC (Trade Credits)** are used for simulated practice trading. TC is used for simulated practice trading and is not presented as an automatic PXY conversion path.
- **AC (AI Credits)** are used for AI-managed practice trading once the connected AI service is enabled.
- The AI Credit Store package schedule is $5: 70 AC + 100 PXY; $10: 140 AC + 200 PXY; $25: 350 AC + 500 PXY; $50: 700 AC + 1,000 PXY; $100: 1,400 AC + 2,000 PXY; $250: 3,500 AC + 5,000 PXY; and $500: 7,000 AC + 10,000 PXY. Prices are USD equivalents paid in GRAM. These are proposed/demo rewards; issuance and eligibility are not connected.
- **PXY** is the working ticker for the proposed Pexoriy token, with a planned total supply of 100,000,000 PXY. The current working community allocation is 60% (60,000,000 PXY): 30,000,000 for the initial airdrop, 20,000,000 for ongoing community rewards, and 10,000,000 for a future community reserve. Community Challenges and eligible AI Credit purchases are planned PXY reward paths; missions primarily award TC. Overall allocation reconciliation, eligibility, vesting, and issuance remain to be finalized before launch.
- Sample balances, prices, participants, reward pools, and mission rewards are illustrative. No monetary value, token launch, exchange listing, fixed conversion rate, or guaranteed return is implied.
- Closing a demo position returns its allocated TC; this prototype does not calculate simulated P&L.
- Live prices, a real AI service, authentication, durable user data, challenge verification, reward issuance, and on-chain functionality are not connected.

See [DESIGN_DIRECTION.md](./DESIGN_DIRECTION.md) for product rules and design constraints.
