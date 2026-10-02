// Phone inventory: two china plates peeking out of the bottom corners (food on the left, utensils
// on the right). Only the quarter with the item in hand shows; turn a plate like a dial to bring
// another item round, or tap it to step to the next one. It clicks into place with a little overshoot.

const SNAP_MS = 280;
const SNAP = `transform ${SNAP_MS}ms cubic-bezier(.3,1.6,.5,1)`;
const DETENT = 0.72; // how strongly the plate settles into each slot while it is turned

const wrap180 = (d) => ((d + 540) % 360) - 180;

export class Dial {
  // side: 'left' | 'right'; n: slots; onPick(i): commit a selection; onTick(): a slot clicked past
  constructor(el, { side, n, onPick, onTick }) {
    this.el = el; this.n = n; this.onPick = onPick; this.onTick = onTick;
    this.step = 360 / n;
    this.dir = side === 'left' ? 1 : -1; // slot order runs clockwise on the left plate, mirrored on the right
    this.S = side === 'left' ? -45 : -135; // where the item in hand sits: diagonally into the screen
    el.style.setProperty('--S', `${this.S}deg`);
    this.disc = el.querySelector('.disc');
    this.count = el.querySelector('.count');
    this.label = el.querySelector('.label');
    this.items = [];
    for (let i = 0; i < n; i++) {
      const it = document.createElement('div');
      it.className = 'it empty';
      it.style.setProperty('--a', `${this.dir * i * this.step}deg`);
      it.innerHTML = '<img alt="">';
      this.disc.appendChild(it);
      this.items.push(it);
    }
    this.sel = 0; this.theta = this._thetaFor(0); this.shown = -1;
    this.valid = new Array(n).fill(false); this.sig = '';
    this.tid = null; this.pending = -1; this.pendingUntil = 0; this.labelT = 0; this.emptySince = 0;
    this._apply(false);
    this._bind();
  }

  // plate angle that puts slot i in the hand spot, nearest the current angle (shortest turn)
  _thetaFor(i, near = this.theta ?? 0) {
    const base = this.S - this.dir * i * this.step;
    return base + 360 * Math.round((near - base) / 360);
  }
  _slotAt(theta) { // slot nearest the hand spot at a plate angle
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
      this.hover = this._slotAt(this.theta);
      el.classList.add('turning');
      this._apply(false);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.tid) continue;
        const a = this._ang(t), d = wrap180(a - this.lastAng);
        this.lastAng = a;
        this.raw += d; this.travel += Math.abs(d);
        // notchy feel: slow near each slot, quick between them
        const near = this._thetaFor(this._slotAt(this.raw), this.raw);
        const x = (this.raw - near) / this.step;
        this.theta = near + this.step * (x - DETENT * Math.sin(2 * Math.PI * x) / (2 * Math.PI));
        this._apply(false);
        const h = this._slotAt(this.raw);
        if (h !== this.hover) { this.hover = h; this._click(this.items[h]); }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.tid) continue;
        this.tid = null;
        el.classList.remove('turning');
        const tap = this.travel < 7 && performance.now() - this.t0 < 350;
        const from = tap ? this.sel : this._slotAt(this.raw);
        const i = tap ? this._next(this.sel, 1) : this.valid[from] ? from : this._nearestValid(this.raw);
        if (i < 0 || (tap && i === this.sel)) { this._wiggle(); return; }
        this.pick(i, true);
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  _next(from, dir) {
    for (let k = 1; k <= this.n; k++) {
      const i = (from + dir * k + this.n * 4) % this.n;
      if (this.valid[i]) return i;
    }
    return -1;
  }
  _nearestValid(theta) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (!this.valid[i]) continue;
      const d = Math.abs(this._thetaFor(i, theta) - theta);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  _click(it) {
    this.onTick?.();
    if (!it) return;
    it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop');
  }
  _wiggle() {
    this.theta = this._thetaFor(this.sel);
    this._apply(true);
    this.el.classList.remove('nudge'); void this.el.offsetWidth; this.el.classList.add('nudge');
  }

  // Turn to slot i (user = the player chose it: tell the game and give feedback).
  pick(i, user = false) {
    const changed = i !== this.sel;
    this.sel = i;
    this.theta = this._thetaFor(i);
    this._apply(true);
    if (user) {
      // the game takes the choice on its next frame; until it shows up there, don't turn back
      this.pending = i; this.pendingUntil = performance.now() + 1500;
      this.onPick(i);
      if (changed) try { navigator.vibrate?.(12); } catch { /* not allowed */ }
      if (this.travel < 7 || !changed) this._click(this.items[i]); // a turn already clicked past it
      else { const it = this.items[i]; it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop'); }
      this.showLabel();
    }
  }
  showLabel() { this.labelT = performance.now() + 1300; }

  // Each frame: what is on the plate and what is in hand. slots: [{ icon, name, count } | null]
  sync(slots, inHand, now = performance.now()) {
    const sig = slots.map((s) => (s ? `${s.icon.length}:${s.name}:${s.count ?? ''}` : '-')).join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      slots.forEach((s, i) => {
        const it = this.items[i], img = it.firstChild;
        this.valid[i] = !!s;
        it.classList.toggle('empty', !s);
        if (s) { if (img.getAttribute('src') !== s.icon) img.src = s.icon; img.alt = s.name; }
        else { img.removeAttribute('src'); img.alt = ''; }
      });
      this.shown = -1;
    }
    if (this.pending >= 0 && (inHand === this.pending || now > this.pendingUntil)) this.pending = -1;
    if (this.tid === null && this.pending < 0 && inHand !== this.sel) { this.pick(inHand); this.showLabel(); }
    if (this.shown !== this.sel) {
      this.shown = this.sel;
      this.items.forEach((it, i) => it.classList.toggle('sel', i === this.sel));
      const s = slots[this.sel];
      this.label.textContent = s ? s.name : '';
      this.el.classList.toggle('bare', !s);
    }
    const s = slots[this.sel];
    const cnt = s && s.count != null ? String(s.count) : '';
    if (this.count.textContent !== cnt) this.count.textContent = cnt;
    this.label.classList.toggle('on', now < this.labelT && !!s);
  }

  // Phones: when the food in hand runs out, turn to the next food on its own.
  autoAdvance(now = performance.now()) {
    if (this.valid[this.sel] || this.tid !== null || this.pending >= 0) { this.emptySince = 0; return; }
    const i = this._next(this.sel, 1);
    if (i < 0) { this.emptySince = 0; return; }
    if (!this.emptySince) { this.emptySince = now; return; }
    if (now - this.emptySince > 350) { this.emptySince = 0; this.pick(i, true); }
  }
}
