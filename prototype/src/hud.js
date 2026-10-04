// DOM heads-up display (GDD 14.1): bars, hotbar, kill feed, statuses, nameplates, damage numbers.
import * as THREE from 'three';
import { hasLineOfSight } from './core.js';
import { FOODS } from './foods.js';
import { MAX_HP } from './actors.js';
import { UTENSIL_BY_ID, utensilHeat, utensilIcon } from './utensils.js';
import { Dial } from './dials.js';

const $ = (id) => document.getElementById(id);
const _p = new THREE.Vector3(), _e = new THREE.Vector3();

// Short names for the food alt actions: the hint line, and an even shorter one for the phone Alt button.
const ALT_SHORT = { cheese: 'Shield', grapes: 'Eat', banana: 'Eat', jelly: 'Bounce pad' };
const ALT_BUTTON = { tomato: 'Bounce', carrot: 'Vault', ice: 'Chill', soda: 'Fizz jump', chili: 'Hot feet', cookie: 'Rush', jelly: 'Pad' };
const altShort = (id, food) => ALT_SHORT[id] || food.altName || (food.altLabel || '').split(':')[0];

export class HUD {
  constructor(icons, input, sfx = null) {
    this.icons = icons; this.input = input; this.sfx = sfx;
    this.el = $('hud');
    const plate = (parent, i, key, label, pick) => {
      const b = document.createElement('button');
      b.className = 'slot empty';
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.setAttribute('data-touch-btn', ''); // touches here pick instead of steering
      b.innerHTML = `<span class="key">${key}</span><img alt=""><span class="count"></span>`;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); pick(i); });
      parent.appendChild(b);
      return b;
    };
    this.slots = [0, 1, 2, 3, 4].map((i) => plate($('hotbar'), i, i + 1, `Food ${i + 1}`, (k) => { input.slot = k; }));
    this.uslots = [0, 1, 2].map((i) => plate($('ubar'), i, i + 6, `Utensil ${i + 1}`, (k) => { input.uslot = k; }));
    this.hotSig = ''; this.uSig = '';
    this.floaters = [];
    this.plates = new Map();
    this.feedEl = $('feed');
    this.toastT = 0; this.bannerT = 0; this.hitT = 0; this.hurtT = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.lastHint = '';
    if (/[?&]fps\b/.test(location.search)) document.body.classList.add('show-fps');
    // phones: the food plate and the utensil plate in the bottom corners
    if (input.isTouch) {
      const tick = () => this.sfx?.play('tick', null, 0.7);
      this.foodDial = new Dial($('foodDial'), { side: 'left', onPick: (i) => { input.slot = i; }, onTick: tick });
      this.utDial = new Dial($('utDial'), { side: 'right', onPick: (i) => { input.uslot = i; }, onTick: tick });
    }
  }

  show(on) { this.el.hidden = !on; }

  _renderHotbar(a) {
    const sig = a.inv.map((s) => (s ? `${s.id}:${s.inf ? 'inf' : s.count}` : '-')).join('|') + `#${a.sel}`;
    if (sig !== this.hotSig) {
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
    const usig = (a.utensils || []).map((id) => id || '-').join('|') + `#${a.uSel}`;
    if (usig !== this.uSig) {
      this.uSig = usig;
      this.uslots.forEach((b, i) => {
        const id = a.utensils?.[i], u = id && UTENSIL_BY_ID[id];
        b.classList.toggle('sel', i === a.uSel && !!u);
        b.classList.toggle('empty', !u);
        b.style.setProperty('--sc', u ? u.color : '');
        const img = b.querySelector('img');
        if (u) { img.src = utensilIcon(id); img.alt = u.name; } else { img.removeAttribute('src'); img.alt = ''; }
        b.title = u ? `${u.name} (${u.role}): ${u.buff} Trade-off: ${u.trade}` : 'Empty: open a delivery box to find a utensil';
      });
    }
    // heat on the utensil plates (Deep Fryer, Oven Mitt and friends)
    if (a.utensils) {
      a.utensils.forEach((id, i) => {
        const h = id && utensilHeat(id), st = a.uStates[i];
        const v = !h ? 0 : this.game.time < st.overUntil ? 1 : Math.min(1, st.heat / h.max);
        const b = this.uslots[i];
        if (b._h !== v) { b._h = v; b.classList.toggle('heat', v > 0.02); b.style.setProperty('--h', v.toFixed(3)); }
      });
    }
  }

  // Phones: fill the two corner plates and keep them turned to what is in hand.
  _renderDials(a) {
    const foods = a.inv.map((s) => s && { id: s.id, icon: this.icons[s.id] || '', name: FOODS[s.id].name, count: s.inf ? '∞' : FOODS[s.id].maxStack > 1 ? s.count : null });
    this.foodDial.sync(foods, a.sel);
    this.foodDial.autoAdvance(a.sel);
    const uts = (a.utensils || [null, null, null]).map((id) => id && { id, icon: utensilIcon(id), name: UTENSIL_BY_ID[id].name });
    this.utDial.sync(uts, a.uSel);
  }

  update(game, dt) {
    const a = game.player;
    const cam = game.camera;
    this.game = game;
    // FPS (shown with ?fps in the address)
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const scale = game.perf ? game.perf.scale : 1;
      $('fps').textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${game.lastDrawCalls || 0} draw calls · ${Math.round(scale * 100)}% resolution`;
      this.fpsAcc = 0; this.fpsN = 0;
    }

    // the top pill: Soap Tide timer (or online status), Titans left, your splats
    const T = game.tide;
    let tt, urgent = false, ico = 'bubble', tip = 'Soap Tide';
    if (game.online && game.net) this._scoreboard(game);
    if (game.online && game.net && !game.net.connected) { ico = 'online'; tt = 'Reconnecting'; urgent = true; tip = `Room ${game.net.roomName}`; }
    else if (game.state === 'lobby') { ico = 'online'; tt = 'Joining'; tip = `Room ${game.net?.roomName || ''}`; }
    else if (game.mode === 'pots' && game.pots.active && game.state !== 'over') { tt = game.pots.pill(); ico = 'titan'; tip = 'Cooking Pot Wars'; }
    else if (game.state === 'over') { tt = 'Next round'; tip = 'The next round starts in a few seconds'; }
    else if (game.state === 'drop') tt = 'Drop in';
    else if (T.phase >= T.phases.length) { tt = 'Final'; urgent = true; tip = 'Final circle'; }
    else if (T.mode === 'wait') { const s = Math.ceil(T.t); tt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; tip = 'The Soap Tide moves in'; }
    else { tt = 'Tide!'; urgent = true; tip = 'The Soap Tide is closing in'; }
    if (!game.online) $('scores').hidden = true;
    if (this.lastTide !== tt + ico + urgent) {
      this.lastTide = tt + ico + urgent;
      $('tideText').textContent = tt;
      $('tideIco').className = `ico ${ico}`;
      $('tideSeg').title = tip;
      $('tide').classList.toggle('urgent', urgent);
      $('aliveSeg').title = 'Titans left';
    }
    const alive = String(game.aliveCount());
    if ($('alive').textContent !== alive) $('alive').textContent = alive;

    if (a) {
      const kills = String(a.kills);
      if ($('kills').textContent !== kills) $('kills').textContent = kills;
      const hp = Math.max(0, a.hp), gl = Math.max(0, a.glaze);
      $('hpFill').style.transform = `scaleX(${hp / (a.maxHp || MAX_HP)})`;
      $('glazeFill').style.transform = `scaleX(${gl / 100})`;
      $('glaze').classList.toggle('none', gl <= 0.5);
      const hpt = String(Math.ceil(hp));
      if ($('hpText').textContent !== hpt) $('hpText').textContent = hpt;
      $('stamFill').style.transform = `scaleX(${a.stamina / 100})`;
      $('stam').classList.toggle('tired', a.staminaFlash > 0);
      this._renderHotbar(a); // (touch laptops can show both the plates and the bar)
      if (this.input.isTouch) this._renderDials(a);

      const food = a.selectedFood();
      const slot = a.selected();
      const ub = a.utensil ? game.utensils.brief(a) : null;
      const touch = this.input.isTouch;
      { // one short line over the plates: the food, its alt key, and the utensil only when it needs attention
        let hint = '';
        if (food) {
          const alt = a.utensil === 'pan' ? 'Slam' : food.alt ? altShort(slot.id, food) : '';
          hint = `<b>${food.name}</b>` + (alt ? `<span class="alt"><kbd>Q</kbd>${alt}</span>` : '');
        } else hint = 'Walk over food to pick it up';
        if (ub) hint += `<span class="ub${ub.warn ? ' warn' : ''}" style="--uc:${UTENSIL_BY_ID[a.utensil].color}">${UTENSIL_BY_ID[a.utensil].name}: ${ub.text}</span>`;
        if (hint !== this.lastHint) { $('hint').innerHTML = hint; this.lastHint = hint; }
      }
      if (touch) {
        // aim stick shows what you're holding and what holding it does; the Alt button says what it does
        const fi = $('tFireIcon');
        const hid = slot ? slot.id : '';
        if (fi.dataset.id !== hid) {
          fi.dataset.id = hid;
          if (hid && this.icons[hid]) fi.src = this.icons[hid]; else fi.removeAttribute('src');
          $('tFireLabel').textContent = !food ? 'Throw' : food.auto ? 'Hold: fire' : food.charge > 0 ? 'Hold: charge' : 'Tap: throw';
        }
        const altTxt = a.utensil === 'pan' && food ? 'Slam' : food && food.alt ? ALT_BUTTON[slot.id] || altShort(slot.id, food) : 'Alt';
        const tAlt = $('tAlt');
        if (tAlt.textContent !== altTxt) tAlt.textContent = altTxt;
        const br = $('ubrief');
        const bt = ub ? ub.text : '';
        if (br.textContent !== bt) br.textContent = bt;
        if (br.hidden === !!ub) br.hidden = !ub;
        if (ub) { br.classList.toggle('warn', !!ub.warn); br.style.setProperty('--uc', UTENSIL_BY_ID[a.utensil].color); }
      }

      // statuses (short words, no numbers)
      const st = a.statusList().map(([k, label]) => `<span class="chip ${k}">${label.replace(/\s*-?\d+%?$/, '').replace(/^Cheese shield$/, 'Shield')}</span>`).join('');
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
      o.classList.toggle('lowhp', a.alive && a.hp < (a.maxHp || MAX_HP) * 0.3);
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
    const rows = game.actors.filter((a) => a === game.player || a.isRemote || a.isBot)
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
    sn.classList.toggle('ready', left <= 0);
    sn.style.setProperty('--p', left > 0 ? (1 - left / 10).toFixed(3) : '1');
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
      el.querySelector('.h').style.width = `${Math.max(0, a.hp) / (a.maxHp || MAX_HP) * 100}%`;
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
    while (this.feedEl.children.length > 3) this.feedEl.lastChild.remove();
    setTimeout(() => li.classList.add('old'), 4500);
    setTimeout(() => li.remove(), 5200);
  }
  clearFeed() { this.feedEl.innerHTML = ''; }
}
