// ---------- DOM UI: HUD, crafting, level-ups, banners ----------

const $ = id => document.getElementById(id);

function setModal(id, open) {
  $(id).classList.toggle('open', open);
}

function anyModalOpen() {
  return ['modal-levelup', 'modal-craft', 'modal-pause', 'modal-gameover', 'modal-start', 'modal-box', 'modal-settings']
    .some(id => $(id).classList.contains('open'));
}

// ---------- settings ----------
function openSettings(scene) {
  setModal('modal-pause', false);
  $('set-volume').value = Math.round((SETTINGS.volume ?? 1) * 100);
  $('set-sound').checked = !SETTINGS.muted;
  $('set-shake').checked = !!SETTINGS.shake;
  $('set-float').checked = !!SETTINGS.floatText;
  $('set-minimap').checked = !!SETTINGS.minimap;
  $('set-log').checked = !!SETTINGS.log;
  const save = readSave();
  $('set-saveinfo').textContent = save ? `— day ${save.state.day}, saved ${savedAgo(save.savedAt)}` : '— no save yet';
  setModal('modal-settings', true);
  scene.setPaused(true);
}

function closeSettings(scene) {
  setModal('modal-settings', false);
  scene.setPaused(false);
}

function initSettingsUI() {
  if (window._settingsInit) return;
  window._settingsInit = true;
  $('set-volume').oninput = e => {
    SETTINGS.volume = Number(e.target.value) / 100;
    saveSettings();
    SFX.pickup(); // taste it
  };
  $('set-sound').onchange = e => SFX.setMuted(!e.target.checked);
  $('set-shake').onchange = e => { SETTINGS.shake = e.target.checked; saveSettings(); };
  $('set-float').onchange = e => { SETTINGS.floatText = e.target.checked; saveSettings(); };
  $('set-minimap').onchange = e => {
    SETTINGS.minimap = e.target.checked;
    saveSettings();
    $('minimap').style.display = SETTINGS.minimap ? '' : 'none';
  };
  $('set-log').onchange = e => {
    SETTINGS.log = e.target.checked;
    saveSettings();
    $('activity-log').style.display = SETTINGS.log ? '' : 'none';
  };
  $('import-file').onchange = e => {
    if (e.target.files && e.target.files[0]) importSaveFile(window.gameScene, e.target.files[0]);
    e.target.value = '';
  };
}

// "NEW WORLD" on the continue-prompt: keep this fresh world and make it the save
function startNewWorld() {
  setModal('modal-start', false);
  saveGame(window.gameScene);
  window.gameScene.setPaused(false);
  showBanner('⛏ BLOCKBONK ⛏', 'mine by walking into blocks · craft turrets before dark');
}

// ---------- HUD ----------
function updateHUD(scene) {
  const st = scene.state;
  $('hp-fill').style.transform = `scaleX(${Math.max(0, st.hp / st.maxHp)})`;
  $('hp-text').textContent = `${Math.ceil(st.hp)}/${st.maxHp}`;
  $('xp-fill').style.transform = `scaleX(${Math.min(1, st.xp / st.xpNext)})`;
  $('level-tag').textContent = `LV ${st.level}`;

  $('clock-day').textContent = st.isNight ? `NIGHT ${st.night}` : `DAY ${st.day}`;
  $('clock-day').style.color = st.isNight ? '#ff6b5e' : '#ffd95e';
  const t = Math.max(0, Math.ceil(st.phaseT));
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  const ct = $('clock-time');
  ct.textContent = `${st.isNight ? '🌙' : '☀'} ${mm}:${ss}`;
  ct.style.color = st.isNight ? '#aab4c8' : (st.phaseT < 15 ? '#ff6b5e' : st.phaseT < 60 ? '#ff9a3e' : '#aab4c8');

  $('buffs').innerHTML = st.buffs.strength > 0
    ? `💜 STRENGTH ${Math.ceil(st.buffs.strength)}s` : '';

  for (const r of ['wood', 'stone', 'iron', 'gold', 'diamond']) {
    const el = $('res-' + r);
    if (el.textContent !== String(st.res[r])) el.textContent = st.res[r];
  }
  $('res-coins').textContent = st.coins;
  const sk = k => (st.skills[k] || { lvl: 1 }).lvl;
  $('skill-line').textContent = `⛏${sk('mining')} 🎣${sk('fishing')} ⚔${sk('combat')} 🔨${sk('building')} ⚒${sk('forging')} 🐾${sk('taming')}`;
  $('level-tag').textContent = `LV ${st.level}` + ((st.prestige || 0) ? ` ✨${st.prestige}` : '');
}

function refreshWeaponList(scene) {
  const st = scene.state;
  const el = $('weapon-list');
  el.innerHTML = '';
  for (const [key, lvl] of Object.entries(st.weapons)) {
    const d = document.createElement('div');
    d.className = 'wslot';
    d.innerHTML = `${WEAPONS[key].icon}<span class="lvl">${lvl}</span>`;
    d.title = WEAPONS[key].name;
    el.appendChild(d);
  }
  for (const [key, lvl] of Object.entries(st.passives)) {
    if (!lvl) continue;
    const d = document.createElement('div');
    d.className = 'wslot';
    d.style.borderColor = '#5a4a7c';
    d.innerHTML = `${PASSIVES[key].icon}<span class="lvl">${lvl}</span>`;
    d.title = PASSIVES[key].name;
    el.appendChild(d);
  }
}

function refreshHotbar(scene) {
  const st = scene.state;
  const el = $('hotbar');
  el.innerHTML = '';
  HOTBAR_ORDER.forEach((id, i) => {
    const def = STRUCTURES[id];
    const n = st.stock[id] || 0;
    const d = document.createElement('div');
    d.className = 'hslot' + (n ? '' : ' empty') + (st.placing === id ? ' selected' : '');
    d.innerHTML = `<span class="key">${i + 1}</span>${def.icon}<span class="cnt">${n || ''}</span>`;
    d.title = def.name;
    d.onclick = () => {
      if (!n) return;
      if (st.placing === id) cancelPlacement(scene);
      else enterPlacement(scene, id);
    };
    el.appendChild(d);
  });

  // potion slots (9 / 0)
  POTION_ORDER.forEach(id => {
    const def = POTIONS[id];
    const n = st.stock[id] || 0;
    const d = document.createElement('div');
    d.className = 'hslot potion' + (n ? '' : ' empty');
    d.innerHTML = `<span class="key">${def.key}</span>${def.icon}<span class="cnt">${n || ''}</span>`;
    d.title = def.name;
    d.onclick = () => drinkPotion(scene, id);
    el.appendChild(d);
  });

  // catch orb slot (F)
  {
    const n = st.stock.catchOrb || 0;
    const d = document.createElement('div');
    d.className = 'hslot potion' + (n ? '' : ' empty');
    d.style.borderColor = '#c84a4a';
    d.innerHTML = `<span class="key">F</span>🔴<span class="cnt">${n || ''}</span>`;
    d.title = 'Catch Orb — throw at a wild critter';
    d.onclick = () => throwOrb(scene);
    el.appendChild(d);
  }
}

// ---------- banner ----------
let bannerTimer = null;
function showBanner(title, sub) {
  const b = $('banner');
  b.innerHTML = `${title}${sub ? `<div style="font-size:10px;color:#e8e8e8;margin-top:10px">${sub}</div>` : ''}`;
  b.style.opacity = 1;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.opacity = 0; }, 3200);
}

// ---------- crafting ----------
function toggleCraft(scene) {
  const open = $('modal-craft').classList.contains('open');
  if (open) {
    setModal('modal-craft', false);
    scene.setPaused(false);
  } else if (!anyModalOpen()) {
    renderCraftMenu(scene);
    setModal('modal-craft', true);
    scene.setPaused(true);
  }
}

function resOf(st, r) {
  return r === 'coins' ? st.coins : st.res[r];
}

// the Forging skill shaves crafting costs (min 1 of each ingredient)
function effN(st, n) {
  const lvl = (st.skills && st.skills.forging ? st.skills.forging.lvl : 1) - 1;
  return Math.max(1, Math.round(n * (1 - 0.01 * lvl)));
}

function canAfford(st, cost) {
  return Object.entries(cost).every(([r, n]) => resOf(st, r) >= effN(st, n));
}

function maxCraftable(st, cost) {
  let m = Infinity;
  for (const [r, n] of Object.entries(cost)) m = Math.min(m, Math.floor(resOf(st, r) / effN(st, n)));
  return m === Infinity ? 0 : m;
}

function payCost(st, cost) {
  for (const [r, n] of Object.entries(cost)) {
    if (r === 'coins') st.coins -= effN(st, n);
    else st.res[r] -= effN(st, n);
  }
}

function costHTML(st, cost) {
  return Object.entries(cost)
    .map(([r, n]) => `<span class="${resOf(st, r) >= effN(st, n) ? 'ok' : 'no'}">${effN(st, n)} ${r === 'coins' ? '🪙' : r}</span>`)
    .join(' · ');
}

function renderCraftMenu(scene) {
  const st = scene.state;
  const el = $('craft-list');
  el.innerHTML = '';
  for (const rec of [...RECIPES, ...CHESTS]) {
    if (rec.requires && !st.crafted[rec.requires]) continue; // hidden until prereq owned
    const owned = rec.kind === 'upgrade' && st.crafted[rec.id];
    const div = document.createElement('div');
    div.className = 'recipe' + (owned ? ' crafted' : '');
    const stackable = rec.kind === 'placeable' || rec.kind === 'potion';
    const stock = stackable
      ? (st.stock[rec.id] ? ` <span style="color:#ffd95e">(x${st.stock[rec.id]})</span>` : '') : '';
    const cantBuy = owned || !canAfford(st, rec.cost);
    const qtyBtns = stackable && !owned
      ? `<button data-q="5" class="qty" ${maxCraftable(st, rec.cost) < 2 ? 'disabled' : ''}>x5</button>` +
        `<button data-q="max" class="qty" ${maxCraftable(st, rec.cost) < 2 ? 'disabled' : ''}>MAX</button>`
      : '';
    div.innerHTML = `
      <div class="icon">${rec.icon}</div>
      <div class="info">
        <div class="rname">${rec.name}${stock}</div>
        <div class="rdesc">${rec.desc}</div>
        <div class="cost">${owned ? '<span class="ok">OWNED</span>' : costHTML(st, rec.cost)}</div>
      </div>
      <div class="craft-btns">
        <button data-q="1" ${cantBuy ? 'disabled' : ''}>${owned ? '✓' : 'CRAFT'}</button>${qtyBtns}
      </div>`;
    if (!owned) {
      div.querySelectorAll('button:not([disabled])').forEach(b => {
        b.onclick = () => craftRecipe(scene, rec, b.dataset.q === 'max' ? 9999 : Number(b.dataset.q));
      });
    }
    el.appendChild(div);
  }
  renderBlueprintRows(scene, el);
}

function craftRecipe(scene, rec, qty = 1) {
  const st = scene.state;
  if (!canAfford(st, rec.cost)) return;

  if (rec.kind === 'placeable' || rec.kind === 'potion') {
    const n = Math.min(qty, maxCraftable(st, rec.cost));
    if (n <= 0) return;
    for (const [r, c] of Object.entries(rec.cost)) {
      if (r === 'coins') st.coins -= effN(st, c) * n;
      else st.res[r] -= effN(st, c) * n;
    }
    st.stock[rec.id] = (st.stock[rec.id] || 0) + n;
    gainSkill(scene, 'forging', 2 * n);
    if (n > 1) showBanner(`${rec.icon} ${rec.name} x${n}`, 'crafted in bulk');
    refreshHotbar(scene);
    queueSave(scene);
    SFX.craft();
    renderCraftMenu(scene);
    updateHUD(scene);
    return;
  }

  payCost(st, rec.cost);
  gainSkill(scene, 'forging', 2);
  if (rec.kind === 'upgrade') {
    st.crafted[rec.id] = true;
    Object.assign(st.flags, rec.sets);
    showBanner(rec.icon + ' ' + rec.name, rec.desc);
  } else if (rec.kind === 'chest') {
    openChest(scene, rec);
  } else if (rec.id === 'apple') {
    st.hp = Math.min(st.maxHp, st.hp + 50);
  } else if (rec.id === 'tonic') {
    let revived = 0;
    for (const pet of scene.pets) {
      if (pet.fainted) { revivePet(scene, pet, 0.6); revived++; }
      else pet.hp = Math.min(petMaxHp(pet), pet.hp + 30);
    }
    showBanner('🧉 CRITTER TONIC', revived ? `${revived} critter${revived > 1 ? 's' : ''} revived!` : 'party healed +30');
    updatePartyHUD(scene);
  }
  queueSave(scene);
  SFX.craft();
  renderCraftMenu(scene);
  updateHUD(scene);
}

// ---------- chests: gamble those coins ----------
function chestWeaponUpgrade(scene, allowNew) {
  const st = scene.state;
  const upgradable = Object.keys(st.weapons).filter(k => st.weapons[k] < WEAPONS[k].maxLevel);
  if (upgradable.length) {
    const k = upgradable[Math.floor(Math.random() * upgradable.length)];
    st.weapons[k]++;
    refreshWeaponList(scene);
    return `${WEAPONS[k].icon} ${WEAPONS[k].name} → LV ${st.weapons[k]}`;
  }
  if (allowNew) {
    const fresh = Object.keys(WEAPONS).filter(k => !st.weapons[k]);
    if (fresh.length) {
      const k = fresh[Math.floor(Math.random() * fresh.length)];
      st.weapons[k] = 1;
      refreshWeaponList(scene);
      return `NEW WEAPON: ${WEAPONS[k].icon} ${WEAPONS[k].name}!`;
    }
  }
  return null;
}

function openChest(scene, rec) {
  const st = scene.state;
  const roll = Math.random();
  let msg;
  if (rec.tier === 1) {
    if (roll < 0.35)      { st.res.wood += 8; st.res.stone += 8; msg = '+8 wood · +8 stone'; }
    else if (roll < 0.60) { st.res.iron += 3; msg = '+3 iron'; }
    else if (roll < 0.80) { st.stock.healthPotion = (st.stock.healthPotion || 0) + 1; msg = '+1 health potion'; }
    else if (roll < 0.95) { st.res.gold += 2; msg = '+2 gold'; }
    else                  { st.res.diamond += 1; msg = '💎 +1 diamond!'; }
  } else if (rec.tier === 2) {
    if (roll < 0.25)      { st.res.iron += 6; st.res.gold += 2; msg = '+6 iron · +2 gold'; }
    else if (roll < 0.45) { st.stock.healthPotion = (st.stock.healthPotion || 0) + 1; st.stock.strengthPotion = (st.stock.strengthPotion || 0) + 1; msg = '+1 of each potion'; }
    else if (roll < 0.65) { st.res.gold += 4; msg = '+4 gold'; }
    else if (roll < 0.80) { st.res.diamond += 2; msg = '💎 +2 diamond'; }
    else                  { msg = chestWeaponUpgrade(scene, false) || (st.res.diamond += 2, '💎 +2 diamond'); }
  } else {
    if (roll < 0.40)      { msg = chestWeaponUpgrade(scene, true) || (st.maxHp += 30, st.hp += 30, '+30 MAX HP'); }
    else if (roll < 0.60) { st.res.diamond += 4; st.res.gold += 4; msg = '💎 +4 diamond · +4 gold'; }
    else if (roll < 0.75) { st.maxHp += 20; st.hp = Math.min(st.maxHp, st.hp + 20); msg = '❤️ +20 MAX HP'; }
    else if (roll < 0.90) { st.stock.healthPotion = (st.stock.healthPotion || 0) + 2; st.stock.strengthPotion = (st.stock.strengthPotion || 0) + 1; msg = '+3 potions'; }
    else                  { st.coins += 100; st.res.diamond += 2; msg = '🪙 JACKPOT! +100 coins · +2 diamond'; }
  }
  showBanner(`${rec.icon} ${rec.name}`, msg);
  refreshHotbar(scene);
  SFX.levelup();
}

// ---------- level up ----------
// auto-describe what the next level actually changes: "DMG 26→31 · COUNT 2→3"
function describeUpgrade(key, lvl, gain) {
  const a = WEAPONS[key].stats(lvl), b = WEAPONS[key].stats(lvl + (gain || 1));
  const labels = { dmg: 'DMG', count: 'COUNT', strikes: 'COUNT', shards: 'COUNT', radius: 'AREA', range: 'AREA', pierce: 'PIERCE', speed: 'SPEED', rotSpeed: 'SPIN', arc: 'ARC', slow: 'SLOW' };
  const parts = [];
  for (const k of Object.keys(b)) {
    if (typeof b[k] !== 'number' || typeof a[k] !== 'number') continue;
    if (Math.abs(b[k] - a[k]) < 0.005) continue;
    if (k === 'cd') parts.push(`RATE +${Math.max(1, Math.round((a.cd / b.cd - 1) * 100))}%`);
    else if (Number.isInteger(a[k]) && Number.isInteger(b[k])) parts.push(`${labels[k] || k.toUpperCase()} ${a[k]}→${b[k]}`);
    else parts.push(`${labels[k] || k.toUpperCase()} ${Math.round(a[k])}→${Math.round(b[k])}`);
  }
  // counts first — they're the exciting ones
  parts.sort((x, y) => (y.includes('COUNT') ? 1 : 0) - (x.includes('COUNT') ? 1 : 0));
  return parts.slice(0, 3).join(' · ') || 'numbers go up';
}

function buildLevelChoices(scene) {
  const st = scene.state;
  const pool = [];
  for (const [key, w] of Object.entries(WEAPONS)) {
    const lvl = st.weapons[key] || 0;
    if (lvl === 0 && Object.keys(st.weapons).length < MAX_OWNED_WEAPONS) {
      pool.push({ type: 'weapon', key, label: 'NEW!', name: w.name, icon: w.icon, desc: w.desc });
    } else if (lvl > 0 && lvl < w.maxLevel) {
      const gain = Math.min(w.maxLevel - lvl, 1 + Math.floor(st.level / 30)); // big heroes level gear faster
      pool.push({ type: 'weapon', key, gain, label: `LV ${lvl} → ${lvl + gain}`, name: w.name, icon: w.icon, desc: describeUpgrade(key, lvl, gain) });
    }
  }
  for (const [key, p] of Object.entries(PASSIVES)) {
    const lvl = st.passives[key] || 0;
    if (lvl < p.maxLevel) {
      pool.push({ type: 'passive', key, label: lvl ? `LV ${lvl} → ${lvl + 1}` : 'NEW!', name: p.name, icon: p.icon, desc: p.desc });
    }
  }
  if (!pool.length) {
    return [
      { type: 'heal', name: 'Snack Break', icon: '🍖', label: '', desc: 'Heal 40 HP' },
      { type: 'loot', name: 'Supply Drop', icon: '📦', label: '', desc: '+8 wood, +8 stone, +4 iron' },
    ];
  }
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, 3);
}

function showLevelUp(scene) {
  const choices = buildLevelChoices(scene);
  scene.levelChoices = choices;
  const el = $('levelup-cards');
  el.innerHTML = '';
  choices.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="icon">${c.icon}</div><div class="name">${c.name}</div><div class="tag">${c.label}</div><div class="desc">${c.desc}</div>`;
    d.onclick = () => pickLevelChoice(scene, i);
    el.appendChild(d);
  });
  setModal('modal-levelup', true);
  scene.setPaused(true);
  SFX.levelup();
}

function pickLevelChoice(scene, i) {
  const c = scene.levelChoices[i];
  const st = scene.state;
  if (c.type === 'weapon') st.weapons[c.key] = Math.min(WEAPONS[c.key].maxLevel, (st.weapons[c.key] || 0) + (c.gain || 1));
  else if (c.type === 'passive') {
    st.passives[c.key] = (st.passives[c.key] || 0) + 1;
    if (c.key === 'heart') { st.maxHp += 20; st.hp = Math.min(st.maxHp, st.hp + 20); }
  }
  else if (c.type === 'heal') st.hp = Math.min(st.maxHp, st.hp + 40);
  else if (c.type === 'loot') { st.res.wood += 8; st.res.stone += 8; st.res.iron += 4; }

  refreshWeaponList(scene);
  setModal('modal-levelup', false);
  // chain pending level-ups
  if (st.pendingLevels > 0) {
    st.pendingLevels--;
    showLevelUp(scene);
  } else {
    scene.setPaused(false);
  }
}

// ---------- game over ----------
function showGameOver(scene) {
  const st = scene.state;
  const best = Number(localStorage.getItem('blockbonk_best') || 0);
  const save = readSave();
  $('go-stats').innerHTML =
    `survived to ${st.isNight ? 'NIGHT ' + st.night : 'DAY ' + st.day}<br>` +
    `level ${st.level} · ${st.kills} kills<br>` +
    `best run: day ${Math.max(best, st.day - (st.isNight ? 0 : 1))}` +
    (save ? `<br><br><span style="color:#ff9a3e">⚰️ a gravestone marks where you fell,<br>holding half your resources</span>` : '');
  const cont = $('go-continue');
  cont.style.display = save ? '' : 'none';
  if (save) cont.textContent = `⛏ WAKE AT DAWN — DAY ${save.state.day}`;
  setModal('modal-gameover', true);
}


// ---------- minimap: points of interest only ----------
function updateMinimap(scene) {
  const cvs = $('minimap');
  if (cvs.style.display === 'none') return;
  const area = currentArea(scene);
  const R = area === 'overworld' ? { x: 0, y: 0, w: MAP_W, h: MAP_H }
    : area === 'cave' ? CAVE_RECT : area === 'dungeon' ? DUNGEON_RECT
    : area.startsWith('loft') ? LOFT_RECTS[Number(area.slice(4)) || 0] : RIFT_RECT;
  if (cvs.width !== R.w || cvs.height !== R.h) { cvs.width = R.w; cvs.height = R.h; }
  const ctx = cvs.getContext('2d');

  // faint silhouette so the dots have context: land vs water (or carved vs rock inside)
  const img = ctx.createImageData(R.w, R.h);
  const d = img.data;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const gx = R.x + x, gy = R.y + y;
      let c = 0x10141c;
      if (area === 'overworld') {
        const g2 = scene.groundLayer.getTileAt(gx, gy);
        c = g2 && g2.index === T.WATER ? 0x14233f : 0x1c2a1a;
      } else {
        const b = scene.blockLayer.getTileAt(gx, gy);
        c = b ? 0x10141c : 0x2a2a35; // open floor reads lighter
      }
      const i = (y * R.w + x) * 4;
      d[i] = c >> 16; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const poi = (wx, wy, color, s) => {
    const tx = wx / TILE - R.x, ty = wy / TILE - R.y;
    if (tx < -2 || ty < -2 || tx >= R.w + 2 || ty >= R.h + 2) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(tx - s / 2) - 1, Math.round(ty - s / 2) - 1, s + 2, s + 2);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(tx - s / 2), Math.round(ty - s / 2), s, s);
  };

  if (area === 'overworld') {
    // the dense forest, as a soft green region
    ctx.fillStyle = 'rgba(60, 140, 40, 0.35)';
    ctx.fillRect(DENSE_FOREST.x0, DENSE_FOREST.y0, DENSE_FOREST.x1 - DENSE_FOREST.x0, DENSE_FOREST.y1 - DENSE_FOREST.y0);

    if (scene.gates) {
      poi(scene.gates.cave.x, scene.gates.cave.y, '#7a3ac8', 4);     // deep cave
      poi(scene.gates.dungeon.x, scene.gates.dungeon.y, '#d83030', 4); // dungeon
      poi(scene.gates.rift.x, scene.gates.rift.y, '#35e8d8', 4);     // rift
    }
    for (const den of scene.dens || []) poi(den.x, den.y, '#ff8a20', 3); // monster dens
    // home is where the bed is
    for (const t of scene.turrets.getChildren()) {
      if (t.active && t.ttype === 'bed') { poi(t.x, t.y, '#ffd95e', 3); break; }
    }
  } else {
    const m = areaExitMarker(scene);
    if (m) poi(m.x, m.y, '#35e8d8', 4); // the way out
  }
  if (scene.grave && scene.grave.active) poi(scene.grave.x, scene.grave.y, '#e8e8e8', 3);

  // you
  poi(scene.player.x, scene.player.y, Math.floor(performance.now() / 400) % 2 ? '#ffffff' : '#ffd95e', 3);
}


// ---------- activity log: everything your empire does ----------
function gameStamp(scene) {
  const st = scene.state;
  const t = Math.max(0, Math.ceil(st.phaseT));
  return `D${st.day} ${st.isNight ? '🌙' : '☀'}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// immediate one-off event
function logEvent(scene, msg, gold) {
  if (!SETTINGS.log) return;
  const el = $('activity-log');
  const div = document.createElement('div');
  div.className = 'le' + (gold ? ' gold' : '');
  div.innerHTML = `<span class="lt">${gameStamp(scene)}</span>${msg}`;
  el.prepend(div);
  while (el.children.length > 12) el.removeChild(el.lastChild);
}

// aggregated resource flows ("Drill Rig +6 stone +2 gold") flushed every few seconds
function logRes(scene, key, label, gains) {
  if (!scene.logAgg) scene.logAgg = {};
  const a = scene.logAgg[key] || (scene.logAgg[key] = { label, res: {} });
  for (const [r, n] of Object.entries(gains)) a.res[r] = (a.res[r] || 0) + n;
}

function flushLog(scene) {
  if (!scene.logAgg) return;
  for (const [key, a] of Object.entries(scene.logAgg)) {
    const parts = Object.entries(a.res).filter(([, n]) => n > 0)
      .map(([r, n]) => `+${Math.round(n)} ${r === 'coins' ? '🪙' : r === 'xp' ? 'xp' : r}`);
    if (parts.length) logEvent(scene, `${a.label}: ${parts.join(' · ')}`);
  }
  scene.logAgg = {};
}
