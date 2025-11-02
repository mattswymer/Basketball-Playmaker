// Wait for the HTML document to finish loading
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. GET ALL OUR HTML ELEMENTS ---
    const canvas = document.getElementById('play-canvas');
    const ctx = canvas.getContext('2d');

    // Top Toolbar
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

    // Instruction Bar
    // NEW: Get the instruction text element
    const instructionText = document.getElementById('instruction-text');

    // Frame Panel
    const addFrameBtn = document.getElementById('add-frame');
    const deleteFrameBtn = document.getElementById('delete-frame');
    const frameList = document.getElementById('frame-list');
    const frameNotes = document.getElementById('frame-notes');

    // Toolbox
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
        nextPlayerId: 1, // NEW: For unique player IDs
        isDragging: false,
        draggingPlayer: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        isDrawingLine: false,
        previewLine: null,
        isAnimating: false,
        isExporting: false,

        // Animation-specific state
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
    const ANIMATION_SPEED = 1000; // 1 second per frame

    // --- 4. MAIN DRAWING & HELPER FUNCTIONS ---

    /**
     * This is the main STATIC drawing function, used for EDITING
     */
    function draw() {
        // Clear and draw court
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (appState.courtType === 'half') {
            ctx.drawImage(halfCourtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
            ctx.drawImage(fullCourtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        // Draw static lines
        drawLines(currentFrame.lines);

        // Draw preview line
        if (appState.previewLine) {
            drawLines([appState.previewLine]);
        }

        // Draw static players
        drawPlayers(currentFrame.players);
    }

    /**
     * Helper function to draw a single player.
     */
    function drawPlayerAt(player, x, y, hasBall) {
        // Draw the player circle
        ctx.beginPath();
        ctx.arc(x, y, player.radius, 0, 2 * Math.PI);
        ctx.fillStyle = player.isOffense ? OFFENSE_COLOR : DEFENSE_COLOR;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw the player label (number)
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.label, x, y);

        // Draw the hollow circle if they have the ball
        if (hasBall) {
            ctx.beginPath();
            ctx.arc(x, y, player.radius + 5, 0, 2 * Math.PI);
            ctx.strokeStyle = BALL_HOLDER_COLOR;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    /**
     * This function just loops over players and calls the new helper.
     */
    function drawPlayers(players) {
        players.forEach(player => {
            drawPlayerAt(player, player.x, player.y, player.hasBall);
        });
    }

    /**
     * drawLines now calls the new drawDribbleLine function
     */
    function drawLines(lines) {
        lines.forEach(line => {
            const { type, points } = line;
            if (points.length < 2) return;

            ctx.strokeStyle = LINE_COLOR;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';

            for (let i = 0; i < points.length - 1; i++) {
                const start = points[i];
                const end = points[i+1];

                switch (type) {
                    case 'pass':
                        ctx.setLineDash([5, 10]);
                        break;
                    case 'dribble':
                        drawDribbleLine(start, end);
                        continue;
                    default:
                        ctx.setLineDash([]);
                        break;
                }

                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();

                ctx.setLineDash([]);

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

                    if (type === 'shoot') {
                        ctx.save();
                        ctx.translate(Math.sin(angle) * 4, -Math.cos(angle) * 4);
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                        ctx.restore();
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

    /**
     * Replaced 'drawSquigglyLine' with 'drawDribbleLine'
     */
    function drawDribbleLine(start, end) {
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        let numZigs = Math.floor(dist / 15); // A zig every 15 pixels
        let amplitude = 8; // How far out the zig goes

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);

        for (let i = 1; i <= numZigs; i++) {
            let t = i / numZigs;
            let x = start.x + dx * t;
            let y = start.y + dy * t;
            let side = (i % 2 === 0) ? 1 : -1;
            let offsetX = (-dy / dist) * amplitude * side;
            let offsetY = (dx / dist) * amplitude * side;

            ctx.lineTo(x + offsetX, y + offsetY);
        }
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        drawArrowhead(end, Math.atan2(dy, dx));
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
            if (newFrameIndex < 0) newFrameIndex = 0;
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
        instructionText.textContent = 'Select a tool to begin'; // NEW: Reset instructions
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

    // UPDATED: Toolbox listener now updates the instruction bar
    toolbox.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const clickedButton = e.target.closest('.tool-btn');
        if (!clickedButton) return;
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        clickedButton.classList.add('active');
        const tool = clickedButton.dataset.tool;
        appState.activeTool = tool;

        // NEW: Update instruction text based on selected tool
        switch (tool) {
            case 'select':
                instructionText.textContent = 'Click and drag a player to move them';
                appState.activePlayerTool = null;
                break;
            case 'delete':
                instructionText.textContent = 'Click on a player to delete them';
                appState.activePlayerTool = null;
                break;
            case 'player':
                appState.activePlayerTool = clickedButton.dataset.player;
                instructionText.textContent = `Click on the court to place player ${appState.activePlayerTool}`;
                break;
            case 'assign-ball':
                instructionText.textContent = 'Click on an offensive player (1-5) to give them the ball';
                appState.activePlayerTool = null;
                break;
            default: // All other tools are line-drawing tools
                instructionText.textContent = `Click a player to start a ${tool} line`;
                appState.activePlayerTool = null;
                break;
        }
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

    // UPDATED: "Add Frame" logic is now more robust, using player IDs
    addFrameBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        const newFrame = createNewFrame(appState.nextFrameId);
        appState.nextFrameId++;

        // Deep copy players array. This preserves player IDs.
        newFrame.players = JSON.parse(JSON.stringify(currentFrame.players));

        let ballWasPassed = false;
        let passer = null;

        currentFrame.lines.forEach(line => {
            // UPDATED: Check for startPlayerId, which all lines should have
            if (line.points.length < 2 || !line.startPlayerId) return;

            const endPoint = line.points[line.points.length - 1];

            // UPDATED: Find player by unique ID, not coordinates
            const startPlayer = newFrame.players.find(p => p.id === line.startPlayerId);
            if (!startPlayer) return; // Player was deleted?

            if (line.type === 'cut' || line.type === 'move' || line.type === 'dribble' || line.type === 'shoot' || line.type === 'screen') {
                startPlayer.x = endPoint.x;
                startPlayer.y = endPoint.y;
            }

            if (line.type === 'pass') {
                // UPDATED: Find receiving player by unique ID, if it was stored
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


    // --- 5. ANIMATION LOGIC ---

    /**
     * This is the new animation loop, runs 60x per second
     */
    function animatePlay(timestamp) {
        if (appState.animationStartTime === 0) {
            appState.animationStartTime = timestamp;
        }

        const elapsed = timestamp - appState.animationStartTime;
        const progress = Math.min(1.0, elapsed / ANIMATION_SPEED);

        const frameA = appState.frames[appState.currentFramePlaying];
        const frameB = appState.frames[appState.currentFramePlaying + 1];

        if (!frameA || !frameB) {
            stopAnimation();
            return;
        }

        // --- Start drawing the animated frame ---
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(appState.courtType === 'half' ? halfCourtImg : fullCourtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        drawLines(frameA.lines);
        const passLine = frameA.lines.find(l => l.type === 'pass');

        frameA.players.forEach(p1 => {
            // Find the matching player in the NEXT frame using their ID
            const p2 = frameB.players.find(p => p.id === p1.id);

            let drawX, drawY, hasBall;

            if (!p2) {
                // Player doesn't exist in next frame, just draw them
                drawX = p1.x;
                drawY = p1.y;
                hasBall = p1.hasBall;
            } else {
                // Interpolate position
                drawX = p1.x + (p2.x - p1.x) * progress;
                drawY = p1.y + (p2.y - p1.y) * progress;

                if (passLine) {
                    // If a pass is happening, the passer (p1) doesn't have the ball
                    hasBall = false;
                } else {
                    // No pass, ball stays with the player
                    hasBall = p1.hasBall;
                }
            }

            drawPlayerAt(p1, drawX, drawY, hasBall);
        });

        // If there was a pass, animate the ball and ring separately
        if (passLine && passLine.points.length > 0) {
            const passStart = passLine.points[0];
            const passEnd = passLine.points[passLine.points.length - 1];
            const ballX = passStart.x + (passEnd.x - passStart.x) * progress;
            const ballY = passStart.y + (passEnd.y - passStart.y) * progress;

            ctx.beginPath();
            ctx.arc(ballX, ballY, PLAYER_RADIUS / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF8C00'; // Orange
            ctx.fill();

            ctx.beginPath();
            ctx.arc(ballX, ballY, PLAYER_RADIUS + 5, 0, 2 * Math.PI);
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
                switchFrame(appState.currentFramePlaying);
            } else {
                renderFrameList();
                appState.animationFrameId = requestAnimationFrame(animatePlay);
            }
        }
    }

    /**
     * Helper function to cleanly stop the animation
     */
    function stopAnimation() {
        if (appState.isAnimating) {
            cancelAnimationFrame(appState.animationFrameId);
            appState.isAnimating = false;
            appState.animationStartTime = 0;
            animateBtn.textContent = 'Animate';
            animateBtn.style.backgroundColor = '#007bff';
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
            animateBtn.textContent = 'Stop';
            animateBtn.style.backgroundColor = '#dc3545';

            renderFrameList();
            appState.animationFrameId = requestAnimationFrame(animatePlay);
        }
    });


    // --- 6. SAVE, LOAD, & EXPORT ---

    // UPDATED: Save/Load functions now include 'nextPlayerId'
    saveBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        const playName = playNameInput.value || 'Untitled Play';
        const filename = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        const saveData = {
            playName: playName,
            courtType: appState.courtType,
            frames: appState.frames,
            nextFrameId: appState.nextFrameId,
            nextPlayerId: appState.nextPlayerId // NEW: Save this
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
                appState.nextFrameId = loadedData.nextFrameId;
                // NEW: Load nextPlayerId, with a fallback for older files
                appState.nextPlayerId = loadedData.nextPlayerId || 100; // 100 is a safe bet

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

    exportPdfBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        appState.isExporting = true;
        exportPdfBtn.textContent = 'Generating PDF...';
        exportPdfBtn.disabled = true;

        setTimeout(() => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            const originalFrameIndex = appState.currentFrameIndex;
            const playName = playNameInput.value || 'Untitled Play';

            appState.frames.forEach((frame, index) => {
                switchFrame(index);
                const imgData = canvas.toDataURL('image/png');
                doc.addImage(imgData, 'PNG', 10, 10, 277, 190);
                doc.setFontSize(12);
                doc.text(`Frame ${index + 1} Notes:`, 10, 205);
                doc.setFontSize(10);
                doc.text(frame.notes, 10, 210, { maxWidth: 277 });
                if (index < appState.frames.length - 1) {
                    doc.addPage();
                }
            });

            doc.save(`${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
            switchFrame(originalFrameIndex);
            appState.isExporting = false;
            exportPdfBtn.textContent = 'Export as PDF';
            exportPdfBtn.disabled = false;
        }, 100);
    });

    exportGifBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        appState.isExporting = true;
        exportGifBtn.textContent = 'Generating GIF...';
        exportGifBtn.disabled = true;

        alert("Note: GIF export currently creates a 'slideshow' of static frames, not the smooth animation. Smooth GIF export is a future feature!");

        const originalFrameIndex = appState.currentFrameIndex;
        const playName = playNameInput.value || 'Untitled Play';

        const frameImages = [];
        for (let i = 0; i < appState.frames.length; i++) {
            switchFrame(i);
            frameImages.push(canvas.toDataURL('image/png'));
        }

        switchFrame(originalFrameIndex);

        gifshot.createGIF({
            'images': frameImages,
            'gifWidth': CANVAS_WIDTH / 2,
            'gifHeight': CANVAS_HEIGHT / 2,
            'interval': ANIMATION_SPEED / 1000,
            'numFrames': appState.frames.length
        }, (obj) => {
            if (!obj.error) {
                const a = document.createElement('a');
                a.href = obj.image;
                a.download = `${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gif`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                console.error('GIF export error:', obj.error);
                alert('Could not create GIF. ' + obj.error);
            }
            appState.isExporting = false;
            exportGifBtn.textContent = 'Export as GIF';
            exportGifBtn.disabled = false;
        });
    });

    // --- 7. CANVAS MOUSE LISTENERS ---

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // UPDATED: 'click' listener now adds player with unique ID
    canvas.addEventListener('click', (e) => {
        if (appState.isDragging || appState.isDrawingLine || appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);

        if (appState.activeTool === 'player') {
            const isOffense = !appState.activePlayerTool.startsWith('X');
            const newPlayer = {
                id: appState.nextPlayerId, // NEW: Assign unique ID
                x: x, y: y, radius: PLAYER_RADIUS,
                label: appState.activePlayerTool,
                hasBall: false, isOffense: isOffense
            };
            appState.nextPlayerId++; // NEW: Increment for next player
            currentFrame.players.push(newPlayer);

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

    // UPDATED: 'mousedown' listener now stores player IDs in lines
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
                    instructionText.textContent = `Dragging player ${playerAtStart.label}...`; // NEW: Update instructions
                    e.preventDefault();
                }
            } else if (appState.activeTool !== 'player' && appState.activeTool !== 'assign-ball' && appState.activeTool !== 'delete') {
                // This is a line-drawing tool
                if (!appState.isDrawingLine) {
                    // STARTING a new line
                    if (playerAtStart) {
                        appState.isDrawingLine = true;
                        appState.previewLine = {
                            type: appState.activeTool,
                            startPlayerId: playerAtStart.id, // NEW: Store start player ID
                            points: [ { x: playerAtStart.x, y: playerAtStart.y }, { x, y } ]
                        };
                        instructionText.textContent = 'Left-click to finish line, right-click to add a point'; // NEW: Update instructions
                        e.preventDefault();
                    }
                } else {
                    // FINISHING a line
                    appState.isDrawingLine = false;
                    const finalLine = appState.previewLine;
                    const finalPoint = { x, y };
                    const playerAtEnd = getPlayerAtCoord(x, y);

                    if (playerAtEnd) {
                        finalPoint.x = playerAtEnd.x;
                        finalPoint.y = playerAtEnd.y;
                        finalLine.endPlayerId = playerAtEnd.id; // NEW: Store end player ID
                    }
                    finalLine.points[finalLine.points.length - 1] = finalPoint;

                    currentFrame.lines.push(finalLine);
                    appState.previewLine = null;
                    instructionText.textContent = `Line created. Select a tool or click another player.`; // NEW: Update instructions
                    e.preventDefault();
                    draw();
                }
            }
        } else if (e.button === 2) { // Right click
            if (appState.isDrawingLine) {
                // Add a point to the line
                const { x, y } = getMousePos(e);
                appState.previewLine.points.push({ x, y });
                instructionText.textContent = 'Point added. Left-click to finish, right-click for another point.'; // NEW: Update instructions
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
            instructionText.textContent = 'Player moved. Select a tool or drag another player.'; // NEW: Update instructions
        }
    });

    canvas.addEventListener('mouseout', (e) => {
        // Stop any dragging or line drawing if mouse leaves canvas
        if (appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
            instructionText.textContent = 'Player move cancelled.'; // NEW: Update instructions
        }
        if (appState.isDrawingLine) {
            appState.isDrawingLine = false;
            appState.previewLine = null;
            instructionText.textContent = 'Line drawing cancelled.'; // NEW: Update instructions
            draw();
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
