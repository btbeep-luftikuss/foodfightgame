# Kitchen Chaos: Tiny Titans Food Fight

A multiplayer 3D food-fight battle royale. You're frog-sized, the kitchen is enormous, and every weapon is food.

**Play it in your browser:** https://btbeep-luftikuss.github.io/foodfightgame/play/ (the site's front page opens the game too, whichever folder GitHub Pages publishes from: the repository root or `/docs`).

## Documents

- [Game Design Document](docs/GDD.md): core systems, the 30 foods and their balance, map layout, graphics and performance plan, technical architecture, and the implementation roadmap.
- [Browser prototype](prototype/README.md): the whole kitchen as a playable first-person arena with 13 foods (each with an ultimate alt ability), 20 support utensils, three maps (kitchen, backyard, restaurant), 11 bots and the Soap Tide, Solo, Duos, Trios or Squads in every mode including Cooking Pot Wars, all online too (on the public page https://btbeep-luftikuss.github.io/foodfightgame/play/ anyone with the link can join without signing in, once GitHub Pages is on; on claude.ai, people signed in whom the game is shared with; every update fits the claude.ai room's 4 KB limit since 0.33; online Cooking Pot Wars respawns at your pot since 0.34; no invisible walls and no meat on the maps since 0.35), highlight reels at the end of every match vs bots (the match's best splats, snipes and dodges, and yours; shot like a sports replay since 0.37: the camera rides along with long throws in slow motion, wide shots show the whole play, every impact freezes and flashes) and, since 0.38, at the end of every online round (its best plays, with yours); since 0.39 splats come first, and the splatting throw lands right in its target with a bigger, food-coloured explosion; since 0.40 a throw's distance counts its climbs and drops, bots in Cooking Pot Wars climb to pots up on tables, and lamp shades, tablecloths and glasses are no longer see-through; since 0.41 Settings has a Mobile / PC controls switch; since 0.42 a game that can't start (on an iPad, say) says why on screen and starts lighter after a crash; since 0.43 no stray name tags online; since 0.44 online players all see the same food, utensil boxes and map, with a round of online fixes; since 0.45 a Low internet setting (and Auto) for slow connections; since 0.46 every splat in a reel opens with quick cuts of the hits that wore them down; since 0.47 reels keep the play in the shot, throws up and down included; since 0.48 carrots hit online (the thrower's game decides fast foods) and pot meters are clearer, with loadouts, coins and a Snack Pack of skins to buy, and a spectator mode (cinematic camera, minimap, player cards).
- [Utensil Buffers](docs/utensils/README.md): the 20 support utensils, their buffs, trade-offs and art.

## Status

Pre-production. The design document is at v0.1, and the Phase 0 "Food Feel" browser prototype is playable (`cd prototype && npm install && npm run dev`).
