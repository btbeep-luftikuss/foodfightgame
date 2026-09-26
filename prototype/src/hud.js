// DOM heads-up display (GDD 14.1): bars, hotbar, kill feed, statuses, nameplates, damage numbers.
import * as THREE from 'three';
import { hasLineOfSight } from './core.js';
import { FOODS } from './foods.js';

const $ = (id) => document.getElementById(id);
const _p = new THREE.Vector3(), _e = new THREE.Vector3();

export class HUD {
  constructor(icons, input) {
    this.icons = icons; this.input = input;
    this.el = $('hud');
    this.hotbar = $('hotbar');
    this.slots = [];
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.type = 'button';
      b.setAttribute('aria-label', `Slot ${i + 1}`);
      b.setAttribute('data-touch-btn', ''); // touches here select food instead of steering
      b.innerHTML = `<span class="key">${i + 1}</span><img alt=""><span class="count"></span>`;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); input.slot = i; });
      this.hotbar.appendChild(b);
      this.slots.push(b);
    }
    this.hotSig = '';
    this.floaters = [];
    this.plates = new Map();
    this.feedEl = $('feed');
    this.toastT = 0; this.bannerT = 0; this.hitT = 0; this.hurtT = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.lastHint = '';
  }

  show(on) { this.el.hidden = !on; }

  _renderHotbar(a) {
    const sig = a.inv.map((s) => (s ? `${s.id}:${s.count}` : '-')).join('|') + `#${a.sel}`;
    if (sig === this.hotSig) return;
    this.hotSig = sig;
    a.inv.forEach((s, i) => {
      const b = this.slots[i];
      b.classList.toggle('sel', i === a.sel);
      b.classList.toggle('empty', !s);
      const img = b.querySelector('img');
      if (s) { img.src = this.icons[s.id]; img.alt = FOODS[s.id].name; }
      else { img.removeAttribute('src'); img.alt = ''; }
      b.querySelector('.count').textContent = s && FOODS[s.id].maxStack > 1 ? s.count : '';
      b.title = s ? `${FOODS[s.id].name}: ${FOODS[s.id].role}` : 'Empty';
    });
  }

  update(game, dt) {
    const a = game.player;
    const cam = game.camera;
    // FPS
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { $('fps').textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`; this.fpsAcc = 0; this.fpsN = 0; }

    $('alive').textContent = game.aliveCount();
    const T = game.tide;
    const tideEl = $('tide');
    if (game.state === 'drop') { tideEl.textContent = 'Glide down and grab food'; tideEl.className = 'tide-banner'; }
    else if (T.phase >= T.phases.length) { tideEl.textContent = 'Final circle'; tideEl.className = 'tide-banner urgent'; }
    else if (T.mode === 'wait') {
      const s = Math.ceil(T.t);
      tideEl.textContent = `Soap Tide moves in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      tideEl.className = 'tide-banner';
    } else { tideEl.textContent = 'The Soap Tide is closing in'; tideEl.className = 'tide-banner urgent'; }

    if (a) {
      $('kills').textContent = a.kills;
      const hp = Math.max(0, a.hp), gl = Math.max(0, a.glaze);
      $('hpFill').style.transform = `scaleX(${hp / 100})`;
      $('glazeFill').style.transform = `scaleX(${gl / 100})`;
      $('hpText').textContent = Math.ceil(hp);
      $('glazeText').textContent = Math.ceil(gl);
      this._renderHotbar(a);

      const food = a.selectedFood();
      const slot = a.selected();
      let hint = '';
      if (food) {
        const altKey = this.input.isTouch ? 'Alt' : 'Right-click / Q';
        hint = `<b>${food.name}</b> · ${food.role}` + (food.altLabel ? ` <span class="alt">${altKey}: ${food.altLabel}</span>` : '');
        if (slot.id === 'cheese' && a.shieldUp) hint += ` <span class="alt">Shield ${Math.ceil(slot.hp)} HP</span>`;
      } else hint = 'Walk over food to pick it up';
      if (hint !== this.lastHint) { $('hint').innerHTML = hint; this.lastHint = hint; }

      // statuses
      const st = a.statusList().map(([k, label]) => `<span class="chip ${k}">${label}</span>`).join('');
      if (st !== this.lastStatus) { $('statuses').innerHTML = st; this.lastStatus = st; }

      // crosshair and charge ring
      const ch = $('crosshair');
      ch.dataset.profile = food ? food.profile : 'none';
      const c = a.charging && food ? Math.min(1, a.chargeT / food.charge) : 0;
      $('chargeRing').style.strokeDashoffset = String(176 * (1 - c));
      ch.classList.toggle('charging', a.charging);
      ch.classList.toggle('full', c >= 1);
      ch.classList.toggle('cooldown', game.time < a.recoverUntil || game.time < a.swapLockUntil);

      // full-screen status overlays
      const o = $('fx-overlay');
      o.classList.toggle('frozen', a.isFrozen());
      o.classList.toggle('burning', a.isBurning());
      o.classList.toggle('juiced', game.time < a.juicedUntil);
      o.classList.toggle('wet', a.isWet());
      o.classList.toggle('lowhp', a.alive && a.hp < 30);
    }

    this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').className = 'hitmarker';
    this.hurtT -= dt; if (this.hurtT <= 0) $('fx-overlay').classList.remove('hurt');
    this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on');
    this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('on');

    this._nameplates(game, cam);
    this._floaters(cam, dt);
  }

  _project(pos, cam) {
    _p.copy(pos).project(cam);
    if (_p.z > 1 || _p.z < -1) return null;
    return { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight };
  }

  _nameplates(game, cam) {
    const layer = $('nameplates');
    for (const a of game.actors) {
      let el = this.plates.get(a);
      if (!el) {
        el = document.createElement('div');
        el.className = 'plate';
        el.innerHTML = `<span class="name"></span><span class="mini"><i class="g"></i><i class="h"></i></span>`;
        layer.appendChild(el);
        this.plates.set(a, el);
      }
      const show = a.alive && a !== game.player && game.state !== 'menu';
      let pos = null;
      if (show) {
        a.headPos(_e).y += 1.0;
        const d = cam.position.distanceTo(_e);
        if (d < 55 && hasLineOfSight(cam.position, _e)) pos = this._project(_e, cam);
      }
      if (!pos) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
      el.querySelector('.name').textContent = a.name;
      el.querySelector('.h').style.width = `${Math.max(0, a.hp)}%`;
      el.querySelector('.g').style.width = `${Math.max(0, a.glaze)}%`;
      el.style.setProperty('--c', a.color);
    }
  }

  _floaters(cam, dt) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.pos.y += dt * 1.6;
      const p = f.life > 0 ? this._project(f.pos, cam) : null;
      if (!p) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, f.life - 0.6)})`;
    }
  }

  float(pos, text, kind) {
    let f = this.floaters.find((x) => x.life <= 0);
    if (!f) {
      if (this.floaters.length > 30) return;
      const el = document.createElement('div');
      $('floaters').appendChild(el);
      f = { el, pos: new THREE.Vector3(), life: 0 };
      this.floaters.push(f);
    }
    f.el.className = `floater ${kind}`;
    f.el.textContent = text;
    f.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
    f.life = 0.9;
  }

  hitmarker(head, kill) {
    $('hitmarker').className = `hitmarker on${head ? ' head' : ''}${kill ? ' kill' : ''}`;
    this.hitT = kill ? 0.35 : 0.14;
  }
  hurt() { $('fx-overlay').classList.add('hurt'); this.hurtT = 0.18; }

  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); this.toastT = 1.4; }
  banner(title, sub = '', dur = 2.4) {
    const b = $('banner');
    b.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    b.classList.add('on');
    this.bannerT = dur;
  }

  feed(html, mine) {
    const li = document.createElement('li');
    li.innerHTML = html;
    if (mine) li.className = 'mine';
    this.feedEl.prepend(li);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => li.classList.add('old'), 6000);
  }
  clearFeed() { this.feedEl.innerHTML = ''; }
}
