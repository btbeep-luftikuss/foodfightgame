# Kitchen Chaos: Tiny Titans Food Fight

A multiplayer 3D food-fight battle royale. You're frog-sized, the kitchen is enormous, and every weapon is food.

## Documents

- [Game Design Document](docs/GDD.md): core systems, the 30 foods and their balance, map layout, graphics and performance plan, technical architecture, and the implementation roadmap.
- [Browser prototype](prototype/README.md): the whole kitchen as a playable first-person arena with 13 foods (each with an ultimate alt ability), 20 support utensils, three maps (kitchen, backyard, restaurant), 11 bots and the Soap Tide, Solo, Duos, Trios or Squads in every mode including Cooking Pot Wars, all online too (on the public page https://btbeep-luftikuss.github.io/foodfightgame/play/ anyone with the link can join without signing in, once GitHub Pages is on; on claude.ai, people signed in whom the game is shared with; every update fits the claude.ai room's 4 KB limit since 0.33; online Cooking Pot Wars respawns at your pot since 0.34; no invisible walls and no meat on the maps since 0.35), highlight reels at the end of every match vs bots (the match's best splats, snipes and dodges, and yours), with loadouts, coins and a Snack Pack of skins to buy, and a spectator mode (cinematic camera, minimap, player cards).
- [Utensil Buffers](docs/utensils/README.md): the 20 support utensils, their buffs, trade-offs and art.

## Status

Pre-production. The design document is at v0.1, and the Phase 0 "Food Feel" browser prototype is playable (`cd prototype && npm install && npm run dev`).
