# RECLAIM FPS

Web FPS prototype built with Three.js + Vite.
Includes voxel build mode, online lobby/chat (Socket.io), and survival combat.

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

Run production-style 24/7 processes with PM2:

```bash
npm run prod:start
npm run prod:status
```

Stop:

```bash
npm run prod:stop
```

Run environment doctor (startup sanity check):

```bash
npm run doctor
```

Important local run note:

- Use Vite (`npm run dev` or `npm run dev:all`).
- Do not open the root `index.html` with generic static Live Server (`127.0.0.1:5500`), because ESM dependencies are Vite-resolved.

## Verification

Full verification (syntax + build + weapon/voxel/socket smoke):

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

- `W A S D`: Move
- `Shift`: Sprint
- `Space`: Jump
- `Mouse`: Look
- `LMB`: Fire / Place block
- `RMB`: Aim / Remove block
- `R`: Reload
- `Q`: Toggle weapon/build mode
- `1..8` or `Numpad1..8`: Block slot
- `T` or `Enter`: Open chat

## Environment

Copy `.env.example` to `.env` when needed.

- `VITE_CHAT_SERVER`
  - Client-side socket server URL.
  - Local default is `http://localhost:3001`.
  - In production, set this to your deployed socket server origin if client/server are split.

- `CORS_ORIGIN` (server env)
  - Optional comma-separated allow-list for Socket.io CORS.
  - If unset, server allows all origins.

## Deploy Notes

Client and socket server are separate concerns.

1. Deploy static client (`dist`) to Netlify/Vercel/etc.
2. Deploy `server.js` to a Node host (Render/Railway/Fly/VM).
3. Set `VITE_CHAT_SERVER` on the client build to point to the deployed socket server.
4. Optionally set `CORS_ORIGIN` on the socket server.

Socket server health endpoints:

- `GET /health`
- `GET /status`

## 24/7 Local Runtime (PM2)

This repo includes `ecosystem.config.cjs` with two apps:

- `reclaim-fps-client` (Vite preview on `5173`)
- `reclaim-fps-chat` (Socket server on `3001`)

Commands:

```bash
npm run prod:start
npm run prod:status
npm run prod:logs
npm run prod:save
```

Auto-start after reboot (one-time):

```bash
npx pm2 startup
```

Execution docs:

- `docs/interface-contract.md`
- `docs/execution-plan-a-f.md`

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
|     |- HUD.js
|     |- Chat.js
|     |- EnemyManager.js
|     |- WeaponSystem.js
|     |- audio/SoundSystem.js
|     `- build/
|        |- BuildSystem.js
|        |- VoxelWorld.js
|        `- BlockPalette.js
|- public/assets/
|  |- graphics/
|  `- audio/
`- docs/
   |- third-party-attribution.md
   `- voxel-fps-integration-checklist.md
```
