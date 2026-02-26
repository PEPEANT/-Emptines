# Interface Contract (Locked)

This file locks the current UI/DOM contract used by gameplay code.
If any ID or key behavior changes, update this file first and run `npm run check`.

## Mount Contract

- `#app`
  - Three.js renderer mount target.
  - Must exist once.

## HUD Contract (HUD.js)

Required IDs:

- `hud-health`
- `hud-score`
- `hud-ammo`
- `hud-reserve`
- `hud-status`
- `hud-health-bar`
- `hud-kills`
- `hud-enemies`
- `hud-threat`
- `hud-streak`
- `crosshair`
- `hitmarker`
- `damage-overlay`
- `start-overlay`
- `pause-overlay`
- `gameover-overlay`
- `final-score`

## Gameplay Controls Contract (Game.js)

Required IDs:

- `start-button`
- `restart-button`
- `mode-single`
- `mode-online`
- `single-panel`
- `online-panel`
- `build-mode-badge`

Required class selectors:

- `.hotbar-slot` with `data-slot="1..8"`

## Chat Contract (Chat.js)

Required IDs:

- `chat-messages`
- `chat-input`
- `chat-send`
- `chat-myname`

## Online Lobby Contract (Game.js + server.js)

Required IDs:

- `mp-status`
- `mp-create`
- `mp-join`
- `mp-start`
- `mp-refresh`
- `mp-name`
- `mp-code`
- `mp-room-list`
- `mp-lobby`
- `mp-room-title`
- `mp-room-subtitle`
- `mp-player-list`
- `mp-copy-code`
- `mp-leave`
- `mp-team-alpha`
- `mp-team-bravo`
- `mp-team-alpha-count`
- `mp-team-bravo-count`

Socket event contract:

- Chat:
  - `chat:send`
  - `chat:message`
  - `chat:system`
- Lobby:
  - `room:list`
  - `room:create`
  - `room:join`
  - `room:leave`
  - `room:set-team`
  - `room:start`
  - `room:update`
  - `room:started`
  - `room:error`

## Input Contract

- `WASD` + arrow movement
- `LMB` fire/place
- `RMB` aim/remove
- `R` reload
- `Q` build mode toggle
- `1..8` and `Numpad1..8` block slot
- `T` or `Enter` opens chat

## Safety Rule

- Do not rename/remove IDs above without synchronized code changes in:
  - `src/game/HUD.js`
  - `src/game/Game.js`
  - `src/game/Chat.js`
  - `src/game/build/BuildSystem.js`

