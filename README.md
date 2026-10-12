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
- **AI Trading:** automated simulated trading workspace with risk preference, AI-selected TC allocation, sample opportunity scan, and pause control; 50 AC session cost
- **Community Challenges:** challenge cards, join action, joined filter, sample PXY reward pools
- **Missions & Rewards:** completion states and TC reward previews
- **PXY & Rewards:** proposed token concept and separation of TC, AC, and PXY
- **Activity Centre:** demo session actions
- **Referrals, Profile & Settings, Search**
- Responsive desktop sidebar and persistent mobile bottom navigation

## Economy and safety boundaries

- **TC (Trade Credits)** are used for simulated practice trading. TC is used for simulated practice trading and is not presented as an automatic PXY conversion path.
- **AC (AI Credits)** are used for AI-managed practice trading once the connected AI service is enabled.
- **PXY** is the working ticker for the proposed Pexoriy token. Community Challenges are the primary PXY reward path; missions primarily award TC, with rare manually configured PXY campaigns.
- Sample balances, prices, participants, reward pools, and mission rewards are illustrative. No monetary value, token launch, exchange listing, fixed conversion rate, or guaranteed return is implied.
- Closing a demo position returns its allocated TC; this prototype does not calculate simulated P&L.
- Live prices, a real AI service, authentication, durable user data, challenge verification, reward issuance, and on-chain functionality are not connected.

See [DESIGN_DIRECTION.md](./DESIGN_DIRECTION.md) for product rules and design constraints.
