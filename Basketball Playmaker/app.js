// ===== CONSTANTS =====
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_RADIUS = 15;
const OFFENSE_COLOR = '#007bff';
const DEFENSE_COLOR = '#dc3545';
const BALL_HOLDER_COLOR = '#000000';
const LINE_COLOR = '#343a40';
const LINE_HIT_THRESHOLD = 10;
const MAX_HISTORY = 50;

// ===== DOM ELEMENTS =====
const canvas = document.getElementById('play-canvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const playNameInput = document.getElementById('play-name');
const courtToggle = document.getElementById('court-toggle');
const addFrameBtn = document.getElementById('add-frame');
const deleteFrameBtn = document.getElementById('delete-frame');
const frameList = document.getElementById('frame-list');
const frameNotes = document.getElementById('frame-notes');
const toolbox = document.getElementById('drawing-toolbox');
const instructionText = document.getElementById('instruction-text');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

// ===== COURT IMAGES =====
const halfCourtImg = new Image();
halfCourtImg.src = './images/halfcourt.webp';
const fullCourtImg = new Image();
fullCourtImg.src = './images/fullcourt.webp';

const canvasCache = { court: document.createElement('canvas') };
canvasCache.court.width = CANVAS_WIDTH;
canvasCache.court.height = CANVAS_HEIGHT;

// ===== STATE =====
function createNewFrame(id) {
  return { id, notes: "", players: [], lines: [] };
}

function createInitialState() {
  return {
    courtType: 'half',
    activeTool: 'select',
    frames: [createNewFrame(1)],
    currentFrameIndex: 0,
    nextFrameId: 2,
    isDragging: false,
    draggingPlayer: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    isDrawingLine: false,
    previewLine: null
  };
}

let appState = createInitialState();

// ===== COMMAND PATTERN (Undo/Redo) =====
const commandHistory = { past: [], future: [] };

class Command { execute(){} undo(){} }

class AddPlayerCommand extends Command {
  constructor(frame, player) { super(); this.frame = frame; this.player = player; }
  execute() { this.frame.players.push(this.player); }
  undo() { this.frame.players = this.frame.players.filter(p => p !== this.player); }
}

function executeCommand(command) {
  command.execute();
  commandHistory.past.push(command);
  commandHistory.future = [];
  if (commandHistory.past.length > MAX_HISTORY) commandHistory.past.shift();
  updateUndoRedoButtons();
  draw();
}

function undo() {
  if (!commandHistory.past.length) return;
  const cmd = commandHistory.past.pop();
  cmd.undo();
  commandHistory.future.push(cmd);
  updateUndoRedoButtons();
  draw();
}

function redo() {
  if (!commandHistory.future.length) return;
  const cmd = commandHistory.future.pop();
  cmd.execute();
  commandHistory.past.push(cmd);
  updateUndoRedoButtons();
  draw();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = commandHistory.past.length === 0;
  redoBtn.disabled = commandHistory.future.length === 0;
}

// ===== UTILITIES =====
function showToast(message, type='info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ===== DRAWING =====
function cacheCourtImage() {
  const cacheCtx = canvasCache.court.getContext('2d');
  cacheCtx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  const img = appState.courtType === 'half' ? halfCourtImg : fullCourtImg;
  cacheCtx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function draw() {
  ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  ctx.drawImage(canvasCache.court, 0, 0);
  const frame = appState.frames[appState.currentFrameIndex];
  if (!frame) return;
  // Draw players
  frame.players.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI*2);
    ctx.fillStyle = p.isOffense ? OFFENSE_COLOR : DEFENSE_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, p.x, p.y);
  });
}

// ===== EVENT HANDLERS =====
toolbox.addEventListener('click', e => {
  if (e.target.classList.contains('tool-btn')) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    appState.activeTool = e.target.dataset.tool;
    instructionText.textContent = `Tool: ${appState.activeTool}`;
  }
});

canvas.addEventListener('click', e => {
  if (appState.activeTool === 'player') {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const player = { label: "P", x, y, isOffense: true };
    executeCommand(new AddPlayerCommand(appState.frames[appState.currentFrameIndex], player));
  }
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

courtToggle.addEventListener('change', () => {
  appState.courtType = courtToggle.value;
  cacheCourtImage();
  draw();
});

// ===== INIT =====
halfCourtImg.onload = () => { cacheCourtImage(); draw(); };
fullCourtImg.onload = () => { cacheCourtImage(); draw(); };
