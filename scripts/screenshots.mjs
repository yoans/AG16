#!/usr/bin/env node
/**
 * Responsive Screenshot Tool — Feature Tree Edition
 *
 * Takes screenshots organized by feature groups across all viewport sizes.
 * Each group triggers a specific UI state before capturing.
 *
 * Usage:
 *   1. Start dev server:  npm run dev
 *   2. Run all groups:    node scripts/screenshots.mjs [url]
 *   3. Run one group:     node scripts/screenshots.mjs [url] --group=intro-modal
 *   4. Recheck all:       node scripts/screenshots.mjs [url] --all
 *   5. Skip good groups:  node scripts/screenshots.mjs [url] --skip-good
 *
 * Available groups:
 *   intro-modal, main-app, speed-slider, grid-size-slider,
 *   more-controls, info-modal, privacy-policy
 *
 * Output: screenshots/<group>/  with review.html generated in screenshots/
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const GRADES_FILE = path.join(OUT_DIR, 'grades.json');

const args = process.argv.slice(2);
const BASE_URL = args.find(a => !a.startsWith('--')) || 'http://localhost:3000';
const flagAll = args.includes('--all');
const flagSkipGood = args.includes('--skip-good');
const flagGroup = args.find(a => a.startsWith('--group='));
const targetGroup = flagGroup ? flagGroup.split('=')[1] : null;

// ── Viewport catalogue ──────────────────────────────────────────────
const VIEWPORTS = [
  // Portrait / narrow
  { label: 'iPhone-SE',         w:  320, h:  568, note: '≤360' },
  { label: 'Galaxy-S-small',    w:  360, h:  640, note: '≤360 boundary' },
  { label: 'iPhone-6-7-8',      w:  375, h:  667, note: '361–480' },
  { label: 'iPhone-12-13',      w:  390, h:  844, note: '361–480' },
  { label: 'iPhone-XR-11',      w:  414, h:  896, note: '361–480' },
  { label: 'Phone-480',         w:  480, h:  854, note: '≤480 boundary' },
  { label: 'Phablet-540',       w:  540, h:  720, note: '481–600' },
  { label: 'Phone-600',         w:  600, h:  960, note: '≤600 boundary' },
  { label: 'iPad-mini',         w:  768, h: 1024, note: '601–860 tablet' },
  { label: 'iPad-Air',          w:  810, h: 1080, note: '601–860 tablet' },
  { label: 'Tablet-860',        w:  860, h: 1100, note: '≤860 boundary' },
  // Landscape
  { label: 'iPhone-SE-land',    w:  568, h:  320, note: 'landscape ≤500h' },
  { label: 'iPhone-8-land',     w:  667, h:  375, note: 'landscape ≤500h' },
  { label: 'iPhone-XR-land',    w:  896, h:  414, note: 'landscape ≤500h' },
  { label: 'iPad-land',         w: 1024, h:  768, note: '≥861 landscape' },
  // Desktop
  { label: 'Laptop-1280',       w: 1280, h:  800, note: '≥861 desktop' },
  { label: 'Laptop-1440',       w: 1440, h:  900, note: '≥861 desktop' },
  { label: 'Desktop-1920',      w: 1920, h: 1080, note: '≥861 desktop' },
];

// ── Feature groups ──────────────────────────────────────────────────
const GROUPS = [
  {
    id: 'intro-modal',
    name: 'Intro Modal',
    description: 'The first-time welcome modal with sound choices',
    beforeDismiss: true,
    setup: null,
  },
  {
    id: 'main-app',
    name: 'Main App',
    description: 'Default view after dismissing intro',
    beforeDismiss: false,
    setup: null,
  },
  {
    id: 'speed-slider',
    name: 'Speed Slider',
    description: 'Popup slider for adjusting speed (BPM)',
    beforeDismiss: false,
    setup: async (page) => {
      const btn = page.locator('.panel-group:has(h3:text("Speed")) .popup-trigger-btn');
      await btn.click();
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'grid-size-slider',
    name: 'Grid Size Slider',
    description: 'Popup slider for adjusting grid dimensions',
    beforeDismiss: false,
    setup: async (page) => {
      const btn = page.locator('.panel-group:has(h3:text("Grid Size")) .popup-trigger-btn');
      await btn.click();
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'more-controls',
    name: 'More Controls (Landscape)',
    description: 'Landscape drawer opened via "More Controls" toggle',
    beforeDismiss: false,
    viewportFilter: (vp) => vp.h <= 500,
    setup: async (page) => {
      try {
        const toggle = page.locator('.landscape-drawer-toggle');
        await toggle.waitFor({ state: 'visible', timeout: 3000 });
        await toggle.click();
        await page.waitForTimeout(500);
      } catch {
        // Toggle not visible at this viewport
      }
    },
  },
  {
    id: 'info-modal',
    name: 'Info / About Modal',
    description: 'The "About AG16" info modal',
    beforeDismiss: false,
    setup: async (page) => {
      const btn = page.locator('.hdr-btn:has(span:text("Info"))');
      await btn.click();
      await page.waitForTimeout(500);
    },
  },
  {
    id: 'privacy-policy',
    name: 'Privacy Policy',
    description: 'Privacy Policy modal via footer link',
    beforeDismiss: false,
    setup: async (page) => {
      const link = page.locator('a.footer-privacy');
      try {
        await link.scrollIntoViewIfNeeded({ timeout: 3000 });
        await link.click({ timeout: 3000 });
        await page.waitForTimeout(500);
      } catch {
        // Footer hidden in landscape — skip gracefully
      }
    },
  },
];

// ── Grades persistence ──────────────────────────────────────────────
function loadGrades() {
  try {
    if (fs.existsSync(GRADES_FILE)) return JSON.parse(fs.readFileSync(GRADES_FILE, 'utf-8'));
  } catch {}
  return {};
}

function isGroupAllGood(grades, groupId) {
  const g = grades[groupId];
  if (!g || typeof g !== 'object') return false;
  const entries = Object.values(g);
  return entries.length > 0 && entries.every(e => e.grade === 'good');
}

// ── Dismiss intro ───────────────────────────────────────────────────
async function dismissIntro(page) {
  try {
    const btn = page.locator('button.intro-close-btn.sound-off');
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(1500);
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────
async function run() {
  const grades = loadGrades();

  // Determine which groups to run
  let groupsToRun = GROUPS;
  if (targetGroup) {
    groupsToRun = GROUPS.filter(g => g.id === targetGroup);
    if (groupsToRun.length === 0) {
      console.error(`Unknown group: ${targetGroup}`);
      console.error(`Available: ${GROUPS.map(g => g.id).join(', ')}`);
      process.exit(1);
    }
  } else if (flagSkipGood && !flagAll) {
    const skipped = [];
    groupsToRun = GROUPS.filter(g => {
      if (isGroupAllGood(grades, g.id)) { skipped.push(g.id); return false; }
      return true;
    });
    if (skipped.length) console.log(`Skipping (all good): ${skipped.join(', ')}\n`);
  }

  if (groupsToRun.length === 0) {
    console.log('All groups marked good! Use --all to recheck everything.');
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const manifest = {};

  // Load existing manifest to preserve groups we're not re-running
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try { Object.assign(manifest, JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))); } catch {}
  }

  for (const group of groupsToRun) {
    console.log(`\n── ${group.name} ──`);

    const groupDir = path.join(OUT_DIR, group.id);
    if (fs.existsSync(groupDir)) {
      for (const f of fs.readdirSync(groupDir)) {
        if (f.endsWith('.png')) fs.unlinkSync(path.join(groupDir, f));
      }
    } else {
      fs.mkdirSync(groupDir, { recursive: true });
    }

    const screenshots = [];
    const viewports = group.viewportFilter ? VIEWPORTS.filter(group.viewportFilter) : VIEWPORTS;

    for (const vp of viewports) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 2,
        isMobile: vp.w < 860,
        hasTouch: vp.w < 860,
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      const filename = `${vp.label}_${vp.w}x${vp.h}.png`;
      const filepath = path.join(groupDir, filename);

      if (group.beforeDismiss) {
        // Screenshot with intro modal visible
        try {
          await page.locator('button.intro-close-btn.sound-off').waitFor({ state: 'visible', timeout: 5000 });
        } catch {}
        await page.waitForTimeout(500);
        await page.screenshot({ path: filepath, fullPage: true });
      } else {
        await dismissIntro(page);
        if (group.setup) {
          try {
            await group.setup(page);
          } catch (err) {
            console.log(`   ⚠  ${vp.label}: setup failed (${err.message})`);
          }
        }
        await page.waitForTimeout(800);
        await page.screenshot({ path: filepath, fullPage: true });
      }

      console.log(`   ✓  ${filename}`);
      screenshots.push({
        label: vp.label,
        width: vp.w,
        height: vp.h,
        note: vp.note,
        file: `${group.id}/${filename}`,
      });

      await ctx.close();
    }

    manifest[group.id] = {
      id: group.id,
      name: group.name,
      description: group.description,
      screenshots,
    };
  }

  // Write manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Generate self-contained review.html
  const templatePath = path.join(__dirname, 'review.html');
  if (fs.existsSync(templatePath)) {
    let html = fs.readFileSync(templatePath, 'utf-8');
    const inlineScript = `\n// ── Inlined manifest (auto-generated) ──\nconst __INLINE_MANIFEST__ = ${JSON.stringify(manifest)};\n`;
    html = html.replace(
      /const MANIFEST_PATH = [^;]+;/,
      inlineScript
    );
    html = html.replace(
      /\/\/ ── Init ──[\s\S]*?(?=<\/script>)/,
      `// ── Init ──\nload();\ninitFromManifest(__INLINE_MANIFEST__);\n`
    );
    html = html.replace(/\.\.\/screenshots\//g, './');
    fs.writeFileSync(path.join(OUT_DIR, 'review.html'), html);
  }

  // Also save grades.json shell for --skip-good to use
  if (!fs.existsSync(GRADES_FILE)) {
    fs.writeFileSync(GRADES_FILE, '{}');
  }

  await browser.close();

  const total = Object.values(manifest).reduce((n, g) => n + g.screenshots.length, 0);
  console.log(`\nDone – ${total} screenshots across ${Object.keys(manifest).length} groups.`);
  console.log('Open screenshots/review.html to review.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
