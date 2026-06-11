// ---------- localStorage save / load ----------
// Checkpoint model: autosave at every dawn (plus manual save). On death you can
// wake back up at the last dawn; a gravestone holding half your resources marks
// where you fell.

const SAVE_KEY = 'blockbonk_save';

// tile layer <-> string: '.' = empty, 'a' + index otherwise
function encodeLayer(layer) {
  let out = '';
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = layer.getTileAt(x, y);
      out += t ? String.fromCharCode(97 + t.index) : '.';
    }
  }
  return out;
}

function decodeChar(c) {
  return c === '.' ? -1 : c.charCodeAt(0) - 97;
}

function saveGame(scene) {
  const st = scene.state;
  try {
    const damaged = {};
    for (const [k, hp] of Object.entries(scene.blockHP)) {
      if (hp < scene.blockMaxHP[k]) damaged[k] = Math.round(hp);
    }
    let orig = '';
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const o = scene.origBlocks ? scene.origBlocks[i] : -1;
      orig += o < 0 ? '.' : String.fromCharCode(97 + o);
    }
    const data = {
      v: 1,
      savedAt: Date.now(),
      ground: encodeLayer(scene.groundLayer),
      blocks: encodeLayer(scene.blockLayer),
      orig,
      damaged,
      turrets: scene.turrets.getChildren().filter(t => t.active).map(t => ({
        type: t.ttype,
        tx: Math.floor(t.x / TILE),
        ty: Math.floor(t.y / TILE),
        hp: Math.round(t.hp),
        f2: t.floor2 ? 1 : 0,
      })),
      traps: (scene.trapList || []).filter(t => t.active).map(t => ({
        type: t.ttype,
        tx: Math.floor(t.x / TILE),
        ty: Math.floor(t.y / TILE),
        hp: Math.round(t.hp),
      })),
      dens: (scene.dens || []).map(d => ({ tx: d.tx, ty: d.ty })),
      gates: scene.gates ? { cave: { tx: scene.gates.cave.tx, ty: scene.gates.cave.ty },
        dungeon: { tx: scene.gates.dungeon.tx, ty: scene.gates.dungeon.ty },
        rift: { tx: scene.gates.rift.tx, ty: scene.gates.rift.ty } } : null,
      player: (() => {
        if (scene.player.y < MAP_H * TILE || !scene.gates) {
          return { x: Math.round(scene.player.x), y: Math.round(scene.player.y) };
        }
        const a = currentArea(scene);
        if (a.startsWith('loft')) {
          const anchor = (scene.stairSlots || [])[Number(a.slice(4)) || 0];
          if (anchor) return { x: anchor.tx * TILE + 16, y: (anchor.ty + 1) * TILE + 16 };
          return { x: MAP_W * TILE / 2, y: MAP_H * TILE / 2 };
        }
        const gate = scene.gates[a === 'rift' ? 'rift' : a === 'dungeon' ? 'dungeon' : 'cave'];
        return { x: gate.x, y: gate.y + TILE };
      })(),
      grave: scene.grave && scene.grave.active
        ? { x: Math.round(scene.grave.x), y: Math.round(scene.grave.y), res: scene.graveRes }
        : null,
      state: {
        hp: Math.round(st.hp), maxHp: st.maxHp,
        level: st.level, xp: st.xp, xpNext: st.xpNext,
        res: st.res, stock: st.stock, crafted: st.crafted, flags: st.flags,
        weapons: st.weapons, passives: st.passives,
        day: st.day, night: st.night, kills: st.kills,
        phaseT: Math.round(st.phaseT * 10) / 10, isNight: !!st.isNight,
        nightWarn60: !!st.nightWarn60, nightWarn15: !!st.nightWarn15,
        coins: st.coins, skills: st.skills, prestige: st.prestige || 0,
        box: st.box, petCap: st.petCap,
        harvestedToday: st.harvestedToday || 0,
        blueprints: st.blueprints || [],
        dungeonClears: st.dungeonClears || 0, lastClearDay: st.lastClearDay || 0,
        pets: scene.pets.map(p => ({ sp: p.sp, lvl: p.lvl, xp: p.xp, hp: Math.round(p.hp), f: p.fainted ? 1 : 0, g: p.stay ? 1 : 0 })),
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

// debounced autosave: bursts of building/crafting coalesce into one write
function queueSave(scene) {
  if (scene.state && !scene.state.gameOver) scene.saveQueuedT = 1.5;
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== 1 || !d.ground || !d.blocks || !d.state) return null;
    return d;
  } catch (e) {
    return null;
  }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

// write the gravestone into the existing checkpoint (called on death)
function recordGrave(scene) {
  const d = readSave();
  if (!d) return false;
  const half = {};
  for (const [r, n] of Object.entries(scene.state.res)) half[r] = Math.floor(n / 2);
  d.grave = { x: Math.round(scene.player.x), y: Math.round(scene.player.y), res: half };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    return true;
  } catch (e) { return false; }
}

// remove the gravestone from the stored save (called when collected)
function clearGraveFromSave() {
  const d = readSave();
  if (!d) return;
  d.grave = null;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {}
}

// restore everything that isn't world tiles (those are handled in buildWorld)
function applyLoad(scene, data) {
  const st = scene.state;
  Object.assign(st, data.state);
  // deep-ish copies so the save object isn't mutated by play
  st.res = { ...data.state.res };
  st.stock = { ...data.state.stock };
  st.crafted = { ...data.state.crafted };
  st.flags = { ...data.state.flags };
  st.weapons = { ...data.state.weapons };
  st.passives = { ...data.state.passives };
  st.coins = data.state.coins || 0;
  st.skills = data.state.skills
    ? JSON.parse(JSON.stringify(data.state.skills))
    : { mining: { xp: 0, lvl: 1 }, fishing: { xp: 0, lvl: 1 } };
  for (const k of ['combat', 'building', 'forging', 'taming']) {
    if (!st.skills[k]) st.skills[k] = { xp: 0, lvl: 1 }; // older saves predate some skills
  }
  if (data.state.phaseT !== undefined) {
    st.isNight = !!data.state.isNight;   // resume exactly when you left off
    st.phaseT = data.state.phaseT;
  } else {
    st.isNight = false;                  // older saves wake at dawn
    st.phaseT = st.day === 1 ? FIRST_DAY_LEN : DAY_LEN;
  }
  st.hp = Math.min(st.hp, st.maxHp);

  scene.player.setPosition(data.player.x, data.player.y);

  // the balcony system was retired: refund staircases, ground its turrets
  let stairRefunds = 0;
  for (const t of data.turrets || []) {
    if (t.type === 'stair') {
      st.res.wood += 14; st.res.stone += 10; stairRefunds++;
      continue;
    }
    if (!TURRET_INFO[t.type]) continue;
    if (t.ty >= LOFT_Y) continue; // legacy sky platforms: nothing to stand on anymore
    if (t.f2) {
      // ex-balcony turret: settle onto the ground at (or near) its spot
      outer:
      for (let r = 0; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = t.tx + dx, ny = t.ty + dy;
            if (scene.turretGrid[nx + ',' + ny]) continue;
            if (scene.blockLayer.getTileAt(nx, ny) && !isWallTile(scene.blockLayer.getTileAt(nx, ny).index)) continue;
            placeTurret(scene, t.type, nx, ny);
            break outer;
          }
        }
      }
      continue;
    }
    placeTurret(scene, t.type, t.tx, t.ty);
    const placed = scene.turretGrid[t.tx + ',' + t.ty];
    if (placed) placed.hp = Math.min(t.hp, placed.maxHp);
  }
  if (stairRefunds) {
    pushAction(scene, 3.5, () => showBanner('🪜 STAIRCASES RETIRED', `materials refunded (x${stairRefunds}) — one strong floor is enough`));
  }
  for (const t of data.traps || []) {
    if (!TURRET_INFO[t.type]) continue;
    placeTrap(scene, t.type, t.tx, t.ty);
    const placed = scene.turretGrid[t.tx + ',' + t.ty];
    if (placed) placed.hp = Math.min(t.hp, placed.maxHp);
  }

  // dens: from save, or discover spots in old saves that predate them
  placeDens(scene, (data.dens && data.dens.length)
    ? data.dens.map(d => ({ x: d.tx, y: d.ty }))
    : pickDenSpots(scene));
  setupGates(scene, data);

  st.box = (data.state.box || []).map(b => ({ ...b }));
  st.blueprints = (data.state.blueprints || []).map(b => ({ name: b.name, items: b.items.map(it => ({ ...it })) }));
  st.placingBp = null;
  st.bpCapture = false;
  st.petCap = data.state.petCap || BASE_PET_CAP;
  for (const pd of data.state.pets || []) {
    if (!PETS[pd.sp] || scene.pets.length >= MAX_PETS) continue;
    const pet = addPet(scene, pd.sp, pd.lvl, pd.xp);
    if (pd.hp !== undefined) pet.hp = Math.min(pd.hp, petMaxHp(pet));
    if (pd.f) { pet.fainted = true; pet.hp = Math.max(0, pet.hp); pet.setAlpha(0.4).setAngle(90); }
    pet.stay = !!pd.g;
  }
  if (!scene.pets.some(q => q.stay) && scene.pets.length) scene.pets[0].stay = true;
  updatePartyHUD(scene);

  // old saves predate tall grass — seed some so encounters work there too
  let hasGrass = false;
  for (let i = 0; i < data.blocks.length && !hasGrass; i += 7) {
    if (decodeChar(data.blocks[i]) === T.TALLGRASS) hasGrass = true;
  }
  if (!hasGrass) {
    const tall = makeNoise(6);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (scene.blockLayer.getTileAt(x, y) || scene.turretGrid[x + ',' + y]) continue;
        const g = scene.groundLayer.getTileAt(x, y);
        if (!g || (g.index !== T.GRASS && g.index !== T.GRASS2)) continue;
        if (tall(x, y) > 0.64) scene.blockLayer.putTileAt(T.TALLGRASS, x, y);
      }
    }
  }

  if (data.grave) makeGrave(scene, data.grave.x, data.grave.y, data.grave.res);

  window.askedContinue = true;
}

function makeGrave(scene, x, y, res) {
  scene.grave = scene.add.image(x, y, 'grave').setDepth(4);
  scene.graveRes = res || {};
}


// ---------- export / import (backup, share, move devices) ----------
function exportSave(scene) {
  if (!saveGame(scene)) { showBanner('💾 export failed', 'could not snapshot the game'); return; }
  const raw = localStorage.getItem(SAVE_KEY);
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const name = `blockbonk-day${scene.state.day}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const blob = new Blob([raw], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showBanner('💾 SAVE EXPORTED', name);
}

function importSaveFile(scene, file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.v !== 1 || !d.ground || !d.blocks || !d.state) throw new Error('bad save');
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
      window.PENDING_LOAD = d;
      window.askedContinue = true;
      setModal('modal-settings', false);
      scene.restartRun();
    } catch (e) {
      showBanner('💾 IMPORT FAILED', 'that file is not a valid BlockBonk save');
    }
  };
  reader.readAsText(file);
}

// "saved 5 minutes ago" for the continue screen
function savedAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
