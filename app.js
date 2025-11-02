<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Basketball Playmaker Pro</title>

  <link rel="stylesheet" href="style.css" />

  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gifshot/0.4.1/gifshot.min.js" crossorigin="anonymous"></script>

  <script src="app.js" defer></script>
</head>
<body>
  <div id="app-container">
    <div id="top-toolbar">
      <label for="play-name">Play Name:</label>
      <input type="text" id="play-name" placeholder="Untitled Play" />

      <select id="court-toggle">
        <option value="half" selected>Half Court</option>
        <option value="full">Full Court</option>
      </select>

      <button id="new-play" class="btn-warning">🆕 New Play</button>
      <button id="undo-btn" class="btn-primary" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
      <button id="redo-btn" class="btn-primary" title="Redo (Ctrl+Y)" disabled>↷ Redo</button>
      <button id="clear-frame" class="btn-danger">🗑️ Clear Frame</button>
      <button id="animate-play" class="btn-primary">▶️ Animate</button>
      <button id="save-play" class="btn-success">💾 Save</button>
      <button id="load-play" class="btn-info">📂 Load</button>
      <input type="file" id="load-file-input" accept=".json" style="display:none;" />
      <button id="export-gif" class="btn-warning">📸 GIF</button>
      <button id="export-pdf" class="btn-warning">📄 PDF</button>
    </div>

    <div id="instruction-bar">
      <span id="instruction-text">Select a tool to begin</span>
    </div>

    <div id="main-content">
      <div id="frame-panel">
        <h3>📋 Frames</h3>
        <div id="frame-list"></div>
        <div class="frame-controls">
          <button id="add-frame" class="btn-success">+ Add</button>
          <button id="delete-frame" class="btn-danger">- Delete</button>
        </div>
        <h3>📝 Notes</h3>
        <textarea id="frame-notes" placeholder="Add notes for this frame..."></textarea>
      </div>

      <div id="court-container">
        <canvas id="play-canvas"></canvas>
      </div>

      <div id="drawing-toolbox">
        <h3>🛠️ Tools</h3>
        <button class="tool-btn active" data-tool="select">🖱️ Move Player</button>
        <button class="tool-btn" data-tool="delete">🗑️ Delete Item</button>

        <h4>Offense</h4>
        <button class="tool-btn" data-tool="player" data-player="1">1</button>
        <button class="tool-btn" data-tool="player" data-player="2">2</button>
        <button class="tool-btn" data-tool="player" data-player="3">3</button>
        <button class="tool-btn" data-tool="player" data-player="4">4</button>
        <button class="tool-btn" data-tool="player" data-player="5">5</button>

        <h4>Defense</h4>
        <button class="tool-btn" data-tool="player" data-player="X1">X1</button>
        <button class="tool-btn" data-tool="player" data-player="X2">X2</button>
        <button class="tool-btn" data-tool="player" data-player="X3">X3</button>
        <button class="tool-btn" data-tool="player" data-player="X4">X4</button>
        <button class="tool-btn" data-tool="player" data-player="X5">X5</button>

        <h4>Actions</h4>
        <button class="tool-btn" data-tool="assign-ball">🏀 Assign Ball</button>
        <button class="tool-btn" data-tool="cut">✂️ Cut</button>
        <button class="tool-btn" data-tool="dribble">⚡ Dribble</button>
        <button class="tool-btn" data-tool="pass">🎯 Pass</button>
        <button class="tool-btn" data-tool="screen">🛡️ Screen</button>
        <button class="tool-btn" data-tool="shoot">🏹 Shoot</button>
        <button class="tool-btn" data-tool="move">👟 Move (Defense)</button>
      </div>
    </div>
  </div>
</body>
</html>
