// Phone inventory: two china plates peeking out of the bottom corners (food on the left, utensils
// on the right). Only the quarter with the item in hand shows; turn a plate either way like a dial to
// bring another item round, or tap it to step to the next one. It clicks into place with a little
// overshoot. A plate only has as many places as you have things to put on it: two foods sit half a
// turn apart, three a third of a turn, and so on, so every notch of the dial is something you can use.

const SNAP_MS = 280;
const SNAP = `transform ${SNAP_MS}ms cubic-bezier(.3,1.6,.5,1)`;
const DETENT = 0.72; // how strongly the plate settles into each place while it is turned

const wrap180 = (d) => ((d + 540) % 360) - 180;

export class Dial {
  // side: 'left' | 'right'; onPick(slot): put inventory slot `slot` in hand; onTick(): a place clicked past
  constructor(el, { side, onPick, onTick }) {
    this.el = el; this.onPick = onPick; this.onTick = onTick;
    this.dir = side === 'left' ? 1 : -1; // places run clockwise on the left plate, mirrored on the right
    this.S = side === 'left' ? -45 : -135; // where the item in hand sits: diagonally into the screen
    el.style.setProperty('--S', `${this.S}deg`);
    this.disc = el.querySelector('.disc');
    this.count = el.querySelector('.count');
    this.label = el.querySelector('.label');
    this.items = []; this.map = []; this.n = 0; this.step = 360;
    this.sel = -1; this.theta = this.S; this.shown = null; this.sig = '';
    this.tid = null; this.pending = -1; this.pendingUntil = 0; this.labelT = 0; this.emptySince = 0; this.travel = 0;
    this._apply(false);
    this._bind();
  }

  // plate angle that puts place k in the hand spot (k may be fractional), nearest the current angle
  _thetaFor(k, near = this.theta) {
    const base = this.S - this.dir * k * this.step;
    return base + 360 * Math.round((near - base) / 360);
  }
  _placeAt(theta) { // place nearest the hand spot at a plate angle
    if (!this.n) return -1;
    const k = Math.round((this.S - theta) / (this.dir * this.step));
    return ((k % this.n) + this.n) % this.n;
  }
  _apply(animate) {
    this.disc.style.transition = animate ? SNAP : 'none';
    this.disc.style.transform = `rotate(${this.theta}deg)`;
  }

  _centre() { const r = this.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  _ang(t) { const c = this.centre; return Math.atan2(t.clientY - c.y, t.clientX - c.x) * 180 / Math.PI; }

  _bind() {
    const el = this.el;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.tid !== null) return;
      const t = e.changedTouches[0];
      this.tid = t.identifier;
      this.centre = this._centre();
      this.lastAng = this._ang(t);
      this.raw = this.theta;
      this.travel = 0; this.t0 = performance.now();
      this.hover = this._placeAt(this.theta);
      el.classList.add('turning');
      this._apply(false);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.tid) continue;
        const a = this._ang(t), d = wrap180(a - this.lastAng);
        this.lastAng = a;
        // the same thumb movement (about 60 degrees) brings the next item round however many there are
        this.raw += d * Math.max(1, this.step / 60); this.travel += Math.abs(d);
        if (this.n < 2) { this.theta = this.raw; this._apply(false); continue; } // nothing to turn to: it just spins
        // notchy feel: slow near each place, quick between them
        const near = this._thetaFor(this._placeAt(this.raw), this.raw);
        const x = (this.raw - near) / this.step;
        this.theta = near + this.step * (x - DETENT * Math.sin(2 * Math.PI * x) / (2 * Math.PI));
        this._apply(false);
        const h = this._placeAt(this.raw);
        if (h !== this.hover) { this.hover = h; this._click(this.items[h]); }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.tid) continue;
        this.tid = null;
        el.classList.remove('turning');
        if (!this.n) { this._settle(); continue; }
        const tap = this.travel < 7 && performance.now() - this.t0 < 350;
        const k = tap ? (this.sel < 0 ? 0 : (this.sel + 1) % this.n) : this._placeAt(this.raw);
        if (k === this.sel && (tap || this.n === 1)) { this._wiggle(); continue; }
        this.pick(k, true);
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  _click(it) {
    this.onTick?.();
    if (!it) return;
    it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop');
  }
  _settle() { // turn back to rest: the item in hand, or between places if the hand is empty
    this.theta = this._thetaFor(this.sel >= 0 ? this.sel : this.n > 1 ? 0.5 : 0.5);
    this._apply(true);
  }
  _wiggle() {
    this._settle();
    this.el.classList.remove('nudge'); void this.el.offsetWidth; this.el.classList.add('nudge');
  }

  // Turn to place k (user = the player chose it: tell the game and give feedback).
  pick(k, user = false) {
    const changed = k !== this.sel;
    this.sel = k;
    this._settle();
    if (user) {
      // the game takes the choice on its next frame; until it shows up there, don't turn back
      this.pending = this.map[k]; this.pendingUntil = performance.now() + 1500;
      this.onPick(this.map[k]);
      if (changed) try { navigator.vibrate?.(12); } catch { /* not allowed */ }
      if (this.travel < 7) this._click(this.items[k]); // a turn already clicked past it
      else { const it = this.items[k]; it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop'); }
      this.showLabel();
    }
  }
  showLabel() { this.labelT = performance.now() + 1300; }

  // Lay out one place per thing carried. slots: the inventory, [{ id, icon, name, count } | null]
  _layout(slots) {
    this.map = [];
    slots.forEach((s, i) => { if (s) this.map.push(i); });
    this.n = this.map.length;
    this.step = 360 / Math.max(1, this.n);
    while (this.items.length < this.n) {
      const it = document.createElement('div');
      it.className = 'it';
      it.innerHTML = '<img alt="">';
      this.disc.appendChild(it);
      this.items.push(it);
    }
    while (this.items.length > this.n) this.items.pop().remove();
    this.map.forEach((slot, k) => {
      const s = slots[slot], it = this.items[k], img = it.firstChild;
      it.style.setProperty('--a', `${this.dir * k * this.step}deg`);
      if (img.getAttribute('src') !== s.icon) img.src = s.icon;
      img.alt = s.name;
    });
    this.el.classList.toggle('none', !this.n);
  }

  // Each frame: what is carried and which inventory slot is in hand.
  sync(slots, inHand, now = performance.now()) {
    const layoutSig = slots.map((s) => (s ? s.id : '-')).join('|');
    if (layoutSig !== this.sig) { // something picked up, used up or swapped: re-lay the plate, the hand stays put
      this.sig = layoutSig;
      this._layout(slots);
      this.sel = this.map.indexOf(inHand);
      if (this.tid === null) { this.theta = this._thetaFor(this.sel >= 0 ? this.sel : 0.5); this._apply(false); }
      this.shown = null;
    }
    if (this.pending >= 0 && (inHand === this.pending || now > this.pendingUntil)) this.pending = -1;
    const k = this.map.indexOf(inHand);
    if (this.tid === null && this.pending < 0 && k !== this.sel) {
      if (k >= 0) { this.pick(k); this.showLabel(); } else { this.sel = -1; this._settle(); }
    }
    const s = this.sel >= 0 ? slots[this.map[this.sel]] : null;
    const shownKey = `${this.sel}:${s ? s.id : ''}`;
    if (this.shown !== shownKey) {
      this.shown = shownKey;
      this.items.forEach((it, i) => it.classList.toggle('sel', i === this.sel));
      this.label.textContent = s ? s.name : '';
      this.el.classList.toggle('bare', !s);
    }
    const cnt = s && s.count != null ? String(s.count) : '';
    if (this.count.textContent !== cnt) this.count.textContent = cnt;
    this.label.classList.toggle('on', now < this.labelT && !!s);
  }

  // Phones: when the food in hand runs out, turn to the next food on its own.
  autoAdvance(inHand, now = performance.now()) {
    if (this.sel >= 0 || !this.n || this.tid !== null || this.pending >= 0) { this.emptySince = 0; return; }
    if (!this.emptySince) { this.emptySince = now; return; }
    if (now - this.emptySince < 350) return;
    this.emptySince = 0;
    let k = this.map.findIndex((slot) => slot > inHand); // the next food along, round to the first
    if (k < 0) k = 0;
    this.pick(k, true);
  }
}
