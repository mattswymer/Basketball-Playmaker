'use strict';

class PlaymakerApp {
  constructor() {
    // ========================================================================
    // CONFIGURATION & CONSTANTS
    // ========================================================================

  this.config = {
      canvas: { width: 1512, height: 900 },
      player: {
        radius: 28.35,
        ballIndicatorOffset: 9.45,
        colors: {
          offense: '#007bff',
          defense: '#dc3545',
          ballHolder: '#000000',
          ballAnimation: '#FF8C00'
        }
      },
      line: {
        color: '#343a40',
        selectedColor: '#e74c3c',
        hoverColor: '#2980b9',
        width: 3,
        clickTolerance: 10,
        arrowLength: 12,
        screenWidth: 12,
        dribbleAmplitude: 3.5,
        dribbleFrequency: 1,
        dribbleSegmentLength: 90,
        shootLineOffset: 4,
        passLineDash: [5, 10]
      },
      // --- NEWLY ADDED ---
      geometry: {
        lineEndPullback: {
          screen: 4,
          shoot: 4,
          defaultArrow: 14 // (this.config.line.arrowLength + 2)
        }
      },
      // ---------------------
      animation: { speed: 1500, finalFrameHold: 2000 },
      interaction: {
        clickTolerance: 10,
        doubleClickTime: 450
      },
      history: { maxStates: 50, noteDebounceDelay: 500 },
      video: { fps: 30 },
      images: {
        // Court markings are drawn directly on the canvas so local file://
        // use never taints the canvas or depends on external image origins.
        halfCourt: null,
        fullCourt: null
      }
    };

    // ========================================================================
    // DOM REFERENCES
    // ========================================================================
    this.dom = {
      canvas: document.getElementById('play-canvas'),
      instructionText: document.getElementById('instruction-text'),
      playNameInput: document.getElementById('play-name'),
      saveStatus: document.getElementById('save-status'),
      courtToggle: document.getElementById('court-toggle'),
      clearFrameBtn: document.getElementById('clear-frame'),
      saveBtn: document.getElementById('save-play'),
      loadBtn: document.getElementById('load-play'),
      loadFileInput: document.getElementById('load-file-input'),
      animateBtn: document.getElementById('animate-play'),
      exportVideoBtn: document.getElementById('export-video-btn'),
      exportPdfBtn: document.getElementById('export-pdf'),
      newPlayBtn: document.getElementById('new-play'),
      addFrameBtn: document.getElementById('add-frame'),
      deleteFrameBtn: document.getElementById('delete-frame'),
      undoBtn: document.getElementById('undo-btn'),
      redoBtn: document.getElementById('redo-btn'),
      frameList: document.getElementById('frame-list'),
      frameNotes: document.getElementById('frame-notes'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      exportDownloadPanel: document.getElementById('export-download-panel'),
      exportDownloadHeading: document.getElementById('export-download-heading'),
      exportDownloadMessage: document.getElementById('export-download-message'),
      exportDownloadLink: document.getElementById('export-download-link'),
      exportDownloadDismiss: document.getElementById('export-download-dismiss'),
      playerToolIcons: document.querySelectorAll('.player-tool-icon'),
      actionWheel: document.getElementById('action-wheel'),
      wheelButtons: document.querySelectorAll('.wheel-button'),
      courtContainer: document.getElementById('court-container')
    };

    // ========================================================================
    // APPLICATION STATE
    // ========================================================================
    this.ctx = this.dom.canvas.getContext('2d');
    this.pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    this.halfCourtImg = null;
    this.fullCourtImg = null;
    this.lineIdCounter = 1;
    this.autosaveKey = 'basketball-playmaker-autosave-v1';
    this.autosaveTimer = null;
    this.exportDownloadUrl = null;
    this.videoRecorder = null;
    this.videoStream = null;
    this.videoAnimationFrameId = null;
    this.state = this.createInitialState();

    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    this.init();
  }
async safeOperation(operation, errorMessage) {
    try {
      // Await the operation (which is an async function)
      return await operation();
    } catch (error) {
      // Centralized error logging and user notification
      console.error(errorMessage, error);
      this.showAlert(`${errorMessage}: ${error.message}`);
      return null; // Signal failure to the caller
    }
  }
  /**
   * Primary initialization sequence.
   * Loads images, binds events, and performs the first render.
   */
  async init() {
    // Use the NFHS master court at 1.5 pixels per inch (18 px/ft).
    // Device-pixel ratio is applied only to the backing store for crisp lines.
    this.dom.canvas.width = Math.round(this.config.canvas.width * this.pixelRatio);
    this.dom.canvas.height = Math.round(this.config.canvas.height * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

    this.bindEventHandlers();
    this.initializeToolboxIcons();
    this.initializeActionWheelIcons();
    this.dom.frameNotes.value = this.state.frames[0].notes || '';
    this.renderFrameList();
    this.draw();
    this.setInstruction('Select a player to tap-to-place, or drag one onto the court.');
    this.updateHistoryButtons();
    this.updateSaveStatus();
    this.restoreAutosave();

    // Court artwork is rendered with Canvas2D primitives (no external images),
    // keeping the editor canvas origin-clean for PDF and video export locally
    // and when hosted.
    this.renderFrameList();
    this.draw();
    console.log('Basketball Playmaker Pro initialized');
  }



  createInitialState() {
    const initialFrames = [this.createNewFrame(1)];
    return {
      courtType: 'half',
      activeLineTool: null,
      frames: initialFrames,
      currentFrameIndex: 0,
      nextFrameId: 2,
      nextPlayerId: 1,
      isDragging: false,
      draggingPlayer: null,
      dragStartPlayerX: 0, dragStartPlayerY: 0,
      dragOffsetX: 0, dragOffsetY: 0,
      isDrawingLine: false,
      keyboardCursor: null,
      placementPlayerLabel: null,
      placementCursor: { x: 756, y: 450 },
      isDirty: false,
      pendingNoteSave: false,
      previewLine: null,
      lastClickTime: 0,
      selectedPlayerId: null,
      selectedLineId: null,
      hoverLineId: null,
      isAnimating: false,
      isExporting: false,
      animationFrameId: null,
      animationStartTime: 0,
      currentFramePlaying: 0,
      history: [this.copyFrames(initialFrames)],
      historyIndex: 0,
      noteDebounceTimer: null,
      pendingRedraw: false
    };
  }

  createNewFrame(id) {
    return { id, notes: '', players: [], lines: [] };
  }

  copyFrames(frames) {
    try { return structuredClone(frames); }
    catch { return JSON.parse(JSON.stringify(frames)); }
  }

  updateHistoryButtons() {
    this.dom.undoBtn.disabled = this.state.historyIndex <= 0;
    this.dom.redoBtn.disabled = this.state.historyIndex >= this.state.history.length - 1;
  }

  saveState() {
    if (!this.shouldSaveState()) return;
    this.state.isDirty = true;
    this.updateSaveStatus();
    this.scheduleAutosave();
    this.updateFrameThumbnail(this.state.currentFrameIndex);
    const snapshot = this.copyFrames(this.state.frames);
    const currentSnapshot = this.state.history[this.state.historyIndex];
    if (currentSnapshot && JSON.stringify(currentSnapshot) === JSON.stringify(snapshot)) {
      this.updateHistoryButtons();
      return;
    }
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
    }
    if (this.state.history.length >= this.config.history.maxStates) {
      this.state.history.shift();
      this.state.historyIndex--;
    }
    this.state.history.push(snapshot);
    this.state.historyIndex++;
    this.updateHistoryButtons();
  }

  flushPendingNotes() {
    if (this.state.noteDebounceTimer) {
      clearTimeout(this.state.noteDebounceTimer);
      this.state.noteDebounceTimer = null;
    }
    if (this.state.pendingNoteSave) {
      this.state.pendingNoteSave = false;
      this.saveState();
    }
  }

  markDirty() {
    this.state.isDirty = true;
    this.updateSaveStatus();
    this.scheduleAutosave();
  }

  updateSaveStatus() {
    if (!this.dom.saveStatus) return;
    const hasChanges = Boolean(this.state.isDirty);
    this.dom.saveStatus.textContent = hasChanges ? 'Unsaved changes' : 'No unsaved changes';
    this.dom.saveStatus.classList.toggle('is-dirty', hasChanges);
    this.dom.saveStatus.classList.toggle('is-clean', !hasChanges);
  }

  scheduleAutosave() {
    if (this.state.isAnimating || this.state.isExporting || !this.state.isDirty) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      try {
        const backup = {
          formatVersion: 2,
          playName: this.dom.playNameInput.value || '',
          courtType: this.state.courtType,
          frames: this.state.frames,
          nextFrameId: this.state.nextFrameId,
          nextPlayerId: this.state.nextPlayerId,
          currentFrameIndex: this.state.currentFrameIndex,
          savedAt: new Date().toISOString()
        };
        const serialized = JSON.stringify(backup);
        if (serialized.length * 2 > PlayData.MAX_FILE_BYTES) {
          console.warn('Local autosave skipped: the play is larger than the 5 MB recovery limit.');
          return;
        }
        localStorage.setItem(this.autosaveKey, serialized);
      } catch (error) {
        console.warn('Local autosave could not be written:', error);
      }
    }, 450);
  }

  restoreAutosave() {
    let serialized;
    try {
      serialized = localStorage.getItem(this.autosaveKey);
    } catch (error) {
      console.warn('Local autosave is unavailable in this browser context:', error);
      return false;
    }
    if (!serialized) return false;

    try {
      const parsed = JSON.parse(serialized);
      const backup = PlayData.normalizePlayData(parsed);
      const savedAt = parsed.savedAt && !Number.isNaN(Date.parse(parsed.savedAt))
        ? new Date(parsed.savedAt).toLocaleString()
        : 'an earlier session';
      const restore = confirm('A local recovery copy from ' + savedAt +
        ' is available. Restore that unsaved play?');
      if (!restore) {
        localStorage.removeItem(this.autosaveKey);
        return false;
      }

      this.state.courtType = backup.courtType;
      this.state.frames = backup.frames;
      this.state.nextFrameId = backup.nextFrameId;
      this.state.nextPlayerId = backup.nextPlayerId;
      this.lineIdCounter = Math.max(
        0,
        ...this.state.frames.flatMap(frame => frame.lines.map(line => line.id || 0))
      ) + 1;
      this.state.history = [this.copyFrames(this.state.frames)];
      this.state.historyIndex = 0;
      this.state.isDirty = true;
      this.state.pendingNoteSave = false;
      this.dom.playNameInput.value = backup.playName;
      this.dom.courtToggle.value = this.state.courtType;

      const requestedIndex = Number.isInteger(parsed.currentFrameIndex) ? parsed.currentFrameIndex : 0;
      const frameIndex = Math.max(0, Math.min(this.state.frames.length - 1, requestedIndex));
      this.switchFrame(frameIndex, { flushNotes: false });
      this.updateHistoryButtons();
      this.updateSaveStatus();
      this.setInstruction('Recovered a local autosave. Save the play as a JSON file when ready.');
      return true;
    } catch (error) {
      console.warn('The local recovery copy could not be restored:', error);
      try { localStorage.removeItem(this.autosaveKey); } catch (removeError) {
        console.warn('Could not remove the invalid local recovery copy:', removeError);
      }
      return false;
    }
  }

  clearAutosave() {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    try {
      localStorage.removeItem(this.autosaveKey);
    } catch (error) {
      console.warn('The local recovery copy could not be cleared:', error);
    }
  }

  undo = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.flushPendingNotes();
    if (this.state.historyIndex > 0) {
      this.state.historyIndex--;
      this.state.frames = this.copyFrames(this.state.history[this.state.historyIndex]);
      this.state.isDirty = true;
      this.updateSaveStatus();
      this.scheduleAutosave();
      this.switchFrame(this.state.currentFrameIndex, { flushNotes: false });
      this.updateHistoryButtons();
    }
  }

  redo = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.flushPendingNotes();
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.historyIndex++;
      this.state.frames = this.copyFrames(this.state.history[this.state.historyIndex]);
      this.state.isDirty = true;
      this.updateSaveStatus();
      this.switchFrame(this.state.currentFrameIndex, { flushNotes: false });
      this.updateHistoryButtons();
    }
  }



  showAlert(message) {
    this.dom.loadingText.textContent = message;
    this.dom.loadingOverlay.classList.remove('hidden');
    this.dom.loadingOverlay.onclick = () => {
      this.dom.loadingOverlay.classList.add('hidden');
      this.dom.loadingOverlay.onclick = null;
    };
  }

  showLoading(message) {
    this.dom.loadingText.textContent = message;
    this.dom.loadingOverlay.classList.remove('hidden');
    this.dom.loadingOverlay.onclick = null;
  }

  hideLoading() {
    this.dom.loadingOverlay.classList.add('hidden');
  }

  clearExportDownload() {
    if (this.exportDownloadUrl) {
      URL.revokeObjectURL(this.exportDownloadUrl);
      this.exportDownloadUrl = null;
    }
    if (this.dom.exportDownloadLink) {
      this.dom.exportDownloadLink.removeAttribute('href');
      this.dom.exportDownloadLink.removeAttribute('download');
    }
    if (this.dom.exportDownloadPanel) this.dom.exportDownloadPanel.classList.add('hidden');
  }

  showExportDownload(blob, filename, label) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('The ' + label.toLowerCase() + ' export did not produce a file.');
    }
    this.clearExportDownload();
    this.exportDownloadUrl = URL.createObjectURL(blob);
    this.dom.exportDownloadHeading.textContent = label + ' ready';
    this.dom.exportDownloadMessage.textContent = 'Your file is ready. Click Download to save it to your device.';
    this.dom.exportDownloadLink.href = this.exportDownloadUrl;
    this.dom.exportDownloadLink.download = filename;
    this.dom.exportDownloadLink.textContent = 'Download ' + label;
    this.dom.exportDownloadPanel.classList.remove('hidden');
    // Export generation is asynchronous, so browsers commonly block a
    // synthetic download click after the original user activation expires.
    // Leave the visible link for an explicit, user-initiated download.
    this.setInstruction(label + ' ready. Click the download link to save the file.');
  }

  loadPdfLibrary() {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (typeof jsPDF !== 'function') {
      throw new Error('The local PDF library did not load. Refresh the page and check that vendor/jspdf.umd.min.js is present.');
    }
    return jsPDF;
  }

  setInstruction(message) {
    this.dom.instructionText.textContent = message;
  }

  renderFrameList() {
    this.dom.frameList.innerHTML = '';
    this.state.frames.forEach((frame, index) => {
      const frameEl = document.createElement('button');
      frameEl.type = 'button';
      frameEl.className = 'frame-thumbnail';
      frameEl.dataset.frameId = frame.id;
      const activeIndex = this.state.isAnimating ? this.state.currentFramePlaying : this.state.currentFrameIndex;
      frameEl.setAttribute('aria-pressed', String(index === activeIndex));
      frameEl.setAttribute('aria-label',
        `Frame ${index + 1}: ${frame.players.length} players, ${frame.lines.length} actions${frame.notes ? ', has notes' : ''}`
      );
      const preview = document.createElement('canvas');
      preview.className = 'frame-preview';
      preview.width = 132;
      preview.height = 92;
      preview.setAttribute('aria-hidden', 'true');
      this.drawFrameThumbnail(preview, frame);
      frameEl.appendChild(preview);
      const label = document.createElement('span');
      label.className = 'frame-thumbnail-label';
      label.textContent = `Frame ${index + 1}`;
      frameEl.appendChild(label);
      const meta = document.createElement('span');
      meta.className = 'frame-thumbnail-meta';
      meta.textContent = `${frame.players.length} players · ${frame.lines.length} actions${frame.notes ? ' · Notes' : ''}`;
      frameEl.appendChild(meta);
      if (index === this.state.currentFrameIndex && !this.state.isAnimating) frameEl.classList.add('active');
      if (index === this.state.currentFramePlaying && this.state.isAnimating) frameEl.classList.add('active');
      this.dom.frameList.appendChild(frameEl);
    });
  }

  drawFrameThumbnail(canvas, frame) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = canvas.width / this.config.canvas.width;
    const sy = canvas.height / this.config.canvas.height;
    this.drawCourtBackground(ctx, this.state.courtType, canvas.width, canvas.height);
    frame.lines.forEach(line => {
      if (!Array.isArray(line.points) || line.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.setLineDash(line.type === 'pass' ? [3, 2] : []);
      if (line.type === 'dribble') {
        for (let i = 0; i < line.points.length - 1; i++) {
          this.drawDribbleLine(
            { x: line.points[i].x * sx, y: line.points[i].y * sy },
            { x: line.points[i + 1].x * sx, y: line.points[i + 1].y * sy },
            false,
            ctx,
            sx
          );
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(line.points[0].x * sx, line.points[0].y * sy);
        line.points.slice(1).forEach(point => ctx.lineTo(point.x * sx, point.y * sy));
        ctx.stroke();
      }
      ctx.restore();
    });
    frame.players.forEach(player => {
      const x = player.x * sx, y = player.y * sy;
      const radius = Math.max(3.2, player.radius * sx);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = player.isOffense ? this.config.player.colors.offense : this.config.player.colors.defense;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (player.hasBall) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }



  updateFrameThumbnail(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.dom.frameList.children.length) return;
    const frame = this.state.frames[frameIndex];
    const frameEl = this.dom.frameList.children[frameIndex];
    if (!frame || !frameEl) return;

    const preview = frameEl.querySelector('.frame-preview');
    if (preview) this.drawFrameThumbnail(preview, frame);

    const meta = frameEl.querySelector('.frame-thumbnail-meta');
    if (meta) {
      meta.textContent = frame.players.length + ' players · ' + frame.lines.length +
        ' actions' + (frame.notes ? ' · Notes' : '');
    }

    frameEl.setAttribute('aria-label',
      'Frame ' + (frameIndex + 1) + ': ' + frame.players.length + ' players, ' +
      frame.lines.length + ' actions' + (frame.notes ? ', has notes' : '')
    );
    const activeIndex = this.state.isAnimating
      ? this.state.currentFramePlaying
      : this.state.currentFrameIndex;
    frameEl.setAttribute('aria-pressed', String(frameIndex === activeIndex));
    frameEl.classList.toggle('active', frameIndex === activeIndex);
  }

  // ==========================================================================
  // DRAWING & CANVAS
  // ==========================================================================

  /**
   * Asynchronously loads an image from a source URL.
   * @param {string} src - The path to the image.
   * @returns {Promise<HTMLImageElement>} A promise that resolves with the loaded image.
   */
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Same-origin court artwork (including local/file-based use) must
      // load normally. Request CORS only for genuinely cross-origin URLs;
      // setting crossOrigin on local file URLs can prevent the image loading
      // at all, which makes both half- and full-court backgrounds disappear.
      const imageUrl = new URL(src, document.baseURI);
      if (imageUrl.origin !== window.location.origin && imageUrl.protocol !== 'file:') {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = src;
    });
  }

  drawToolboxIcon(iconCanvas) {
    const label = iconCanvas.dataset.player;
    const isOffense = !label.startsWith('X');
    const toolCtx = iconCanvas.getContext('2d');
    const size = iconCanvas.width;
    const radius = size / 2 - 4;
    const center = size / 2;

    toolCtx.clearRect(0, 0, size, size);
    toolCtx.beginPath();
    toolCtx.arc(center, center, radius, 0, 2 * Math.PI);
    toolCtx.fillStyle = isOffense ? this.config.player.colors.offense : this.config.player.colors.defense;
    toolCtx.fill();
    toolCtx.strokeStyle = '#000000';
    toolCtx.lineWidth = 2;
    toolCtx.stroke();

    toolCtx.fillStyle = 'white';
    toolCtx.font = 'bold 16px Arial';
    toolCtx.textAlign = 'center';
    toolCtx.textBaseline = 'middle';
    toolCtx.fillText(label, center, center);
  }

  initializeToolboxIcons() {
    this.dom.playerToolIcons.forEach(icon => {
      icon.width = 40;
      icon.height = 40;
      this.drawToolboxIcon(icon);
    });
  }

  drawWheelIcon(button) {
    const tool = button.dataset.tool;
    const titles = {
      'cut': 'Cut/Move (M)',
      'pass': 'Pass (P)',
      'screen': 'Screen (S)',
      'dribble': 'Dribble (D)',
      'shoot': 'Shoot (X)',
      'assign-ball': 'Give/Remove Ball (B)',
      'delete': 'Delete (Del/Backspace)'
    };
    button.title = titles[tool] || '';

    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 40;
    iconCanvas.height = 40;
    button.appendChild(iconCanvas);
    const iconCtx = iconCanvas.getContext('2d');
    const start = { x: 8, y: 20 };
    const end = { x: 32, y: 20 };

    iconCtx.strokeStyle = this.config.line.color;
    iconCtx.lineWidth = 3;
    iconCtx.lineCap = 'round';

    const drawArrow = (ctx, endPt, angle) => {
      const len = 8;
      ctx.beginPath();
      ctx.moveTo(endPt.x, endPt.y);
      ctx.lineTo(endPt.x - len * Math.cos(angle - Math.PI / 6), endPt.y - len * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(endPt.x, endPt.y);
      ctx.lineTo(endPt.x - len * Math.cos(angle + Math.PI / 6), endPt.y - len * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    };
    const drawScreen = (ctx, endPt) => {
      const w = 8;
      ctx.beginPath();
      ctx.moveTo(endPt.x, endPt.y - w);
      ctx.lineTo(endPt.x, endPt.y + w);
      ctx.stroke();
    };

    switch (tool) {
      case 'cut':
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y);
        iconCtx.lineTo(end.x, end.y);
        iconCtx.stroke();
        drawArrow(iconCtx, end, 0);
        break;
      case 'pass':
        iconCtx.setLineDash([3, 3]);
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y);
        iconCtx.lineTo(end.x, end.y);
        iconCtx.stroke();
        iconCtx.setLineDash([]);
        drawArrow(iconCtx, end, 0);
        break;
      case 'screen':
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y);
        iconCtx.lineTo(end.x, end.y);
        iconCtx.stroke();
        drawScreen(iconCtx, end);
        break;
      case 'dribble':
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y);
        for (let i = 1; i <= 5; i++) {
          const t = i / 5;
          const x = start.x + (end.x - start.x) * t;
          const y = start.y + Math.sin(t * Math.PI * 3) * 3;
          iconCtx.lineTo(x, y);
        }
        iconCtx.stroke();
        drawArrow(iconCtx, end, 0);
        break;
      case 'shoot':
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y - 2);
        iconCtx.lineTo(end.x, end.y - 2);
        iconCtx.stroke();
        iconCtx.beginPath();
        iconCtx.moveTo(start.x, start.y + 2);
        iconCtx.lineTo(end.x, end.y + 2);
        iconCtx.stroke();
        drawArrow(iconCtx, { x: end.x, y: end.y + 2 }, 0);
        break;
      case 'assign-ball':
        iconCtx.font = '28px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        iconCtx.textAlign = 'center';
        iconCtx.textBaseline = 'middle';
        iconCtx.fillText('🏀', 20, 21);
        break;
      case 'delete':
        iconCtx.strokeStyle = '#b91c1c';
        iconCtx.lineWidth = 4;
        iconCtx.lineCap = 'round';
        iconCtx.beginPath();
        iconCtx.moveTo(12, 12);
        iconCtx.lineTo(28, 28);
        iconCtx.moveTo(28, 12);
        iconCtx.lineTo(12, 28);
        iconCtx.stroke();
        break;
    }
  }

  initializeActionWheelIcons() {
    this.dom.wheelButtons.forEach(this.drawWheelIcon.bind(this));
  }

  drawPlayerAt(player, x, y, hasBall) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, player.radius, 0, 2 * Math.PI);
    this.ctx.fillStyle = player.isOffense ? this.config.player.colors.offense : this.config.player.colors.defense;
    this.ctx.fill();
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(player.label, x, y);

    if (hasBall) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, player.radius + this.config.player.ballIndicatorOffset, 0, 2 * Math.PI);
      this.ctx.strokeStyle = this.config.player.colors.ballHolder;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }
  }

  drawPlayers(players) {
    players.forEach(player => {
      this.drawPlayerAt(player, player.x, player.y, player.hasBall);
    });
  }

  drawAnimatedBall(x, y) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.config.player.radius / 2, 0, 2 * Math.PI);
    this.ctx.fillStyle = this.config.player.colors.ballAnimation;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(x, y, this.config.player.radius + this.config.player.ballIndicatorOffset, 0, 2 * Math.PI);
    this.ctx.strokeStyle = this.config.player.colors.ballHolder;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }

  drawArrowhead(end, angle, length = this.config.line.arrowLength) {
    const L = length;
    this.ctx.setLineDash([]);
    this.ctx.beginPath();
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(end.x - L * Math.cos(angle - Math.PI / 6), end.y - L * Math.sin(angle - Math.PI / 6));
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(end.x - L * Math.cos(angle + Math.PI / 6), end.y - L * Math.sin(angle + Math.PI / 6));
    this.ctx.stroke();
  }

  drawScreenEnd(end, angle) {
    const W = this.config.line.screenWidth;
    this.ctx.beginPath();
    const x1 = end.x - W * Math.sin(angle), y1 = end.y + W * Math.cos(angle);
    const x2 = end.x + W * Math.sin(angle), y2 = end.y - W * Math.cos(angle);
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

drawDribbleLine(start, end, drawArrow = true, context = this.ctx, scale = 1) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;

    const angle = Math.atan2(dy, dx);
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    // A smooth, repeating dribble wave. Dense samples keep the path curved
    // at every zoom level instead of looking like a polygonal zig-zag.
    const amplitude = 8 * scale;
    const wavelength = 46 * scale;
    const sampleSpacing = Math.max(1.5, 2.5 * scale);
    context.beginPath();
    context.moveTo(start.x, start.y);
    for (let travelled = sampleSpacing; travelled < distance; travelled += sampleSpacing) {
      const t = travelled / distance;
      const offset = Math.sin((travelled / wavelength) * Math.PI * 2) * amplitude;
      context.lineTo(
        start.x + dx * t + normalX * offset,
        start.y + dy * t + normalY * offset
      );
    }
    context.lineTo(end.x, end.y);
    context.stroke();
    if (drawArrow) this.drawArrowhead(end, angle);
  }

// --- IN CONSTRUCTOR ---
  // this.actionRegistry = new ActionRegistry();
  // this.actionRegistry.register('cut', this.renderCutLine);
  // this.actionRegistry.register('pass', this.renderPassLine);
  // this.actionRegistry.register('dribble', this.renderDribbleLine);
  // this.actionRegistry.register('screen', this.renderScreenLine);
  // this.actionRegistry.register('shoot', this.renderShootLine);
  // ----------------------


drawLines(lines, frame = null) {
    const sourceFrame = frame || this.state.frames[this.state.currentFrameIndex];
    if (!sourceFrame) return;
    const playerMap = new Map(sourceFrame.players.map(p => [p.id, p]));

    lines.forEach(line => {
      const { type, points, endPlayerId, id } = line;
      if (points.length < 2) return;

      const isSelected = id === this.state.selectedLineId;
      const isHovered = id === this.state.hoverLineId && !isSelected;

      this.ctx.strokeStyle = isSelected ? this.config.line.selectedColor
                     : isHovered ? this.config.line.hoverColor
                     : this.config.line.color;
      this.ctx.lineWidth = isSelected ? this.config.line.width + 2
                  : isHovered ? this.config.line.width + 1
                  : this.config.line.width;
      this.ctx.lineCap = 'round';
      if (isSelected) { this.ctx.shadowColor = this.config.line.selectedColor; this.ctx.shadowBlur = 8; }

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        let end = { ...points[i + 1] };
        const originalEnd = { ...end };

        if (i === points.length - 2 && endPlayerId) {
          const endPlayer = playerMap.get(endPlayerId);
          if (endPlayer) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Use the new geometry config
            let margin = this.config.geometry.lineEndPullback.defaultArrow;
            if (type === 'screen') margin = this.config.geometry.lineEndPullback.screen;
            if (type === 'shoot') margin = this.config.geometry.lineEndPullback.shoot;

            const pullBack = this.config.player.radius + margin;
            if (dist > pullBack) {
              const ratio = (dist - pullBack) / dist;
              end.x = start.x + dx * ratio;
              end.y = start.y + dy * ratio;
            }
          }
        }

        if (type === 'shoot') {
          const angle = Math.atan2(originalEnd.y - start.y, originalEnd.x - start.x);
          const offset = this.config.line.shootLineOffset;
          const end1 = { x: end.x + Math.sin(angle) * offset, y: end.y - Math.cos(angle) * offset };
          const end2 = { x: end.x - Math.sin(angle) * offset, y: end.y + Math.cos(angle) * offset };

          this.ctx.setLineDash([]);
          this.ctx.beginPath();
          this.ctx.moveTo(start.x + Math.sin(angle) * offset, start.y - Math.cos(angle) * offset);
          this.ctx.lineTo(end1.x, end1.y);
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.moveTo(start.x - Math.sin(angle) * offset, start.y + Math.cos(angle) * offset);
          this.ctx.lineTo(end2.x, end2.y);
          this.ctx.stroke();

          if (i === points.length - 2) {
            // One arrowhead centered over the two parallel shot lines.
            const arrowTip = { x: end.x + Math.cos(angle) * 5, y: end.y + Math.sin(angle) * 5 };
            this.drawArrowhead(arrowTip, angle, 25);
          }
          continue;
        }

        if (type === 'pass') this.ctx.setLineDash(this.config.line.passLineDash);
        else this.ctx.setLineDash([]);

        if (type === 'dribble') {
          this.drawDribbleLine(start, end, i === points.length - 2);
        } else {
          this.ctx.beginPath();
          this.ctx.moveTo(start.x, start.y);
          this.ctx.lineTo(end.x, end.y);
          this.ctx.stroke();
        }
        this.ctx.setLineDash([]);

        if (i === points.length - 2 && type !== 'dribble') {
          const angle = Math.atan2(originalEnd.y - start.y, originalEnd.x - start.x);
          if (type === 'screen') this.drawScreenEnd(end, angle);
          else this.drawArrowhead(end, angle);
        }
      }
      this.ctx.shadowBlur = 0;
    });
    this.ctx.setLineDash([]);
  }

  /**
   * Main render loop. Clears canvas, draws court, lines, and players.
   */
  drawCourtBackground(ctx, courtType, width, height) {
    // NFHS court geometry: 84 ft x 50 ft at 18 px/ft (1.5 px/in).
    // The logical canvas is exactly 1512 x 900; court lines are 3 px wide.
    const sx = width / 1512;
    const sy = height / 900;
    ctx.save();
    ctx.scale(sx, sy);

    const floor = ctx.createLinearGradient(0, 0, 1512, 900);
    floor.addColorStop(0, '#b58c62');
    floor.addColorStop(0.48, '#d0ad7f');
    floor.addColorStop(1, '#a77d54');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, 1512, 900);
    for (let x = 0; x <= 1512; x += 36) {
      ctx.fillStyle = (x / 36) % 2 ? 'rgba(92,57,30,0.045)' : 'rgba(255,245,220,0.07)';
      ctx.fillRect(x, 0, 18, 900);
      ctx.strokeStyle = 'rgba(85,55,32,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 900);
      ctx.stroke();
    }
    for (let y = 45; y < 900; y += 108) {
      ctx.strokeStyle = 'rgba(255,245,220,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1512, y + 3);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const line = (x1, y1, x2, y2) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    const arc = (x, y, r, start, end, anticlockwise = false) => {
      ctx.beginPath(); ctx.arc(x, y, r, start, end, anticlockwise); ctx.stroke();
    };
    const drawEnd = (baselineX, direction) => {
      const rimX = baselineX + direction * 94.5;
      const keyX = baselineX + direction * 342;
      const freeThrowX = baselineX + direction * 340.5;

      // Backboard face is 4 ft from the baseline; rim center is 5 ft 3 in.
      line(baselineX + direction * 72, 396, baselineX + direction * 72, 504);
      arc(rimX, 450, 13.5, 0, Math.PI * 2);
      arc(rimX, 450, 72, -Math.PI / 2, Math.PI / 2);

      // Lane / paint: 19 ft long x 12 ft wide.
      ctx.strokeRect(
        Math.min(baselineX, keyX),
        342,
        342,
        216
      );
      // Free-throw circle; the half inside the lane is normally solid,
      // with the outer half dashed.
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(freeThrowX, 450, 108, -Math.PI / 2, Math.PI / 2, direction < 0);
      ctx.stroke();
      ctx.setLineDash([9, 9]);
      ctx.beginPath();
      ctx.arc(freeThrowX, 450, 108, Math.PI / 2, -Math.PI / 2, direction < 0);
      ctx.stroke();
      ctx.setLineDash([]);

      // NFHS three-point corner lines and 19 ft 9 in arc.
      line(baselineX, 94.5, rimX, 94.5);
      line(baselineX, 805.5, rimX, 805.5);
      ctx.beginPath();
      if (direction > 0) {
        ctx.arc(rimX, 450, 355.5, -Math.PI / 2, Math.PI / 2);
      } else {
        ctx.arc(rimX, 450, 355.5, Math.PI / 2, 3 * Math.PI / 2);
      }
      ctx.stroke();

      // Lane-space hash marks, neutral block, and coach's box sideline hashes.
      [126, 180, 234, 288].forEach((distance, index) => {
        const x = baselineX + direction * distance;
        line(x, 342, x, 330);
        line(x, 558, x, 570);
        if (index === 0) {
          ctx.strokeRect(x - 9, 330, 18, 12);
          ctx.strokeRect(x - 9, 558, 18, 12);
        }
      });
      line(baselineX + direction * 504, 0, baselineX + direction * 504, 12);
      line(baselineX + direction * 504, 888, baselineX + direction * 504, 900);
    };

    // Boundary dimensions are measured inside-edge to inside-edge. The 3 px
    // boundary stroke is centered on the playing-surface edge.
    ctx.strokeRect(1.5, 1.5, 1509, 897);
    if (courtType === 'full') {
      line(756, 0, 756, 900);
      arc(756, 450, 108, 0, Math.PI * 2);
      drawEnd(0, 1);
      drawEnd(1512, -1);
    } else {
      // Half-court mode shows the left 42 ft half, using the same exact
      // full-court coordinate system and scale as full-court mode.
      drawEnd(0, 1);
      line(756, 0, 756, 900);
      arc(756, 450, 108, -Math.PI / 2, Math.PI / 2);
    }
    ctx.restore();
  }

  draw() {
    this.drawCourtBackground(this.ctx, this.state.courtType, this.config.canvas.width, this.config.canvas.height);

    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;

    this.drawLines(currentFrame.lines);
    if (this.state.previewLine) {
      this.drawLines([this.state.previewLine]);
    }
    this.drawPlayers(currentFrame.players);
    this.drawSelectedPlayerIndicator(currentFrame);
    this.drawPlacementCursor();
  }

  drawSelectedPlayerIndicator(frame) {
    const player = frame.players.find(item => item.id === this.state.selectedPlayerId);
    if (!player) return;
    this.ctx.save();
    this.ctx.strokeStyle = '#d97706';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([4, 3]);
    this.ctx.beginPath();
    this.ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawPlacementCursor() {
    const label = this.state.placementPlayerLabel;
    if (!label) return;
    const { x, y } = this.state.placementCursor;
    this.ctx.save();
    this.ctx.setLineDash([5, 4]);
    this.ctx.strokeStyle = '#d97706';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.config.player.radius + 5, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 0.75;
    this.drawPlayerAt({ radius: this.config.player.radius, isOffense: !label.startsWith('X'), label }, x, y, false);
    this.ctx.restore();
  }

  /**
   * [REFACTOR] Centralized animation rendering logic.
   * This is called by both handleAnimate and handleExportVideo to stay DRY.
   * @param {number} progress - The animation progress (0.0 to 1.0).
   * @param {object} frame - The current frame object to render.
   */
  _renderAnimationFrame(progress, frame) {
    this.drawCourtBackground(this.ctx, this.state.courtType, this.config.canvas.width, this.config.canvas.height);

    this.drawLines(frame.lines, frame);

    const moveLines = new Map();
    const passLines = new Map();
    const shootLines = new Map();
    frame.lines.forEach(line => {
      if (!line.startPlayerId) return;
      if (['cut', 'dribble', 'move', 'screen'].includes(line.type)) moveLines.set(line.startPlayerId, line);
      else if (line.type === 'pass') passLines.set(line.startPlayerId, line);
      else if (line.type === 'shoot') shootLines.set(line.startPlayerId, line);
    });

    frame.players.forEach(player => {
      let drawX = player.x, drawY = player.y, hasBall = player.hasBall;
      const moveLine = moveLines.get(player.id);
      const passLine = passLines.get(player.id);
      const shootLine = shootLines.get(player.id);

      if (moveLine) {
        const pathLength = this.getPathLength(moveLine.points);
        const distanceToTravel = pathLength * progress;
        const newPos = this.getPointAlongPath(moveLine.points, distanceToTravel);
        drawX = newPos.x;
        drawY = newPos.y;
      }
      if (passLine && progress < 1.0) {
        hasBall = false;
        const passPathLength = this.getPathLength(passLine.points);
        const ballPos = this.getPointAlongPath(passLine.points, passPathLength * progress);
        this.drawAnimatedBall(ballPos.x, ballPos.y);
      }
      if (shootLine && progress < 1.0) {
        hasBall = false;
        const shootPathLength = this.getPathLength(shootLine.points);
        const ballPos = this.getPointAlongPath(shootLine.points, shootPathLength * progress);
        this.drawAnimatedBall(ballPos.x, ballPos.y);
      }
      this.drawPlayerAt(player, drawX, drawY, hasBall);
    });
  }

  /**
   * Schedules a draw call using requestAnimationFrame to prevent layout thrashing.
   */
  scheduleDraw() {
    if (!this.state.pendingRedraw) {
      this.state.pendingRedraw = true;
      requestAnimationFrame(() => {
        this.draw();
        this.state.pendingRedraw = false;
      });
    }
  }

  // ==========================================================================
  // CORE LOGIC & ACTIONS
  // ==========================================================================

switchFrame(newFrameIndex, options = {}) {
    if (options.flushNotes !== false) this.flushPendingNotes();
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.clearPlacementSelection();
    this.hideActionWheelImmediate();
    this.state.selectedPlayerId = null;
    if (newFrameIndex < 0 || newFrameIndex >= this.state.frames.length) {
      newFrameIndex = Math.max(0, this.state.frames.length - 1);
    }
    this.state.currentFrameIndex = newFrameIndex;
    if (this.state.frames.length > 0 && this.state.frames[newFrameIndex]) {
      this.renderFrameList();
      this.draw();
      this.dom.frameNotes.value = this.state.frames[newFrameIndex].notes || '';
    } else {
      this.handleNewPlay(false);
    }
  }



  showActionWheel(player, viewportX, viewportY) {
    this.state.selectedPlayerId = player.id;
    const courtRect = this.dom.courtContainer.getBoundingClientRect();
    const canvasRect = this.dom.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.config.canvas.width;
    const scaleY = canvasRect.height / this.config.canvas.height;
    const canvasLeft = canvasRect.left - courtRect.left;
    const canvasTop = canvasRect.top - courtRect.top;
    const playerX = canvasLeft + player.x * scaleX;
    const playerY = canvasTop + player.y * scaleY;
    this.dom.actionWheel.classList.remove('hidden');
    this.dom.actionWheel.classList.add('visible');
    const width = this.dom.actionWheel.offsetWidth;
    const height = this.dom.actionWheel.offsetHeight;
    const safe = 8;
    const maxX = Math.max(safe, courtRect.width - width - safe);
    const maxY = Math.max(safe, courtRect.height - height - safe);
    const x = Math.max(safe, Math.min(maxX, playerX - width / 2));
    const y = Math.max(safe, Math.min(maxY, playerY - height / 2));
    this.dom.actionWheel.style.left = x + 'px';
    this.dom.actionWheel.style.top = y + 'px';
    this.dom.canvas.focus();
    this.draw();
    this.setInstruction('Choose an action. Drag to move, or use the keyboard shortcuts.');
  }



  hideActionWheel() {
    this.state.selectedPlayerId = null;
    this.dom.actionWheel.classList.remove('visible');
    this.draw();
    setTimeout(() => {
      if (!this.dom.actionWheel.classList.contains('visible')) {
        this.dom.actionWheel.classList.add('hidden');
      }
    }, 150);
  }

  hideActionWheelImmediate() {
    this.dom.actionWheel.classList.remove('visible');
    this.dom.actionWheel.classList.add('hidden');
  }

  cancelDrawingInteraction(message = '') {
    this.state.lastClickTime = 0;
    this.state.isDrawingLine = false;
    this.state.keyboardCursor = null;
    this.state.previewLine = null;
    this.state.activeLineTool = null;
    this.dom.canvas.classList.remove('drawing-line');
    if (message) this.setInstruction(message);
  }

  cancelPlayerDrag() {
    if (!this.state.isDragging) return;
    const player = this.state.draggingPlayer;
    if (player) {
      player.x = this.state.dragStartPlayerX;
      player.y = this.state.dragStartPlayerY;
    }
    this.state.isDragging = false;
    this.state.draggingPlayer = null;
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
    this.scheduleDraw();
  }

  clearPlacementSelection() {
    this.state.placementPlayerLabel = null;
    this.dom.playerToolIcons.forEach(icon => {
      icon.classList.remove('selected');
      icon.setAttribute('aria-pressed', 'false');
    });
  }

  selectPlacementPlayer(label) {
    if (!/^(?:[1-5]|X[1-5])$/.test(label) || this.state.isAnimating || this.state.isExporting) return;
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.hideActionWheelImmediate();
    this.state.selectedPlayerId = null;
    this.clearPlacementSelection();
    this.state.placementPlayerLabel = label;
    this.state.placementCursor = { x: 756, y: 450 };
    const icon = Array.from(this.dom.playerToolIcons).find(item => item.dataset.player === label);
    if (icon) {
      icon.classList.add('selected');
      icon.setAttribute('aria-pressed', 'true');
    }
    this.dom.canvas.focus();
    this.draw();
    this.setInstruction('Player ' + label + ' selected. Tap the court to place, or use arrow keys and Enter.');
  }

  handlePlayerPaletteClick = (e) => {
    this.selectPlacementPlayer(e.currentTarget.dataset.player);
  }

  placeSelectedPlayerAt(x, y, viewportX = null, viewportY = null) {
    const label = this.state.placementPlayerLabel;
    if (!label) return false;
    const player = this.createPlayerAt(x, y, label);
    if (!player) return false;
    this.clearPlacementSelection();
    this.draw();
    this.saveState();
    if (viewportX === null || viewportY === null) {
      const rect = this.dom.canvas.getBoundingClientRect();
      viewportX = rect.left + player.x * (rect.width / this.config.canvas.width);
      viewportY = rect.top + player.y * (rect.height / this.config.canvas.height);
    }
    this.showActionWheel(player, viewportX, viewportY);
    return true;
  }

  /**
   * Creates a new player on the current frame at the specified coordinates.
   * @param {number} x - The canvas x-coordinate.
   * @param {number} y - The canvas y-coordinate.
   * @param {string} playerLabel - The label for the new player (e.g., "1", "X1").
   * @returns {object|null} The new player object or null if player exists.
   */
  createPlayerAt(x, y, playerLabel) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame || !/^(?:[1-5]|X[1-5])$/.test(playerLabel)) return null;

    const playerExists = currentFrame.players.some(p => p.label === playerLabel);
    if (playerExists) {
      this.showAlert(`Player ${playerLabel} is already on the court.`);
      return null;
    }

    const position = this.clampCourtPoint(x, y, this.config.player.radius);
    const newPlayer = {
      id: this.state.nextPlayerId++,
      label: playerLabel,
      isOffense: !playerLabel.startsWith('X'),
      x: position.x,
      y: position.y,
      radius: this.config.player.radius,
      hasBall: false
    };

    currentFrame.players.push(newPlayer);
    return newPlayer;
  }

  addWaypoint(x, y) {
    const playerAtWaypoint = this.getPlayerAtCoord(x, y);
    const newPoint = playerAtWaypoint
      ? { x: playerAtWaypoint.x, y: playerAtWaypoint.y }
      : this.clampCourtPoint(x, y);

    this.state.previewLine.points.splice(this.state.previewLine.points.length - 1, 0, newPoint);
    this.state.keyboardCursor = { x: newPoint.x, y: newPoint.y };
    this.draw();
  }

  finalizePreviewLine(x, y) {
    this.state.isDrawingLine = false;
    const finalLine = this.state.previewLine;
    if (!finalLine || !Array.isArray(finalLine.points)) {
      this.cancelDrawingInteraction();
      this.draw();
      return;
    }
    finalLine.points.pop();

    const playerAtEnd = this.getPlayerAtCoord(x, y);
    const finalPoint = playerAtEnd
      ? { x: playerAtEnd.x, y: playerAtEnd.y }
      : this.clampCourtPoint(x, y);

    if (finalLine.points.length > 1) {
      const lastWaypoint = finalLine.points[finalLine.points.length - 1];
      const dist = Math.hypot(finalPoint.x - lastWaypoint.x, finalPoint.y - lastWaypoint.y);
      if (dist < this.config.interaction.clickTolerance) finalLine.points.pop();
    }

    if (playerAtEnd) {
      finalLine.points.push(finalPoint);
      finalLine.endPlayerId = playerAtEnd.id;
    } else {
      finalLine.points.push(finalPoint);
    }

    const pathLength = this.getPathLength(finalLine.points);
    let committed = false;
    if (finalLine.points.length >= 2 && pathLength > 1) {
      const frame = this.state.frames[this.state.currentFrameIndex];
      frame.lines = frame.lines.filter(line => line.startPlayerId !== finalLine.startPlayerId);
      frame.lines.push(finalLine);
      committed = true;
    }

    this.state.previewLine = null;
    this.state.keyboardCursor = null;
    this.dom.canvas.classList.remove('drawing-line');
    this.draw();
    if (committed) {
      this.setInstruction('Action created. Select a player to add another action.');
      this.saveState();
    } else {
      this.setInstruction('Action cancelled. Choose a destination farther from the starting point.');
    }
  }

stopAnimation() {
    if (this.state.isAnimating) {
      if (this.state.animationFrameId) {
        cancelAnimationFrame(this.state.animationFrameId);
        this.state.animationFrameId = null;
      }
      this.state.isAnimating = false;
      this.state.animationStartTime = 0;
      this.state.currentFramePlaying = 0;
      this.dom.animateBtn.textContent = 'Animate';
      this.dom.animateBtn.classList.remove('btn-danger');
      this.dom.animateBtn.classList.add('btn-primary');
      this.renderFrameList();
      this.draw();
    }
  }



  clampCourtPoint(x, y, radius = 0) {
    const safeRadius = Math.max(0, Math.min(radius, this.config.canvas.width / 2, this.config.canvas.height / 2));
    return {
      x: Math.max(safeRadius, Math.min(this.config.canvas.width - safeRadius, x)),
      y: Math.max(safeRadius, Math.min(this.config.canvas.height - safeRadius, y))
    };
  }

  getMousePos(e) {
    const rect = this.dom.canvas.getBoundingClientRect();
    const scaleX = this.config.canvas.width / rect.width;
    const scaleY = this.config.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return { x: x, y: y, viewportX: e.clientX, viewportY: e.clientY };
  }

  getTouchPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.dom.canvas.getBoundingClientRect();
    const scaleX = this.config.canvas.width / rect.width;
    const scaleY = this.config.canvas.height / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    return { x: x, y: y, viewportX: touch.clientX, viewportY: touch.clientY };
  }

  getPlayerAtCoord(x, y) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return null;
    for (let i = currentFrame.players.length - 1; i >= 0; i--) {
      const p = currentFrame.players[i];
      if (Math.hypot(x - p.x, y - p.y) < p.radius) return p;
    }
    return null;
  }

  getLineAtCoord(x, y) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return null;
    for (const line of currentFrame.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (!lenSq) continue;
        let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = p1.x + t * dx;
        const cy = p1.y + t * dy;
        const dSq = (x - cx) ** 2 + (y - cy) ** 2;
        if (Math.sqrt(dSq) < this.config.line.clickTolerance) return line;
      }
    }
    return null;
  }

  getPathLength(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDistance;
  }

  getPointAlongPath(points, distanceToTravel) {
    if (distanceToTravel <= 0) return { ...points[0] };
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      if (segmentLength === 0) continue;
      if (distanceToTravel <= segmentLength) {
        const ratio = distanceToTravel / segmentLength;
        return { x: start.x + dx * ratio, y: start.y + dy * ratio };
      }
      distanceToTravel -= segmentLength;
    }
    return { ...points[points.length - 1] };
  }
shouldSaveState() {
    return !this.state.isAnimating && !this.state.isExporting;
  }

  // ==========================================================================
  // EVENT HANDLER METHODS
  // [REFACTOR] Converted to arrow functions to auto-bind `this`.
  // ==========================================================================

  bindEventHandlers() {
    // [REFACTOR] All `.bind(this)` calls are removed as methods are
    // now arrow functions.
    this.dom.newPlayBtn.addEventListener('click', () => this.handleNewPlay(true));
    this.dom.clearFrameBtn.addEventListener('click', this.handleClearFrame);
    this.dom.saveBtn.addEventListener('click', this.handleSave);
    this.dom.loadBtn.addEventListener('click', () => this.dom.loadFileInput.click());
    this.dom.exportPdfBtn.addEventListener('click', this.handleExportPDF);
    this.dom.exportVideoBtn.addEventListener('click', this.handleExportVideo);
    this.dom.exportDownloadDismiss.addEventListener('click', () => this.clearExportDownload());
    this.dom.addFrameBtn.addEventListener('click', this.handleAddFrame);
    this.dom.deleteFrameBtn.addEventListener('click', this.handleDeleteFrame);
    this.dom.undoBtn.addEventListener('click', this.undo);
    this.dom.redoBtn.addEventListener('click', this.redo);
    this.dom.animateBtn.addEventListener('click', this.handleAnimate);

    document.addEventListener('keydown', this.handleKeyDown);

    this.dom.courtToggle.addEventListener('change', (e) => {
      if (this.state.isAnimating || this.state.isExporting) {
        e.target.value = this.state.courtType;
        return;
      }
      this.state.courtType = e.target.value;
      this.markDirty();
      this.renderFrameList();
      this.draw();
    });
    this.dom.playNameInput.addEventListener('input', () => this.markDirty());

    this.dom.frameList.addEventListener('click', this.handleFrameListClick);
    this.dom.frameNotes.addEventListener('input', this.handleNotesInput);
    this.dom.loadFileInput.addEventListener('change', this.handleLoadFile);

    // Canvas Listeners
    this.dom.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.dom.canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
    this.dom.canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
    this.dom.canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
    this.dom.canvas.addEventListener('touchstart', this.handleCanvasTouchStart, { passive: false });
    this.dom.canvas.addEventListener('touchmove', this.handleCanvasTouchMove, { passive: false });
    this.dom.canvas.addEventListener('touchend', this.handleCanvasTouchEnd, { passive: false });
    this.dom.canvas.addEventListener('dragover', this.handleDragOver);
    this.dom.canvas.addEventListener('dragleave', this.handleDragLeave);
    this.dom.canvas.addEventListener('drop', this.handleDrop);
    this.dom.canvas.addEventListener('mouseout', () => this.dom.canvas.classList.remove('drag-over'));

    // Document-level listeners for drag robustness
    document.addEventListener('mousemove', this.onDocumentMouseMove);
    document.addEventListener('mouseup', this.onDocumentMouseUp);

    // Wheel actions
    this.dom.actionWheel.addEventListener('click', this.handleWheelClick);

    // Global click listener
    document.addEventListener('click', (e) => {
      if (!this.dom.actionWheel.contains(e.target) &&
          !this.dom.canvas.contains(e.target) &&
          this.dom.actionWheel.classList.contains('visible')) {
        this.hideActionWheel();
      }
    });

    // Toolbox DnD
    this.dom.playerToolIcons.forEach(icon => {
      icon.addEventListener('dragstart', this.handlePlayerDragStart);
      icon.addEventListener('dragend', this.handlePlayerDragEnd);
      icon.addEventListener('click', this.handlePlayerPaletteClick);
      icon.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          this.selectPlacementPlayer(icon.dataset.player);
        }
      });
    });
  }

  handleNewPlay = (confirmFirst = true) => {
    if (this.state.isExporting) return;
    this.flushPendingNotes();
    if (confirmFirst && this.state.isDirty &&
        !confirm('Start a new play? Unsaved changes, including notes, will be lost.')) return;
    this.clearAutosave();
    if (this.state.isAnimating) this.stopAnimation();
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.clearPlacementSelection();
    this.hideActionWheelImmediate();
    this.state = this.createInitialState();
    this.lineIdCounter = 1;
    this.dom.playNameInput.value = '';
    this.dom.courtToggle.value = 'half';
    this.updateSaveStatus();
    this.renderFrameList();
    this.switchFrame(0, { flushNotes: false });
    this.setInstruction('Select a player to tap-to-place, or drag one onto the court.');
    this.updateHistoryButtons();
  }



  handleAddFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.flushPendingNotes();
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.clearPlacementSelection();

    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;

    const newFrame = PlayData.createNextFrame(currentFrame, this.state.nextFrameId++);
    this.state.frames.push(newFrame);
    this.switchFrame(this.state.frames.length - 1, { flushNotes: false });
    this.saveState();
  }



  handleDeleteFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (this.state.frames.length <= 1) {
      this.showAlert('You cannot delete the last frame.');
      return;
    }
    if (!confirm('Delete this frame?')) return;

    this.flushPendingNotes();
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.clearPlacementSelection();
    this.hideActionWheelImmediate();
    const deletedFrameIndex = this.state.currentFrameIndex;
    this.state.frames.splice(deletedFrameIndex, 1);
    const newIndex = Math.max(0, deletedFrameIndex - 1);
    this.switchFrame(newIndex, { flushNotes: false });
    this.saveState();
  }



  handleClearFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (!confirm('Clear all players, action lines, and notes from this frame?')) return;

    this.flushPendingNotes();
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.clearPlacementSelection();
    this.hideActionWheelImmediate();
    this.state.selectedPlayerId = null;
    this.state.selectedLineId = null;
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (currentFrame) {
      currentFrame.players = [];
      currentFrame.lines = [];
      currentFrame.notes = '';
      this.dom.frameNotes.value = '';
    }
    this.state.pendingNoteSave = false;
    this.draw();
    this.saveState();
    this.setInstruction('Frame cleared');
  }



  handleWheelClick = (e) => {
    const button = e.target.closest('.wheel-button');
    if (button) {
      this.handleWheelAction(button.dataset.tool);
    }
  }

  handleWheelAction(tool) {
    if (this.state.isAnimating || this.state.isExporting) return;
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;
    const player = currentFrame.players.find(p => p.id === this.state.selectedPlayerId);
    if (!player) return;

    this.hideActionWheelImmediate();

    if (tool === 'delete') {
      currentFrame.players = currentFrame.players.filter(p => p.id !== player.id);
      currentFrame.lines = currentFrame.lines.filter(line =>
        line.startPlayerId !== player.id && line.endPlayerId !== player.id
      );
      this.state.selectedPlayerId = null;
      this.draw();
      this.saveState();
      this.setInstruction('Player deleted');
      return;
    }

    if (tool === 'assign-ball') {
      const shouldAssign = !player.hasBall;
      currentFrame.players.forEach(currentPlayer => { currentPlayer.hasBall = false; });
      player.hasBall = shouldAssign;
      this.draw();
      this.saveState();
      this.setInstruction(player.hasBall ? 'Ball assigned' : 'Ball removed');
      return;
    }

    if (['shoot', 'pass'].includes(tool) && !player.hasBall) {
      this.setInstruction("That player doesn't have the ball!");
      return;
    }

    this.cancelDrawingInteraction();
    this.state.isDrawingLine = true;
    this.state.activeLineTool = tool;
    this.state.keyboardCursor = { x: player.x, y: player.y };
    this.state.previewLine = {
      id: this.lineIdCounter++,
      type: tool,
      startPlayerId: player.id,
      points: [{ x: player.x, y: player.y }, { x: player.x, y: player.y }]
    };
    this.dom.canvas.focus();
    this.setInstruction(`Drawing ${tool}. Click to add points, double-click to finish. Keyboard: arrows to move, Enter for a point, Shift+Enter to finish, Escape to cancel.`);
    this.dom.canvas.classList.add('drawing-line');
    this.draw();
  }

  handleFrameListClick = (e) => {
    if (this.state.isAnimating || this.state.isExporting) return;
    const clickedFrame = e.target.closest('.frame-thumbnail');
    if (!clickedFrame) return;
    const frameId = parseInt(clickedFrame.dataset.frameId, 10);
    const frameIndex = this.state.frames.findIndex(f => f.id === frameId);
    if (frameIndex !== -1) this.switchFrame(frameIndex);
  }

  handleNotesInput = () => {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;
    currentFrame.notes = this.dom.frameNotes.value;
    this.updateFrameThumbnail(this.state.currentFrameIndex);
    this.state.pendingNoteSave = true;
    this.markDirty();
    clearTimeout(this.state.noteDebounceTimer);
    this.state.noteDebounceTimer = setTimeout(() => {
      this.state.noteDebounceTimer = null;
      this.state.pendingNoteSave = false;
      this.saveState();
    }, this.config.history.noteDebounceDelay);
  }



  selectPlayerByKeyboard(direction = 1) {
    const frame = this.state.frames[this.state.currentFrameIndex];
    if (!frame || frame.players.length === 0) {
      this.setInstruction('Add a player before choosing an action.');
      return;
    }
    const currentIndex = frame.players.findIndex(player => player.id === this.state.selectedPlayerId);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : frame.players.length - 1)
      : (currentIndex + direction + frame.players.length) % frame.players.length;
    const player = frame.players[nextIndex];
    const rect = this.dom.canvas.getBoundingClientRect();
    const viewportX = rect.left + player.x * (rect.width / this.config.canvas.width);
    const viewportY = rect.top + player.y * (rect.height / this.config.canvas.height);
    this.showActionWheel(player, viewportX, viewportY);
    this.setInstruction('Selected player ' + player.label + '. Use an action shortcut or Tab to the action buttons.');
  }

  handleKeyDown = (e) => {
    const target = e.target;
    const isTyping = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (isTyping) return;

    if (this.state.placementPlayerLabel) {
      const key = e.key.toLowerCase();
      const step = e.shiftKey ? 25 : 10;
      if (key.startsWith('arrow')) {
        const delta = {
          arrowleft: [-step, 0], arrowright: [step, 0],
          arrowup: [0, -step], arrowdown: [0, step]
        }[key];
        const cursor = this.state.placementCursor;
        this.state.placementCursor = this.clampCourtPoint(cursor.x + delta[0], cursor.y + delta[1], this.config.player.radius);
        this.draw();
        e.preventDefault();
        return;
      }
      if (key === 'enter' || key === ' ') {
        this.placeSelectedPlayerAt(this.state.placementCursor.x, this.state.placementCursor.y);
        e.preventDefault();
        return;
      }
      if (key === 'escape') {
        this.clearPlacementSelection();
        this.draw();
        this.setInstruction('Player placement cancelled');
        e.preventDefault();
        return;
      }
    }

    if (this.state.isDrawingLine && this.state.keyboardCursor) {
      const key = e.key.toLowerCase();
      const step = e.shiftKey ? 25 : 10;
      if (key.startsWith('arrow')) {
        const delta = {
          arrowleft: [-step, 0], arrowright: [step, 0],
          arrowup: [0, -step], arrowdown: [0, step]
        }[key];
        const position = this.clampCourtPoint(
          this.state.keyboardCursor.x + delta[0],
          this.state.keyboardCursor.y + delta[1]
        );
        this.state.keyboardCursor = position;
        this.state.previewLine.points[this.state.previewLine.points.length - 1] = position;
        this.draw();
        e.preventDefault();
        return;
      }
      if (key === 'enter') {
        if (e.shiftKey) {
          this.finalizePreviewLine(this.state.keyboardCursor.x, this.state.keyboardCursor.y);
        } else {
          this.addWaypoint(this.state.keyboardCursor.x, this.state.keyboardCursor.y);
        }
        e.preventDefault();
        return;
      }
      if (key === 'escape') {
        this.cancelDrawingInteraction('Action cancelled');
        this.draw();
        e.preventDefault();
        return;
      }
    }

    if (!this.state.isDrawingLine && !this.state.placementPlayerLabel &&
        !this.state.isAnimating && !this.state.isExporting &&
        e.target === this.dom.canvas) {
      const key = e.key.toLowerCase();
      const direction = {
        arrowright: 1,
        arrowdown: 1,
        arrowleft: -1,
        arrowup: -1
      }[key];
      if (direction) {
        this.selectPlayerByKeyboard(direction);
        e.preventDefault();
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        return;
      }
      if (key === 'y') { e.preventDefault(); this.redo(); return; }
    }

    if (this.state.selectedPlayerId) {
      const key = e.key.toLowerCase();
      const toolMap = {
        m: 'cut', p: 'pass', s: 'screen', d: 'dribble',
        x: 'shoot', b: 'assign-ball', delete: 'delete', backspace: 'delete'
      };
      if (toolMap[key]) {
        e.preventDefault();
        this.handleWheelAction(toolMap[key]);
      } else if (key === 'escape') {
        e.preventDefault();
        this.hideActionWheel();
      }
    }

    if (this.state.isDrawingLine && e.key === 'Escape') {
      e.preventDefault();
      this.cancelDrawingInteraction('Line cancelled');
      this.draw();
    }
  }



  handleAnimate = () => {
    if (this.state.isExporting) return;
    if (this.state.isAnimating) {
      this.stopAnimation();
    } else {
      if (this.state.frames.length < 2) {
        this.showAlert('You need at least two frames to animate.');
        return;
      }
      this.flushPendingNotes();
      this.cancelPlayerDrag();
      this.cancelDrawingInteraction();
      this.clearPlacementSelection();
      this.hideActionWheelImmediate();
      this.state.selectedPlayerId = null;
      this.state.selectedLineId = null;
      this.state.isAnimating = true;
      this.state.currentFramePlaying = 0;
      this.state.animationStartTime = 0;
      this.dom.animateBtn.textContent = 'Stop';
      this.dom.animateBtn.classList.remove('btn-primary');
      this.dom.animateBtn.classList.add('btn-danger');
      this.renderFrameList();

      const animatePlay = (timestamp) => {
        if (!this.state.isAnimating) return; // Stopped externally
        if (this.state.animationStartTime === 0) this.state.animationStartTime = timestamp;
        const elapsed = timestamp - this.state.animationStartTime;
        const progress = Math.min(1.0, elapsed / this.config.animation.speed);
        const frameA = this.state.frames[this.state.currentFramePlaying];
        if (!frameA) { this.stopAnimation(); return; }

        // [REFACTOR] Use centralized render method
        this._renderAnimationFrame(progress, frameA);

        if (progress < 1.0) {
          this.state.animationFrameId = requestAnimationFrame(animatePlay);
        } else {
          this.state.currentFramePlaying++;
          this.state.animationStartTime = 0;
          if (this.state.currentFramePlaying >= this.state.frames.length) {
            this.stopAnimation();
            this.switchFrame(this.state.frames.length - 1);
          } else {
            this.renderFrameList();
            this.state.animationFrameId = requestAnimationFrame(animatePlay);
          }
        }
      }
      this.state.animationFrameId = requestAnimationFrame(animatePlay);
    }
  }

  // --- Pointer Handlers (Mouse & Touch) ---

  handleCanvasPointerDown = (x, y, viewportX, viewportY, e) => {
    if (this.state.isAnimating || this.state.isExporting) return;

    if (this.state.placementPlayerLabel) {
      this.placeSelectedPlayerAt(x, y, viewportX, viewportY);
      return;
    }

    if (this.state.isDrawingLine) {
      const now = Date.now();
      if (now - this.state.lastClickTime < this.config.interaction.doubleClickTime) {
        e.preventDefault();
        this.finalizePreviewLine(x, y);
      } else {
        this.addWaypoint(x, y);
      }
      this.state.lastClickTime = now;
      return;
    }

    // Players take priority over action lines because every action begins at
    // its actor. This keeps a player selectable even when a line touches them.
    const playerAtStart = this.getPlayerAtCoord(x, y);
    if (playerAtStart) {
      this.state.isDragging = true;
      this.state.draggingPlayer = playerAtStart;
      this.state.dragStartPlayerX = playerAtStart.x;
      this.state.dragStartPlayerY = playerAtStart.y;
      this.state.dragOffsetX = x - playerAtStart.x;
      this.state.dragOffsetY = y - playerAtStart.y;
      this.state.selectedPlayerId = playerAtStart.id;
      this.hideActionWheelImmediate();

      document.addEventListener('mousemove', this.onDocumentMouseMove);
      document.addEventListener('mouseup', this.onDocumentMouseUp);
      e.preventDefault();
      return;
    }

    const clickedLine = this.getLineAtCoord(x, y);
    if (clickedLine) {
      const currentFrame = this.state.frames[this.state.currentFrameIndex];
      currentFrame.lines = currentFrame.lines.filter(line => line.id !== clickedLine.id);
      this.state.selectedLineId = null;
      this.draw();
      this.saveState();
      this.setInstruction('Action deleted. Use Undo to restore it.');
      return;
    }

    this.state.selectedPlayerId = null;
    this.hideActionWheel();
    this.scheduleDraw();
  }

  handleCanvasPointerMove = (x, y) => {
    if (this.state.isAnimating || this.state.isExporting) return;

    if (!this.state.isDragging && !this.state.isDrawingLine) {
      const hovered = this.getLineAtCoord(x, y);
      const newHoverId = hovered ? hovered.id : null;
      if (newHoverId !== this.state.hoverLineId) {
        this.state.hoverLineId = newHoverId;
        this.dom.canvas.style.cursor = newHoverId ? 'pointer' : 'default';
        this.scheduleDraw();
      }
    }

    if (this.state.isDragging && this.state.draggingPlayer) {
      const position = this.clampCourtPoint(
        x - this.state.dragOffsetX,
        y - this.state.dragOffsetY,
        this.state.draggingPlayer.radius
      );
      this.state.draggingPlayer.x = position.x;
      this.state.draggingPlayer.y = position.y;
      this.scheduleDraw();
    } else if (this.state.isDrawingLine) {
      const position = this.clampCourtPoint(x, y);
      this.state.previewLine.points[this.state.previewLine.points.length - 1] = position;
      this.state.keyboardCursor = { x: position.x, y: position.y };
      this.scheduleDraw();
    }
  }

  handleCanvasPointerUp = (x, y, viewportX, viewportY) => {
    if (this.state.isAnimating || this.state.isExporting) return;

    if (this.state.isDragging) {
      const draggedPlayer = this.state.draggingPlayer;
      this.state.isDragging = false;
      this.state.draggingPlayer = null;

      const moved = Math.hypot(
        draggedPlayer.x - this.state.dragStartPlayerX,
        draggedPlayer.y - this.state.dragStartPlayerY
      ) > 0.1;
      if (moved) this.saveState();

      this.showActionWheel(draggedPlayer, viewportX, viewportY);
      this.scheduleDraw();

      document.removeEventListener('mousemove', this.onDocumentMouseMove);
      document.removeEventListener('mouseup', this.onDocumentMouseUp);
    }
  }

  // --- Mouse Adapters ---
  handleCanvasMouseDown = (e) => {
    const { x, y, viewportX, viewportY } = this.getMousePos(e);
    this.handleCanvasPointerDown(x, y, viewportX, viewportY, e);
  }
  handleCanvasMouseMove = (e) => {
    const { x, y } = this.getMousePos(e);
    this.handleCanvasPointerMove(x, y);
  }
  handleCanvasMouseUp = (e) => {
    const { x, y, viewportX, viewportY } = this.getMousePos(e);
    this.handleCanvasPointerUp(x, y, viewportX, viewportY);
  }

  // --- Touch Adapters ---
  handleCanvasTouchStart = (e) => {
    e.preventDefault();
    const { x, y, viewportX, viewportY } = this.getTouchPos(e);
    this.handleCanvasPointerDown(x, y, viewportX, viewportY, e);
  }
  handleCanvasTouchMove = (e) => {
    e.preventDefault();
    const { x, y } = this.getTouchPos(e);
    this.handleCanvasPointerMove(x, y);
  }
  handleCanvasTouchEnd = (e) => {
    e.preventDefault();
    const { x, y, viewportX, viewportY } = this.getTouchPos(e);
    this.handleCanvasPointerUp(x, y, viewportX, viewportY);
  }

  // --- Robust Drag Handlers ---
  onDocumentMouseMove = (e) => {
    if (!this.state.isDragging) return;
    const { x, y } = this.getMousePos(e);
    this.handleCanvasPointerMove(x, y);
  }
  onDocumentMouseUp = (e) => {
    if (!this.state.isDragging) return;
    const { x, y, viewportX, viewportY } = this.getMousePos(e);
    this.handleCanvasPointerUp(x, y, viewportX, viewportY);
  }

  // --- Drag and Drop Handlers ---
  handlePlayerDragStart = (e) => {
    if (this.state.isAnimating || this.state.isExporting) {
      e.preventDefault();
      return;
    }
    this.cancelPlayerDrag();
    this.cancelDrawingInteraction();
    this.hideActionWheelImmediate();
    this.state.selectedPlayerId = null;
    this.clearPlacementSelection();
    const icon = e.target.closest('.player-tool-icon');
    e.dataTransfer.setData('text/plain', icon.dataset.player);
    e.dataTransfer.effectAllowed = 'copy';
    icon.classList.add('dragging');
    this.setInstruction(`Drop player ${icon.dataset.player} onto the court`);
  }
  handlePlayerDragEnd = (e) => {
    const icon = e.target.closest('.player-tool-icon');
    icon.classList.remove('dragging');
    this.setInstruction('Select a player to tap-to-place, or drag one onto the court.');
  }
  handleDragOver = (e) => {
    if (this.state.isAnimating || this.state.isExporting) return;
    e.preventDefault();
    this.dom.canvas.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'copy';
  }
  handleDragLeave = () => {
    this.dom.canvas.classList.remove('drag-over');
  }
  handleDrop = (e) => {
    e.preventDefault();
    this.dom.canvas.classList.remove('drag-over');
    if (this.state.isAnimating || this.state.isExporting) return;
    const playerLabel = e.dataTransfer.getData('text/plain');
    if (playerLabel) {
      const { x, y, viewportX, viewportY } = this.getMousePos(e);
      const newPlayer = this.createPlayerAt(x, y, playerLabel);
      if (newPlayer) {
        this.draw();
        this.saveState();
        this.showActionWheel(newPlayer, viewportX, viewportY);
      }
    }
  }

  // ==========================================================================
  // FILE OPERATIONS (Save, Load, Export)
  // ==========================================================================

  handleSave = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.flushPendingNotes();
    const playName = this.dom.playNameInput.value.trim() || 'Untitled Play';
    const filename = playName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
    const saveData = {
      formatVersion: 2,
      playName,
      courtType: this.state.courtType,
      frames: this.state.frames,
      nextFrameId: this.state.nextFrameId,
      nextPlayerId: this.state.nextPlayerId
    };
    try {
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.state.isDirty = false;
      this.updateSaveStatus();
      this.clearAutosave();
      this.setInstruction('Play saved to JSON file');
    } catch (error) {
      console.error('Save error:', error);
      this.showAlert('Failed to save play: ' + error.message);
    }
  }

  handleLoadFile = (e) => {
    const file = e.target.files[0];
    if (file) this.handleLoad(file);
    e.target.value = null;
  }

  async handleLoad(file) {
    if (!file || this.state.isExporting) return;
    await this.safeOperation(async () => {
      if (file.size > PlayData.MAX_FILE_BYTES) {
        throw new Error('Play files must be 5 MB or smaller');
      }
      const parsed = JSON.parse(await file.text());
      const loadedData = PlayData.normalizePlayData(parsed);
      if (this.state.isDirty &&
          !confirm('Load this play and discard the current unsaved changes?')) return;

      this.handleNewPlay(false);
      this.state.courtType = loadedData.courtType;
      this.state.frames = loadedData.frames;
      this.state.nextFrameId = loadedData.nextFrameId;
      this.state.nextPlayerId = loadedData.nextPlayerId;
      const existingLineIds = this.state.frames.flatMap(frame => frame.lines.map(line => line.id));
      this.lineIdCounter = Math.max(0, ...existingLineIds) + 1;
      this.state.history = [this.copyFrames(this.state.frames)];
      this.state.historyIndex = 0;
      this.state.isDirty = false;
      this.state.pendingNoteSave = false;
      this.clearAutosave();
      this.updateSaveStatus();
      this.updateHistoryButtons();
      this.dom.playNameInput.value = loadedData.playName;
      this.dom.courtToggle.value = this.state.courtType;
      this.switchFrame(0, { flushNotes: false });
      this.setInstruction('Play loaded');
    }, 'Could not load play file');
  }

  validatePlayData(data) {
    return PlayData.validatePlayData(data);
  }



  handleExportPDF = async () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.flushPendingNotes();
    this.clearExportDownload();

    const originalFrameIndex = this.state.currentFrameIndex;
    const playName = this.dom.playNameInput.value.trim() || 'Untitled Play';
    let exportError = null;

    this.state.isExporting = true;
    this.dom.exportPdfBtn.disabled = true;
    this.showLoading('Generating PDF...');

    try {
      const jsPDF = this.loadPdfLibrary();
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const margin = 12;
      const pageW = 297;
      const pageH = 210;
      const imageX = margin;
      const imageY = 34;
      const imageW = 150;
      const imageH = 112.5;
      const notesX = 174;
      const notesW = pageW - margin - notesX;
      const lineHeight = 5.2;
      const maxLines = Math.max(1, Math.floor((pageH - 52) / lineHeight));
      const pdfText = value => String(value == null ? '' : value).replace(/[^ -~]/g, '?');

      const addHeader = (frameIndex, continued = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        const titleLines = doc.splitTextToSize(pdfText(playName), pageW - margin * 2);
        doc.text(titleLines, margin, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const frameLabel = 'Frame ' + (frameIndex + 1) + ' of ' + this.state.frames.length;
        doc.text(frameLabel + (continued ? ' - Notes continued' : ''), margin, 25);
        doc.setDrawColor(210, 216, 224);
        doc.line(margin, 28, pageW - margin, 28);
      };

      for (let index = 0; index < this.state.frames.length; index++) {
        const frame = this.state.frames[index];
        if (index > 0) doc.addPage();
        this.switchFrame(index, { flushNotes: false });
        addHeader(index);
        doc.addImage(this.dom.canvas.toDataURL('image/png'), 'PNG', imageX, imageY, imageW, imageH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Coaching notes', notesX, 38);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const notes = pdfText(frame.notes || 'No notes for this frame.');
        const lines = doc.splitTextToSize(notes, notesW);
        let offset = 0;
        while (offset < lines.length) {
          if (offset > 0) {
            doc.addPage();
            addHeader(index, true);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
          }
          const chunk = lines.slice(offset, offset + maxLines);
          doc.text(chunk, notesX, 46);
          offset += chunk.length;
        }
      }

      const blob = PlaymakerExport.createPdfBlob(doc, Blob);
      const filename = PlaymakerExport.getSafeFilename(playName, 'pdf');
      this.showExportDownload(blob, filename, 'PDF');
    } catch (error) {
      exportError = error;
      console.error('PDF export error:', error);
    } finally {
      this.state.isExporting = false;
      this.dom.exportPdfBtn.disabled = false;
      this.hideLoading();
      try {
        this.switchFrame(Math.min(originalFrameIndex, this.state.frames.length - 1), { flushNotes: false });
      } catch (restoreError) {
        console.error('Could not restore the selected frame after PDF export:', restoreError);
        if (!exportError) exportError = restoreError;
      }
    }

    // Show errors after hiding the loading overlay so they remain visible.
    if (exportError) this.showAlert('Could not generate PDF: ' + exportError.message);
  }

  handleExportVideo = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (this.state.frames.length < 2) {
      this.showAlert('You need at least two frames to create a video.');
      return;
    }
    if (!this.dom.canvas.captureStream || !window.MediaRecorder ||
        typeof window.requestAnimationFrame !== 'function') {
      this.showAlert('Video export is unavailable in this browser or page context. Open the app in Chrome or Edge over HTTPS or localhost.');
      return;
    }

    this.flushPendingNotes();
    this.clearExportDownload();
    const originalFrameIndex = this.state.currentFrameIndex;
    const recordedChunks = [];
    let finished = false;
    let recorder = null;
    let stream = null;
    let selectedMimeType = '';
    let animationRequestId = null;
    let watchdogId = null;
    let stopWatchdogId = null;

    const cleanup = () => {
      if (animationRequestId !== null) {
        window.cancelAnimationFrame(animationRequestId);
        animationRequestId = null;
      }
      this.videoAnimationFrameId = null;
      if (watchdogId !== null) {
        clearTimeout(watchdogId);
        watchdogId = null;
      }
      if (stopWatchdogId !== null) {
        clearTimeout(stopWatchdogId);
        stopWatchdogId = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => {
          try { track.stop(); }
          catch (trackError) { console.warn('Could not stop a captured media track:', trackError); }
        });
      }
      this.videoRecorder = null;
      this.videoStream = null;
      this.state.isExporting = false;
      this.dom.exportVideoBtn.disabled = false;
      this.hideLoading();
      try {
        this.switchFrame(
          Math.min(originalFrameIndex, this.state.frames.length - 1),
          { flushNotes: false }
        );
      } catch (restoreError) {
        console.error('Could not restore the selected frame after video export:', restoreError);
      }
    };

    const finishExport = (error = null, shouldDownload = false) => {
      if (finished) return;
      finished = true;

      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); }
        catch (stopError) { console.warn('Could not stop the recorder cleanly:', stopError); }
      }
      cleanup();

      if (error) {
        console.error('Video export error:', error);
        this.showAlert('Could not record video: ' + error.message);
        return;
      }
      if (!shouldDownload) return;

      try {
        const mimeType = (recorder && recorder.mimeType) || selectedMimeType || 'video/webm';
        const blob = new Blob(recordedChunks, { type: mimeType });
        if (blob.size === 0) {
          throw new Error('The recorder finished without producing video data. Try again in Chrome or Edge.');
        }
        const extension = PlaymakerExport.getVideoExtension(blob.type || mimeType);
        const filename = PlaymakerExport.getSafeFilename(
          this.dom.playNameInput.value.trim() || 'Untitled Play',
          extension
        );
        this.showExportDownload(blob, filename, 'Video');
      } catch (downloadError) {
        console.error('Video download error:', downloadError);
        this.showAlert('The video could not be prepared for download: ' + downloadError.message);
      }
    };

    const stopRecording = () => {
      if (finished) return;
      if (!recorder || recorder.state === 'inactive') {
        finishExport(new Error('The browser stopped recording before the play was complete.'), false);
        return;
      }
      try {
        recorder.stop();
        stopWatchdogId = setTimeout(() => {
          finishExport(new Error('The browser did not finish the video recording.'), false);
        }, 10000);
      } catch (error) {
        finishExport(error, false);
      }
    };

    this.state.isExporting = true;
    this.dom.exportVideoBtn.disabled = true;
    this.showLoading('Recording video...');

    try {
      stream = this.dom.canvas.captureStream(this.config.video.fps);
      const recorderSetup = PlaymakerExport.createMediaRecorder(stream, window.MediaRecorder);
      recorder = recorderSetup.recorder;
      selectedMimeType = recorderSetup.mimeType;
      this.videoRecorder = recorder;
      this.videoStream = stream;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) recordedChunks.push(event.data);
      };
      recorder.onerror = event => {
        const recorderError = event.error || new Error('The browser reported a recording error.');
        finishExport(recorderError, false);
      };
      recorder.onstop = () => finishExport(null, true);

      let frameToPlay = 0;
      let frameStartTime = 0;
      let holdingFinalFrame = false;
      let finalFrameHoldStart = 0;

      const scheduleNextFrame = callback => {
        animationRequestId = window.requestAnimationFrame(callback);
        this.videoAnimationFrameId = animationRequestId;
      };

      const recordAnimationLoop = timestamp => {
        animationRequestId = null;
        this.videoAnimationFrameId = null;
        if (finished) return;

        if (!this.state.isExporting) {
          stopRecording();
          return;
        }

        try {
          if (frameStartTime === 0) frameStartTime = timestamp;

          if (holdingFinalFrame) {
            if (timestamp - finalFrameHoldStart >= this.config.animation.finalFrameHold) {
              stopRecording();
            } else {
              scheduleNextFrame(recordAnimationLoop);
            }
            return;
          }

          const currentRecordFrame = this.state.frames[frameToPlay];
          if (!currentRecordFrame) {
            finishExport(new Error('A play frame was missing during recording.'), false);
            return;
          }

          const elapsed = timestamp - frameStartTime;
          const progress = Math.min(1, elapsed / this.config.animation.speed);
          this._renderAnimationFrame(progress, currentRecordFrame);

          if (progress < 1) {
            scheduleNextFrame(recordAnimationLoop);
          } else {
            frameToPlay++;
            frameStartTime = 0;
            if (frameToPlay >= this.state.frames.length) {
              holdingFinalFrame = true;
              finalFrameHoldStart = timestamp;
            }
            scheduleNextFrame(recordAnimationLoop);
          }
        } catch (renderError) {
          finishExport(renderError, false);
        }
      };

      recorder.start(1000);
      watchdogId = setTimeout(() => {
        finishExport(new Error('Video export timed out. Keep this tab visible while the video is recording.'), false);
      }, Math.max(60000,
        this.state.frames.length * this.config.animation.speed +
        this.config.animation.finalFrameHold + 30000
      ));
      scheduleNextFrame(recordAnimationLoop);
    } catch (error) {
      finishExport(error, false);
    }
  }

}

// ============================================================================
// APPLICATION ENTRY POINT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  new PlaymakerApp();

});



















