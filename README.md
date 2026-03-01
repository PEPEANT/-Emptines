# Emptines

Minimal void-world multiplayer prototype built with Three.js + Vite.

Current identity is intentionally simple:

- sky + ground only world
- hand-only first-person view (no gun/combat/build mode)
- global realtime player sync via Socket.io
- server-authoritative input/snapshot sync (`input:cmd` -> `snapshot:world`)
- minimal HUD only

Realtime protocol (current):

- client -> server: `input:cmd`
- server -> client: `snapshot:world`, `ack:input`

The project is now structured for expansion packs.
New world variants can be added through `src/game/content/packs/`.

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

World configuration audit:

```bash
npm run audit:world
```

Bot load test (default 50 bots for 35s):

```bash
npm run loadtest:bots
```

Custom run:

```bash
node scripts/loadtest-bots.mjs --server=http://localhost:3001 --bots=80 --duration=45 --hz=20
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
- `Tab (hold)`: show current player roster/count
- `T`: open chat input
- `Enter`: send chat (while input is open)
- Host button `포탈 열기`: instantly open portal for room (host only)
- `/host`: claim room host role (chat command)
- `/portal https://...`: host-only portal link update (chat command)
- `B`: toggle chalk tool
- `1..5`: switch chalk color
- `Left Mouse`: draw on ground (chalk tool)

## Environment

Copy `.env.example` to `.env` when needed.

- `CORS_ORIGIN` (server env)
  - Optional comma-separated allow-list for Socket.io CORS
  - If unset, server allows all origins
- `DEFAULT_PORTAL_TARGET_URL` (server env)
  - Default portal destination used by all clients in room
- `HOST_CLAIM_KEY` (server env, optional but recommended)
  - Secret key required for `room:host:claim`

Host auto-claim (client query string):

- `?host=1` to auto-request host role on join
- `?host=1&hostKey=YOUR_KEY` when server uses `HOST_CLAIM_KEY`

## Deploy Notes

Client and socket server are separate.

1. Deploy static client (`dist`) to GitHub Pages/Netlify/Vercel
2. Deploy `server.js` to a Node host (Render/Railway/Fly/VM)
3. Keep socket server accessible from the client origin

Socket server health endpoints:

- `GET /health`
- `GET /status`

`/health` now includes realtime metrics:

- `tickDriftP95Ms`
- `sendSizeP95Bytes`
- `cpuAvgPct`, `cpuP95Pct`, `cpuPeakPct`
- `memRssMb`
- `inputDropRate`
- `avgRttMs`

## Asset Credits

- Grass PBR textures: ambientCG `Grass001` (CC0)
  - Source: https://ambientcg.com/view?id=Grass001
  - License: https://docs.ambientcg.com/license/
- Beach sand PBR textures: ambientCG `Ground055S` (CC0)
  - Source: https://ambientcg.com/view?id=Ground055S
  - License: https://docs.ambientcg.com/license/
- Water normal map: three.js examples `waternormals.jpg` (MIT)
  - Source: https://github.com/mrdoob/three.js/blob/dev/examples/textures/waternormals.jpg
  - License: https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Chalk stamp texture: three.js examples `disc.png` (MIT)
  - Source: https://github.com/mrdoob/three.js/blob/dev/examples/textures/sprites/disc.png
  - License: https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Chalk tool icon: Tabler Icons `pencil.svg` (MIT)
  - Source: https://github.com/tabler/tabler-icons/blob/master/icons/outline/pencil.svg
  - License: https://github.com/tabler/tabler-icons/blob/master/LICENSE
- Sky HDR map: three.js examples `venice_sunset_1k.hdr` (MIT, Poly Haven source)
  - Source: https://github.com/mrdoob/three.js/blob/dev/examples/textures/equirectangular/venice_sunset_1k.hdr
  - three.js license: https://github.com/mrdoob/three.js/blob/dev/LICENSE
  - Poly Haven license info (CC0): https://polyhaven.com/license

## Project Layout

```text
.
|- index.html
|- server.js
|- src/
|  |- main.js
|  |- styles/main.css
|  `- game/
|     |- index.js
|     |- config/
|     |  `- gameConstants.js
|     |- content/
|     |  |- registry.js
|     |  |- schema.js
|     |  `- packs/
|     |     |- base-void/pack.js
|     |     |- baseVoidPack.js
|     |     `- template/pack.template.js
|     |- runtime/
|     |  |- GameRuntime.js
|     |  `- config/
|     |     `- runtimeTuning.js
|     |- ui/
|     |  `- HUD.js
|     `- utils/
|        |- device.js
|        |- math.js
|        `- threeUtils.js
|- public/assets/graphics/ui/oss-icons/
|  |- tabler-pencil.svg
|  `- SOURCE.txt
|- public/assets/graphics/world/textures/oss-chalk/
|  |- disc.png
|  `- SOURCE.txt
`- scripts/
  |- verify.mjs
  `- doctor.mjs
```

## Saved Links

- https://pepeant.github.io/-Emptines/  (saved: 2026-02-28)
