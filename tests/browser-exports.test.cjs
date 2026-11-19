'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function startServer() {
  const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
    const relativePath = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath.slice(1));
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(contents);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ server, port: server.address().port });
  }));
}

(async () => {
  const { server, port } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('http://127.0.0.1:' + port, { waitUntil: 'networkidle' });
    await page.waitForFunction(() =>
      window.jspdf && window.jspdf.jsPDF &&
      window.PlaymakerExport &&
      document.querySelector('#export-pdf') &&
      document.querySelector('#export-video-btn')
    );

    // Create two frames so video export has an actual sequence to record.
    await page.locator('[data-player="1"]').click();
    const canvas = page.locator('#play-canvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds, 'Court canvas should be visible');
    await page.mouse.click(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.5);
    await page.locator('#add-frame').click();
    await page.locator('.frame-thumbnail').nth(1).waitFor();
    await page.locator('.frame-thumbnail').first().click();

    // PDF is generated from the bundled jsPDF library and should produce a
    // real file plus a persistent in-app download link.
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('#export-pdf').click()
    ]);
    assert.match(pdfDownload.suggestedFilename(), /\.pdf$/i);
    const pdfPath = await pdfDownload.path();
    assert.ok(pdfPath && fs.statSync(pdfPath).size > 500, 'PDF download should contain data');
    assert.equal(await page.locator('#export-download-panel').isVisible(), true);
    assert.equal(await page.locator('#export-download-link').getAttribute('download'), pdfDownload.suggestedFilename());

    // Canvas recording should complete and leave a visible retry/download link.
    const [videoDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('#export-video-btn').click()
    ]);
    assert.match(videoDownload.suggestedFilename(), /\.(webm|mp4)$/i);
    const videoPath = await videoDownload.path();
    assert.ok(videoPath && fs.statSync(videoPath).size > 1000, 'Video download should contain recorded frames');
    assert.equal(await page.locator('#export-download-panel').isVisible(), true);
    assert.equal(await page.locator('#export-download-link').getAttribute('download'), videoDownload.suggestedFilename());

    // The export should not leave the editor locked or the selection changed.
    await page.locator('#export-video-btn').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#export-video-btn').isDisabled(), false);
    assert.equal(await page.locator('.frame-thumbnail.active .frame-thumbnail-label').textContent(), 'Frame 1');
    assert.deepEqual(pageErrors, [], 'Browser should not report uncaught page errors');

    await context.close();
    process.stdout.write('Browser export smoke test passed: PDF and video files downloaded.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
