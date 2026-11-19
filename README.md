# Basketball Playmaker Pro

A browser-based basketball play diagramming and animation tool for coaches and players. Build a play visually on a half-court or full-court diagram, sequence the action across frames, add coaching notes, and export the result.

## What it does

- **Court diagrams:** Work on self-contained NFHS court diagrams drawn at a 1.5 px/in master scale (1512 × 900 px for a full 84 × 50 ft court). Court lines are 3 px wide, with the key, lane marks, backboard, rim, restricted area, free-throw circle, and 3-point geometry positioned from the supplied NFHS measurements. They work when opening the downloaded app directly from `file://` and remain safe for PDF and video export.
- **Court orientation:** Half-court is displayed vertically (baseline at the top, half-court line at the bottom); full-court is displayed horizontally (baseline to baseline). The half-court uses the same 1512 × 900 NFHS master coordinate system, rotated for display, so saved player and route coordinates remain consistent.
- **Offense and defense:** Add offensive players 1–5 and defensive players X1–X5.
- **Basketball actions:** Draw cuts/movement, dribbles, passes, screens, and shots. Each action supports a multi-point route.
- **Frame sequences:** Create a play one frame at a time. Player locations and ball possession carry forward when a frame is added.
- **Animation:** Preview the complete sequence, including player routes and ball movement.
- **Coaching notes:** Keep notes attached to each frame.
- **Undo and redo:** Use the toolbar or Ctrl/Cmd+Z and Ctrl/Cmd+Y. Cmd/Ctrl+Shift+Z also redoes.
- **Local recovery:** A browser-local backup is updated as you work. On a later visit, the app asks whether to restore it. The backup stays in that browser and does not sync to other devices.
- **Portable files:** Save and load play files as JSON.
- **Exports:** Create a multipage PDF play sheet or a WebM video.

## Open the application

The application is static and does not require a server or account.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. The court is drawn directly by the app; no separate image folder, web server, or network connection is required. Existing version 1 play files are migrated from the former 800 × 600 coordinate system when loaded.

PDF creation uses the jsPDF library bundled in the repository, so it does not depend on a third-party CDN. Video export uses the browser's Canvas capture and MediaRecorder APIs; the app selects a compatible WebM or MP4 recording format when the browser supports one. Keep the tab visible until recording finishes. After generation, click the in-app Download link to save the file. The app deliberately does not trigger a second, synthetic download click after its asynchronous export work, because browsers can block that click.

## Basic workflow

### Add players

On desktop, drag a player token from the player panel onto the court.

On a touchscreen, select a player token and then tap the court. With a keyboard, focus a player token and press Enter or Space to select it, use the arrow keys to position the preview, and press Enter to place it. Hold Shift while using the arrow keys for larger adjustments. Focus the court and use the arrow keys to cycle through players already on it.

A player can only appear once per frame. Players are kept inside the court boundary.

### Draw an action

Select a player on the court to open the radial action menu. Choose the desired action:

| Action | Diagram |
|---|---|
| Cut / Move | Solid line with arrow |
| Dribble | Wavy line with arrow |
| Pass | Dashed line with arrow |
| Screen | Solid line with a flat end |
| Shoot | Double line with arrows |

Click to add route waypoints, then double-click to finish the action. Press Escape to cancel an unfinished route. The previous completed action is retained until a replacement route is successfully finished.

For keyboard route drawing, use the arrow keys to move the endpoint, Enter to add a waypoint, Shift+Enter to finish, and Escape to cancel. After selecting a player, use the shortcuts shown in the action menu: M (move/cut), P (pass), S (screen), D (dribble), X (shoot), B (assign/remove ball), and Delete (remove player).

Click an existing action line to delete it; Undo restores it.

### Build the sequence

Use **Add** to create the next frame. The previous frame's players are copied forward, and completed movement and ball-transfer actions determine the next positions and ball holder.

Use the frame storyboard to navigate. Each thumbnail shows the court, players, action paths, and a small summary. Notes are saved with the selected frame.

### Save and export

- **Save** downloads the current play as a `.json` file.
- **Load** opens a previously saved JSON play. The importer checks the file structure and repairs legacy action IDs where possible. Files are limited to 5 MB.
- **Export PDF** creates a landscape play sheet with one frame per page and coaching notes alongside the diagram. Long notes continue onto additional pages.
- **Export Video** records the complete play as a `.webm` file. The editor returns to the frame that was selected before export.

Starting a new play or loading another file prompts before replacing unsaved changes.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Application structure and controls |
| `style.css` | Responsive visual layout |
| `app.js` | Canvas rendering, editing, history, animation, and exports |
| `play-data.js` | JSON validation and legacy-file normalization |
| `export-utils.js` | Compatible video recording setup and export file helpers |
| `vendor/jspdf.umd.min.js` | Bundled PDF generation library |
| `vendor/JSPDF-LICENSE.txt` | jsPDF MIT license |
| `tests/export.test.cjs` | Regression tests for export helper behavior |
| `tests/browser-exports.test.cjs` | Chromium end-to-end PDF and video download test |
| `export-utils.js` | Compatible video recording setup and export file helpers |
| `vendor/jspdf.umd.min.js` | Bundled PDF generation library |
| `vendor/JSPDF-LICENSE.txt` | jsPDF MIT license |
| `play-data.js` | JSON validation, v1-to-v2 coordinate migration, and frame normalization |

## Development checks

The project uses the Node.js built-in test runner and has no runtime build step or external development dependencies.

Run:

```bash
npm test
npm run check
```

Unit tests cover play-file validation, compatibility normalization, ID repair, court coordinate normalization, next-frame movement, ball-possession transfers, export filenames, video format selection and fallback, and PDF Blob creation. A separate GitHub Actions browser-smoke job installs Chromium and exercises real PDF and video downloads. Complete the manual touch-device, accessibility, and cross-browser checklist in [TESTING.md](TESTING.md) before release.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
