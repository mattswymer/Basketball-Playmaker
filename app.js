/**
 * Basketball Playmaker Pro - Main Application
 * Professional basketball play diagramming and animation tool
 * @version 2.0.0
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // ============================================================================
  // CONSTANTS & CONFIGURATION
  // ============================================================================

  const CONFIG = {
    canvas: {
      width: 800,
      height: 600
    },
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
    animation: {
      speed: 1500,
      fps: 30
    },
    history: {
      maxStates: 50,
      noteDebounceDelay: 500
    },
    video: {
      mimeType: 'video/webm',
      fps: 30
    },
    images: {
      halfCourt: 'images/halfcourt.webp',
      fullCourt: 'images/fullcourt.webp'
    }
  };

  // ============================================================================
  // DOM ELEMENT REFERENCES
  // ============================================================================

  const DOM = {
    canvas: document.getElementById('play-canvas'),
    instructionText: document.getElementById('instruction-text'),
    playNameInput: document.getElementById('play-name'),
    courtToggle: document.getElementById('court-toggle'),

    // Buttons
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

    // Containers
    frameList: document.getElementById('frame-list'),
    frameNotes: document.getElementById('frame-notes'),
    toolbox: document.getElementById('drawing-toolbox'),

    // Loading overlay
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    spinner: document.querySelector('.spinner-box .spinner'),

    // Tool icons
    playerToolIcons: document.querySelectorAll('.player-tool-icon'),
    toolButtons: document.querySelectorAll('.tool-btn'),
    selectToolBtn: document.querySelector('.tool-btn[data-tool="select"]')
  };

  const ctx = DOM.canvas.getContext('2d');

  // ============================================================================
  // IMAGE LOADING WITH PROMISE
  // ============================================================================

  /**
   * Loads an image and returns a promise
   * @param {string} src - Image source path
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  let halfCourtImg, fullCourtImg;

  try {
    [halfCourtImg, fullCourtImg] = await Promise.all([
      loadImage(CONFIG.images.halfCourt),
      loadImage(CONFIG.images.fullCourt)
    ]);
  } catch (error) {
    console.error('Image loading error:', error);
    showAlert(`Error: ${error.message}. Please ensure court images are in the 'images' folder.`);
  }

  // ============================================================================
  // CANVAS SETUP
  // ============================================================================

  DOM.canvas.width = CONFIG.canvas.width;
  DOM.canvas.height = CONFIG.canvas.height;

  // ============================================================================
  // DATA STRUCTURES & TYPE DEFINITIONS
  // ============================================================================

  /**
   * @typedef {Object} Player
   * @property {number} id - Unique player identifier
   * @property {number} x - X coordinate on canvas
   * @property {number} y - Y coordinate on canvas
   * @property {number} radius - Player circle radius
   * @property {string} label - Player label (1-5 or X1-X5)
   * @property {boolean} hasBall - Whether player has the ball
   * @property {boolean} isOffense - Whether player is on offense
   */

  /**
   * @typedef {Object} Line
   * @property {string} type - Line type (cut, pass, dribble, shoot, screen, move)
   * @property {number} startPlayerId - ID of starting player
   * @property {number} [endPlayerId] - ID of ending player (optional)
   * @property {Array<{x: number, y: number}>} points - Array of waypoints
   */

  /**
   * @typedef {Object} Frame
   * @property {number} id - Unique frame identifier
   * @property {string} notes - Frame notes/description
   * @property {Player[]} players - Array of players in this frame
   * @property {Line[]} lines - Array of lines/actions in this frame
   */

  /**
   * Creates a new empty frame
   * @param {number} id - Frame ID
   * @returns {Frame}
   */
  const createNewFrame = (id) => ({
    id,
    notes: '',
    players: [],
    lines: []
  });

  /**
   * Deep clones frames array using structured clone
   * @param {Frame[]} frames - Frames to clone
   * @returns {Frame[]}
   */
  const copyFrames = (frames) => {
    try {
      return structuredClone(frames);
    } catch (e) {
      return JSON.parse(JSON.stringify(frames));
    }
  };

  /**
   * Validates loaded play data structure
   * @param {Object} data - Loaded data to validate
   * @returns {boolean}
   */
  function validatePlayData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.frames) || data.frames.length === 0) return false;

    return data.frames.every(frame =>
      typeof frame.id === 'number' &&
      Array.isArray(frame.players) &&
      Array.isArray(frame.lines) &&
      typeof frame.notes === 'string'
    );
  }

  /**
   * Creates initial application state
   * @returns {Object}
   */
  const createInitialState = () => {
    const initialFrames = [createNewFrame(1)];
    return {
      courtType: 'half',
      activeTool: 'select',
      frames: initialFrames,
      currentFrameIndex: 0,
      nextFrameId: 2,
      nextPlayerId: 1,

      // Drag state
      isDragging: false,
      draggingPlayer: null,
      dragOffsetX: 0,
      dragOffsetY: 0,

      // Line drawing state
      isDrawingLine: false,
      previewLine: null,

      // Animation state
      isAnimating: false,
      isExporting: false,
      animationFrameId: null,
      animationStartTime: 0,
      currentFramePlaying: 0,

      // History (undo/redo)
      history: [copyFrames(initialFrames)],
      historyIndex: 0,
      noteDebounceTimer: null,

      // Rendering optimization
      pendingRedraw: false
    };
  };

  let appState = createInitialState();

  // ============================================================================
  // UI FEEDBACK FUNCTIONS
  // ============================================================================

  /**
   * Shows alert message using loading overlay
   * @param {string} message - Message to display
   */
  function showAlert(message) {
    DOM.loadingText.textContent = message;
    if (DOM.spinner) DOM.spinner.style.display = 'none';
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.loadingOverlay.onclick = () => {
      DOM.loadingOverlay.classList.add('hidden');
      DOM.loadingOverlay.onclick = null;
    };
  }

  /**
   * Shows loading spinner with message
   * @param {string} message - Loading message
   */
  function showLoading(message) {
    DOM.loadingText.textContent = message;
    if (DOM.spinner) DOM.spinner.style.display = 'block';
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.loadingOverlay.onclick = null;
  }

  /**
   * Hides loading overlay
   */
  function hideLoading() {
    DOM.loadingOverlay.classList.add('hidden');
    DOM.loadingOverlay.onclick = null;
  }

  /**
   * Updates instruction text
   * @param {string} message - Instruction message
   */
  function setInstruction(message) {
    DOM.instructionText.textContent = message;
  }

  // ============================================================================
  // DRAWING FUNCTIONS
  // ============================================================================

  /**
   * Draws player icon on toolbox canvas
   * @param {HTMLCanvasElement} iconCanvas - Canvas element to draw on
   */
  function drawToolboxIcon(iconCanvas) {
    const label = iconCanvas.dataset.player;
    const isOffense = !label.startsWith('X');
    const toolCtx = iconCanvas.getContext('2d');
    const size = iconCanvas.width;
    const radius = size / 2 - 4;
    const center = size / 2;

    toolCtx.clearRect(0, 0, size, size);
    toolCtx.beginPath();
    toolCtx.arc(center, center, radius, 0, 2 * Math.PI);
    toolCtx.fillStyle = isOffense ? CONFIG.player.colors.offense : CONFIG.player.colors.defense;
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

  /**
   * Initializes all player toolbox icons
   */
  function initializeToolboxIcons() {
    DOM.playerToolIcons.forEach(icon => {
      icon.width = 40;
      icon.height = 40;
      drawToolboxIcon(icon);
    });
  }

  /**
   * Draws a player at specified coordinates
   * @param {Player} player - Player object
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {boolean} hasBall - Whether player has the ball
   */
  function drawPlayerAt(player, x, y, hasBall) {
    ctx.beginPath();
    ctx.arc(x, y, player.radius, 0, 2 * Math.PI);
    ctx.fillStyle = player.isOffense ? CONFIG.player.colors.offense : CONFIG.player.colors.defense;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.label, x, y);

    if (hasBall) {
      ctx.beginPath();
      ctx.arc(x, y, player.radius + CONFIG.player.ballIndicatorOffset, 0, 2 * Math.PI);
      ctx.strokeStyle = CONFIG.player.colors.ballHolder;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  /**
   * Draws all players in a frame
   * @param {Player[]} players - Array of players
   */
  function drawPlayers(players) {
    players.forEach(player => {
      drawPlayerAt(player, player.x, player.y, player.hasBall);
    });
  }

  /**
   * Draws an arrowhead at the end of a line
   * @param {{x: number, y: number}} end - End point
   * @param {number} angle - Arrow angle in radians
   */
  function drawArrowhead(end, angle) {
    const arrowLength = CONFIG.line.arrowLength;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - arrowLength * Math.cos(angle - Math.PI / 6),
      end.y - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - arrowLength * Math.cos(angle + Math.PI / 6),
      end.y - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  /**
   * Draws screen indicator at line end
   * @param {{x: number, y: number}} end - End point
   * @param {number} angle - Screen angle in radians
   */
  function drawScreenEnd(end, angle) {
    const screenWidth = CONFIG.line.screenWidth;
    ctx.beginPath();
    const x1 = end.x - screenWidth * Math.sin(angle);
    const y1 = end.y + screenWidth * Math.cos(angle);
    const x2 = end.x + screenWidth * Math.sin(angle);
    const y2 = end.y - screenWidth * Math.cos(angle);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * Draws dribble line with wave pattern
   * @param {{x: number, y: number}} start - Start point
   * @param {{x: number, y: number}} end - End point
   */
  function drawDribbleLine(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const angle = Math.atan2(dy, dx);
    const segments = Math.floor(dist / CONFIG.line.dribbleSegmentLength);
    const amplitude = CONFIG.line.dribbleAmplitude;
    const frequency = CONFIG.line.dribbleFrequency;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x = start.x + dx * t;
      const y = start.y + dy * t;
      const offset = Math.sin(t * Math.PI * frequency) * amplitude;
      const offsetX = Math.sin(angle) * offset;
      const offsetY = -Math.cos(angle) * offset;
      ctx.lineTo(x + offsetX, y + offsetY);
    }

    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drawArrowhead(end, angle);
  }

  /**
   * Draws all lines with proper styling and endpoints
   * @param {Line[]} lines - Array of lines to draw
   */
  function drawLines(lines) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    // Create player lookup map for O(1) access
    const playerMap = new Map(currentFrame.players.map(p => [p.id, p]));

    lines.forEach(line => {
      const { type, points, endPlayerId } = line;
      if (points.length < 2) return;

      ctx.strokeStyle = CONFIG.line.color;
      ctx.lineWidth = CONFIG.line.width;
      ctx.lineCap = 'round';

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        let end = { ...points[i + 1] };

        // Shorten line to not overlap with end player
        if (i === points.length - 2 && endPlayerId) {
          const endPlayer = playerMap.get(endPlayerId);
          if (endPlayer) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const pullBack = CONFIG.player.radius + (type === 'pass' ? 7 : 4);

            if (dist > pullBack) {
              const ratio = (dist - pullBack) / dist;
              end.x = start.x + dx * ratio;
              end.y = start.y + dy * ratio;
            }
          }
        }

        // Special rendering for shoot lines (double line)
        if (type === 'shoot') {
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const offset = CONFIG.line.shootLineOffset;

          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(start.x + Math.sin(angle) * offset, start.y - Math.cos(angle) * offset);
          ctx.lineTo(end.x + Math.sin(angle) * offset, end.y - Math.cos(angle) * offset);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(start.x - Math.sin(angle) * offset, start.y + Math.cos(angle) * offset);
          ctx.lineTo(end.x - Math.sin(angle) * offset, end.y + Math.cos(angle) * offset);
          ctx.stroke();

          drawArrowhead({ x: end.x - Math.sin(angle) * offset, y: end.y + Math.cos(angle) * offset }, angle);
          continue;
        }

        // Line styling based on type
        switch (type) {
          case 'pass':
            ctx.setLineDash(CONFIG.line.passLineDash);
            break;
          case 'dribble':
            drawDribbleLine(start, end);
            continue;
          default:
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw endpoint indicators
        if (i === points.length - 2) {
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          switch (type) {
            case 'cut':
            case 'move':
            case 'pass':
              drawArrowhead(end, angle);
              break;
            case 'screen':
              drawScreenEnd(end, angle);
              break;
          }
        }
      }
    });

    ctx.setLineDash([]);
  }

  /**
   * Main drawing function - renders entire canvas
   */
  function draw() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    const courtImg = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
    if (courtImg && courtImg.complete) {
      ctx.drawImage(courtImg, 0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    }

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    drawLines(currentFrame.lines);

    if (appState.previewLine) {
      drawLines([appState.previewLine]);
    }

    drawPlayers(currentFrame.players);
  }

  /**
   * Optimized draw with requestAnimationFrame batching
   */
  function scheduleDraw() {
    if (!appState.pendingRedraw) {
      appState.pendingRedraw = true;
      requestAnimationFrame(() => {
        draw();
        appState.pendingRedraw = false;
      });
    }
  }

  // ============================================================================
  // GEOMETRY & COLLISION DETECTION
  // ============================================================================

  /**
   * Gets mouse position relative to canvas
   * @param {MouseEvent} e - Mouse event
   * @returns {{x: number, y: number}}
   */
  function getMousePos(e) {
    const rect = DOM.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * Finds player at given coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Player|null}
   */
  function getPlayerAtCoord(x, y) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return null;

    for (let i = currentFrame.players.length - 1; i >= 0; i--) {
      const player = currentFrame.players[i];
      const distance = Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2);
      if (distance < player.radius) {
        return player;
      }
    }
    return null;
  }

  /**
   * Finds line at given coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Line|null}
   */
  function getLineAtCoord(x, y) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return null;

    for (const line of currentFrame.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;

        let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const closestX = p1.x + t * dx;
        const closestY = p1.y + t * dy;
        const distSq = (x - closestX) ** 2 + (y - closestY) ** 2;

        if (Math.sqrt(distSq) < CONFIG.line.clickTolerance) {
          return line;
        }
      }
    }
    return null;
  }

  // ============================================================================
  // FRAME MANAGEMENT
  // ============================================================================

  /**
   * Renders frame list thumbnails
   */
  function renderFrameList() {
    DOM.frameList.innerHTML = '';
    appState.frames.forEach((frame, index) => {
      const frameEl = document.createElement('div');
      frameEl.className = 'frame-thumbnail';

      const label = document.createElement('div');
      label.className = 'frame-thumbnail-label';
      label.textContent = `Frame ${index + 1}`;
      frameEl.appendChild(label);

      frameEl.dataset.frameId = frame.id;

      if (index === appState.currentFrameIndex && !appState.isAnimating) {
        frameEl.classList.add('active');
      }
      if (index === appState.currentFramePlaying && appState.isAnimating) {
        frameEl.classList.add('active');
      }

      DOM.frameList.appendChild(frameEl);
    });
  }

  /**
   * Switches to a different frame
   * @param {number} newFrameIndex - Index of frame to switch to
   */
  function switchFrame(newFrameIndex) {
    if (newFrameIndex < 0 || newFrameIndex >= appState.frames.length) {
      newFrameIndex = Math.max(0, appState.frames.length - 1);
    }

    appState.currentFrameIndex = newFrameIndex;

    if (appState.frames.length > 0 && appState.frames[newFrameIndex]) {
      renderFrameList();
      draw();
      DOM.frameNotes.value = appState.frames[newFrameIndex].notes;
    } else {
      handleNewPlay(false);
    }
  }

  // ============================================================================
  // HISTORY (UNDO/REDO) MANAGEMENT
  // ============================================================================

  /**
   * Updates undo/redo button states
   */
  function updateHistoryButtons() {
    DOM.undoBtn.disabled = appState.historyIndex <= 0;
    DOM.redoBtn.disabled = appState.historyIndex >= appState.history.length - 1;
  }

  /**
   * Saves current state to history
   */
  function saveState() {
    if (appState.historyIndex < appState.history.length - 1) {
      appState.history = appState.history.slice(0, appState.historyIndex + 1);
    }

    if (appState.history.length >= CONFIG.history.maxStates) {
      appState.history.shift();
      appState.historyIndex--;
    }

    appState.history.push(copyFrames(appState.frames));
    appState.historyIndex++;
    updateHistoryButtons();
  }

  /**
   * Undoes last action
   */
  function undo() {
    if (appState.historyIndex > 0) {
      appState.historyIndex--;
      appState.frames = copyFrames(appState.history[appState.historyIndex]);
      switchFrame(appState.currentFrameIndex);
      updateHistoryButtons();
    }
  }

  /**
   * Redoes last undone action
   */
  function redo() {
    if (appState.historyIndex < appState.history.length - 1) {
      appState.historyIndex++;
      appState.frames = copyFrames(appState.history[appState.historyIndex]);
      switchFrame(appState.currentFrameIndex);
      updateHistoryButtons();
    }
  }

  // ============================================================================
  // PLAYER & LINE CREATION
  // ============================================================================

  /**
   * Creates a new player at specified coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} playerLabel - Player label (e.g., "1", "X1")
   */
  function createPlayerAt(x, y, playerLabel) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const isOffense = !playerLabel.startsWith('X');
    const newPlayer = {
      id: appState.nextPlayerId++,
      x,
      y,
      radius: CONFIG.player.radius,
      label: playerLabel,
      hasBall: false,
      isOffense
    };

    currentFrame.players.push(newPlayer);
    draw();
    saveState();
  }

  // ============================================================================
  // ANIMATION SYSTEM
  // ============================================================================

  /**
   * Calculates total path length from array of points
   * @param {Array<{x: number, y: number}>} points - Array of points
   * @returns {number} Total distance
   */
  function getPathLength(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDistance;
  }

  /**
   * Gets point along path at specified distance
   * @param {Array<{x: number, y: number}>} points - Path points
   * @param {number} distanceToTravel - Distance along path
   * @returns {{x: number, y: number}} Point coordinates
   */
  function getPointAlongPath(points, distanceToTravel) {
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
        return {
          x: start.x + dx * ratio,
          y: start.y + dy * ratio
        };
      }
      distanceToTravel -= segmentLength;
    }
    return { ...points[points.length - 1] };
  }

  /**
   * Draws animated basketball
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  function drawAnimatedBall(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.player.radius / 2, 0, 2 * Math.PI);
    ctx.fillStyle = CONFIG.player.colors.ballAnimation;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, CONFIG.player.radius + CONFIG.player.ballIndicatorOffset, 0, 2 * Math.PI);
    ctx.strokeStyle = CONFIG.player.colors.ballHolder;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /**
   * Main animation loop
   * @param {DOMHighResTimeStamp} timestamp - Current timestamp
   */
  function animatePlay(timestamp) {
    if (appState.animationStartTime === 0) {
      appState.animationStartTime = timestamp;
    }

    const elapsed = timestamp - appState.animationStartTime;
    const progress = Math.min(1.0, elapsed / CONFIG.animation.speed);

    const frameA = appState.frames[appState.currentFramePlaying];
    if (!frameA) {
      stopAnimation();
      return;
    }

    // Clear and redraw background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    const courtImg = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
    if (courtImg && courtImg.complete) {
      ctx.drawImage(courtImg, 0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    }

    drawLines(frameA.lines);

    // Pre-compute line lookups for performance
    const moveLines = new Map();
    const passLines = new Map();
    const shootLines = new Map();

    frameA.lines.forEach(line => {
      if (!line.startPlayerId) return;

      if (line.type === 'cut' || line.type === 'dribble' ||
          line.type === 'move' || line.type === 'screen') {
        moveLines.set(line.startPlayerId, line);
      } else if (line.type === 'pass') {
        passLines.set(line.startPlayerId, line);
      } else if (line.type === 'shoot') {
        shootLines.set(line.startPlayerId, line);
      }
    });

    // Animate players
    frameA.players.forEach(player => {
      let drawX = player.x;
      let drawY = player.y;
      let hasBall = player.hasBall;

      const moveLine = moveLines.get(player.id);
      const passLine = passLines.get(player.id);
      const shootLine = shootLines.get(player.id);

      if (moveLine) {
        const pathLength = getPathLength(moveLine.points);
        const distanceToTravel = pathLength * progress;
        const newPos = getPointAlongPath(moveLine.points, distanceToTravel);
        drawX = newPos.x;
        drawY = newPos.y;
      }

      if (passLine && progress < 1.0) {
        hasBall = false;
        const passPathLength = getPathLength(passLine.points);
        const passDist = passPathLength * progress;
        const ballPos = getPointAlongPath(passLine.points, passDist);
        drawAnimatedBall(ballPos.x, ballPos.y);
      }

      if (shootLine && progress < 1.0) {
        hasBall = false;
        const shootPathLength = getPathLength(shootLine.points);
        const shootDist = shootPathLength * progress;
        const ballPos = getPointAlongPath(shootLine.points, shootDist);
        drawAnimatedBall(ballPos.x, ballPos.y);
      }

      drawPlayerAt(player, drawX, drawY, hasBall);
    });

    // Continue or advance to next frame
    if (progress < 1.0) {
      appState.animationFrameId = requestAnimationFrame(animatePlay);
    } else {
      appState.currentFramePlaying++;
      appState.animationStartTime = 0;

      if (appState.currentFramePlaying >= appState.frames.length) {
        stopAnimation();
        switchFrame(appState.frames.length - 1);
      } else {
        renderFrameList();
        appState.animationFrameId = requestAnimationFrame(animatePlay);
      }
    }
  }

  /**
   * Stops animation and resets state
   */
  function stopAnimation() {
    if (appState.isAnimating) {
      if (appState.animationFrameId) {
        cancelAnimationFrame(appState.animationFrameId);
        appState.animationFrameId = null;
      }

      appState.isAnimating = false;
      appState.animationStartTime = 0;
      DOM.animateBtn.textContent = '▶️ Animate';
      DOM.animateBtn.classList.remove('btn-danger');
      DOM.animateBtn.classList.add('btn-primary');
      renderFrameList();
    }
  }

  // ============================================================================
  // FILE OPERATIONS (SAVE/LOAD)
  // ============================================================================

  /**
   * Saves play to JSON file
   */
  function handleSave() {
    if (appState.isAnimating || appState.isExporting) return;

    const playName = DOM.playNameInput.value || 'Untitled Play';
    const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;

    const saveData = {
      playName,
      courtType: appState.courtType,
      frames: appState.frames,
      nextFrameId: appState.nextFrameId,
      nextPlayerId: appState.nextPlayerId
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
      showAlert('Failed to save play. Please try again.');
    }
  }

  /**
   * Loads play from JSON file
   * @param {File} file - File to load
   */
  function handleLoad(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const loadedData = JSON.parse(event.target.result);

        if (!validatePlayData(loadedData)) {
          throw new Error('Invalid play file format');
        }

        handleNewPlay(false);

        appState.courtType = loadedData.courtType || 'half';
        appState.frames = loadedData.frames;
        appState.nextFrameId = loadedData.nextFrameId || (appState.frames.length + 1);

        if (loadedData.nextPlayerId) {
          appState.nextPlayerId = loadedData.nextPlayerId;
        } else {
          const maxId = appState.frames.reduce((max, frame) => {
            const frameMax = frame.players.reduce((pMax, p) => Math.max(pMax, p.id), 0);
            return Math.max(max, frameMax);
          }, 0);
          appState.nextPlayerId = maxId + 1;
        }

        appState.history = [copyFrames(appState.frames)];
        appState.historyIndex = 0;
        updateHistoryButtons();

        appState.currentFrameIndex = 0;
        DOM.playNameInput.value = loadedData.playName || '';
        DOM.courtToggle.value = appState.courtType;
        switchFrame(0);
      } catch (error) {
        console.error('Load error:', error);
        showAlert(`Could not load the play file: ${error.message}`);
      }
    };

    reader.onerror = () => {
      console.error('File read error:', reader.error);
      showAlert('Error reading file. Please try again.');
    };

    reader.readAsText(file);
  }

  // ============================================================================
  // PDF EXPORT
  // ============================================================================

  /**
   * Exports play as PDF
   */
  async function handleExportPDF() {
    if (appState.isAnimating || appState.isExporting) return;

    appState.isExporting = true;
    DOM.exportPdfBtn.disabled = true;
    showLoading('Generating PDF...');

    setTimeout(() => {
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const originalFrameIndex = appState.currentFrameIndex;
        const playName = DOM.playNameInput.value || 'Untitled Play';

        const margin = 10;
        const pageW = 210;
        const pageH = 297;
        const contentW = pageW - margin * 2;
        const imgColW = 80;
        const gutter = 10;
        const notesColW = contentW - imgColW - gutter;
        const imgColH = (imgColW / 4) * 3;
        const frameRowH = (pageH - margin * 2) / 3;

        for (let i = 0; i < appState.frames.length; i++) {
          const frame = appState.frames[i];
          const frameIndexInPage = i % 3;

          if (i > 0 && frameIndexInPage === 0) {
            doc.addPage();
          }

          switchFrame(i);
          const imgData = DOM.canvas.toDataURL('image/png');

          const yPos = margin + frameIndexInPage * frameRowH + 5;
          const imgX = margin;
          doc.addImage(imgData, 'PNG', imgX, yPos, imgColW, imgColH);

          const notesX = margin + imgColW + gutter;
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(`Frame ${i + 1}`, notesX, yPos + 5);

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const notesText = frame.notes || 'No notes';
          const notesLines = doc.splitTextToSize(notesText, notesColW);
          doc.text(notesLines, notesX, yPos + 12);
        }

        const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        doc.save(filename);

        switchFrame(originalFrameIndex);
      } catch (error) {
        console.error('PDF export error:', error);
        showAlert(`Could not generate PDF: ${error.message}`);
      } finally {
        appState.isExporting = false;
        DOM.exportPdfBtn.disabled = false;
        hideLoading();
      }
    }, 100);
  }

  // ============================================================================
  // VIDEO EXPORT
  // ============================================================================

  /**
   * Checks if video recording is supported
   * @returns {boolean}
   */
  function isVideoExportSupported() {
    return !!(DOM.canvas.captureStream && window.MediaRecorder);
  }

  /**
   * Exports play as video using MediaRecorder
   */
  async function handleExportVideo() {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.frames.length < 2) {
      showAlert('You need at least two frames to create a video.');
      return;
    }

    if (!isVideoExportSupported()) {
      showAlert('Video export is not supported in this browser. Please use Chrome, Firefox, or Edge.');
      return;
    }

    appState.isExporting = true;
    DOM.exportVideoBtn.disabled = true;
    showLoading('Recording Video...');

    try {
      const stream = DOM.canvas.captureStream(CONFIG.video.fps);
      const recorder = new MediaRecorder(stream, { mimeType: CONFIG.video.mimeType });
      const recordedChunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: CONFIG.video.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const playName = DOM.playNameInput.value || 'Untitled Play';
        a.href = url;
        a.download = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        appState.isExporting = false;
        DOM.exportVideoBtn.disabled = false;
        hideLoading();
        switchFrame(0);
      };

      recorder.onerror = (e) => {
        console.error('Recording error:', e);
        showAlert('Video recording failed. Please try again.');
        appState.isExporting = false;
        DOM.exportVideoBtn.disabled = false;
        hideLoading();
      };

      recorder.start();

      let frameToPlay = 0;
      let frameStartTime = 0;

      function recordAnimationLoop(timestamp) {
        if (frameStartTime === 0) {
          frameStartTime = timestamp;
        }

        const elapsed = timestamp - frameStartTime;
        const progress = Math.min(1.0, elapsed / CONFIG.animation.speed);

        const currentRecordFrame = appState.frames[frameToPlay];
        if (!currentRecordFrame) {
          recorder.stop();
          return;
        }

        // Draw frame
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
        const courtImg = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
        if (courtImg && courtImg.complete) {
          ctx.drawImage(courtImg, 0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
        }

        drawLines(currentRecordFrame.lines);

        // Create line lookups for performance
        const moveLines = new Map();
        const passLines = new Map();
        const shootLines = new Map();

        currentRecordFrame.lines.forEach(line => {
          if (!line.startPlayerId) return;

          if (['cut', 'dribble', 'move', 'screen'].includes(line.type)) {
            moveLines.set(line.startPlayerId, line);
          } else if (line.type === 'pass') {
            passLines.set(line.startPlayerId, line);
          } else if (line.type === 'shoot') {
            shootLines.set(line.startPlayerId, line);
          }
        });

        currentRecordFrame.players.forEach(player => {
          let drawX = player.x;
          let drawY = player.y;
          let hasBall = player.hasBall;

          const moveLine = moveLines.get(player.id);
          const passLine = passLines.get(player.id);
          const shootLine = shootLines.get(player.id);

          if (moveLine) {
            const newPos = getPointAlongPath(
              moveLine.points,
              getPathLength(moveLine.points) * progress
            );
            drawX = newPos.x;
            drawY = newPos.y;
          }

          if (passLine && progress < 1.0) {
            hasBall = false;
            const ballPos = getPointAlongPath(
              passLine.points,
              getPathLength(passLine.points) * progress
            );
            drawAnimatedBall(ballPos.x, ballPos.y);
          }

          if (shootLine && progress < 1.0) {
            hasBall = false;
            const ballPos = getPointAlongPath(
              shootLine.points,
              getPathLength(shootLine.points) * progress
            );
            drawAnimatedBall(ballPos.x, ballPos.y);
          }

          drawPlayerAt(player, drawX, drawY, hasBall);
        });

        if (progress < 1.0) {
          requestAnimationFrame(recordAnimationLoop);
        } else {
          frameToPlay++;
          frameStartTime = 0;

          if (frameToPlay >= appState.frames.length) {
            recorder.stop();
          } else {
            requestAnimationFrame(recordAnimationLoop);
          }
        }
      }

      requestAnimationFrame(recordAnimationLoop);
    } catch (error) {
      console.error('Video export error:', error);
      showAlert(`Could not record video: ${error.message}`);
      appState.isExporting = false;
      DOM.exportVideoBtn.disabled = false;
      hideLoading();
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handles new play creation
   * @param {boolean} confirmFirst - Whether to confirm before resetting
   */
  function handleNewPlay(confirmFirst = true) {
    if (appState.isAnimating && appState.animationFrameId) {
      cancelAnimationFrame(appState.animationFrameId);
    }

    appState = createInitialState();
    DOM.playNameInput.value = '';
    DOM.courtToggle.value = 'half';
    renderFrameList();
    switchFrame(0);
    setInstruction('Select a tool to begin');
    updateHistoryButtons();
  }

  /**
   * Handles frame addition
   */
  function handleAddFrame() {
    if (appState.isAnimating || appState.isExporting) return;

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const newFrame = createNewFrame(appState.nextFrameId);
    appState.nextFrameId++;

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

    appState.frames.push(newFrame);
    switchFrame(appState.frames.length - 1);
    saveState();
  }

  /**
   * Handles frame deletion
   */
  function handleDeleteFrame() {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.frames.length <= 1) {
      showAlert('You cannot delete the last frame.');
      return;
    }

    const deletedFrameIndex = appState.currentFrameIndex;
    appState.frames.splice(deletedFrameIndex, 1);
    const newIndex = Math.max(0, deletedFrameIndex - 1);
    switchFrame(newIndex);
    saveState();
  }

  /**
   * Handles frame clearing
   */
  function handleClearFrame() {
    if (appState.isAnimating || appState.isExporting) return;

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (currentFrame) {
      currentFrame.players = [];
      currentFrame.lines = [];
      currentFrame.notes = '';
      DOM.frameNotes.value = '';
    }
    draw();
    saveState();
  }

  /**
   * Handles tool selection
   * @param {string} tool - Tool name
   */
  function handleToolSelect(tool) {
    if (appState.isAnimating || appState.isExporting) return;

    appState.activeTool = tool;

    DOM.canvas.classList.remove('tool-select', 'tool-delete', 'tool-assign-ball', 'tool-player');

    const instructions = {
      player: 'Drag a player from the toolbox onto the court',
      select: 'Click and drag a player to move them',
      delete: 'Click on a player or line to delete',
      'assign-ball': 'Click on an offensive player to give them the ball',
      cut: 'Click a player to start. Left-click to finish, right-click for waypoint',
      dribble: 'Click a player to start. Left-click to finish, right-click for waypoint',
      pass: 'Click a player to start. Left-click to finish, right-click for waypoint',
      shoot: 'Click a player to start. Left-click to finish, right-click for waypoint',
      screen: 'Click a player to start. Left-click to finish, right-click for waypoint',
      move: 'Click a player to start. Left-click to finish, right-click for waypoint'
    };

    setInstruction(instructions[tool] || 'Select a tool to begin');

    if (tool === 'player') {
      DOM.canvas.classList.add('tool-player');
    } else if (tool === 'select') {
      DOM.canvas.classList.add('tool-select');
    } else if (tool === 'delete') {
      DOM.canvas.classList.add('tool-delete');
    } else if (tool === 'assign-ball') {
      DOM.canvas.classList.add('tool-assign-ball');
    }
  }

  /**
   * Handles player deletion
   * @param {Player} player - Player to delete
   */
  function deletePlayer(player) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    currentFrame.players = currentFrame.players.filter(p => p.id !== player.id);
    currentFrame.lines = currentFrame.lines.filter(line =>
      line.startPlayerId !== player.id && line.endPlayerId !== player.id
    );
    draw();
    saveState();
  }

  /**
   * Handles line deletion
   * @param {Line} line - Line to delete
   */
  function deleteLine(line) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    currentFrame.lines = currentFrame.lines.filter(l => l !== line);
    draw();
    saveState();
  }

  /**
   * Handles ball assignment toggle
   * @param {Player} player - Player to assign/unassign ball
   */
  function toggleBall(player) {
    if (!player.isOffense) return;

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const currentBallHolder = currentFrame.players.find(p => p.hasBall);
    if (currentBallHolder && currentBallHolder !== player) {
      currentBallHolder.hasBall = false;
    }
    player.hasBall = !player.hasBall;
    draw();
    saveState();
  }

  // ============================================================================
  // CANVAS MOUSE EVENT HANDLERS
  // ============================================================================

  /**
   * Handles canvas click events
   */
  function handleCanvasClick(e) {
    if (appState.isAnimating || appState.isExporting || appState.isDragging) return;

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const { x, y } = getMousePos(e);

    if (!appState.isDrawingLine) {
      if (appState.activeTool === 'assign-ball') {
        const clickedPlayer = getPlayerAtCoord(x, y);
        if (clickedPlayer) {
          toggleBall(clickedPlayer);
        }
      } else if (appState.activeTool === 'delete') {
        const clickedPlayer = getPlayerAtCoord(x, y);
        if (clickedPlayer) {
          deletePlayer(clickedPlayer);
        } else {
          const clickedLine = getLineAtCoord(x, y);
          if (clickedLine) {
            deleteLine(clickedLine);
          }
        }
      }
    }
  }

  /**
   * Handles canvas mousedown events
   */
  function handleCanvasMouseDown(e) {
    if (appState.isAnimating || appState.isExporting) return;

    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const { x, y } = getMousePos(e);
    const playerAtStart = getPlayerAtCoord(x, y);

    if (e.button === 0) {
      if (appState.activeTool === 'select') {
        if (playerAtStart) {
          appState.isDragging = true;
          appState.draggingPlayer = playerAtStart;
          appState.dragOffsetX = x - playerAtStart.x;
          appState.dragOffsetY = y - playerAtStart.y;
          e.preventDefault();
        }
      } else if (!['player', 'assign-ball', 'delete'].includes(appState.activeTool)) {
        if (!appState.isDrawingLine) {
          if (playerAtStart) {
            if (['shoot', 'pass'].includes(appState.activeTool) && !playerAtStart.hasBall) {
              setInstruction("That player doesn't have the ball!");
              return;
            }

            appState.isDrawingLine = true;
            appState.previewLine = {
              type: appState.activeTool,
              startPlayerId: playerAtStart.id,
              points: [
                { x: playerAtStart.x, y: playerAtStart.y },
                { x, y }
              ]
            };
            setInstruction(`Drawing ${appState.activeTool}. Right-click for waypoint, left-click to finish.`);
            e.preventDefault();
          }
        } else {
          appState.isDrawingLine = false;
          const finalLine = appState.previewLine;
          const finalPoint = { x, y };
          const playerAtEnd = getPlayerAtCoord(x, y);

          if (playerAtEnd) {
            finalPoint.x = playerAtEnd.x;
            finalPoint.y = playerAtEnd.y;
            finalLine.endPlayerId = playerAtEnd.id;
          }

          finalLine.points[finalLine.points.length - 1] = finalPoint;
          currentFrame.lines.push(finalLine);
          appState.previewLine = null;
          setInstruction('Line created. Click another player to start a new line.');
          e.preventDefault();
          draw();
          saveState();
        }
      }
    } else if (e.button === 2) {
      if (appState.isDrawingLine) {
        appState.previewLine.points.push({ x, y });
        setInstruction('Waypoint added. Right-click for another, left-click to finish.');
        e.preventDefault();
        draw();
      }
    }
  }

  /**
   * Handles canvas mousemove events
   */
  function handleCanvasMouseMove(e) {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.isDragging && appState.draggingPlayer) {
      const { x, y } = getMousePos(e);
      appState.draggingPlayer.x = x - appState.dragOffsetX;
      appState.draggingPlayer.y = y - appState.dragOffsetY;
      scheduleDraw();
    } else if (appState.isDrawingLine) {
      const { x, y } = getMousePos(e);
      appState.previewLine.points[appState.previewLine.points.length - 1] = { x, y };
      scheduleDraw();
    }
  }

  /**
   * Handles canvas mouseup events
   */
  function handleCanvasMouseUp(e) {
    if (appState.isAnimating || appState.isExporting || e.button !== 0) return;

    if (appState.isDragging) {
      appState.isDragging = false;
      appState.draggingPlayer = null;
      saveState();
    }
  }

  /**
   * Handles canvas mouseout events
   */
  function handleCanvasMouseOut() {
    if (appState.isDragging) {
      appState.isDragging = false;
      appState.draggingPlayer = null;
      draw();
      saveState();
    }
    if (appState.isDrawingLine) {
      appState.isDrawingLine = false;
      appState.previewLine = null;
      draw();
    }
    DOM.canvas.classList.remove('drag-over');
  }

  // ============================================================================
  // DRAG & DROP HANDLERS
  // ============================================================================

  /**
   * Handles player icon drag start
   */
  function handlePlayerDragStart(e, icon) {
    if (appState.isAnimating || appState.isExporting) {
      e.preventDefault();
      return;
    }

    appState.activeTool = 'player';
    DOM.canvas.classList.add('tool-player');
    e.dataTransfer.setData('text/plain', icon.dataset.player);
    e.dataTransfer.effectAllowed = 'copy';
    icon.classList.add('dragging');
    setInstruction(`Drop player ${icon.dataset.player} onto the court`);
  }

  /**
   * Handles player icon drag end
   */
  function handlePlayerDragEnd(icon) {
    icon.classList.remove('dragging');
    if (DOM.selectToolBtn) {
      DOM.selectToolBtn.click();
    }
  }

  /**
   * Handles canvas dragover
   */
  function handleCanvasDragOver(e) {
    e.preventDefault();
    if (appState.activeTool === 'player') {
      DOM.canvas.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }

  /**
   * Handles canvas drop
   */
  function handleCanvasDrop(e) {
    e.preventDefault();
    DOM.canvas.classList.remove('drag-over');

    const playerLabel = e.dataTransfer.getData('text/plain');
    if (playerLabel && appState.activeTool === 'player') {
      const { x, y } = getMousePos(e);
      createPlayerAt(x, y, playerLabel);
      if (DOM.selectToolBtn) {
        DOM.selectToolBtn.click();
      }
    }
  }

  // ============================================================================
  // EVENT LISTENER REGISTRATION
  // ============================================================================

  // Top toolbar buttons
  DOM.newPlayBtn.addEventListener('click', () => handleNewPlay(true));
  DOM.clearFrameBtn.addEventListener('click', handleClearFrame);
  DOM.saveBtn.addEventListener('click', handleSave);
  DOM.loadBtn.addEventListener('click', () => DOM.loadFileInput.click());
  DOM.exportPdfBtn.addEventListener('click', handleExportPDF);
  DOM.exportVideoBtn.addEventListener('click', handleExportVideo);

  // Frame management
  DOM.addFrameBtn.addEventListener('click', handleAddFrame);
  DOM.deleteFrameBtn.addEventListener('click', handleDeleteFrame);

  // History
  DOM.undoBtn.addEventListener('click', undo);
  DOM.redoBtn.addEventListener('click', redo);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
  });

  // Court toggle
  DOM.courtToggle.addEventListener('change', (e) => {
    appState.courtType = e.target.value;
    draw();
  });

  // Tool selection
  DOM.toolbox.addEventListener('click', (e) => {
    if (appState.isAnimating || appState.isExporting) return;

    const clickedButton = e.target.closest('.tool-btn');
    if (!clickedButton) return;

    DOM.toolButtons.forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');

    const tool = clickedButton.dataset.tool;
    handleToolSelect(tool);
  });

  // Frame list
  DOM.frameList.addEventListener('click', (e) => {
    if (appState.isAnimating || appState.isExporting) return;

    const clickedFrame = e.target.closest('.frame-thumbnail');
    if (!clickedFrame) return;

    const frameId = parseInt(clickedFrame.dataset.frameId);
    const frameIndex = appState.frames.findIndex(f => f.id === frameId);
    if (frameIndex !== -1) {
      switchFrame(frameIndex);
    }
  });

  // Frame notes with debounce
  DOM.frameNotes.addEventListener('input', () => {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (currentFrame) {
      currentFrame.notes = DOM.frameNotes.value;

      clearTimeout(appState.noteDebounceTimer);
      appState.noteDebounceTimer = setTimeout(() => {
        saveState();
      }, CONFIG.history.noteDebounceDelay);
    }
  });

  // File input
  DOM.loadFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleLoad(file);
    }
    e.target.value = null;
  });

  // Animation button
  DOM.animateBtn.addEventListener('click', () => {
    if (appState.isExporting) return;

    if (appState.isAnimating) {
      stopAnimation();
    } else {
      if (appState.frames.length < 2) {
        showAlert('You need at least two frames to animate.');
        return;
      }

      appState.isAnimating = true;
      appState.currentFramePlaying = 0;
      appState.animationStartTime = 0;
      DOM.animateBtn.textContent = '⏹️ Stop';
      DOM.animateBtn.classList.remove('btn-primary');
      DOM.animateBtn.classList.add('btn-danger');
      renderFrameList();
      appState.animationFrameId = requestAnimationFrame(animatePlay);
    }
  });

  // Canvas events
  DOM.canvas.addEventListener('contextmenu', e => e.preventDefault());
  DOM.canvas.addEventListener('click', handleCanvasClick);
  DOM.canvas.addEventListener('mousedown', handleCanvasMouseDown);
  DOM.canvas.addEventListener('mousemove', handleCanvasMouseMove);
  DOM.canvas.addEventListener('mouseup', handleCanvasMouseUp);
  DOM.canvas.addEventListener('mouseout', handleCanvasMouseOut);
  DOM.canvas.addEventListener('dragover', handleCanvasDragOver);
  DOM.canvas.addEventListener('dragleave', () => DOM.canvas.classList.remove('drag-over'));
  DOM.canvas.addEventListener('drop', handleCanvasDrop);

  // Player toolbox drag and drop
  DOM.playerToolIcons.forEach(icon => {
    icon.addEventListener('dragstart', (e) => handlePlayerDragStart(e, icon));
    icon.addEventListener('dragend', () => handlePlayerDragEnd(icon));
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeToolboxIcons();
  renderFrameList();
  draw();

  if (DOM.selectToolBtn) {
    DOM.selectToolBtn.click();
  }

  updateHistoryButtons();

  console.log('✅ Basketball Playmaker Pro initialized successfully');
});