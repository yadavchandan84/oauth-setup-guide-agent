// capture-screenshots.mjs — captures app screenshots into submission/screenshots/.
// ESM, Node 22. Run against a `vite preview` (default http://localhost:4173).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, 'screenshots');

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/+$/, '');
const API_URL = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const CAPTURE_LIVE = process.env.CAPTURE_LIVE === '1';

const EXE_FALLBACKS = [
  'C\u003a\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C\u003a\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C\u003a\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const fail = (m) => { console.error(`\u2716 ${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function preflight() {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
  } catch {
    fail(`No app at ${BASE_URL}. Start \`npm --prefix frontend run build\` and then `
      + `\`npm --prefix frontend run preview\` in another terminal first, or set BASE_URL to the deployed Vercel URL.`);
  }
  if (CAPTURE_LIVE) {
    try {
      const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await res.json();
      if (!body.llmConfigured || !body.searchConfigured) {
        fail(`${API_URL} is up but not keyed (llmConfigured/searchConfigured false). Unset CAPTURE_LIVE or configure keys.`);
      }
    } catch {
      fail(`No keyed backend at ${API_URL}/api/health. Unset CAPTURE_LIVE or start a keyed backend.`);
    }
  }
}

async function launchBrowser() {
  const base = {
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return puppeteer.launch({ ...base, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  }
  try {
    return await puppeteer.launch(base);
  } catch (err) {
    if (!/Could not find Chrome|Failed to launch|executable/i.test(String(err?.message))) throw err;
    const exe = EXE_FALLBACKS.find((p) => fs.existsSync(p));
    if (!exe) fail('Could not find Chrome. Run `npx puppeteer browsers install chrome` or set PUPPETEER_EXECUTABLE_PATH.');
    return puppeteer.launch({ ...base, executablePath: exe });
  }
}

async function main() {
  await preflight();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  let currentPage;
  const shot = async (name, opts = {}) => {
    const file = path.join(OUT_DIR, name);
    await currentPage.screenshot({ path: file, type: 'jpeg', quality: 82, ...opts });
    console.log(`\u2713 ${name}`);
  };

  let webglSeen = false;
  try {
    currentPage = await browser.newPage();
    await currentPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const goto = async (route) => {
      await currentPage.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
    };

    // 01 landing — wait for canvas or fallback, plus settle time.
    await goto('/');
    await currentPage.waitForSelector('canvas, [data-hero-fallback]', { timeout: 15000 }).catch(() => {});
    const hasCanvas = (await currentPage.$('canvas')) !== null;
    webglSeen = webglSeen || hasCanvas;
    await sleep(2500);
    await shot('01-landing.jpg');

    await goto('/library');
    await sleep(600);
    await shot('02-library.jpg');

    await goto('/guides/github');
    await sleep(600);
    await shot('03-guide-github.jpg');

    await goto('/guides/google-workspace');
    await sleep(600);
    await shot('04-guide-google.jpg', { fullPage: true, clip: undefined });

    await goto('/guides/shopify');
    await sleep(400);
    await currentPage.evaluate(() => {
      const el = Array.from(document.querySelectorAll('*')).find((n) => /timeline/i.test(n.className || ''));
      (el ?? document.body).scrollIntoView({ block: 'center' });
    }).catch(() => {});
    await sleep(500);
    await shot('05-guide-shopify-timeline.jpg');

    await goto('/about');
    await sleep(500);
    await shot('06-about.jpg');

    await goto('/generate');
    await sleep(600);
    await shot('07-generate-idle.jpg');

    if (CAPTURE_LIVE) {
      const input = await currentPage.$('input[type="text"], input:not([type])');
      if (input) {
        await input.type('Asana');
        const btn = await currentPage.$x("//button[contains(., 'Generate')]").then((b) => b[0]).catch(() => null);
        if (btn) {
          await btn.click();
          await sleep(6000);
          await shot('08-generate-streaming.jpg');
          await currentPage.waitForSelector('[data-guide-view], article', { timeout: 120000 }).catch(() => {});
          await sleep(1000);
          await shot('09-generate-result.jpg');
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(webglSeen ? '  WebGL canvas was present (3D hero rendered).' : '  No WebGL canvas detected (static fallback shown).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
