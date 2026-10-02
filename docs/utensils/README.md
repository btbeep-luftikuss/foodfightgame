# Utensil Buffers

Twenty support utensils for Kitchen Chaos: Tiny Titans Food Fight. A utensil never replaces the food:
the food stays the projectile, keeps its own look and effect, and the utensil adds one boost at one cost.

- `svg/`: one transparent 400×400 SVG per utensil (the source art)
- `png/`: the same art as transparent 512×512 PNGs
- `build.mjs`: draws every SVG; run `node docs/utensils/build.mjs` after changing it

| # | Utensil | Role | Shown with | Buff | Trade-off |
|---|---------|------|------------|------|-----------|
| 01 | Knife | Rapid-Fire Chopper | Tomato | Chops your food into a rapid stream of bite-size pieces; back-to-back hits stack the food's own effect. | Burns through ammo fast, and each piece hits softer than a whole food. |
| 02 | Ice Cream Machine | Cryo Converter | Banana | Coats your food in soft-serve: it arcs slowly, freezes on hit and leaves a frost zone with the food's effect. | Takes a moment to churn, and the frozen shot flies slowly enough to dodge. |
| 03 | Spoon | Shotgun Burst | Blueberries | Scoops a heap of your food and flings it as a tight cone of pellets. | Each fling uses a big scoop of ammo, and the pellets spread wide at range. |
| 04 | Blow Torch | Incendiary Charge | Pineapple | Hold for 3 seconds to set your food ablaze for heavy burn damage over 3 seconds. | You stand exposed while charging, and the torched food is used up on impact. |
| 05 | Whisk | Vortex Spinner | Grapes | Whips your food into a spinning vortex that tugs enemies in and hits them again and again. | The vortex drifts slowly and fades after a few seconds, so timing matters. |
| 06 | Blender | Particle Stream | Tomato | Purees your food into a pressure jet that coats the floor with the food's effect. | You move slower while spraying, and the jet drains ammo every second. |
| 07 | Rolling Pin | Kinetic Disc Ricochet | Cookie | Flattens your food into fast discs that ricochet off walls with full effect and knockback. | Discs hit lighter, and a bad angle can bounce one straight back at you. |
| 08 | Microwave | Charged Plasma | Cheese | Charges your food for 1–2 seconds into a glowing orb that detonates with splash damage. | You must charge it first, and holding too long overcharges it so it pops on you. |
| 09 | Grater | Flechette Cloud | Carrot | Shreds your food into a dense, fast cloud that tears through groups up close. | The shreds lose power quickly with distance and chew through ammo. |
| 10 | Spatula | Ricochet Crit | Jelly | Flips your food for a guaranteed critical hit that can bank off walls. | The crit only lands on a well-aimed flip; miss the angle and the shot is wasted. |
| 11 | Deep Fryer | Napalm Coater | Chili | Coats your food in hot oil that leaves burning slicks carrying the food's effect. | The slicks are slippery for you too, and the fryer overheats if used back to back. |
| 12 | Mortar & Pestle | Powder Mortar | Ice | Grinds your food into powder shells that lob far and leave lingering clouds of its effect. | The shells fly slowly, and wind can blow the cloud away from its target. |
| 13 | Toaster | Scorched Bounce | Cheese | Toasts your food crispy-hot: it bounces twice and leaves a scorched trail. | Each bounce hits a little softer, and it stops after two. |
| 14 | Colander | Piercing Stream | Soda | Strains your food into a needle-tight stream that pierces through several enemies in a line. | The recoil slows you while firing, and the thin stream needs precise aim. |
| 15 | Cotton Candy Machine | Sticky Web | Blueberries | Spins your food into sweet, sticky webs that slow and trap enemies. | Webs take a moment to set, and enemies can burn them or wash them off. |
| 16 | Popcorn Popper | Cluster Burst | Watermelon | Heats your food until it pops mid-flight into a cluster of exploding pieces. | The short fuse can pop it early, and the pieces scatter in random directions. |
| 17 | Peeler | Layered Multi-Stage | Banana | Each hit on the same target peels off another layer for bigger and bigger damage. | Early layers hit softly, and after the last layer it must cool down before peeling again. |
| 18 | Mixer | Hybrid Combiner | Chili + Ice | Blends two different foods into one projectile that carries both effects. | Uses two foods per shot and takes longer to prepare. |
| 19 | Oven Mitt | Power Throw | Carrot | Hurls your food far faster and makes it immune to status effects in flight. | Long cooldown between throws, and the mitt overheats if you push it. |
| 20 | Pan | Alt-Ability Activator | Soda | Slams your food to trigger its special ability on demand. | Medium cooldown, and the slam roots you in place for a moment. |

## In the game

Since prototype 0.16 every utensil works with every food you can throw, including cheese
wheels, watermelons, bananas, pineapples, grapes and blueberries (see the prototype README for
how each kind of food is handled), and six of them also change the banana peel trap. Utensils
arrive in parachuting delivery boxes, and since 0.17 you can carry three and switch between them
(6, 7, 8 or R on a keyboard; the utensil plate in the bottom-right corner on a phone). The in-game descriptions are slightly more precise than
the one-liners above (they give the exact numbers).

## Art style

Every asset uses the same rules so the set reads as one family: a deep plum outline (`#2b1633`),
glossy gradients with white highlights, a cartoon face on the utensil, and a soft ground shadow.
The food is drawn with the same shapes in every asset (tomato, banana, blueberry and so on),
so players recognise it under the utensil's effect.
