# Regression Test Checklist

## Automated checks

Run these from the repository root:

```bash
npm run check
npm test
```

The GitHub Actions workflow runs both commands on Node.js 20 for pushes to `main` and `improve/**`, and for pull requests targeting `main`. A separate Chromium browser-smoke job runs after the unit tests and verifies that both PDF and video exports produce downloadable files.

The automated suite covers:

- Play-file structure and supported format version
- Duplicate or invalid frame and player identities
- Missing and duplicate action-line IDs across frames
- Player and route-point coordinate normalization
- Legacy notes and metadata defaults
- Frame advancement and movement carry-forward
- Pass and shot possession outcomes
- Malformed references, action types, and oversized paths

## Manual browser regression

These checks exercise browser behavior that the Node.js unit tests do not simulate. Perform them before publishing a release, using current Chrome or Edge and at least one touch device.

### Editing and drawing

- [ ] Add offensive and defensive players using desktop drag-and-drop.
- [ ] Add players by selecting a palette token and tapping the court.
- [ ] Add players using keyboard selection, arrow-key positioning, and Enter.
- [ ] Try adding the same player twice to one frame; the duplicate should be rejected without losing placement mode.
- [ ] Drag players to all four court edges. Player tokens should remain fully visible.
- [ ] Draw cut, move, dribble, pass, screen, and shot routes.
- [ ] Draw multi-waypoint dribble and shot routes. Each route should have only one final arrow marker.
- [ ] Start a replacement route and press Escape. The existing completed route should remain.
- [ ] Switch frames while a route is unfinished. The unfinished route should be cancelled.
- [ ] Start a player drag and change frames. The unfinished drag should roll back rather than move a player in the other frame.
- [ ] Open the action wheel for players near all four court edges. Every wheel button should remain reachable.

### Frames, notes, and history

- [ ] Add several frames with cuts, screens, passes, and shots. Check player positions and possession in each following frame.
- [ ] Test a pass to an offensive player and a pass intercepted by a defensive player.
- [ ] Test a shot. The next frame should have no ball holder unless another later ball action assigns possession.
- [ ] Add notes, switch frames immediately, and return. The notes should remain.
- [ ] Use Ctrl/Cmd+Z while editing notes. The text editor should undo text, not the play diagram.
- [ ] Use the application Undo/Redo controls after note edits and drawing actions.
- [ ] Clear and delete frames. Undo should restore the frame contents.
- [ ] Start New Play with unsaved notes and diagram changes. Confirm that cancellation preserves the play and acceptance resets it.

### Save, recovery, import, and export

- [ ] Save a play as JSON and load it again. Check frame order, player positions, actions, ball possession, and notes.
- [ ] Load a legacy JSON play without a format version or frame notes.
- [ ] Load a file containing duplicate action IDs. The importer should repair IDs without changing the drawn actions.
- [ ] Try malformed JSON and a malformed play structure. The current play should remain intact.
- [ ] Make changes, reload the page, and choose to restore the local recovery copy.
- [ ] Dismiss a recovery prompt and confirm the rejected recovery copy is removed.
- [ ] Export a PDF with short and very long coaching notes. Confirm notes continue onto additional pages, the file is non-empty, the download link remains available, and the editor returns to the previously selected frame.
- [ ] Temporarily block external network access and export a PDF. The bundled jsPDF library should still work.
- [ ] Export a video in a browser supporting WebM. Confirm the file plays, has non-zero size, the download link remains available, and the original selected frame is restored.
- [ ] Test video export in a browser that prefers MP4, if available. Confirm the file uses the matching extension.
- [ ] Dismiss the export-ready notice and run another export. The prior download URL should be released and the new link should work.
- [ ] Cause a PDF or video export error. Confirm the error message remains visible after the loading overlay closes and the export button becomes usable again.

### Responsive and accessibility

- [ ] Confirm the full-court master surface is 1512 × 900 logical pixels (84 × 50 ft at 18 px/ft) and standard court markings are 3 px wide.
- [ ] Confirm half-court and full-court court markings, keys, lane ticks, backboards, rims, free-throw circles, and 3-point arcs align with NFHS dimensions.
- [ ] Test at desktop, tablet, and phone widths. On phones, the court should appear before the horizontally scrolling frame storyboard and player palette.
- [ ] Confirm browser zoom is available.
- [ ] Navigate palette tokens and action-wheel buttons using Tab, Enter, and Space.
- [ ] Use keyboard player selection, route drawing, Escape cancellation, and Undo/Redo.
- [ ] Check focus indicators and reduced-motion behavior.

## Test status for this change

The latest GitHub Actions run passed JavaScript syntax checks and the automated play-data test suite. The manual browser checklist above is provided for release verification; it is not represented as having been completed by CI.
