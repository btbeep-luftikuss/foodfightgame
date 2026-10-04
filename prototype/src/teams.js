// Teams (0.26): Duos, Trios and Squads in every mode (and Solo, every Titan for themselves, outside
// Cooking Pot Wars). 12 Titans make 6 teams of 2, 4 of 3 or 3 of 4. You pick your team (or let the
// game put you in the emptiest one); bots fill every other place. Teammates can't hurt each other,
// bots never aim at their own team, and the last team with anyone standing wins.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const TEAMS = [
  { name: 'Team Tomato', short: 'Tomato', color: '#f0503a' },
  { name: 'Team Blueberry', short: 'Blueberry', color: '#4f8ff0' },
  { name: 'Team Lime', short: 'Lime', color: '#5fbf5f' },
  { name: 'Team Butter', short: 'Butter', color: '#ffd447' },
  { name: 'Team Grape', short: 'Grape', color: '#b07cf0' },
  { name: 'Team Mint', short: 'Mint', color: '#4fd1c5' },
];
export const TEAM_LABEL = { 1: 'Solo', 2: 'Duos', 3: 'Trios', 4: 'Squads' };
export const TEAM_SIZES = [1, 2, 3, 4];
export const teamCount = (size) => (size > 1 ? Math.floor(12 / size) : 0);
export const cleanSize = (v, mode) => { const s = TEAM_SIZES.includes(+v) ? +v : 1; return mode === 'pots' && s < 2 ? 3 : s; };

// Where each team starts: a home patch of floor, spread around the arena (both maps share the frame).
const HOMES = {
  3: [{ minX: -225, maxX: -120, minZ: -90, maxZ: 140 }, { minX: 120, maxX: 225, minZ: -90, maxZ: 140 }, { minX: -80, maxX: 80, minZ: -122, maxZ: -55 }],
  4: [{ minX: -220, maxX: -90, minZ: 45, maxZ: 150 }, { minX: 90, maxX: 220, minZ: 45, maxZ: 150 },
    { minX: -220, maxX: -90, minZ: -120, maxZ: -20 }, { minX: 90, maxX: 220, minZ: -120, maxZ: -20 }],
  6: [{ minX: -220, maxX: -100, minZ: 75, maxZ: 150 }, { minX: 100, maxX: 220, minZ: 75, maxZ: 150 },
    { minX: -220, maxX: -100, minZ: -120, maxZ: -50 }, { minX: 100, maxX: 220, minZ: -120, maxZ: -50 },
    { minX: -225, maxX: -140, minZ: -25, maxZ: 40 }, { minX: 140, maxX: 225, minZ: -25, maxZ: 40 }],
};
export function teamHome(world, n, t) { return { ...(HOMES[n] || HOMES[4])[t % (n || 4)], top: world.regions.floor.top }; }

// Put Titans in teams. `fixed`: Titans who picked a team (Map actor -> team); everyone else goes to
// the emptiest team. Team colours replace skin colours on the HUD (name tags, the minimap, the bar).
export function assignTeams(actors, size, fixed = new Map()) {
  const n = teamCount(size);
  if (!n) { for (const a of actors) a.team = null; return; }
  const count = new Array(n).fill(0);
  for (const [a, t] of fixed) if (t >= 0 && t < n) { a.team = t; count[t]++; }
  for (const a of actors) {
    if (fixed.has(a) && fixed.get(a) >= 0 && fixed.get(a) < n) continue;
    let best = 0;
    for (let t = 1; t < n; t++) if (count[t] < count[best]) best = t;
    a.team = best; count[best]++;
  }
  for (const a of actors) a.color = TEAMS[a.team].color;
}

// The emptiest team, for a player who lets the game choose (counts: players per team).
export function emptiest(counts, n) {
  let best = 0;
  for (let t = 1; t < n; t++) if ((counts[t] || 0) < (counts[best] || 0)) best = t;
  return best;
}

// Teams (or, in Solo, single Titans) that still have someone standing (or a pot standing).
export function sidesLeft(game) {
  const set = new Set();
  for (const a of game.actors) if (a.alive) set.add(game.teamSize > 1 && a.team != null ? `t${a.team}` : a);
  if (game.pots.active) for (const p of game.pots.pots) if (p.alive) set.add(`t${p.team}`);
  return set.size;
}
// The team still standing at the end (or null).
export function winningTeam(game) {
  if (game.teamSize < 2) return null;
  const a = game.actors.find((x) => x.alive && x.team != null);
  if (a) return a.team;
  const p = game.pots.active && game.pots.pots.find((q) => q.alive);
  return p ? p.team : null;
}

// The team bar under the top pill: every team, its Titans still up, and its pot (Cooking Pot Wars).
export function renderTeamBar(game, el, state) {
  const n = teamCount(game.teamSize), me = game.player?.team;
  if (!n || !el) { if (el && !el.hidden) el.hidden = true; return; }
  el.hidden = false;
  const P = game.pots.active ? game.pots : null;
  const rows = [];
  for (let t = 0; t < n; t++) {
    const T = TEAMS[t];
    const up = game.actors.filter((a) => a.team === t && a.alive).length;
    const pot = P?.pots[t];
    const out = P ? !P.teamAlive(t) : up === 0;
    let mid = '';
    if (pot) mid = !pot.placed ? '<em>placing…</em>' : pot.alive ? `<span class="php"><i style="width:${(pot.hp / pot.maxHp * 100).toFixed(0)}%"></i></span>${pot.captures ? `<small>Lv ${1 + pot.captures}</small>` : ''}` : out ? '' : '<em>pot gone</em>';
    rows.push(`<li class="${out ? 'out' : ''}${t === me ? ' me' : ''}" style="--c:${T.color}"><i></i><b>${T.short}</b>${mid}<small>${up}/${game.teamSize}</small></li>`);
  }
  const head = P && P.setup ? `<p>Place your pot: press <kbd>G</kbd> · ${Math.max(0, Math.ceil(P.setupLeft()))} s</p>` : '';
  const html = head + `<ul>${rows.join('')}</ul>`;
  if (html !== state.html) { state.html = html; el.innerHTML = html; }
}

export { esc };
