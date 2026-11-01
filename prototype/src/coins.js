// Coins and the skin shop (0.30). You earn coins for every match (vs bots or online): for taking part,
// for each splat, for how long you lasted and for winning. (0.76) Coins open skin boxes, Blooket style:
// each box costs the same every time and gives one of its skins at random, rarer ones less often; a skin
// you already have pays some coins back. The first 13 skins are free for everyone.
//
// The wallet lives on this device (browser storage), like the chosen skin. If storage is blocked it
// still works, for this visit only.
import { SKINS, SKIN_BY_ID, PACKS } from './skins.js';

export const STARTER_COINS = 500;  // a welcome gift, enough for a first box

// How likely each skin in a box is, by its rarity (relative weights; see boxOdds), and the coins a
// duplicate pays back.
export const WEIGHT = { common: 30, uncommon: 30, rare: 20, epic: 10, legendary: 4, mythic: 1.5 };
export const DUPE_COINS = { common: 40, uncommon: 60, rare: 100, epic: 160, legendary: 250, mythic: 400 }; // (never more than a box)

export const packSkins = (packId) => SKINS.filter((s) => s.pack === packId);
export const boxOf = (packId) => PACKS.find((p) => p.id === packId) || null;
// Each skin's chance in a box, in percent: [[skin, %], ...]
export function boxOdds(packId) {
  const list = packSkins(packId), total = list.reduce((t, s) => t + WEIGHT[s.rarity], 0);
  return list.map((s) => [s, (WEIGHT[s.rarity] / total) * 100]);
}
// One skin out of a box (rnd: 0..1).
export function rollBox(packId, rnd = Math.random()) {
  const odds = boxOdds(packId);
  let x = rnd * 100;
  for (const [s, pc] of odds) { if ((x -= pc) < 0) return s; }
  return odds[odds.length - 1][0];
}

// Coins for one match: the lines of the receipt and the total.
// placement: 1 is the winner; titans: how many started.
export function matchReward({ kills = 0, placement = 12, titans = 12, won = false }) {
  const lines = [['Played', 10]];
  if (kills > 0) lines.push([`${kills} splat${kills > 1 ? 's' : ''}`, kills * 15]);
  const lasted = Math.max(0, Math.min(titans, 12) - Math.max(1, placement)) * 4;
  if (lasted > 0) lines.push([`Placed #${placement}`, lasted]);
  if (won) lines.push(['Win', 60]);
  return { lines, total: lines.reduce((t, l) => t + l[1], 0) };
}

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: this visit only */ } };

export class Wallet {
  constructor() {
    const c = parseInt(read('tt-coins'), 10);
    this.coins = Number.isFinite(c) && c >= 0 ? Math.min(c, 1e7) : STARTER_COINS;
    let owned = [];
    try { owned = JSON.parse(read('tt-owned') || '[]'); } catch { /* fresh */ }
    this.owned = new Set(Array.isArray(owned) ? owned.filter((id) => SKIN_BY_ID[id]) : []);
    this.onChange = null;
    if (read('tt-coins') === null) this._save();
  }
  owns(id) { return !!SKIN_BY_ID[id] && (!SKIN_BY_ID[id].pack || this.owned.has(id)); }
  earn(n) { if (n > 0) { this.coins = Math.min(1e7, this.coins + Math.round(n)); this._save(); } }
  // (0.76) Open a box: { skin, fresh, refund }, or null (no such box, not enough coins, or nothing left in it).
  openBox(packId, rnd = Math.random()) {
    const B = boxOf(packId);
    if (!B || this.coins < B.price || this.boxDone(packId)) return null;
    const skin = rollBox(packId, rnd), fresh = !this.owned.has(skin.id), refund = fresh ? 0 : DUPE_COINS[skin.rarity];
    this.coins = this.coins - B.price + refund;
    this.owned.add(skin.id);
    this._save();
    return { skin, fresh, refund };
  }
  boxDone(packId) { return packSkins(packId).every((s) => this.owned.has(s.id)); } // (every skin in it: no more opening)
  _save() {
    write('tt-coins', String(this.coins));
    write('tt-owned', JSON.stringify([...this.owned]));
    this.onChange?.();
  }
}
