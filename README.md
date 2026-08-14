# XM Watch-Only Dashboard — GitHub Actions + Pages (no backend)

A fully serverless version: no process to host or keep alive.
A GitHub Actions workflow polls your XM account via MetaApi on a
schedule and commits the result as JSON; GitHub Pages serves a static
dashboard that reads those files directly.

## Why the repo must be PRIVATE

The committed `data/*.json` files contain your account balance,
equity, and trade history. GitHub Secrets keep your credentials safe
in a public repo, but the **output data itself would be public** if
the repo is public. Two options:

- **Private repo + GitHub Pro/Team/Enterprise** — private repos on
  free personal accounts can't serve GitHub Pages.
- **Private repo + Netlify or Vercel** (recommended for free accounts)
  — both support deploying from a private GitHub repo on their free
  tiers, and can auto-redeploy whenever the Actions workflow pushes
  new data.

Either way: **create this repo as Private** before pushing.

## Setup

1. Create a new **private** GitHub repo and push this project to it.

2. Add your credentials as repo secrets:
   Settings → Secrets and variables → Actions → New repository secret
   - `METAAPI_TOKEN`
   - `XM_LOGIN`
   - `XM_INVESTOR_PASSWORD` (the read-only password — never your trading password)
   - `XM_SERVER` (exact server name, e.g. `XMGlobal-MT5 3`)

3. Check the workflow has permission to commit:
   Settings → Actions → General → Workflow permissions →
   **Read and write permissions** (needed so the poll job can push
   updated `data/*.json` files back to the repo).

4. Trigger the first run manually to confirm it works:
   Actions tab → "Poll XM Account" → Run workflow.
   Check the run logs, and confirm `data/*.json` files got updated
   in the repo afterward.

5. After that, it runs automatically every 15 minutes
   (`.github/workflows/poll.yml` — adjust the cron schedule if you
   want a different interval; 5 minutes is roughly GitHub's practical
   floor).

6. Enable hosting for `index.html`:
   - **If using a paid plan with private Pages:** Settings → Pages →
     deploy from the branch containing this code.
   - **If using Netlify/Vercel (free, private-repo friendly):**
     connect the repo, set the publish directory to the repo root,
     no build command needed (`index.html` is already static).

## Notes

- Data is only as fresh as the last successful workflow run — the
  dashboard header shows "last updated" from `data/summary.json`.
- No server process exists anywhere in this version — nothing to keep
  running, nothing to pay for hosting compute on.
- Still strictly watch-only: the poll script only ever uses the
  investor password and only ever reads account data.
