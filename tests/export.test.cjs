'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PlaymakerExport = require('../export-utils.js');

test('builds safe export filenames and supplies a fallback name', () => {
  assert.equal(PlaymakerExport.getSafeFilename('Horns / Flare!', 'pdf'), 'horns_flare.pdf');
  assert.equal(PlaymakerExport.getSafeFilename('Café', 'webm'), 'cafe.webm');
  assert.equal(PlaymakerExport.getSafeFilename('', 'json'), 'untitled_play.json');
  assert.throws(() => PlaymakerExport.getSafeFilename('Play', ''), /extension is required/);
});

test('uses the first browser-supported video recording format', () => {
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'video/webm;codecs=vp8'; }
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options.mimeType;
    }
  }

  const result = PlaymakerExport.createMediaRecorder({ id: 'stream' }, FakeRecorder);
  assert.equal(result.mimeType, 'video/webm;codecs=vp8');
  assert.equal(result.extension, 'webm');
  assert.equal(result.recorder.stream.id, 'stream');
});

test('retries another MIME type when a recorder constructor rejects one', () => {
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      if (options && options.mimeType.includes('vp9')) throw new Error('VP9 encoder unavailable');
      this.mimeType = options ? options.mimeType : '';
    }
  }

  const result = PlaymakerExport.createMediaRecorder({}, FakeRecorder);
  assert.equal(result.mimeType, 'video/webm;codecs=vp8');
});

test('falls back to the browser-selected recording format', () => {
  class FakeRecorder {
    static isTypeSupported() { return false; }
    constructor(stream, options) {
      if (options) throw new Error('Explicit MIME types unavailable');
      this.mimeType = 'video/mp4';
    }
  }

  const result = PlaymakerExport.createMediaRecorder({}, FakeRecorder);
  assert.equal(result.mimeType, 'video/mp4');
  assert.equal(result.extension, 'mp4');
});

test('reports an actionable error when every recording format fails', () => {
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor() { throw new Error('Encoder initialization failed'); }
  }

  assert.throws(
    () => PlaymakerExport.createMediaRecorder({}, FakeRecorder),
    /could not start a video recorder.*Encoder initialization failed/i
  );
});

test('uses the MP4 extension only for MP4 recordings', () => {
  assert.equal(PlaymakerExport.getVideoExtension('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(PlaymakerExport.getVideoExtension('video/webm;codecs=vp9'), 'webm');
  assert.equal(PlaymakerExport.getVideoExtension(''), 'webm');
});

test('converts jsPDF output into a non-empty PDF Blob', () => {
  const blob = PlaymakerExport.createPdfBlob({
    output: format => {
      assert.equal(format, 'blob');
      return new Blob(['pdf bytes'], { type: 'application/pdf' });
    }
  });

  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(blob.size, 9);
});

test('rejects empty PDF output', () => {
  assert.throws(
    () => PlaymakerExport.createPdfBlob({ output: () => new Blob([]) }),
    /PDF export was empty/
  );
});
