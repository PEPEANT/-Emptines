# Emptines

## Vision Statement

이 프로젝트는 단순한 게임이 아니라, 인간과 AI가 공존하는 포스트휴먼 메타도시를 위한 장기 설계도다.

- 문서 시작점: [`docs/INDEX.md`](./docs/INDEX.md)
- 백서 정본: `C:\Users\rneet\OneDrive\Desktop\DIS\EM\WHITEPAPER.md`
- 세계관 정본: `C:\Users\rneet\OneDrive\Desktop\DIS\EM\WORLD_LORE.md`
- 로컬 백서 미러: [`WHITEPAPER.md`](./WHITEPAPER.md)
- 로컬 세계관 미러: [`WORLD_LORE.md`](./WORLD_LORE.md)
- UGC 기준 정본: `C:\Users\rneet\OneDrive\Desktop\UGC\AGENTS.md`
- 기준 시작일: `2026-03-05`
- 장기 목표 시점: `2045-03-05`

이 저장소는 AGI/ASI 시대의 협업 제작을 염두에 두고,
사람과 에이전트가 함께 이어서 만들 수 있는 구조를 지향한다.

Canonical ownership:

- `EM`은 백서와 세계관의 정본 저장소다.
- `UGC`는 오브젝트 배치와 UGC 운영 규칙의 정본 저장소다.
- `Emptines`는 공식 사이트의 런타임 구현 저장소다.

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

Live connectivity verification (Render lobby + OX/FPS URLs + socket join/zone switch):

```bash
npm run check:live
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
- `/portal https://...`: host-only portal target update (same-domain `?zone=` links recommended)
- `B`: toggle chalk tool
- `1..5`: switch chalk color
- `Left Mouse`: draw on ground (chalk tool)

## Environment

Copy `.env.example` to `.env` when needed.

- `CORS_ORIGIN` (server env)
  - Optional comma-separated allow-list for Socket.io CORS
  - If unset, server allows all origins
- `STATIC_CLIENT_DIR` (server env, optional)
  - Directory for static client hosting on the same server (`dist` by default)
- `DEFAULT_PORTAL_TARGET_URL` (server env)
  - Default main portal destination (recommended: same domain + `/ox/`)
- `DEFAULT_A_ZONE_PORTAL_TARGET_URL` (server env)
  - Default A-zone portal destination (recommended: `https://reclaim-fps.onrender.com/`)
- `SURFACE_PAINT_STORE_PATH` (server env, strongly recommended on Render)
  - Persistent save path for edited world state (platforms/ropes/object positions/promo/surface paint)
  - Recommended value on Render Disk: `/var/data/surface-paint.json`
- `MAP_LAYOUT_VERSION` (server env, optional but recommended)
  - Layout compatibility key for disk snapshots (default: `2026-03-04-layout-v1`)
  - If this value changes, server skips restoring saved layout objects (platforms/ropes/object positions/promo)
  - Use this when map geometry/portal placement was changed in code and old snapshot should not override it
- `HOST_CLAIM_KEY` (server env, optional but recommended)
  - Secret key required for `room:host:claim`
- `SURFACE_PAINT_MODE` (server env, optional)
  - Controls who can save painted surfaces through sockets
  - `public` = any player, `host` = host only, `off` = blocked for everyone
- `PROMO_MODE` (server env, optional)
  - Controls who can create/remove promo objects through sockets
  - `public` = any player, `host` = host only, `off` = blocked for everyone
- `ABUSE_MAX_CONNECTIONS_PER_IP` (server env, optional)
  - Maximum concurrent sockets allowed from one IP before new connections are blocked
- `ABUSE_MAX_CONNECTIONS_PER_WINDOW_PER_IP` (server env, optional)
  - Maximum connection attempts allowed from one IP inside the rolling connection window
- `ABUSE_CONNECTION_VIOLATION_WINDOW_MS` (server env, optional)
  - Rolling window used to count repeated connection-limit violations per IP
- `ABUSE_CONNECTION_VIOLATIONS_BEFORE_BAN` (server env, optional)
  - Number of repeated connection-limit hits before the IP is temporarily banned
- `ABUSE_CONNECTION_BAN_MS` (server env, optional)
  - Temporary ban duration after repeated connection-limit violations

Host auto-claim (client query string):

- `?host=1` to auto-request host role on join
- `?host=1&hostKey=YOUR_KEY` when server uses `HOST_CLAIM_KEY`

## Deploy Notes

Single endpoint deployment (recommended):

1. Build client: `npm run build`
2. Deploy `server.js` (and `dist/`) to one Node host (Render/Railway/Fly/VM)
3. Use one public URL only (e.g. `https://emptines-chat-2.onrender.com`)
4. Optional share links on same domain: `?zone=lobby`, `?zone=fps`, `?zone=ox`
5. For persistent world edits on Render, attach a Disk and set:
   - `SURFACE_PAINT_STORE_PATH=/var/data/surface-paint.json`
   - `MAP_LAYOUT_VERSION=2026-03-04-layout-v1` (bump value when map layout changes)
   - `SURFACE_PAINT_MODE=host`
   - `PROMO_MODE=host`
   - `ABUSE_MAX_CONNECTIONS_PER_IP=3`
   - `ABUSE_MAX_CONNECTIONS_PER_WINDOW_PER_IP=12`
   - `ABUSE_CONNECTION_VIOLATION_WINDOW_MS=180000`
   - `ABUSE_CONNECTION_VIOLATIONS_BEFORE_BAN=3`
   - `ABUSE_CONNECTION_BAN_MS=900000`

## Abuse Recovery

If a public room gets spammed with promo cubes or promo-surface drawings:

```bash
npm run reset:world -- --promos
```

- This removes saved `promoObjects` and promo-only painted surfaces (`po_*`), while keeping normal world paints.
- The script creates a timestamped backup next to the store file before writing.
- Restart the socket server after running it so clients reload the cleaned snapshot.

For a full wipe of saved world edits:

```bash
npm run reset:world -- --all
```

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

- https://emptines-chat-2.onrender.com  (single endpoint)
