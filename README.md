# Penvoria — Personal Finance

Penvoria is a responsive, installable personal-finance PWA for monthly budgets in **MVR**. Live: https://penvoria.vercel.app/

## Features

- Overview: financial dashboard, budget warnings and trends.
- Planning: income, needs allocations, savings, and copy previous month's plan.
- Spending: quick expense entry, category allocations, search and filters.
- History: month-by-month records and permanent deletion with optional JSON backup. **There is no deleted-month restore feature.**
- Recurring: reviewed monthly templates. No automatic entries or payments; recurring bills create planned Needs allocations, not recorded payments.
- Export financial reports to CSV/PDF or JSON backup.
- Supabase email authentication, month revision checks, local recovery drafts, and cross-device monthly budget refresh.
- Installable mobile PWA, iPhone navigation, update prompts and offline status.

## Run locally

Use an HTTP server rather than opening the HTML file directly:

```powershell
cd D:\Budget-GPT
python -m http.server 5500
```

Visit http://localhost:5500. Set permitted Supabase authentication redirect URLs when testing localhost sign-in.

## Tests

Node.js 22+ is needed; no npm install required:

```powershell
node --test tests/*.test.cjs
```

GitHub Actions also validates JavaScript syntax and runs tests on pushes/pull requests. These tests do not verify the live database, Supabase RLS, or real iPhone PWA behavior.

## Data safety and security

Financial records are stored in Supabase `monthly_budgets` and `recurring_templates`. **Verify Row Level Security (RLS)** for both tables and all operations in the Supabase dashboard, using policies restricted to the signed-in owner. The public client `config.js` contains a publishable/anon key; never include a service-role or private secret in browser code.

Monthly edits use revision checks to detect changes on other devices. The one-editor lock only covers tabs in the same browser. Unsynced draft records can be stored in readable local browser storage; use a trusted device. Confirm *All changes saved* before logging out, force-closing or applying an update.

Export backups **outside the Git repository**. `.gitignore` prevents common backup filenames from being accidentally added, but cannot remove records from previous commits. Any financial export previously pushed to a public repository should be treated as publicly exposed until repository history is separately cleaned.

## Offline behavior

Opening/reloading the app requires network access. The service worker shows the offline page when navigation fails and does not cache Supabase responses or financial data. A temporarily interrupted editing session can keep pending changes as local recovery drafts for retry; do not clear browser storage while edits are unsynced. This is **not** a fully offline-first app.

## Release process

Work on a branch, test using disposable records on a Preview deployment, then merge into `main`. Preview and production may share a Supabase database. Bump `CACHE_NAME` in `sw.js` when releasing PWA changes.
