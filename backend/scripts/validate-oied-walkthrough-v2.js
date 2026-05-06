#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'docs', 'oied-feature-walkthrough-v2.html');
const ASSETS_DIR = path.join(REPO_ROOT, 'docs', 'oied-walkthrough-assets');
const FINAL_SHOT = path.join(ASSETS_DIR, 'walkthrough-v2-final.png');

(async () => {
  if (!fs.existsSync(HTML_PATH)) { console.error('HTML not found'); process.exit(1); }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const fileUrl = 'file:///' + HTML_PATH.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const counts = await page.evaluate(() => ({
    fixSections: document.querySelectorAll('section.fix').length,
    introSections: document.querySelectorAll('section.intro').length,
    summarySections: document.querySelectorAll('section.summary').length,
    textareas: document.querySelectorAll('textarea').length,
    checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
    images: document.querySelectorAll('img').length,
    tocLinks: document.querySelectorAll('nav.toc a').length,
    brokenAnchors: Array.from(document.querySelectorAll('nav.toc a'))
      .filter((a) => a.getAttribute('href').startsWith('#') && !document.getElementById(a.getAttribute('href').slice(1)))
      .map((a) => a.getAttribute('href')),
  }));

  const imgStatus = await page.evaluate(() => Array.from(document.querySelectorAll('img'))
    .map((img) => ({ src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 })));
  const failedImgs = imgStatus.filter((i) => !i.ok);

  await page.screenshot({ path: FINAL_SHOT, fullPage: true });
  await browser.close();

  console.log('---V2 VALIDATION---');
  console.log('Fix sections (expected 8):     ', counts.fixSections);
  console.log('Intro sections:                ', counts.introSections);
  console.log('Summary sections:              ', counts.summarySections);
  console.log('Textareas:                     ', counts.textareas);
  console.log('Checkboxes:                    ', counts.checkboxes);
  console.log('Images:                        ', counts.images);
  console.log('TOC links:                     ', counts.tocLinks);
  console.log('Broken anchors:                ', counts.brokenAnchors);
  console.log('Failed image loads:            ', failedImgs.length, failedImgs);
  console.log('Final screenshot size:         ', (fs.statSync(FINAL_SHOT).size / 1024).toFixed(1), 'KB');

  let ok = true;
  if (counts.fixSections !== 8)         { console.error('FAIL: fix-section count'); ok = false; }
  if (counts.brokenAnchors.length)      { console.error('FAIL: broken anchors'); ok = false; }
  if (failedImgs.length)                { console.error('FAIL: image load'); ok = false; }
  console.log(ok ? 'V2 AUDIT CLEAN' : 'V2 AUDIT FAILED');
  process.exit(ok ? 0 : 1);
})();
