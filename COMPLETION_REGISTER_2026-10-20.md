# Pexoriy completion register — 20 October 2026

This register tracks implementation separately from verification and production deployment. Do not mark a workstream complete based on a commit alone.

## Immediate sequence
1. Reconcile current `main` SHA, Cloudflare build commit, active deployment/version, 100% traffic, and production D1 binding.
2. Competition: validate risk-adjusted score functions, open-position mark freshness, score refresh triggers, round scheduling, standardized final settlement, idempotent ledger awards, and leaderboard ordering. Keep awards gated until acceptance tests pass.
3. Referral/community: document and implement shared-pool allocation math, verified eligibility, per-user caps, anti-abuse rules, ledger posting and retry behavior; keep PXY payouts gated until reserves/launch approval.
4. Missions/learning/mobile UX: verify the 30-day journey, server-side reward verification, lesson navigation, persistent mobile navigation to Missions & Rewards, and Practice-to-AI discovery.
5. Payments/AI: test controlled, explicitly authorized SOL/GRAM transactions and provider evidence; verify ledger/balance settlement, AI inference, credit deduction, insufficient-balance and recovery flows. No fake transactions or production funds without approval.
6. Release acceptance: run ordered migration validation, syntax checks, unit tests, production build, desktop/mobile Playwright, and live HTTP smoke tests; verify the exact promoted SHA and Worker version.

## Safety gates
- No production D1 migration until quota, exact schema diff, backup/rollback plan, and explicit migration window are confirmed.
- Presale stays disabled; PXY issuance/bonuses stay gated pending reserves and launch approval.
- Email verification sender setup remains paused until domain configuration.
- Never claim a payment, reward, or deployment is verified without provider/ledger/deployment evidence.

## Current evidence at register creation
- Latest competition-related commits include risk-aware scoring, leaderboard API, open-position fresh-snapshot scoring, scheduled settlement, and deterministic edge-case tests.
- Cloudflare Worker `pexoriy-design` has a deployment dated 2026-10-19 23:45 UTC with 100% traffic to version `a8e318b1-9a49-4c45-a485-47e184d1c724`.
- The exact commit-to-version mapping and latest full acceptance results still need verification.
- Earlier checkpoint lists referral shared-pool logic, live SOL/GRAM and AI acceptance, and full persistent competition settlement as incomplete/gated.
