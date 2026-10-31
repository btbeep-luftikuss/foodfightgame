# Room lobby: how other games do it, and what Tiny Titans took from them

Notes behind prototype 0.68 and 0.69 (the online room lobby and the vote after every round).

## What other games do

| Pattern | Seen in | What it's for |
|---|---|---|
| A short room code, shown big on the lobby screen; friends type it in | Jackbox (a 4-letter code on the host's screen, typed in at jackbox.tv), Fall Guys custom lobbies (a 5-letter code at the top of the screen), Among Us | Joining in seconds, no accounts or friend lists |
| An invite **link** that carries only the room code | skribbl.io private rooms (a room you can only reach by its link); general advice for invite links | One tap to join; nothing secret in the link |
| Fun, random room names instead of letter soup | Among Us ("randomized lobby names") | Easy to read out loud, nobody else is on it |
| Everyone sees who's in and who's ready; the host starts when "everybody's in" | Jackbox (the first player in is the VIP, who starts the game once everyone is connected), ready-up toggles in lobby kits (Epic, Unity) | Nobody gets left behind; the room isn't stuck |
| The host's start button says when not everyone is ready ("Start" / "Start anyway") | lobby prototypes | The host sees the state before starting |
| Chat, emotes, something to do while waiting | general lobby UX advice | The wait is social, not empty |
| After a match: a rematch with the same players and settings, or a vote on what's next | Age of Empires (rematch when everyone picks it: same players, same settings), Call of Duty and Battlefield (players miss the post-match map vote), Overwatch (players ask for a rematch vote) | Keep a good group together, play on without menus |
| Start the rematch as soon as everyone has voted; one click, where people look | Diabotical (the rematch starts the moment all have voted; players skipped a vote that needed one more click) | No dead time, no friction |

## What Tiny Titans does (0.68, 0.69)

- **Join:** type a room code, or **Create a new room** for a fresh fun code (*spicy-tomato-27*); in the lobby the code is shown big with **Copy invite** (on the public page a link with `#room=<code>`, which opens the game with the code filled in; on claude.ai the code to type, since only people the game is shared with can join there).
- **Lobby:** who's in (host, team, ready), votes on mode, map, team size and bots with live counts and the winner outlined, **Surprise me** for the mode and the map, team picks, chat with one-tap quick chat (👋 Hi!, ✅ Ready!, ⏳ Wait for me, 🔥 Let's go!...).
- **Starting:** everyone ready: 5 s. Most of a room of 3 or more ready: 30 s (it names who it's waiting for), so one player who stepped away can't hold everyone up. The host can start any time ("Start", or "Start anyway" when not everyone is ready). The last 5 seconds tick.
- **After every round:** a bar at the top asks **Play again?** (🔁 Play again, Y) or **New vote** (🗳️, N), with live counts and GG. The next round starts as soon as everyone has voted, else after 12 s (longer while someone watches the round's highlights). More "new vote" than "play again" takes the room back to the lobby (everyone readies up again); otherwise it's a rematch with the same settings.

## Sources

- [How to Play Jackbox Games](https://www.jackboxgames.com/how-to-play), [The Jackbox Party Pack 5 Streamer's Guide](https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/)
- [Fall Guys: How To Play Private Matches With Friends](https://www.looper.com/908126/fall-guys-how-to-play-private-matches-with-friends)
- [Introducing Randomized Lobby Names (Innersloth)](https://innersloth.com/introducing-randomized-lobby-names)
- [How to create a private room in skribbl.io](https://mytour.vn/en/blog/kinh-nghiem-hay/how-to-create-a-private-room-in-skribblio-mytour.html)
- [Ready up (Epic, Fortnite docs)](https://dev.epicgames.com/documentation/fortnite/ready-up), [Lobby prototype](https://app.cinevva.com/arcade/lobby-prototype), [Designing a game lobby UX](https://ejaw.net/designing-a-game-lobby-ux-that-converts-without-hype)
- [Age of Empires: rematch feature](https://forums.ageofempires.com/t/rematch-feature-to-quickly-queue-up-against-the-same-player-at-the-end-of-a-game/110363), [Modern Warfare players want map voting back](https://www.gamerevolution.com/?p=612038), [Battlefield 6: bring back the post-match map vote](https://forums.ea.com/discussions/battlefield-6-general-discussion-en/bring-back-%E2%80%94-and-improve-%E2%80%94-the-post-match-map-vote-in-battlefield-6/12464366), [Overwatch: rematch through voting](https://us.forums.blizzard.com/en/overwatch/t/controversial-add-the-ability-to-rematch-through-voting/892794/1)
- [Diabotical patch notes: rematch after all have voted](https://devtrackers.gg/diabotical/p/12f966ca-patch-notes-version-0-20-457-april-8-2021), [Why people leave instead of voting for another map](https://devtrackers.gg/diabotical/p/e744626d-why-do-people-leave-wipeout-matches-instead-of-voting-for-another-map)
