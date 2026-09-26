# Kitchen Chaos: Tiny Titans Food Fight — Game Design Document

| | |
|---|---|
| **Version** | 0.1 (first complete draft) |
| **Date** | 2026-09-26 |
| **Status** | Pre-production: for review |
| **Genre** | Third-person physics-driven food-fight battle royale |
| **Players** | 50–100 per battle royale match; 16–32 in arena modes |
| **Platforms** | PC (Steam / Epic), PlayStation 5, Xbox Series X\|S, with full cross-play |
| **Target rating** | ESRB E10+ / PEGI 7 (cartoon slapstick, no blood, no meat, no real weapons) |

---

## Table of Contents

1. [Vision and Pillars](#1-vision-and-pillars)
2. [Scale, World Units and Fiction](#2-scale-world-units-and-fiction)
3. [Core Gameplay Loop](#3-core-gameplay-loop)
4. [Player Character and Movement](#4-player-character-and-movement)
5. [Combat Model: Throwing, Damage and Status Effects](#5-combat-model-throwing-damage-and-status-effects)
6. [The 30 Foods](#6-the-30-foods)
7. [Balancing Guidelines](#7-balancing-guidelines)
8. [Cooking, Combining and Environmental Interactions](#8-cooking-combining-and-environmental-interactions)
9. [Map: The Grand Kitchen](#9-map-the-grand-kitchen)
10. [Game Modes](#10-game-modes)
11. [Graphics, VFX and Performance](#11-graphics-vfx-and-performance)
12. [Technical Architecture](#12-technical-architecture)
13. [Multiplayer Services and Social Features](#13-multiplayer-services-and-social-features)
14. [UI / UX](#14-ui--ux)
15. [Audio](#15-audio)
16. [Progression, Cosmetics and Monetization](#16-progression-cosmetics-and-monetization)
17. [Accessibility](#17-accessibility)
18. [Implementation Roadmap](#18-implementation-roadmap)
19. [Risks and Mitigations](#19-risks-and-mitigations)
20. [Open Questions](#20-open-questions)

---

## 1. Vision and Pillars

### Elevator pitch

You're a Tiny Titan, a frog-sized hero dropped into a gigantic kitchen with 99 others. The only weapons are food. Lob tomatoes, snipe with carrots, trip rivals on banana peels, surf a butter slick off a counter the size of a football field, and be the last one standing when the Soap Tide washes the kitchen clean.

### Design pillars

Every design and technical decision is tested against these five pillars, in priority order.

1. **Every throw is a spectacle.** Each launch and impact produces instant, satisfying visual and audio feedback: squash, splat, juice, crumbs, steam. A missed throw still leaves something funny behind.
2. **Readable chaos.** The screen can be full of food, but players must always be able to read who threw what, what it does, and how to counter it. Clarity beats particle count.
3. **Tiny hero, giant world.** The kitchen is a vertical playground. Counters are plateaus, cabinets are skyscrapers, drawers are hideouts. Scale should be felt every second.
4. **Performance is a feature.** A stable 60 FPS on mid-range hardware (120+ on high-end) is a shipping requirement, not a goal. Any effect that breaks the budget is cut or scaled.
5. **Silly, never cruel.** Slapstick tone, no gore, no meat, no real weapons. Eliminations are "splat-outs". Humor comes from physics and systemic interactions.

### What this game is not

- It is not a gun game with food skins. Foods are mechanically distinct, with arcs, bounces, stickiness and physics.
- It is not a simulation. Physics serves fun and readability. Where true simulation would hurt performance or netcode (fluids, soft bodies), we use gameplay-faithful approximations (see §11.4).

---

## 2. Scale, World Units and Fiction

### 2.1 Fiction

The Tiny Titans are a league of tiny competitors who hold their championship each night in the **Grand Kitchen**, a fantastical giant's manor kitchen. Food "rations" are pocket-sized and scattered by the kitchen's mischievous staff. At the end of each round the kitchen's self-cleaning system unleashes the **Soap Tide**.

### 2.2 World scale

| Concept | Value |
|---|---|
| Scale factor | **1 : 40**: a real 1 m object is 40 m to a Titan |
| Player height | 1.8 m in engine units (real-world equivalent: ~4.5 cm, frog-sized) |
| Gravity | Standard -9.8 m/s² applied to the *player-scale* world, so movement feels normal and the world feels huge |
| Kitchen footprint | Real 40 m × 40 m → **1.6 km × 1.6 km** playable footprint |
| Vertical tiers | Floor (0 m), Counter (36 m), Upper cabinets and shelves (58–90 m), Ceiling and pot rack (100–110 m) |
| Effective traversable area | ~4 km² once vertical tiers are counted, comparable to large BR maps |

Landmark sizes at 1:40:

| Object | Real size | Titan-scale size | Feels like |
|---|---|---|---|
| Kitchen island top | 3 m × 1.5 m | 120 m × 60 m | A football field |
| Counter height | 0.9 m | 36 m | A 12-storey building |
| Refrigerator | 1.8 m | 72 m | A skyscraper |
| Dinner plate | 27 cm | 10.8 m | A pavilion roof |
| Drawer | 50 × 40 × 15 cm | 20 × 16 × 6 m | A warehouse |
| Toaster | 30 cm | 12 m | A two-storey launch tower |

### 2.3 Food scale rule (resolves a scale contradiction)

At true 1:40 scale a tomato would be 2.8 m across, larger than the player. We use two classes of food.

- **Loot foods** are *hand-held scale* (0.3–1.5 m relative to the player). A tomato is volleyball-sized; a watermelon is a 1.4 m ball you shove and kick. This keeps throwing readable and animation-friendly.
- **Landmark foods** are true-scale set pieces: a 110 m bunch of bananas, a 12 m strawberry, a cheese block the size of a house. They are terrain, cover and **harvest nodes**. Damaging one drops 3–5 loot foods of that type. This makes environmental destruction worth doing.

---

## 3. Core Gameplay Loop

### 3.1 Moment-to-moment (5–30 s)

**Spot → Pick up → Choose → Throw → Read the result → Reposition.**
Every food has a *Primary* (launch) and most have an *Alt* (place, eat, tear, ride, grapple). Players juggle up to five foods and look for combos (freeze then snipe, butter slick then lettuce knockback into a burner).

### 3.2 Match loop (18–22 min)

1. **Pre-game lobby, "The Cutting Board" (60 s).** All foods are free and infinite; no damage persists. Players warm up and emote.
2. **The Drop.** Players ride the **Gravy Blimp**, a serving tray lifted by balloons, across the ceiling. They jump out and glide down on **napkin gliders** (cosmetic slot).
3. **Early game.** Loot the landing POI: floor spawns, containers (lunchboxes, jars, drawers), and landmark food harvest.
4. **Mid game.** Cook and combine at stations, rotate ahead of the Soap Tide, and fight over **Grocery Bag supply drops** (high-rarity loot).
5. **End game.** The final circles push players into tight vertical spaces where environmental kills (burners, floods, knockback) matter most.
6. **Victory: "Chef's Kiss."** The winner gets a plating pose on a giant dinner plate with confetti sprinkles.

### 3.3 The Soap Tide (shrinking zone)

A wall of volumetric soap foam closes the play area in phases. It deals damage over time and applies *Wet*, which cleanses sticky effects but makes you easier to freeze. There are 8 phases:

| Phase | Wait | Shrink | Damage per second | Notes |
|---|---|---|---|---|
| 1 | 150 s | 90 s | 1 | Covers ~40% of the map |
| 2 | 120 s | 75 s | 2 | |
| 3 | 100 s | 60 s | 3 | Supply drops begin |
| 4 | 90 s | 50 s | 5 | Tide may cover a whole tier (floor flooded) |
| 5 | 75 s | 45 s | 7 | |
| 6 | 60 s | 40 s | 9 | |
| 7 | 45 s | 35 s | 11 | |
| 8 | 30 s | 60 s | 15 | Closes completely |

The Soap Tide can be **vertical**. In some phases it rises from the floor as well as closing inward, forcing fights upward onto counters and shelves. This is unique to our map and should be heavily showcased.

### 3.4 Elimination, knock-downs and revives

- **Health:** 100 HP.
- **Shield:** up to 100 **Glaze**, a sugar-shell shield. Glaze absorbs damage first.
- **Solo:** reaching 0 HP means an immediate **Splat-Out**. The player becomes a spectator and their foods drop as a loot pile.
- **Duo and Squad:** reaching 0 HP means **Sauced** (down-but-not-out). The player crawls, can't throw, and bleeds out over 30 s. A teammate revives them with a 5 s **Napkin Wipe**.
- **Reboot:** a fully eliminated teammate drops a **Recipe Card**. A teammate carries it to a **Spice Rack Station** to bring them back at 50 HP with no inventory.

---

## 4. Player Character and Movement

### 4.1 Character

- Uniform hitbox across all skins: a body capsule (radius 0.4 m, height 1.8 m) plus a head sphere (radius 0.22 m) for "face hits".
- **Third-person camera** with an over-shoulder aim mode. First-person is only offered as a Carrot-scope view.
- **Readability rule:** skins cannot change silhouette size, and cannot use colors that camouflage inside status splats. For example, an all-tomato-red skin is not allowed.

### 4.2 Movement kit

Tuned for a tiny, agile, frog-like feel.

| Action | Value | Notes |
|---|---|---|
| Walk | 4.5 m/s | |
| Sprint | 7.0 m/s | Unlimited, except while carrying heavy food |
| Crouch | 2.5 m/s | Quieter footsteps |
| Slide | Burst to 9 m/s, decays over 1 s | From sprint; longer on slick surfaces |
| Jump | 3.5 m apex | About 2× body height |
| **Titan Hop** (charged jump) | Up to 6 m apex | Hold jump 0.5 s; 3 s cooldown |
| **Duck & Roll** (dodge) | 5 m burst | 1.5 s cooldown. No invulnerability frames, which keeps netcode simple. Dislodges one attached sticky bomb. |
| Mantle | Ledges up to 2.4 m | Automatic when moving forward |
| **Wall climb** | 3 m/s, 6 s grip stamina | Only on *Grippy* surfaces: wood, cardboard, cloth, sponge, rug, bread |
| **Napkin glide** | Deploys after 25 m of free fall | Prevents trivial vertical escapes on short drops |
| Fall damage | **None** | Tiny creatures survive falls. Falls over 40 m cause a 0.6 s *Splat* stun, avoided by pressing crouch at landing (a *Roll Landing*). |

### 4.3 Surface physics

The game tracks a **surface type** (material) and a **surface state** (dynamic: see §5.4).

| Surface | Friction | Grippy (climbable) | Notes |
|---|---|---|---|
| Tile, laminate | Normal | No | Default floor |
| Stainless steel | Normal | No | Reflective; ringing footsteps |
| Wood | Normal | Yes | Cabinets, cutting boards |
| Cardboard | Normal | Yes | Cereal boxes; destructible |
| Cloth, rug | High | Yes | Tablecloths are climbable walls |
| Ceramic, glass | Slightly low | No | Plates, mugs, glasses; destructible |
| Slick state (butter, ice, yolk) | Very low | No | Momentum skating: acceleration -70%, top speed +30% |

### 4.4 Traversal devices in the world

- **Toaster launch pads:** timed pop, 30 m vertical launch.
- **Spatula catapults:** step on the handle to launch in an arc.
- **Hood fan updraft:** a glide column to the ceiling tier.
- **Coffee-machine steam vents:** small updrafts.
- **Lazy Susans:** rotating platforms.
- **Drawer elevators:** pull a handle to slide a drawer out as a ramp or bridge.
- **Hanging utensils:** ladles and whisks on the pot rack act as swing points for Spaghetti grapples.
- **Rideable foods:** Donut (vehicle), Watermelon (kick-roll), Butter (self-slide).

---

## 5. Combat Model: Throwing, Damage and Status Effects

### 5.1 Launch profiles

Every food uses one of six launch profiles. This lets animation, prediction and netcode share code paths.

| Profile | Behaviour | Examples |
|---|---|---|
| **Lob** | Ballistic arc, hold to charge power | Tomato, Egg, Broccoli, Pineapple |
| **Line** | Fast, flat, low gravity, precision | Carrot, Hard-boiled Egg, Avocado Pit |
| **Spray** | Rapid-fire or scatter pellets | Corn Cob, Grapes |
| **Return** | Curving boomerang path | Banana, Pizza Slice |
| **Roll** | Ground-hugging physics body | Watermelon, Cheese Wheel, Donut |
| **Seek** | Homing | Chili (manual lock), Cookie (auto-seek) |

In addition, **Place** actions (deploy on a surface) and **Self** actions (eat, ride, slide, grapple) are handled as Alt actions.

**Throw rules:**

- **Charge:** hold to wind up from 60% to 100% launch speed over the food's charge time.
- **Trajectory preview:** Lob foods show a short predictive arc that covers only the first 40% of the path, so long throws remain a skill.
- **Recovery:** the time between throws is 0.4–1.2 s depending on the food.
- **Swap lockout:** switching to a *different* food adds a 0.35 s wind-up. This prevents "quick-swap" burst exploits.
- **Carrying heavy food** (Watermelon, Cheese Wheel, Cereal Box used as a shield) reduces movement speed and disables sprint.

### 5.2 Damage rules

| Rule | Value |
|---|---|
| Effective HP | 100 HP + up to 100 Glaze = 200 |
| Target time-to-kill (TTK), full 200 EHP, 1v1, competent play | **3–6 s** at mid range; about 2 s with a well-executed combo |
| Face-hit multiplier | Only on *Line* foods: ×1.5 standard, ×1.75 for Carrot |
| Splash falloff | Linear from 100% at the center to 40% at the edge |
| Self-damage | None. Knockback still applies to yourself; Soda deliberately exploits this. |
| Team damage | Off in BR. In team modes: damage off, status effects on at 50% strength. |
| Environmental damage | Burners 20/s, Soap Tide per phase, grease fire 6/s |

The slower TTK is deliberate. Projectile travel time and chaos call for more counterplay time than a hitscan shooter allows.

### 5.3 Rarity

Rarity tiers are named for the fiction and color-coded consistently with genre convention.

| Tier | Name | Color | Damage, healing and deployable HP | Stack |
|---|---|---|---|---|
| 1 | Fresh | Gray | ×1.00 | Base |
| 2 | Ripe | Green | ×1.07 | Base |
| 3 | Gourmet | Blue | ×1.14 | +1 for stackable foods |
| 4 | Chef's Special | Purple | ×1.21 | +1 |
| 5 | Michelin | Gold | ×1.28 | +2 |

**Crowd control (CC) durations never scale with rarity.** Rarity makes a food stronger, not more oppressive.

### 5.4 Status effects

| Status | Type | Effect | Typical sources | Cleansed by |
|---|---|---|---|---|
| **Sticky** | Soft CC | Movement slow, additive, **capped at 50%** total | Tomato, Grapes, Broccoli, Soda, Cookie crumbs, Chocolate, Cheese | Wet, Duck & Roll (-1 s) |
| **Slick** | Surface | Momentum skating (§4.3) | Butter, Ice, Raw Egg, Tomato drips | Milk puddle, Burning (melts ice into Wet) |
| **Tripped** | Hard CC | Knocked down for 1.0 s, sliding in the direction of motion | Banana peel | n/a (short) |
| **Rooted** | Hard CC | Can't move; **can still aim and throw** | Jelly, Spaghetti net, Onion Rings | Teammate pluck, taking 40 damage |
| **Frozen** | Hard CC | Can't act | Ice Cube | Any hit shatters the ice for +15 bonus damage; Burning |
| **Burning** | Damage over time (DoT) | 4 dmg/s plus a heat-shimmer screen edge | Chili, burners, grease fire, Fondue | Wet, Milk |
| **Blinded** | Vision | Yolk overlay, max 70% opacity with a clear center hole. Never full black. | Raw Egg face hit | Wet, time |
| **Teary** | Aim | Aim sensitivity -40%, sway, edge blur | Onion | Leaving the cloud plus 2 s |
| **Poisoned** | DoT | 6 dmg/s while in the cloud | Toxic Toadstool | Leaving the cloud |
| **Acid** | DoT | 4 dmg/s, **double damage against Glaze** | Pickle, Yogurt (enemy side) | Wet |
| **Knockback / Stagger** | Physics | Impulse plus up to 0.4 s stagger | Lettuce, Soda, Cob Bat, Donut, Watermelon | n/a |
| **Revealed** | Info | Outline visible to enemies for 3 s | Warm Cookie crumbs | Time |
| **Wet** | State | Cleanses Sticky, Burning, Blinded and Acid; removes attached bombs; **Frozen lasts +50%** while Wet | Sink, dishwasher jets, Soap Tide | Time (5 s) |
| **Sugar Rush / Sugar Crash** | Buff / debuff | +25% speed and +40% jump, then -10% speed | Eating Chocolate | Time |

**Crowd-control fairness rules (non-negotiable):**

1. **Diminishing returns:** hard CC (Tripped, Rooted, Frozen) share one diminishing-returns bucket. The second application within 6 s lasts 50%; the third within 6 s is immune.
2. **Hard-CC ceiling:** no player can be hard-CC'd for more than 2.5 s in any 6 s window.
3. **Slow cap:** total slow never exceeds 50%.
4. **Vision effects are never absolute.** Blinded, Teary and fog always leave some readable information, such as teammate outlines, hit markers and audio.
5. **Every attached effect is visible to the victim** with an on-body indicator, a HUD icon and a distinct sound.

---

## 6. The 30 Foods

No meat of any kind. Every food has a distinct *role*, a *counterplay*, and a *signature feedback moment*.

### 6.1 Summary table

| # | Food | Role | Profile | Rarity band | Stack | Direct / Area damage | Signature effect |
|---|---|---|---|---|---|---|---|
| 1 | Tomato | Splash / Tracking | Lob | Fresh–Chef's | 4 | 25 / 10 | Juiced slow + drip trail |
| 2 | Banana | Boomerang / Trap / Heal | Return | Fresh–Chef's | 2 | 28 (+18 on return) | Eat → peel trap |
| 3 | Egg (Raw) | Area control | Lob | Fresh–Gourmet | 3 | 15 / — | Slick yolk puddle, Blinded |
| 3b | Egg (Hard-boiled) | Precision | Line | Ripe–Michelin | 3 | 45 (×1.5 face) | High-damage precision shot |
| 4 | Watermelon | Heavy bomb | Roll / Lob | Gourmet–Michelin | 1 | 60 / 4 × 15 chunks | Splits into bouncing chunks |
| 5 | Chili Pepper | Homing DoT | Seek (manual lock) | Ripe–Chef's | 3 | 15 + 16 burn | Burning + heat haze |
| 6 | Ice Cube | Control | Lob | Ripe–Chef's | 3 | 10 / — | Freeze or ice rink |
| 7 | Jelly Cube | Mobility / Root | Lob (bounce) / Place | Ripe–Chef's | 2 | 12 | Trampoline or root |
| 8 | Pizza Slice (veg) | Piercing boomerang | Return | Gourmet–Michelin | 1 (4 uses) | 22 × up to 3 targets | Catch to reuse |
| 9 | Broccoli Floret | Cluster sticky bomb | Lob (sticky) | Ripe–Chef's | 2 | 20 + 5 × 10 | Green-paste slow |
| 10 | Cheese Wheel | Mobile shield | Roll / Self | Chef's–Michelin | 1 | 40 ram | 300 HP shield; melts into goo |
| 11 | Grape Cluster | Scatter shot / Heal | Spray | Fresh–Gourmet | 2 | 8 × 7 | Bouncing pellets; eat for +5 |
| 12 | Bread Loaf | Builder / Frisbee | Place / Line | Fresh–Gourmet | 1 | 4 × 18 slices | Bridge or torn slices |
| 13 | Avocado | Smoke then precision | Lob → Line | Ripe–Chef's | 2 | Smoke / 50 pit | Guac smoke, then pit shot |
| 14 | Pineapple | Zone-denial grenade | Lob (sticky) | Chef's–Michelin | 1 | 35 + 8/s field | Spike field |
| 15 | Cereal Box | Carry cover / Distraction | Self / Place | Ripe–Gourmet | 1 | — | Shield, wall, decoy cloud |
| 16 | Milk Carton | Smoke / Extinguish | Lob | Fresh–Gourmet | 2 | 5 | Fog; puts out fires |
| 17 | Butter Stick | Mobility / Slick trap | Lob / Self | Ripe–Chef's | 3 | 5 | Slick trail; self-slide |
| 18 | Soda Can | Explosive / Rocket jump | Lob / Self | Ripe–Chef's | 2 | 20–40 | Shake-to-charge; Fizz Jump |
| 19 | Cookie | Auto-seeker | Seek (auto) | Fresh–Gourmet | 3 | 18 | Shoot-down-able seeker |
| 20 | Carrot | Sniper | Line | Ripe–Michelin | 4 | 55 (×1.75 face) | Scope + lens glint |
| 21 | Onion | Tear gas | Lob | Ripe–Gourmet | 2 | 3/s | Teary aim debuff |
| 22 | Mushroom | Bounce pad / Poison | Place / Lob | Fresh–Chef's | 2 | 6/s (toxic) | Trampoline or toxic cloud |
| 23 | Spaghetti Bundle | Net / Grapple | Line / Self | Ripe–Chef's | 1 (3 charges) | 5 | Tangle root or rope swing |
| 24 | Cupcake | Shield bubble / Heal | Lob / Eat | Gourmet–Chef's | 2 | — | 300 HP dome; eat +25 |
| 25 | Pickle | Sticky bomb, anti-shield | Lob (sticky) | Ripe–Chef's | 2 | 45 + acid | Shreds Glaze |
| 26 | Corn Cob | Rapid fire / Melee | Spray → Melee | Fresh–Gourmet | 1 (30 kernels) | 6/kernel; bat 35 | Empty cob becomes a bat |
| 27 | Yogurt Cup | Team heal / Denial | Lob | Gourmet–Michelin | 1 | 3/s to enemies | Heal puddle |
| 28 | Lettuce Head | Knockback / Cover | Lob / Place | Fresh–Ripe | 1 | 20 | Huge knockback |
| 29 | Donut | Vehicle / Ram | Roll / Self | Gourmet–Chef's | 1 | 30 / 25 ride ram | Rideable |
| 30 | Chocolate Bar | Trail DoT / Buff | Lob / Eat | Ripe–Chef's | 2 | 4/s trail | Sugar Rush when eaten |

### 6.2 Detailed food specifications

Values are for the **Fresh** tier. Speeds are in player-scale m/s. "Upgrades" refer to §8.

---

#### 1. Tomato: *Splash / Tracking* (common staple)
- **Primary (Lob):** 30 m/s, 0.4 s charge, 0.6 s recovery. Direct hit 25; splash 10 within 2.5 m.
- **Effect:** *Juiced* (Sticky -20%, 3 s). Victims **drip a slick red trail for 5 s**, which reveals their escape path and can trip careless pursuers.
- **Counterplay:** Duck & Roll through the arc; Wet cleanses.
- **Upgrades:** Stove → *Roasted Tomato* (juice also Burns for 3 s). Blender → *Salsa Bomb*.
- **Feedback:** squash-stretch at impact, a seed-and-juice burst with ribbon streaks, a lingering red splat decal, and a wet "SPLUT".

#### 2. Banana: *Boomerang / Trap / Heal*
- **Primary (Return):** curves out up to 35 m and returns. 28 damage outbound, 18 on the return pass (it can hit twice). Catching it refunds it.
- **Alt (Eat, 1 s):** +15 HP. You keep the **Peel**.
- **Peel (Place):** a classic slip trap. An enemy stepping on it is *Tripped* for 1.0 s and slides 6 m in their direction of travel. Maximum 2 active peels per player, 40 s lifetime. Peels are visible within 15 m and can be shot away.
- **Counterplay:** watch the ground; shoot peels; the returning banana can be dodged by strafing.
- **Feedback:** a comic "slip" whistle, a cartoon star burst and a spinning peel.
- *Note:* the brief says "high-friction trip hazard". We implement the genre-classic *slip*, which is funnier and reads instantly.

#### 3. Egg: two variants that spawn separately
- **Raw Egg (Lob):** 15 direct damage. Creates a **4 m Slick yolk puddle for 8 s**. A face hit applies *Blinded* for 1.5 s.
- **Hard-boiled Egg (Line):** 55 m/s, 0.9 s recovery, **45 damage, ×1.5 on a face hit**. It bounces once if it misses.
- **Upgrade:** Stove → Raw Egg becomes Hard-boiled (5 s cook).
- **Counterplay:** Raw Egg is slow and arcing; Hard-boiled has a small hitbox but a long recovery.
- **Feedback:** a yolk overlay drips down the screen edges; a hard-boiled hit makes a satisfying "tok".

#### 4. Watermelon: *Heavy bomb*
- **Carrying:** -15% movement, no sprint.
- **Primary (Roll / Kick):** a physics roll. It deals **50 damage plus knockback** on contact when moving at 8 m/s or faster. Gravity-driven, so it is devastating downhill and off counters.
- **Alt (Heave, a short Lob at 12 m/s):** 60 damage on direct impact.
- **Split:** on a hard impact, or when shot for 60 damage, it splits into **4 bouncing chunks** that deal 15 each.
- **Counterplay:** it's loud and big; shoot it early to split it harmlessly.
- **Feedback:** a rumbling roll audio, a massive pink-red splash, seeds spraying and chunks tumbling.

#### 5. Chili Pepper: *Homing burn*
- **Primary (Seek, manual lock):** hold aim on a target within a 15° cone and 45 m for 0.35 s to lock. Flight speed 32 m/s, turn rate 110°/s.
- **Hit:** 15 damage plus *Burning* (4 damage per second for 4 s = 16). Applies a heat-shimmer screen edge. **Ignites** butter trails and grease.
- **Counterplay:** break line of sight; make a sharp perpendicular dodge (the turn-rate limit makes this work); Milk or Wet extinguishes the burn.
- **Upgrade:** Stove → *Fire-Roasted Chili* (the impact leaves a 3 m fire patch for 5 s).
- **Feedback:** an ember trail with a sizzling whistle; the target is lit with an orange rim light.

#### 6. Ice Cube: *Control*
- **Primary on a surface:** creates a **6 m ice rink for 8 s** (Slick).
- **Primary on a player:** *Frozen* for 1.2 s, or 1.8 s if the target is Wet. The first hit on a frozen player **shatters** the ice for +15 bonus damage and ends the freeze.
- **Interactions:** Fire + Ice → a **steam cloud** that blocks vision for 4 s.
- **Counterplay:** diminishing returns; teammates can shatter a frozen ally early to free them.
- **Feedback:** frost crawling over the target, crystalline shatter particles and a glassy "crink".

#### 7. Jelly Cube: *Mobility / Root*
- **Primary (Lob):** bounces up to 4 times off surfaces, which allows bank shots. A direct hit applies *Rooted* for 1.0 s, then -30% movement for 2 s.
- **Alt (Place):** a 3 × 3 m **trampoline** that launches players 12 m. 150 HP, lasts 30 s.
- **Interactions:** Jelly + Ice → a **frozen jelly block**, a solid wall with 250 HP.
- **Feedback:** a wobbling jiggle shader and a "boing" pitch that rises with bounce count.

#### 8. Pizza Slice (veggie): *Piercing boomerang*
- **Primary (Return):** spins out 25 m, **pierces up to 3 targets** for 22 damage each, then returns.
- **Durability:** 4 throws. Catching the returning slice keeps it; an uncaught slice lands on the ground where **anyone can pick it up**.
- **Counterplay:** crouch under the flat spin plane; predictable return path.
- **Feedback:** a cheese-string trail and a "whirr" that Doppler-shifts as it passes.

#### 9. Broccoli Floret: *Cluster sticky bomb*
- **Primary (Lob, sticky):** attaches to surfaces or players, 1.5 s fuse.
- **Detonation:** 20 center damage, then **5 florets scatter** within 3 m for 10 damage each, leaving *Green Paste* (Sticky -30%, 3 s).
- **Counterplay:** Duck & Roll dislodges it if attached; Wet removes it.
- **Feedback:** a small fuse "puff", then a green confetti burst.

#### 10. Cheese Wheel: *Mobile shield*
- **Alt (Push):** roll the wheel ahead of you as a **frontal shield with 300 HP**. -25% movement while pushing.
- **Primary (Launch):** release it as a rolling ram for 40 damage plus knockback.
- **Melting:** below 150 HP it drips a goo trail (-25% slow). When destroyed it leaves a **4 m melt pool for 6 s** (Sticky -35%).
- **Upgrade:** Oven → *Fondue Wheel* (the melt pool also Burns).
- **Counterplay:** flank it; lob over it (Lob foods beat shields).
- **Feedback:** the cheese visibly sags and strings as it loses HP.

#### 11. Grape Cluster: *Scatter shot / Heal*
- **Primary (Spray):** 8 grapes in a 12° cone at 45 m/s, 7 damage each (56 maximum at point-blank). Each grape bounces once and pops into a small Sticky splat (-10% for 1.5 s, stacking to -30%).
- **Alt (Eat one grape, 0.5 s):** +5 HP, consuming one pellet.
- **Upgrade:** Freezer → *Frozen Grapes* (9 damage per pellet and a chill slow instead of splat).
- **Feedback:** "pop-pop-pop" and purple mist spritz.

#### 12. Bread Loaf: *Builder / Frisbee*
- **Alt A (Tear, 0.6 s):** tears into **4 slices**, which stack separately. Slices fly flat like a frisbee with a slight curve for 18 damage.
- **Alt B (Place):** a **bridge or platform 8 × 3 m** with 400 HP that lasts 45 s. Maximum 2 per player.
- **Upgrade:** Toaster → *Toast* (slices deal 27 damage plus a crunch knockback).
- **Feedback:** a soft "fwump" when placed; crumb clouds when damaged.

#### 13. Avocado: *Smoke, then precision*
- **Primary (Lob):** smashes into **Guac Smoke** (8 m radius, 10 s, green, blocks vision).
- **Automatic:** the **Pit** is added to your inventory.
- **Pit (Line):** 60 m/s, **50 damage, ×1.5 face**, single use.
- **Design intent:** a smoke-then-snipe two-step that rewards planning.
- **Feedback:** a creamy "splorch" and a green volumetric plume.

#### 14. Pineapple: *Zone-denial grenade*
- **Primary (Lob, sticky):** 2.0 s fuse, then a 35-damage blast within 3 m.
- **Spike Field:** a 5 m radius for 5 s that deals 8 damage per second and slows 15%.
- **Counterplay:** long, visible fuse with a distinct ticking rattle; leave the zone.
- **Feedback:** spikes erupt from the ground in a crown pattern, with a golden juice mist.

#### 15. Cereal Box: *Carry cover / Distraction*
- **Alt A (Carry):** a frontal shield with 250 HP. -20% movement, no throwing while carrying; drop it instantly.
- **Alt B (Place):** a wall with the same HP. Players can climb it (cardboard is Grippy) or hide inside.
- **Primary (Pour):** a **cereal cloud** (6 m radius, 8 s) of partially vision-blocking flakes that also generates **decoy footstep sounds and minimap noise**.
- **Feedback:** a rattling box and flakes tumbling with physics sprites.

#### 16. Milk Carton: *Smoke / Extinguish*
- **Primary (Lob):** a **white fog** with a 10 m radius for 12 s, densest at the center.
- **Extinguish:** removes all Burning, fire patches and grease fire in its radius. It also melts ice rinks back to normal ground.
- **Feedback:** a soft splash and a rolling white fog.

#### 17. Butter Stick: *Mobility / Slick trap*
- **Primary (Lob):** lays a **slick line 12 m × 2 m for 10 s**.
- **Alt (Butter Slide):** you are *Buttered* for 4 s: 1.8× speed, reduced turning, can slide up gentle slopes.
- **Interactions:** Butter + fire → **grease fire line** (6 damage per second for 6 s).
- **Feedback:** glossy smear decals and a squeaky slide sound.

#### 18. Soda Can: *Explosive / Rocket jump*
- **Primary (Shake then Lob):** hold for 0–1.5 s to pressurize. Blast damage scales from 20 to 40 and radius from 3 to 4.5 m, with knockback. Leaves a **sticky soda puddle** (4 m, 6 s, -30%).
- **Alt (Fizz Jump):** pop it underfoot to launch **15 m** in the aim direction. No self-damage. Consumes the can.
- **Upgrade:** Freezer → *Slushie Can* (the puddle becomes an ice rink).
- **Feedback:** the can visibly bulges while shaking; a foamy geyser erupts.

#### 19. Cookie: *Auto-seeker*
- **Primary (Seek, auto):** at launch, acquires the **nearest visible enemy within 30 m**. Flies at 18 m/s with a 90°/s turn rate and a 12 s lifetime.
- **Fragile:** the cookie has **1 HP**, so any projectile destroys it.
- **Hit:** 18 damage plus a crumb patch (3 m, -20% for 4 s).
- **Limit:** maximum 2 active cookies per thrower.
- **Upgrade:** Oven → *Warm Cookie* (crumbs apply *Revealed* for 3 s).
- **Difference from Chili:** Chili is fast, needs aim to lock, and burns. Cookie is slow, fire-and-forget, and can be shot down.

#### 20. Carrot: *Sniper*
- **Primary (Line):** 1.0 s full charge, up to 120 m/s, gravity scale 0.3. **55 damage to the body, ×1.75 face = 96**. It can never one-shot a player at full HP and Glaze.
- **Scope:** 3× zoom while charging.
- **Counterplay:** an **orange lens glint** is visible to targets within 150 m while charging. Long charge.
- **Upgrade:** Freezer → *Icicle Carrot* (+10 damage and a chill slow of 20% for 2 s).
- **Feedback:** a crisp "CHOK" on impact, carrot-shard particles and a long-range hit marker chime.

#### 21. Onion: *Tear gas*
- **Primary (Lob):** a gas cloud (7 m radius, 10 s) that deals 3 damage per second and applies *Teary*: -40% aim sensitivity, sway and edge blur.
- **Interactions:** Onion gas + fire → the cloud **flash-burns off** (10 damage, cloud removed).
- **Upgrade:** Stove → *Onion Rings* (stack 3). A ring projectile that "hoops" the target, *Rooted* for 1.0 s.
- **Feedback:** a shimmering lilac haze; affected players visibly cry cartoon tears.

#### 22. Mushroom: *Bounce pad / Poison*
- **Button Mushroom (Place):** a bounce pad that launches players 15 m and preserves momentum. 100 HP, lasts 45 s.
- **Toxic Toadstool** (a separate purple spawn, Gourmet to Chef's Special) **(Lob):** a poison cloud (5 m, 8 s) that deals 6 damage per second.
- **Interactions:** bounce pad + butter slide = a super-launch.
- **Feedback:** a springy "bwomp"; a purple spore cloud.

#### 23. Spaghetti Bundle: *Net / Grapple*
- **Primary (Line):** a net that expands to 4 m. *Rooted* for 1.2 s, then -40% slow for 2 s.
- **Alt (Grapple):** fires a strand to a surface up to 30 m away to pull or swing. Uses 1 charge; the bundle has 3.
- **Upgrade:** Stove → *Cooked Spaghetti* (the net roots for 1.6 s, **but grapple is disabled** because the strands are too floppy).
- **Feedback:** noodles wrap the target with a spring-physics wobble.

#### 24. Cupcake: *Shield bubble / Heal*
- **Primary (Lob):** a **frosting bubble dome** (5 m radius, 300 HP, 8 s). It blocks projectiles in both directions; players can walk through it.
- **Alt (Eat, 2 s):** +25 HP over 2 s.
- **Upgrade:** Oven → *Double-Frosted* (the dome has 450 HP).
- **Feedback:** a pastel iridescent dome that wobbles when hit.

#### 25. Pickle: *Sticky bomb, anti-shield*
- **Primary (Lob, sticky):** a 2.5 s fuse with fizzing brine audio and visuals. 45 damage within 2.5 m, plus *Acid* (4 damage per second for 3 s, **double damage against Glaze**).
- **Counterplay:** Duck & Roll dislodges it; Wet removes it; a teammate can pluck it off.
- **Feedback:** the pickle swells before popping; green brine splash.

#### 26. Corn Cob: *Rapid fire / Melee*
- **Primary (Spray):** 30 kernels at 10 per second and 70 m/s. **6 damage each**, with spread that increases while firing.
- **When empty:** becomes a **Cob Bat**. 35 melee damage with strong knockback, 0.8 s swing, 10 swings before it breaks.
- **Upgrade:** Stove → *Popcorn Cob* (kernels pop after 15 m into small 1.5 m bursts of 4 damage with light knockback).
- **Feedback:** a staccato "tk-tk-tk"; popped kernels scatter persistently for a few seconds.

#### 27. Yogurt Cup: *Team heal / Denial*
- **Primary (Lob):** a 5 m puddle for 10 s.
  - **Allies and self:** +8 HP per second, up to 60 HP per player per puddle.
  - **Enemies:** *Acid* (3 damage per second) and -25% movement.
- **Upgrade:** Freezer → *Froyo* (grants Glaze instead of HP).
- **Feedback:** team-colored rim glow on the puddle (a readability requirement).

#### 28. Lettuce Head: *Knockback / Cover*
- **Primary (Lob):** 20 damage, a **12 m knockback** and a 0.4 s stagger. This is the premier ring-out tool: knock opponents into burners, floods or the Soap Tide.
- **Alt (Place):** leafy cover with 200 HP for 30 s.
- **Feedback:** a leafy "WHUMP" and leaves fluttering down slowly.

#### 29. Donut: *Vehicle / Ram*
- **Primary (Roll):** 30 damage plus knockback.
- **Alt (Ride):** a vehicle that reaches **20 m/s for 15 s**. Can jump; ramming deals 25 plus knockback. You can dismount at any time, and the donut stays for 10 s for anyone to use.
- **Upgrade:** dip in a Honey Pool → *Glazed Donut* (+20% speed).
- **Feedback:** sprinkles shed at speed; a "wheee" rolling audio layer.

#### 30. Chocolate Bar: *Trail damage / Buff*
- **Primary (Lob):** melts into a **15 m × 2 m sticky trail for 8 s** (-35% slow, 4 damage per second). The trail is twice as long in hot zones (Stove area).
- **Alt (Eat):** *Sugar Rush* (+25% speed and +40% jump for 8 s), followed by *Sugar Crash* (-10% speed for 3 s).
- **Upgrade:** Freezer → *Frozen Chocolate* (shatters into 3 m shrapnel for 25 damage).
- **Feedback:** a glossy molten flow shader; a tooth-sparkle glint when eaten.

---

## 7. Balancing Guidelines

### 7.1 Role coverage

Every loadout of five foods should force trade-offs. The roster is designed so no single role dominates.

| Role | Foods |
|---|---|
| Precision | Carrot, Hard-boiled Egg, Avocado Pit, Bread slices |
| Splash / Area damage | Tomato, Grapes, Watermelon, Soda, Broccoli, Pineapple, Pickle |
| Homing | Chili, Cookie |
| Crowd control | Ice, Jelly, Spaghetti, Onion, Butter, Banana peel, Raw Egg |
| Defense | Cheese Wheel, Cereal Box, Cupcake, Lettuce, Bread bridge |
| Mobility | Donut, Soda (Fizz Jump), Mushroom, Jelly, Spaghetti grapple, Butter slide, Chocolate |
| Sustain | Cupcake, Yogurt, Banana, Grapes, Honey Pools (environment) |
| Close-range damage | Corn Cob (spray and bat), Grapes, Pizza |
| Vision | Avocado, Milk, Onion, Cereal |

### 7.2 Power budget

Each food is assigned a **power budget** from its rarity band. Budget points are spent on:

| Component | Cost |
|---|---|
| Sustained damage per second (DPS), at realistic accuracy | 1 point per DPS |
| Burst (maximum damage within 1 s) | 0.5 points per damage point above 30 |
| Hard CC | 15 points per second |
| Soft CC (slow) | 5 points per second at 30% |
| Area of effect | ×1.3 multiplier on damage components |
| Homing or guaranteed hit | ×1.4 multiplier on damage components |
| Mobility | 10–25 points depending on distance and speed |
| Defense (deployable HP) | 1 point per 20 HP |
| Healing | 1 point per 3 HP |

Targets: Fresh-band foods are about 60 points, Gourmet-band 75, Chef's Special and Michelin 90. The budget is a **starting point for tuning**; telemetry has the final say.

### 7.3 Hard rules

1. **No one-shots.** No single hit can take a player from 200 to 0 EHP. The Carrot face hit maxes at 96 (123 at Michelin).
2. **Every food has visible counterplay.** Telegraphed charge, glint, audio cue, fuse, or a slow projectile.
3. **Hard CC never scales with rarity.**
4. **Homing is weaker per hit** and is limited to 2 active projectiles per thrower.
5. **Sticky bombs are always removable.** Dodge, Wet, or a teammate pluck.
6. **Deployables have HP and a lifetime.** Nothing is permanent. Per-player caps on peels, bridges and pads.
7. **Heals are interruptible.** Eating is cancelled by taking 25 or more damage.
8. **Lob beats shield, Line beats Lob at range, Spray beats close shields.** A soft counter wheel to prevent single dominant strategies.

### 7.4 Loot distribution

- **Spawn weight tiers:** *Staple* (Tomato, Grapes, Banana, Egg, Corn, Cookie, Bread, Lettuce, Milk): 50% of floor spawns. *Tactical* (the remaining Ripe and Gourmet foods): 40%. *Power* (Watermelon, Pineapple, Cheese, Yogurt, Pizza): 10% of floor spawns, and more common in supply drops and containers.
- **Inventory:** 5 hotbar slots. Stack sizes are per food (§6.1).
- **Landing guarantee:** every POI guarantees at least 1 Line food and 1 Sustain food within 30 m of each named landing spot, to reduce "landed with nothing" frustration.

### 7.5 Telemetry targets and live tuning

| Metric | Healthy band | Action if outside |
|---|---|---|
| Share of eliminations per food | 1.5%–8% (an even share is 3.3%) | Tune damage and effect |
| Win rate when held at the final 10 players | Within ±3% of the average | Tune rarity and spawn weight |
| Pick-up rate when seen | 20%–80% | Adjust identity, not just numbers |
| Deaths while hard-CC'd | Under 15% of deaths | Tune CC durations and diminishing returns |
| "Frustration" survey score (per food, 1–5) | 2.5 or lower | Revisit counterplay |
| Average match TTK | 3–6 s | Global damage multiplier |

- **Cadence:** a weekly internal playtest with a survey; biweekly balance patches in beta; monthly live patches, with hotfixes as needed.
- **All values are data-driven.** Foods are defined in data tables (see §12.6), so designers tune without code changes and live tuning can ship as server config.

---

## 8. Cooking, Combining and Environmental Interactions

### 8.1 Stations

| Station | Location | Interaction | Time | Risk and tell |
|---|---|---|---|---|
| **Stove burner** | Burner Badlands | Cook | 3–5 s | Burners cycle on and off; flames deal 20 damage per second. A sizzle is audible within 40 m. |
| **Oven** | Burner Badlands | Bake | 5 s | Interior hideout; preheat cycle evicts campers. |
| **Freezer drawer** | Frostbite Heights | Freeze | 4 s | Staying in the fridge for more than 30 s makes you Chilled (-15% move). |
| **Toaster** | Toast Town | Toast bread; launch pad | 3 s | Pops on a timer. |
| **Blender** | Chop Block Central | Combine 2–3 foods | 4 s | **Very loud**: pings the minimap for enemies within 60 m. |
| **Microwave** | Chop Block Central | *Gamble* | 3 s | 60%: +1 rarity tier. 30%: no change. 10%: **kaboom** (15 self-damage; food lost). |
| **Honey pools** | Pantry, Breakfast Nook | Dip | 2 s | Grants Glaze (+50). Each pool holds 150 Glaze total, then drains. |

### 8.2 Recipe list

**Cook (Stove):** Raw Egg → Hard-boiled · Tomato → Roasted Tomato · Chili → Fire-Roasted · Spaghetti → Cooked · Corn → Popcorn Cob · Onion → Onion Rings · Cheese → Fondue (Oven).
**Freeze (Freezer):** Grapes → Frozen Grapes · Carrot → Icicle Carrot · Soda → Slushie Can · Yogurt → Froyo · Chocolate → Frozen Chocolate · Banana → Frozen Banana (40 outbound damage plus a chill slow).
**Bake (Oven):** Cookie → Warm Cookie · Cupcake → Double-Frosted · Cheese Wheel → Fondue Wheel.
**Toast (Toaster):** Bread slices → Toast.

**Blender combos (curated):**

| Inputs | Result | Effect |
|---|---|---|
| Banana + Ice | Freeze Smoothie | 3 m splash; Frozen 0.8 s |
| Tomato + Chili | Salsa Bomb | Juiced plus Burning splash |
| Grapes + Soda | Fizzy Grapes | Each pellet mini-explodes |
| Chocolate + Milk | Choco-Fog | Fog that also slows 20% |
| Avocado + Tomato + Onion | Guac Supreme | Smoke plus tear gas |
| Cookie + Milk | Dunked Cookie | Seeker that leaves fog on impact |
| Yogurt + Grapes | Parfait | Heal puddle plus a scatter shot |
| Pickle + Onion | Brine Bomb | Acid plus a small tear-gas cloud |
| Jelly + Bread | Jam Sandwich | Sticky frisbee that roots for 1.2 s |
| Mushroom + Soda | Spore Rocket | Fizz Jump that leaves a bounce pad |

Any **unlisted combination** produces *Kitchen Sludge*: a 20-damage splash with a random minor status. This keeps experimentation fun without balancing hundreds of combinations.

### 8.3 Systemic interaction matrix

| Interaction | Result |
|---|---|
| Fire + Ice | Steam cloud (vision block 4 s); both removed |
| Fire + Butter or grease | Grease fire line |
| Fire + Onion gas | Flash burn-off (10 damage, cloud removed) |
| Fire + Chocolate | Molten trail (+2 damage per second) |
| Fire + Cheese | Fondue pool |
| Milk + any fire | Extinguished |
| Wet player + Ice | Freeze +50% duration |
| Water (sink or dishwasher) + Sticky, Acid or Burning | Cleansed |
| Soda + Ice | Frozen slush rink |
| Jelly + Ice | Frozen jelly block (solid cover) |
| Butter slide + bounce pad | Super-launch |
| Knockback + burner, flood or Soap Tide | Environmental elimination opportunities (kill feed: "sent to the sink") |

### 8.4 Environmental hazards and events

- **Burner cycle:** random burners ignite for 20 s every 60–90 s, telegraphed by a 2 s glow.
- **Faucet flood:** every few minutes the sink overflows. A water surge sweeps the sink counter and pours onto the floor, making players Wet and pushing them.
- **Dishwasher cycle:** spray-arm jets knock back and Wet anyone inside, which evicts hiders.
- **Fridge door:** the door swings open and closed on a timer, changing sightlines and access to the Fridge District.
- **Kettle whistle:** a steam burst updraft plus a vision cloud near the Breakfast Nook.

---

## 9. Map: The Grand Kitchen

### 9.1 Layout (top-down, not to scale)

```
                                   N
  +---------------------------------------------------------------------+
  | FROSTBITE HEIGHTS  |        BURNER BADLANDS          |   PANTRY      |
  | fridge + freezer   |  6-burner range, oven, hood fan |   CANYONS     |
  | condiment towers   |  (updraft to ceiling)           |   walk-in     |
  |--------------------+---------------------------------+   pantry      |
  | FLOODWORKS         :                                 :   shelves,    |
  | sink, dishwasher,  :        CHOP BLOCK CENTRAL       :   flour dunes |
  | under-sink pipes   :   island counter, blender,      |---------------|
  |                    :   microwave, utensil crock      |  TOAST TOWN   |
  | HERB GARDEN        :                                 |  toaster pads,|
W | window sill above  :   SKYHOOKS: pot rack hanging    |  coffee vents,| E
  | the sink           :   overhead (ceiling tier)       |  honey pools  |
  |....................:.................................:...............|
  |              CRUMB PLAINS: tiled floor, giant crumbs, RUG JUNGLE     |
  |                                                                      |
  |           BANQUET PLATEAU: dining table, chairs, draped tablecloth   |
  +----------------------------------------------------------------------+
                                   S
```

### 9.2 Points of interest (POIs)

| POI | Tier(s) | Identity | Combat character | Signature features |
|---|---|---|---|---|
| **Burner Badlands** (Stove) | Counter, cabinets, ceiling | Heat, fire, steam | High-risk, high-reward; cooking | Burner cycles, oven hideout, hood-fan updraft, heat-shimmer volumetrics |
| **Frostbite Heights** (Fridge) | Floor to 72 m | Cold vertical city | Vertical CQB on shelves | Condiment-bottle towers, freezer ice caves, swinging door, frost fog |
| **Floodworks** (Sink and Dishwasher) | Floor, counter | Water and chaos | Environmental kills | Flood events, dish-rack scaffolding, dishwasher maze, under-sink pipe tunnels |
| **Pantry Canyons** | Floor to 90 m | Dense loot, dust | Tight corridors, verticality | Can towers, cereal-box hideouts, flour-bag dunes (dust volumetrics), spice-jar alleys, honey pool |
| **Chop Block Central** (Island) | Counter | Central crossroads | Open mid-map brawls | Blender, microwave, cutting boards, utensil crock (climbable spoons and spatulas), spatula catapults |
| **Skyhooks** (Pot rack) | Ceiling, 100–110 m | Floating islands | Sniper nests; supply drop hotspot | Hanging pots and pans, swing points, a long fall to the island |
| **Toast Town** (Breakfast nook) | Counter | Launch pads, breakfast | Fast rotations | Toaster launchers, coffee steam vents, cereal-bowl arenas, honey pools |
| **Herb Garden** (Window sill) | 40–50 m | Jungle in pots | Stealth, flanks | Basil and mint jungles, sunlight god-rays, soil pits |
| **Crumb Plains** (Floor) | Floor | Open terrain between islands | Rotation fights | Giant crumbs as cover, **Rug Jungle** (tall fibers for stealth) |
| **Banquet Plateau** (Dining table) | Floor to 30 m | Feast table | Set-piece fights | Plates as cover and hideouts, glasses that refract, candelabra fire, climbable tablecloth walls, chairs as bridges |

### 9.3 Hiding places

Hiding is a strength, but **every hideout has a built-in eviction mechanic** to stop endless camping. Players inside a hideout can't throw until they peek (half-exposed) or exit.

| Hideout | Where | Entry | Eviction or reveal mechanic |
|---|---|---|---|
| Under giant plates | Banquet Plateau | Crawl under the rim | Plates shatter from 150 damage |
| Open drawers | Island, counters | Hop in | Enemies can **slam the drawer**: 10 damage and ejection |
| Inside the fridge | Frostbite Heights | Door cycle | *Chilled* after 30 s |
| Under the sink | Floodworks | Cabinet doors | Pipe gurgles give away positions; flood events |
| Inside the dishwasher | Floodworks | Open door | Wash cycle jets |
| Behind or inside cereal boxes | Pantry | Climb in the top | Cardboard is destructible (200 HP) |
| Between spice jars | Pantry | Walk in | **Pepper dust makes you sneeze**, which is audible and pings the minimap |
| Cupboards | Everywhere | Doors | Doors can be kicked open |
| Under rugs | Crumb Plains | Crawl under the edge | **Your moving lump is visible** from above |
| Inside the toaster | Toast Town | Drop in | Pops you out on its timer (a launch) |
| Oven | Burner Badlands | Door | The preheat cycle burns you out |
| Cookie jar, bread box, egg carton cups, mugs | Various | Lids and openings | Destructible or lift-able |

**Aroma rule:** any player stationary inside a hideout for 20 s or more emits visible **aroma wisps** that other players can see from 40 m away.

### 9.4 Level-design metrics

- **Sightlines:** the longest open sightline without cover is about 150 m. That is the Carrot's effective range, and matches glint visibility.
- **Rotation:** any POI to its adjacent POI in 45–70 s on foot, or 20–30 s using traversal devices.
- **Cover cadence:** hard cover every 15–25 m on open floors (crumbs, dropped utensils, landmark foods).
- **Vertical access:** every tier is reachable from the tier below at least every 150 m, via a climbable surface, launch pad, updraft or ramp.
- **Loot density:** named POIs hold 1.5–2.5 foods per player expected to land there; the open floor holds 0.5.

### 9.5 Destruction

- **Destructible:** plates, glasses, mugs, jars, cereal boxes, cabinet doors, drawer fronts, landmark foods, bread bridges and all deployables.
- **Indestructible:** load-bearing structure (counters, the fridge body, walls, floor, the stove body). This keeps the map readable and navigable.
- **Implementation:** see §11.4. Pre-fractured pieces and server-authoritative break events. Debris is cosmetic and client-side.

---

## 10. Game Modes

| Mode | Players | Map | Rules |
|---|---|---|---|
| **Last Bite Standing** (Battle Royale) | 60 at launch, scaling to 100 (§18) | Full kitchen | Solo, Duo or Squad of 4. Soap Tide. Last player or team wins. |
| **Last Bite: Ranked** | Same | Full kitchen | Skill-based matchmaking with ranked points. Tiers: Crumb → Sprinkle → Sous → Chef → Head Chef → **Michelin Star** |
| **Team Food Fight** | 16v16 | 2–3 POI sub-map | Respawns; first team to 100 splats wins |
| **Capture the Cake** | 8v8 | Banquet Plateau and Crumb Plains | Carry the enemy cake to your plate. The cake carrier moves at -20% and can only use light foods. |
| **Party Mode: Kitchen Nightmare** | 24 free-for-all | Rotating POI | Respawns, all foods at Michelin tier, random **Kitchen Events** every 90 s (low gravity, floor is hot sauce, microwave meltdown, butter everything) |
| **Custom / Private** | 2–100 | Any | Every rule exposed (foods on or off, damage, Soap Tide timing, respawns) for creators and tournaments |

---

## 11. Graphics, VFX and Performance

> This is the project's **highest-priority** area. Visual ambition is bounded by the frame-time budgets below, and budgets are enforced by automated performance tests (§11.8).

### 11.1 Art direction: "Macro photography"

- **Reference:** close-up food photography and high-end animated features. Realistic, appetizing food; slightly stylized characters.
- **Camera language:** a subtle tilt-shift sense of scale (atmospheric perspective, haze on distant cabinets, soft background falloff) *without* obscuring gameplay.
- **Materials:**
  - Subsurface scattering for fruit, jelly, cheese and bread.
  - Clear-coat for glazes and ceramics.
  - Anisotropic highlights on brushed stainless steel.
  - Thin-film iridescence for soap bubbles.
  - Wet-surface darkening and puddle reflections driven by surface state.
- **Readability over realism:**
  - Players get a subtle rim light.
  - Enemies beyond 60 m get a team-neutral outline; teammates get a team-color outline.
  - Status effects use a **fixed color and shape language**: red Juiced drips, icy blue Frozen crystals, orange Burning embers and so on, each paired with an icon.

### 11.2 Engine choice: Unreal Engine 5 (recommended)

| Need | UE5 feature |
|---|---|
| Massive geometric detail in a static kitchen | **Nanite** virtualized geometry. The kitchen is almost entirely static hard-surface, which suits Nanite ideally. |
| Global illumination (GI) and reflections | **Lumen**, with software ray tracing on Medium and High and hardware ray tracing on Ultra |
| Dynamic shadows | **Virtual Shadow Maps** |
| Huge seamless streaming map | **World Partition** with HLODs and Data Layers |
| Mass particles | **Niagara** GPU simulation |
| Physics and destruction | **Chaos** physics and Geometry Collections |
| 100-player networking | Dedicated servers, **Iris** / Replication Graph |
| Online services and cross-play | Epic Online Services (EOS), including Easy Anti-Cheat and voice |

Alternatives considered: **Unity 6** (HDRP plus Netcode for Entities) is viable but has a weaker off-the-shelf solution for large-world streaming and 100-player replication. **Godot** is not suitable at this fidelity and player count.

### 11.3 Target hardware and frame rates

| Tier | Example hardware | Target |
|---|---|---|
| Minimum | GTX 1070 / RX 5500 XT 8GB, 6-core CPU (i5-8400 / Ryzen 5 2600), 16 GB RAM, **SSD required** | 1080p Low, 60 FPS with upscaling |
| **Mid-range (primary target)** | RTX 3060 / RX 6600 XT, Ryzen 5 5600 / i5-12400, 16 GB | **1080p Medium or High, stable 60 FPS** |
| High-end | RTX 4070 Super / RX 7800 XT or better, Ryzen 7 7800X3D | **1440p High, 120+ FPS** |
| Enthusiast | RTX 4080 / 5080 class | 4K Ultra with hardware ray tracing at 60–90 FPS, or 1440p at 144+ FPS |
| PS5 / Xbox Series X | Console | **Performance mode 60 FPS** (dynamic resolution) and a 120 Hz competitive mode with reduced effects |
| Xbox Series S | Console | 60 FPS at a lower dynamic resolution; Lumen off |

Frame generation (DLSS FG, FSR FG) is offered but **never counted toward targets**, because of input latency in a competitive game.

### 11.4 How we deliver "full physics, fluids and soft bodies" within budget

The brief asks for advanced physics, fluid simulation, soft bodies and destruction with 100 players at 60 FPS. Shipping all of it as real simulation, replicated to 100 clients, is not feasible. The design splits every effect into a **gameplay truth layer** (server-authoritative, cheap, deterministic) and a **visual layer** (client-only, scalable, spectacular).

| Feature | Gameplay truth (server) | Visual (client, scalable) |
|---|---|---|
| **Liquids and splats** | A **Surface State Grid**: a sparse 1 m-cell hash over walkable surfaces storing state, intensity, team and expiry. Updates replicate as compact *stamps* (shape, center, radius, state, duration). | Stamps are painted into a **Runtime Virtual Texture (RVT) "splat canvas"**, so persistent splats cost nearly nothing after painting. Flowmap puddle shaders, Niagara GPU splash particles, and screen-space fluid for hero splashes on High and Ultra. |
| **Floods** | A scripted heightfield water volume with a current vector | Water shader, foam, caustics; Niagara Fluids only for hero moments on Ultra |
| **Soft bodies** (jelly, cheese, bread) | Rigid collision proxies (sphere, box, cylinder) | Vertex-shader deformation (World Position Offset (WPO) squash and stretch), morph targets and vertex-animation textures |
| **Destruction** | Break *events* (object ID, fracture seed, impulse) | Pre-fractured Geometry Collections. Debris is client-only, sleeps quickly and despawns within 5–10 s. Debris never collides with other debris. |
| **Projectiles** | Analytic ballistic arcs for Lob and Line (no rigid body); a simplified rigid body only for Roll foods and bounces | Full mesh plus trails; pooled |
| **Characters** | Capsule movement with prediction | Full animation, secondary motion (cloth, hair) scaled by distance |

### 11.5 Graphics settings

| Setting | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Global illumination | Skylight + GTAO + distance-field AO | Lumen software ray tracing (low) | Lumen software ray tracing (high) | Lumen hardware ray tracing |
| Reflections | Screen-space reflections (SSR, low) | SSR | Lumen reflections | Hardware ray-traced reflections (stainless steel, glass) |
| Shadows | Cascaded shadow maps (2 cascades) | Virtual Shadow Maps (low res) | Virtual Shadow Maps | Virtual Shadow Maps with contact shadows |
| Volumetrics (steam, fog, dust) | Sprite-based soft particles | Volumetric fog, coarse grid | Volumetric fog + local fog volumes | Full-resolution volumetrics |
| Particles | 30% spawn budget | 60% | 85% | 100% |
| Persistent splats (RVT) | 25 m radius, low-res | 50 m | 100 m | 150 m, high-res |
| Liquid rendering | Decals only | Decals + flowmaps | + screen-space fluid for hero splashes | + Niagara Fluids hero moments |
| Motion blur | Off | Off | Low (per-object) | Configurable |
| Depth of field | Scope only | Scope only | Scope + kill cam | Scope + kill cam + spectator cinematic |
| Upscaling | Temporal Super Resolution (TSR), DLSS, FSR or XeSS; Performance preset | Balanced | Quality | Quality or native |

Motion blur and depth of field are **off during active gameplay by default**, because gameplay clarity comes first. The "cinematic" camera effects in the brief are used where they don't cost clarity: kill cams, spectator mode, highlight reels, the lobby and victory screens.

### 11.6 Frame-time budget (mid-range PC, 1080p Medium, 16.6 ms)

| GPU pass | Budget |
|---|---|
| Nanite geometry + base pass | 4.0 ms |
| Lumen GI and reflections | 3.5 ms |
| Shadows (Virtual Shadow Maps) | 2.0 ms |
| Translucency, particles, volumetrics | 2.5 ms |
| Post-processing and TSR | 1.5 ms |
| UI | 0.5 ms |
| **Headroom** | 2.6 ms |

| CPU thread | Budget |
|---|---|
| Game thread | ≤ 8 ms (including animation and gameplay for 100 players) |
| Render thread | ≤ 8 ms |
| Physics (Chaos, async, fixed 60 Hz) | ≤ 3 ms |
| Audio | ≤ 1.5 ms |

### 11.7 Optimization techniques

- **Geometry:** Nanite for all static environment meshes. Traditional LODs with automatic LOD generation for dynamic foods and characters. **HLODs** are critical, because players on high shelves can see across the entire kitchen.
- **Culling:** Nanite two-pass occlusion, per-object cull distances for small props, and significance-based culling for particles and audio.
- **GPU instancing:** Instanced Static Meshes and Hierarchical ISMs for crumbs, cereal, sprinkles, grapes and kernels.
- **Object pooling:** all food projectiles, Niagara components, decals, audio sources and deployables are pooled and pre-warmed at match start. There is **zero runtime spawning** of heavy actors during combat.
- **Characters at 100-player scale:**
  - The Animation Budget Allocator throttles distant animation.
  - Update Rate Optimization (URO) skips frames for far characters.
  - Beyond 150 m, characters use **vertex-animation impostors**.
  - Cloth and secondary physics are disabled beyond 30 m.
- **Particles:** hard per-frame budgets: a maximum of 30 active "big" impact systems, with lower-significance effects culled first. Effects are pooled and GPU-simulated. Effects in the distance use simplified "flipbook" versions.
- **Physics:** asynchronous Chaos physics. Remote players' Roll foods run as kinematic playback, and a local body sleeps within 1 s of settling.
- **Streaming:** World Partition with 128 m cells and a 512 m loading range for gameplay actors, with HLOD beyond. Data Layers per game mode. SSD required; texture streaming pool sized per tier.
- **Shaders:** Pipeline State Object (PSO) pre-caching, plus a shader warm-up pass during the Gravy Blimp flight, to eliminate hitching.
- **Consoles:** dynamic resolution targeting the frame budget, and device profiles per SKU.

### 11.8 Performance quality assurance

- **Nightly automated benchmark** (Unreal Gauntlet): a recorded "worst-case final circle" replay with 100 bots, 60+ simultaneous projectiles and 10 active clouds, run on mid-range PC, PS5 and Series S reference machines.
- **Budget gates:** a merge that regresses p95 frame time by more than 0.5 ms fails CI.
- **Profiling tools:** Unreal Insights traces are archived for every nightly run, and a telemetry dashboard shows live-player frame times by hardware bucket.
- **Chaos budget (readability):** screen-covering effects (smoke, fog, gas, cereal) are capped so that at most about 35% of the screen can be obscured by a single effect at 5 m. The accessibility "Clarity" preset reduces this further.

### 11.9 Impact feedback lexicon

Every food impact uses the same layered recipe, so the game feels consistent.

1. **Anticipation:** a charge pose, the food squashes in the hand, a rising audio whoosh.
2. **Launch:** a spin trail colored by food (a visible "who threw this" cue).
3. **Impact:** 2–4 frames of squash and stretch; a Niagara burst (juice, seeds, crumbs, ice or sparks); a splat decal stamped into the RVT; a **40 ms local hit-stop** for heavy hits (never on the victim's input); camera shake scaled by distance.
4. **Aftermath:** persistent splats; drips; the surface state applied.
5. **Confirmation:** a food-specific hit-marker sound, a floating damage number (optional), and a kill-feed entry with the food icon and a funny verb ("tomato'd", "pickled", "sent to the sink").

---

## 12. Technical Architecture

### 12.1 Network model

- **Dedicated authoritative servers.** Clients never decide hits or damage.
- **Tick rate:**
  - Battle royale: **30 Hz** while more than 50 players are alive, rising to **60 Hz** in late circles.
  - Arena modes: 60 Hz.
- **Movement:** client-side prediction with server reconciliation, using the Character Movement Component or the newer Mover / Network Prediction plugin.
- **Projectiles:**
  - The client fires *immediately* with a predicted cosmetic projectile.
  - The server spawns the authoritative projectile, forward-simulated by half the round-trip time (RTT).
  - The client reconciles its cosmetic projectile to the server's; misses are corrected smoothly.
  - Lob and Line projectiles are **analytic** (a deterministic arc from origin, velocity and time), so they replicate as a single spawn event rather than per-tick transforms. This yields large bandwidth savings.
- **Lag compensation:** the server keeps a 500 ms history of hitboxes and rewinds for hit validation, **capped at 200 ms** to limit the "shot around the corner" effect for high-ping players.
- **Relevancy:** a spatial grid (Iris / Replication Graph). Far-away players update at a lower frequency. Status and surface changes are sent as events.

**Server-wide caps:**

| Item | Cap |
|---|---|
| Active authoritative projectiles | 512 |
| Active projectiles per player | 6 |
| Lingering area zones (clouds, puddles, fields) | 128; the oldest expire early |

**Bandwidth targets per client:** about 60–80 kbps typical, 150 kbps peak.

### 12.2 Surface State Grid (key system)

- A sparse hash grid with 1 m cells over walkable surfaces. Each cell holds `{state, intensity, teamId, expiresAt}`.
- The server applies *stamps*. Clients rasterize the same stamps deterministically, so there is no per-cell replication.
- Movement queries sample the grid under the player's feet. It drives friction, statuses, audio and footprint VFX.
- Interaction rules (§8.3) are resolved when stamps overlap.

### 12.3 Physics

- **Chaos** physics, asynchronous at a fixed 60 Hz on clients and 30 Hz on the server.
- **Server-simulated bodies are limited** to Roll foods (Watermelon, Cheese, Donut), bouncing Jelly, and a small set of destructible world objects.
- Everything else, such as debris, crumbs and cereal, is client-side cosmetic and non-replicated.

### 12.4 Replays, kill cam and spectator

- **Server replay recording** (Unreal Replay System) for every match. Used for highlight generation, anti-cheat review and tournament spectating.
- **Kill cam:** the client keeps a 10 s in-memory replay buffer and plays it back from the killer's replicated viewpoint.
- **Spectator:** follow a player, free-cam, or tournament observer mode with an overhead tactical view and delayed broadcast.
- **Highlight reels:** the server scores events (multi-splats, long Carrot face hits, environmental eliminations, clutch revives, funny chains such as "slipped on a peel into the flood") and auto-generates clips from the replay.

### 12.5 Anti-cheat and security

- Easy Anti-Cheat on PC, plus server authority for everything.
- Server-side sanity checks: movement speed, fire rate, aim snap statistics.
- Rate limiting on all remote procedure calls (RPCs).
- Replays attached to reports.

### 12.6 Data-driven foods

Every food is a data asset, and designers never need code changes to tune one. Example:

```yaml
id: tomato
role: [splash, tracking]
profile: lob
stack: 4
rarityBand: [fresh, chefs_special]
spawnWeight: staple
launch: { speed: 30, chargeTime: 0.4, recovery: 0.6, gravityScale: 1.0 }
hit:
  direct: 25
  splash: { radius: 2.5, damage: 10, falloff: linear_40 }
statuses:
  - { id: sticky, strength: 0.20, duration: 3.0 }
  - { id: drip_trail, surface: slick, duration: 5.0 }
surfaceStamp: { state: juice, radius: 2.0, duration: 6.0 }
transforms:
  cook: roasted_tomato
blender: [salsa_bomb]
fx: { launch: fx_tomato_trail, impact: fx_tomato_splat, decal: dcl_tomato }
sfx: { impact: sfx_splut, hitMarker: sfx_hit_squish }
```

Live tuning is delivered as **server-side config overrides**, with no client patch required for numeric changes.

### 12.7 Tooling and pipeline

- **Version control:** Perforce (industry standard for UE5 binary assets), **or** Git plus Git LFS. This repo would host code, docs and configuration.
- **Continuous integration (CI):** builds for all platforms, dedicated servers, automated tests (unit, functional and Gauntlet), and the nightly performance run.
- **Internal tools:** a food editor with live preview in a test map; a stamp and surface debugger; a netcode visualizer; a bot framework for load testing.

---

## 13. Multiplayer Services and Social Features

| Service | Approach |
|---|---|
| Identity | Platform accounts (Steam, PSN, Xbox, Epic) linked through EOS Connect |
| Parties and lobbies | EOS Lobbies. Cross-platform parties of up to 4. |
| Matchmaking | Region, mode, party size, **skill rating** (ranked and a hidden casual rating), **input type** (controller and keyboard-and-mouse pools by default, opt-out available) |
| Game server fleet | Kubernetes with **Agones**, or a managed provider such as AWS GameLift or Edgegap. Multi-region, autoscaled on queue depth. |
| Progression, inventory, economy | A backend-as-a-service (for example AccelByte, PlayFab, Nakama or Pragma) or a custom service |
| Store and entitlements | Platform stores, synchronized through the backend |
| Voice chat | EOS Voice or Vivox. Team and party voice by default. **Proximity voice is optional** (Party and Custom modes only). |
| Text chat | Team, squad and lobby channels, with profanity filtering |
| Moderation | Reporting with replay attachment, mute and block, a voice-moderation service, and **stricter defaults for younger players**: voice off and text filtered (COPPA and GDPR-K compliance) |
| Telemetry | An event pipeline to a data warehouse, feeding the balance dashboards (§7.5) and the performance dashboards (§11.8) |
| Live ops | Playlists, events, limited-time modes (LTMs), store rotations and balance overrides without a client patch |

**Cross-play:** on by default, as required by platform rules. PlayStation and Xbox players can opt out of playing with PC players.
**Ping system:** a contextual ping wheel ("Food here", "Enemy", "Hideout", "Going here", "Need heals"). This is essential for players who don't use voice.

---

## 14. UI / UX

### 14.1 HUD

- **Top-left:** squad status: health, Glaze, Sauced state.
- **Top-right:** **minimap** in a kitchen-blueprint style with a **tier indicator** (floor, counter, cabinets, ceiling); Soap Tide timer; players alive; eliminations.
- **Bottom-center:** a **5-slot hotbar** showing food icon, count, rarity border and a radial cooldown or charge indicator. Alt-action hint beneath it.
- **Center:** a context reticle per launch profile (arc preview for Lob, tight dot for Line, cone for Spray, lock-on brackets for Seek).
- **Right edge:** kill feed with food icons.
- **Status bar:** above health, with icons plus timers for every active status (colorblind-safe shapes).
- **Directional indicators:** incoming threats (Chili lock-on warning, Cookie seeker, sticky bomb attached, Carrot glint).

### 14.2 Food selection

- **Keyboard and mouse:** number keys 1–5, scroll wheel, Q for Alt action, F for eat or quick-use.
- **Controller:** bumpers cycle foods; **hold for a radial Food Wheel**, which also exposes Alt actions and eat.
- **Auto-sort** option: Line / Lob / Utility / Sustain.

### 14.3 Map screen

A **3D layered map**: toggle between tiers, with the Soap Tide shown volumetrically, including vertical rises. Supports pings, markers and squad drop plans.

### 14.4 Front end

Lobby with a 3D character on a cutting board; play and queue; the **Locker** (skins, emotes, food skins, trails, napkin gliders, plating poses); the **Recipe Book** (seasonal pass); store; career stats; settings; replays and highlights.

---

## 15. Audio

- **Pillar:** every food is identifiable **by sound alone**: launch whoosh, flight loop and impact.
- **Spatial audio:** HRTF-based (MetaSounds plus platform 3D audio). Vertical cues matter because of the tiers. Footsteps vary by surface and state (squelch on juice, skate hiss on butter).
- **Concurrency:** voice limits and priority groups, so 50 simultaneous splats never mask a nearby enemy's footsteps or the Carrot glint charge.
- **Music:** light, jazzy "kitchen swing" in the lobby; dynamic intensity layers during the match; a finale stinger when the last circle closes.
- **Accessibility:** sound visualization shows directional icons for key cues.

---

## 16. Progression, Cosmetics and Monetization

- **Business model:** free-to-play with **cosmetic-only** monetization. **No pay-to-win.** No paid loot boxes; purchases use direct pricing only.
- **Account level:** XP from matches, challenges and play time.
- **Recipe Book (seasonal pass):** free and premium tracks of about 100 tiers each season (10–12 weeks).
- **Cosmetics:**
  - Character skins (Tiny Titans such as a chef, a sous-chef robot or a gummy knight).
  - Emotes.
  - **Food skins:** alter *texture and flair only*. Silhouette, size and the status-effect color language are locked for readability.
  - Throw trails, napkin gliders, plating (victory) poses, and kill-feed verb packs.
- **Ranked rewards:** seasonal cosmetic badges and trails.

---

## 17. Accessibility

| Area | Options |
|---|---|
| Vision | Colorblind modes (status colors plus unique shapes and icons); UI scale; high-contrast outlines; **"Clarity" preset** that reduces particle density and screen-covering effect opacity |
| Screen effects | Independent sliders for camera shake, the Burning heat-haze, Blinded overlay opacity (within competitive limits: the information is kept but its presentation can change), Teary blur, flashes, motion blur and depth of field |
| Motion comfort | Field-of-view (FOV) slider, camera bob off, reduced hit-stop, a centered-dot option |
| Audio | Subtitles with speaker labels, sound visualization, separate volume buses, mono audio |
| Input | Full remapping, toggle or hold for every hold action (charge, climb, aim), aim-assist strength options on controller, adjustable deadzones and curves |
| Communication | Ping wheel; speech-to-text and text-to-speech for chat |
| Cognitive | Food tooltips in the Locker and on pickup; a practice range on the Cutting Board; optional trajectory arc length for new players (casual queues only) |

---

## 18. Implementation Roadmap

### 18.1 Honest scope statement

A 100-player, cross-platform, high-fidelity battle royale is a **large-studio undertaking**. Comparable titles took **40–100+ developers and 2–4 years**. The roadmap below reflects that. §18.4 describes a leaner path that still results in a real, shippable game.

### 18.2 Phased plan (full scope)

| Phase | Duration | Team size | Goals | Exit gate (must pass) |
|---|---|---|---|---|
| **0. Pre-production: "Food Feel"** | Months 0–4 | 8–12 | UE5 project, CI, and core throw system. **6 foods:** Tomato, Banana, Carrot, Ice Cube, Soda, Cheese Wheel. Gray-box countertop arena. 8-player dedicated-server netcode test with prediction. Surface State Grid prototype. | Blind playtests rate throwing fun ≥ 4/5. 8 players at 60 FPS on minimum-spec hardware in gray box. Netcode "feels local" at 100 ms RTT. |
| **1. Vertical slice** | Months 4–10 | 20–30 | Burner Badlands POI at **final art quality** (Nanite, Lumen, full VFX lexicon). 12 foods, the full status system, diminishing returns, cooking at the stove. 32-player battle royale on a sub-map. Graphics settings tiers. Nightly performance CI. | 32 players at a stable 60 FPS mid-range and 30 Hz server tick. p95 frame time within budget in the stress replay. Visual quality bar approved. |
| **2. Production alpha** | Months 10–20 | 45–70 | Full Grand Kitchen gray box, then art. **All 30 foods**, all stations and blender recipes, the Soap Tide, drops, squads, Sauced and revive, reboots. Backend: accounts, parties, matchmaking, voice. Spectator, kill cam, replays. **60-player** matches. | Full match loop playable end to end. 60 players at 60 FPS mid-range. Balance metrics within the healthy bands in internal tests. |
| **3. Beta** | Months 20–28 | 60–90 | Content complete. **100-player scale** test (bots plus a closed beta). Cross-play, console ports, certification prep. Progression, store, Recipe Book. Anti-cheat. Accessibility suite. Team Food Fight, Capture the Cake and Party modes. Load tests at more than 50,000 simulated concurrent users. | 100-player servers stable (tick-time p99 within budget). Console performance targets met. Closed-beta retention and sentiment targets met. |
| **4. Launch** | Months 28–32 | 70–100 | Open beta, platform certification, marketing beats, day-one live-ops tooling. | Certification passed; crash rate below 0.5% of sessions. |
| **5. Live** | Ongoing | 60–100 | Seasons every 10–12 weeks: new foods, POI changes, limited-time modes, events and balance patches. | Retention and revenue KPIs |

The launch player count is **60**, rising to **100** after live data proves server and client performance. This protects the performance pillar; 100 is only enabled when the budgets hold.

### 18.3 First 90 days (Phase 0 detail)

| Weeks | Deliverables |
|---|---|
| 1–2 | UE5 project, source control, CI building client and dedicated server. Coding standards. Gray-box countertop. |
| 3–4 | Player movement kit (§4.2). Launch profiles Lob, Line and Return. Food data assets (§12.6). |
| 5–6 | Tomato, Banana, Carrot and Ice Cube. Status system with diminishing returns. The first pass of the impact feedback lexicon. |
| 7–8 | Networking: prediction, projectile reconciliation and lag compensation. An 8-player test. |
| 9–10 | Soda and Cheese Wheel (Roll profile plus server physics). Surface State Grid with the RVT splat canvas. |
| 11–12 | Bots for load testing; first performance baseline on minimum and mid-range hardware; playtest round 1; go / no-go review. |

### 18.4 Lean path (small team or solo developer with AI assistance)

If the budget is small, ship a smaller game that keeps the pillars:

- **Scope:** 24–40 players; one ~600 m kitchen (Island, Stove, Sink and Floor only); **12 launch foods**; Solo and Duo; PC only (Steam Early Access); a hosted-server provider instead of a custom fleet; text chat plus ping (voice later).
- **Team:** 5–15 people. **Timeline:** about 12–18 months to Early Access.
- **Engine:** still UE5, but lean on marketplace assets and **stylized** rather than photoreal art. Stylized art is cheaper to produce and to render.
- Add foods, modes and players each season as revenue allows.

### 18.5 What can be built in this repository right now

The cloud coding environment this document was written in cannot run the Unreal Editor, but it can produce:

1. **This design document** and the balance data tables (foods as YAML or JSON, ready to import into UE DataTables).
2. **A playable browser prototype** (Three.js plus a physics library such as Rapier) of the Phase 0 "Food Feel" countertop. It can validate the throwing feel, the 6 core foods, the status system and the Surface State Grid, and it can be played instantly in a browser.
3. **Backend services** (matchmaking and progression APIs) and tooling scripts.

---

## 19. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| 100-player performance (client CPU and server tick) | Very high | High | Launch at 60 players; relevancy grid; analytic projectiles; animation budgets; nightly performance gates |
| Visual chaos hurts readability | High | High | Chaos budget (§11.8); status color language; Clarity preset; playtest "who hit me?" surveys |
| Physics desync (rolling foods, destruction) | High | Medium | Minimal server-simulated set; client-only debris; deterministic stamps |
| Crowd-control frustration | High | Medium | Diminishing returns, hard-CC ceiling, slow cap, visible counterplay (§5.4, §7.3) |
| Content scale (30 foods, stations, huge map) | High | High | Data-driven foods; phased roster; lean-path fallback |
| Toxicity in voice and text chat | Medium | High | Moderation stack, younger-player defaults, reporting with replays |
| Server costs at scale | Medium | Medium | Measure server CPU cost per match in Phase 1; autoscaling; regional capacity planning |
| **Title and trademark conflict.** At least one existing game is already titled *Kitchen Chaos*. | Medium | High | Run a trademark and store search now. Consider leading with **"Tiny Titans Food Fight"**. |
| Platform certification and cross-play requirements | Medium | Medium | Budget certification time in Phase 3; follow platform requirements from the start |
| Age rating and regional regulation (loot boxes, children's privacy) | Medium | Low | Cosmetic-only, direct-purchase store; COPPA and GDPR-K compliant defaults |

---

## 20. Open Questions

1. **Budget and team:** is this a studio-scale project (§18.2) or the lean path (§18.4)?
2. **Launch platforms:** PC first with consoles later, or a simultaneous launch?
3. **Art direction:** photoreal food with stylized characters (current proposal), or fully stylized to lower cost and raise performance?
4. **Engine:** confirm Unreal Engine 5, or is there an existing preference such as Unity?
5. **Title:** keep "Kitchen Chaos" pending a trademark search, or lead with "Tiny Titans Food Fight"?
6. **Voice chat:** is proximity voice desired outside Party mode?
7. **Next step in this repo:** build the browser "Food Feel" prototype (§18.5)?
