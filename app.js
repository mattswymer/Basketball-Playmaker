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
    const playerToolIcons = document.querySelectorAll('.player-tool-icon');

    // NEW: Loading Modal Elements
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

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
        players: [], // Player: { id, x, y, radius, label, hasBall, isOffense }
        lines: [] // Line: { type, startPlayerId, endPlayerId, points: [{x,y}, ...] }
    });

    const createInitialState = () => ({
        courtType: 'half',
        activeTool: 'select',
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

    // Constants
    const PLAYER_RADIUS = 15;
    const OFFENSE_COLOR = '#007bff';
    const DEFENSE_COLOR = '#dc3545';
    const BALL_HOLDER_COLOR = '#000000';
    const LINE_COLOR = '#343a40';
    const ANIMATION_SPEED = 1500;

    // --- 4. MAIN DRAWING & HELPER FUNCTIONS ---

    // NEW: Helper functions for the loading modal
    function showLoading(message) {
        loadingText.textContent = message;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    function drawToolboxIcon(iconCanvas) {
        const label = iconCanvas.dataset.player;
        const isOffense = !label.startsWith('X');
        const toolCtx = iconCanvas.getContext('2d');
        const size = iconCanvas.width;
        const radius = size / 2 - 4; // Use a small radius
        const center = size / 2;

        toolCtx.clearRect(0, 0, size, size);

        // Draw circle
        toolCtx.beginPath();
        toolCtx.arc(center, center, radius, 0, 2 * Math.PI);
        toolCtx.fillStyle = isOffense ? OFFENSE_COLOR : DEFENSE_COLOR;
        toolCtx.fill();
        toolCtx.strokeStyle = '#000000';
        toolCtx.lineWidth = 2;
        toolCtx.stroke();

        // Draw label
        toolCtx.fillStyle = 'white';
        toolCtx.font = 'bold 16px Arial';
        toolCtx.textAlign = 'center';
        toolCtx.textBaseline = 'middle';
        toolCtx.fillText(label, center, center);
    }

    function initializeToolboxIcons() {
        playerToolIcons.forEach(icon => {
            // Set canvas drawing size
            icon.width = 40;
            icon.height = 40;
            drawToolboxIcon(icon);
        });
    }

    function draw() {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const courtImg = (appState.courtType === 'half') ? halfCourtImg : fullCourtImg;
        if (courtImg.complete) {
            ctx.drawImage(courtImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

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
                let end = { ...points[i+1] }; // Clone

                // Line shortening logic
                if (i === points.length - 2) { // Only shorten the very last segment
                    const endPlayer = endPlayerId ? currentFrame.players.find(p => p.id === endPlayerId) : null;
                    if (endPlayer) {
                        const dx = end.x - start.x;
                        const dy = end.y - start.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        // Pull back distance
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

                // Draw endcap only on the last segment
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

    function drawDribbleLine(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const angle = Math.atan2(dy, dx);
        const segments = Math.floor(dist / 10);
        const amplitude = 8;
        const frequency = 5;

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

    // --- 5. EVENT HANDLERS ---

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

    // UPDATED: This listener no longer handles 'player' clicks
    toolbox.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting) return;
        const clickedButton = e.target.closest('.tool-btn');
        if (!clickedButton) return;

        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        clickedButton.classList.add('active');

        const tool = clickedButton.dataset.tool;
        appState.activeTool = tool;

        // Reset canvas classes
        canvas.classList.remove('tool-select', 'tool-delete', 'tool-assign-ball', 'tool-player');

        if (tool === 'select') {
            instructionText.textContent = 'Click and drag a player to move them';
            canvas.classList.add('tool-select');
        } else if (tool === 'delete') {
            instructionText.textContent = 'Click on a player or line to delete';
            canvas.classList.add('tool-delete');
        } else if (tool === 'assign-ball') {
            instructionText.textContent = 'Click on an offensive player to give them the ball';
            canvas.classList.add('tool-assign-ball');
        } else {
            // It's an action tool
            instructionText.textContent = `Click a player to start drawing a ${tool} line. Left-click to finish, right-click to add a waypoint.`;
            // Default crosshair will be used
        }
    });

    // REMOVED: dragstart/dragend from toolbox
    // MOVED: to individual player icons

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

    addFrameBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        const newFrame = createNewFrame(appState.nextFrameId);
        appState.nextFrameId++;

        // Deep copy players
        newFrame.players = JSON.parse(JSON.stringify(currentFrame.players));

        let ballWasPassed = false;
        let passer = null;

        currentFrame.lines.forEach(line => {
            if (line.points.length < 2 || !line.startPlayerId) return;

            const endPoint = line.points[line.points.length - 1];
            const startPlayer = newFrame.players.find(p => p.id === line.startPlayerId);
            if (!startPlayer) return;

            // Apply movement
            if (line.type === 'cut' || line.type === 'move' || line.type === 'dribble' || line.type === 'shoot' || line.type === 'screen') {
                startPlayer.x = endPoint.x;
                startPlayer.y = endPoint.y;
            }

            // Apply pass
            if (line.type === 'pass') {
                const endPlayer = newFrame.players.find(p => p.id === line.endPlayerId);
                if (endPlayer) {
                    endPlayer.hasBall = true;
                    ballWasPassed = true;
                    passer = startPlayer;
                }
            }
        });

        // Remove ball from passer
        if (ballWasPassed && passer) {
            passer.hasBall = false;
        }

        appState.frames.push(newFrame);
        switchFrame(appState.frames.length - 1);
    });


    // --- 6. ANIMATION LOGIC ---

    function getPathLength(points) {
        let totalDistance = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i+1].x - points[i].x;
            const dy = points[i+1].y - points[i].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        return totalDistance;
    }

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
                const ratio = distanceToTravel / segmentLength;
                return {
                    x: start.x + dx * ratio,
                    y: start.y + dy * ratio
                };
            }
            distanceToTravel -= segmentLength;
        }
        // If distance is > path length, return last point
        return points[points.length - 1];
    }

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

        // Draw ALL lines from the starting frame
        drawLines(frameA.lines);

        frameA.players.forEach(p1 => {
            let drawX = p1.x, drawY = p1.y, hasBall = p1.hasBall;

            // Find this player's movement line
            const moveLine = frameA.lines.find(l =>
                l.startPlayerId === p1.id &&
                (l.type === 'cut' || l.type === 'dribble' || l.type === 'move' || l.type === 'shoot' || l.type === 'screen')
            );

            // Find this player's pass line
            const passLine = frameA.lines.find(l =>
                l.startPlayerId === p1.id && l.type === 'pass'
            );

            if (moveLine) {
                const pathLength = getPathLength(moveLine.points);
                const distanceToTravel = pathLength * progress;
                const newPos = getPointAlongPath(moveLine.points, distanceToTravel);
                drawX = newPos.x;
                drawY = newPos.y;
            }

            if (passLine) {
                hasBall = false; // Player is passing, loses ball
                // Animate the pass
                const passPathLength = getPathLength(passLine.points);
                const passDist = passPathLength * progress;
                const ballPos = getPointAlongPath(passLine.points, passDist);

                ctx.beginPath();
                ctx.arc(ballPos.x, ballPos.y, PLAYER_RADIUS / 2, 0, 2 * Math.PI);
                ctx.fillStyle = '#FF8C00';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(ballPos.x, ballPos.y, PLAYER_RADIUS + 5, 0, 2 * Math.PI);
                ctx.strokeStyle = BALL_HOLDER_COLOR;
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            drawPlayerAt(p1, drawX, drawY, hasBall);
        });

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


    // --- 7. SAVE, LOAD, & EXPORT ---

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
                handleNewPlay(false); // Reset the app state

                appState.playName = loadedData.playName;
                appState.courtType = loadedData.courtType;
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
        e.target.value = null; // Reset for re-loading same file
    });

    // UPDATED: PDF Export with loading modal
    exportPdfBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;

        appState.isExporting = true;
        exportPdfBtn.disabled = true;
        showLoading('Generating PDF...'); // Show modal

        // Wrap in setTimeout to allow modal to render
        setTimeout(() => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('portrait', 'mm', 'a4');
            const originalFrameIndex = appState.currentFrameIndex;
            const playName = playNameInput.value || 'Untitled Play';

            const margin = 10;
            const pageW = 210;
            const pageH = 297;
            const contentW = pageW - (margin * 2);
            const imgColW = 80;
            const gutter = 10;
            const notesColW = contentW - imgColW - gutter;
            const imgColH = (imgColW / 4) * 3;
            const frameRowH = (pageH - (margin * 2)) / 3;

            for (let i = 0; i < appState.frames.length; i++) {
                const frame = appState.frames[i];
                const frameIndexInPage = i % 3;

                if (i > 0 && frameIndexInPage === 0) {
                    doc.addPage();
                }

                switchFrame(i);
                const imgData = canvas.toDataURL('image/png');

                const yPos = margin + (frameIndexInPage * frameRowH) + 5;
                const imgX = margin;
                doc.addImage(imgData, 'PNG', imgX, yPos, imgColW, imgColH);

                const notesX = margin + imgColW + gutter;
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.text(`Frame ${i + 1}`, notesX, yPos + 5);

                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                const notesLines = doc.splitTextToSize(frame.notes, notesColW);
                doc.text(notesLines, notesX, yPos + 12);
            }

            doc.save(`${playName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);

            switchFrame(originalFrameIndex);
            appState.isExporting = false;
            exportPdfBtn.disabled = false;
            hideLoading(); // Hide modal
        }, 100);
    });

    // UPDATED: GIF Export with loading modal AND new quality settings
    exportGifBtn.addEventListener('click', () => {
        if (appState.isAnimating || appState.isExporting) return;

        appState.isExporting = true;
        exportGifBtn.disabled = true;
        showLoading('Generating GIF...'); // Show modal

        // Wrap in setTimeout
        setTimeout(() => {
            const originalFrameIndex = appState.currentFrameIndex;
            const playName = playNameInput.value || 'Untitled Play';

            const frameImages = [];
            for (let i = 0; i < appState.frames.length; i++) {
                switchFrame(i);
                frameImages.push(canvas.toDataURL('image/png'));
            }

            switchFrame(originalFrameIndex);

            // --- THIS IS THE FIX ---
            gifshot.createGIF({
                'images': frameImages,
                'gifWidth': CANVAS_WIDTH * 0.4, // 320px (Smaller dimensions)
                'gifHeight': CANVAS_HEIGHT * 0.4, // 240px
                'interval': ANIMATION_SPEED / 1000,
                'numFrames': appState.frames.length,
                'quality': 20 // 10 is best, 20 is worse but much faster
            }, (obj) => {
            // --- END FIX ---
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
                exportGifBtn.disabled = false;
                hideLoading(); // Hide modal
            });
        }, 100);
    });

    // --- 8. CANVAS MOUSE LISTENERS (Waypoint Logic) ---

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function createPlayerAt(x, y, playerLabel) {
        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;

        const isOffense = !playerLabel.startsWith('X');
        const newPlayer = {
            id: appState.nextPlayerId++,
            x: x, y: y, radius: PLAYER_RADIUS,
            label: playerLabel,
            hasBall: false, isOffense: isOffense
        };
        currentFrame.players.push(newPlayer);
        draw();
    }

    // 'click' is ONLY for instantaneous actions
    canvas.addEventListener('click', (e) => {
        if (appState.isAnimating || appState.isExporting || appState.isDragging) return;

        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);

        // We are NOT drawing a line, so this is a simple click
        if (!appState.isDrawingLine) {

            if (appState.activeTool === 'assign-ball') {
                const clickedPlayer = getPlayerAtCoord(x, y);
                if (clickedPlayer && clickedPlayer.isOffense) {
                    const currentBallHolder = currentFrame.players.find(p => p.hasBall);
                    if (currentBallHolder && currentBallHolder !== clickedPlayer) {
                        currentBallHolder.hasBall = false;
                    }
                    clickedPlayer.hasBall = !clickedPlayer.hasBall;
                    draw();
                }
            } else if (appState.activeTool === 'delete') {
                 const clickedPlayer = getPlayerAtCoord(x, y);
                 if (clickedPlayer) {
                     if (confirm(`Delete player ${clickedPlayer.label}?`)) {
                        // CRITICAL FIX: Delete player AND connected lines
                        currentFrame.players = currentFrame.players.filter(p => p.id !== clickedPlayer.id);
                        currentFrame.lines = currentFrame.lines.filter(line =>
                            line.startPlayerId !== clickedPlayer.id && line.endPlayerId !== clickedPlayer.id
                        );
                        draw();
                     }
                 }
                 // TODO: Add logic to delete lines by clicking
            }
        }
    });

    // 'mousedown' is for STARTING drag, OR START/FINISH line
    canvas.addEventListener('mousedown', (e) => {
        if (appState.isAnimating || appState.isExporting) return;

        const currentFrame = appState.frames[appState.currentFrameIndex];
        if (!currentFrame) return;
        const { x, y } = getMousePos(e);
        const playerAtStart = getPlayerAtCoord(x, y);

        // --- LEFT CLICK ---
        if (e.button === 0) {
            if (appState.activeTool === 'select') {
                if (playerAtStart) {
                    appState.isDragging = true;
                    appState.draggingPlayer = playerAtStart;
                    appState.dragOffsetX = x - playerAtStart.x;
                    appState.dragOffsetY = y - playerAtStart.y;
                    canvas.classList.add('tool-select:active'); // For 'grabbing' cursor
                    e.preventDefault();
                }
            } else if (appState.activeTool !== 'player' && appState.activeTool !== 'assign-ball' && appState.activeTool !== 'delete') {
                // It's an action tool (cut, pass, etc.)
                if (!appState.isDrawingLine) {
                    // START a new line
                    if (playerAtStart) {
                        appState.isDrawingLine = true;
                        appState.previewLine = {
                            type: appState.activeTool,
                            startPlayerId: playerAtStart.id,
                            points: [ { x: playerAtStart.x, y: playerAtStart.y }, { x, y } ]
                        };
                        instructionText.textContent = `Drawing ${appState.activeTool}. Right-click to add a waypoint, left-click to finish.`;
                        e.preventDefault();
                    }
                } else {
                    // FINISH a line (finalize)
                    appState.isDrawingLine = false;
                    const finalLine = appState.previewLine;
                    const finalPoint = { x, y };
                    const playerAtEnd = getPlayerAtCoord(x, y);

                    if (playerAtEnd) {
                        finalPoint.x = playerAtEnd.x;
                        finalPoint.y = playerAtEnd.y;
                        finalLine.endPlayerId = playerAtEnd.id; // Store the end player ID
                    }

                    finalLine.points[finalLine.points.length - 1] = finalPoint;
                    currentFrame.lines.push(finalLine);
                    appState.previewLine = null;
                    instructionText.textContent = `Line created. Click another player to start a new line.`;
                    e.preventDefault();
                    draw();
                }
            }
        // --- RIGHT CLICK (for waypoints) ---
        } else if (e.button === 2) {
            if (appState.isDrawingLine) {
                // Add a waypoint
                appState.previewLine.points.push({ x, y }); // Add new point
                instructionText.textContent = `Waypoint added. Right-click for another, left-click to finish.`;
                e.preventDefault();
                draw();
            }
        }
    });

    // 'mousemove' is for UPDATING drag or line preview
    canvas.addEventListener('mousemove', (e) => {
        if (appState.isAnimating || appState.isExporting) return;

        if (appState.isDragging && appState.draggingPlayer) {
            const { x, y } = getMousePos(e);
            appState.draggingPlayer.x = x - appState.dragOffsetX;
            appState.draggingPlayer.y = y - appState.dragOffsetY;
            draw();
        } else if (appState.isDrawingLine) {
            const { x, y } = getMousePos(e);
            // Always update the *last* point in the array
            appState.previewLine.points[appState.previewLine.points.length - 1] = { x, y };
            draw();
        }
    });

    // 'mouseup' is ONLY for FINISHING a drag
    canvas.addEventListener('mouseup', (e) => {
        if (appState.isAnimating || appState.isExporting || e.button !== 0) return;

        if (appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
            canvas.classList.remove('tool-select:active');
        }
    });

    canvas.addEventListener('mouseout', (e) => {
        // Cancel any action if mouse leaves canvas
        if (appState.isDragging) {
            appState.isDragging = false;
            appState.draggingPlayer = null;
            draw();
        }
        if (appState.isDrawingLine) {
            appState.isDrawingLine = false;
            appState.previewLine = null;
            draw();
        }
        canvas.classList.remove('drag-over');
    });

    // --- 9. CANVAS DRAG & DROP (for players) ---

    // NEW: Add drag listeners to the new icons
    playerToolIcons.forEach(icon => {
        icon.addEventListener('dragstart', (e) => {
            if (appState.isAnimating || appState.isExporting) {
                e.preventDefault();
                return;
            }
            // Set the active tool in the state
            appState.activeTool = 'player';
            canvas.classList.add('tool-player'); // Set cursor

            e.dataTransfer.setData('text/plain', icon.dataset.player);
            e.dataTransfer.effectAllowed = 'copy';
            icon.classList.add('dragging');
            instructionText.textContent = `Drop player ${icon.dataset.player} onto the court`;
        });

        icon.addEventListener('dragend', (e) => {
            icon.classList.remove('dragging');
            // Revert tool back to 'select' for safety
            document.querySelector('.tool-btn[data-tool="select"]').click();
        });
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        const tool = appState.activeTool;
        // Only allow drop if a 'player' button was the drag source
        if (tool === 'player') {
            canvas.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'copy';
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    });

    canvas.addEventListener('dragleave', (e) => {
        canvas.classList.remove('drag-over');
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.classList.remove('drag-over');

        const playerLabel = e.dataTransfer.getData('text/plain');

        // Final check: was this a player drop?
        if (playerLabel && appState.activeTool === 'player') {
            const { x, y } = getMousePos(e);
            createPlayerAt(x, y, playerLabel);

            // Revert tool back to 'select'
            document.querySelector('.tool-btn[data-tool="select"]').click();
        }
    });


    // --- 10. INITIALIZE ---
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

    // NEW: Draw the toolbox icons on load
    initializeToolboxIcons();
    // Set initial tool state
    document.querySelector('.tool-btn[data-tool="select"]').click();

});