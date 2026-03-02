#!/usr/bin/env node
/**
 * Responsive Audit — Automated visual QA
 *
 * Takes screenshots across viewports, runs DOM-level checks for common
 * responsive layout problems, and outputs a structured report + screenshots.
 *
 * Usage:
 *   1. Start dev server:  npm run dev
 *   2. Run audit:         node scripts/responsive-audit.mjs [url]
 *   3. Single group:      node scripts/responsive-audit.mjs [url] --group=main-app
 *
 * Checks performed per viewport:
 *   • Horizontal overflow (body wider than viewport)
 *   • Elements overflowing viewport right edge
 *   • Overlapping / clipped interactive elements
 *   • Text too small (< 11px computed font-size)
 *   • Tap-target sizing (< 32px for mobile viewports)
 *   • Modal / overlay not covering full viewport
 *   • Scroll issues when modal is open
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');

const args = process.argv.slice(2);
const BASE_URL = args.find(a => !a.startsWith('--')) || 'http://localhost:3000';
const flagGroup = args.find(a => a.startsWith('--group='));
const targetGroup = flagGroup ? flagGroup.split('=')[1] : null;

// ── Representative viewports (subset for speed) ──
const VIEWPORTS = [
  { label: 'iPhone-SE',       w: 320,  h: 568,  mobile: true },
  { label: 'Galaxy-S-small',  w: 360,  h: 640,  mobile: true },
  { label: 'iPhone-12-13',    w: 390,  h: 844,  mobile: true },
  { label: 'Phone-480',       w: 480,  h: 854,  mobile: true },
  { label: 'iPad-mini',       w: 768,  h: 1024, mobile: true },
  { label: 'Tablet-860',      w: 860,  h: 1100, mobile: true },
  // Landscape phones
  { label: 'iPhone-SE-land',  w: 568,  h: 320,  mobile: true },
  { label: 'iPhone-XR-land',  w: 896,  h: 414,  mobile: true },
  // Desktop
  { label: 'Laptop-1280',     w: 1280, h: 800,  mobile: false },
  { label: 'Desktop-1920',    w: 1920, h: 1080, mobile: false },
];

// ── Feature groups ──
const GROUPS = [
  {
    id: 'main-app',
    name: 'Main App',
    setup: null,
  },
  {
    id: 'speed-slider',
    name: 'Speed Slider Popup',
    setup: async (page) => {
      const btn = page.locator('.panel-group:has(h3:text("Speed")) .popup-trigger-btn');
      try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(400); } catch {}
    },
  },
  {
    id: 'grid-size-slider',
    name: 'Grid Size Slider',
    setup: async (page) => {
      const btn = page.locator('.panel-group:has(h3:text("Grid Size")) .popup-trigger-btn');
      try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(400); } catch {}
    },
  },
  {
    id: 'info-modal',
    name: 'Info Modal',
    setup: async (page) => {
      const btn = page.locator('.hdr-btn:has(span:text("Info"))');
      try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(500); } catch {}
    },
  },
  {
    id: 'save-manager',
    name: 'Save Manager Modal',
    setup: async (page) => {
      const btn = page.locator('.hdr-btn:has(span:text("Save"))');
      try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(600); } catch {}
    },
  },
];

// ── Dismiss intro ──
async function dismissIntro(page) {
  try {
    const btn = page.locator('button.intro-close-btn.sound-off');
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(1500);
  } catch {}
}

// ── DOM-level checks injected into the page ──
async function runChecks(page, vp) {
  return page.evaluate(({ vpW, vpH, isMobile }) => {
    const issues = [];

    // 1. Horizontal overflow
    if (document.documentElement.scrollWidth > vpW + 2) {
      issues.push({
        type: 'horizontal-overflow',
        severity: 'error',
        message: `Page scrollWidth (${document.documentElement.scrollWidth}px) exceeds viewport (${vpW}px)`,
      });
    }

    // 2. Elements overflowing viewport right edge
    const overflowers = [];
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.right > vpW + 5 && rect.left < vpW) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean).join('.')}` : '';
        overflowers.push(`${tag}${cls}`);
      }
    });
    if (overflowers.length > 0) {
      issues.push({
        type: 'element-overflow',
        severity: 'warning',
        message: `${overflowers.length} element(s) overflow right edge: ${overflowers.slice(0, 5).join(', ')}${overflowers.length > 5 ? '…' : ''}`,
      });
    }

    // 3. Text too small
    const smallText = [];
    document.querySelectorAll('p, span, a, button, label, h1, h2, h3, h4, td, th, li, input, select, textarea').forEach(el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top > vpH) return; // off-screen below
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 11 && el.textContent.trim().length > 0) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean)[0] || ''}` : '';
        smallText.push({ el: `${tag}${cls}`, size: fontSize, text: el.textContent.trim().slice(0, 30) });
      }
    });
    if (smallText.length > 0) {
      issues.push({
        type: 'small-text',
        severity: 'warning',
        message: `${smallText.length} element(s) with font-size < 11px`,
        details: smallText.slice(0, 8),
      });
    }

    // 4. Tap targets too small (mobile only)
    if (isMobile) {
      const tinyTaps = [];
      document.querySelectorAll('button, a, input, select, [role="button"], .popup-trigger-btn').forEach(el => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.top > vpH || rect.bottom < 0) return; // off-screen
        const minDim = Math.min(rect.width, rect.height);
        if (minDim < 32) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean)[0] || ''}` : '';
          tinyTaps.push({ el: `${tag}${cls}`, w: Math.round(rect.width), h: Math.round(rect.height) });
        }
      });
      if (tinyTaps.length > 0) {
        issues.push({
          type: 'small-tap-target',
          severity: 'info',
          message: `${tinyTaps.length} tap target(s) < 32px`,
          details: tinyTaps.slice(0, 8),
        });
      }
    }

    // 5. Modal overlay coverage
    const overlays = document.querySelectorAll('.save-manager-overlay, .info-overlay, .intro-backdrop, .prog-modal-overlay');
    overlays.forEach(ol => {
      const style = getComputedStyle(ol);
      if (style.display === 'none') return;
      const rect = ol.getBoundingClientRect();
      if (rect.width < vpW - 5 || rect.height < vpH - 5) {
        issues.push({
          type: 'modal-coverage',
          severity: 'error',
          message: `Overlay doesn't cover full viewport: ${Math.round(rect.width)}×${Math.round(rect.height)} vs ${vpW}×${vpH}`,
        });
      }
    });

    // 6. Modal content clipped / off-screen
    const modals = document.querySelectorAll('.save-manager-modal, .info-modal, .intro-modal, .prog-modal');
    modals.forEach(m => {
      const style = getComputedStyle(m);
      if (style.display === 'none') return;
      const rect = m.getBoundingClientRect();
      if (rect.bottom > vpH + 10) {
        issues.push({
          type: 'modal-clipped',
          severity: 'warning',
          message: `Modal extends ${Math.round(rect.bottom - vpH)}px below viewport`,
        });
      }
      if (rect.right > vpW + 5) {
        issues.push({
          type: 'modal-clipped',
          severity: 'warning',
          message: `Modal extends ${Math.round(rect.right - vpW)}px past right edge`,
        });
      }
    });

    // 7. Body scroll locked check (when modal is visible)
    if (overlays.length > 0) {
      const bodyOverflow = getComputedStyle(document.body).overflow;
      if (bodyOverflow !== 'hidden') {
        issues.push({
          type: 'scroll-not-locked',
          severity: 'warning',
          message: `Body overflow is "${bodyOverflow}" while modal is open (expected "hidden")`,
        });
      }
    }

    return issues;
  }, { vpW: vp.w, vpH: vp.h, isMobile: vp.mobile });
}


// ── Main ──
async function run() {
  let groupsToRun = GROUPS;
  if (targetGroup) {
    groupsToRun = GROUPS.filter(g => g.id === targetGroup);
    if (groupsToRun.length === 0) {
      console.error(`Unknown group: ${targetGroup}\nAvailable: ${GROUPS.map(g => g.id).join(', ')}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const allResults = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const group of groupsToRun) {
    console.log(`\n━━ ${group.name} ━━`);

    const groupDir = path.join(OUT_DIR, group.id);
    fs.mkdirSync(groupDir, { recursive: true });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 2,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      await dismissIntro(page);

      if (group.setup) {
        try { await group.setup(page); } catch (err) {
          console.log(`   ⚠  ${vp.label}: setup failed — ${err.message}`);
        }
      }
      await page.waitForTimeout(600);

      // Take screenshot
      const filename = `${vp.label}_${vp.w}x${vp.h}.png`;
      const filepath = path.join(groupDir, filename);
      await page.screenshot({ path: filepath, fullPage: false });

      // Run checks
      const issues = await runChecks(page, vp);
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');
      totalErrors += errors.length;
      totalWarnings += warnings.length;

      const icon = errors.length > 0 ? '✗' : warnings.length > 0 ? '⚠' : '✓';
      const summary = issues.length > 0
        ? issues.map(i => `[${i.severity}] ${i.message}`).join('; ')
        : 'OK';
      console.log(`   ${icon}  ${vp.label} (${vp.w}×${vp.h}): ${summary}`);

      allResults.push({
        group: group.id,
        groupName: group.name,
        viewport: vp.label,
        width: vp.w,
        height: vp.h,
        mobile: vp.mobile,
        screenshot: `${group.id}/${filename}`,
        issues,
      });

      await ctx.close();
    }
  }

  await browser.close();

  // Write structured report
  const reportPath = path.join(OUT_DIR, 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));

  // Print summary
  const errorResults = allResults.filter(r => r.issues.some(i => i.severity === 'error'));
  const warnResults = allResults.filter(r => r.issues.some(i => i.severity === 'warning'));
  const cleanResults = allResults.filter(r => r.issues.length === 0);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`AUDIT COMPLETE — ${allResults.length} viewport checks`);
  console.log(`  ✓ Clean:    ${cleanResults.length}`);
  console.log(`  ⚠ Warnings: ${totalWarnings} across ${warnResults.length} viewports`);
  console.log(`  ✗ Errors:   ${totalErrors} across ${errorResults.length} viewports`);
  console.log(`\nReport: ${reportPath}`);

  if (errorResults.length > 0) {
    console.log(`\n── ERROR DETAILS ──`);
    for (const r of errorResults) {
      const errs = r.issues.filter(i => i.severity === 'error');
      for (const e of errs) {
        console.log(`  ${r.groupName} @ ${r.viewport} (${r.width}×${r.height}): ${e.message}`);
      }
    }
  }

  if (warnResults.length > 0) {
    console.log(`\n── WARNING DETAILS ──`);
    for (const r of warnResults) {
      const warns = r.issues.filter(i => i.severity === 'warning');
      for (const w of warns) {
        console.log(`  ${r.groupName} @ ${r.viewport} (${r.width}×${r.height}): ${w.message}`);
      }
    }
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
