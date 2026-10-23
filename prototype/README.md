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

**Version 0.48: carrots hit online, clearer pot meters, and online fixes** (`src/net.js`, `src/game.js`, `src/foods.js`, `src/projectiles.js`, `src/actors.js`, `src/potwars.js`, `index.html`)

- **Carrots (and blueberries and grapes) hit online.** Online, each player's own game decides the hits on them, against where they really are; a thrower aims at where they see their target, a moment behind. For a slow lob that hardly matters; a carrot flies at up to 210 m/s and is 0.18 m wide, so against anyone moving it nearly always missed on the target's screen. Now, for those three foods, the thrower's game decides whether the food itself hit, and sends the hit (its damage, up to 400, and what else it did: a freeze, a burn, a slow, a shove); the target's game applies it. Its own copy of the shot only splashes. Zones and blasts made from them (a Whisk vortex, a Mortar cloud) are still decided by the target's game. Checks: the hit must name one of their own Titans, the thrower within 300 m, at most 60 hits a second on each Titan.
- **Pot meters:** the team bar under the top pill wraps into rows instead of running across the scoreboard; its pot meters are bigger, outlined, and slide as a pot takes hits. The label over each pot shows its health as a number and a bigger, outlined meter (not to be mixed up with a Titan's).
- **Other fixes:**
  - **Pot turrets kept a spread as one line:** all 8 grapes from a turret flew along one line and hit the same Titan (about 90, enough to splat anyone in Cooking Pot Wars); spoon and knife spreads too. Each piece now keeps its own direction (a turret grape shot spreads 10.9°, by hand 10.3°).
  - **One gunner per turret, online too:** a bot or a second player could climb into a turret someone on another screen already sat in.
  - **A carried pot stuck "carried":** if its carrier's game dropped it, or the delivery got lost, the pot never came back and its team waited forever. The host now puts it back after 3 s.
  - **Other players flash** when they're hit (they never did on your screen).
- Tests: online, Alice throwing at Bob running side to side 25 m away (8 throws each): carrots, before 0 damage (2 hits on her screen), now every hit she saw counts (3 hits, 165); blueberries the same; an Ice Cream Machine carrot that hurts Bob and freezes him on his screen; pot meters on both screens while Bob smashes a pot; the Cooking Pot Wars online test (smash, carry home, turret level, turret power) twice; turret grape spread; the floor, abilities, utensils and earlier online-fix tests. No errors.

**Version 0.47: the play in the shot, and snipes up and down** (`src/highlights.js`)

- **The play stays in the shot.** Three things lost it:
  - The wide shot of thrower and target couldn't back off past 30 m, so with the two far apart (a far hit with no flight to ride, such as a splash or an ability) the thrower fell out of the frame. A far play like that is now filmed like a long throw (over the thrower's shoulder, then the reverse angle from behind the one it hit), and the wide shot backs off to 42 m if it must.
  - When something stood between the wide shot and the play, the camera was pulled in close to the middle of it, losing both of them. Now it rises over whatever is in the way instead.
  - The over-the-shoulder shot looked level (at most 2.5 m up or down), and the reverse angle leaned back by the distance across the floor only. A throw from up high or up at a shelf missed its target, or its thrower. Both now go along the real line of the throw, up and down included, and the over-the-shoulder camera keeps up with a dashing or jumping thrower.
- **Snipes up and down:** a throw's distance has counted its climbs and drops since 0.40 (a carrot from 46 m up at someone 4 m across is a 45 m snipe); now those plays are also shot along that line, so you see the drop.
- Tests: bot matches on all three maps, every shot of their reels checked for who's in it. Frames that miss the one they're about went from 24 of about 106 (the wide shot alone: 16 of 32) to 11 of 110 (the wide shot: 1 of 12), and after the over-the-shoulder camera kept up, 0 on a restaurant match (54 frames). A snipe splat thrown down from 46 m and one thrown up 46 m: a 48 m snipe splat each, thrower and target both in the over-the-shoulder shot and the target in the reverse angle. No errors.

**Version 0.46: splats show what wore them down** (`src/highlights.js`, `index.html`)

- **A lead-up before every splat in a highlight reel:** up to 3 of the foods that hit the splatted Titan in the 8 s before it, the biggest of them (a stream of blueberries counts as one hit, its biggest), shown in order in quick cuts at full speed: each one close beside them as the food flies in across the shot and bursts, with the damage it did ("-45", "Headshot -30") and a small splash ring, then the next. Then the splat itself, as before (riding a long throw, the big food-coloured explosion).
- Any thrower's hits count, not just the one who splatted them, and ability hits too (a tomato slam). A hit the splat's own clip already shows isn't repeated; a splat with no earlier hits starts straight away. Online round reels get the same.
- Tests: bot matches on the kitchen, the restaurant and the backyard, their reels stepped through: which splats got a lead-up and which hits (a carrot for 45, a cookie for 18, a carrot for 55, then the snipe splat), a screenshot of every lead-up hit landing (the one it hit in the shot each time) and of each splat; the online round reel test. No errors.

**Version 0.45: online on a slow connection** (`src/net.js`, `src/p2p.js`, `src/main.js`)

- **Settings, Online connection:** Auto (the default), Normal or Low internet. It takes effect at once, also in the middle of a round.
  - **Low internet** sends your update 10 times a second instead of 30, so it uses a quarter to a third of the data. The host of a room with 9 bots goes from about 90-110 KB/s to about 25 KB/s; a player from about 7 KB/s to 2 KB/s. Each piece of news (a throw, a splat, a pickup) still goes out at least 3 times. In a public (peer-to-peer) room the player whose browser connects everyone passes the others' updates to a Low player 10 times a second too (only the latest of each), so it downloads less as well.
  - **Auto** turns Low on when the device says its connection is slow or set to save data (Chrome and Android tell), or when the line can't keep up (updates had to be held back, 5 in 5 s). It says so ("Slow connection: low internet mode is on") and goes back to Normal after 30 s without trouble.
- **For everyone, on any connection:** an update never waits behind older ones. When a line is still busy sending, the update is skipped (the next one carries everything) and the connecting player keeps only the latest update of each player for that line. Before, a slow line queued every update, and the game fell further and further behind (lag that kept growing).
- **Smoother on few updates:** other Titans are drawn ahead along their path by up to about one and a half update gaps (at most 0.45 s), so they glide instead of jumping between updates.
- Tests: updates per second and data per second on a steady 60 frames a second, Normal against Low, for the host with 9 bots and for a player; the connecting player passing 3 players' updates on to a Normal line, a Low line and a busy line; Auto switching to Low on a jammed line; the shared-floor test and the ultimate alts test with everyone on Low (same floor; hits land). No errors.

**Version 0.44: online, everyone sees the same floor, and a round of online fixes** (`src/net.js`, `src/items.js`, `src/utensils.js`, `src/game.js`, `src/world.js`, `src/core.js`, `src/abilities.js`, `src/actors.js`, `src/teams.js`, `src/foods.js`, `src/projectiles.js`, `src/potwars.js`)

- **The same food on the floor for everyone.** Online, every player's game used to put its own random food on the food spots, and picking food up only happened on your own screen (and the same went for the utensil delivery boxes and loose utensils). Now:
  - **Food spots** fill from a seed (the room, the round, the spot and how often it has refilled), so every game puts the same food there. The host decides when a spot refills and shares which spots hold food.
  - **Everything else that lands on the floor** is dropped by one game and sent to the room with a name: a splatted Titan's foods (by their own game), a banana off a wall (by the thrower's), grocery drops, pot spits and the giant tomato's piles (by the host's), utensil boxes (the host's) and loose utensils (whoever dropped them). Picking something up, or opening a box, takes it off every screen.
  - **Tossed food lands on the same spot** on every screen (it falls in fixed steps).
  - **Late joiners and missed messages.** Someone who joins mid-round gets told what lies around. The host also shares a short check of the floor, and a game that disagrees for 3 s (say a tab was in the background and missed some messages) asks for it again and gets put right.
- **The same map for everyone.** The kitchen's crumbs, every map's food spots and the burners' timings were random per computer, so obstacles stood in different places for different players. Maps are now built from a fixed seed, and the burners follow a timetable from the round's start.
- **Other online fixes:**
  - **The Soap Tide hurt non-hosts at the wrong rate.** It now hurts every player at the host's rate; before, a player who came from the menu took 2 per second to the end, so they could outlast everyone. Non-hosts also get "The Soap Tide is rising".
  - **A host whose game stopped for a while** (a tab in the background) came back and took the room back, restarting the new round. Now it follows whoever took over.
  - **When the host left, nobody "wins" any more.** Before, a player called "Titan" could get "Chef's Kiss!" and winner coins.
  - **Banana peels:** used up for everyone when someone slips, and a peel's utensil mark (ice patch, whisk vortex, fryer slick, cotton candy web) shows and works on every screen.
  - **The Pan slam's shockwave** and a tomato dash's bump (with no tomato left) now hurt and push other players, not just look like it.
  - **Splats by the host's bots** count on the scoreboard.
  - **No more "ghost splat"** in the middle of the map when someone who's out (watching, or a splatted bot) is first seen.
  - **Honey pools and the giant tomato** are the same for everyone (the host's).
  - **Cooking Pot Wars:** a round doesn't end while a pot is being carried off (it can still come home).
  - **Safer messages:** names from the room can't be built-in property names that would crash a game.
  - **Messages last longer:** each update's news (a throw, a splat, a pickup, a bounce on a jelly pad) stays in a player's updates for 1.5 s (was 0.7 s), so a slow game that reads the room only every few hundred milliseconds still gets it; a pickup the host missed is said again.
- Tests (two or three players in a stand-in room, plus a real peer-to-peer room with a local matchmaking server): the floor compared item by item between players on all three maps and in all three modes, at the start, after pickups, a box opened, a splat, the bots playing, two 3.5 s stalls of one game, and into the next round; a third player joining mid-round, after food spots had refilled 30+ times; the tide's rate, a peel used up with its ice patch, a Pan slam, the host's game stopping for 7 s and the host leaving; the earlier online tests (Cooking Pot Wars, Duos, ultimate alts, utensils, rounds, highlight reels); and Play vs bots on every map in Classic and Chef's Choice. No errors.

**Version 0.43: no stray name tags** (`src/hud.js`)

- **A bot's name and health bar stuck on screen online:** starting an online room with no bots removed the bots fighting behind the menu, but their name tags stayed where they were last drawn, frozen on the screen (so they seemed to move with the camera). A name tag now goes when its Titan leaves the match (bots, or a player who leaves).
- Tests: an online room with bots set to None, alone: before, the tags of two menu bots ("Tofu", "Dumpling") stayed on screen; now none. A match vs bots still shows the bots' tags. No errors.

**Version 0.42: help for iPads, and no silent failures** (`index.html`, `src/main.js`)

- **Shows why it didn't start:** a small script runs before the game's own code. Any error before the game is up, or no game after 20 s, puts a box on screen with the error, the browser and whether WebGL 2 is there (the game needs it: iPadOS 15 or newer), instead of an empty page.
- **Older Safari:** `.at()` (only in Safari 15.4 and later, used throughout the game) is added where it's missing.
- **Safe mode after a crash:** Safari quietly reloads a page that runs out of memory. If the last start didn't make it 15 s, the game starts on Low with a lower resolution, smaller splat textures and fewer particles.
- Tests: an iPad-sized touch screen with Safari's user agent starts normally (touch controls, no box); reloading right after a start comes back in safe mode, and the flag clears after 15 s; a page with WebGL broken and a start error shows the box with both. No errors.

**Version 0.41: a Mobile / PC switch** (`src/input.js`, `src/main.js`, `index.html`)

- **Settings, Controls:** Auto (what the device says, shown in brackets), Mobile (touch sticks and buttons) or PC (keyboard and mouse). It's remembered, and a change reloads the page (mid-match it asks first, since that leaves the match). Useful on a touchscreen laptop or a tablet with a keyboard, where the guess can be wrong.
- The touch layout in the page's styles now follows the chosen controls (a `touchui` class on the page) instead of the kind of pointer the device has.
- Tests: on a PC, picking Mobile brings up the touch sticks, plates and buttons in a match; on a phone, picking PC hides them and shows the keyboard hotbar. No errors.

**Version 0.40: distances up and down, bots that climb to a pot, fewer see-through things** (`src/highlights.js`, `src/bots.js`, `src/potwars.js`, `src/world.js`, `src/map-restaurant.js`, `src/map-backyard.js`)

- **Highlight distances count up and down:** a throw's distance is now how far the food actually flew, along its arc: climbing, dropping off a counter, curving (a seeking chili). The counter ticks up with it all the way (before, it counted only progress across the floor) and the captions and the 30 m for a snipe use the same distance. For example, a chili that crossed 43.7 m of floor while dropping 13.5 m now counts 49.1 m.
- **Bots climb to a pot that's up high:** in Cooking Pot Wars a bot raiding (or guarding, or carrying home to) a pot up on a counter or a table used to walk straight at it and stand on the floor under the table, swinging at the tabletop. Now a bot below a pot takes the spatula pad that lands nearest it first, and only swings when it's level with the pot.
- **Fewer see-through things:**
  - Shapes open on one side were drawn from the front only, so from the other side they vanished: the restaurant's lamp shades and chandelier shades from below (you saw only the bulbs), the round tables' tablecloth skirts from underneath, open cups, half domes and flat panels from behind. Every opaque open shape in the scenery is now drawn from both sides (on all three maps; glass and water stay as they are).
  - Glass was so faint that glasses, jars and cups looked like they weren't there (about a third solid): now about two-thirds solid and drawn from both sides, so a martini glass or a jar reads as glass you can't see straight through. Water in the sink, pool and ice bucket, the ice cubes and the bar's punch are nearly solid too.
- Tests: the restaurant with one team's pot on a round dining table (30 m above the floor): before, bots spent the raid on the floor under the table and the pot kept all its health (300); now none stood under it, two enemy bots got up onto the table and knocked it down to 195. Screenshots of the same spots before and after (lamp shades from below, the tablecloth skirt from underneath, martini glasses, a jar, the ice by the pool). Every recorded throw's flight distance against its floor and straight-line distances. Highlight reels still put the match back exactly; no errors.

**Version 0.39: reels about the splats, and splats that land** (`src/highlights.js`, `src/fx.js`)

- **Splats first:** a reel picks knockouts first (splats, snipe splats, double splats, the winning splat), then snipes and big hits, and a dodge only to fill a gap: one at most, and never the last play while there's a splat to end on. (Before, up to 3 dodges could make a reel, and a good dodge could be its best play.) The same in your reel and the online round reel (where your own best play, a splat if you have one, is always in).
- **The splatting throw lands all the way:** the food that knocks someone out used to stop at the edge of their body (where the game counts the hit), which slow motion made plain. In the replay it now flies on right into them (their chest, or their head on a headshot) before it bursts, and the one splatted squashes flat as it does.
- **A bigger explosion for the splat** than any hit: the food splattered everywhere in its own colours (tomato red, carrot orange, banana yellow, cookie crumbs ...), a cloud of it, the confetti, a shockwave ring in the food's colour plus two more, a longer freeze, a harder shake and lens punch, a louder boom and the splat-out sound. The burst blooms even while the frame is held.
- Blueberries' flights are recorded too now, so a blueberry knockout flies in like any other.
- Tests: full bot matches on the kitchen, backyard and restaurant maps: the match reels were 6 splats out of 6 on each (before: snipes and dodges mixed in), your reel at most one dodge; at every knockout the one splatted is in the shot as the food goes in, and the screenshots just after show the food-coloured explosion (chili, carrot, banana, cookie); reels put the match back exactly; online round highlights as before (both players, the next round waits, no updates refused); no errors.

**Version 0.38: highlight reels online too** (`src/highlights.js`, `src/game.js`, `src/net.js`, `src/main.js`, `src/spectator.js`)

- **Round highlights:** when an online round ends, everyone in the room gets a short reel of that round's best plays (up to 3, always with your own best play in it, the best last), shot the same way as against bots: riding along with long throws in slow motion, wide shots of close plays, bullet-time dodges, impact freezes and hero shots. Skip (or Esc) and Next (or Space) work as before.
- **The next round waits for it:** the host starts the next round once everyone has watched or skipped their reel (at most 32 s longer than the usual 6 s break). Someone who skipped sees "Next round once everyone has seen the highlights" while the others finish.
- **The match doesn't stop for it:** online the match can't wait for one player (the host still runs the room, its bots and the clock), so it carries on underneath while the reel plays: every frame the reel poses the recording, the frame is drawn, then the live match is put back exactly as it was. The live match's sounds and bursts are muted under the reel, and your Titan takes no input while you watch.
- **What each player's game records:** the round as it saw it: every Titan in it (players who drop in late and the host's bots too), hits on other players as they showed on your screen (their own game decides the real damage), and knockouts as the room reports them (they come a moment after the hit; the reel shows the hit itself, and the one splatted squashes flat right then).
- While a reel plays the game no longer grabs the mouse, so Esc only skips the reel.
- Tests: two players in a room (the stand-in room, as strict as claude.ai's), the bots and one player fighting at 4x speed on the kitchen, backyard and restaurant maps: when the round ended both got "Round highlights" (3 plays each, each with that player's own best play: a 67 m carrot snipe, dodges), the match's clock and the room went on underneath, each saw the other watching, the host held the next round while either watched (still waiting after Bob skipped), started it as soon as Alice skipped too, and both dropped in; no updates refused by the room; Cooking Pot Wars online as before; reels against bots still put the match back exactly; no errors.

**Version 0.37: highlight reels shot like a sports replay** (`src/highlights.js`, `src/world.js`, `index.html`)

- **Long throws ride with the food.** On a throw from 13 m or more the camera starts over the thrower's shoulder as they let go, then rides right behind the food itself, in slow motion that gets slower and slower as it barrels toward its target (a carrot snipe at 200 m/s slows almost to a stop, a lobbed tomato only a little: every ride takes 2 to 3.6 s). The target is ahead of it all the way; the camera lets the food fly the last few metres alone and watches it hit. Speed lines rush past at the edges, and a counter at the top counts the metres as it flies (the full distance pops up in yellow as it lands). Then the reverse angle: from behind the one it hit, back along the glowing trail of the throw to the thrower far off.
- **The whole play, not a close-up.** A closer play is one wide shot from beside the thrower and the target that keeps both in frame all the way (worked out for the shape of the screen, a phone held upright included), drifting round them and slowing down into the impact. A dodge of a throw from far off is seen over the dodger's shoulder as it comes in, then in bullet time: the camera circles the dodger as it whizzes past. Every camera spot is checked for a clear view of the players, decorations included (the world now keeps an outline of each one, since some aren't solid), so a camera no longer ends up inside a cake.
- **Every impact hits hard:** the frame it lands on freezes for a moment, with a white flash, a shockwave ring, the lens punching in, a shake, a boom and a big word ("Splat!", "Headshot!", "Sniped!", "Double!", "Winner!", "Dodged!"). The one it splats stays in the shot as it lands and squashes flat into the confetti (before, they could vanish a moment before the food got there). A glowing trail in the thrower's colour draws the path of every throw in the play.
- **Feel powerful:** every play ends on a hero shot of whoever made it: low, in front of them, looking up and pushing in (the best play gets a fanfare; the winning splat cranes up and away over the arena). No hero shot for someone splatted straight after, or falling off a ledge.
- **Smooth slow motion:** each throw's flight is recorded 30 times a second, from the hand to the exact point and moment it hit (before, only 15 times a second, so in slow motion food jumped from point to point and a fast carrot could appear metres out from the hand). The food, its spin and the Titans move along smooth curves between the recorded moments, and food no longer hangs in the air after it has landed.
- **Captions out of the way:** a play's caption shows as it starts, fades out for the action and comes back for the last shot. A play with several slow-motion moments (a triple dodge, say) is quickened in its slow parts, so a play lasts at most about 10 s (11 s for the best one).
- **More dodges spotted:** carrots, bananas, ice cubes, soda and cheese count now (they have no fixed damage, so the dodge spotter skipped them), and the whole stretch a fast throw covers between two moments is checked, so a carrot whizzing past at 200 m/s counts.
- Tests: full bot matches on all three maps with "you" driven like a bot, both reels stepped frame by frame with a screenshot at the start and middle of every shot and at every impact, on a wide screen and on a phone held upright: snipes from 35 to 70 m (carrots at 200 m/s, chili peppers, cookies) ridden all the way in, long and close splats, double splats, a quadruple dodge; the thrower in frame over their shoulder, the target ahead on the ride, the one it hit in the reverse angle, both players in the wide shots and whoever made the play in the hero shot (on the phone too, once its lens was widened); a reel played to its end, or stopped half way, puts the match back exactly (positions, the clock, every Titan's size) and the match plays on; no errors.

**Version 0.36: highlight reels at the end of a match** (`src/highlights.js`, `src/game.js`, `src/projectiles.js`, `src/main.js`, `index.html`)

- **Two reels:** when a match vs bots ends, **Match highlights** plays by itself: the best plays of anyone in the match. The end card then has **Match highlights** and **Your highlights** (only plays you made) to watch again; both are also on the card you get when you're splatted before the end (the match waits while a reel plays, then carries on exactly where it was). Skip (or Esc) ends a reel, Next (or Space, Enter, the right arrow) jumps to the next play.
- **What counts as a highlight** (each play gets a score, the best are picked, best last):
  - **Splats**: knockouts. More for a long throw, a headshot, a throw from the air; a **double / triple splat** when one Titan splats several within a few seconds; the **winning splat** that ended the match.
  - **Snipes**: a hit of 14 or more from 30 m away or further; a **snipe splat** if it knocked them out.
  - **Dodges**: a dangerous throw (12 damage or more) passing within about a metre of a Titan who was running, dashing or in the air, and missing; a **double dodge** (or more) when they come close together. (A dodge followed straight away by a splat counts for less.)
  - **Big hits** (your reel only, to fill it out): 30 damage or more, or a headshot.
  - A reel has up to 6 plays (5 in yours), no two overlapping, no more than 3 of one kind when there's a choice.
- **How it looks:** letterbox bars; a title card ("Match highlights · 6 plays"); per play a caption (the kind of play in a big badge, who did what to whom, how far) and its number; the camera cuts **over the thrower's shoulder** as they throw, **chases the food** through the air on a long throw, then goes to **slow motion round the impact** (following the target as it's knocked back) with a white flash and a big "Splat!", "Snipe!" or "Dodge!", and ends on a **reaction shot** of the thrower (a dodge: a wide shot of the throw coming in, the dodge close up and slowed down, then a crane up and away). "Play of the match" (or "Your best play") before the last one; a fade out to the end card. The bursts and sounds of the match are replayed with it, and the Soap Tide is where it was.
- **How it works:** the match is recorded 15 times a second (every Titan's position, facing, aim, movement and state, what they hold; every flying food; every burst and sound). Only the frames around scored plays are kept (plus the last 9 s), so a 5-minute match keeps about 2 to 3.5 MB. A reel poses the Titans and food from the recording, and puts everything back exactly afterwards. Online rooms have no reels (the other players' games decide too much of what happened).
- Tests: full matches on all three maps with "you" driven like a bot: 30 to 45 plays scored (splats, snipes, dodges, a triple splat), both reels picked and played through (title, every shot type, the "Play of the match" card, the fade, then the end card with both buttons); a reel stopped half way puts the match back exactly (positions, health, held food, flying food, the tide, the clock) and the match plays on.

**Version 0.35: no more invisible walls, glasses you can see, bowls with insides, and no meat** (`src/world.js`, `src/map-backyard.js`, `src/map-restaurant.js`, `src/main.js`)

- **Invisible objects, found by a scan.** A new test looks at every solid shape on all three maps from outside and checks that something is drawn where you would bump into it (a Titan is under a metre wide, so a shape a metre or two bigger than its drawing is an invisible wall). It found about 140 of them. The worst:
  - the backyard benches' end posts were solid but not drawn at all (now drawn);
  - the picnic table's slanted legs and the grill's legs were solid as wide upright blocks (now solid along the leg);
  - the restaurant's back bar was a solid block 7 m deep in front of the bottles (now: the back panel, the shelves and each bottle), and the bar, the buffet, the kitchen pass and both kitchen counters were solid under their overhanging tops (now: the cupboards, then the top);
  - the martini glasses, wine glasses and the jam jar were solid cylinders around nearly invisible glass; the coffee maker had a solid block above its pot; the sink tap was a bar under its arch; the mug's handle faced sideways inside a solid box; a fruit bowl, a bread basket, a fruit platter and food on plates were solid well beyond the food;
  - round things (domes, bowls, tree trunks, cans and bottles on their side, the rolling pin, the watermelon, the bananas, the carrot, the croissant, the olive, the cupcake) now have solid shapes that follow their outline: stacked rings for upright ones, round slices for lying ones, short pieces along curves and slanted legs (new helpers in `src/world.js`: `_rod`, `_rodOf`, `_roundCols`, `_lyingCyl`, `_ring`, `_bananaCols`).
  - Glasses and cups are solid up to their drink, then a thin wall up to the rim, so you can stand in them on the drink instead of on an invisible lid.
  - Some things were drawn see-through from one side: the pots on the rack had no bottoms, the mop bucket was the wrong way round (open at its bottom), the knocked-over wine glass had its stem sticking out of its mouth, the croissant's ends were open, half of the backyard's watermelon slice was under the lawn (its solid half stood there invisible). All fixed.
- **Glasses and cups are easier to see:** a little more solid glass, and an opaque rim on every glass, jar and cup (the coffee pot, the jam jar, the spice jars, the dining glasses, the martini and wine glasses); paper cups show their inside and lemonade; the martinis have a drink in them; the mug has coffee in it.
- **Bowls have insides:** a bowl used to be drawn as an outside only, so from above you saw straight through it to the table. Now each has an inside of its own colour and a rim: the dining table's fruit bowl is blue with a cream inside, the bar's bowl of limes red with a cream inside, the stack of bowls on the back counter teal with a cream top (it was orange, like the counter).
- **No meat on any map:** the backyard grill has a zucchini and a ring of pineapple (sausages and a burger patty before), the picnic sandwich has tomato (ham), and the giant burger on the blanket is now a giant cupcake (paper case, three swirls of frosting, a cherry). In the restaurant the carving station's roast is a big wheel of cheese, the spaghetti has cherry tomatoes and basil (meatballs), the steak is a stack of pancakes with butter and syrup, and the meatball on the floor is a giant green olive with its pimento. (Skins are unchanged.)
- Tests: the invisible-object scan on all three maps (about 140 suspect shapes before; after, a few small edges of curved things, 1 to 2 m at most: the carrot's thin tip, a piece of the watering can's spout, the edge of the fruit pile; plus the mop bucket's mouth and the walk-in pickle jar, which are open on purpose); screenshots of every changed spot; launch pads on all three maps (all land where they did before); 90 s bot matches on each map (bots get stuck no more often than before).

**Version 0.34: online Cooking Pot Wars: splatted players respawn instead of the round restarting** (`src/game.js`, `src/potwars.js`)

- **The bug:** the host starts a fresh round when nobody who wants to play is still in the round. It counted only Titans standing up, so in Cooking Pot Wars, when every player was splatted at once (always the case when you play alone with bots), the host restarted the round after 5 s, the same moment the pot would have respawned you.
- **The fix:** a splatted player who played this round and whose pot still stands (or is being carried off) counts as in the round: they respawn at their pot as they should. Once the pots are gone, a fresh round still comes as before.
- Tests (online, two players): both splatted at once respawn in the same round; the host alone splatted respawns; with both pots smashed, a new round starts; and the earlier Cooking Pot Wars online test.

**Version 0.33: online play that works, in every mode** (`src/net.js`, `src/p2p.js`, `src/main.js`, `src/hud.js`, `index.html`)

Why online play failed, found by measuring and by the platforms' own rules:

- **On the claude.ai page, the game was over the room's size limit.** The claude.ai `room` capability takes at most 4 KiB of presence per player (UTF-8 JSON) and refuses a bigger update outright (`invalid_argument`), and the game threw the refusals away silently. The host's updates (its 11 bots, the round, the pots and the event log) were the biggest. Measured over 2 minutes of a hard-bot room: the host's updates were about 2 KB on average, 1 in 10 over 3.4 KB, and the biggest 5.3 KB (Classic), 5.7 KB (Cooking Pot Wars) and 7.6 KB (Chef's Choice). Every refused update was lost, with its throws and knockouts.
- **On the claude.ai page, the public peer-to-peer service can't be reached.** The page runs in a sandbox whose security policy allows no connections but claude.ai's own (`connect-src 'self'`), so PeerJS couldn't reach its server, and only people signed in to claude.ai whom the game is shared with can use the claude.ai room; a friend who opened the link signed out, or as a public link, got a vague "couldn't reach the online service".
- **The public game page wasn't on.** GitHub Pages isn't enabled for the repository yet (it reports `has_pages: false`), so https://btbeep-luftikuss.github.io/foodfightgame/play/ doesn't exist until the repository owner turns it on (Settings, Pages, Deploy from a branch, this branch, `/docs`).
- **A player could end up in a different place from the others.** Each page tried the peer-to-peer service first and the claude.ai room second, so one player whose network blocked a direct line to the room's host fell back to the claude.ai room while the others stayed peer-to-peer, and they never met.

What changed:

- **Every update fits in 4 KiB (3,900 bytes, measured in UTF-8).** Throws leave out every field a receiver assumes anyway (about 140 bytes each instead of 190 to 230), velocities go to one decimal, and a bot's name, colour and skin come round every 10th update instead of every one (the host's bots: 1.1 to 1.3 KB instead of 1.4 to 1.6). The events are packed by how often they've gone out: those sent the fewest times first (pot moves count a fifth, so they go out five times as often), each sent several times in case one update is missed. Receivers now keep the numbers of the events they've had, so events may arrive in any order. Any number that isn't finite goes out as 0, and the update is sent as plain JSON.
- **Fields go away properly.** The room merges each update into the last one, so a player who stopped hosting kept saying they hosted (with old round and bot data); now what isn't yours goes out as `null`, which takes it off (the peer-to-peer rooms do the same now).
- **One way per page:** on claude.ai the game uses the claude.ai room; anywhere else (the public game page) the peer-to-peer service. Everyone who opens the same link meets in the same place.
- **Clear messages:** the Play online screen says who can join from where you are; joining says why it failed (on claude.ai: not signed in or not shared with you, with the public page's link; elsewhere: the matchmaking server can't be reached, or the room's host can't be linked to). A refused update, or the room ending, is noted in the browser console, and the top pill says Offline if the room ends.
- **Peer-to-peer:** more STUN servers (Google's and Cloudflare's) besides PeerJS's relay (TURN) servers, a longer wait for a line through a relay (8 s), and up to 20 s to find the room.
- Tests: update sizes over 2 minutes of hard-bot rooms in all three modes (biggest 3,899 bytes, none over 4,096), with a stand-in room as strict as claude.ai's (it refuses over 4 KiB or non-JSON values); a storm of 40 extra throws a second from a host running at only 5 frames a second (far fewer updates than a real game's 30 a second): in Classic every throw reached the other player, in Cooking Pot Wars with 13 Titans 792 of 824, and over real peer-to-peer 837 of 842; the claude.ai path end to end (a stand-in claude.ai room: two players, the host's bots, throws seen); the messages for a viewer claude.ai doesn't admit, a matchmaking server that can't be reached, and a host that can't be linked to; and the earlier online tests (Cooking Pot Wars over the mock room and over real peer-to-peer, the alts online, Duos).

**Version 0.32: steadier online rooms, for Cooking Pot Wars above all** (`src/p2p.js`, `src/net.js`, `src/potwars.js`)

- **A room no longer breaks when the host's line to the introduction server hiccups.** Before, any error on that line after the room was up shut the host down completely, so everyone lost the room (long Cooking Pot Wars matches were the most likely to hit it). Now the host keeps every player and quietly reconnects to the server every few seconds so newcomers can join again.
- **3 or more players:** a newcomer used to get everyone's state in one message, and with three or more players that could pass PeerJS's limit (about 16 KB) for one message, which dropped the newcomer. Now it's one message per player. Messages that would be too big drop their oldest throw events first (never the pot moves), and a "message too big" or "not open yet" warning no longer counts as a lost connection.
- **Cooking Pot Wars: a player who joins after the setup** on a team of bots now gets their own pick of the 5 foods the pot spits out (it used to stay random).
- Tests: Cooking Pot Wars over the real peer-to-peer rooms (a local PeerJS server, separate browser profiles): pots placed, smashed, carried home, turret shots and menus agree; 5 players in one room, with the host losing the introduction server mid-game and a fifth player joining after.

**Version 0.31: ultimate alts for every food, and a third map: the restaurant** (`src/abilities.js`, `src/foods.js`, `src/actors.js`, `src/items.js`, `src/bots.js`, `src/map-restaurant.js`, `src/hud.js`, `src/net.js`)

- **Every food's alt (Q, F or right click) is now a big power move**, with a call-out under the crosshair, a coloured flash, a camera kick, hit-stop on big hits, shockwave rings, new sounds and particles. The HUD shows each alt's cooldown in seconds, and a chime says when it's back.
  - **Tomato: Dash.** A tackle for half a dash's stamina (15). Slam into a Titan or a wall and a second tomato bursts in a big splat (up to 48 damage, knockback, a slippery puddle). No second tomato: just a bump. 3 s.
  - **Ice Cube: Ice Storm.** Throws a ball of 3 ice cubes; where it lands a whirlwind (10 m) pulls every enemy toward its eye, spins them, slows them 35% and nibbles at them for about 4 s. 8 s.
  - **Watermelon: Smash.** In mid-air, slam down. The higher you fall from, the bigger the hit: 26 damage in 4 m from a short hop, up to 100 damage in 16 m from very high (Mega Jump first, then Smash). 3 s.
  - **Soda Can: Mega Jump.** From the ground only: a geyser launches you about 23 m up and blasts everyone within 6.5 m (up to 34 damage, thrown upward), leaving a sticky soda puddle. 5 s.
  - **Grapes: Juice Ball.** A giant ball of juice; it splats into a 6.5 m purple puddle that slows everyone in it by 45% for 8 s. (Grapes can't be eaten any more; bananas still heal.) 4 s.
  - **Pineapple: Spike Line.** Up to 15 giant spikes burst up one after another along the ground ahead (about 23 m); a spike that comes up under a Titan deals 24 and throws them back; the spikes then hurt and slow whoever touches them for about 3 s. 6 s.
  - **Jelly Cube: Jump Pad.** Bounces you about 22 m up (it was 12), keeps your run-up, and has a durability meter: 6 bounces, then it bursts. 45 s, 2 per player. 2 s.
  - **Carrot: Teleport.** Uses 3 carrots. A 1.4 s wind-up (purple ring; you move at half speed); any hit cancels it and you keep the carrots. Then a slow, glowing carrot flies (42 m/s against a carrot's 210) and you warp to wherever it lands. 6 s (2 s after a cancelled one).
  - **Blueberries: Berry Spiral.** Uses 30 berries: for 2 s, three arms of berries spiral out in every direction (120 berries). 7 s.
  - **Chili Pepper: Flamethrower.** About 1.8 s of flames in a short cone (7.5 m): 45 damage a second and burning; flames stay on the ground for 5 s and burn whoever walks through them. 7 s.
  - **Throwing a chili** now has a 3 in 10 chance to set you on fire too (water puts it out).
  - Banana (eat), Cheese (shield) and Cookie (Sugar Rush) keep their alts. The Pan now fires any food's new alt without its cooldown (its old specials for melons, pineapples and berries are gone).
- **Bots use the alts**: tackles at short range, storms and juice balls at mid range, smashes from a jump, mega jumps and flamethrowers up close, spirals when crowded, spike lines down a lane, jump pads to reach enemies up high, and teleports into the safe zone or away when nearly out.
- **Online:** a Titan's ability moves it on its own game; the area part (a splat, a shockwave, a whirlwind, spikes, a spiral, flames) goes out as an `ab` event and every game applies it to its own Titans, like every other hit. The thrown ability foods are ordinary throws. Jump-pad bounces (`jb`) wear the pads down on every game.
- **New map: Chez Titan, the Restaurant** (`src/map-restaurant.js`): a candle-lit dining room in the same frame as the kitchen. A long skirted buffet in the middle (the main high ground) with chafing dishes, a three-tier wedding cake to climb, a punch bowl that gets you Wet, a carving station with a hot warming plate and the Giant Tomato; the bar along the back wall with beer taps, an ice bucket (Wet on top), a mirror, shelves of bottles, a neon sign and tall stools; the open kitchen pass with a flat-top griddle that heats up like the stove, a deep fryer and plates under heat lamps; four round tables with chairs, three red leather booths, and a stage with a grand piano to stand on or hide under. On the floor: a meatball, a champagne bottle on its side, a croissant, a slippery spill of wine, a tipped-over mop bucket, a fork, a roll and a cork. 17 launch pads, 68 food spawns. Pick it under Map (vs bots or for an online room).
- **Physics fixes (every map):** falling fast (at lower frame rates, or in a Melon Smash) could pass through a ledge's top and push you off its side instead of landing; now you land. Launch pads now carry you along their whole arc to where they aim (steering in mid-air used to bleed the speed off, so the long backyard pads fell short).
- Tests: every alt offline (damage, costs, cooldowns, interruptions), the area alts hurting another player's Titan on their own game (mock room), jump-pad meters agreeing across games, all launch pads on all three maps (walking and sprinting), 100 s bot matches on the restaurant in Classic and Chef's Choice (bots used 10 different alts), an online room on the restaurant, and the earlier tests (coins, Cooking Pot Wars, Duos online).

**Version 0.30: coins and the first skin pack** (`src/coins.js`, `src/skins.js`, `src/main.js`, `src/game.js`, `index.html`)

- **Coins.** Every match vs bots, and every online round you play, pays coins: 10 for playing, 15 per splat, 4 for each Titan you outlast (up to 44) and 60 for a win. The end card shows the receipt; online, a banner shows it after the round. New players start with 500 (enough for a first skin). The wallet is kept on this device, like the chosen skin.
- **The Snack Pack:** six new skins: Burger Boss (rare; a burger hat), Donut Dynamo (rare; a frosted donut float ring), Ice Cream Ace (epic; three scoops and a cherry, a waffle-cone jetpack), Pizza Pilot (legendary; flying cap, goggles, pizza-slice wings), Broccoli Bandit (uncommon; broccoli crown, bandit mask, loot sack) and Taco Tumbler (uncommon; taco backpack, lime cap).
- **The Locker is a shop now.** Pack skins cost 300 (uncommon), 500 (rare), 800 (epic) or 1,200 (legendary); the whole pack costs about two thirds of that (2,350 instead of 3,600), and after buying some, the rest of the pack is discounted the same way. Tap a skin you don't own to try it on the stage, then buy it. The 13 earlier skins stay free. Bots wear pack skins too, and online everyone sees the skin you bought.

**Version 0.29: play online with anyone who has the link** (`src/p2p.js`, `src/net.js`, `scripts/build.mjs`, `docs/play/`)

- **No invite or sign-in needed.** Online play now runs first over a free public peer-to-peer service (PeerJS, bundled into the page): the game's traffic goes straight between players' browsers, and the public server only introduces them. Anyone who opens the game and types the same room code joins, whether or not the page was shared with them on claude.ai.
- **How a room works (`src/p2p.js`):** the first player in a room becomes its hub (it claims the id `tinytitans-foodfight-v1-<room code>`); everyone else connects to the hub, which passes each player's presence on to the others. If the hub leaves, the others race to claim the id; one becomes the new hub and the rest reconnect, so the match carries on. It offers the same small room interface as the claude.ai `room` capability, so the game code above it is unchanged. The hub ties each connection to one player and drops oversized or malformed messages; `src/net.js` still checks every value.
- **Fallback:** where the public service can't be reached (some networks and pages block it), the game uses the claude.ai room as before (people the page is shared with, signed in). Players on the two can't see each other.
- **Public game page:** the build also writes the full page to `docs/play/index.html` for GitHub Pages: https://btbeep-luftikuss.github.io/foodfightgame/play/ once Pages is switched on for the repository (Settings, Pages, deploy from the branch, folder `/docs`).
- Tests: a local PeerJS server (the `peer` npm package, not part of the game) with three players in separate browser profiles: everyone sees everyone, the hub leaving hands the room over, and a late joiner gets in after that.

**Version 0.28: pot menus, steady turrets, bigger stacks, more solid scenery**

- **Turret gunners sit still.** Anyone in a turret ignores moving, jumping and dashing. Bots kept hopping on the lid because their usual random jumps and "I'm stuck" hops kept running.
- **Bigger stacks:** a stack holds up to 99 of a food (blueberries 600), up from 30 (240).
- **Pot menus (Cooking Pot Wars).** Each team picks the 5 foods its pot spits out.
  - Pick yours on the Play screen (Play vs bots; Start waits for 5) or in the loadout card online.
  - The team's players vote (first picks count a little more), and the host keeps counting through the 30 s setup. Bot teams get 5 at random.
  - Online every Titan shares its pick (pm) and the host shares each pot's menu. When the pots go down the feed says what yours cooks.
- **More solid things.**
  - Backyard: the kiddie pool's rim is now a ring you climb or jump over (you wade inside and get Wet), instead of a solid lid over the water. The beams and posts under the benches, the grill's legs, the ice cubes by the cooler, the cooler's handle and the watering can's spout are solid too.
  - Kitchen: the mug's handle, the faucet's arch and the toaster's lever are solid.

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
| `src/core.js` | Constants, collision (boxes and cylinders), ground queries, raycasts, lob solver, repeatable (seeded) randomness |
| `src/world.js` | The kitchen, countertop props, giant foods and fallen chairs, hazards, launch pads, landmark tomato, Soap Tide wall; helpers that fit solid shapes to round and slanted things, bowls with insides, glass rims |
| `src/foods.js` | All food data and behaviour: meshes, throw, impact, alt actions (and the ability foods: the storm ball, the juice ball, the teleport carrot) |
| `src/abilities.js` | The ultimate alts: dashes, whirlwinds, smashes, mega jumps, juice puddles, spike lines, teleports, berry spirals, flamethrowers and ground fires; shockwave rings and call-outs; their online events |
| `src/actors.js` | Titans: movement, statuses, diminishing returns, inventory; drives the rig each frame |
| `src/human.js` | The human model: lofted, skinned body and face, hair and beards, palette shader, skeleton posing, first-person arm |
| `src/skins.js` | Skins: rarity, clothing palettes, costume pieces on the head, chest and hip bones; skin packs |
| `src/coins.js` | Coins: match rewards, skin and pack prices, the wallet (kept on this device) |
| `src/stains.js` | Food stains on every surface: decals cut from the scenery triangles, one atlas, one draw call |
| `src/net.js`, `src/viewmodel.js` | Online rooms (hosting, shared rounds and bots, the shared floor and its check, low internet); first-person arm and held food |
| `src/highlights.js` | Highlight reels: records the match or online round (and every throw's flight), scores splats, snipes and dodges, directs the reels (riding along with long throws in slow motion, wide shots of the whole play, bullet-time dodges, impact freezes, hero shots); online, plays them over the live match |
| `src/p2p.js` | Public peer-to-peer rooms (PeerJS): a hub per room code, hand-over when the hub leaves; STUN and TURN servers; slow lines skip updates, Low lines get them in batches |
| `src/map-backyard.js` | The Backyard BBQ map |
| `src/map-restaurant.js` | Chez Titan, the Restaurant map |
| `src/projectiles.js` | Projectile flight, boomerang steering, rolling, hit detection (body capsule and head) |
| `src/items.js` | Pickups and spawners (online: the same for everyone), peel traps, stuck carrots |
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

- On the claude.ai page, only people signed in to claude.ai whom the game is shared with can play online (that is the claude.ai room's rule, and the page can't reach any other server). Anyone else plays on the public game page, once GitHub Pages is on for the repository.
- Online rooms are peer-to-peer over presence: the host runs the round and the bots, and each player's game decides hits on themselves, so a player with a slow connection can see a hit land a little differently than the thrower did. Pickups and delivery boxes are per player.
- Bots steer with simple wall-following and launch pads rather than real pathfinding.
- The upper cabinets, window sill and ceiling pot rack are scenery; they aren't reachable yet.
