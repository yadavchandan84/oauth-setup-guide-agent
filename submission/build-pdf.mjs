// build-pdf.mjs — builds submission/Composio_OAuth_Guide_Agent_Submission.pdf
// ESM, Node 22. All paths are anchored to this script's folder, never the cwd.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const DRAFT = process.argv.includes('--draft');

const OUT_PDF = path.join(here, 'Composio_OAuth_Guide_Agent_Submission.pdf');
const TMP_HTML = path.join(here, '.tmp', 'submission.html');
const CONTENT_DIR = path.join(here, 'content');
const ASSETS_DIR = path.join(here, 'assets');
const SCREENSHOTS_DIR = path.join(here, 'screenshots');
const GUIDES_DIR = path.join(repoRoot, 'shared', 'guides');
const LINK_REPORT = path.join(repoRoot, 'shared', 'link-check-report.json');
const CONFIG_PATH = path.join(here, 'links.config.json');

const REQUIRED = [
  'sec-title', 'sec-01-problem', 'sec-02-scope', 'sec-03-how-it-works', 'sec-04-guide-format',
  'sec-05-samples', 'sec-06-live-agent', 'sec-07-use-of-agents', 'sec-08-evidence-log',
  'sec-09-limitations', 'sec-10-future', 'sec-11-screenshots',
];

const SCREENSHOT_CAPTIONS = {
  '01-landing.jpg': 'Landing page with the 3D hero.',
  '02-library.jpg': 'Curated guide library.',
  '03-guide-github.jpg': 'GitHub guide detail (Easy, no review).',
  '04-guide-google.jpg': 'Google Workspace guide (Very Hard, verification + security assessment).',
  '05-guide-shopify-timeline.jpg': 'Shopify guide approval timeline.',
  '06-about.jpg': 'About page explaining evidence levels.',
  '07-generate-idle.jpg': 'Live generation form, idle state.',
  '08-generate-streaming.jpg': 'Live generation streaming progress.',
  '09-generate-result.jpg': 'Live-generated guide result.',
};

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn(m); };
const fail = (m) => { console.error(`\u2716 ${m}`); process.exit(1); };

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---- config ----
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
for (const [k, v] of Object.entries(config)) {
  if (typeof v === 'string' && v.includes('YOUR-')) {
    warn(`\u26a0 links.config.json: ${k} is still a placeholder`);
  }
}
const submissionDate = config.SUBMISSION_DATE
  ? config.SUBMISSION_DATE
  : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Inline config tokens replaced BEFORE marked (HTML-escaped).
const INLINE_TOKENS = {
  VERCEL_URL: config.VERCEL_URL,
  RENDER_URL: config.RENDER_URL,
  REPO_URL: config.REPO_URL,
  CANDIDATE_EMAIL: config.CANDIDATE_EMAIL,
  SUBMISSION_DATE: submissionDate,
};

// Block tokens replaced AFTER marked (raw HTML swapped into <p>{{KEY}}</p> wrappers).
const BLOCK_TOKEN_NAMES = ['ARCHITECTURE_SVG', 'SAMPLE_GUIDES', 'LINK_CHECK_TABLE', 'SCREENSHOTS'];

// ---- phase 1 helpers ----
function replaceInlineTokens(md) {
  return md.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (BLOCK_TOKEN_NAMES.includes(key)) return match; // defer to phase 2
    if (key in INLINE_TOKENS) return escapeHtml(INLINE_TOKENS[key] ?? '');
    return match;
  });
}

// ---- block builders (phase 2) ----
function buildArchitectureSvg() {
  const svg = fs.readFileSync(path.join(ASSETS_DIR, 'architecture.svg'), 'utf8');
  return `<div class="arch-wrap">${svg}</div>`;
}

const ACTOR_LABEL = { agent: 'Agent can do', human: 'You must do', assist: 'Agent can assist' };
const actorTag = (a) => `<span class="tag tag-${escapeHtml(a)}">${escapeHtml(ACTOR_LABEL[a] ?? a)}</span>`;
const dur = (d) => (d.min === 0 && d.max === 0 ? 'none' : `${d.min}\u2013${d.max} ${escapeHtml(d.unit)}`);

function buildSampleGuides() {
  const slugs = ['github', 'google-workspace', 'shopify'];
  const guides = slugs.map((s) => JSON.parse(fs.readFileSync(path.join(GUIDES_DIR, `${s}.json`), 'utf8')));

  let html = '<table><thead><tr><th>App</th><th>Difficulty</th><th>Hands-on</th><th>Approval wait</th><th>Review</th></tr></thead><tbody>';
  for (const g of guides) {
    const reviewTypes = g.review.required ? g.review.types.join(', ') : 'none';
    html += `<tr><td>${escapeHtml(g.app.name)}</td><td>${escapeHtml(g.difficulty.level)}</td>`
      + `<td>${dur(g.timeEstimate.handsOn)}</td><td>${dur(g.timeEstimate.approvalWait)}</td>`
      + `<td>${escapeHtml(reviewTypes)}</td></tr>`;
  }
  html += '</tbody></table>';

  for (const g of guides) {
    html += `<h3>${escapeHtml(g.app.name)} \u2014 ${escapeHtml(g.difficulty.level)}</h3>`;
    html += `<p>${escapeHtml(g.summary)}</p>`;

    html += '<p><strong>First steps</strong></p><ol class="steps-list">';
    for (const step of g.steps.slice(0, 4)) {
      html += `<li>${escapeHtml(step.title)} ${actorTag(step.actor)}</li>`;
    }
    html += '</ol>';

    if (g.blockers.length > 0) {
      html += '<p><strong>Top blockers</strong></p><ul>';
      for (const b of g.blockers.slice(0, 2)) {
        html += `<li><em>${escapeHtml(b.title)}</em> \u2014 ${escapeHtml(b.resolution)}</li>`;
      }
      html += '</ul>';
    }

    html += '<p><strong>Agent / human split</strong></p><ul>';
    for (const a of g.agentHandoff.agentCan.slice(0, 2)) html += `<li>${actorTag('agent')} ${escapeHtml(a)}</li>`;
    for (const h of g.agentHandoff.humanMust.slice(0, 2)) html += `<li>${actorTag('human')} ${escapeHtml(h)}</li>`;
    html += '</ul>';

    html += '<p><strong>Sources</strong></p><ul>';
    for (const src of g.verification.sources) {
      html += `<li><a href="${escapeHtml(src.url)}">${escapeHtml(src.title)}</a> (${escapeHtml(src.kind)})</li>`;
    }
    html += '</ul>';
  }
  return html;
}

function buildLinkCheckTable() {
  const report = JSON.parse(fs.readFileSync(LINK_REPORT, 'utf8'));
  const results = report.results ?? [];
  const counts = { ok: 0, redirected: 0, blocked: 0, broken: 0 };
  for (const r of results) if (r.status in counts) counts[r.status]++;

  if (counts.broken > 0 || counts.redirected > 0) {
    warn(`\u26a0 link-check: ${counts.broken} broken, ${counts.redirected} redirected URL(s)`);
    if (counts.broken > 0 && !DRAFT) fail('link-check report has broken URLs; re-run check-links or pass --draft');
  }

  let html = '<table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>';
  html += `<tr><td><span class="count-ok">ok</span></td><td>${counts.ok}</td></tr>`;
  html += `<tr><td><span class="count-warn">redirected</span></td><td>${counts.redirected}</td></tr>`;
  html += `<tr><td>blocked</td><td>${counts.blocked}</td></tr>`;
  html += `<tr><td><span class="count-bad">broken</span></td><td>${counts.broken}</td></tr>`;
  html += '</tbody></table>';

  const notable = results.filter((r) => r.status === 'blocked' || r.status === 'redirected');
  if (notable.length > 0) {
    html += '<p><strong>Redirected / blocked URLs (manually checked, reachable):</strong></p><table>'
      + '<thead><tr><th>URL</th><th>Status</th><th>Final URL</th></tr></thead><tbody>';
    for (const r of notable) {
      html += `<tr><td>${escapeHtml(r.url)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.finalUrl ?? '')}</td></tr>`;
    }
    html += '</tbody></table>';
  }
  return html;
}

function buildScreenshots() {
  let files = [];
  if (fs.existsSync(SCREENSHOTS_DIR)) {
    files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => /\.jpe?g$/i.test(f)).sort();
  }
  if (files.length < 4) {
    warn(`\u26a0 only ${files.length} screenshot(s) found (expected >=4)`);
    if (!DRAFT) fail('fewer than 4 screenshots; run `npm run screenshots` or pass --draft');
  }
  if (files.length === 0) return '<p><em>No screenshots captured.</em></p>';

  let html = '';
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(SCREENSHOTS_DIR, f)).toString('base64');
    const caption = SCREENSHOT_CAPTIONS[f] ?? f;
    html += `<figure><img src="data:image/jpeg;base64,${b64}" alt="${escapeHtml(caption)}">`
      + `<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  }
  return html;
}

// ---- assemble document ----
function buildTitleSection() {
  const links = [];
  if (INLINE_TOKENS.VERCEL_URL) links.push(`<div>App: <a href="${escapeHtml(INLINE_TOKENS.VERCEL_URL)}">${escapeHtml(INLINE_TOKENS.VERCEL_URL)}</a></div>`);
  if (INLINE_TOKENS.RENDER_URL) links.push(`<div>API health: <a href="${escapeHtml(INLINE_TOKENS.RENDER_URL)}/api/health">${escapeHtml(INLINE_TOKENS.RENDER_URL)}/api/health</a></div>`);
  if (INLINE_TOKENS.REPO_URL) links.push(`<div>Repo: <a href="${escapeHtml(INLINE_TOKENS.REPO_URL)}">${escapeHtml(INLINE_TOKENS.REPO_URL)}</a></div>`);
  return `<section id="sec-title" class="pdf-section">
    <h1>OAuth Approval Guide Agent</h1>
    <div class="subtitle">APM Integrations Take-home, Product Intern</div>
    <div class="meta">
      <div>${escapeHtml(INLINE_TOKENS.CANDIDATE_EMAIL ?? '')}</div>
      <div>${escapeHtml(submissionDate)}</div>
      ${links.join('\n      ')}
    </div>
  </section>`;
}

function renderContentFile(file) {
  const stem = file.replace(/\.md$/, '');
  const md = replaceInlineTokens(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));
  const inner = marked.parse(md, { async: false });
  return `<section id="sec-${stem}" class="pdf-section">${inner}</section>`;
}

function buildHtml() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md')).sort();
  const sections = [buildTitleSection(), ...files.map(renderContentFile)].join('\n');

  // Phase 2: swap block tokens that marked wrapped in <p>{{KEY}}</p>.
  const blocks = {
    ARCHITECTURE_SVG: buildArchitectureSvg(),
    SAMPLE_GUIDES: buildSampleGuides(),
    LINK_CHECK_TABLE: buildLinkCheckTable(),
    SCREENSHOTS: buildScreenshots(),
  };
  let body = sections;
  for (const key of BLOCK_TOKEN_NAMES) {
    const wrapRe = new RegExp(`<p>\\s*\\{\\{${key}\\}\\}\\s*</p>`, 'g');
    body = body.replace(wrapRe, () => blocks[key]);
    // also handle a bare token (not paragraph-wrapped) just in case
    body = body.replaceAll(`{{${key}}}`, blocks[key]);
  }

  const css = fs.readFileSync(path.join(ASSETS_DIR, 'pdf.css'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>OAuth Approval Guide Agent — Submission</title>
<style>${css}</style></head><body>${body}</body></html>`;
}

// ---- guards ----
function runGuards(html) {
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) fail(`unreplaced token(s) remain: ${[...new Set(leftover)].join(', ')}`);

  for (const bad of ['&lt;svg', '&lt;table', '&lt;figure']) {
    if (html.includes(bad)) fail(`escaped block HTML found (${bad}) — a block token was escaped instead of raw-injected`);
  }

  const archIdx = html.indexOf('id="sec-03-how-it-works"');
  if (archIdx === -1) fail('architecture section sec-03-how-it-works missing');
  const archEnd = html.indexOf('</section>', archIdx);
  const archBlock = html.slice(archIdx, archEnd === -1 ? undefined : archEnd);
  if (!archBlock.includes('<svg')) fail('architecture section is missing an <svg element');
  if (!archBlock.includes('</svg>')) fail('architecture section is missing a closing </svg>');

  for (const id of REQUIRED) {
    if (!html.includes(`id="${id}"`)) fail(`required section id missing: ${id}`);
  }

  // Loom-absence NIT: strip base64 image data BEFORE scanning so image bytes
  // can't trip the match, and Zoom's "Video" category can't either (word boundary).
  const scan = html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '');
  if (/\bloom\b/i.test(scan)) fail('the document mentions "loom" — no video/Loom content is allowed');
}

// ---- puppeteer render with Chrome/Edge fallback + EBUSY retry ----
const EXE_FALLBACKS = [
  'C\u003a\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C\u003a\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C\u003a\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function launchBrowser() {
  const base = { headless: true, args: ['--no-sandbox'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return puppeteer.launch({ ...base, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  }
  try {
    return await puppeteer.launch(base);
  } catch (err) {
    if (!/Could not find Chrome|Failed to launch|executable/i.test(String(err?.message))) throw err;
    const exe = EXE_FALLBACKS.find((p) => fs.existsSync(p));
    if (!exe) {
      fail('Could not find Chrome. Run `npx puppeteer browsers install chrome` or set PUPPETEER_EXECUTABLE_PATH.');
    }
    return puppeteer.launch({ ...base, executablePath: exe });
  }
}

async function renderPdf(html) {
  fs.mkdirSync(path.dirname(TMP_HTML), { recursive: true });
  fs.writeFileSync(TMP_HTML, html, 'utf8');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMediaType('print');
    const pdfOpts = {
      path: OUT_PDF, format: 'A4', printBackground: true,
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666">'
        + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    };
    try {
      await page.pdf(pdfOpts);
    } catch (err) {
      if (String(err?.code) === 'EBUSY' || /EBUSY/.test(String(err?.message))) {
        await new Promise((r) => setTimeout(r, 1500));
        await page.pdf(pdfOpts);
      } else {
        throw err;
      }
    }
  } finally {
    await browser.close();
  }
}

// ---- main ----
async function main() {
  const html = buildHtml();
  runGuards(html);
  await renderPdf(html);

  const sizeBytes = fs.statSync(OUT_PDF).size;
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb >= 10) fail(`PDF is ${sizeMb.toFixed(2)} MB (>= 10 MB limit)`);

  console.log(`\u2713 ${DRAFT ? '[draft] ' : ''}wrote ${OUT_PDF} (${sizeMb.toFixed(2)} MB)`);
  if (warnings.length > 0) console.log(`  (${warnings.length} warning(s) above)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
