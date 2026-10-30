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
const ALT_SHORT = { cheese: 'Shield', banana: 'Eat', jelly: 'Jump Pad' };
const ALT_BUTTON = {
  tomato: 'Dash', carrot: 'Teleport', ice: 'Storm', soda: 'Mega jump', chili: 'Flames', cookie: 'Rush', jelly: 'Pad',
  grapes: 'Juice', watermelon: 'Smash', pineapple: 'Spikes', blueberry: 'Spiral',
};
const altShort = (id, food) => ALT_SHORT[id] || food.altName || (food.altLabel || '').split(':')[0];

// (0.53) A class switched on or off only if it isn't already: even an unchanged toggle rewrites the attribute,
// and the browser then re-checks the page's styles (and maybe repaints) every frame.
const tog = (el, c, on) => { on = !!on; if (el && el.classList.contains(c) !== on) el.classList.toggle(c, on); };
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
        tog(b, 'sel', i === a.sel);
        tog(b, 'empty', !s);
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
        tog(b, 'sel', i === a.uSel && !!u);
        tog(b, 'empty', !u);
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
        if (b._h !== v) { b._h = v; tog(b, 'heat', v > 0.02); b.style.setProperty('--h', v.toFixed(3)); }
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
    if ((game.online && game.net) || game.arena?.active) this._scoreboard(game);
    if (game.online && game.net && !game.net.connected) { ico = 'online'; tt = game.net.lost ? 'Offline' : 'Reconnecting'; urgent = true; tip = `Room ${game.net.roomName}`; }
    else if (game.state === 'lobby') { ico = 'online'; tt = 'Joining'; tip = `Room ${game.net?.roomName || ''}`; }
    else if (game.mode === 'pots' && game.pots.active && game.state !== 'over') { tt = game.pots.pill(); ico = 'titan'; tip = 'Cooking Pot Wars'; }
    else if (game.arena?.active && game.state !== 'over') { tt = game.arena.pill(); urgent = game.state === 'play' && game.arena.timeLeft() < 30; tip = 'Time left: most splats wins'; ico = 'titan'; }
    else if (game.state === 'over' && game.arena?.active && !game.online) { tt = 'Full time'; tip = 'The match is over'; }
    else if (game.state === 'over') { tt = 'Next round'; tip = 'The next round starts in a few seconds'; }
    else if (game.state === 'drop') tt = 'Drop in';
    else if (T.phase >= T.phases.length) { tt = 'Final'; urgent = true; tip = 'Final circle'; }
    else if (T.mode === 'wait') { const s = Math.ceil(T.t); tt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; tip = 'The Soap Tide moves in'; }
    else { tt = 'Tide!'; urgent = true; tip = 'The Soap Tide is closing in'; }
    if (!game.online && !game.arena?.active && !$('scores').hidden) $('scores').hidden = true;
    if (this.lastTide !== tt + ico + urgent) {
      this.lastTide = tt + ico + urgent;
      $('tideText').textContent = tt;
      $('tideIco').className = `ico ${ico}`;
      $('tideSeg').title = tip;
      tog($('tide'), 'urgent', urgent);
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
      tog($('glaze'), 'none', gl <= 0.5);
      const hpt = String(Math.ceil(hp));
      if ($('hpText').textContent !== hpt) $('hpText').textContent = hpt;
      $('stamFill').style.transform = `scaleX(${a.stamina / 100})`;
      tog($('stam'), 'tired', a.staminaFlash > 0);
      this._renderHotbar(a); // (touch laptops can show both the plates and the bar)
      if (this.input.isTouch) this._renderDials(a);

      const food = a.selectedFood();
      const slot = a.selected();
      const ub = a.utensil ? game.utensils.brief(a) : null;
      const touch = this.input.isTouch;
      { // one short line over the plates: the food, its alt key, and the utensil only when it needs attention
        let hint = '';
        const cd = food && food.alt && a.utensil !== 'pan' ? Math.ceil((a.altReadyAt[slot.id] || 0) - game.time) : 0;
        if (food) {
          const alt = a.utensil === 'pan' ? 'Slam' : food.alt ? altShort(slot.id, food) : '';
          hint = `<b>${food.name}</b>` + (alt ? `<span class="alt${cd > 0 ? ' cd' : ''}"><kbd>Q</kbd>${alt}${cd > 0 ? `<i>${cd} s</i>` : ''}</span>` : '');
        } else hint = 'Walk over food to pick it up';
        if (this.altCd > 0 && cd <= 0 && this.altCdId === slot?.id) this.sfx?.play('ready'); // the alt is back
        this.altCd = cd; this.altCdId = slot?.id;
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
        const altCd = food && food.alt && a.utensil !== 'pan' ? Math.ceil((a.altReadyAt[slot.id] || 0) - game.time) : 0;
        const altTxt = (a.utensil === 'pan' && food ? 'Slam' : food && food.alt ? ALT_BUTTON[slot.id] || altShort(slot.id, food) : 'Alt') + (altCd > 0 ? ` ${altCd}` : '');
        const tAlt = $('tAlt');
        if (tAlt.textContent !== altTxt) tAlt.textContent = altTxt;
        tog(tAlt, 'cd', altCd > 0);
        const br = $('ubrief');
        const bt = ub ? ub.text : '';
        if (br.textContent !== bt) br.textContent = bt;
        if (br.hidden === !!ub) br.hidden = !ub;
        if (ub) { tog(br, 'warn', !!ub.warn); br.style.setProperty('--uc', UTENSIL_BY_ID[a.utensil].color); }
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
      const prof = food ? food.profile : 'none';
      if (ch.dataset.profile !== prof) ch.dataset.profile = prof;
      const chan = a.channel; // a teleport winding up fills the ring in purple
      const c = chan ? Math.min(1, chan.t / chan.need) : a.charging && food ? Math.min(1, a.chargeT / Math.max(0.01, a.chargeLen || food.charge)) : 0;
      const dash = String(Math.round(176 * (1 - c) * 10) / 10);
      if (this._dash !== dash) { this._dash = dash; $('chargeRing').style.strokeDashoffset = dash; }
      tog(ch, 'charging', a.charging || !!chan);
      tog(ch, 'channel', !!chan);
      tog(ch, 'full', c >= 1);
      tog(ch, 'cooldown', game.time < a.recoverUntil || game.time < a.swapLockUntil);

      // full-screen status overlays
      const o = $('fx-overlay');
      tog(o, 'frozen', a.isFrozen());
      tog(o, 'burning', a.isBurning());
      tog(o, 'juiced', game.time < a.juicedUntil);
      tog(o, 'wet', a.isWet());
      tog(o, 'lowhp', a.alive && a.hp < (a.maxHp || MAX_HP) * 0.3);
    }

    this.hitT -= dt; if (this.hitT <= 0 && $('hitmarker').className !== 'hitmarker') $('hitmarker').className = 'hitmarker';
    this.hurtT -= dt; if (this.hurtT <= 0) tog($('fx-overlay'), 'hurt', false);
    this.toastT -= dt; if (this.toastT <= 0) tog($('toast'), 'on', false);
    this.bannerT -= dt; if (this.bannerT <= 0) tog($('banner'), 'on', false);

    this._nameplates(game, cam);
    this._radar(game, cam);
    this._floaters(cam, dt);
  }

  // Online scoreboard: everyone in the room by splats (names are plain text). (0.54) Also in Squads (the two
  // teams' scores first) and King of the Utensil (a crown by whoever holds a Legendary), online or not.
  _scoreboard(game) {
    this.sbT = (this.sbT || 0) + 1;
    if (this.sbT % 20) return;
    const el = $('scores');
    el.hidden = false;
    const A = game.arena?.active ? game.arena : null;
    const rows = game.actors.filter((a) => a === game.player || a.isRemote || a.isBot)
      .sort((a, b) => b.kills - a.kills).slice(0, A?.squads ? 6 : 8);
    const line = (name, color, score, cls = '') => {
      const li = document.createElement('li'); if (cls) li.className = cls;
      const n = document.createElement('span'); n.textContent = name; n.style.color = color;
      const k = document.createElement('b'); k.textContent = score;
      li.append(n, k);
      return li;
    };
    const teams = A?.squads ? A.ranking().sort((x, y) => x.team - y.team).map((r) => line(r.name, r.color, r.score, `team${game.player?.team === r.team ? ' me' : ''}`)) : [];
    el.replaceChildren(...teams, ...rows.map((a) => line(`${A?.king && A.held(a).length ? '👑 ' : ''}${a === game.player && a.name !== 'You' ? `${a.name} (you)` : a.name}`, a.color, a.kills)));
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
      if (!m) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      // skip enemies already plainly on screen (unless sniffing)
      if (!m.sniff) {
        const s = this._project(m.actor.center(_e), cam);
        if (s && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight && hasLineOfSight(cam.position, _e)) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      }
      const dx = m.actor.pos.x - game.player.pos.x, dz = m.actor.pos.z - game.player.pos.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz).toFixed(2); // 0 = straight ahead
      // (0.53) only what changed is written (each write has the browser redo the arrow)
      const c = (el._c ||= {}), op = (0.35 + 0.65 * m.strength).toFixed(2), txt = m.sniff ? `${Math.round(m.dist)} m` : '';
      if (el.style.display) el.style.display = '';
      if (c.ang !== ang) { c.ang = ang; el.style.transform = `rotate(${ang}rad)`; }
      if (c.op !== op) { c.op = op; el.style.opacity = op; }
      tog(el, 'sniff', m.sniff);
      const span = (c.span ||= el.querySelector('span'));
      if (c.txt !== txt) { c.txt = txt; span.textContent = txt; }
      if (txt && c.sang !== ang) { c.sang = ang; span.style.transform = `rotate(${-ang}rad)`; }
    });
    const sn = $('sniff');
    const left = (game.sniffReadyAt || 0) - game.time;
    tog(sn, 'ready', left <= 0);
    const sp = left > 0 ? (1 - left / 10).toFixed(2) : '1';
    if (this._sp !== sp) { this._sp = sp; sn.style.setProperty('--p', sp); }
    const tb = document.getElementById('tSniff');
    if (tb) tog(tb, 'cooling', left > 0);
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
      // (0.53) only what changed is written (each write makes the browser redo some layout work)
      const c = (el._c ||= { name: el.querySelector('.name'), h: el.querySelector('.h'), g: el.querySelector('.g') });
      const set = (k, v, fn) => { if (c[k] !== v) { c[k] = v; fn(v); } };
      if (!pos) { set('show', false, () => { el.style.display = 'none'; }); continue; }
      set('show', true, () => { el.style.display = ''; });
      set('tf', `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) translate(-50%, -100%)`, (v) => { el.style.transform = v; });
      set('nm', a.name, (v) => { c.name.textContent = v; });
      set('hp', Math.round(Math.max(0, a.hp) / (a.maxHp || MAX_HP) * 200) / 2, (v) => { c.h.style.width = `${v}%`; });
      set('gl', Math.round(Math.max(0, a.glaze)), (v) => { c.g.style.width = `${v}%`; });
      set('col', a.color, (v) => { el.style.setProperty('--c', v); });
      set('lk', a === game.lockCandidate, (v) => { tog(el, 'locked', v); });
    }
    // (0.43) a plate whose Titan has left the match (the bots behind the menu when an online room starts with
    // no bots, a player who left): gone too, or it stays frozen where it was last drawn
    if (this.plates.size > game.actors.length) {
      const here = new Set(game.actors);
      for (const [a, el] of this.plates) if (!here.has(a)) { el.remove(); this.plates.delete(a); }
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

  // Ultimate alts (0.31): a coloured flash round the screen edge and the move's name under the crosshair.
  ultFlash(color) {
    const el = $('ultflash');
    if (!el) return;
    el.style.setProperty('--uc', color || '#ffd447');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); // restart the animation
  }
  ultCall(text, color) {
    const el = $('ultcall');
    if (!el) return;
    el.textContent = text;
    el.style.setProperty('--uc', color || '#ffd447');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
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
