# Content Packs

This folder is the expansion point for future world/content variants.

How to extend:

1. Add a new pack file in `packs/` with a unique `id`.
2. Register it via `registerContentPack(pack)` from `content/registry.js`.
3. Boot the game with `contentPackId`.

Example future packs:

- `packs/desertVoidPack.js`
- `packs/industrialVoidPack.js`
- `packs/nightSkyPack.js`