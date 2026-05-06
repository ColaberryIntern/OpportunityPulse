#!/usr/bin/env node
// Validates docs/oied-feature-walkthrough.html in headless Chromium and
// captures docs/oied-walkthrough-assets/walkthrough-final.png.
//
// Confirms:
//  - all <img> tags resolve (no broken-image responses)
//  - 20 feature <section class="feature">
//  - >=20 <textarea> widgets
//  - 80 <input type="checkbox"> (4 per feature x 20)
//  - TOC anchors all map to existing section ids

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'docs', 'oied-feature-walkthrough.html');
const ASSETS_DIR = path.join(REPO_ROOT, 'docs', 'oied-walkthrough-assets');
const FINAL_SHOT = path.join(ASSETS_DIR, 'walkthrough-final.png');

(async () => {
  if (!fs.existsSync(HTML_PATH)) {
    console.error('HTML not found:', HTML_PATH);
    process.exit(1);
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Track failed image loads.
  const brokenImages = [];
  page.on('response', (resp) => {
    const ct = resp.headers()['content-type'] || '';
    if (resp.status() >= 400 && (ct.startsWith('image/') || resp.url().endsWith('.png'))) {
      brokenImages.push({ url: resp.url(), status: resp.status() });
    }
  });

  const fileUrl = 'file:///' + HTML_PATH.replace(/\\/g, '/');
  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const counts = await page.evaluate(() => {
    return {
      featureSections: document.querySelectorAll('section.feature').length,
      usecaseSections: document.querySelectorAll('section.usecase').length,
      textareas: document.querySelectorAll('textarea').length,
      checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
      images: document.querySelectorAll('img').length,
      tocLinks: document.querySelectorAll('nav.toc a').length,
      sectionsWithId: document.querySelectorAll('section[id]').length,
      // verify each TOC anchor resolves to an element on the page
      brokenAnchors: Array.from(document.querySelectorAll('nav.toc a')).filter(function(a) {
        var href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return false;
        return !document.getElementById(href.slice(1));
      }).map(function(a) { return a.getAttribute('href'); }),
    };
  });

  // Verify every <img> actually loaded (naturalWidth > 0).
  const imgStatus = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(function(img) {
      return { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 };
    });
  });
  const failedImgs = imgStatus.filter(function(i) { return !i.ok; });

  // Final full-page screenshot.
  await page.screenshot({ path: FINAL_SHOT, fullPage: true });

  await browser.close();

  console.log('---VALIDATION RESULTS---');
  console.log('Feature sections (expected 20):       ', counts.featureSections);
  console.log('Use-case sections (expected 5):       ', counts.usecaseSections);
  console.log('Textareas (expected >=25):            ', counts.textareas);
  console.log('Checkboxes (expected 80 = 4 x 20):    ', counts.checkboxes);
  console.log('Images (>=17 screenshots referenced): ', counts.images);
  console.log('TOC links:                            ', counts.tocLinks);
  console.log('Sections with id:                     ', counts.sectionsWithId);
  console.log('Broken anchors:                       ', counts.brokenAnchors);
  console.log('Failed image loads:                   ', failedImgs.length, failedImgs);
  console.log('Network broken images:                ', brokenImages.length);
  console.log('Final screenshot:                     ', FINAL_SHOT);
  console.log('Final screenshot size:                ',
    fs.existsSync(FINAL_SHOT) ? (fs.statSync(FINAL_SHOT).size / 1024).toFixed(1) + ' KB' : 'MISSING');

  // Assertions.
  let ok = true;
  if (counts.featureSections !== 20) { console.error('FAIL: feature section count'); ok = false; }
  if (counts.usecaseSections !== 5)  { console.error('FAIL: use-case section count'); ok = false; }
  if (counts.checkboxes !== 80)      { console.error('FAIL: checkbox count'); ok = false; }
  if (counts.brokenAnchors.length)   { console.error('FAIL: broken TOC anchors'); ok = false; }
  if (failedImgs.length)             { console.error('FAIL: image load'); ok = false; }
  console.log(ok ? 'AUDIT CLEAN' : 'AUDIT FAILED');
  process.exit(ok ? 0 : 1);
})();
