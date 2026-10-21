# Velmora — Personal finance frontend preview

Responsive, dependency-free personal finance dashboard with monthly income, needs budgets, expenses, savings, history and automatic remaining balances.

## Start

Open `index.html` in a browser or use VS Code Live Server. No build command or account is required.

## Local-only preview warning

This version saves records in browser `localStorage`, **not in Supabase**. It has no login, remote backup or encrypted-at-rest cloud data. Use only dummy financial data until authenticated storage is added. Clearing browser data will remove saved entries. Do not use this version on shared/public computers.

## Calculations

- Income: sum of income entries
- Needs budget: sum of planned needs
- Actual needs: expenses whose type is `need`
- Other spending: expenses whose type is `other`
- Actual expenses: all expenses (needs are not counted twice)
- Saved: sum of recorded savings contributions
- Remaining: income − actual expenses − saved
- Planned free balance: income − planned needs − saved

## Next step

Connect Supabase Auth and Postgres tables protected by Row Level Security, then deploy static files to GitHub Pages. Never put a Supabase service-role or secret key in frontend JavaScript.
