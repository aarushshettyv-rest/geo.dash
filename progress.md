Original prompt: Build a complete Geometry Dash-style 2D platformer with menu, 3 levels, ship mode, pads/orbs/portals, neon visuals, audio, practice mode, pause, stats, and make it fully playable. Fix issues: add menu access during gameplay, show attempt tracker, ensure levels are beatable (esp. triple spikes and platform spikes), make background animations less weird, and split into index.html, styles.css, game.js.

Work log:
- Split into 3 files: `index.html`, `styles.css`, `game.js`.
- Implemented polished canvas game with 3 hand-authored levels, menu access (Esc/back button), attempt flash, practice mode checkpoints, stats, audio, and cleaner background.
- Adjusted spike size/spacing and platform spike placement to make early sections passable at normal speed.
- Added fullscreen toggle (`F`) and hooks for `render_game_to_text` and `advanceTime`.

TODOs / next steps:
- Run Playwright test client with action bursts and inspect screenshots + render_game_to_text output.
- Verify level difficulty with manual play (especially Level 1 early spikes and Level 2 ship section) and adjust if needed.
- Ensure no console errors in Playwright run.
- Shortened double-spike spacing from 90px to 70px in all levels; updated physics note accordingly.
- Fixed `now()` helper recursion to avoid stack overflow during Playwright runs.
- Redesigned Back on Track ship section with ground/ceiling spikes, irregular mid obstacles, and a narrowing funnel + final wall opening.
- Added ceiling spike type (spikeD) with collision + rendering + text state support.
