# Pexoriy Production Release Runbook

Updated: 18 October 2026

## Release policy

Production is served by the Cloudflare Worker `pexoriy-design`. Cloudflare Workers Builds watches GitHub `main`; feature and scope branches are previews only. A commit on a scope branch is **not live production** until its tested commit is promoted to `main`, Cloudflare builds that exact commit, and the resulting deployment is verified.

Do not merge or fast-forward untested code. Do not mark a release complete based only on a successful local/preview build, GitHub commit, or Cloudflare build status.

## Required sequence for every implementation stage

1. **Establish baseline.** Read the current GitHub `main` SHA and the latest Cloudflare production build/deployment/version. Compare the deployed build commit with `main`. Record any existing mismatch before starting new work.
2. **Implement on a scope branch.** Keep incomplete capabilities safely gated. Do not enable presale, PXY issuance, public competition settlement, or payment flows without their separate approvals and acceptance evidence.
3. **Run candidate checks.** Require the GitHub validation workflow to pass: frozen Bun lockfile install, Worker syntax, ordered SQL migration validation, payment schema safety, unit tests, production bundle build, desktop/mobile Playwright flows, and candidate endpoint smoke tests.
4. **Promote only the tested candidate.** Fast-forward `main` to the exact tested candidate SHA. Do not use a pull request if the owner has requested direct promotion. Before moving the ref, verify that the candidate is based on current `main` and that its full test run passed.
5. **Watch Cloudflare.** Confirm a production build starts for the exact new `main` SHA. The production build command must use `bun install --frozen-lockfile && bun run build`. Frontend-only releases deploy with `npx wrangler deploy --config wrangler.frontend-release.jsonc`, which explicitly binds the production D1 database but omits migration configuration. Do not run D1 migrations as an automatic side effect of a frontend-only release. Database migrations must be a separate, explicitly authorized step after schema review, quota availability, and backup/rollback planning.
6. **Verify deployment.** Require Cloudflare build outcome `success`; confirm the latest production deployment sends 100% traffic to the intended version; inspect that version's bindings to ensure `DB` is production D1 `3add741b-bda8-4f47-b857-538ff9a1dae8`, not preview. For frontend-only releases, verify no migration command ran. Check the D1 migration ledger and critical state only during the separately scheduled database-validation phase when D1 quota is available; then run appropriate live HTTP smoke tests.
7. **Reconcile and record.** Compare GitHub `main` SHA, Cloudflare build commit SHA, active version, deployment percentage, migration ledger, and smoke-test results. Record the evidence and any blocked acceptance tests in the completion register before starting the next stage.
8. **Stop on mismatch.** If a build fails, no build starts, the deployed commit differs from `main`, traffic is not 100% on the intended version, production bindings are wrong, migrations fail, or smoke tests fail, report the specific failure and fix it before proceeding. Never say “deployed” based on a commit alone.

## Cloudflare build-trigger behavior

- Production build trigger watches `main` only. Live production API smoke checks in GitHub Actions run only when the commit message includes `[db-validation]`; routine frontend-only commits therefore avoid DB-backed production requests while D1 quota is exhausted.
- The completion register, this runbook, and the GitHub validation workflow are excluded from Cloudflare production builds because documentation/workflow-only edits do not change the app bundle. Application code, dependencies, Worker code, and migrations must remain included.
- Cloudflare's native build trigger does not wait for GitHub Actions to finish. Therefore, the candidate workflow must pass **before** the candidate is promoted to `main`. The main-branch workflow is post-promotion verification, not permission to promote untested code.
- A successful build is not proof that the intended version is active. Check the deployment's traffic allocation and the version-specific D1 binding.
- Preview builds and preview D1 are isolated from production; never infer production readiness from preview success alone.

## Current release evidence — 18 October 2026

- Candidate branch `scope/production-readiness-reconcile-20261017` was validated and fast-forwarded to `main` at commit `b80e75eb09c03e9e7af75f1d3d3cdff7179ed1e2`.
- Candidate GitHub Actions run [39026142492](https://github.com/tomx2000xx-ship-it/pexoriy-design/actions/runs/39026142492) passed the frozen install, syntax/migration/payment checks, unit tests, production build, desktop/mobile Playwright flows, and candidate endpoint smoke tests.
- Cloudflare production build [510947c0-a333-4a6a-bb0c-067b99a4ba02] completed successfully for that exact commit. The emitted JavaScript is split into chunks; the largest emitted chunk is about 357 kB minified, with no Vite 500 kB chunk warning.
- Cloudflare reports deployment `ed30bed0-8755-4487-9916-a122edd9e844` serving 100% traffic on Worker version `eb027413-4eef-4a49-9b8a-19f95fd3b15e` (version 234).
- Version-specific metadata confirms the Worker uses production D1 `3add741b-bda8-4f47-b857-538ff9a1dae8`.
- **Historical binding-log discrepancy:** an earlier build log printed the preview UUID while the active version metadata reported production D1. The new frontend release's version-specific metadata explicitly confirms production D1 `3add741b-bda8-4f47-b857-538ff9a1dae8`. Keep this binding check mandatory for every deployment.
- Read-only production D1 queries confirm migrations `0001`–`0010`, including `0010_daily_checkins.sql`. Presale remains `preview_enabled=1`, `sale_enabled=0`, `launch_state='disabled'`.
- Remaining release gates are not waived: controlled SOL/GRAM mainnet payment acceptance, live authenticated AI inference/AC settlement, email delivery after sender-domain setup, persistent competition/settlement service, approved PXY reserves/issuance, stronger fraud operations, and full live authenticated acceptance. These must remain gated until verified.
- The external HTTP checker could not reach the Worker URL in this session. Use the main-branch GitHub production smoke workflow or another direct HTTP client to capture explicit live endpoint status codes; do not infer HTTP smoke success from Cloudflare deployment metadata alone.


## Frontend-only release evidence — 18 October 2026 (latest update)

- Mobile UX changes were committed directly to `main` and deployed by Cloudflare Workers Builds.
- Final successful Cloudflare build `ee5cab17-10d9-43c9-99f5-72a17e74b02b` built app commit `c53031efcbb0ed30924212107fa18d8b75ecf149`.
- Active production deployment `b0894665-a543-4b8e-92dc-3cdf6001018a` serves 100% traffic on Worker version `eacfa347-a9be-4823-a049-7ef93617f416` (version 238).
- The deployed version's metadata confirms `DB` points to production `pexoriy-core` (`3add741b-bda8-4f47-b857-538ff9a1dae8`), not the preview database.
- Cloudflare's production build command is now `npx wrangler deploy --config wrangler.frontend-release.jsonc`. That config retains the production DB binding but omits migration configuration; the successful deployment did not run the D1 migration command.
- Earlier builds failed with Cloudflare error 7500 at `wrangler d1 migrations apply` because the daily row-read limit was exceeded. Those failed before deployment; the later frontend-only build succeeded.
- GitHub Actions run `39122491018` includes the corrected responsive Learning Center assertion and the new live static-asset smoke test that avoids DB-backed endpoints. At the last check it was still running; confirm its final result before calling validation green.
- GitHub Actions' live API/D1 smoke step is gated behind an explicit `[db-validation]` commit-message marker. Routine frontend-only commits do not intentionally call DB-backed production endpoints.
- Direct public HTTP inspection from this session was unavailable; use the GitHub static-asset smoke result for independent HTTP evidence when it completes. Do not claim visual/browser verification from deployment metadata alone.
