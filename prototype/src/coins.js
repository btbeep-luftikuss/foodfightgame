// Coins and the skin shop (0.30). You earn coins for every match (vs bots or online): for taking part,
// for each splat, for how long you lasted and for winning. Coins buy the skins in skin packs, one at a
// time or the whole pack for less. The first 13 skins are free for everyone.
//
// The wallet lives on this device (browser storage), like the chosen skin. If storage is blocked it
// still works, for this visit only.
import { SKINS, SKIN_BY_ID, PACKS } from './skins.js';

export const PRICE = { common: 150, uncommon: 300, rare: 500, epic: 800, legendary: 1200 };
export const PACK_DISCOUNT = 0.65; // a whole pack costs 65% of its skins bought one by one
export const STARTER_COINS = 500;  // a welcome gift, enough for a first skin

export const priceOf = (id) => (SKIN_BY_ID[id]?.pack ? PRICE[SKIN_BY_ID[id].rarity] : 0);
export const packSkins = (packId) => SKINS.filter((s) => s.pack === packId);
// What the rest of a pack costs: the skins you don't own yet, at the pack discount (rounded to 50).
export function packPrice(packId, owned = new Set()) {
  const full = packSkins(packId).filter((s) => !owned.has(s.id)).reduce((t, s) => t + PRICE[s.rarity], 0);
  return Math.ceil((full * PACK_DISCOUNT) / 50) * 50;
}
export const packFullPrice = (packId) => packSkins(packId).reduce((t, s) => t + PRICE[s.rarity], 0);

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
  buySkin(id) {
    if (this.owns(id)) return true;
    const cost = priceOf(id);
    if (!cost || this.coins < cost) return false;
    this.coins -= cost; this.owned.add(id); this._save();
    return true;
  }
  buyPack(packId) {
    if (!PACKS.some((p) => p.id === packId)) return false;
    const cost = packPrice(packId, this.owned);
    if (!cost || this.coins < cost) return false;
    this.coins -= cost;
    for (const s of packSkins(packId)) this.owned.add(s.id);
    this._save();
    return true;
  }
  _save() {
    write('tt-coins', String(this.coins));
    write('tt-owned', JSON.stringify([...this.owned]));
    this.onChange?.();
  }
}
