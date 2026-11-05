# Geometry Dash

A Geometry Dash clone built with vanilla JavaScript and HTML5 Canvas. No frameworks, no build step — just open `index.html`.

## Play

```bash
# Any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or simply open `index.html` directly in a browser.

## Controls

- **Space / Left Click / Up Arrow** — jump / fly
- **P** — pause
- **R** — retry
- **M** — mute
- **Esc** — back to menu

## Features

- Cube and ship game modes
- Jump pads, jump orbs, and portals
- Spike and block obstacles with forgiving hitboxes
- Multiple speed zones (slow / normal / fast / very fast)
- Practice mode with checkpoints
- Attempt counter, death counter, and progress tracking
- Particle effects, screen shake, and player trail

## Files

- `index.html` — entry point
- `game.js` — all game logic
- `styles.css` — canvas styling
- `actions.json` — scripted input sequence (for automated testing/playback)

## License

MIT — see [LICENSE](LICENSE).
