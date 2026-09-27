# Tiny Titans Food Fight: browser prototype

This is the Phase 0 "Food Feel" prototype from the [Game Design Document](../docs/GDD.md) (§18.3, §18.5). It exists to test one question: **is throwing food at each other fun?**

You play one Tiny Titan against 11 bots across the whole Grand Kitchen. You drop in on a napkin glider, grab food, and fight until one Titan is left or the Soap Tide washes everyone away. Matches last about 4–5 minutes.

**Version 0.2** made the map bigger, doubled the food roster to 12, and optimized the graphics (see "Performance" below).

**Version 0.3** tuned the feel: jumps reach 6 m (was 3.5), walking is 6.5 m/s and sprinting 10 m/s (were 4.6 and 7.2), and every food pickup holds a random 4–15 of that food, with stacks of up to 30.

**Version 0.4:**

- **Dash:** replaces the dodge-roll. It covers 11 m in half a second, has a 0.45 s cooldown, can be used once per jump in the air, and still shakes off sticky food.
- **Double jump:** adds up to 5 m, for a reach of about 11 m.
- **Health:** doubled to 200 (banana and grapes heal twice as much).
- **Obstacles:** about 30 new ones.
- **Phone fix:** the death-screen buttons now work.

**Version 0.5:**

- **Food bushes:** they replace the floating spawners. Stand in one and it hands you its food one piece at a time (one every 0.09 s) until it's empty, then it regrows in 12 s.
- **Finding players without revealing hiding spots:** only Titans making noise can be located. Noise means throwing, dashing, double-jumping, sprinting or getting hit.
  - Passive arrows around the crosshair point toward noisy enemies within 75 m that you can't see.
  - **Sniff** (B, or the phone button) points at the 4 nearest noisy Titans anywhere, with distances, for 3 s, on a 10 s cooldown.
  - Quiet Titans, and anyone hiding in a bush, never show up; their nameplates stay hidden too, and bots can't see them either.
- **More optimization:** see the Performance section.

**Version 0.6:**

- **Online multiplayer ("Play online"):** pick a name and a room code; everyone on the published page who types the same code plays together in a free-for-all food fight with respawns, a scoreboard and a shared kill feed. It runs on the claude.ai artifact `room` capability (`src/net.js`):
  - Each player's game shares its Titan through room presence about 30 times a second, with throws, peel traps, trampolines and knockouts as a short rolling event log.
  - Every game simulates every projectile; a hit is decided by the game of the Titan that got hit, and the thrower is credited when that player announces the knockout.
  - Incoming data is untrusted: it's clamped, checked against the food table, shown as plain text and rate-limited.
  - Pickups are per player online, and online matches have no Soap Tide (players join at different times).
  - Tested with two browser tabs through a stand-in room (`window.__useMockRoom`): joining, seeing each other, a thrown carrot knocking the other player out, kill credit, the kill feed, respawning and leaving.
- **First person:** the camera is your Titan's eyes, with your arm and food as a viewmodel. **V** switches to third person.
- **Blueberries (13th food):** rapid fire, about 12 berries a second at 5 damage each, with spray that grows while you hold the trigger. Pickups hold a handful (24–90 berries) and stack to 240.
- **Food system reverted:** bushes are gone; food floats at its spawn points again.

**Version 0.7:**

- **Graphics setting applies instantly, in every mode including online.** It no longer reloads the page, which is likely why Low didn't stick before. Low also shortens the view distance, lowers render resolution further and drops the sunbeam. The setting is on the main menu and in the pause menu.
- **Phone aim stick:** the Throw button is now a joystick with the held food's icon.
  - Hold it to pull the trigger and drag to aim; pushing past the ring keeps turning.
  - Charge foods (carrot, tomato, soda…) charge while held and throw on release; blueberries stream while held; tap foods throw at once.
  - In a simulated-phone test: the High → Low switch mid-online-game turned off shadows, bloom and the sunbeam, cut view distance from 1400 to 430 and render scale from 2× to 0.79×; blueberries streamed while held and stopped on release; the carrot charged with the scope zoom and threw on release.

## What's in it

| Area | Included |
|---|---|
| Foods (12 of 30) | Tomato, Banana (+ Peel), Carrot, Ice Cube, Soda Can, Cheese Wheel, Grapes, Chili Pepper, Cookie, Watermelon, Pineapple, Jelly Cube, with GDD numbers, alt actions and counterplay |
| Combat | Launch profiles (Lob, Line, Return, Roll, Spray, Seek, Place), charge-to-throw, face hits, splash falloff, knockback, swap lockout, chili lock-on, cookies you can shoot down, sticky pineapples you can roll off |
| Statuses | Sticky (50% slow cap), Juiced drip trail, Slick, Frozen and Shatter, Tripped, Rooted (can still throw), Burning, Wet (cleanses; freezes last longer), Glaze shield |
| Fairness rules | Shared hard-CC diminishing returns (2nd = 50%, 3rd = immune, max 2.5 s per 6 s), eating interrupted by 25+ damage, banana bruising |
| Systems | Surface State Grid (ice rinks, soda puddles, melt pools), splat canvas (stains painted onto the counter), Fire + Ice = steam |
| Map | The whole kitchen at 1:40 scale (about 480 × 340 m). The island (cereal boxes, jam jar, mug, toaster, hot plate, water spill, honey, giant tomato). A 440 m back counter with sink, stove burners, stock pot, coffee maker and fridge. A dining table with chairs, plates, glasses, a pepper mill and a napkin holder that you can stand on or hide under. The floor, with crumbs, bean cans, sugar-cube steps, a colander dome, a rolling pin, a plate stack, a milk carton, lemons, a fallen cereal box and a wooden spoon. 12 spatula launch pads |
| Match | 12 Titans, napkin-glider drop, Soap Tide closing in 6 phases, grocery drops inside each new safe zone, kill feed, spectating, win screen |
| Movement | Walk, sprint, jump and double jump, dash (also once in the air), momentum skating on slick surfaces, jelly trampolines, no fall damage |
| Bots | Pick targets, choose food by range, lead shots with the same ballistic math, dodge, strafe, loot, heal, hunt, walk around walls, use launch pads to reach the safe zone, avoid burners and ledges |
| Presentation | Procedural textures, synthesized sound, pooled instanced particles, rim-lit characters, soft contact shadows, sunbeam and dust, bloom (High), hit markers, damage numbers, hit-stop, screen shake |
| Platforms | Desktop (mouse and keyboard, pointer lock) and phones (touch joystick and buttons); Low, Medium and High graphics with automatic resolution scaling |

## Run it

**Version 0.9:**

- **Mode menu:** Play vs bots opens a choice between **Classic** and **Chef's Choice**; Chef's Choice then shows the food picker.
- **Chef's Choice mode** (vs bots): pick 3 foods. They never run out (the hotbar shows ∞), but no food spawns anywhere: no floating pickups, grocery drops, Giant Tomato piles or loot from splatted Titans. Bots bring 3 random foods each. Food never heals in this mode (bananas and grapes can't be eaten); instead green heal crosses float on every third spawn point (21 on the map) and give +60 HP, returning 20 s after being taken. Hurt bots go for them. Your pick is remembered.
- **More common staples:** spawn weights raised for tomato (26 → 42), carrot (14 → 28) and blueberries (12 → 26), so about half of all food pickups are one of the three.

**Version 0.8:**

- **Smaller HUD:** the player-count and splat tags, the health and Glaze bars, and the hotbar are all smaller.
- **Bigger splats, faster throws:** tomato splash radius 2.5 → 4 m with a much bigger stain; soda, grape, jelly and watermelon stains are bigger too. Recovery between throws is much shorter: tomato 0.55 → 0.22 s, ice 0.6 → 0.3, soda 0.7 → 0.35, grapes 0.8 → 0.4, pineapple 0.8 → 0.45, jelly 0.6 → 0.3.
- **Stamina for jumping and dashing:** 100 max; a jump costs 18, a double jump 24 and a dash 30. It refills at 30 a second after a 0.6 s pause. A green bar sits under the health bar and flashes red when you're too tired. Bots use the same rules.

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
| Space jump (again in the air to double jump), C dash | Jump and Dash buttons |
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

## Performance

The GDD asks for high fidelity that stays smooth (§11), so 0.2 added the following:

| Technique | Effect |
|---|---|
| Static scenery merged by material | 291 scenery meshes become 91 draw calls |
| Titan bodies merged per material and shared | About 20 meshes per Titan become 5, with one shared geometry for all 12 |
| Food models merged and shared | A bunch of grapes goes from 17 meshes to 2; every pickup, held item and projectile shares one geometry |
| Shadows baked once on Medium | The shadow map renders once instead of every frame; soft blob shadows ground the moving objects |
| Dynamic resolution | Render scale drops (down to 55%) when the frame rate falls below 50 and recovers above 58 |
| Distance culling for pickups | Food further than 130 m isn't drawn |
| Bloom only on High | Glowing burners, honey and sunlight cost nothing on Low or Medium |
| Instanced pickups and bushes (0.5) | Every pickup and every piece of food on a bush is drawn with one InstancedMesh per food part: 62 bushes plus all loot take about 25 draw calls |
| Instanced launch pads and spice jars (0.5) | 41 draw calls become 4 |
| Level of detail (0.5) | Bushes show 5 pieces of food up close, 1 at mid range and none far away; Titans beyond 70 m drop arms and feet |
| Frozen matrices for scenery (0.5) | Static meshes skip the per-frame matrix update (`matrixAutoUpdate = false`) |
| Shaders compiled at load (0.5) | `renderer.compileAsync` compiles every material in parallel up front, so first throws don't stutter |
| 30 Hz shadow refresh on High (0.5) | Moving shadows update every other frame, halving the shadow cost |

Measured from the same wide shot of the whole kitchen, old build (small map, 8 Titans) against new build (whole kitchen, 12 Titans), in a software-rendered test browser:

| Quality | Draw calls | Render time per frame |
|---|---|---|
| Low | 385 → 258 | 2.8 → 2.5 ms |
| Medium | 601 → 289 | 4.6 → 2.9 ms |
| High | 587 → 491 (now with bloom and every-frame shadows) | 4.7 → 3.7 ms |

Version 0.5 (same wide shot, with 62 food bushes added): Medium 307 → 208 draw calls (−32%), Low 258 → 198. Titans went from 126 to 81 calls and the rest of the scenery from 91 to 50. Triangle count went up (about 107k → 131k) because of the bushes and the food growing on them, so software-rendered frame time in the test browser is similar to before; on a real GPU, draw calls are usually the bigger cost.

Sources for the 0.5 techniques: [100 Three.js Tips That Actually Improve Performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [Optimizing Three.js: Draw Calls, Instancing & Batching](https://bersus.io/insights/creative-dev/threejs-optimizing-instancing-and-batching/), [Three JS Performance Guide](https://gist.github.com/iErcann/2a9dfa51ed9fc44854375796c8c24d92), [The Big List of three.js Tips and Tricks](https://discoverthreejs.com/tips-and-tricks/). Lower shader precision on phones (mediump) was considered and rejected: with a kitchen hundreds of metres across, mediump vertex positions would wobble by tens of centimetres.

The game shows its frame rate, draw calls and render scale in the bottom-left corner while you play.

## Balance check

Balance was checked by fast-forwarding bot-only matches in a headless browser. With 12 foods, no food deals more than 15% of all damage. Tomato leads as the common staple; Ice Cube, Jelly Cube and Pineapple deal little damage because they are control tools.

What the checks caught along the way:

- **Banana:** it caused almost half of all eliminations, because catching it refunded it (infinite ammo). Bruising (three throws, then mush) and a damage cut fixed that.
- **Soap Tide on the big map:** it caused 57% of eliminations. Bots walked into the island's side trying to reach a safe zone on the counter, and ran out of food in the final circle. Wall-following, launch-pad routing, hunting and grocery drops brought it down to roughly 15–40% depending on the run, mostly from the final circle closing.
- **Cookie:** it orbited its target instead of hitting it, because its turning circle was as wide as the gap. Seekers now turn harder within 20 m.

## Known limits

- Bots only; there is no online multiplayer yet. That is the next prototype milestone (GDD §18.3, weeks 7–8).
- Bots steer with simple wall-following and launch pads rather than real pathfinding.
- The upper cabinets, window sill and ceiling pot rack are scenery; they aren't reachable yet.
- Changing graphics quality reloads the page.
