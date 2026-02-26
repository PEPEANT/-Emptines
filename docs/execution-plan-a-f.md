# Execution Plan (A-F)

This plan intentionally selects only high-impact work first.
Cosmetic items are deferred until stability and gameplay are solid.

## A. Interface Freeze + Checklist (Current)

Goal:

- Lock UI/DOM/socket contracts to stop regressions from accidental renames.

Done when:

- `docs/interface-contract.md` exists and matches current code.
- `npm run check` passes.

Status: `completed`

## B. Player-Block Collision Hardening

Goal:

- Prevent clip-through/tunneling on fast movement and edge cases.

Scope:

- Movement sweep refinement against voxel blocks.
- Ground/slope edge handling around block boundaries.

Done when:

- No visible clip-through under sprint+jump stress test.
- `npm run check` passes.

Status: `pending`

## C. Enemy AI Block-Aware Movement/Cover

Goal:

- Enemy behavior responds to voxel terrain and uses cover logically.

Scope:

- Prefer paths with line-of-sight breaks.
- Short reposition behavior when player has direct angle.

Done when:

- Enemies stop walking straight into blocked LOS repeatedly.
- `npm run check` passes.

Status: `pending`

## D. Combat Feedback Upgrade

Goal:

- Improve hit readability without changing core balance.

Scope:

- Directional damage indicator.
- Tighten tracer/readability consistency.

Done when:

- Player can identify incoming direction quickly.
- `npm run check` passes.

Status: `pending`

## E. Online Ops Checklist

Goal:

- Make local/prod bring-up predictable.

Scope:

- Port/process restart checklist.
- Env validation (`VITE_CHAT_SERVER`, `CORS_ORIGIN`).

Done when:

- Fresh machine can run by checklist only.
- `npm run check` passes.

Status: `pending`

## F. Multiplayer Sync MVP Decision + Build

Goal:

- Define and implement minimum real-time sync (beyond lobby/chat).

Scope:

- Decide exact MVP: position, fire events, damage authority model.
- Implement smallest reliable version.

Done when:

- 2 clients can move/fire with shared state and consistent damage.
- `npm run check` passes.

Status: `pending`

