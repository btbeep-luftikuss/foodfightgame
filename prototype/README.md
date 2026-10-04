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

- **Online multiplayer ("Play online"):** pick a name and a room code; everyone on the published page who types the same code plays together (since 0.21 in Soap Tide rounds with bots, see above; this was first a free-for-all with respawns), with a scoreboard and a shared kill feed. It runs on the claude.ai artifact `room` capability (`src/net.js`):
  - Each player's game shares its Titan through room presence about 30 times a second, with throws, peel traps, trampolines and knockouts as a short rolling event log.
  - Every game simulates every projectile; a hit is decided by the game of the Titan that got hit, and the thrower is credited when that player announces the knockout.
  - Incoming data is untrusted: it's clamped, checked against the food table, shown as plain text and rate-limited.
  - Pickups and delivery boxes are per player online. (Online matches had no Soap Tide until 0.21.)
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
| Match | 12 Titans, napkin-glider drop, Soap Tide closing in 6 phases, grocery drops inside each new safe zone, kill feed, win screen; spectator mode with a cinematic camera, overview, follow cam, minimap and player cards; online loadouts |
| Movement | Walk, sprint, jump and double jump, dash (also once in the air), momentum skating on slick surfaces, jelly trampolines, no fall damage |
| Bots | Pick targets, choose food by range, lead shots with the same ballistic math, dodge, strafe, loot, heal, hunt, walk around walls, use launch pads to reach the safe zone, avoid burners and ledges |
| Presentation | Procedural textures, synthesized sound, pooled instanced particles, rim-lit characters, soft contact shadows, sunbeam and dust, bloom (High), hit markers, damage numbers, hit-stop, screen shake |
| Platforms | Desktop (mouse and keyboard, pointer lock) and phones (touch joystick, aim stick, buttons and plate dials for food and utensils); Low, Medium and High graphics with automatic resolution scaling |

## Run it

**Version 0.27: Cooking Pot Wars, carriers and manned turrets** (`src/potwars.js`)

- **A carried pot goes home if its carrier falls.** A smashed pot rides on its smasher's back; if they're splatted (or leave), it's back at its spot with half its health and its team respawns again.
- **Watching the carrier.** While your team's pot is being carried, your team's knocked-out Titans don't respawn. They watch the carrier (the spectator camera follows them) and come back if the carrier falls; if the carrier gets it home, they're out. A team isn't out while its pot is being carried. Bots go after whoever carries their pot.
- **Turrets need a gunner.** Press **T** at your own pot (phones: the Turret button) to climb in. You sit on the lid, the barrel turns with your aim, and your throws come out of it with the turret's power. Press **T** again to climb out. One gunner per turret; a smashed pot throws its gunner out. Guarding bots man their team's turret.
- **Online:** the host's pot state now says whether a pot stands, is carried off, or is gone. The host puts a pot back when its carrier is down. Every Titan's state says whether it sits in a turret, so the barrel turns for everyone.

**Version 0.26: teams in every mode, Cooking Pot Wars online, a menu in screens** (`src/teams.js`, `src/potwars.js`, `src/game.js`, `src/net.js`, `src/main.js`, `index.html`)

- **Teams everywhere.** Classic, Chef's Choice and Cooking Pot Wars all play Solo (Pot Wars excepted), Duos (6 teams of 2), Trios (4 of 3) or Squads (3 of 4), with 12 Titans in all.
  - Teams: Tomato, Blueberry, Lime, Butter, Grape and Mint. Each starts together in its own patch of floor.
  - Teammates can't hurt each other, and bots never aim at their own team. The last team with anyone standing (or, in Pot Wars, a pot standing) wins.
  - The team bar under the top pill shows every team, how many of its Titans are up and, in Pot Wars, its pot.
- **Pick your team.** Play vs bots: "Your team" on the Play screen (or Any team), and bots fill every other place. Online: the loadout card lists every team with the players on it. Pick one (full teams are greyed out) or Any team (the emptiest).
- **Online.** The room's settings carry the mode (Classic, Chef's Choice, Pot Wars) and team size. Every Titan's shared state carries its team and the pot on its back.
  - The host fills each team with bots around the players. When someone joins a team bots already filled, one of its bots moves to a team with room (or leaves).
  - Teammates online can't hurt each other either, and the round ends with "Team X wins".
- **Cooking Pot Wars online.** The host owns the pots: it places them, takes ladle hits, decides who smashed a pot, counts pots carried home, and shares every pot's state with everyone (with the round number, so a new round never takes an old round's pots).
  - Players send their pot moves as events: setting the pot down, a ladle hit (at most 4 every 2 s, checked against where they stand), a pot carried home. These events stay in the shared log for 3 s so none are missed.
  - The host announces who smashed a pot, so it lands on the right back.
  - Turret shots go out as fired, with their power, so every game applies the same damage.
  - Each player respawns their own Titan while their pot stands; the host respawns its bots. You can drop in through the 30 s setup and 25 s after it, while your team's pot stands.
- **Menu in screens.**
  - Home: Play vs bots, Play online, Locker, Settings, How to play.
  - Play vs bots: mode cards, team size, map, bots, your team, Chef's foods, and a Start button that says what it starts.
  - Play online: name, room code and the room settings if you start it.
  - Locker, Settings (graphics) and How to play (controls, foods, utensils, teams).
  - Every screen has a Back button (Esc works too), and the mode, team size, map and team you pick are remembered.

**Version 0.25: Cooking Pot Wars** (`src/potwars.js`; Play vs bots)

- A team mode like Bed Wars, with cooking pots: 4 teams of 3 (you and 2 bots on Team Tomato, against Blueberry, Lime and Butter), each starting in a corner of the floor. No Soap Tide.
- **Setup, 30 s.** Each team picks where its pot goes: press **G** where you stand (phones: the Ladle button). Bot teams set theirs where their leader stands. Nobody can be hurt meanwhile, and a team that didn't choose gets its pot at its leader's feet.
- **Pots** have 300 health and spit out a random food every 10 s. You respawn beside your pot 5 s after a splat, for as long as it stands.
- **Ladle (G):** every Titan's melee swing. It only hurts pots (15 a hit, 20 hits for a fresh pot), and it's the only thing that does.
- **Smash a pot** and it goes on your back. Carry it to your own pot without being splatted (a splat loses it): your pot gets +150 health, spits food faster, and its turret goes up a level.
- **Turret:** stand at your own pot and your throws come out of its turret, 1.6× damage (+0.4× per pot carried home) and faster. Only your team can use it, and a smashed pot takes its turret with it.
- Every Titan has 75 health. 12 utensils lie around the map at the start, and delivery boxes still come in. No hurting your own team.
- **Bots:** they ignore teammates; one per team raids from the start (all of them after 70 s, or once their pot is gone), the rest guard their pot and use its turret. They carry smashed pots home.
- **Winning:** a team is out when its pot is gone and nobody on it is left standing. The last team standing wins.
- A team bar under the top pill shows each pot's health, its turret level and how many Titans each team has up.

**Version 0.24: pick your loadout online, and a spectator mode** (`src/spectator.js`, `src/game.js`, `src/net.js`, `src/main.js`)

- **Loadout card.** After joining an online room, you pick 3 foods and a utensil, then press Ready (or Drop in while a round is young), or Spectate to only watch.
  - Picks are remembered and shared with Chef's Choice in Play vs bots.
  - In Classic you start with a stack of each food (more lies around the map); in Chef's Choice they never run out.
  - The card opens again from the spectator bar (Play / Change loadout) between rounds. A new pick counts from your next drop.
  - Bots bring a loadout too: 3 random foods, and a utensil 6 times in 10.
- **Spectator mode,** whenever you're out of the round: splatted, waiting for the next one, or only watching. It works offline too, after "Keep watching".
  - *Cinematic:* a director that scores every Titan for action and frames the hottest fight. Action counts hits given and taken (every client sees every hit), throws, charging, low health, and players count extra. Two Titans trading shots are filmed side-on: framed for the screen's shape, never jumping the line between them, a slow dolly drift. When it's quiet, it rides behind or ahead of a Titan on the move. An overall view of the arena comes at least every 30 s. It cuts between shots (4–11 s each), holds on a splat for a moment, and finds a new angle when scenery hides the fight.
  - *Overview:* the wide shot only, slowly circling the Soap Tide and leaning toward where the Titans are.
  - *Follow:* pick a Titan in the bar at the bottom (or tap them on the map, or use the arrow keys) and the camera rides over their shoulder, looking where they look. When they're splatted, it moves on to whoever got them.
  - *Minimap:* a top-down picture of the map, taken once per map from the game's own renderer. It shows everything below 21 m, with the floor as one flat colour; tall things it cuts through are drawn solid. On top: the Soap Tide (and where it's heading), every Titan still in (players bigger, the one you watch ringed) and the camera's view cone.
  - *Bar and card:* every Titan still in, with their splats ("bot" marks the host's bots online). The card shows the Titan you follow: health, splats, how many Titans are left and everything they carry (foods with counts, utensils, what's in hand). Other players' kits now travel in their shared state as short codes, so a spectator sees them too.
- **Online rounds.** Only players who want to play drop in, and the host fills the room with bots around them. You can drop into a round up to 25 s in. When no player is in the round and someone is waiting (or a lone Titan has the room to itself while someone waits), the host starts a fresh round within a few seconds instead of making everyone watch bots to the end.

**Version 0.23: handles only where they belong, and fingers that wrap them** (`src/utensil-models.js`, `src/human.js`, `src/viewmodel.js`, `src/actors.js`)

- The handles 0.22 added to the gadgets are gone. Each utensil now has one of two hold styles (`utensilHold(id)`):
  - *grip* (knife, spoon, blow torch, whisk, rolling pin, spatula, deep fryer, colander, peeler, pan): a slim handle (`HANDLE_R` 0.021) that runs through the hollow of a closed fist.
  - *palm* (ice cream machine, blender, microwave, grater, mortar and pestle, toaster, cotton candy machine, popcorn popper, mixer, oven mitt): rests on the open, palm-up hand.
- Why the fingers clipped: the first-person fist was curled so tight that its hollow (0.010) was less than half the handle's width, and third-person hands were nearly flat. `GRIP` in `human.js` now sets a curl for each view so the hollow fits the handle (first person: curl 1.2, hollow 0.0112; third person: curl 0.9, hollow 0.0177). The handle sits exactly on the hollow's centre, along the knuckle line.
- Third-person Titans curl their left fingers and turn the palm up for gadgets (`palmAnchorL`, `toolPalm` pose).

**Version 0.22: no utensil clips through the hand** (`src/utensil-models.js`)

- Every utensil now has a real handle where the fist closes, and the rest of it sits above the fist. Before, the bulky ones sank into the hand: the blender, grater and mortar bases swallowed it, the microwave, toaster, popcorn bucket and cotton candy tub sat on the fingers, the mixer's body and the oven mitt's cuff went through them. Gadgets (ice cream machine, blender, microwave, toaster, cotton candy machine, popcorn popper, mixer) now sit on a handle like a hand tool, the grater and mortar stand on one, the oven mitt is held by its cuff loop, and the rolling pin, spoon and pan have longer handles. This holds in first and third person and online.
- `fistClearance(id)` checks it: every part except the handle is tested against the fist (within 0.1 of the handle's axis, 0.14 above or below the grip), points and triangle middles. All 20 come out clear.

**Version 0.21: a second map, online rounds with bots, slower cookies and a knife that dices** (`src/map-backyard.js`, `src/net.js`, `src/game.js`, `src/utensils.js`)

- **New map: The Backyard BBQ.** A lawn under an open sky, fenced in, with a house and trees beyond the fence. In the middle stands a giant picnic table with a red gingham cloth (the main high ground, like the kitchen island) and two benches alongside it. There's a kettle grill whose coals heat up and burn like the stove burners (sausages and a burger on the grate, a bag of charcoal for cover), a cooler to climb with a puddle of melted ice, a kiddie pool that gets you Wet (with a rubber duck to hide behind), and a picnic blanket with a giant sandwich, burger, corn cob, ketchup and mustard bottles, a slice of watermelon, paper cups and a honey spill. Two trees, a hedge, a garden gnome and a watering can give cover, and 14 spatula pads fling you onto the table, the benches, the cooler and the grill. The giant tomato sits on the table. Pick the map on the menu (Play vs bots or Play online); it's remembered, and the bots behind the menu move there at once. Both maps share the same footprint and floor height, so physics, bots, the Soap Tide and online work the same on either; the world now builds into one group and can be taken down and rebuilt (`World.dispose`, `Game.setMap`).
- **Online plays like Play vs bots.** Rooms now play rounds: everyone drops in on napkin gliders, the Soap Tide closes in phase by phase with grocery drops, the last Titan standing wins, and the next round starts 6 s later. Knocked-out players watch until the next round, and players who arrive mid-round join at the next drop. Rooms can have bots (None, Easy, Medium or Hard; they fill the room up to 10 Titans), Classic or Chef's Choice (your 3 foods from Play vs bots, or 3 random ones; heal crosses instead of food) and either map. The first player in a room hosts it: their game runs the round clock, the tide and the bots, and shares them in its presence (room settings, round state and every bot's state); bot throws, peel traps and trampolines go out as the host's events, and bot knockouts as a `bd` event. Everyone else follows, switching to the room's map and mode on arrival. Hits on a bot are decided by the host's game (everyone simulates every throw, so your food hurts the host's bots, and theirs hurt you). If the host leaves, whoever has been there longest (or has the lowest id) takes over and starts a fresh round with their own bots. Splats, kills and the scoreboard (bots included) carry on across rounds.
- **Cookies are slower:** 11 m/s (was 18), so a sprint, a dash or a sharp turn can shake one off.
- **The Knife no longer plays like the Blender.** It dices a cheese wheel or watermelon into a spread of 5 mini cheese balls or mini melons that roll out along the floor (each hits softer and smaller, and a mini melon just bursts instead of splitting into chunks), and slices other foods into a fan of 3 that sweeps side to side. The Blender still fires a straight jet that slicks the floor.

**Version 0.20: bot difficulty** (`src/bots.js`)

- **Easy, Medium and Hard bots,** picked on the menu above the game modes (remembered for next time). Easy bots aim loosely (skill 0.1 to 0.35), think every 0.45 s, only notice enemies within 45 m, wait 0.9 s before throwing at a new target, throw 60% less often and dodge half as much. Medium is the bots as they were (skill 0.3 to 0.75). Hard bots (skill 0.75 to 0.95) lead their shots almost perfectly, think every 0.15 s, see 80 m, react in 0.1 s, throw 25% more often and dodge 50% more. In a test where three bots attacked a Titan standing still for 40 s, it took about 110 damage on Easy, 290 on Medium and 660 on Hard.

**Version 0.19: slower Titans, shorter jumps, splats on every surface, and plates that fit what you carry** (`src/stains.js`, `src/dials.js`, `src/actors.js`)

- **A bit slower and lower.** Walking is 5.6 m/s (was 6.5), sprinting 8.5 m/s (was 10) and the dash 24 m/s (was 28). A jump reaches 5 m (was 6) and the double jump adds 4.5 m (was 5), about 9.5 m in all: still enough for the sugar-cube steps and the colander dome.
- **Splats wrap around things and land everywhere.** Stains used to be painted onto flat rectangles (counter tops, box sides, floor and walls), so they stopped dead at every edge and never appeared on round things. Now each splat is a decal cut out of the real scenery triangles around where it lands: it runs over the lip of a counter and down its front, curls round the giant apple, bean cans, colander, fallen chairs and table legs, and splashes up walls. Splats on a table top don't leak onto the legs underneath (anything hidden under the surface that was hit is skipped). The pictures come from one atlas and every stain in the kitchen sits in one buffer, so all of them together are a single draw call; when it's full, the oldest stains are painted over. A big splat costs about 3 ms, a blueberry splat a few hundredths of a millisecond.
- **Phone plates fit what you carry.** A plate now has one place for each food (or utensil) you carry, spaced evenly round it: two foods sit half a turn apart, four a quarter turn. Every notch is something you can use, the plate turns either way, and the same short thumb movement (about 60 degrees) brings the next item round whether you carry two things or five. With one thing it just spins and settles back.

**Version 0.18: 3D utensils, held in your left hand** (`src/utensil-models.js`, `src/viewmodel.js`, `src/human.js`)

- **The utensils are 3D models now,** built like the food: simple rounded shapes in glossy plastic, polished steel and wood, without the outlines and cartoon faces of the design sheet. All 20 are new: a red-handled chef's knife, a soft-serve gun with a swirl and a cherry, a spoon, a blow torch with a blue pilot flame, a balloon whisk, a smoothie blender, a rolling pin, a pocket microwave with a glowing window, a box grater, a slotted spatula, a fry basket full of fries, a mortar and pestle, a chrome toaster with toast, a colander full of holes, a cotton candy tub, a striped popcorn bucket, a Y-peeler, a hand mixer, a quilted oven mitt and a frying pan. Each is merged into one shape per material (at most four draw calls).
- **Held in the left hand.** Every Titan carries the utensil in hand in their left fist with the forearm raised, so you can see what an enemy is carrying; online players' utensils show in their hands too. The floating sticker over the shoulder is gone.
- **First person:** your own left arm (same skin and sleeve as your Titan, fingers wrapped around the handle) holds the utensil in the lower left of the view. It dips out of view and back when you switch utensils and kicks forward when you throw.
- **Everywhere else too:** loose utensils on the floor are the 3D model spinning over its ring, and the HUD plates, phone dial, menus and delivery-box labels use pictures rendered from the 3D models.

**Version 0.17: a utensil kit, plate dials on phones and a cleaner HUD** (`src/utensils.js`, `src/dials.js`, `src/hud.js`)

- **Carry three utensils.** New utensils go into an empty slot (straight into your hand if it's empty); with all three full, a new one swaps out the one in your hand. Switch with 6, 7 and 8 or R (the next utensil). Utensils in your pocket keep cooling down, switching cancels a charge in progress, the same utensil can't be carried twice, and a knocked-out Titan drops all of theirs. A swapped-out utensil can't be picked straight back up until you step away from it. Bots still carry one.
- **Plate dials on phones.** The food and utensil bars are gone on phones. Instead a china plate sits in each bottom corner (food on the left, utensils on the right), and only the quarter with the item in your hand shows. Turn a plate with your thumb like a dial: it settles into each slot as you turn, clicks (with a buzz on phones that support it), and springs into place with a small overshoot when you let go. A tap steps to the next item. Empty food slots are skipped, the plate shows how much of the food you have left, the item's name pops up for a moment, and when a food runs out the plate turns to the next one by itself. The aim stick and buttons were moved around the plates for both upright and sideways phones, the Alt button says what it does (Eat, Shield, Vault…), and the Menu button is now a pause button that opens the pause card.
- **Cleaner HUD (desktop and phone).** Health is in the top-left corner with a heart, the glaze shield as a thin blue bar over it (only when you have some) and stamina under it; status chips sit below in single words. The two tags and the Soap Tide banner became one small pill at the top: tide timer, Titans left, your splats (online: connection, players, splats). The kill feed keeps 3 short entries that fade after a few seconds, the frame counter is hidden (add `?fps` to the address to show it), the hint line is just the food's name and its alt key, the utensil card became three small utensil plates next to the food plates (with a heat ring for the Deep Fryer and Oven Mitt), and utensil messages only appear when something needs attention (overheated, cooling down, no effect, let go).

**Version 0.16: utensils for every food, delivery boxes and a busier kitchen** (`src/utensils.js`, `src/world.js`, `src/input.js`)

- **Mouse lock is back for good.** A refused lock request (Chrome refuses for about a second after you press Esc, so clicking Resume or Play again quickly used to fail) no longer switches mouse lock off for the rest of the session: the game retries once the second has passed, every click on the game tries again, and a "Click to lock the mouse and aim" hint shows while it's unlocked. If a browser never allows the lock, clicks still throw.
- **Utensils work with every food.** Splitting utensils (Knife, Spoon, Grater, Blender, Popcorn Popper) cut cheese wheels, watermelons, bananas and pineapples into proper pieces (cheese chunks, melon chunks, banana slices that leave a slippery splat, pineapple chunks that plant spikes) and split grapes and blueberries into more, smaller pellets. Rolled foods get the zone effects when they stop rolling, the Toaster makes a rolling wheel scorch the floor, and the Rolling Pin and Colander speed it up. For grapes and blueberries, zone and status effects ride on one pellet per throw (one berry in six) so a volley isn't eight vortexes; the Blow Torch lights blueberries after 3 s of steady fire and the Microwave turns one berry into a plasma orb every 1.5 s. The Mixer blends any two foods. The only "No effect" left is the Mortar with a boomerang banana and the peel with utensils that can't change it.
- **The banana peel trap works with six utensils:** Ice Cream Machine (ice patch), Whisk (a vortex that drags enemies onto it), Deep Fryer (oil slick), Cotton Candy Machine (sticky web), Mortar & Pestle (lobbed onto your aim point) and Oven Mitt (hurled 18 m ahead).
- **The Pan gives foods without an alt one:** smash a watermelon at your feet, plant a pineapple spike field, or fire a ring of 16 blueberries. With the cheese wheel it raises the shield at once, tired or not.
- **Delivery boxes.** Utensils now arrive in cardboard boxes that parachute in on a striped napkin, with a coloured light beam and ring so you can find them; the utensil inside is on the label. Three are waiting at the start and a new one drops every 16 to 24 s (up to 6). Walk into a box to open it, or splat it open with any food from range and race for the utensil that falls out. Bots without a utensil go and open boxes.
- **A busier kitchen.** New cover and things to climb: a bitten apple, a whole watermelon, a broccoli tree to hide under, a dropped donut you can stand in, a giant carrot and banana, a red pepper, an orange, a block of Swiss cheese, a cracked egg whose white is slippery, a pickle jar on its side you can walk into, spilled cereal, three knocked-over dining chairs (seats and backrests become walls, legs become hurdles), a pile of fruit in the table's bowl, and a loaf of bread, a pineapple and a bunch of bananas on the back counter, plus a strawberry on the island. All the giant food is vertex-coloured with two shared materials, so it adds only a few draw calls.

**Version 0.15: support utensils** (`src/utensils.js`, art in `docs/utensils/`)

- **20 utensils that boost your food.** They float around the kitchen on coloured rings (8 spots, a new random one 25 s after one is taken). Walk over one to carry it; you carry one at a time and a new one swaps out the old (since 0.17 you carry three). Knocked-out Titans drop theirs. In Chef's Choice you can also pick a starting utensil, and bots may bring one.
- **The food is always the shot.** A utensil rewrites the throw (splits it, coats it, speeds it up, flattens it, adds a charge) and adds an effect before or after the food's own impact, so a tomato still splashes and slows and an ice cube still freezes. Each utensil lists which foods it works with; the HUD says "No effect on Banana" when it doesn't apply.
- **Every boost has a cost:** extra food used, longer holds (Blow Torch 3 s, Microwave 1–2 s with an overcharge that pops on you, Ice Cream Machine and Mixer prep), heat that overheats (Deep Fryer, Oven Mitt), cooldowns (Oven Mitt, Peeler, Pan), recoil and self-slows (Colander, Blender), ricochets that can hit you (Rolling Pin), short range (Spoon, Grater) or a short random fuse (Popcorn Popper).
- **Zones:** the Whisk leaves a vortex that pulls enemies in, the Mortar & Pestle a drifting cloud of the food's effect, the Deep Fryer a burning oil slick and the Cotton Candy Machine a sticky web that fire or water destroys.
- **The Pan** fires your food's alt ability (Q) without its cooldown, slams a shockwave around you, then roots you briefly; the Pan has its own 7 s cooldown.
- **Looks:** pickups and the HUD use the same cartoon art as the design sheet, a small badge shows the utensil each Titan carries, and boosted food has its own look in flight (soft-serve swirl, flames, a plasma glow, an oil coat, a hex shield, a second food orbiting it, a spinning disc) and its own trail.
- **Online:** boosted throws carry the utensil and its numbers, so everyone sees the same projectile; incoming values are checked and clamped. Each player's utensil is shown on their badge.

**Version 0.14: new player models** (`src/human.js`)

- **One sculpted, skinned body per Titan** instead of about 20 capsules and spheres. The torso is lofted from cross-sections (chest, shoulder blades, spine, waist, glutes) with a ribbed crew-neck collar, a shirt hem over a belt with a buckle, and jeans. Arms and legs are single continuous limbs that bend smoothly at the elbow and knee (vertices blend between two bones), with deltoid, biceps and calf shapes, sleeve hems and flared pant hems. Hands have four fingers and a thumb (three joints each). Sneakers have soles, a toe bumper, a heel tab and laces, with socks showing above them.
- **A real face:** the skull is sculpted from a sphere (narrowing jaw, chin, cheekbones, eye sockets, temples, flat forehead). Eyes have a white, an iris, a pupil and a catchlight; upper eyelids blink every few seconds on their own bone. There are brows, a nose bridge, tip and wings with nostrils, upper and lower lips, a mouth line and ears.
- **10 hairstyles** (short with a fringe, spiky, long, bun, buzz, curly, mohawk, ponytail, bob, afro) and **3 beard styles** (stubble, full, goatee). Hair is a shell over the scalp that dips just under the skin past the hairline, so the hairline is a smooth curve. Each Titan also gets its own eye colour, sneakers and a height within ±4%.
- **Animation:** an 18-bone skeleton is posed every frame. There are walk and run cycles (thigh swing, knee bend on the swing leg, foot roll, hip bob and sway, spine counter-twist, arm swing with elbow bend) and poses for jumping, falling, gliding with the napkin, dashing, tripping, winding up and throwing, rapid-fire aiming, eating, the cheese shield, carrying a watermelon and flinching when hit. The head and chest tilt with the aim, and online players' aim pitch is sent so you see where they look.
- **Palette shader:** each vertex stores a part id (skin, shirt, cuffs, gloves, belt, buckle, shoes, soles, laces, iris...). The vertex shader looks up colour, roughness, metalness and glow in the Titan's palette. The whole body is **one draw call** whatever the outfit, and skins restyle it for free (long or short sleeves, gloves, boots, trims, collars, metal parts, glowing suits). A per-vertex AO term darkens armpits, creases, the crotch and under the chin.
- **Level of detail:** about 9k vertices within 30 m (14 m on Low) and 1.5k beyond, sharing the skeleton. Draw calls in a bot match went *down*, 208 → 170. Building all the geometry takes about 60 ms at startup.
- **Skins refitted:** every costume piece was remodelled around the new head and body and attached to the head, chest or hip bone, so helmets turn with the head and capes and backpacks move with the chest. Each skin also has full clothing colours (the ninja's red sash and gloves, the hero's red boots and gloves, the robot's chrome, the knight's chainmail).
- **First-person arm:** your own forearm and hand with fingers cupped under the food, in your skin tone, sleeve and gloves.
- **Locker:** 2x-resolution thumbnails and a live 3D turntable of the selected skin that idles, blinks, looks around and waves when you pick it. You can drag it to spin; its small renderer only runs while the Locker is open.
- Face hits use the new head position (hit sphere at 1.74 m). The first-person eye height is 1.72 m.

**Version 0.13:**

- **Food stains on every surface** (`src/stains.js`), not just the island top: the floor, the top of every counter, table, chair, box, can and plate, the sides of boxes and cabinets, and all four kitchen walls. Wall hits stain the wall; big splashes on the floor or a counter also run up nearby walls and cabinet fronts; juice from a Titan hit in mid-air lands on the ground below. Round props (glasses, fruit, the giant tomato) stay clean because a flat stain would float off them.
- How it stays cheap: every surface is cut into 512 px tiles, and a tile only gets a canvas, texture and mesh the first time it's splatted, so clean surfaces cost nothing. Each splat is generated once in metres and drawn into every tile it touches (no seams). Dirty tiles upload at most every 80 ms, and the tile count is capped per preset (70 / 90 / 110). A 90-second bot match stains about 40-55 tiles.
- Stains are less glossy (roughness 0.18 → 0.5, softer reflections) so their colour reads under the bright kitchen lighting.

**Version 0.12:**

- **Graphics settings** (menu → Graphics, and in the pause card; saved on the device):
  - **Preset:** Low / Medium / High, as before.
  - **Ray tracing:** Off / Reflections / Reflections + ambient occlusion. Browsers can't use RTX-style hardware ray tracing, so this is screen-space ray tracing: rays are marched through the depth buffer each frame. Reflections (SSRPass) show on shiny scenery (floor tiles, walls, steel, glazed pots); ambient occlusion (GTAOPass) adds soft contact shadows in corners and under props. With either on, MSAA is replaced by FXAA and a sanitize pass stops stray NaN pixels from being smeared by bloom. Heavy: it renders the scene extra times.
  - **Resolution:** Auto (dynamic, as before) or fixed 50 / 75 / 100 / 125 %.
  - **Particle effects:** Preset / Off / Low / Medium / High / Ultra (0 / 0.35 / 0.7 / 1 / 1.6 × particles).
- **High preset bloom** no longer washes out bright floors: threshold 0.88 → 1.9, so only burners, glints and highlights glow.

**Version 0.11:**

- **Titans are people now:** a head with eyes, eyebrows, nose, ears and a smile; hair; a neck; a shirt; jeans; arms with hands; legs with shoes. Each Titan gets its own skin tone (8), hair colour (8) and hairstyle (short, spiky, long, bun, buzz, curly). Legs stride when walking and a knee lifts in the air. Skins set the shirt and trousers, and every costume piece was refitted onto the human head and torso (helmets and hoods hide the hair). Your first-person arm shows your own skin tone, hand and sleeve. Face hits now use the smaller human head (0.3 m hit sphere at 1.7 m, was 0.43 m at 1.55 m).

**Version 0.10:**

- **Skins and the Locker:** 13 original costume outfits in a battle-royale locker style, with Common, Uncommon, Rare, Epic and Legendary tiers (no weapons, just hats, helmets, capes and back bling): Head Chef, Nori Ninja, Space Sprout, Sir Crumb, Captain Pickle, Rex Hoodie, Toastbot 3000, Waffle Wizard, Cool Cat, Super Spud, Viking Veg, Galaxy Glaze and Fruit Punch DJ. Pick one from **Locker** on the menu; it's remembered, your first-person arm matches it, bots wear random skins, and online players see each other's skins. Each outfit is merged per material, so it adds only 1-4 draw calls per Titan.
- **Chili Pepper:** time between throws 0.7 → 1.8 s.
- **Cheese Wheel shield:** raising it costs 25 stamina; it holds 150 HP (was 300); after it melts, a new one can't go up for 4 s.
- **New alts that only affect you** (each uses 1 of the food and has a cooldown): Carrot **Pole Vault** (leap forward, 4 s), Tomato **Tomato Bounce** (super jump, 5 s), Ice **Chill Out** (shake off burning, sticky and slows, 6 s), Chili **Hot Feet** (35% faster for 4 s, 12 s), Cookie **Sugar Rush** (full stamina, 12 s).

**Version 0.9:**

- **Mode menu:** Play vs bots opens a choice between **Classic** and **Chef's Choice**; Chef's Choice then shows the food picker.
- **Chef's Choice mode** (vs bots): pick 3 foods. They never run out (the hotbar shows ∞), but no food spawns anywhere: no floating pickups, grocery drops, Giant Tomato piles or loot from splatted Titans. Bots bring 3 random foods each. Food never heals in this mode (bananas and grapes can't be eaten); instead green heal crosses float on every third spawn point (21 on the map) and give +60 HP, returning 20 s after being taken. Hurt bots go for them. Your pick is remembered.
- **Carrot sniper:** full charge takes 1.6 s (was 1.0) but the carrot flies at 210 m/s (was 120). Speed grows with the square of the charge, so quick flicks stay slow and only a full charge gets the fast shot.
- **Phone held upright:** the Jump, Dash, Alt and Sniff buttons now stack above the aim stick instead of covering the health bar and food slots (the upright layout rules were being overridden by the landscape ones).
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
| 1–5 or mouse wheel: pick food | Turn (either way) or tap the food plate (bottom left) |
| 6–8 or R: pick utensil (you carry up to 3) | Turn or tap the utensil plate (bottom right) |
| Walk into a delivery box (or over a loose utensil) to carry it; with the Pan, Q slams | Same |
| Click the game to lock the mouse | |
| Esc or P: pause | |

## Code map

| File | What it does |
|---|---|
| `src/core.js` | Constants, collision (boxes and cylinders), ground queries, raycasts, lob solver |
| `src/world.js` | The kitchen, countertop props, giant foods and fallen chairs, hazards, launch pads, landmark tomato, Soap Tide wall |
| `src/foods.js` | All food data and behaviour: meshes, throw, impact, alt actions |
| `src/actors.js` | Titans: movement, statuses, diminishing returns, inventory; drives the rig each frame |
| `src/human.js` | The human model: lofted, skinned body and face, hair and beards, palette shader, skeleton posing, first-person arm |
| `src/skins.js` | Skins: rarity, clothing palettes, costume pieces on the head, chest and hip bones |
| `src/stains.js` | Food stains on every surface: decals cut from the scenery triangles, one atlas, one draw call |
| `src/net.js`, `src/viewmodel.js` | Online rooms (hosting, shared rounds and bots); first-person arm and held food |
| `src/map-backyard.js` | The Backyard BBQ map |
| `src/projectiles.js` | Projectile flight, boomerang steering, rolling, hit detection (body capsule and head) |
| `src/items.js` | Pickups and spawners, peel traps, stuck carrots |
| `src/utensils.js`, `src/utensil-models.js`, `src/utensil-art.js` | The 20 support utensils: throw rewrites for every food, impact effects, zones, delivery boxes, loose utensils; their 3D models; the flat design-sheet art (generated by `docs/utensils/build.mjs`, used only if the 3D icons can't be rendered) |
| `src/surface.js` | Surface State Grid and zone visuals |
| `src/bots.js` | Bot AI |
| `src/game.js` | Match flow, online rounds and loadouts, damage and kills, Soap Tide, camera, aim preview |
| `src/potwars.js` | Cooking Pot Wars: pots, ladles, turrets, carrying pots home, respawns; online, the host's pots |
| `src/teams.js` | Teams: sizes, colours, home patches, who goes where, the last team standing, the team bar |
| `src/spectator.js` | Spectator mode: the cinematic director, overview and follow cameras, minimap, Titan bar and player card |
| `src/hud.js`, `src/dials.js`, `src/input.js`, `src/fx.js` | HUD, the phone plate dials, controls, particles, sound |

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

- Online rooms are peer-to-peer over presence: the host runs the round and the bots, and each player's game decides hits on themselves, so a player with a slow connection can see a hit land a little differently than the thrower did. Pickups and delivery boxes are per player.
- Bots steer with simple wall-following and launch pads rather than real pathfinding.
- The upper cabinets, window sill and ceiling pot rack are scenery; they aren't reachable yet.
