# Tiny Titans Food Fight: browser prototype

This is the Phase 0 "Food Feel" prototype from the [Game Design Document](../docs/GDD.md) (§18.3, §18.5). It exists to test one question: **is throwing food at each other fun?**

You play one Tiny Titan against 7 bots on the kitchen island countertop. You drop in on a napkin glider, grab food, and fight until one Titan is left or the Soap Tide washes everyone away. Matches last about 2–3 minutes.

## What's in it

| Area | Included |
|---|---|
| Foods (6 of 30) | Tomato, Banana (+ Peel), Carrot, Ice Cube, Soda Can, Cheese Wheel, with GDD numbers, alt actions and counterplay |
| Combat | Launch profiles (Lob, Line, Return, Roll, Place), charge-to-throw, face hits, splash falloff, knockback, swap lockout |
| Statuses | Sticky (50% slow cap), Juiced drip trail, Slick, Frozen and Shatter, Tripped, Burning, Wet (cleanses; freezes last longer), Glaze shield |
| Fairness rules | Shared hard-CC diminishing returns (2nd = 50%, 3rd = immune, max 2.5 s per 6 s), eating interrupted by 25+ damage, banana bruising |
| Systems | Surface State Grid (ice rinks, soda puddles, melt pools), splat canvas (stains painted onto the counter), Fire + Ice = steam |
| Map | Countertop at 1:40 scale with cereal boxes, jam jar, mug, toaster, cutting board, plate, a hot-plate burner, a water spill, a honey pool, a giant tomato you can harvest, and spatula launch pads on the floor |
| Match | Napkin-glider drop, Soap Tide closing in 5 phases, kill feed, spectating, win screen |
| Movement | Walk, sprint, jump, Duck & Roll, momentum skating on slick surfaces, no fall damage |
| Bots | Pick targets, choose food by range, lead shots with the same ballistic math, dodge, strafe, loot, heal, avoid the burner and edges |
| Presentation | Procedural textures, synthesized sound, pooled instanced particles, hit markers, damage numbers, hit-stop, screen shake |
| Platforms | Desktop (mouse and keyboard, pointer lock) and phones (touch joystick and buttons); Low, Medium and High graphics |

## Run it

**Quickest:** build the single self-contained file and open it in a browser.

```bash
npm install
npm run build        # writes dist/tiny-titans.html (one file, works offline)
```

**While developing:** serve the source directly. It loads three.js from a CDN through an import map, so no build step is needed.

```bash
npm run dev          # http://localhost:5173
```

`index.html` also works on any static host (for example GitHub Pages) as it is.

## Controls

| Desktop | Phone |
|---|---|
| WASD move, Shift sprint | Drag on the left half to move |
| Mouse aim; hold the left button to charge, release to throw | Drag on the right half to aim |
| Right-click or Q: the food's alt action | Alt button |
| Space jump, C Duck & Roll | Jump and Roll buttons |
| 1–5 or mouse wheel: pick food | Tap a food plate |
| Esc or P: pause | |

## Code map

| File | What it does |
|---|---|
| `src/core.js` | Constants, collision (boxes and cylinders), ground queries, raycasts, lob solver |
| `src/world.js` | The kitchen, countertop props, hazards, launch pads, landmark tomato, Soap Tide wall, splat canvas |
| `src/foods.js` | All food data and behaviour: meshes, throw, impact, alt actions |
| `src/actors.js` | Titans: movement, statuses, diminishing returns, inventory, animation |
| `src/projectiles.js` | Projectile flight, boomerang steering, rolling, hit detection (body capsule and head) |
| `src/items.js` | Pickups and spawners, peel traps, stuck carrots |
| `src/surface.js` | Surface State Grid and zone visuals |
| `src/bots.js` | Bot AI |
| `src/game.js` | Match flow, damage and kills, Soap Tide, camera, aim preview |
| `src/hud.js`, `src/input.js`, `src/fx.js` | HUD, controls, particles, sound |

## Balance check

Balance was checked by fast-forwarding bot-only matches in a headless browser (about 5 matches per run). In the last run:

- Eliminations came from every food plus the environment.
- Banana and Tomato each dealt about a quarter of all damage.
- Carrot, Soda Can and Cheese Wheel dealt 13–15% each.
- Ice Cube dealt about 2%, as a control tool.

Earlier runs caught a Banana that caused almost half of all eliminations. It was infinite ammo because catching it refunded it. Bruising (three throws, then mush) and a damage cut fixed that.

## Known limits

- Bots only; there is no online multiplayer yet. That is the next prototype milestone (GDD §18.3, weeks 7–8).
- Bots navigate in straight lines with simple unsticking, and have no pathfinding.
- The 1:40 kitchen is only as big as the island plus the floor around it; the rest is scenery.
- Changing graphics quality reloads the page.
