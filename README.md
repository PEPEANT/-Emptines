# Emptines

Minimal void-world multiplayer prototype built with Three.js + Vite.

Current identity is intentionally simple:

- sky + ground only world
- hand-only first-person view (no gun/combat/build mode)
- global realtime player sync via Socket.io
- minimal HUD only

## Quick Start

Install dependencies:

```bash
npm install
```

Run client:

```bash
npm run dev
```

Run socket server:

```bash
npm run dev:server
```

Run both together:

```bash
npm run dev:all
```

## Verification

Full verification (syntax + build + socket sync smoke):

```bash
npm run check
```

Fast verification (no build):

```bash
npm run check:smoke
```

## Build

```bash
npm run build
npm run preview
```

## Controls

- `Click`: lock pointer
- `Mouse`: look
- `W A S D` or arrow keys: move
- `Shift`: sprint
- `Space`: jump

## Environment

Copy `.env.example` to `.env` when needed.

- `CORS_ORIGIN` (server env)
  - Optional comma-separated allow-list for Socket.io CORS
  - If unset, server allows all origins

## Deploy Notes

Client and socket server are separate.

1. Deploy static client (`dist`) to GitHub Pages/Netlify/Vercel
2. Deploy `server.js` to a Node host (Render/Railway/Fly/VM)
3. Keep socket server accessible from the client origin

Socket server health endpoints:

- `GET /health`
- `GET /status`

## Project Layout

```text
.
|- index.html
|- server.js
|- src/
|  |- main.js
|  |- styles/main.css
|  `- game/
|     |- Game.js
|     `- HUD.js
`- scripts/
   `- verify.mjs
```