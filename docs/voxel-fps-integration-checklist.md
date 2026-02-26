# Voxel + FPS Integration Checklist

This document defines guardrails while adding Minecraft-style block building
to the existing FPS loop.

## Non-Negotiable Invariants

1. Existing FPS flow must keep working:
   - movement (`WASD`, jump, sprint)
   - aiming/shooting/reloading
   - enemy spawn/combat/damage loop
2. Existing overlays must not break:
   - start overlay
   - pause overlay
   - game over overlay
3. Existing chat input must keep priority when focused.
4. Existing required DOM IDs used by `HUD.js` must stay valid.

## Required DOM IDs (Do Not Rename)

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
- `start-button`
- `restart-button`

## Integration Strategy

1. Add block UI first (visual only).
2. Add mode state machine (`weapon` / `build`) with no block placement yet.
3. Add voxel world module and keep combat loop untouched.
4. Add placement/removal only in `build` mode.
5. Add collision + performance optimization after behavior is stable.

## Regression Test Matrix

1. Start game from overlay.
2. Move, sprint, jump.
3. Aim/shoot/reload.
4. Enemy deals damage and game over still triggers.
5. Chat open/close and send still works.
6. New hotbar UI visible and not blocking crosshair.
