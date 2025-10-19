"use strict";

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');

// Adjustable constants
const CHROMIUM_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const VIEWPORT_WIDTH = 1000;
const DEFAULT_HEIGHT = 1000;

function buildOutputPath(inputHtmlPath) {
  const dir = path.dirname(inputHtmlPath);
  const base = path.basename(inputHtmlPath);
  const pngBase = base.replace(/\.html?$/i, '');
  return path.join(dir, `${pngBase}.png`);
}

(async () => {
  const inputHtmlPath = process.argv[2];
  if (!inputHtmlPath || !fs.existsSync(inputHtmlPath)) {
    console.error('Usage: node html-to-png.js /absolute/path/to/file.html');
    process.exit(1);
  }

  const absoluteHtmlPath = path.resolve(inputHtmlPath);
  const fileUrl = pathToFileURL(absoluteHtmlPath).href;
  const outputPath = buildOutputPath(absoluteHtmlPath);

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    defaultViewport: { width: VIEWPORT_WIDTH, height: DEFAULT_HEIGHT },
    args: ['--disable-gpu', '--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    const fullHeight = await page.evaluate(() => document.body.scrollHeight || document.documentElement.scrollHeight || 1000);
    await page.setViewport({ width: VIEWPORT_WIDTH, height: fullHeight });

    await page.screenshot({
      path: outputPath,
      fullPage: true,
      omitBackground: false
    });

    // Output only the path for downstream consumption
    process.stdout.write(outputPath);
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

