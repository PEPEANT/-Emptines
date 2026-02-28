# Server Modules

Realtime server code is split by responsibility:

- `config/runtimeConfig.js`: env parsing and server constants
- `domain/playerState.js`: player name/state sanitization and sync change detection
- `domain/RoomService.js`: room/player membership and room event emission
- `http/createStatusServer.js`: `/`, `/status`, `/health` endpoints
- `socket/registerSocketHandlers.js`: socket event wiring (`room:*`, `chat:*`, `input:cmd`, `net:*`, `portal:*` including host force-open)
- `runtime/AuthoritativeWorld.js`: 20Hz authoritative simulation + AOI delta snapshots
- `runtime/startRealtimeServer.js`: bootstraps HTTP + Socket.io + runtime error handling
- `utils/*`: small shared runtime helpers

`server.js` remains the process entrypoint.
