'use strict';

class PlaymakerApp {
  constructor() {
    // ========================================================================
    // CONFIGURATION & CONSTANTS
    // ========================================================================
this.config = {
      canvas: { width: 800, height: 600 },
      player: {
        radius: 15,
        ballIndicatorOffset: 5,
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
        dribbleAmplitude: 8,
        dribbleFrequency: 5,
        dribbleSegmentLength: 10,
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
      animation: { speed: 1500, fps: 30, finalFrameHold: 2000 },
      interaction: {
        clickTolerance: 10,
        doubleClickTime: 450,
        longPressTime: 500
      },
      history: { maxStates: 50, noteDebounceDelay: 500 },
      video: { mimeType: 'video/webm', fps: 30 },
      images: {
        halfCourt: 'images/halfcourt.webp',
        fullCourt: 'images/fullcourt.webp'
      }
    };

    // ========================================================================
    // DOM REFERENCES
    // ========================================================================
    this.dom = {
      canvas: document.getElementById('play-canvas'),
      instructionText: document.getElementById('instruction-text'),
      playNameInput: document.getElementById('play-name'),
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
      playerToolIcons: document.querySelectorAll('.player-tool-icon'),
      actionWheel: document.getElementById('action-wheel'),
      wheelButtons: document.querySelectorAll('.wheel-button'),
      courtContainer: document.getElementById('court-container')
    };

    // ========================================================================
    // APPLICATION STATE
    // ========================================================================
    this.ctx = this.dom.canvas.getContext('2d');
    this.halfCourtImg = null;
    this.fullCourtImg = null;
    this.lineIdCounter = 1;
    this.state = this.createInitialState();

    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    this.init();
  }

  /**
   * Primary initialization sequence.
   * Loads images, binds events, and performs the first render.
   */
  async init() {
    this.dom.canvas.width = this.config.canvas.width;
    this.dom.canvas.height = this.config.canvas.height;

    try {
      [this.halfCourtImg, this.fullCourtImg] = await Promise.all([
        this.loadImage(this.config.images.halfCourt),
        this.loadImage(this.config.images.fullCourt)
      ]);
    } catch (error) {
      console.error('Image loading error:', error);
      this.showAlert(`${error.message}. Please ensure court images are in 'images' folder.`);
    }

    this.bindEventHandlers();
    this.initializeToolboxIcons();
    this.initializeActionWheelIcons();
    this.renderFrameList();
    this.draw();
    this.setInstruction('Drag a player onto the court to begin');
    this.updateHistoryButtons();
    console.log('✅ Basketball Playmaker Pro (Master 4.2) initialized');
  }

  // ==========================================================================
  // STATE & HISTORY
  // ==========================================================================

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
      dragStartX: 0, dragStartY: 0,
      dragOffsetX: 0, dragOffsetY: 0,
      isDrawingLine: false,
      previewLine: null,
      lastClickTime: 0,
      clickTimerId: null,
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
    if (this.state.isAnimating || this.state.isExporting) return;
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
    }
    if (this.state.history.length >= this.config.history.maxStates) {
      this.state.history.shift();
      this.state.historyIndex--;
    }
    this.state.history.push(this.copyFrames(this.state.frames));
    this.state.historyIndex++;
    this.updateHistoryButtons();
  }

  undo = () => {
    if (this.state.historyIndex > 0) {
      this.state.historyIndex--;
      this.state.frames = this.copyFrames(this.state.history[this.state.historyIndex]);
      this.switchFrame(this.state.currentFrameIndex);
      this.updateHistoryButtons();
    }
  }

  redo = () => {
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.historyIndex++;
      this.state.frames = this.copyFrames(this.state.history[this.state.historyIndex]);
      this.switchFrame(this.state.currentFrameIndex);
      this.updateHistoryButtons();
    }
  }

  // ==========================================================================
  // UI & FEEDBACK
  // ==========================================================================

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

  setInstruction(message) {
    this.dom.instructionText.textContent = message;
  }

  renderFrameList() {
    this.dom.frameList.innerHTML = '';
    this.state.frames.forEach((frame, index) => {
      const frameEl = document.createElement('div');
      frameEl.className = 'frame-thumbnail';
      const label = document.createElement('div');
      label.className = 'frame-thumbnail-label';
      label.textContent = `Frame ${index + 1}`;
      frameEl.appendChild(label);
      frameEl.dataset.frameId = frame.id;

      if (index === this.state.currentFrameIndex && !this.state.isAnimating) frameEl.classList.add('active');
      if (index === this.state.currentFramePlaying && this.state.isAnimating) frameEl.classList.add('active');

      this.dom.frameList.appendChild(frameEl);
    });
  }

  updateFrameThumbnail(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.dom.frameList.children.length) return;
    
    const frameEl = this.dom.frameList.children[frameIndex];
    if (frameEl) {
      frameEl.className = 'frame-thumbnail'; // Reset class list
      
      // Add 'active' class only if it matches the correct state
      if (frameIndex === this.state.currentFrameIndex && !this.state.isAnimating) {
        frameEl.classList.add('active');
      }
      if (frameIndex === this.state.currentFramePlaying && this.state.isAnimating) {
        frameEl.classList.add('active');
      }
    }
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
        button.innerHTML = '🏀';
        button.style.fontSize = '1.5rem';
        break;
      case 'delete':
        button.innerHTML = '🗑️';
        button.style.fontSize = '1.5rem';
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
    this.ctx.font = 'bold 14px Arial';
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

  drawArrowhead(end, angle) {
    const L = this.config.line.arrowLength;
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

  drawDribbleLine(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const angle = Math.atan2(dy, dx);
    const segments = Math.floor(dist / this.config.line.dribbleSegmentLength);
    const amplitude = this.config.line.dribbleAmplitude;
    const frequency = this.config.line.dribbleFrequency;

    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x_linear = start.x + dx * t;
      const y_linear = start.y + dy * t;

      const offset = Math.sin(t * Math.PI * frequency) * amplitude;
      const offsetX = Math.sin(angle) * offset;
      const offsetY = -Math.cos(angle) * offset;

      this.ctx.lineTo(x_linear + offsetX, y_linear + offsetY);
    }
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();
    this.drawArrowhead(end, angle);
  }

  drawLines(lines) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;
    const playerMap = new Map(currentFrame.players.map(p => [p.id, p]));

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
            const margin = (type === 'screen' || type === 'shoot') ? 4 : (this.config.line.arrowLength + 2);
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

          this.drawArrowhead(end1, angle);
          this.drawArrowhead(end2, angle);
          continue;
        }

        if (type === 'pass') this.ctx.setLineDash(this.config.line.passLineDash);
        else this.ctx.setLineDash([]);

        if (type === 'dribble') {
          this.drawDribbleLine(start, end);
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
  draw() {
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.config.canvas.width, this.config.canvas.height);

    const courtImg = this.state.courtType === 'half' ? this.halfCourtImg : this.fullCourtImg;
    if (courtImg && courtImg.complete) {
      this.ctx.drawImage(courtImg, 0, 0, this.config.canvas.width, this.config.canvas.height);
    }

    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;

    this.drawLines(currentFrame.lines);
    if (this.state.previewLine) {
      this.drawLines([this.state.previewLine]);
    }
    this.drawPlayers(currentFrame.players);
  }

  /**
   * [REFACTOR] Centralized animation rendering logic.
   * This is called by both handleAnimate and handleExportVideo to stay DRY.
   * @param {number} progress - The animation progress (0.0 to 1.0).
   * @param {object} frame - The current frame object to render.
   */
  _renderAnimationFrame(progress, frame) {
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.config.canvas.width, this.config.canvas.height);
    const courtImg = this.state.courtType === 'half' ? this.halfCourtImg : this.fullCourtImg;
    if (courtImg && courtImg.complete) this.ctx.drawImage(courtImg, 0, 0, this.config.canvas.width, this.config.canvas.height);

    this.drawLines(frame.lines);

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

switchFrame(newFrameIndex) {
    if (newFrameIndex < 0 || newFrameIndex >= this.state.frames.length) {
      newFrameIndex = Math.max(0, this.state.frames.length - 1);
    }
    this.state.currentFrameIndex = newFrameIndex;

    if (this.state.frames.length > 0 && this.state.frames[newFrameIndex]) {
      this.renderFrameList(); // <<< THIS IS THE FIX
      this.draw();
      this.dom.frameNotes.value = this.state.frames[newFrameIndex].notes;
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

    const canvasLeftInContainer = canvasRect.left - courtRect.left;
    const canvasTopInContainer = canvasRect.top - courtRect.top;

    const playerX_css = player.x * scaleX;
    const playerY_css = player.y * scaleY;

    const playerXInContainer = canvasLeftInContainer + playerX_css;
    const playerYInContainer = canvasTopInContainer + playerY_css;

    this.dom.actionWheel.classList.remove('hidden');
    this.dom.actionWheel.classList.add('visible');
    const wheelWidth = this.dom.actionWheel.offsetWidth;
    const wheelHeight = this.dom.actionWheel.offsetHeight;
    const x = playerXInContainer - (wheelWidth / 2);
    const y = playerYInContainer - (wheelHeight / 2);

    this.dom.actionWheel.style.left = `${x}px`;
    this.dom.actionWheel.style.top = `${y}px`;
    this.setInstruction('Select an action from the wheel • Drag to move; release to re‑open actions');
  }

  hideActionWheel() {
    this.state.selectedPlayerId = null;
    this.dom.actionWheel.classList.remove('visible');
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

  /**
   * Creates a new player on the current frame at the specified coordinates.
   * @param {number} x - The canvas x-coordinate.
   * @param {number} y - The canvas y-coordinate.
   * @param {string} playerLabel - The label for the new player (e.g., "1", "X1").
   * @returns {object|null} The new player object or null if player exists.
   */
  createPlayerAt(x, y, playerLabel) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return null;

    const playerExists = currentFrame.players.some(p => p.label === playerLabel);
    if (playerExists) {
      this.showAlert(`Player ${playerLabel} is already on the court.`);
      return null;
    }

    const newPlayer = {
      id: this.state.nextPlayerId++,
      label: playerLabel,
      isOffense: !playerLabel.startsWith('X'),
      x: x,
      y: y,
      radius: this.config.player.radius,
      hasBall: false
    };

    currentFrame.players.push(newPlayer);
    return newPlayer;
  }

  addWaypoint(x, y) {
    const playerAtWaypoint = this.getPlayerAtCoord(x, y);
    const newPoint = playerAtWaypoint ? { x: playerAtWaypoint.x, y: playerAtWaypoint.y } : { x, y };

    this.state.previewLine.points.splice(this.state.previewLine.points.length - 1, 0, newPoint);
    this.draw();
  }

  finalizePreviewLine(x, y) {
    this.state.isDrawingLine = false;
    const finalLine = this.state.previewLine;
    finalLine.points.pop();

    const playerAtEnd = this.getPlayerAtCoord(x, y);
    const finalPoint = playerAtEnd ? { x: playerAtEnd.x, y: playerAtEnd.y } : { x, y };

    if (finalLine.points.length > 1) {
      const lastWaypoint = finalLine.points[finalLine.points.length - 1];
      const dist = Math.hypot(finalPoint.x - lastWaypoint.x, finalPoint.y - lastWaypoint.y);
      if (dist < this.config.interaction.clickTolerance) {
        finalLine.points.pop();
      }
    }

    if (playerAtEnd) {
      finalLine.points.push(finalPoint);
      finalLine.endPlayerId = playerAtEnd.id;
    } else {
      finalLine.points.push(finalPoint);
    }

    if (finalLine.points.length >= 2) {
      this.state.frames[this.state.currentFrameIndex].lines.push(finalLine);
    }
    this.state.previewLine = null;
    this.dom.canvas.classList.remove('drawing-line');
    this.setInstruction('Line created! Click a player to add another action.');
    this.draw();
    this.saveState();
  }

stopAnimation() {
    if (this.state.isAnimating) {
      if (this.state.animationFrameId) {
        cancelAnimationFrame(this.state.animationFrameId);
        this.state.animationFrameId = null;
      }
      this.state.isAnimating = false;
      this.state.animationStartTime = 0;
      this.state.currentFramePlaying = 0; // ADD THIS
      this.dom.animateBtn.textContent = '▶️ Animate';
      this.dom.animateBtn.classList.remove('btn-danger');
      this.dom.animateBtn.classList.add('btn-primary');
      this.renderFrameList();
    }
  }

  // ==========================================================================
  // UTILITIES (Geometry, Hit-Testing, Animation)
  // ==========================================================================

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
    this.dom.addFrameBtn.addEventListener('click', this.handleAddFrame);
    this.dom.deleteFrameBtn.addEventListener('click', this.handleDeleteFrame);
    this.dom.undoBtn.addEventListener('click', this.undo);
    this.dom.redoBtn.addEventListener('click', this.redo);
    this.dom.animateBtn.addEventListener('click', this.handleAnimate);

    document.addEventListener('keydown', this.handleKeyDown);

    this.dom.courtToggle.addEventListener('change', (e) => {
      this.state.courtType = e.target.value;
      this.draw();
    });

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
    });
  }

  handleNewPlay = (confirmFirst = true) => {
    if (confirmFirst && this.state.frames.some(f => f.players.length > 0 || f.lines.length > 0)) {
      if (!confirm('Start new play? All unsaved progress will be lost.')) {
        return;
      }
    }
    if (this.state.isAnimating && this.state.animationFrameId) {
      cancelAnimationFrame(this.state.animationFrameId);
    }
    this.state = this.createInitialState();
    this.lineIdCounter = 1;
    this.dom.playNameInput.value = '';
    this.dom.courtToggle.value = 'half';
    this.renderFrameList();
    this.switchFrame(0);
    this.setInstruction('Drag a player onto the court to begin');
    this.updateHistoryButtons();
  }

  handleAddFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (!currentFrame) return;

    const newFrame = this.createNewFrame(this.state.nextFrameId++);
    newFrame.players = JSON.parse(JSON.stringify(currentFrame.players));

    let ballWasPassedOrShot = false;
    let passerOrShooter = null;

    currentFrame.lines.forEach(line => {
      if (line.points.length < 2 || !line.startPlayerId) return;
      const endPoint = line.points[line.points.length - 1];
      const startPlayer = newFrame.players.find(p => p.id === line.startPlayerId);
      if (!startPlayer) return;

      if (['cut', 'move', 'dribble', 'screen'].includes(line.type)) {
        startPlayer.x = endPoint.x;
        startPlayer.y = endPoint.y;
      }
      if (line.type === 'pass') {
        const endPlayer = newFrame.players.find(p => p.id === line.endPlayerId);
        if (endPlayer) {
          endPlayer.hasBall = true;
          ballWasPassedOrShot = true;
          passerOrShooter = startPlayer;
        }
      }
      if (line.type === 'shoot') {
        ballWasPassedOrShot = true;
        passerOrShooter = startPlayer;
      }
    });

    if (ballWasPassedOrShot && passerOrShooter) {
      passerOrShooter.hasBall = false;
    }

    this.state.frames.push(newFrame);
    this.switchFrame(this.state.frames.length - 1);
    this.saveState();
  }

  handleDeleteFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (this.state.frames.length <= 1) {
      this.showAlert('You cannot delete the last frame.');
      return;
    }
    if (!confirm('Delete this frame?')) return;

    const deletedFrameIndex = this.state.currentFrameIndex;
    this.state.frames.splice(deletedFrameIndex, 1);
    const newIndex = Math.max(0, deletedFrameIndex - 1);
    this.switchFrame(newIndex);
    this.saveState();
  }

  handleClearFrame = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (!confirm('Clear all players and lines from this frame?')) return;

    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (currentFrame) {
      currentFrame.players = [];
      currentFrame.lines = [];
      currentFrame.notes = '';
      this.dom.frameNotes.value = '';
    }
    this.draw();
    this.saveState();
  }

  handleWheelClick = (e) => {
    const button = e.target.closest('.wheel-button');
    if (button) {
      this.handleWheelAction(button.dataset.tool);
    }
  }

  handleWheelAction(tool) {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
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
      if (player.isOffense) {
        const currentBallHolder = currentFrame.players.find(p => p.hasBall);
        if (currentBallHolder && currentBallHolder !== player) currentBallHolder.hasBall = false;
        player.hasBall = !player.hasBall;
        this.draw();
        this.saveState();
        this.setInstruction(player.hasBall ? 'Ball assigned' : 'Ball removed');
      } else {
        this.setInstruction('Only offensive players can have the ball');
      }
      return;
    }

    if (['shoot', 'pass'].includes(tool) && !player.hasBall) {
      this.setInstruction("That player doesn't have the ball!");
      return;
    }

    currentFrame.lines = currentFrame.lines.filter(l => l.startPlayerId !== player.id);
    this.state.isDrawingLine = true;
    this.state.activeLineTool = tool;
    this.state.previewLine = {
      id: this.lineIdCounter++,
      type: tool,
      startPlayerId: player.id,
      points: [{ x: player.x, y: player.y }, { x: player.x, y: player.y }]
    };
    this.setInstruction(`Drawing ${tool}. Single‑click to add waypoints, double‑click to finish.`);
    this.dom.canvas.classList.add('drawing-line');
    this.draw();
  }

  handleFrameListClick = (e) => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.hideActionWheel();
    const clickedFrame = e.target.closest('.frame-thumbnail');
    if (!clickedFrame) return;
    const frameId = parseInt(clickedFrame.dataset.frameId, 10);
    const frameIndex = this.state.frames.findIndex(f => f.id === frameId);
    if (frameIndex !== -1) this.switchFrame(frameIndex);
  }

  handleNotesInput = () => {
    const currentFrame = this.state.frames[this.state.currentFrameIndex];
    if (currentFrame) {
      currentFrame.notes = this.dom.frameNotes.value;
      clearTimeout(this.state.noteDebounceTimer);
      this.state.noteDebounceTimer = setTimeout(() => {
        this.saveState();
      }, this.config.history.noteDebounceDelay);
    }
  }

handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); this.undo(); }
      else if (e.key === 'y') { e.preventDefault(); this.redo(); }
    }

    const targetTagName = e.target ? e.target.tagName : '';
    const isTyping = targetTagName === 'INPUT' || targetTagName === 'TEXTAREA' || targetTagName === 'SELECT';

    if (this.state.selectedPlayerId && !isTyping) { // <-- FIX: Added !isTyping condition
      const key = e.key.toLowerCase();
      const toolMap = {
        'm': 'cut',
        'p': 'pass',
        's': 'screen',
        'd': 'dribble',
        'x': 'shoot',
        'b': 'assign-ball',
        'delete': 'delete',
        'backspace': 'delete'
      };
      if (toolMap[key]) {
        e.preventDefault();
        this.handleWheelAction(toolMap[key]);
      }
      if (key === 'escape') {
        e.preventDefault();
        this.hideActionWheel();
      }
    }

    if (this.state.isDrawingLine && e.key === 'Escape') {
      e.preventDefault();
      clearTimeout(this.state.clickTimerId);
      this.state.clickTimerId = null;
      this.state.isDrawingLine = false;
      this.state.previewLine = null;
      this.dom.canvas.classList.remove('drawing-line');
      this.draw();
      this.setInstruction('Line cancelled');
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
      this.state.isAnimating = true;
      this.state.currentFramePlaying = 0;
      this.state.animationStartTime = 0;
      this.dom.animateBtn.textContent = '⏹️ Stop';
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

    const clickedLine = this.getLineAtCoord(x, y);
    if (clickedLine) {
      this.state.selectedLineId = clickedLine.id;
      this.draw();
      if (confirm('Delete this action line?')) {
        const currentFrame = this.state.frames[this.state.currentFrameIndex];
        currentFrame.lines = currentFrame.lines.filter(l => l.id !== clickedLine.id);
        this.state.selectedLineId = null;
        this.draw();
        this.saveState();
        this.setInstruction('Line deleted');
      } else {
        this.state.selectedLineId = null;
        this.draw();
      }
      return;
    }

    const playerAtStart = this.getPlayerAtCoord(x, y);
    if (playerAtStart) {
      this.state.isDragging = true;
      this.state.draggingPlayer = playerAtStart;
      this.state.dragStartX = x;
      this.state.dragStartY = y;
      this.state.dragOffsetX = x - playerAtStart.x;
      this.state.dragOffsetY = y - playerAtStart.y;
      this.state.selectedPlayerId = playerAtStart.id;
      this.hideActionWheelImmediate();

      document.addEventListener('mousemove', this.onDocumentMouseMove);
      document.addEventListener('mouseup', this.onDocumentMouseUp);
      e.preventDefault();
    } else {
      this.state.selectedPlayerId = null;
      this.hideActionWheel();
      this.scheduleDraw();
    }
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
      this.state.draggingPlayer.x = x - this.state.dragOffsetX;
      this.state.draggingPlayer.y = y - this.state.dragOffsetY;
      this.scheduleDraw();
    } else if (this.state.isDrawingLine) {
      this.state.previewLine.points[this.state.previewLine.points.length - 1] = { x, y };
      this.scheduleDraw();
    }
  }

  handleCanvasPointerUp = (x, y, viewportX, viewportY) => {
    if (this.state.isAnimating || this.state.isExporting) return;

    if (this.state.isDragging) {
      const draggedPlayer = this.state.draggingPlayer;
      this.state.isDragging = false;
      this.state.draggingPlayer = null;

      const dist = Math.hypot(x - this.state.dragStartX, y - this.state.dragStartY);
      if (dist >= this.config.interaction.clickTolerance) {
        this.saveState();
      }

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
    const icon = e.target.closest('.player-tool-icon');
    e.dataTransfer.setData('text/plain', icon.dataset.player);
    e.dataTransfer.effectAllowed = 'copy';
    icon.classList.add('dragging');
    this.setInstruction(`Drop player ${icon.dataset.player} onto the court`);
  }
  handlePlayerDragEnd = (e) => {
    const icon = e.target.closest('.player-tool-icon');
    icon.classList.remove('dragging');
    this.setInstruction('Drag a player onto the court');
  }
  handleDragOver = (e) => {
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
    const playName = this.dom.playNameInput.value || 'Untitled Play';
    const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    const saveData = {
      playName,
      courtType: this.state.courtType,
      frames: this.state.frames,
      nextFrameId: this.state.nextFrameId,
      nextPlayerId: this.state.nextPlayerId
    };
    try {
      const jsonString = JSON.stringify(saveData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Save error:', error);
      this.showAlert('Failed to save play.');
    }
  }

  handleLoadFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      this.handleLoad(file);
    }
    e.target.value = null; // Reset input
  }

handleLoadFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      this.handleLoad(file);
    }
    e.target.value = null;
  }

async handleLoad(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const loadedData = JSON.parse(text);

      // --- ENHANCEMENT: Call validation function ---
      this.validatePlayData(loadedData);
      // --- End Enhancement ---

      this.handleNewPlay(false);
      this.state.courtType = loadedData.courtType || 'half';
      this.state.frames = loadedData.frames;
      this.state.nextFrameId = loadedData.nextFrameId || (this.state.frames.length + 1);

      // Calculate nextPlayerId from existing data
      const maxId = this.state.frames.reduce((max, frame) => {
        const frameMax = frame.players.reduce((pMax, p) => Math.max(pMax, p.id), 0);
        return Math.max(max, frameMax);
      }, 0);
      this.state.nextPlayerId = loadedData.nextPlayerId || maxId + 1;

      // Ensure all lines have IDs
      this.state.frames.forEach(frame => {
        frame.lines.forEach(line => {
          if (!line.id) line.id = this.lineIdCounter++;
        });
      });

      this.state.history = [this.copyFrames(this.state.frames)];
      this.state.historyIndex = 0;
      this.updateHistoryButtons();

      this.dom.playNameInput.value = loadedData.playName || '';
      this.dom.courtToggle.value = this.state.courtType;
      this.switchFrame(0);

    } catch (error) {
      console.error('Load error:', error);
      this.showAlert(`Could not load play file: ${error.message}`);
    }
  }

  // --- NEW FUNCTION ---
  validatePlayData(data) {
    // Note: This is a basic validator. A production app might use a
    // library like Zod or Ajv for more comprehensive schema checking.
    const schema = {
      playName: 'string',
      courtType: ['half', 'full'],
      frames: 'array',
      nextFrameId: 'number',
      nextPlayerId: 'number'
    };

    // Validate required fields
    if (!data.frames || !Array.isArray(data.frames)) {
      throw new Error('Invalid frames data');
    }
    
    // Check other top-level properties (optional)
    if (data.hasOwnProperty('courtType') && !schema.courtType.includes(data.courtType)) {
      throw new Error('Invalid courtType');
    }
    if (data.hasOwnProperty('playName') && typeof data.playName !== schema.playName) {
       throw new Error('Invalid playName');
    }
    // ... add more checks for nextFrameId, nextPlayerId ...

    // Validate frame structure
    data.frames.forEach((frame, i) => {
      if (typeof frame !== 'object' || frame === null) throw new Error(`Frame ${i} is not an object`);
      if (!frame.hasOwnProperty('id') || typeof frame.id !== 'number') throw new Error(`Frame ${i} missing or invalid id`);
      if (!Array.isArray(frame.players)) throw new Error(`Frame ${i} invalid players array`);
      if (!Array.isArray(frame.lines)) throw new Error(`Frame ${i} invalid lines array`);
      // TODO: Add deep validation for player and line objects
    });

    return true;
  }

  handleExportPDF = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    this.state.isExporting = true;
    this.dom.exportPdfBtn.disabled = true;
    this.showLoading('Generating PDF...');

    setTimeout(() => {
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const originalFrameIndex = this.state.currentFrameIndex;
        const playName = this.dom.playNameInput.value || 'Untitled Play';

        const margin = 10;
        const pageW = 210;
        const pageH = 297;
        const contentW = pageW - margin * 2;
        const imgColW = 80;
        const gutter = 10;
        const notesColW = contentW - imgColW - gutter;
        const imgColH = (imgColW / 4) * 3;
        const frameRowH = (pageH - margin * 2) / 3;

        for (let i = 0; i < this.state.frames.length; i++) {
          const frameIndexInPage = i % 3;
          if (i > 0 && frameIndexInPage === 0) doc.addPage();

          this.switchFrame(i);
          const imgData = this.dom.canvas.toDataURL('image/png');
          const yPos = margin + frameIndexInPage * frameRowH + 5;
          const imgX = margin;

          doc.addImage(imgData, 'PNG', imgX, yPos, imgColW, imgColH);

          const notesX = margin + imgColW + gutter;
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(`Frame ${i + 1}`, notesX, yPos + 5);

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const notesText = this.state.frames[i].notes || 'No notes';
          const notesLines = doc.splitTextToSize(notesText, notesColW);
          doc.text(notesLines, notesX, yPos + 12);
        }

        const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        doc.save(filename);
        this.switchFrame(originalFrameIndex);
      } catch (error) {
        console.error('PDF export error:', error);
        this.showAlert(`Could not generate PDF: ${error.message}`);
      } finally {
        this.state.isExporting = false;
        this.dom.exportPdfBtn.disabled = false;
        this.hideLoading();
      }
    }, 100);
  }

  handleExportVideo = () => {
    if (this.state.isAnimating || this.state.isExporting) return;
    if (this.state.frames.length < 2) {
      this.showAlert('You need at least two frames to create a video.');
      return;
    }
    if (!this.dom.canvas.captureStream || !window.MediaRecorder) {
      this.showAlert('Video export not supported in this browser. Use Chrome, Firefox, or Edge.');
      return;
    }
    this.state.isExporting = true;
    this.dom.exportVideoBtn.disabled = true;
    this.showLoading('Recording Video...');

    try {
      const stream = this.dom.canvas.captureStream(this.config.video.fps);
      const recorder = new MediaRecorder(stream, { mimeType: this.config.video.mimeType });
      const recordedChunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: this.config.video.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const playName = this.dom.playNameInput.value || 'Untitled Play';
        a.href = url;
        a.download = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.state.isExporting = false;
        this.dom.exportVideoBtn.disabled = false;
        this.hideLoading();
        this.switchFrame(0);
      };

      recorder.onerror = (e) => {
        console.error('Recording error:', e);
        this.showAlert('Video recording failed.');
        this.state.isExporting = false;
        this.dom.exportVideoBtn.disabled = false;
        this.hideLoading();
      };

      recorder.start();

      let frameToPlay = 0;
      let frameStartTime = 0;
      let holdingFinalFrame = false;
      let finalFrameHoldStart = 0;

      const recordAnimationLoop = (timestamp) => {
        if (!this.state.isExporting) {
          recorder.stop();
          return;
        }
        if (frameStartTime === 0) frameStartTime = timestamp;

        if (holdingFinalFrame) {
          if (timestamp - finalFrameHoldStart >= this.config.animation.finalFrameHold) {
            recorder.stop();
          } else {
            requestAnimationFrame(recordAnimationLoop);
          }
          return;
        }

        const elapsed = timestamp - frameStartTime;
        const progress = Math.min(1.0, elapsed / this.config.animation.speed);
        const currentRecordFrame = this.state.frames[frameToPlay];
        if (!currentRecordFrame) { recorder.stop(); return; }

        // [REFACTOR] Use centralized render method
        this._renderAnimationFrame(progress, currentRecordFrame);

        if (progress < 1.0) {
          requestAnimationFrame(recordAnimationLoop);
        } else {
          frameToPlay++;
          frameStartTime = 0;
          if (frameToPlay >= this.state.frames.length) {
            holdingFinalFrame = true;
            finalFrameHoldStart = timestamp;
            requestAnimationFrame(recordAnimationLoop);
          } else {
            requestAnimationFrame(recordAnimationLoop);
          }
        }
      }
      requestAnimationFrame(recordAnimationLoop);

    } catch (error) {
      console.error('Video export error:', error);
      this.showAlert(`Could not record video: ${error.message}`);
      this.state.isExporting = false;
      this.dom.exportVideoBtn.disabled = false;
      this.hideLoading();
    }
  }
}

// ============================================================================
// APPLICATION ENTRY POINT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  new PlaymakerApp();

});







