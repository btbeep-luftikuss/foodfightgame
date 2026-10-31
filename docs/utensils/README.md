# Utensil Buffers

Twenty support utensils for Kitchen Chaos: Tiny Titans Food Fight (18 of them in the game: the Microwave and the Colander were taken out in prototype 0.63; their art stays here). A utensil never replaces the food:
the food stays the projectile, keeps its own look and effect, and the utensil adds one boost at one cost.

- `svg/`: one transparent 400×400 SVG per utensil (the source art)
- `png/`: the same art as transparent 512×512 PNGs
- `build.mjs`: draws every SVG; run `node docs/utensils/build.mjs` after changing it

| # | Utensil | Role | Shown with | Buff | Trade-off |
|---|---------|------|------------|------|-----------|
| 01 | Knife | Rapid-Fire Chopper | Tomato | Slices your food into a fan of quick pieces (in the game: a cheese wheel or watermelon is diced into mini balls that roll out); back-to-back hits stack the food's own effect. In the game (0.49) its slices cut straight through cheese shields, and firm foods cut clean and hit harder. | Burns through ammo fast, and each piece hits softer than a whole food. |
| 02 | Ice Cream Machine | Cryo Converter | Banana | Coats your food in soft-serve: it arcs slowly, freezes on hit and leaves a frost zone with the food's effect. | Takes a moment to churn, and the frozen shot flies slowly enough to dodge. |
| 03 | Spoon | Shotgun Burst | Blueberries | Scoops a heap of your food and flings it as a tight cone of pellets. In the game (0.49) soft foods splat and slow whoever they hit; firm foods bonk them back. | Each fling uses a big scoop of ammo, and the pellets spread wide at range. |
| 04 | Blow Torch | Incendiary Charge | Pineapple | Hold for 3 seconds to set your food ablaze for heavy burn damage over 3 seconds. | You stand exposed while charging, and the torched food is used up on impact. |
| 05 | Whisk | Vortex Spinner | Grapes | Whips your food into a spinning vortex that tugs enemies in and hits them again and again. | The vortex drifts slowly and fades after a few seconds, so timing matters. |
| 06 | Blender | Particle Stream | Tomato | Purees your food into a pressure jet that coats the floor with the food's effect. | You move slower while spraying, and the jet drains ammo every second. |
| 07 | Rolling Pin | Kinetic Disc Ricochet | Cookie | Flattens your food into fast discs that ricochet off walls with full effect and knockback. | Discs hit lighter, and a bad angle can bounce one straight back at you. |
| 08 | ~~Microwave~~ (not in the game since 0.63) | Charged Plasma | Cheese | Charges your food for 1–2 seconds into a glowing orb that detonates with splash damage. | You must charge it first, and holding too long overcharges it so it pops on you. |
| 09 | Grater | Flechette Cloud | Carrot | Shreds your food into a dense, fast cloud that tears through groups up close. In the game (0.49) grated cheese slows, grated chili burns, grated ice chills; soft food mushes into slippery blobs instead. | The shreds lose power quickly with distance and chew through ammo. |
| 10 | Spatula | Ricochet Crit | Jelly | Flips your food for a guaranteed critical hit that can bank off walls. | The crit only lands on a well-aimed flip; miss the angle and the shot is wasted. |
| 11 | Deep Fryer | Napalm Coater | Chili | Coats your food in hot oil that leaves burning slicks carrying the food's effect. | The slicks are slippery for you too, and the fryer overheats if used back to back. |
| 12 | Mortar & Pestle | Powder Mortar | Ice | Grinds your food into powder shells that lob far and leave lingering clouds of its effect. | The shells fly slowly, and wind can blow the cloud away from its target. |
| 13 | Toaster | Scorched Bounce | Cheese | Toasts your food crispy-hot: it bounces twice and leaves a scorched trail. In the game (0.63) every throw also pops you back: a hop backward, away from where you aim. | Each bounce hits a little softer, and it stops after two. |
| 14 | ~~Colander~~ (not in the game since 0.63) | Piercing Stream | Soda | Strains your food into a needle-tight stream that pierces through several enemies in a line. | The recoil slows you while firing, and the thin stream needs precise aim. |
| 15 | Cotton Candy Machine | Sticky Web | Blueberries | Spins your food into sweet, sticky webs that slow and trap enemies. | Webs take a moment to set, and enemies can burn them or wash them off. |
| 16 | Popcorn Popper | Cluster Burst | Watermelon | Heats your food until it pops mid-flight into a cluster of exploding pieces. | The short fuse can pop it early, and the pieces scatter in random directions. |
| 17 | Peeler | Layered Multi-Stage | Banana | Each hit on the same target peels off another layer for bigger and bigger damage. | Early layers hit softly, and after the last layer it must cool down before peeling again. |
| 18 | Mixer | Hybrid Combiner | Chili + Ice | Blends two different foods into one projectile that carries both effects. | Uses two foods per shot and takes longer to prepare. |
| 19 | Oven Mitt | Power Throw | Carrot | Hurls your food far faster and makes it immune to status effects in flight. | Long cooldown between throws, and the mitt overheats if you push it. |
| 20 | Pan | Alt-Ability Activator | Soda | Slams your food to trigger its special ability on demand. | Medium cooldown, and the slam roots you in place for a moment. |

## Legendary utensils (prototype 0.54)

Five super-powered versions of five of the utensils above, for the King of the Utensil mode (two of them
land in the middle of the map; nothing else spawns). They're still food buffers: the loaded food is always
the projectile and keeps its look and effects. Each rules a different part of a fight (the design and the
balance numbers are in the [GDD, section 10.3](../GDD.md#103-the-five-legendary-utensils)):

| Legendary | Role | Buff | Trade-off |
|-----------|------|------|-----------|
| Blow Torch | Mid-range area burn + projectile hybrid | Hold for a spiralling cone of flame that burns everyone in it, while pieces of the food fly out along the spiral and hit as that food. | The cone is short (11 m) and narrow: keep aiming it. |
| Blender | Sustained ramping laser | Hold for a thin laser of the food, liquefied, that ramps from 14 to 40 to 120 damage a second the longer it stays on one Titan (like the Inferno Tower). Uses very little food. | Narrow: it needs precise tracking; the ramp resets after 3 s off every Titan (0.57: it carries over to the next one within those 3 s). |
| Grater (0.57) | Food rain clouds | Where the food lands or hits a Titan, a cloud of its colour gathers overhead and rains that food for 3.5 s; a cloud over a Titan drifts after them. | The rain is little pieces spread over a 10 m powder cloud, slower than a run: step out from under it. |
| Oven Mitt (0.57) | Charged straight shots | A click charges it and loads 4 shots, fired one click each (0.62: each food its own: 14 rapid blueberries, 4 grape triple shots, 3 piercing carrots, 2 heavy cheeses...): the food shoots dead straight at 120 m/s, no drop, until it hits something: 1.35 times the damage and a shove. | After the 3rd shot, a 2.2 s cooldown and a new charge; one Titan a shot. |
| Ice Cream Machine | Freeze shockwave zoning | Every food lands with an expanding ring of ice: anyone it catches on the ground is frozen. | Only the wave freezes (not the food in flight), and it can be jumped. |
| Popcorn Popper | 5-stage cluster cascade | The food flies twice as big and bursts into minis of itself that burst again, five ever-faster rounds in all. | The giant food is big and easy to see coming, and the outer rings unfold over a moment. |

In the game they're the everyday utensil's model recoloured: its steel and dark trim lime green, its body teal
blue (no crown, nothing floating round your head); their flat icon is the everyday art in a lime and teal ring.

## In the game

Since prototype 0.16 every utensil works with every food you can throw, including cheese
wheels, watermelons, bananas, pineapples, grapes and blueberries (see the prototype README for
how each kind of food is handled), and six of them also change the banana peel trap. Utensils
arrive in parachuting delivery boxes, and since 0.17 you can carry three and switch between them
(6, 7, 8 or R on a keyboard; the utensil plate in the bottom-right corner on a phone). In the game the utensils are 3D models (`prototype/src/utensil-models.js`) in the food's
style rather than this flat art, and the one in use is held in the Titan's left hand. The in-game descriptions are slightly more precise than
the one-liners above (they give the exact numbers).

## Art style

Every asset uses the same rules so the set reads as one family: a deep plum outline (`#2b1633`),
glossy gradients with white highlights, a cartoon face on the utensil, and a soft ground shadow.
The food is drawn with the same shapes in every asset (tomato, banana, blueberry and so on),
so players recognise it under the utensil's effect.
