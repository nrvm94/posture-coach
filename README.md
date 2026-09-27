<p align="center">
  <img src="build/icon.png" width="96" alt="Posture Coach icon">
</p>

<h1 align="center">Posture Coach</h1>

<p align="center">
  Your webcam checks how you sit and nudges you when you slouch.<br>
  Everything runs on your own computer. Video never leaves it.
</p>

<p align="center">
  <a href="https://nrvm94.github.io/posture-coach/"><b>Try it in your browser</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/nrvm94/posture-coach/releases/latest"><b>Download for Windows</b></a>
</p>

<!-- VIDEO: edit this file on GitHub and drag your demo video onto this line. -->

## What it does

- **Live posture score (0–100)** from your webcam, compared against *your* good posture, which you calibrate once.
- **A gentle reminder** when you've slouched for a while (30 seconds by default): a small card in the corner with a chime and what to fix ("Lift your head · Sit back from the screen"). It goes away on its own once you sit up.
- **Line-up guide:** a body outline, like ID-verification apps use, helps you sit where the camera can track you well.
- **Stays out of the way:** it ignores you when you step away, pauses when you lock your screen (desktop app), and can be paused from the tray.

## Two ways to use it

| | Browser version | Windows app |
|---|---|---|
| Install | None, just open the link | Download and run the installer |
| Works while you use other apps | Yes, while the tab stays open | Yes, runs minimized all day |
| Reminders | In-page card, plus a browser notification when you're in another tab | Always-on-top popup with a chime |
| Starts with your computer | No | Optional |

Try the browser version first. If you like it, get the Windows app.

### Seeing a security warning when installing?

The Windows installer isn't code-signed (signing certificates cost money), so Windows SmartScreen warns about an unknown publisher. To install anyway, click **More info → Run anyway**.

If you'd rather not, use the browser version, or [build it yourself](#build-from-source) from this code. The installers on the Releases page are built by [GitHub Actions](.github/workflows/release.yml) directly from this repository.

## Privacy

This is the point of the project, so here are the details:

- **Video is analyzed on your device and immediately discarded.** Frames exist only in memory, one at a time. Nothing is recorded, saved or uploaded.
- **The app can't reach the internet.** The desktop app blocks every network request from its window ([`blockPageNetwork`](src/main/index.ts#L93)) and enforces a strict Content Security Policy ([`protocol.ts`](src/main/protocol.ts#L23)). The browser version uses the same policy. The pose models ship with the app instead of being downloaded when it runs.
- **Google's pose library tries to send usage stats. It's blocked.** MediaPipe includes built-in usage logging with no off switch. Posture Coach blocks it with the rules above.
- **No accounts, no analytics, no tracking.** Your settings and calibration stay on your computer (in the browser version, in that browser's local storage).

Don't take my word for it: the whole thing is here to read.

## How it works

```
webcam frame (3 per second)
  → MediaPipe pose + face models (on-device, GPU)
  → features: neck height, head forward, leaning in, looking down, tilt   (src/engine/features.ts)
  → compared to your calibrated baseline → score 0–100                    (src/engine/score.ts)
  → smoothed; "slouching" below 60                                        (src/engine/smoother.ts)
  → reminder after sustained slouching, with a cooldown                   (src/engine/alertPolicy.ts)
```

All distances are measured relative to your shoulder width, so moving closer or further from the camera doesn't throw off the score.

## Build from source

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/nrvm94/posture-coach.git
cd posture-coach
npm install          # also downloads the pose models
npm run dev          # desktop app in development mode
npm test             # engine unit tests
npm run build:web    # browser version → dist-web/
npm run dist:win     # Windows installer → dist/
```

## Built with

[Electron](https://www.electronjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Vite](https://vite.dev) and Google's [MediaPipe](https://ai.google.dev/edge/mediapipe) pose and face landmark models (Apache 2.0).

## License

[MIT](LICENSE) © 2026 Neerav
