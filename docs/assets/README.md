# Repository assets

Visual assets for README and GitHub presentation. Synthetic demo data only.

| File | Purpose |
|------|---------|
| [`demo.gif`](demo.gif) | README hero — Ops, company day result, Governor (3 frames, 2s each). Regenerate with `npm run screenshots`. |
| [`ops.png`](ops.png) | Ops console — capital, trust, exception queue |
| [`ops-day.png`](ops-day.png) | Ops after **Run company day** |
| [`governor.png`](governor.png) | Governor — audit head and kill switch |

Regenerate when the ops console layout changes materially:

```bash
npm run build && npm run start   # console on http://localhost:3000
# in another terminal:
npm run screenshots              # or SCREENSHOT_BASE_URL=… npm run screenshots
npm run screenshots:rebuild-gif  # rebuild GIF from committed PNGs (no browser)
```
