# Penvoria Stage 1 — Reliability Verification

Scope: beta-testing only. Do not merge to main until regression tests and signed-in checks pass.

## Delivered
- Fail-closed guard for deleting creation months that contain savings goals, including archived goals.
- Re-check the fetched cloud month before the revision-qualified delete; avoids silently removing a goal unknown to the local snapshot.
- Goal dependency tests and mocked revision-checked Supabase writer tests.
- GitHub Actions syntax / Node test workflow for beta-testing.
- PWA cache version bumped to deliver the new safety module.

## Automated verification
GitHub Actions: `Penvoria beta reliability tests`
Local: `node --test tests/*.test.cjs`.
The Vercel READY status proves deployment success but is not a substitute for a passing Node test run.

## Signed-in manual checks (use existing account, no destructive tests on valuable records)
1. Sign in on beta preview. Check that "All changes saved" is shown.
2. On History, try Delete month on a month *containing a savings goal*.
   Expected: blocked with a clear safety message, including archived goals. No cloud changes.
3. For a month without goals, open Delete month, then Cancel.
   Expected: confirm dialog opens normally; data remains unchanged.
4. Compare Savings Goals and linked transfers on mobile and desktop.
5. On one device, make a small reversible edit in a month safe to test; wait for All changes saved.
   Refresh the second device and confirm it sees the edit. Undo after confirmation.
6. If a real sync conflict is reported, use Review sync conflict, download both copies,
   and resolve manually. Do not force a conflict on meaningful financial records.
7. Check the iPhone installed PWA receives the new version and that navigation,
   calendar, forms and close buttons work.

## Database read-only security review (2026-11-10)
- `monthly_budgets` and `recurring_templates`: RLS enabled.
- Owner-scoped SELECT, INSERT, UPDATE, DELETE policies present.
- Supabase security advisor warning: leaked-password protection disabled.
  Enable through Supabase Auth settings after reviewing the account impact.
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Remaining for Stage 1 release signoff
- Confirm the GitHub Actions test job succeeds.
- Complete signed-in cross-device and iPhone checks.
- Verify PWA update with no unsynced draft.
- Do not treat build status or an empty server log as evidence of Supabase client correctness.
