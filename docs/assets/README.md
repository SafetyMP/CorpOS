# Repository assets

These historical operator captures use synthetic data. Start the current public [billing case](../../README.md#demo) to investigate the incident and inspect the selected technical trace.

| File | Purpose |
|------|---------|
| `demo.gif` | Historical operator UI recording — ops idle, staged company-day agent activity (handoffs → settle → exception → trust → SLA), day complete, Governor. Regenerate with `npm run screenshots`. |
| `ops.png` | Ops console — capital, trust, exception queue (idle) |
| `ops-day.png` | Ops after company day timeline completes |
| `governor.png` | Governor — audit head and kill switch |

Regenerate when the ops console layout or company-day timeline changes materially:

```bash
npm run build && npm run start   # console on http://localhost:3000
# in another terminal:
npm run screenshots              # or SCREENSHOT_BASE_URL=… npm run screenshots
npm run screenshots:rebuild-gif  # rebuild GIF from committed PNGs only (no browser; 3 stills)
```
