// scripts/check-links.mjs — checks every URL cited by the curated guides.
// Zero dependencies (Node 22 global fetch). NOT part of `npm test` (needs network).
// Writes shared/link-check-report.json and exits 1 on any broken or missing URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(repoRoot, 'shared', 'guides');
const reportPath = path.join(repoRoot, 'shared', 'link-check-report.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CONCURRENCY = 4;
const TIMEOUT_MS = 15_000;

// ---- Collect URLs across all guides, deduped, keeping the citing guides. ----
function collectUrls() {
  const map = new Map(); // url -> Set<slug>
  if (!fs.existsSync(guidesDir)) return map;
  const files = fs.readdirSync(guidesDir).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const guide = JSON.parse(fs.readFileSync(path.join(guidesDir, file), 'utf8'));
    const slug = guide?.slug ?? file.replace(/\.json$/, '');
    const add = (url) => {
      if (typeof url !== 'string' || url.length === 0) return;
      if (!map.has(url)) map.set(url, new Set());
      map.get(url).add(slug);
    };
    for (const s of guide?.verification?.sources ?? []) add(s?.url);
    for (const step of guide?.steps ?? []) add(step?.consoleUrl);
    add(guide?.app?.website);
  }
  return map;
}

// ---- URL normalization for redirect comparison. ----
const DROP_PARAMS = ['hl', 'language', 'visit_id', 'rd'];
function normalize(u) {
  const url = new URL(u);
  url.hash = '';
  url.host = url.host.toLowerCase();
  for (const p of DROP_PARAMS) url.searchParams.delete(p);
  url.searchParams.sort();
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  url.pathname = pathname;
  return url.toString();
}

// ---- Classification order: blocked -> broken -> redirected -> ok. ----
function classifyResponse(url, httpStatus, finalUrl) {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429)
    return { url, status: 'blocked', httpStatus, finalUrl };
  if (httpStatus < 200 || httpStatus >= 300)
    return { url, status: 'broken', httpStatus, finalUrl };
  let changed = false;
  try {
    changed = normalize(finalUrl) !== normalize(url);
  } catch {
    changed = false;
  }
  if (changed) return { url, status: 'redirected', httpStatus, finalUrl };
  return { url, status: 'ok', httpStatus, finalUrl };
}

async function checkOne(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS); // ref'd: keeps the event loop alive
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': UA } });
    res.body?.cancel().catch(() => {}); // don't download bodies
    return classifyResponse(url, res.status, res.url);
  } catch (err) {
    return {
      url,
      status: 'broken',
      httpStatus: null,
      finalUrl: null,
      error: ac.signal.aborted ? 'timeout after 15s' : String(err?.cause?.code ?? err?.message ?? err),
    };
  } finally {
    clearTimeout(t);
  }
}

// ---- Concurrency-4 worker pool over the URL list. ----
async function runPool(urls) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results.push(await checkOne(urls[i]));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}

async function main() {
  const map = collectUrls();
  const urls = [...map.keys()];

  const raw = await runPool(urls);

  // Attach citing guides (sorted) to each result.
  const results = raw.map((r) => ({
    url: r.url,
    guides: [...(map.get(r.url) ?? [])].sort(),
    status: r.status,
    httpStatus: r.httpStatus,
    finalUrl: r.finalUrl ?? null,
    ...(r.error ? { error: r.error } : {}),
  }));

  // Guard: no URL may silently drop out of the report.
  if (results.length !== urls.length) {
    const seen = new Set(results.map((r) => r.url));
    const missing = urls.filter((u) => !seen.has(u));
    console.error(`Missing ${missing.length} URL(s) from results:`);
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }

  results.sort((a, b) => a.url.localeCompare(b.url));

  fs.writeFileSync(reportPath, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n');

  // Print a table + per-status counts.
  const counts = { ok: 0, redirected: 0, blocked: 0, broken: 0 };
  for (const r of results) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    const note =
      r.status === 'redirected' ? ` update to ${r.finalUrl}` : r.error ? ` ${r.error}` : '';
    console.log(`${r.status.padEnd(10)} ${String(r.httpStatus ?? '-').padEnd(4)} ${r.url}${note}`);
  }
  console.log(
    `\n${results.length} URL(s): ok=${counts.ok} redirected=${counts.redirected} blocked=${counts.blocked} broken=${counts.broken}`
  );

  if (counts.broken > 0) {
    console.error(`\n${counts.broken} broken URL(s) — failing.`);
    process.exit(1);
  }
  process.exit(0);
}

main();
