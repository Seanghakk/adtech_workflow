/**
 * Requests EVERY route in the app and asserts none of them is broken.
 *
 * =============================================================================
 * WHY THIS EXISTS
 * =============================================================================
 * Nothing in this project had ever loaded a page. Four findings in Brief 106
 * share that one shape — a defect every automated signal agreed was fine:
 *
 *   1. Migration 045 applied, tsc clean, 221 tests passing, the app broken in
 *      the browser on its first request.
 *   2. The rollup trigger 045's CASCADE removed. The arithmetic was never
 *      wrong; nothing called it any more. Found by rendering the page.
 *   3. `.in('floor_sub_stage_id', …)` on a dropped column — tsc does not check
 *      column names for `.in()`, so a safety check silently stopped testing.
 *   4. `export const coverageInitialState = {}` in a 'use server' file, which
 *      took down every server action on the setup route in PRODUCTION while
 *      `next build` exited 0.
 *
 * Types check shapes. Tests check units. Neither asks what a user asks first:
 * does the page come back.
 *
 * =============================================================================
 * WHAT THIS ACTUALLY COVERS — MEASURED, NOT ASSUMED
 * =============================================================================
 * This app has no middleware; every protected route redirects to /login from
 * its layout. That was measured on 26 Sep 2026 against a deliberately broken
 * build, and it decides what this script can and cannot see:
 *
 *   UNAUTHENTICATED, a protected route returns 307 WHETHER OR NOT ITS CODE IS
 *   BROKEN. The redirect happens before the page module is evaluated. A POST
 *   carrying a Next-Action header was also 307. So an unauthenticated run
 *   proves the server is up and routing works — and almost nothing about page
 *   code.
 *
 * Therefore this script does NOT report a 307 as a pass. It reports it as
 * INCONCLUSIVE and, if every protected route came back that way, it says the
 * run proved nothing and exits non-zero. A smoke test that goes green against
 * a broken app is worse than no smoke test: finding 1 above is exactly what
 * happens when a green signal is trusted.
 *
 * SET SMOKE_COOKIE TO GET REAL COVERAGE. Authenticated, it asserts 200 and no
 * Next.js error digest, which reaches render time — where findings 1 and 2
 * live.
 *
 * WHAT IT STILL DOES NOT CATCH, in either mode:
 *
 *   * FINDING 4. Measured: GET on the broken setup route returned 200 in
 *     production throughout, and 307 unauthenticated locally. Only invoking a
 *     real server action evaluates the actions module, and that needs a valid
 *     action id from the client bundle. This script does not do that. The
 *     eslint rule `local/use-server-exports-only-async-functions` is the guard
 *     for that defect, and it was proved against the exact line.
 *   * FINDING 3. A query that silently returns the wrong answer still returns
 *     200. This proves a page loads, never that it is right. A green run here
 *     is not a substitute for reading the screen.
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *   npm run test:smoke                                   # localhost:3000
 *   BASE_URL=https://<preview>.vercel.app npm run test:smoke
 *   SMOKE_COOKIE="sb-…=…; sb-…=…" npm run test:smoke     # real coverage
 *
 * Take SMOKE_COOKIE from your own browser session (DevTools → Application →
 * Cookies). It is never stored and never logged. The app's env points at
 * PRODUCTION, so this script deliberately does not mint its own session —
 * that would be a write to production auth and is not this script's to do.
 *
 * Fixture ids come from env so this can point at any environment.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const COOKIE = process.env.SMOKE_COOKIE ?? '';
const AUTHED = COOKIE.length > 0;
const APP_DIR = 'src/app';

// Routes that are meant to be reachable without a session. A redirect from
// one of these is a real failure, not an inconclusive result.
const PUBLIC_ROUTES = new Set(['/login']);

const FIXTURES = {
  projectId: process.env.SMOKE_PROJECT_ID ?? '4c107c15-6ae7-45bb-a792-d5e53c3da1cb',
  floorId: process.env.SMOKE_FLOOR_ID ?? '',
  subStageId: process.env.SMOKE_SUBSTAGE_ID ?? '',
  itemId: process.env.SMOKE_ITEM_ID ?? '',
  requestId: process.env.SMOKE_REQUEST_ID ?? '',
  variationId: process.env.SMOKE_VARIATION_ID ?? '',
  id: process.env.SMOKE_SHORTLINK_ID ?? '',
  tier: process.env.SMOKE_TIER ?? 'contract',
  key: process.env.SMOKE_SOON_KEY ?? 'reports',
};

function findPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findPages(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

function toRoute(pagePath) {
  const rel = relative(APP_DIR, pagePath).split(sep).slice(0, -1);
  // Route groups — (app) — are organisational, not URL segments.
  return '/' + rel.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
}

function resolveRoute(route) {
  if (route.includes('[...')) return { skip: 'catch-all, answered by the 404 page' };
  let resolved = route;
  for (const m of route.matchAll(/\[([^\]]+)\]/g)) {
    const value = FIXTURES[m[1]];
    if (!value) return { skip: `no fixture for [${m[1]}]` };
    resolved = resolved.replace(m[0], encodeURIComponent(value));
  }
  return { url: resolved };
}

const routes = [...new Set(findPages(APP_DIR).map(toRoute))].sort();

console.log(`Smoke: ${routes.length} routes against ${BASE_URL}`);
console.log(
  AUTHED
    ? '  mode: AUTHENTICATED — asserting 200 and no error digest\n'
    : '  mode: UNAUTHENTICATED — a 307 proves nothing about page code (see header)\n',
);

let pass = 0,
  fail = 0,
  skip = 0,
  inconclusive = 0;
const failures = [];

for (const route of routes) {
  const { url, skip: skipReason } = resolveRoute(route);
  if (skipReason) {
    skip += 1;
    console.log(`  ○ SKIP          ${route}  (${skipReason})`);
    continue;
  }

  let res,
    body = '';
  try {
    res = await fetch(BASE_URL + url, {
      redirect: 'manual',
      headers: COOKIE ? { cookie: COOKIE } : {},
    });
    if (res.status === 200) body = await res.text();
  } catch (e) {
    fail += 1;
    failures.push(`${route} — request failed: ${e.message}`);
    console.log(`  ✗ FAIL          ${route}  request failed: ${e.message}`);
    continue;
  }

  const s = res.status;
  const isRedirect = s >= 300 && s < 400;
  const isPublic = PUBLIC_ROUTES.has(route);
  // A 200 that rendered the error boundary is still a broken page.
  const digest = s === 200 && /digest["':\s]+['"]?\d{6,}/.test(body);

  if (s >= 500) {
    fail += 1;
    failures.push(`${route} — HTTP ${s}`);
    console.log(`  ✗ FAIL          ${route}  HTTP ${s}`);
  } else if (digest) {
    fail += 1;
    failures.push(`${route} — rendered an error boundary`);
    console.log(`  ✗ FAIL          ${route}  rendered an error boundary (digest in HTML)`);
  } else if (isRedirect && !AUTHED && !isPublic) {
    inconclusive += 1;
    console.log(`  ? INCONCLUSIVE  ${route}  ${s} to login — page code never ran`);
  } else if (isRedirect && isPublic) {
    fail += 1;
    failures.push(`${route} — public route redirected (${s})`);
    console.log(`  ✗ FAIL          ${route}  public route redirected (${s})`);
  } else if (AUTHED && s !== 200) {
    fail += 1;
    failures.push(`${route} — HTTP ${s} while authenticated`);
    console.log(`  ✗ FAIL          ${route}  HTTP ${s} (authenticated request should render)`);
  } else {
    pass += 1;
    console.log(`  ✓ ${String(s).padEnd(3)}           ${route}`);
  }
}

console.log(
  `\n  ${pass} passed, ${fail} failed, ${inconclusive} inconclusive, ${skip} skipped`,
);

if (failures.length) {
  console.log('\n  FAILURES:');
  for (const f of failures) console.log(`    ${f}`);
}

// An unauthenticated run cannot do this test's job, so it does not get to
// exit green. The first draft exited 0 here as long as ONE route passed —
// and /login always passes — which would have printed a success line over 35
// routes whose code never ran. That is the same meaningless-green this whole
// script exists to stop; see finding 1 in the header.
if (!AUTHED && inconclusive > 0) {
  console.log(
    `\n  THIS RUN DID NOT TEST PAGE CODE. ${inconclusive} protected route(s) redirected to\n` +
      '  login before their modules were evaluated; only public routes were really\n' +
      '  exercised. Set SMOKE_COOKIE to a real session to make this test mean\n' +
      '  something. Exiting non-zero so this cannot be read as a pass.',
  );
  process.exit(1);
}

if (skip > 0) {
  console.log(
    `\n  ${skip} route(s) skipped for want of a fixture id — NOT covered.\n` +
      '  Set SMOKE_PROJECT_ID, SMOKE_FLOOR_ID, … to include them.',
  );
}

process.exit(fail > 0 ? 1 : 0);
