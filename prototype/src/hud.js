// DOM heads-up display (GDD 14.1): bars, hotbar, kill feed, statuses, nameplates, damage numbers.
import * as THREE from 'three';
import { hasLineOfSight } from './core.js';
import { FOODS } from './foods.js';
import { MAX_HP } from './actors.js';
import { UTENSIL_BY_ID, utensilIcon } from './utensils.js';

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
    const sig = a.inv.map((s) => (s ? `${s.id}:${s.inf ? 'inf' : s.count}` : '-')).join('|') + `#${a.sel}`;
    if (sig === this.hotSig) return;
    this.hotSig = sig;
    a.inv.forEach((s, i) => {
      const b = this.slots[i];
      b.classList.toggle('sel', i === a.sel);
      b.classList.toggle('empty', !s);
      const img = b.querySelector('img');
      if (s) { img.src = this.icons[s.id]; img.alt = FOODS[s.id].name; }
      else { img.removeAttribute('src'); img.alt = ''; }
      b.querySelector('.count').textContent = !s ? '' : s.inf ? '∞' : FOODS[s.id].maxStack > 1 ? s.count : '';
      b.title = s ? `${FOODS[s.id].name}: ${FOODS[s.id].role}` : 'Empty';
    });
  }

  update(game, dt) {
    const a = game.player;
    const cam = game.camera;
    // FPS
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const scale = game.perf ? game.perf.scale : 1;
      $('fps').textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${game.lastDrawCalls || 0} draw calls · ${Math.round(scale * 100)}% resolution`;
      this.fpsAcc = 0; this.fpsN = 0;
    }

    $('alive').textContent = game.online && game.net ? game.net.playerCount() : game.aliveCount();
    if (!game.online) { $('alive-label').textContent = 'Titans left'; $('scores').hidden = true; }
    const T = game.tide;
    const tideEl = $('tide');
    if (game.online && game.net) {
      const n = game.net.playerCount();
      tideEl.textContent = `Online · room ${game.net.roomName} · ${n} player${n === 1 ? '' : 's'}${game.net.connected ? '' : ' · reconnecting'}`;
      tideEl.className = 'tide-banner';
      $('alive-label').textContent = 'Players';
      this._scoreboard(game);
    } else if (game.state === 'drop') { tideEl.textContent = game.mode === 'chef' ? 'Glide down and get ready' : 'Glide down and grab food'; tideEl.className = 'tide-banner'; }
    else if (T.phase >= T.phases.length) { tideEl.textContent = 'Final circle'; tideEl.className = 'tide-banner urgent'; }
    else if (T.mode === 'wait') {
      const s = Math.ceil(T.t);
      tideEl.textContent = `Soap Tide moves in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      tideEl.className = 'tide-banner';
    } else { tideEl.textContent = 'The Soap Tide is closing in'; tideEl.className = 'tide-banner urgent'; }

    if (a) {
      $('kills').textContent = a.kills;
      const hp = Math.max(0, a.hp), gl = Math.max(0, a.glaze);
      $('hpFill').style.transform = `scaleX(${hp / MAX_HP})`;
      $('glazeFill').style.transform = `scaleX(${gl / 100})`;
      $('hpText').textContent = Math.ceil(hp);
      $('glazeText').textContent = Math.ceil(gl);
      $('stamFill').style.transform = `scaleX(${a.stamina / 100})`;
      $('stam').classList.toggle('tired', a.staminaFlash > 0);
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

      // aim stick on phones shows what you're holding and what holding it does
      const fi = document.getElementById('tFireIcon');
      if (fi && this.input.isTouch) {
        const hid = slot ? slot.id : '';
        if (fi.dataset.id !== hid) {
          fi.dataset.id = hid;
          if (hid && this.icons[hid]) fi.src = this.icons[hid]; else fi.removeAttribute('src');
          document.getElementById('tFireLabel').textContent = !food ? 'Throw' : food.auto ? 'Hold: fire' : food.charge > 0 ? 'Hold: charge' : 'Tap: throw';
        }
      }

      // the carried utensil and what it is doing right now
      const uc = $('utensil');
      const uid = a.utensil || '';
      if (uc.dataset.id !== uid) {
        uc.dataset.id = uid;
        uc.hidden = !uid;
        if (uid) {
          const u = UTENSIL_BY_ID[uid];
          uc.querySelector('img').src = utensilIcon(uid);
          uc.querySelector('b').textContent = `${u.name} · ${u.role}`;
          uc.style.setProperty('--uc', u.color);
          uc.title = `${u.buff} Trade-off: ${u.trade}`;
        }
      }
      if (uid) {
        const txt = game.utensils.status(a);
        if (txt !== this.lastUStatus) {
          this.lastUStatus = txt;
          uc.querySelector('span').textContent = txt;
          uc.classList.toggle('off', /^(No effect|Overheated|Carry)/.test(txt));
        }
      }

      // statuses
      const st = a.statusList().map(([k, label]) => `<span class="chip ${k}">${label}</span>`).join('');
      if (st !== this.lastStatus) { $('statuses').innerHTML = st; this.lastStatus = st; }

      // mouse not locked (desktop): say how to get the aim back
      const lh = $('lockhint');
      const showLock = !this.input.isTouch && this.input.enabled && !this.input.locked && !game.paused && a.alive;
      if (lh.hidden === showLock) lh.hidden = !showLock;

      // crosshair and charge ring
      const ch = $('crosshair');
      ch.dataset.profile = food ? food.profile : 'none';
      const c = a.charging && food ? Math.min(1, a.chargeT / Math.max(0.01, a.chargeLen || food.charge)) : 0;
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
      o.classList.toggle('lowhp', a.alive && a.hp < MAX_HP * 0.3);
    }

    this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').className = 'hitmarker';
    this.hurtT -= dt; if (this.hurtT <= 0) $('fx-overlay').classList.remove('hurt');
    this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on');
    this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('on');

    this._nameplates(game, cam);
    this._radar(game, cam);
    this._floaters(cam, dt);
  }

  // Online scoreboard: everyone in the room by splats (names are plain text).
  _scoreboard(game) {
    this.sbT = (this.sbT || 0) + 1;
    if (this.sbT % 20) return;
    const el = $('scores');
    el.hidden = false;
    const rows = game.actors.filter((a) => a === game.player || a.isRemote)
      .sort((a, b) => b.kills - a.kills).slice(0, 8);
    el.replaceChildren(...rows.map((a) => {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.textContent = a === game.player ? `${a.name} (you)` : a.name; n.style.color = a.color;
      const k = document.createElement('b'); k.textContent = a.kills;
      li.append(n, k);
      return li;
    }));
  }

  // Noise arrows around the crosshair: direction only (plus distance while sniffing).
  _radar(game, cam) {
    const layer = $('radar');
    const marks = game.noiseMarkers();
    this.radarEls ||= [];
    while (this.radarEls.length < 6) {
      const el = document.createElement('div');
      el.className = 'noise';
      el.innerHTML = '<i></i><span></span>';
      layer.appendChild(el);
      this.radarEls.push(el);
    }
    const yaw = this.input.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.radarEls.forEach((el, i) => {
      const m = marks[i];
      if (!m) { el.style.display = 'none'; return; }
      // skip enemies already plainly on screen (unless sniffing)
      if (!m.sniff) {
        const s = this._project(m.actor.center(_e), cam);
        if (s && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight && hasLineOfSight(cam.position, _e)) { el.style.display = 'none'; return; }
      }
      const dx = m.actor.pos.x - game.player.pos.x, dz = m.actor.pos.z - game.player.pos.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); // 0 = straight ahead
      el.style.display = '';
      el.style.transform = `rotate(${ang}rad)`;
      el.style.opacity = String(0.35 + 0.65 * m.strength);
      el.classList.toggle('sniff', m.sniff);
      const span = el.querySelector('span');
      span.textContent = m.sniff ? `${Math.round(m.dist)} m` : '';
      span.style.transform = `rotate(${-ang}rad)`;
    });
    const sn = $('sniff');
    const left = (game.sniffReadyAt || 0) - game.time;
    const label = left > 0 ? `Sniff ${Math.ceil(left)}s` : (this.input.isTouch ? 'Sniff ready' : 'Sniff ready (B)');
    if (sn.textContent !== label) sn.textContent = label;
    sn.classList.toggle('ready', left <= 0);
    const tb = document.getElementById('tSniff');
    if (tb) tb.classList.toggle('cooling', left > 0);
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
      el.querySelector('.h').style.width = `${Math.max(0, a.hp) / MAX_HP * 100}%`;
      el.querySelector('.g').style.width = `${Math.max(0, a.glaze)}%`;
      el.style.setProperty('--c', a.color);
      el.classList.toggle('locked', a === game.lockCandidate);
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
