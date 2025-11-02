// Wait for the HTML document to finish loading
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. GET ALL OUR HTML ELEMENTS ---
    const canvas = document.getElementById('play-canvas');
    const ctx = canvas.getContext('2d');
    const instructionText = document.getElementById('instruction-text');
    const playNameInput = document.getElementById('play-name');
    const courtToggle = document.getElementById('court-toggle');
    const clearFrameBtn = document.getElementById('clear-frame');
    const saveBtn = document.getElementById('save-play');
    const loadBtn = document.getElementById('load-play');
    const loadFileInput = document.getElementById('load-file-input');
    const animateBtn = document.getElementById('animate-play');
    const exportGifBtn = document.getElementById('export-gif');
    const exportPdfBtn = document.getElementById('export-pdf');
    const newPlayBtn = document.getElementById('new-play');
    const addFrameBtn = document.getElementById('add-frame');
    const deleteFrameBtn = document.getElementById('delete-frame');
    const frameList = document.getElementById('frame-list');
    const frameNotes = document.getElementById('frame-notes');
    const toolbox = document.getElementById('drawing-toolbox');

    // --- 2. SETUP CANVAS & IMAGES ---
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 600;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const halfCourtImg = new Image();
    halfCourtImg.src = 'images/halfcourt.webp';
    const fullCourtImg = new Image();
    fullCourtImg.src = 'images/fullcourt.webp';

    // --- 3. APPLICATION STATE ---
    const createNewFrame = (id) => ({
        id: id,
        notes: "",
        players: [],
        lines: []
    });

    const createInitialState = () => ({
        courtType: 'half',
        activeTool: 'select',
        activePlayerTool: null,
        frames: [ createNewFrame(1) ],
        currentFrameIndex: 0,
        nextFrameId: 2,
        nextPlayerId: 1, 
        isDragging: false,
        draggingPlayer: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        isDrawingLine: false,
        previewLine: null,
        isAnimating: false,
        isExporting: false,
        animationFrameId: null,
        animationStartTime: 0,
        currentFramePlaying: 0
    });

    let appState = createInitialState();

    // Constants for drawing
    const PLAYER_RADIUS = 15;
    const OFFENSE_COLOR = '#007bff';
    const DEFENSE_COLOR = '#dc3545';
    const BALL_HOLDER_COLOR = '#000000';
    const LINE_COLOR = '#343a40';
    const ANIMATION_SPEED = 1500; // MS per frame

    // --- 4. MAIN DRAWING & HELPER FUNCTIONS ---

    function draw() {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const courtImg = (appState.courtType === 'half') ? halfCourtImg : fullCourtImg;
        ctx.drawImage(courtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        drawLines(currentFrame.lines);
        if (appState.previewLine) {
            drawLines([appState.previewLine]);
        }
        drawPlayers(currentFrame.players);
    }

    function drawPlayerAt(player, x, y, hasBall) {
        ctx.beginPath();
        ctx.arc(x, y, player.radius, 0, 2 * Math.PI);
        ctx.fillStyle = player.isOffense ? OFFENSE_COLOR : DEFENSE_COLOR;
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
            ctx.arc(x, y, player.radius + 5, 0, 2 * Math.PI);
            ctx.strokeStyle = BALL_HOLDER_COLOR;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    function drawPlayers(players) {
        players.forEach(player => {
            drawPlayerAt(player, player.x, player.y, player.hasBall);
        });
    }

    // UPDATED: drawLines now stops short of target players (Issue #3)
    function drawLines(lines) {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        lines.forEach(line => {
            const { type, points, endPlayerId } = line;
            if (points.length < 2) return;

            ctx.strokeStyle = LINE_COLOR;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';

            for (let i = 0; i < points.length - 1; i++) {
                const start = points[i];
                let end = { ...points[i+1] }; // Clone end point

                // Check if this is the last segment of the line
                if (i === points.length - 2) {
                    // And if this line ends on a player
                    const endPlayer = endPlayerId ? currentFrame.players.find(p => p.id === endPlayerId) : null;
                    if (endPlayer) {
                        // NEW: Shorten line to stop before player (Issue #3)
                        const dx = end.x - start.x;
                        const dy = end.y - start.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        // Pull back further for passes to see arrowhead clearly
                        const pullBack = PLAYER_RADIUS + (type === 'pass' ? 7 : 4); 
                        
                        if (dist > pullBack) {
                            const ratio = (dist - pullBack) / dist;
                            end.x = start.x + dx * ratio;
                            end.y = start.y + dy * ratio;
                        }
                    }
                }

                switch (type) {
                    case 'pass':
                        ctx.setLineDash([5, 10]);
                        break;
                    case 'dribble':
                        // UPDATED: Call new sine-wave dribble line (Issue #2)
                        drawDribbleLine(start, end);
                        continue; // Skip the rest of the loop
                    default:
                        ctx.setLineDash([]);
                        break;
                }

                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw arrowhead/screen end
                if (i === points.length - 2) {
                    const angle = Math.atan2(end.y - start.y, end.x - start.x);
                    switch (type) {
                        case 'cut':
                        case 'move':
                        case 'shoot':
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

    function drawArrowhead(end, angle) {
        const arrowLength = 12;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - arrowLength * Math.cos(angle - Math.PI / 6), end.y - arrowLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - arrowLength * Math.cos(angle + Math.PI / 6), end.y - arrowLength * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    function drawScreenEnd(end, angle) {
        const screenWidth = 12;
        ctx.beginPath();
        const x1 = end.x - screenWidth * Math.sin(angle);
        const y1 = end.y + screenWidth * Math.cos(angle);
        const x2 = end.x + screenWidth * Math.sin(angle);
        const y2 = end.y - screenWidth * Math.cos(angle);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    // NEW: Rewritten drawDribbleLine for a smoother sine wave (Issue #2)
    function drawDribbleLine(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const angle = Math.atan2(dy, dx);
        const segments = Math.floor(dist / 10); // A point every 10 pixels
        const amplitude = 8; // How far out the sine wave goes
        const frequency = 5; // How many waves

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const x = start.x + dx * t;
            const y = start.y + dy * t;

            // Calculate perpendicular offset using a sine wave
            const offset = Math.sin(t * Math.PI * frequency) * amplitude;
            const offsetX = Math.sin(angle) * offset; // Perpendicular vector's x
            const offsetY = -Math.cos(angle) * offset; // Perpendicular vector's y

            ctx.lineTo(x + offsetX, y + offsetY);
        }
        ctx.lineTo(end.x, end.y); // Ensure it ends at the exact point
        ctx.stroke();
        drawArrowhead(end, angle);
    }


    function getPlayerAtCoord(x, y) {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return null;
        for (let i = currentFrame.players.length - 1; i >= 0; i--) {
            const player = currentFrame.players[i];
            const distance = Math.sqrt((x - player.x)**2 + (y - player.y)**2);
            if (distance < player.radius) {
                return player;
            }
        }
        return null;
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function renderFrameList() {
        frameList.innerHTML = '';
        appState.frames.forEach((frame, index) => {
            const frameEl = document.createElement('div');
            frameEl.className = 'frame-thumbnail';
            frameEl.textContent = `Frame ${index + 1}`;
            frameEl.dataset.frameId = frame.id;
            if (index === appState.currentFrameIndex && !appState.isAnimating) {
                frameEl.classList.add('active');
            }
            if (index === appState.currentFramePlaying && appState.isAnimating) {
                frameEl.classList.add('active');
            }
            frameList.appendChild(frameEl);
        });
    }

    function switchFrame(newFrameIndex) {
        if (newFrameIndex < 0 || newFrameIndex >= appState.frames.length) {
            newFrameIndex = appState.frames.length - 1;
            if (newFrameIndex < 0) newIndex = 0;
        }

        appState.currentFrameIndex = newFrameIndex;

        if (appState.frames.length > 0 && appState.frames[newFrameIndex]) {
            renderFrameList();
            draw();
            frameNotes.value = appState.frames[newFrameIndex].notes;
        } else {
            handleNewPlay(false);
        }
    }

    function handleNewPlay(confirmFirst = true) {
        if (confirmFirst && !confirm('Are you sure you want to start a new play? All unsaved progress will be lost.')) {
            return;
        }

        if (appState.isAnimating) {
            cancelAnimationFrame(appState.animationFrameId);
        }

        appState = createInitialState();
        playNameInput.value = '';
        courtToggle.value = 'half';
        renderFrameList();
        switchFrame(0);
        instructionText.textContent = 'Select a tool to begin';
    }

    newPlayBtn.addEventListener('click', () => handleNewPlay(true));

    deleteFrameBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        if (appState.frames.length <= 1) {
            alert('You cannot delete the last frame.');
            return;
        }
        if (confirm('Are you sure you want to delete this frame?')) {
            const deletedFrameIndex = appState.currentFrameIndex;
            appState.frames.splice(deletedFrameIndex, 1);
            let newIndex = deletedFrameIndex - 1;
            if (newIndex < 0) {
                newIndex = 0;
            }
            switchFrame(newIndex);
        }
    });

    courtToggle.addEventListener('change', (e) => {
        appState.courtType = e.target.value;
        draw();
    });

    // UPDATED: Toolbox listener (click)
    toolbox.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const clickedButton = e.target.closest('.tool-btn');
        if (!clickedButton) return;
        
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        clickedButton.classList.add('active');
        
        const tool = clickedButton.dataset.tool;
        appState.activeTool = tool;

        if (tool === 'player') {
            appState.activePlayerTool = clickedButton.dataset.player;
            instructionText.textContent = `Click or Drag player ${appState.activePlayerTool} onto the court`;
        } else {
            appState.activePlayerTool = null;
            if (tool === 'select') {
                instructionText.textContent = 'Click and drag a player to move them';
            } else if (tool === 'delete') {
                instructionText.textContent = 'Click on a player or line to delete';
            } else if (tool === 'assign-ball') {
                instructionText.textContent = 'Click on an offensive player to give them the ball';
            } else {
                instructionText.textContent = `Click a player to start a ${tool} line`;
            }
        }
    });

    // NEW: Drag and Drop Listeners for Toolbox (Issue #4)
    toolbox.addEventListener('dragstart', (e) => {
        const button = e.target.closest('.tool-btn');
        if (button && button.dataset.tool === 'player') {
            appState.activeTool = 'player';
            appState.activePlayerTool = button.dataset.player;
            button.classList.add('dragging');
            e.dataTransfer.setData('text/plain', button.dataset.player);
            instructionText.textContent = `Drop player ${appState.activePlayerTool} onto the court`;
        } else {
            e.preventDefault();
        }
    });

    toolbox.addEventListener('dragend', (e) => {
        const button = e.target.closest('.tool-btn');
        if (button) button.classList.remove('dragging');
    });


    frameList.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const clickedFrame = e.target.closest('.frame-thumbnail');
        if (!clickedFrame) return;
        const frameId = parseInt(clickedFrame.dataset.frameId);
        const frameIndex = appState.frames.findIndex(f => f.id === frameId);
        if (frameIndex !== -1) {
            switchFrame(frameIndex);
        }
    });

    frameNotes.addEventListener('input', () => {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (currentFrame) {
            currentFrame.notes = frameNotes.value;
        }
    });

    clearFrameBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        if (confirm('Are you sure you want to clear this frame?')) {
            const currentFrame = appState.frames[appState.currentFrameIndex];
            if (currentFrame) {
                currentFrame.players = [];
                currentFrame.lines = [];
                currentFrame.notes = "";
                frameNotes.value = "";
            }
            draw();
        }
    });

    // This robust "Add Frame" logic is from our previous stable version
    addFrameBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        const newFrame = createNewFrame(appState.nextFrameId);
        appState.nextFrameId++;

        newFrame.players = JSON.parse(JSON.stringify(currentFrame.players));

        let ballWasPassed = false;
        let passer = null;

        currentFrame.lines.forEach(line => {
            if (line.points.length < 2 || !line.startPlayerId) return;
            
            const endPoint = line.points[line.points.length - 1];
            const startPlayer = newFrame.players.find(p => p.id === line.startPlayerId);
            if (!startPlayer) return;

            if (line.type === 'cut' || line.type === 'move' || line.type === 'dribble' || line.type === 'shoot' || line.type === 'screen') {
                startPlayer.x = endPoint.x;
                startPlayer.y = endPoint.y;
            }

            if (line.type === 'pass') {
                const endPlayer = newFrame.players.find(p => p.id === line.endPlayerId);
                if (endPlayer) {
                    endPlayer.hasBall = true;
                    ballWasPassed = true;
                    passer = startPlayer;
                }
            }
        });

        if (ballWasPassed && passer) {
            passer.hasBall = false;
        }

        appState.frames.push(newFrame);
        switchFrame(appState.frames.length - 1);
    });


    // --- 5. ANIMATION LOGIC (REWRITTEN for Issue #1) ---

    // NEW: Helper to get total length of a multi-point line
    function getPathLength(points) {
        let totalDistance = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i+1].x - points[i].x;
            const dy = points[i+1].y - points[i].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        return totalDistance;
    }

    // NEW: Helper to find a point along a multi-point path
    function getPointAlongPath(points, distanceToTravel) {
        if (distanceToTravel <= 0) return points[0];

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i+1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength === 0) continue;

            if (distanceToTravel <= segmentLength) {
                // This is the correct segment
                const ratio = distanceToTravel / segmentLength;
                return {
                    x: start.x + dx * ratio,
                    y: start.y + dy * ratio
                };
            }
            distanceToTravel -= segmentLength;
        }
        return points[points.length - 1]; // Past end of path
    }

    // UPDATED: animatePlay now follows paths
    function animatePlay(timestamp) {
        if (appState.animationStartTime === 0) {
            appState.animationStartTime = timestamp;
        }
        const elapsed = timestamp - appState.animationStartTime;
        const progress = Math.min(1.0, elapsed / ANIMATION_SPEED);

        const frameA = appState.frames[appState.currentFramePlaying];
        if (!frameA) {
            stopAnimation();
            return;
        }

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(appState.courtType === 'half' ? halfCourtImg : fullCourtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const staticLines = frameA.lines.filter(l => l.type === 'screen');
        drawLines(staticLines);

        const passLine = frameA.lines.find(l => l.type === 'pass');

        frameA.players.forEach(p1 => {
            let drawX = p1.x, drawY = p1.y, hasBall = p1.hasBall;

            // Find the line this player is supposed to follow
            const moveLine = frameA.lines.find(l => 
                l.startPlayerId === p1.id && 
                (l.type === 'cut' || l.type === 'dribble' || l.type === 'move' || l.type === 'shoot')
            );

            if (moveLine) {
                // Player is moving along the path
                const pathLength = getPathLength(moveLine.points);
                const distanceToTravel = pathLength * progress;
                const newPos = getPointAlongPath(moveLine.points, distanceToTravel);
                drawX = newPos.x;
                drawY = newPos.y;
            }

            if (passLine && passLine.startPlayerId === p1.id) {
                hasBall = false;
            }
            
            drawPlayerAt(p1, drawX, drawY, hasBall);
        });

        if (passLine) {
            // Animate the ball
            const passPathLength = getPathLength(passLine.points);
            const passDist = passPathLength * progress;
            const ballPos = getPointAlongPath(passLine.points, passDist);

            ctx.beginPath();
            ctx.arc(ballPos.x, ballPos.y, PLAYER_RADIUS / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF8C00'; // Orange
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ballPos.x, ballPos.y, PLAYER_RADIUS + 5, 0, 2 * Math.PI);
            ctx.strokeStyle = BALL_HOLDER_COLOR;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        if (progress < 1.0) {
            appState.animationFrameId = requestAnimationFrame(animatePlay);
        } else {
            appState.currentFramePlaying++;
            appState.animationStartTime = 0;
            if (appState.currentFramePlaying >= appState.frames.length - 1) {
                stopAnimation();
                switchFrame(appState.currentFramePlaying);
            } else {
                renderFrameList();
                appState.animationFrameId = requestAnimationFrame(animatePlay);
            }
        }
    }

    function stopAnimation() {
        if (appState.isAnimating) {
            cancelAnimationFrame(appState.animationFrameId);
            appState.isAnimating = false;
            appState.animationStartTime = 0;
            animateBtn.textContent = '▶️ Animate';
            // Use the CSS class color, don't hardcode it
            animateBtn.classList.remove('btn-danger');
            animateBtn.classList.add('btn-primary');
            renderFrameList();
        }
    }

    animateBtn.addEventListener('click', () => {
        if (appState.isExporting) return;

        if (appState.isAnimating) {
            stopAnimation();
        } else {
            if (appState.frames.length < 2) {
                alert("You need at least two frames to animate.");
                return;
            }
            appState.isAnimating = true;
            appState.currentFramePlaying = 0;
            appState.animationStartTime = 0;
            animateBtn.textContent = '⏹️ Stop';
            animateBtn.classList.remove('btn-primary');
            animateBtn.classList.add('btn-danger');
            renderFrameList();
            appState.animationFrameId = requestAnimationFrame(animatePlay);
        }
    });


    // --- 6. SAVE, LOAD, & EXPORT ---
    // (Unchanged from stable version)
    saveBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        const playName = playNameInput.value || 'Untitled Play';
        const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        const saveData = {
            playName: playName,
            courtType: appState.courtType,
            frames: appState.frames,
            nextFrameId: appState.nextFrameId,
            nextPlayerId: appState.nextPlayerId 
        };
        const jsonString = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });

    loadBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        loadFileInput.click();
    });

    loadFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const loadedData = JSON.parse(event.target.result);
                handleNewPlay(false);
                appState.playName = loadedData.playName;
                appState.courtType = loadedData.courtType;
                appState.frames = loadedData.frames;
                appState.nextFrameId = loadedData.nextFrameId || (appState.frames.length + 1);
                appState.nextPlayerId = loadedData.nextPlayerId || 100;
                
                appState.currentFrameIndex = 0;
                playNameInput.value = appState.playName;
                courtToggle.value = appState.courtType;
                switchFrame(0);
            } catch (error) {
                console.error('Error loading or parsing file:', error);
                alert('Could not load the play file. It may be corrupt.');
            }
        };
        reader.onerror = () => {
            console.error('Error reading file:', reader.error);
            alert('Error reading file.');
        };
        reader.readAsText(file);
        e.target.value = null;
    });

    exportPdfBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    exportGifBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });

    // --- 7. CANVAS MOUSE LISTENERS ---

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // NEW: Helper function to create a player
    function createPlayerAt(x, y) {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame || appState.activeTool !== 'player') return;

        const isOffense = !appState.activePlayerTool.startsWith('X');
        const newPlayer = {
            id: appState.nextPlayerId++,
            x: x, y: y, radius: PLAYER_RADIUS,
            label: appState.activePlayerTool,
            hasBall: false, isOffense: isOffense
        };
        currentFrame.players.push(newPlayer);
        draw();
    }

    canvas.addEventListener('click', (e) => {
        if (appState.isDragging || appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);

        if (appState.activeTool === 'player') {
            createPlayerAt(x, y);
        } else if (appState.activeTool === 'assign-ball') {
            const clickedPlayer = getPlayerAtCoord(x, y);
            if (clickedPlayer && clickedPlayer.isOffense) {
                const currentBallHolder = currentFrame.players.find(p => p.hasBall);
                if (currentBallHolder && currentBallHolder !== clickedPlayer) {
                    currentBallHolder.hasBall = false;
                }
                clickedPlayer.hasBall = !clickedPlayer.hasBall;
            }
        } else if (appState.activeTool === 'delete') {
             const clickedPlayer = getPlayerAtCoord(x, y);
             if (clickedPlayer) {
                 if (confirm(`Delete player ${clickedPlayer.label}?`)) {
                    const index = currentFrame.players.indexOf(clickedPlayer);
                    if (index > -1) {
                        currentFrame.players.splice(index, 1);
                    }
                 }
             }
             // TODO: Add logic to delete lines
        }
        draw();
    });

    canvas.addEventListener('mousedown', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);
        const playerAtStart = getPlayerAtCoord(x, y);

        if (e.button === 0) { // Left click
            if (appState.activeTool === 'select') {
                if (playerAtStart) {
                    appState.isDragging = true;
                    appState.draggingPlayer = playerAtStart;
                    appState.dragOffsetX = x - playerAtStart.x;
                    appState.dragOffsetY = y - playerAtStart.y;
                    e.preventDefault();
                }
            } else if (appState.activeTool !== 'player' && appState.activeTool !== 'assign-ball' && appState.activeTool !== 'delete') {
                // This is a line-drawing tool
                if (!appState.isDrawingLine) {
                    if (playerAtStart) {
                        appState.isDrawingLine = true;
                        appState.previewLine = {
                            type: appState.activeTool,
                            startPlayerId: playerAtStart.id, 
                            points: [ { x: playerAtStart.x, y: playerAtStart.y }, { x, y } ]
                        };
                        instructionText.textContent = 'Left-click to finish line, right-click to add a point';
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
                    instructionText.textContent = `Line created. Click another player to start a new line.`;
                    e.preventDefault();
                    draw();
                }
            }
        } else if (e.button === 2) { // Right click
            if (appState.isDrawingLine) {
                const { x, y } = getMousePos(e);
                appState.previewLine.points.push({ x, y });
                instructionText.textContent = 'Point added. Left-click to finish, right-click for another point.';
                e.preventDefault();
                draw();
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        if (appState.isDragging && appState.draggingPlayer) {
            const { x, y } = getMousePos(e);
            appState.draggingPlayer.x = x - appState.dragOffsetX;
            appState.draggingPlayer.y = y - appState.dragOffsetY;
            draw();
        } else if (appState.isDrawingLine) {
            const { x, y } = getMousePos(e);
            const lastPointIndex = appState.previewLine.points.length - 1;
            appState.previewLine.points[lastPointIndex] = { x, y };
            draw();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        if (e.button === 0 && appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
        }
    });

    canvas.addEventListener('mouseout', (e) => {
        if (appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
        }
        if (appState.isDrawingLine) {
            appState.isDrawingLine = false;
            appState.previewLine = null;
            draw();
        }
    });

    // NEW: Drag and Drop Listeners for Canvas (Issue #4)
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (appState.activeTool === 'player') {
            canvas.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    canvas.addEventListener('dragleave', (e) => {
        canvas.classList.remove('drag-over');
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.classList.remove('drag-over');
        if (appState.activeTool === 'player') {
            const { x, y } = getMousePos(e);
            createPlayerAt(x, y);
            // De-select the tool
            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.tool-btn[data-tool="select"]').classList.add('active');
            appState.activeTool = 'select';
            instructionText.textContent = 'Player placed. Select a tool to begin.';
        }
    });


    // --- 8. INITIALIZE ---
    halfCourtImg.onload = () => {
        renderFrameList();
        draw();
    };
    fullCourtImg.onload = () => {
        renderFrameList();
        draw();
    };
    halfCourtImg.onerror = () => alert("Error: Could not load 'halfcourt.webp'. Make sure it's in the 'images' folder.");
    fullCourtImg.onerror = () => alert("Error: Could not load 'fullcourt.webp'. Make sure it's in the 'images' folder.");

});
