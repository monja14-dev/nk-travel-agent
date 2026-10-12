# Vercel preview deployment — Phase 6

This is the step-by-step the owner runs locally to get a real Vercel
**preview** deployment of this app, plus exactly what to check once it's
up. No Vercel project has existed for this app before this phase (every
prior phase's "Known issues" section says so). **Nothing here should be
promoted to Production, a custom domain should not be attached, and the
Production Branch setting should not be pointed at anything without a
separate, explicit go-ahead** — this phase only prepares and verifies a
preview.

## 0. One Vercel quirk to know about before starting

Vercel's own community support forum confirms a real, current behavior:
**the very first deployment of a brand-new Vercel project is always
labeled "Production" internally, even when it comes from a non-default
branch or an explicit `--target=preview`** — this isn't a configuration
mistake, it's how Vercel bootstraps a project's first deployment. See
[First deployment is forced to Production even for a Preview branch and
`--target=preview`](https://community.vercel.com/t/first-deployment-is-forced-to-production-even-for-a-preview-branch-and-target-preview/46300)
and [First deployment classified as Production despite explicit Preview
target (Hobby)](https://community.vercel.com/t/first-deployment-classified-as-production-despite-explicit-preview-target-hobby/46713).
Every deployment *after* that first one follows the normal branch-based
rules (non-`main` branches and PRs become real Preview deployments).

In practice this is low-stakes either way: on the Hobby plan, with no
custom domain ever attached and the resulting `*.vercel.app` URL never
shared anywhere, Vercel's internal "Production" label is just bookkeeping
for which deployment sits at the project's default URL — it has no real
audience and nothing is "live" in any meaningful sense. Still, pick one
approach before importing, so there's no ambiguity about what happened:

- **Default/simplest:** merge this phase normally into `main` (the same
  single-branch workflow every phase has used so far), then import the
  Vercel project pointing at `main`. The first deployment will carry the
  internal "Production" label regardless — that's unavoidable per §0 —
  but with no domain attached, it's functionally a preview anyway.
- **Extra-cautious alternative:** before importing, branch off whatever
  `main` happens to be at the time (`git checkout -b phase-6-preview`)
  and import pointing at that branch instead, so the word "Production"
  never appears next to anything on `main` even internally. Once the
  project exists, push to `main` as normal — that becomes an ordinary
  Preview deployment from then on (§0's quirk only ever affects the
  first deployment, never the ones after it).

Either way, nothing should be promoted to Production for real (via
"Promote to Production" or by changing the Production Branch setting to
intentionally track `main`), and no custom domain should be attached,
until a separate explicit approval.

## 1. Environment variables to configure

Only two secrets exist in this app, both read **only** by
`api/ai-chat.ts` (never by anything under `src/` — enforced automatically
by `api/_lib/__tests__/noClientLeak.test.ts` and re-verified below against
the real built output):

| Variable | Where it's used | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/ai-chat.ts` → `process.env.ANTHROPIC_API_KEY` | Secret key from https://console.anthropic.com/. In Vercel's dashboard, add it under Project Settings → Environment Variables, scoped to at least **Preview** (add to Production too now if convenient — that scoping takes effect only once something is actually promoted, which this phase doesn't do). Leave Vercel's default "Sensitive" encryption on. |
| `ANTHROPIC_MODEL` | `api/ai-chat.ts` → `process.env.ANTHROPIC_MODEL` | A real current model id from https://docs.claude.com/en/docs/about-claude/models — check that page for the current id rather than reusing an old one, since model ids are retired over time. |

Neither variable should ever be prefixed `VITE_` — that prefix is what
tells Vite to inline a variable into the client bundle, which would leak
it. `.env.example` at the repo root documents both (values left blank,
real values never committed — `.gitignore` already excludes `.env*`
except the example file itself).

No other environment variable exists anywhere in this project — confirmed
by grepping the whole repo (excluding `node_modules`) for `process.env`:
every match is either the one line above or a comment explaining it.

## 2. Get this phase's code onto GitHub

Same single-branch workflow every phase has used so far: once
`npm run test`/`npm run build` are confirmed green locally (§ below —
same as every prior phase's report), commit and push Phase 6's changes
to `main` as usual.

If you'd rather use the extra-cautious alternative from §0 instead,
branch off first (`git checkout -b phase-6-preview && git push -u origin
phase-6-preview`) and import pointing at that branch in step 3 below —
then merge to `main` afterward once Vercel already exists and §0's
first-deploy quirk is behind you.

Either way, once a Vercel project is connected to this GitHub repo (step
3), every push to a non-Production branch and every open PR against it
automatically gets its own real Preview Deployment with its own URL,
posted as a check/comment on the PR — useful for any later phase too,
not just this one.

## 3. Import the project in Vercel

1. https://vercel.com/new → "Import Git Repository" → select
   `monja14-dev/nk-travel-agent`.
2. Framework Preset: Vercel should auto-detect **Vite**. If asked to
   confirm: Build Command `npm run build` (this project's own script,
   which runs `tsc -b && vite build` — the same real typecheck-then-build
   every previous phase's local verification has run), Output Directory
   `dist`, Install Command default (`npm install`).
3. Add the two environment variables from step 1.
4. Deploy. This first deployment will carry Vercel's internal
   "Production" label regardless of which branch you chose when
   importing — see §0. If you want that label to land on `main`
   specifically (the recommended option), make sure the project is
   pointed at `main` for this one import.
5. Afterwards, confirm in Project Settings → Git that **Production
   Branch** is set to `main` (Vercel's default) — this controls which
   *future* branch triggers a Production-flagged deploy; it does not
   undo the one-time first-deploy quirk from §0.
6. If you used the extra-cautious alternative branch, open a PR from it
   into `main` now (or push any small change to a new branch) — this
   produces a genuine, ordinarily-labeled Preview Deployment with its
   own URL for everything below to be checked against. If you imported
   pointing at `main` directly, the deployment from step 4 is already
   what to check below.

## 4. What to verify on the preview deployment

Work through these against the **Preview Deployment URL** (not
`localhost`) and report back exactly what you see, the same as every
other phase's manual QA:

1. **Loads at all:** open the preview URL. The Dashboard should load
   ("Local database ready" state resolves instantly, not a blank page or
   a Vercel error page).
2. **Route refresh:** this app has no client-side router — every "page"
   is in-memory React state, and the browser's address bar never changes
   away from `/` (documented, intentional, since Phase 2). So the only
   meaningful "route refresh" check is: hard-refresh (Ctrl/Cmd+Shift+R)
   on the root URL itself, more than once, from a few different in-app
   screens' worth of IndexedDB state already saved. It should reliably
   reload the same Dashboard shell every time — never a 404, never a
   stale cached asset mismatch. (A deep "sub-route 404 on refresh" bug,
   the usual SPA-hosting failure mode, structurally can't happen here
   since there are no sub-routes for a refresh to even target.)
3. **The AI gateway, for real, for the first time:** every phase since
   Phase 3 has noted that a live AI conversation couldn't be tested — no
   Vercel deployment existed and `npm run dev` doesn't serve Edge
   Functions. This preview is the first chance. Open a trip → "Ask NK
   AI" → send a real message. Confirm you get a real reply (not a 502/504
   error) if `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` are both set correctly,
   or a clean, specific error (not a raw stack trace) if something's
   misconfigured.
4. **Credential leak, against the real Vercel build this time:** open
   browser DevTools → Network tab → reload → find the main JS bundle
   request → view its response → search for the literal text
   `ANTHROPIC`. Should find zero matches, same as every local build's
   `Select-String`/`grep` check — but this is the first time it's checked
   against what Vercel itself actually shipped, not a local build.
5. **Function logs:** Vercel dashboard → the deployment → Functions tab
   → `api/ai-chat` → check for unexpected errors after sending the test
   message in step 3 (a clean run should show a single successful
   invocation, not a crash or a credential-related error).
6. **Build logs:** Vercel dashboard → the deployment → Build Logs. Should
   mirror the local `npm run build` output already reported in
   `docs/PHASE_LOG.md` — same module count, same clean `tsc -b` with zero
   errors, no unexpected warnings beyond the already-known `exceljs`
   chunk-size notice.
7. **Environment variable scoping:** Project Settings → Environment
   Variables → confirm `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are each
   scoped to (at least) Preview, and that neither is marked "Plaintext"
   (Vercel's default "Sensitive" encryption should be left on for the API
   key in particular).

Report back, verbatim, what actually happened at each numbered step —
same standard as every `npm run test`/`npm run build` report so far in
this project: real output, not an assumption that it probably works.

## 5. Release checklist — for whenever Production is actually approved

Not for this phase. Kept here so it isn't reinvented later:

- [ ] Explicit, separate owner approval to promote a specific deployment
      to Production (this phase's instructions stop short of that).
- [ ] `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` present in the **Production**
      environment-variable scope (not just Preview).
- [ ] Re-run the credential-leak check (§4.4) against the actual
      Production build output, not just a Preview one.
- [ ] Decide on a custom domain (or accept the default `*.vercel.app`
      one) — not attached to anything yet.
- [ ] Re-run the full disaster-recovery procedure
      (`docs/DISASTER_RECOVERY.md`) against the Production URL once it
      exists, not only against `localhost`.
- [ ] Confirm Project Settings → Git → Production Branch is intentionally
      `main` (or whatever branch is actually meant to be authoritative).
