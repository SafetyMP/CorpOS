# Repository assets

Visual assets for README and GitHub presentation. Synthetic demo data only.

| File | Purpose |
|------|---------|
| [`demo.gif`](demo.gif) | README hero — ops idle, staged company-day agent activity (handoffs → settle → exception → trust → SLA), day complete, Governor. Regenerate with `npm run screenshots`. |
| [`ops.png`](ops.png) | Ops console — capital, trust, exception queue (idle) |
| [`ops-day.png`](ops-day.png) | Ops after company day timeline completes |
| [`governor.png`](governor.png) | Governor — audit head and kill switch |

Regenerate when the ops console layout or company-day timeline changes materially:

```bash
npm run build && npm run start   # console on http://localhost:3000
# in another terminal:
npm run screenshots              # or SCREENSHOT_BASE_URL=… npm run screenshots
npm run screenshots:rebuild-gif  # rebuild GIF from committed PNGs only (no browser; 3 stills)
```
