# Basketball Playmaker Pro

A professional basketball play diagramming and animation tool for coaches and players. This web-based application allows you to create, save, and animate complex basketball plays with an intuitive interface.

## Features

* **Court Options:** Diagram plays on both half-court and full-court backgrounds.
* **Player Management:** Drag and drop offensive (1-5) and defensive (X1-X5) players onto the court.
* **Action Tools:** Draw a variety of actions to illustrate player movement and ball movement:
    * **Cut** (Solid line with arrow)
    * **Dribble** (Wavy line with arrow)
    * **Pass** (Dashed line with arrow)
    * **Screen** (Solid line with flat end)
    * **Shoot** (Double line with arrow)
    * **Move** (For defensive slides, etc.)
* **Play Animation:** Create multi-frame plays and animate them to visualize the entire sequence.
* **Frame-by-Frame Notes:** Add detailed notes to each frame of your play.
* **Save & Load:** Save your plays as `.json` files to edit later, and load existing plays from your computer.
* **Export Options:**
    * **Export to PDF:** Generate a clean, multi-page PDF document of your play, with one frame and its notes per section.
    * **Export to Video:** Record your play's animation and save it as a `.webm` video file.
* **History Control:** Full undo (Ctrl+Z) and redo (Ctrl+Y) support for all drawing actions.
* **Easy Editing:** Use the "Move Player" tool to drag players and the "Delete Item" tool to remove players or lines.

## How to Use

1.  Open the `index.html` file in any modern web browser.
2.  Use the **Tools** panel on the right to get started:
    * Drag player icons from the "Offense" or "Defense" palettes onto the court.
    * Select an action tool (e.g., "Cut", "Pass").
    * Click a player to start a line, right-click to add waypoints, and left-click again to finish the line (or end on another player).
3.  Use the **Frames** panel on the left to build your play:
    * Click "+ Add" to create a new frame. Player positions from the previous frame are automatically carried over.
    * Lines you draw (like cuts or dribbles) will define the players' new positions in the next frame.
    * Add notes for the current frame in the "Notes" text area.
4.  Use the **Top Toolbar** to manage your play:
    * Click "▶️ Animate" to watch your play run through all the frames.
    * Use "💾 Save" and "📂 Load" to save and open play files (`.json`).
    * Use "🎬 Export Video" or "📄 PDF" to export your finished play.

## Technologies Used

* **HTML5:** Main structure (`index.html`).
* **HTML5 Canvas:** Powers all the drawing and animation on the court.
* **CSS3:** Custom styling for a modern, responsive interface (`style.css`).
* **JavaScript (ES6+):** All application logic, state management, and event handling (`app.js`).
* **jsPDF:** Used for the "Export to PDF" functionality.
* **MediaRecorder API:** Used for the "Export to Video" functionality.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.