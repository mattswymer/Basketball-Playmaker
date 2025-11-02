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
        selectedPlayerId: null, // NEW: For "Select Player" workflow (Issue #7)
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
    const SELECTED_COLOR = '#f39c12'; // NEW: Yellow for selected (Issue #7)
    const ANIMATION_SPEED = 1500; // MS per frame (slowing down slightly)

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
        // NEW: Draw selection ring first (Issue #7)
        if (player.id === appState.selectedPlayerId && !appState.isAnimating) {
            ctx.beginPath();
            ctx.arc(x, y, player.radius + 8, 0, 2 * Math.PI);
            ctx.strokeStyle = SELECTED_COLOR;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

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
                        const pullBack = PLAYER_RADIUS + (type === 'pass' ? 6 : 3); // Extra room for pass
                        
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
                    if (type === 'shoot') { /* ... (unchanged) ... */ }
                }
            }
        });
        ctx.setLineDash([]);
    }

    function drawArrowhead(end, angle) { /* ... (unchanged) ... */ }
    function drawScreenEnd(end, angle) { /* ... (unchanged) ... */ }

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

    function getPlayerAtCoord(x, y) { /* ... (unchanged) ... */ }
    function getMousePos(e) { /* ... (unchanged) ... */ }
    function renderFrameList() { /* ... (unchanged) ... */ }

    // NEW: Helper function to programmatically activate a tool
    function activateTool(toolName, playerToolLabel = null) {
        appState.activeTool = toolName;
        appState.activePlayerTool = playerToolLabel;

        document.querySelectorAll('.tool-btn').forEach(btn => {
            const isPlayerTool = btn.dataset.tool === 'player';
            const isMatchingTool = isPlayerTool ?
                (toolName === 'player' && btn.dataset.player === playerToolLabel) :
                (btn.dataset.tool === toolName);

            if (isMatchingTool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update instruction text
        updateInstructionText();
    }
    
    // NEW: Helper to update instructions
    function updateInstructionText() {
        const tool = appState.activeTool;
        const selectedPlayer = appState.selectedPlayerId ? 
            appState.frames[appState.currentFrameIndex].players.find(p => p.id === appState.selectedPlayerId) : 
            null;

        if (selectedPlayer) {
            if (tool === 'select') {
                instructionText.textContent = `Player ${selectedPlayer.label} selected. Drag to move, or select an action. (Hotkeys: P, D, C...)`;
            } else {
                instructionText.textContent = `Drawing ${tool} line from ${selectedPlayer.label}. Click to set end point.`;
            }
        } else {
            switch (tool) {
                case 'select':
                    instructionText.textContent = 'Click a player to select them, or click-drag to move.';
                    break;
                case 'player':
                    instructionText.textContent = `Click on the court to place player ${appState.activePlayerTool}`;
                    break;
                // ... (other cases from previous version) ...
                default:
                    instructionText.textContent = `Click a player to start a ${tool} line.`;
                    break;
            }
        }
    }

    function switchFrame(newFrameIndex) {
        if (newFrameIndex < 0 || newFrameIndex >= appState.frames.length) {
            newFrameIndex = appState.frames.length - 1;
            if (newFrameIndex < 0) newFrameIndex = 0;
        }

        appState.currentFrameIndex = newFrameIndex;
        appState.selectedPlayerId = null; // NEW: Deselect player on frame switch

        if (appState.frames.length > 0 && appState.frames[newFrameIndex]) {
            renderFrameList();
            draw();
            frameNotes.value = appState.frames[newFrameIndex].notes;
        } else {
            handleNewPlay(false);
        }
        updateInstructionText();
    }

    function handleNewPlay(confirmFirst = true) { /* ... (unchanged, but now calls updateInstructionText at end) ... */ }
    newPlayBtn.addEventListener('click', () => handleNewPlay(true));
    deleteFrameBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    courtToggle.addEventListener('change', (e) => { /* ... (unchanged) ... */ });

    // UPDATED: Toolbox listener now uses activateTool helper
    toolbox.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const clickedButton = e.target.closest('.tool-btn');
        if (!clickedButton) return;

        const tool = clickedButton.dataset.tool;
        const player = clickedButton.dataset.player || null;
        
        activateTool(tool, player);

        // NEW: If a line tool is clicked, and a player is selected, start drawing
        if (appState.selectedPlayerId && tool !== 'player' && tool !== 'select' && tool !== 'delete' && tool !== 'assign-ball') {
            startLineFromSelectedPlayer();
        }
    });

    frameList.addEventListener('click', (e) => { /* ... (unchanged) ... */ });
    frameNotes.addEventListener('input', () => { /* ... (unchanged) ... */ });
    clearFrameBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    addFrameBtn.addEventListener('click', () => { /* ... (unchanged, logic is still robust) ... */ });

    // --- 5. ANIMATION LOGIC (COMPLETELY REWRITTEN) ---

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

    // NEW: Helper to find a point along a multi-point path (Issue #1)
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
            // Subtract this segment's length and move to the next
            distanceToTravel -= segmentLength;
        }
        // If distance is > path length, just return the end
        return points[points.length - 1];
    }

    // UPDATED: animatePlay now follows paths, not just lerps frames (Issue #1)
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

        // --- Start drawing ---
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(appState.courtType === 'half' ? halfCourtImg : fullCourtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Draw static lines that *don't* move players (e.g., screens)
        const staticLines = frameA.lines.filter(l => l.type === 'screen');
        drawLines(staticLines);

        const passLine = frameA.lines.find(l => l.type === 'pass');

        // Loop over all players in the STARTING frame
        frameA.players.forEach(p1 => {
            let drawX = p1.x, drawY = p1.y, hasBall = p1.hasBall;

            // Find the line this player is supposed to follow
            const moveLine = frameA.lines.find(l => 
                l.startPlayerId === p1.id && 
                (l.type === 'cut' || l.type === 'dribble' || l.type === 'move' || l.type === 'shoot')
            );

            if (moveLine) {
                // Player is moving
                const pathLength = getPathLength(moveLine.points);
                const distanceToTravel = pathLength * progress;
                const newPos = getPointAlongPath(moveLine.points, distanceToTravel);
                drawX = newPos.x;
                drawY = newPos.y;
            }

            if (passLine && passLine.startPlayerId === p1.id) {
                // This player is the passer, they lose the ball
                hasBall = false;
            }
            
            drawPlayerAt(p1, drawX, drawY, hasBall);
        });

        // Animate the ball during a pass
        if (passLine) {
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

        // --- Loop logic ---
        if (progress < 1.0) {
            appState.animationFrameId = requestAnimationFrame(animatePlay);
        } else {
            appState.currentFramePlaying++;
            appState.animationStartTime = 0;
            if (appState.currentFramePlaying >= appState.frames.length - 1) {
                stopAnimation();
                switchFrame(appState.currentFramePlaying); // Show final frame
            } else {
                renderFrameList();
                appState.animationFrameId = requestAnimationFrame(animatePlay);
            }
        }
    }

    function stopAnimation() { /* ... (unchanged) ... */ }
    animateBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });

    // --- 6. SAVE, LOAD, & EXPORT ---
    saveBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    loadBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    loadFileInput.addEventListener('change', (e) => { /* ... (unchanged) ... */ });
    exportPdfBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });
    exportGifBtn.addEventListener('click', () => { /* ... (unchanged) ... */ });

    // --- 7. CANVAS MOUSE LISTENERS (UPDATED for new workflow) ---

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // NEW: Helper to start drawing a line from the selected player
    function startLineFromSelectedPlayer() {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        const player = currentFrame.players.find(p => p.id === appState.selectedPlayerId);
        if (!player || appState.isDrawingLine) return;
        
        appState.isDrawingLine = true;
        appState.previewLine = {
            type: appState.activeTool,
            startPlayerId: player.id,
            points: [ { x: player.x, y: player.y }, { x: player.x, y: player.y } ] // Start and end at same spot
        };
        updateInstructionText();
        draw();
    }

    canvas.addEventListener('click', (e) => {
        if (appState.isDragging || appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);
        const clickedPlayer = getPlayerAtCoord(x, y);

        // If we are drawing a line, this click FINISHES it
        if (appState.isDrawingLine) {
            appState.isDrawingLine = false;
            const finalLine = appState.previewLine;
            const finalPoint = { x, y };
            
            if (clickedPlayer) {
                finalPoint.x = clickedPlayer.x;
                finalPoint.y = clickedPlayer.y;
                finalLine.endPlayerId = clickedPlayer.id;
            }
            finalLine.points[finalLine.points.length - 1] = finalPoint;
            
            currentFrame.lines.push(finalLine);
            appState.previewLine = null;
            
            // Go back to select tool, keep player selected
            activateTool('select');
            updateInstructionText();
            draw();
            return;
        }

        // --- If NOT drawing a line ---
        
        if (appState.activeTool === 'select') {
            if (clickedPlayer) {
                appState.selectedPlayerId = clickedPlayer.id; // NEW: Select the player
            } else {
                appState.selectedPlayerId = null; // NEW: Deselect
            }
            updateInstructionText();
        } else if (appState.activeTool === 'player') {
            const isOffense = !appState.activePlayerTool.startsWith('X');
            const newPlayer = {
                id: appState.nextPlayerId++,
                x: x, y: y, radius: PLAYER_RADIUS,
                label: appState.activePlayerTool,
                hasBall: false, isOffense: isOffense
            };
            currentFrame.players.push(newPlayer);
            // NEW: Auto-switch back to select tool (Issue #9)
            activateTool('select');
        } else if (appState.activeTool === 'assign-ball') {
            // ... (unchanged) ...
        } else if (appState.activeTool === 'delete') {
            // ... (unchanged) ...
        } else {
            // A line tool is active, but we didn't have a player selected
            if (clickedPlayer) {
                appState.selectedPlayerId = clickedPlayer.id;
                startLineFromSelectedPlayer();
            }
        }
        draw();
    });

    canvas.addEventListener('mousedown', (e) => {
        if (appState.isAnimating || appState.isExporting || e.button !== 0) return;
        const { x, y } = getMousePos(e);
        const playerAtStart = getPlayerAtCoord(x, y);

        if (appState.activeTool === 'select') {
            if (playerAtStart) {
                appState.isDragging = true;
                appState.draggingPlayer = playerAtStart;
                appState.dragOffsetX = x - playerAtStart.x;
                appState.dragOffsetY = y - playerAtStart.y;
                appState.selectedPlayerId = playerAtStart.id; // Select player on drag
                updateInstructionText();
                e.preventDefault();
            }
        }
        
        // Removed line-drawing mousedown logic, it's now in 'click' (Issue #7)
    });

    canvas.addEventListener('mousemove', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const { x, y } = getMousePos(e);
        
        if (appState.isDragging && appState.draggingPlayer) {
            appState.draggingPlayer.x = x - appState.dragOffsetX;
            appState.draggingPlayer.y = y - appState.dragOffsetY;
            draw();
        } else if (appState.isDrawingLine) {
            const lastPointIndex = appState.previewLine.points.length - 1;
            appState.previewLine.points[lastPointIndex] = { x, y };
            draw();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (appState.isAnimating || appState.isExporting || e.button !== 0) return;
        if (appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
            updateInstructionText();
            draw(); // Redraw to finalize selection ring
        }
    });

    canvas.addEventListener('mouseout', (e) => {
        if (appState.isDragging) { /* ... (unchanged) ... */ }
        if (appState.isDrawingLine) { /* ... (unchanged) ... */ }
    });

    // --- 8. HOTKEYS (NEW: Issue #8) ---
    window.addEventListener('keydown', (e) => {
        if (appState.isAnimating || appState.isExporting || e.target === playNameInput || e.target === frameNotes) {
            return; // Don't steal hotkeys when typing
        }

        const currentFrame = appState.frames[appState.currentFrameIndex];
        const selectedPlayer = appState.selectedPlayerId ? 
            currentFrame.players.find(p => p.id === appState.selectedPlayerId) : 
            null;

        switch(e.key) {
            case 'Delete':
            case 'Backspace':
                if (selectedPlayer) {
                    if (confirm(`Delete player ${selectedPlayer.label}?`)) {
                        currentFrame.players = currentFrame.players.filter(p => p.id !== selectedPlayer.id);
                        // TODO: Also delete lines associated with this player
                        appState.selectedPlayerId = null;
                        draw();
                        updateInstructionText();
                    }
                    e.preventDefault();
                }
                break;
            case 'p':
            case 'P':
                activateTool('pass');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 'd':
            case 'D':
                activateTool('dribble');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 'c':
            case 'C':
                activateTool('cut');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 's':
            case 'S':
                activateTool('screen');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 'x':
            case 'X':
                activateTool('shoot');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 'm':
            case 'M':
                activateTool('move');
                if (selectedPlayer) startLineFromSelectedPlayer();
                e.preventDefault();
                break;
            case 'Escape':
                // Deselect player and cancel line drawing
                appState.selectedPlayerId = null;
                if (appState.isDrawingLine) {
                    appState.isDrawingLine = false;
                    appState.previewLine = null;
                }
                activateTool('select');
                draw();
                e.preventDefault();
                break;
        }
    });

    // --- 9. INITIALIZE ---
    halfCourtImg.onload = () => {
        renderFrameList();
        draw();
        updateInstructionText();
    };
    fullCourtImg.onload = () => { /* ... (unchanged) ... */ };
    halfCourtImg.onerror = () => alert("Error: Could not load 'halfcourt.webp'. Make sure it's in the 'images' folder.");
    fullCourtImg.onerror = () => alert("Error: Could not load 'fullcourt.webp'. Make sure it's in the 'images' folder.");
});
