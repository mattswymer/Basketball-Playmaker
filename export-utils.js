(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaymakerExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RECORDER_TYPES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4'
  ];

  function getSafeFilename(playName, extension) {
    const safeName = String(playName || 'Untitled Play')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'untitled_play';
    const safeExtension = String(extension || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!safeExtension) throw new Error('An export file extension is required');
    return safeName + '.' + safeExtension;
  }

  function getVideoExtension(mimeType) {
    return /video\/mp4/i.test(String(mimeType || '')) ? 'mp4' : 'webm';
  }

  function createMediaRecorder(stream, MediaRecorderConstructor) {
    if (typeof MediaRecorderConstructor !== 'function') {
      throw new Error('This browser does not provide the MediaRecorder API');
    }

    let lastError = null;
    const isTypeSupported = typeof MediaRecorderConstructor.isTypeSupported === 'function'
      ? MediaRecorderConstructor.isTypeSupported.bind(MediaRecorderConstructor)
      : null;

    for (const mimeType of RECORDER_TYPES) {
      if (isTypeSupported) {
        let supported = false;
        try { supported = isTypeSupported(mimeType); }
        catch (error) { lastError = error; }
        if (!supported) continue;
      }

      try {
        const recorder = new MediaRecorderConstructor(stream, { mimeType });
        return {
          recorder,
          mimeType: recorder.mimeType || mimeType,
          extension: getVideoExtension(recorder.mimeType || mimeType)
        };
      } catch (error) {
        lastError = error;
      }
    }

    // Some browsers choose their own supported format and do not accept a
    // caller-specified MIME type. Give that browser-default path a chance.
    try {
      const recorder = new MediaRecorderConstructor(stream);
      const mimeType = recorder.mimeType || '';
      return {
        recorder,
        mimeType,
        extension: getVideoExtension(mimeType)
      };
    } catch (error) {
      lastError = error;
    }

    throw new Error(
      'The browser could not start a video recorder. ' +
      (lastError && lastError.message ? lastError.message : 'No compatible recording format was accepted.')
    );
  }

  function createPdfBlob(doc, BlobConstructor) {
    if (!doc || typeof doc.output !== 'function') {
      throw new Error('The PDF library did not provide a document output method');
    }
    const BlobClass = BlobConstructor || (typeof Blob !== 'undefined' ? Blob : null);
    if (typeof BlobClass !== 'function') {
      throw new Error('This browser cannot create downloadable PDF files');
    }

    const output = doc.output('blob');
    const blob = output instanceof BlobClass
      ? output
      : new BlobClass([output], { type: 'application/pdf' });

    if (!blob || blob.size === 0) {
      throw new Error('The PDF export was empty');
    }
    return blob;
  }

  return {
    RECORDER_TYPES,
    getSafeFilename,
    getVideoExtension,
    createMediaRecorder,
    createPdfBlob
  };
});
