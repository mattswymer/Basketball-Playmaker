/**
 * Basketball Playmaker Pro - Radial Menu Implementation
 * Touch-friendly interface with contextual actions
 * @version 3.0.0
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // ============================================================================
  // CONFIGURATION & CONSTANTS
  // ============================================================================

  const CONFIG = {
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
    animation: { speed: 1500, fps: 30, finalFrameHold: 2000 },
    interaction: {
      clickTolerance: 10,
      doubleClickTime: 300,
      longPressTime: 500
    },
    history: { maxStates: 50, noteDebounceDelay: 500 },
    video: { mimeType: 'video/webm', fps: 30 },
    images: {
      halfCourt: 'images/halfcourt.webp',
      fullCourt: 'images/fullcourt.webp'
    }
  };

  // ============================================================================
  // DOM REFERENCES
  // ============================================================================

  const DOM = {
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

  const ctx = DOM.canvas.getContext('2d');

  // ============================================================================
  // IMAGE LOADING
  // ============================================================================

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
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
    showAlert(`${error.message}. Please ensure court images are in 'images' folder.`);
  }

  // ============================================================================
  // APPLICATION STATE
  // ============================================================================

  const createNewFrame = (id) => ({
    id,
    notes: '',
    players: [],
    lines: []
  });

  const copyFrames = (frames) => {
    try {
      return structuredClone(frames);
    } catch (e) {
      return JSON.parse(JSON.stringify(frames));
    }
  };

  const createInitialState = () => {
    const initialFrames = [createNewFrame(1)];
    return {
      courtType: 'half',
      activeLineTool: null,
      frames: initialFrames,
      currentFrameIndex: 0,
      nextFrameId: 2,
      nextPlayerId: 1,

      isDragging: false,
      isDrawingLine: false,
      dragStartX: 0,
      dragStartY: 0,
      draggingPlayer: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      previewLine: null,
      selectedPlayerId: null,
      selectedLineId: null,
      lastClickTime: 0,

      isAnimating: false,
      isExporting: false,
      animationFrameId: null,
      animationStartTime: 0,
      currentFramePlaying: 0,

      history: [copyFrames(initialFrames)],
      historyIndex: 0,
      noteDebounceTimer: null,
      pendingRedraw: false
    };
  };

  let appState = createInitialState();
  let lineIdCounter = 1;

  // ============================================================================
  // CANVAS SETUP
  // ============================================================================

  DOM.canvas.width = CONFIG.canvas.width;
  DOM.canvas.height = CONFIG.canvas.height;

  // ============================================================================
  // UI FEEDBACK FUNCTIONS
  // ============================================================================

  function showAlert(message) {
    DOM.loadingText.textContent = message;
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.loadingOverlay.onclick = () => {
      DOM.loadingOverlay.classList.add('hidden');
      DOM.loadingOverlay.onclick = null;
    };
  }

  function showLoading(message) {
    DOM.loadingText.textContent = message;
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.loadingOverlay.onclick = null;
  }

  function hideLoading() {
    DOM.loadingOverlay.classList.add('hidden');
  }

  function setInstruction(message) {
    DOM.instructionText.textContent = message;
  }

  // ============================================================================
  // DRAWING FUNCTIONS
  // ============================================================================

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

  function initializeToolboxIcons() {
    DOM.playerToolIcons.forEach(icon => {
      icon.width = 40;
      icon.height = 40;
      drawToolboxIcon(icon);
    });
  }

  function drawWheelIcon(button) {
    const tool = button.dataset.tool;
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 40;
    iconCanvas.height = 40;
    button.appendChild(iconCanvas);
    const iconCtx = iconCanvas.getContext('2d');

    const start = { x: 8, y: 20 };
    const end = { x: 32, y: 20 };

    iconCtx.strokeStyle = CONFIG.line.color;
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

  function initializeActionWheelIcons() {
    DOM.wheelButtons.forEach(drawWheelIcon);
  }

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

  function drawPlayers(players) {
    players.forEach(player => {
      drawPlayerAt(player, player.x, player.y, player.hasBall);
    });
  }

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

  function drawLines(lines) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return;

    const playerMap = new Map(currentFrame.players.map(p => [p.id, p]));

    lines.forEach(line => {
      const { type, points, endPlayerId, id } = line;
      if (points.length < 2) return;

      const isSelected = (id === appState.selectedLineId);

      ctx.strokeStyle = isSelected ? CONFIG.line.selectedColor : CONFIG.line.color;
      ctx.lineWidth = isSelected ? CONFIG.line.width + 1 : CONFIG.line.width;
      ctx.lineCap = 'round';

      if (isSelected) {
        ctx.shadowColor = CONFIG.line.selectedColor;
        ctx.shadowBlur = 8;
      }

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        let end = { ...points[i + 1] };
        let originalEnd = { ...end }; // Store original end point for arrow calculation

        // Shorten line to avoid overlapping end player
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
          const angle = Math.atan2(originalEnd.y - start.y, originalEnd.x - start.x);
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

        // Draw endpoint indicators (arrows, screens)
        if (i === points.length - 2) {
          // Calculate angle from original end point, not shortened end
          const angle = Math.atan2(originalEnd.y - start.y, originalEnd.x - start.x);
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

      ctx.shadowBlur = 0;
    });

    ctx.setLineDash([]);
  }

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

  function getMousePos(e) {
    const rect = DOM.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      viewportX: e.clientX,
      viewportY: e.clientY
    };
  }

  function getTouchPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = DOM.canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      viewportX: touch.clientX,
      viewportY: touch.clientY
    };
  }

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
        if (lenSq === 0) continue;

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
  // HISTORY (UNDO/REDO)
  // ============================================================================

  function updateHistoryButtons() {
    DOM.undoBtn.disabled = appState.historyIndex <= 0;
    DOM.redoBtn.disabled = appState.historyIndex >= appState.history.length - 1;
  }

  function saveState() {
    if (appState.isAnimating || appState.isExporting) return;

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

  function undo() {
    if (appState.historyIndex > 0) {
      appState.historyIndex--;
      appState.frames = copyFrames(appState.history[appState.historyIndex]);
      switchFrame(appState.currentFrameIndex);
      updateHistoryButtons();
    }
  }

  function redo() {
    if (appState.historyIndex < appState.history.length - 1) {
      appState.historyIndex++;
      appState.frames = copyFrames(appState.history[appState.historyIndex]);
      switchFrame(appState.currentFrameIndex);
      updateHistoryButtons();
    }
  }

  // ============================================================================
  // RADIAL ACTION WHEEL
  // ============================================================================

  function showActionWheel(player, viewportX, viewportY) {
    appState.selectedPlayerId = player.id;

    const courtRect = DOM.courtContainer.getBoundingClientRect();
    const x = viewportX - courtRect.left - (DOM.actionWheel.offsetWidth / 2);
    const y = viewportY - courtRect.top - (DOM.actionWheel.offsetHeight / 2);

    DOM.actionWheel.style.left = `${x}px`;
    DOM.actionWheel.style.top = `${y}px`;

    DOM.actionWheel.classList.remove('hidden');
    DOM.actionWheel.classList.add('visible');
    setInstruction('Select an action from the wheel');
  }

  function hideActionWheel() {
    appState.selectedPlayerId = null;
    DOM.actionWheel.classList.remove('visible');
    setTimeout(() => {
      if (!DOM.actionWheel.classList.contains('visible')) {
        DOM.actionWheel.classList.add('hidden');
      }
    }, 150);
  }

  function handleWheelAction(tool) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    const player = currentFrame.players.find(p => p.id === appState.selectedPlayerId);

    if (!player) return;

    hideActionWheel();

    if (tool === 'delete') {
      currentFrame.players = currentFrame.players.filter(p => p.id !== player.id);
      currentFrame.lines = currentFrame.lines.filter(line =>
        line.startPlayerId !== player.id && line.endPlayerId !== player.id
      );
      draw();
      saveState();
      setInstruction('Player deleted');
    } else if (tool === 'assign-ball') {
      if (player.isOffense) {
        const currentBallHolder = currentFrame.players.find(p => p.hasBall);
        if (currentBallHolder && currentBallHolder !== player) {
          currentBallHolder.hasBall = false;
        }
        player.hasBall = !player.hasBall;
        draw();
        saveState();
        setInstruction(player.hasBall ? 'Ball assigned' : 'Ball removed');
      } else {
        setInstruction('Only offensive players can have the ball');
      }
    } else {
      if (['shoot', 'pass'].includes(tool) && !player.hasBall) {
        setInstruction("That player doesn't have the ball!");
        return;
      }

      currentFrame.lines = currentFrame.lines.filter(line => line.startPlayerId !== player.id);

      appState.isDrawingLine = true;
      appState.activeLineTool = tool;
      appState.previewLine = {
        id: lineIdCounter++,
        type: tool,
        startPlayerId: player.id,
        points: [{ x: player.x, y: player.y }, { x: player.x, y: player.y }]
      };
      setInstruction(`Drawing ${tool}. Click to add waypoints, double-click to finish.`);
      DOM.canvas.classList.add('drawing-line');
    }
  }

  // ============================================================================
  // PLAYER CREATION
  // ============================================================================

  function createPlayerAt(x, y, playerLabel) {
    const currentFrame = appState.frames[appState.currentFrameIndex];
    if (!currentFrame) return null;

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
    return newPlayer;
  }

  // ============================================================================
  // ANIMATION SYSTEM
  // ============================================================================

  function getPathLength(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDistance;
  }

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

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    const courtImg = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
    if (courtImg && courtImg.complete) {
      ctx.drawImage(courtImg, 0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    }

    drawLines(frameA.lines);

    const moveLines = new Map();
    const passLines = new Map();
    const shootLines = new Map();

    frameA.lines.forEach(line => {
      if (!line.startPlayerId) return;

      if (['cut', 'dribble', 'move', 'screen'].includes(line.type)) {
        moveLines.set(line.startPlayerId, line);
      } else if (line.type === 'pass') {
        passLines.set(line.startPlayerId, line);
      } else if (line.type === 'shoot') {
        shootLines.set(line.startPlayerId, line);
      }
    });

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
  // FILE OPERATIONS
  // ============================================================================

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
      showAlert('Failed to save play.');
    }
  }

  function handleLoad(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const loadedData = JSON.parse(event.target.result);

        if (!loadedData.frames || !Array.isArray(loadedData.frames)) {
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

        appState.frames.forEach(frame => {
          frame.lines.forEach(line => {
            if (!line.id) line.id = lineIdCounter++;
          });
        });

        appState.history = [copyFrames(appState.frames)];
        appState.historyIndex = 0;
        updateHistoryButtons();

        appState.currentFrameIndex = 0;
        DOM.playNameInput.value = loadedData.playName || '';
        DOM.courtToggle.value = appState.courtType;
        switchFrame(0);
      } catch (error) {
        console.error('Load error:', error);
        showAlert(`Could not load play file: ${error.message}`);
      }
    };

    reader.onerror = () => {
      console.error('File read error:', reader.error);
      showAlert('Error reading file.');
    };

    reader.readAsText(file);
  }

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

  async function handleExportVideo() {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.frames.length < 2) {
      showAlert('You need at least two frames to create a video.');
      return;
    }

    if (!DOM.canvas.captureStream || !window.MediaRecorder) {
      showAlert('Video export not supported in this browser. Use Chrome, Firefox, or Edge.');
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
        showAlert('Video recording failed.');
        appState.isExporting = false;
        DOM.exportVideoBtn.disabled = false;
        hideLoading();
      };

      recorder.start();

      let frameToPlay = 0;
      let frameStartTime = 0;
      let holdingFinalFrame = false;
      let finalFrameHoldStart = 0;

      function recordAnimationLoop(timestamp) {
        if (frameStartTime === 0) {
          frameStartTime = timestamp;
        }

        if (holdingFinalFrame) {
          if (timestamp - finalFrameHoldStart >= CONFIG.animation.finalFrameHold) {
            recorder.stop();
          } else {
            requestAnimationFrame(recordAnimationLoop);
          }
          return;
        }

        const elapsed = timestamp - frameStartTime;
        const progress = Math.min(1.0, elapsed / CONFIG.animation.speed);

        const currentRecordFrame = appState.frames[frameToPlay];
        if (!currentRecordFrame) {
          recorder.stop();
          return;
        }

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
        const courtImg = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
        if (courtImg && courtImg.complete) {
          ctx.drawImage(courtImg, 0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
        }

        drawLines(currentRecordFrame.lines);

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
      showAlert(`Could not record video: ${error.message}`);
      appState.isExporting = false;
      DOM.exportVideoBtn.disabled = false;
      hideLoading();
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  function handleNewPlay(confirmFirst = true) {
    if (confirmFirst && appState.frames.some(f => f.players.length > 0 || f.lines.length > 0)) {
      if (!confirm('Start new play? All unsaved progress will be lost.')) {
        return;
      }
    }

    if (appState.isAnimating && appState.animationFrameId) {
      cancelAnimationFrame(appState.animationFrameId);
    }

    appState = createInitialState();
    lineIdCounter = 1;
    DOM.playNameInput.value = '';
    DOM.courtToggle.value = 'half';
    renderFrameList();
    switchFrame(0);
    setInstruction('Drag a player onto the court to begin');
    updateHistoryButtons();
  }

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

  function handleDeleteFrame() {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.frames.length <= 1) {
      showAlert('You cannot delete the last frame.');
      return;
    }

    if (!confirm('Delete this frame?')) return;

    const deletedFrameIndex = appState.currentFrameIndex;
    appState.frames.splice(deletedFrameIndex, 1);
    const newIndex = Math.max(0, deletedFrameIndex - 1);
    switchFrame(newIndex);
    saveState();
  }

  function handleClearFrame() {
    if (appState.isAnimating || appState.isExporting) return;

    if (!confirm('Clear all players and lines from this frame?')) return;

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

  // ============================================================================
  // CANVAS INTERACTION (MOUSE & TOUCH)
  // ============================================================================

  function handleCanvasPointerDown(x, y, viewportX, viewportY, e) {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.isDrawingLine) {
      const now = Date.now();
      if (now - appState.lastClickTime < CONFIG.interaction.doubleClickTime) {
        // DOUBLE-CLICK: Finish the line
        e.preventDefault();
        appState.isDrawingLine = false;
        const finalLine = appState.previewLine;

        // Remove the last preview point
        finalLine.points.pop();

        // Check if double-click is on a player
        const playerAtEnd = getPlayerAtCoord(x, y);
        if (playerAtEnd) {
          // Snap to player center
          finalLine.points.push({ x: playerAtEnd.x, y: playerAtEnd.y });
          finalLine.endPlayerId = playerAtEnd.id;
        } else {
          // Use click position
          finalLine.points.push({ x, y });
        }

        // Ensure we have at least 2 points
        if (finalLine.points.length >= 2) {
          appState.frames[appState.currentFrameIndex].lines.push(finalLine);
        }

        appState.previewLine = null;

        setInstruction('Line created! Click a player to add another action.');
        DOM.canvas.classList.remove('drawing-line');
        draw();
        saveState();
      } else {
        // SINGLE-CLICK: Add a waypoint
        // Check if clicking on a player to snap waypoint
        const playerAtWaypoint = getPlayerAtCoord(x, y);
        if (playerAtWaypoint) {
          appState.previewLine.points.push({ x: playerAtWaypoint.x, y: playerAtWaypoint.y });
        } else {
          appState.previewLine.points.push({ x, y });
        }
        draw();
      }
      appState.lastClickTime = now;
    } else {
      const clickedLine = getLineAtCoord(x, y);

      if (clickedLine) {
        appState.selectedLineId = clickedLine.id;
        draw();

        if (confirm('Delete this action line?')) {
          const currentFrame = appState.frames[appState.currentFrameIndex];
          currentFrame.lines = currentFrame.lines.filter(l => l.id !== clickedLine.id);
          appState.selectedLineId = null;
          draw();
          saveState();
          setInstruction('Line deleted');
        } else {
          appState.selectedLineId = null;
          draw();
        }
        return;
      }

      const playerAtStart = getPlayerAtCoord(x, y);

      if (playerAtStart) {
        appState.isDragging = true;
        appState.draggingPlayer = playerAtStart;
        appState.dragStartX = x;
        appState.dragStartY = y;
        appState.dragOffsetX = x - playerAtStart.x;
        appState.dragOffsetY = y - playerAtStart.y;
        hideActionWheel();
        e.preventDefault();
      } else {
        hideActionWheel();
      }
    }
  }

  function handleCanvasPointerMove(x, y) {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.isDragging && appState.draggingPlayer) {
      appState.draggingPlayer.x = x - appState.dragOffsetX;
      appState.draggingPlayer.y = y - appState.dragOffsetY;
      scheduleDraw();
    } else if (appState.isDrawingLine) {
      appState.previewLine.points[appState.previewLine.points.length - 1] = { x, y };
      scheduleDraw();
    }
  }

  function handleCanvasPointerUp(x, y, viewportX, viewportY) {
    if (appState.isAnimating || appState.isExporting) return;

    if (appState.isDragging) {
      const draggedPlayer = appState.draggingPlayer;
      appState.isDragging = false;
      appState.draggingPlayer = null;

      const dist = Math.hypot(x - appState.dragStartX, y - appState.dragStartY);
      if (dist < CONFIG.interaction.clickTolerance) {
        showActionWheel(draggedPlayer, viewportX, viewportY);
      } else {
        saveState();
      }
    }
  }

  function handleCanvasMouseDown(e) {
    const { x, y, viewportX, viewportY } = getMousePos(e);
    handleCanvasPointerDown(x, y, viewportX, viewportY, e);
  }

  function handleCanvasMouseMove(e) {
    const { x, y } = getMousePos(e);
    handleCanvasPointerMove(x, y);
  }

  function handleCanvasMouseUp(e) {
    const { x, y, viewportX, viewportY } = getMousePos(e);
    handleCanvasPointerUp(x, y, viewportX, viewportY);
  }

  function handleCanvasTouchStart(e) {
    e.preventDefault();
    const { x, y, viewportX, viewportY } = getTouchPos(e);
    handleCanvasPointerDown(x, y, viewportX, viewportY, e);
  }

  function handleCanvasTouchMove(e) {
    e.preventDefault();
    const { x, y } = getTouchPos(e);
    handleCanvasPointerMove(x, y);
  }

  function handleCanvasTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = DOM.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    handleCanvasPointerUp(x, y, touch.clientX, touch.clientY);
  }

  function handleDrop(e) {
    e.preventDefault();
    DOM.canvas.classList.remove('drag-over');

    const playerLabel = e.dataTransfer.getData('text/plain');
    if (playerLabel) {
      const { x, y, viewportX, viewportY } = getMousePos(e);
      const newPlayer = createPlayerAt(x, y, playerLabel);

      if (newPlayer) {
        draw();
        saveState();
        showActionWheel(newPlayer, viewportX, viewportY);
      }
    }
  }

  // ============================================================================
  // EVENT LISTENER REGISTRATION
  // ============================================================================

  DOM.newPlayBtn.addEventListener('click', () => handleNewPlay(true));
  DOM.clearFrameBtn.addEventListener('click', handleClearFrame);
  DOM.saveBtn.addEventListener('click', handleSave);
  DOM.loadBtn.addEventListener('click', () => DOM.loadFileInput.click());
  DOM.exportPdfBtn.addEventListener('click', handleExportPDF);
  DOM.exportVideoBtn.addEventListener('click', handleExportVideo);

  DOM.addFrameBtn.addEventListener('click', handleAddFrame);
  DOM.deleteFrameBtn.addEventListener('click', handleDeleteFrame);

  DOM.undoBtn.addEventListener('click', undo);
  DOM.redoBtn.addEventListener('click', redo);

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

    if (appState.selectedPlayerId) {
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
        handleWheelAction(toolMap[key]);
      }

      if (key === 'escape') {
        e.preventDefault();
        hideActionWheel();
      }
    }

    if (appState.isDrawingLine && e.key === 'Escape') {
      e.preventDefault();
      appState.isDrawingLine = false;
      appState.previewLine = null;
      DOM.canvas.classList.remove('drawing-line');
      draw();
      setInstruction('Line cancelled');
    }
  });

  DOM.courtToggle.addEventListener('change', (e) => {
    appState.courtType = e.target.value;
    draw();
  });

  DOM.frameList.addEventListener('click', (e) => {
    if (appState.isAnimating || appState.isExporting) return;
    hideActionWheel();

    const clickedFrame = e.target.closest('.frame-thumbnail');
    if (!clickedFrame) return;

    const frameId = parseInt(clickedFrame.dataset.frameId);
    const frameIndex = appState.frames.findIndex(f => f.id === frameId);
    if (frameIndex !== -1) {
      switchFrame(frameIndex);
    }
  });

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

  DOM.loadFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleLoad(file);
    }
    e.target.value = null;
  });

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

  DOM.canvas.addEventListener('contextmenu', e => e.preventDefault());
  DOM.canvas.addEventListener('mousedown', handleCanvasMouseDown);
  DOM.canvas.addEventListener('mousemove', handleCanvasMouseMove);
  DOM.canvas.addEventListener('mouseup', handleCanvasMouseUp);
  DOM.canvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
  DOM.canvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
  DOM.canvas.addEventListener('touchend', handleCanvasTouchEnd, { passive: false });
  DOM.canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.canvas.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'copy';
  });
  DOM.canvas.addEventListener('dragleave', () => DOM.canvas.classList.remove('drag-over'));
  DOM.canvas.addEventListener('drop', handleDrop);
  DOM.canvas.addEventListener('mouseout', () => {
    if (appState.isDragging) {
      appState.isDragging = false;
      appState.draggingPlayer = null;
      draw();
      saveState();
    }
    DOM.canvas.classList.remove('drag-over');
  });

  DOM.actionWheel.addEventListener('click', (e) => {
    const button = e.target.closest('.wheel-button');
    if (button) {
      handleWheelAction(button.dataset.tool);
    }
  });

  document.addEventListener('click', (e) => {
    if (!DOM.actionWheel.contains(e.target) &&
        !DOM.canvas.contains(e.target) &&
        DOM.actionWheel.classList.contains('visible')) {
      hideActionWheel();
    }
  });

  DOM.playerToolIcons.forEach(icon => {
    icon.addEventListener('dragstart', (e) => {
      if (appState.isAnimating || appState.isExporting) {
        e.preventDefault();
        return;
      }

      e.dataTransfer.setData('text/plain', icon.dataset.player);
      e.dataTransfer.effectAllowed = 'copy';
      icon.classList.add('dragging');
      setInstruction(`Drop player ${icon.dataset.player} onto the court`);
    });

    icon.addEventListener('dragend', () => {
      icon.classList.remove('dragging');
      setInstruction('Drag a player onto the court');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeToolboxIcons();
  initializeActionWheelIcons();
  renderFrameList();
  draw();
  setInstruction('Drag a player onto the court to begin');
  updateHistoryButtons();

  console.log('✅ Basketball Playmaker Pro (Radial Menu) initialized');
});