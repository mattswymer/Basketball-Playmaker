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

    const initialCourtSize = await page.locator('#play-canvas').evaluate(el => ({ width: el.width, height: el.height }));
    assert.deepEqual(initialCourtSize, { width: 900, height: 756 }, 'Half court must display as a 50 ft x 42 ft portrait court at DPR 1');
    const basketballIconPixels = await page.locator('#wheel-ball canvas').evaluate(icon => {
      const pixels = icon.getContext('2d').getImageData(0, 0, icon.width, icon.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
      return visible;
    });
    assert.ok(basketballIconPixels > 20, 'Basketball emoji should render in the radial action wheel');

    await page.waitForFunction(() => {
      const canvas = document.querySelector('#play-canvas');
      if (!canvas || !canvas.width || !canvas.height) return false;
      const pixel = canvas.getContext('2d').getImageData(
        Math.floor(canvas.width * 0.08), Math.floor(canvas.height * 0.08), 1, 1
      ).data;
      return !(pixel[0] === 248 && pixel[1] === 250 && pixel[2] === 252);
    }, { timeout: 10000 });

    // Verify both court modes retain their background artwork.
    const courtToggle = page.locator('#court-toggle');
    for (const courtType of ['half', 'full']) {
      await courtToggle.selectOption(courtType);
      await page.waitForTimeout(100);
      const courtSize = await page.locator('#play-canvas').evaluate(el => ({ width: el.width, height: el.height }));
      assert.deepEqual(courtSize, courtType === 'half' ? { width: 900, height: 756 } : { width: 1512, height: 900 },
        courtType + '-court should use the correct display orientation');
      const backgroundVisible = await page.locator('#play-canvas').evaluate(canvas => {
        const pixel = canvas.getContext('2d').getImageData(
          Math.floor(canvas.width * 0.08), Math.floor(canvas.height * 0.08), 1, 1
        ).data;
        return !(pixel[0] === 248 && pixel[1] === 250 && pixel[2] === 252);
      });
      assert.equal(backgroundVisible, true, courtType + '-court artwork should remain visible');
    }

    // Adding many slides must scroll the storyboard without moving the court.
    const initialCanvasBox = await page.locator('#play-canvas').boundingBox();
    for (let i = 0; i < 12; i++) await page.locator('#add-frame').click();
    const finalCanvasBox = await page.locator('#play-canvas').boundingBox();
    assert.ok(Math.abs(finalCanvasBox.y - initialCanvasBox.y) < 1, 'Adding frames must not move the court canvas');
    const frameListMetrics = await page.locator('#frame-list').evaluate(el => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight
    }));
    assert.ok(frameListMetrics.scrollHeight > frameListMetrics.clientHeight, 'Frame storyboard should scroll independently');
    await page.locator('.frame-thumbnail').first().click();

    // Create two frames so video export has an actual sequence to record.
    await page.locator('[data-player="1"]').click();
    const canvas = page.locator('#play-canvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds, 'Court canvas should be visible');
    await page.mouse.click(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.5);
    await page.locator('#add-frame').click();
    await page.locator('.frame-thumbnail').nth(1).waitFor();
    await page.locator('.frame-thumbnail').first().click();

    // Catch the exact production failure before export: a canvas that has
    // drawn a non-CORS image is tainted and rejects both toDataURL and
    // captureStream. Exercise both APIs after court artwork has loaded.
    const canvasSecurity = await canvas.evaluate(el => {
      try {
        const preview = el.toDataURL('image/png');
        const stream = el.captureStream(1);
        stream.getTracks().forEach(track => track.stop());
        return { clean: preview.startsWith('data:image/png'), stream: true };
      } catch (error) {
        return { clean: false, stream: false, error: error.message };
      }
    });
    assert.equal(canvasSecurity.clean, true, 'Court canvas must remain origin-clean: ' + (canvasSecurity.error || ''));
    assert.equal(canvasSecurity.stream, true, 'Court canvas must support captureStream: ' + (canvasSecurity.error || ''));

    // PDF is generated from the bundled jsPDF library and should produce a
    // real file plus a persistent in-app download link.
    await page.locator('#export-pdf').click();
    await page.locator('#export-download-panel').waitFor({ state: 'visible', timeout: 20000 });
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('#export-download-link').click()
    ]);
    assert.match(pdfDownload.suggestedFilename(), /\.pdf$/i);
    const pdfPath = await pdfDownload.path();
    assert.ok(pdfPath && fs.statSync(pdfPath).size > 500, 'PDF download should contain data');
    assert.equal(await page.locator('#export-download-panel').isVisible(), true);
    assert.equal(await page.locator('#export-download-link').getAttribute('download'), pdfDownload.suggestedFilename());

    // Canvas recording should complete and leave a visible retry/download link.
    await page.locator('#export-video-btn').click();
    await page.locator('#export-download-panel').waitFor({ state: 'visible', timeout: 60000 });
    const [videoDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('#export-download-link').click()
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

    // Repeat the export checks in the actual downloaded-file scenario (file://).
    const localPage = await browser.newPage({ acceptDownloads: true });
    const localErrors = [];
    localPage.on('pageerror', error => localErrors.push(error.message));
    await localPage.goto(require('node:url').pathToFileURL(path.join(root, 'index.html')).href);
    await localPage.waitForFunction(() => window.jspdf && window.PlaymakerExport);
    const localCanvasSecurity = await localPage.locator('#play-canvas').evaluate(canvas => {
      try {
        const png = canvas.toDataURL('image/png');
        const stream = canvas.captureStream(1);
        stream.getTracks().forEach(track => track.stop());
        return { clean: png.startsWith('data:image/png'), stream: true };
      } catch (error) {
        return { clean: false, stream: false, error: error.message };
      }
    });
    assert.equal(localCanvasSecurity.clean, true, 'file:// canvas must export: ' + (localCanvasSecurity.error || ''));
    assert.equal(localCanvasSecurity.stream, true, 'file:// canvas must record: ' + (localCanvasSecurity.error || ''));

    await localPage.locator('#export-pdf').click();
    await localPage.locator('#export-download-panel').waitFor({ state: 'visible', timeout: 20000 });
    const [localPdf] = await Promise.all([
      localPage.waitForEvent('download'),
      localPage.locator('#export-download-link').click()
    ]);
    assert.match(localPdf.suggestedFilename(), /\\.pdf$/i);
    assert.ok(fs.statSync(await localPdf.path()).size > 500);

    await localPage.locator('[data-player="1"]').click();
    const localBounds = await localPage.locator('#play-canvas').boundingBox();
    await localPage.mouse.click(localBounds.x + localBounds.width * 0.35, localBounds.y + localBounds.height * 0.5);
    await localPage.locator('#add-frame').click();
    await localPage.locator('#export-video-btn').click();
    await localPage.locator('#export-download-panel').waitFor({ state: 'visible', timeout: 60000 });
    const [localVideo] = await Promise.all([
      localPage.waitForEvent('download', { timeout: 20000 }),
      localPage.locator('#export-download-link').click()
    ]);
    assert.match(localVideo.suggestedFilename(), /\\.(webm|mp4)$/i);
    assert.ok(fs.statSync(await localVideo.path()).size > 1000);
    assert.deepEqual(localErrors, [], 'file:// app should not report uncaught errors');
    await localPage.close();
    process.stdout.write('Browser export smoke test passed: hosted and file:// exports downloaded; storyboard scrolls independently.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
