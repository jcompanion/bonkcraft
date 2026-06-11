// ---------- areas: the Deep Cave, the Dungeon, and the Rift ----------
// Interior maps live on the same tile grid, below the overworld. Entering a
// gate teleports you; the camera clamps per-area so you never see the seams.

function currentArea(scene) {
  const ty = Math.floor(scene.player.y / TILE);
  if (ty < MAP_H) return 'overworld';
  if (ty < 260) return Math.floor(scene.player.x / TILE) < 90 ? 'cave' : 'dungeon';
  if (ty < LOFT_Y - 4) return 'rift';
  const tx = Math.floor(scene.player.x / TILE);
  for (let i = 0; i < LOFT_RECTS.length; i++) {
    const r = LOFT_RECTS[i];
    if (tx >= r.x && tx < r.x + r.w) return 'loft' + i;
  }
  return 'loft0';
}

function areaBoundsPx(area) {
  if (area === 'cave') return { x: CAVE_RECT.x * TILE, y: CAVE_RECT.y * TILE, w: CAVE_RECT.w * TILE, h: CAVE_RECT.h * TILE };
  if (area === 'dungeon') return { x: DUNGEON_RECT.x * TILE, y: DUNGEON_RECT.y * TILE, w: DUNGEON_RECT.w * TILE, h: DUNGEON_RECT.h * TILE };
  if (area === 'rift') return { x: RIFT_RECT.x * TILE, y: RIFT_RECT.y * TILE, w: RIFT_RECT.w * TILE, h: RIFT_RECT.h * TILE };
  if (area.startsWith('loft')) {
    const r = LOFT_RECTS[Number(area.slice(4)) || 0];
    return { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
  }
  return { x: 0, y: 0, w: MAP_W * TILE, h: MAP_H * TILE };
}

// ---------- overworld gates ----------
function pickGateSpot(scene, away) {
  const cx = MAP_W / 2, cy = MAP_H / 2;
  for (let tries = 0; tries < 3000; tries++) {
    const x = 8 + Math.floor(Math.random() * (MAP_W - 16));
    const y = 8 + Math.floor(Math.random() * (MAP_H - 16));
    const d = Math.hypot(x - cx, y - cy);
    if (d < 20 || d > 75) continue;
    const g = scene.groundLayer.getTileAt(x, y);
    if (!g || g.index === T.WATER) continue;
    if (away.some(s => s && Math.hypot(s.tx - x, s.ty - y) < 30)) continue;
    return { tx: x, ty: y };
  }
  return { tx: Math.floor(cx) + 15, ty: Math.floor(cy) + 15 };
}

function setupGates(scene, saved) {
  const mk = (spot, tex, tint) => {
    if (scene.blockLayer.getTileAt(spot.tx, spot.ty)) destroyBlockTile(scene, spot.tx, spot.ty, true);
    const wx = spot.tx * TILE + 16, wy = spot.ty * TILE + 16;
    const img = scene.add.image(wx, wy, tex).setDepth(1);
    img.isDen = true; // can't dismantle gates
    scene.add.image(wx, wy, 'glow').setDepth(11).setScale(1.5)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.3);
    scene.turretGrid[spot.tx + ',' + spot.ty] = img;
    return { tx: spot.tx, ty: spot.ty, x: wx, y: wy };
  };
  const g = saved && saved.gates ? saved.gates : null;
  const cave = g ? g.cave : pickGateSpot(scene, []);
  const dungeon = g ? g.dungeon : pickGateSpot(scene, [cave]);
  const rift = g ? g.rift : pickGateSpot(scene, [cave, dungeon]);
  scene.gates = {
    cave: mk(cave, 'deepcave', 0x7a3ac8),
    dungeon: mk(dungeon, 'dgate', 0xb08ae8),
    rift: mk(rift, 'riftgate', 0x35c8be),
  };
}

// ---------- interior generation ----------
// is there a player structure on/next to this tile? (turrets keep a 1-tile pocket)
function hasStructureNear(scene, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = scene.turretGrid[(x + dx) + ',' + (y + dy)];
      if (t && !t.isDen) return true;
    }
  }
  return false;
}

function clearRegion(scene, R, groundIdx) {
  for (let y = R.y; y < R.y + R.h; y++) {
    for (let x = R.x; x < R.x + R.w; x++) {
      scene.groundLayer.putTileAt(groundIdx, x, y);
      if (scene.blockLayer.getTileAt(x, y)) scene.blockLayer.removeTileAt(x, y);
      const k = x + ',' + y;
      delete scene.blockHP[k];
      delete scene.blockMaxHP[k];
      scene.damagedBlocks.delete(k);
    }
  }
}

function putBlock(scene, x, y, idx) {
  scene.blockLayer.putTileAt(idx, x, y);
  if (BLOCK_INFO[idx]) {
    scene.blockHP[x + ',' + y] = BLOCK_INFO[idx].hp;
    scene.blockMaxHP[x + ',' + y] = BLOCK_INFO[idx].hp;
  }
}

function borderRegion(scene, R) {
  for (let y = R.y; y < R.y + R.h; y++) {
    for (let x = R.x; x < R.x + R.w; x++) {
      if (x < R.x + 2 || x >= R.x + R.w - 2 || y < R.y + 2 || y >= R.y + R.h - 2) {
        putBlock(scene, x, y, T.BEDROCK);
      }
    }
  }
}

function setMarker(scene, key, tx, ty, tex) {
  if (scene[key + 'Img']) scene[key + 'Img'].destroy();
  scene[key + 'Img'] = scene.add.image(tx * TILE + 16, ty * TILE + 16, tex).setDepth(1);
  scene[key] = { tx, ty };
}

// which legacy loft platform was this tile on? (save migration only)
function loftIndexAt(tx, ty) {
  if (ty < LOFT_Y) return -1;
  for (let i = 0; i < LOFT_RECTS.length; i++) {
    const r = LOFT_RECTS[i];
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return i;
  }
  return -1;
}

// ---------- floor 2: the balcony layer ----------
function livingStairs(scene) {
  return scene.turrets.getChildren().filter(t => t.active && t.ttype === 'stair');
}

function deckContains(scene, tx, ty) {
  return livingStairs(scene).some(t =>
    Math.abs(Math.floor(t.x / TILE) - tx) <= DECK_HW &&
    Math.abs(Math.floor(t.y / TILE) - ty) <= DECK_HH);
}

function rebuildDeck(scene) {
  if (scene.deckImgs) { scene.deckImgs.forEach(i => i.destroy()); }
  scene.deckImgs = [];
  if (!scene.state.onFloor2) return;
  const seen = new Set();
  for (const t of livingStairs(scene)) {
    const cx = Math.floor(t.x / TILE), cy = Math.floor(t.y / TILE);
    for (let dy = -DECK_HH; dy <= DECK_HH; dy++) {
      for (let dx = -DECK_HW; dx <= DECK_HW; dx++) {
        const k = (cx + dx) + ',' + (cy + dy);
        if (seen.has(k)) continue;
        seen.add(k);
        const edge = Math.abs(dx) === DECK_HW || Math.abs(dy) === DECK_HH;
        const img = scene.add.image((cx + dx) * TILE + 16, (cy + dy) * TILE + 16, 'floor_icon')
          .setDepth(12.3).setAlpha(edge ? 0.28 : 0.45);
        scene.deckImgs.push(img);
      }
    }
  }
}

function onStairTile(scene) {
  const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);
  return livingStairs(scene).some(t => Math.floor(t.x / TILE) === ptx && Math.floor(t.y / TILE) === pty);
}

function climbStairs(scene) {
  const st = scene.state;
  st.onFloor2 = true;
  scene.stairArm = false; // must step OFF the stair before it triggers again
  scene.warpCd = 1.2;
  scene.player.setDepth(13);
  scene.playerGlow.setDepth(13.5);
  if (!scene.mist) {
    scene.mist = scene.add.rectangle(0, 0, 10, 10, 0xcfe0f0).setOrigin(0).setScrollFactor(0).setDepth(11.7).setAlpha(0);
  }
  scene.mist.setAlpha(0.20);
  scene.cameras.main.zoomTo(0.82, 400);
  rebuildDeck(scene);
  showBanner('🪜 FLOOR 2', 'they can\'t reach you — but they CAN destroy your staircase');
  SFX.dawn();
}

function descendFloor2(scene, fell) {
  const st = scene.state;
  if (!st.onFloor2) return;
  st.onFloor2 = false;
  scene.stairArm = false;
  scene.warpCd = 1.2;
  scene.player.setDepth(5);
  scene.playerGlow.setDepth(11);
  if (scene.mist) scene.mist.setAlpha(0);
  scene.cameras.main.zoomTo(1, 400);
  rebuildDeck(scene);
  if (fell) {
    showBanner('💥 THE STAIRS COLLAPSED UNDER YOU!', 'that\'s going to leave a mark');
    hurtPlayer(scene, scene.state.maxHp * FALL_DAMAGE);
    scene.cameras.main.shake(250, 0.01);
    SFX.explode();
  }
}

function updateFloor2(scene, dt) {
  const st = scene.state;
  if (scene.mist && scene.mist.active) {
    scene.mist.setSize(scene.cameras.main.width / scene.cameras.main.zoom + 4, scene.cameras.main.height / scene.cameras.main.zoom + 4);
  }
  if (!st.onFloor2) return;

  const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);

  // no deck under your feet → the tower is gone → gravity wins
  if (!deckContains(scene, ptx, pty)) {
    descendFloor2(scene, true);
    return;
  }

  // railing: don't walk off the edge
  if (!scene._lastDeckPos) scene._lastDeckPos = { x: scene.player.x, y: scene.player.y };
  const ntx = Math.floor(scene.player.x / TILE), nty = Math.floor(scene.player.y / TILE);
  if (deckContains(scene, ntx, nty)) {
    scene._lastDeckPos = { x: scene.player.x, y: scene.player.y };
  } else {
    scene.player.setPosition(scene._lastDeckPos.x, scene._lastDeckPos.y);
  }

  // step back onto the staircase to head down (after stepping off it once)
  scene.warpCd = Math.max(0, (scene.warpCd || 0) - dt);
  const onStair = onStairTile(scene);
  if (!onStair) scene.stairArm = true;
  if (scene.warpCd <= 0 && scene.stairArm && onStair) descendFloor2(scene, false);
}

// the Deep Cave: solid ore, carved by drunkard's walk — fresh layout daily
function generateCave(scene) {
  const R = CAVE_RECT;
  clearRegion(scene, R, T.DIRT);
  borderRegion(scene, R);
  for (let y = R.y + 2; y < R.y + R.h - 2; y++) {
    for (let x = R.x + 2; x < R.x + R.w - 2; x++) {
      if (hasStructureNear(scene, x, y)) continue; // your gear keeps its pocket
      const roll = Math.random();
      let idx = T.STONE;
      if (roll < 0.08) idx = T.DIAMOND;
      else if (roll < 0.20) idx = T.GOLD;
      else if (roll < 0.42) idx = T.IRON;
      putBlock(scene, x, y, idx);
    }
  }
  // carve the entrance pocket, then tunnels via drunkard's walk
  for (let y = R.y + 3; y <= R.y + 7; y++) {
    for (let x = R.x + 3; x <= R.x + 9; x++) {
      delete scene.blockHP[x + ',' + y];
      delete scene.blockMaxHP[x + ',' + y];
      scene.blockLayer.removeTileAt(x, y);
    }
  }
  let px = R.x + 6, py = R.y + 5;
  for (let i = 0; i < R.w * R.h * 1.3; i++) {
    const k = px + ',' + py;
    if (scene.blockLayer.getTileAt(px, py)) { scene.blockLayer.removeTileAt(px, py); delete scene.blockHP[k]; delete scene.blockMaxHP[k]; }
    const dir = Math.floor(Math.random() * 4);
    px = Phaser.Math.Clamp(px + [1, -1, 0, 0][dir], R.x + 3, R.x + R.w - 4);
    py = Phaser.Math.Clamp(py + [0, 0, 1, -1][dir], R.y + 3, R.y + R.h - 4);
  }
  setMarker(scene, 'caveLadder', R.x + 4, R.y + 4, 'ladder');
  scene.caveLanding = { x: (R.x + 7) * TILE + 16, y: (R.y + 5) * TILE + 16 };
  scene.caveGenerated = true;
}

// the Dungeon: arena with pillars, the Lord, and his court
function generateDungeon(scene) {
  const R = DUNGEON_RECT;
  const st = scene.state;
  clearRegion(scene, R, T.DIRT);
  borderRegion(scene, R);
  for (let i = 0; i < 10; i++) {
    const x = R.x + 5 + Math.floor(Math.random() * (R.w - 10));
    const y = R.y + 5 + Math.floor(Math.random() * (R.h - 12));
    if (hasStructureNear(scene, x, y)) continue;
    putBlock(scene, x, y, T.BEDROCK);
    putBlock(scene, x + 1, y, T.BEDROCK);
  }
  setMarker(scene, 'dungeonLadder', R.x + 4, R.y + R.h - 5, 'ladder');
  scene.dungeonLanding = { x: (R.x + 7) * TILE + 16, y: (R.y + R.h - 5) * TILE + 16 };

  // the Lord: stronger with every clear, and with the calendar
  const cx2 = (R.x + R.w / 2) * TILE, cy2 = (R.y + 8) * TILE;
  const boss = spawnEnemy(scene, 'dungeonlord', cx2, cy2);
  if (boss) {
    const clears = st.dungeonClears || 0;
    const mult = (1 + 0.55 * clears) * (1 + 0.06 * (st.day - 1));
    boss.hp = boss.maxHp = Math.round(1200 * mult);
    boss.dmg = Math.round(28 * (1 + 0.10 * clears));
    boss.noBurn = true;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = spawnEnemy(scene, i % 2 ? 'skeleton' : 'slime', cx2 + Math.cos(a) * 120, cy2 + Math.sin(a) * 120);
      if (m) m.noBurn = true;
    }
  }
}

// the Rift: open corrupted arena — endless escalating waves until you leave
function generateRift(scene) {
  const R = RIFT_RECT;
  clearRegion(scene, R, T_CORRUPT);
  borderRegion(scene, R);
  for (let i = 0; i < 14; i++) {
    const sx = R.x + 4 + Math.floor(Math.random() * (R.w - 8)), sy = R.y + 4 + Math.floor(Math.random() * (R.h - 8));
    if (!hasStructureNear(scene, sx, sy)) putBlock(scene, sx, sy, T.BEDROCK);
  }
  setMarker(scene, 'riftExit', R.x + 5, R.y + Math.floor(R.h / 2), 'riftgate');
  scene.riftLanding = { x: (R.x + 9) * TILE + 16, y: (R.y + Math.floor(R.h / 2)) * TILE + 16 };
  scene.state.arenaT = 0;
  scene.state.arenaBosses = 0;
}

// ---------- warping ----------
function warpTo(scene, px, py, area) {
  scene.warpCd = 1.4;
  $('sleep-fade').style.opacity = 1;
  pushAction(scene, 0.35, () => {
    scene.player.setPosition(px, py);
    const b = areaBoundsPx(area);
    scene.cameras.main.setBounds(b.x, b.y, b.w, b.h);
    // leave the mob trains behind (bosses stay where they belong)
    for (const e of scene.enemies.getChildren()) {
      if (e.active && !e.info.boss && Phaser.Math.Distance.Between(e.x, e.y, px, py) > 1100) {
        e.dying = true;
        e.setActive(false).setVisible(false);
        e.body.enable = false;
      }
    }
    scene.hideBobber();
    $('sleep-fade').style.opacity = 0;
  });
  SFX.night();
}

function checkGates(scene, dt) {
  scene.warpCd = Math.max(0, (scene.warpCd || 0) - dt);
  if (scene.warpCd > 0 || !scene.gates) return;
  const st = scene.state;
  const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);
  const at = (m) => m && Math.abs(ptx - m.tx) <= 0 && Math.abs(pty - m.ty) <= 0;
  const area = currentArea(scene);

  if (scene.state.onFloor2) return; // balcony logic lives in updateFloor2
  if (area === 'overworld') {
    // staircase: climb to the balcony (re-arms once you step off it)
    const stairT = scene.turretGrid[ptx + ',' + pty];
    const standingOnStair = !!(stairT && stairT.active && stairT.ttype === 'stair');
    if (!standingOnStair) scene.stairArm = true;
    if (standingOnStair && scene.stairArm !== false) {
      climbStairs(scene);
      return;
    }
    if (at(scene.gates.cave)) {
      if (!scene.caveGenerated || st.caveGenDay !== st.day) {
        generateCave(scene);
        st.caveGenDay = st.day;
        showBanner('🕳️ THE DEEP CAVE', 'fresh veins today — dense ore, dense danger. find the ladder to leave');
      } else {
        showBanner('🕳️ THE DEEP CAVE', 'back into the dark');
      }
      warpTo(scene, scene.caveLanding.x, scene.caveLanding.y, 'cave');
    } else if (at(scene.gates.dungeon)) {
      if (st.lastClearDay === st.day) {
        scene.warpCd = 1.5;
        showBanner('🏛️ THE GATE IS SEALED', 'the Dungeon Lord returns at dawn — stronger');
      } else {
        generateDungeon(scene);
        showBanner(`🏛️ THE DUNGEON — LORD LV ${1 + (st.dungeonClears || 0)}`, 'slay him for riches. the ladder is your escape');
        warpTo(scene, scene.dungeonLanding.x, scene.dungeonLanding.y, 'dungeon');
        SFX.boss();
      }
    } else if (at(scene.gates.rift)) {
      generateRift(scene);
      showBanner('🌀 THE RIFT', 'they never stop coming. they never stop growing. leave while you can');
      warpTo(scene, scene.riftLanding.x, scene.riftLanding.y, 'rift');
      SFX.boss();
    }
  } else if (area === 'cave' && at(scene.caveLadder)) {
    warpTo(scene, scene.gates.cave.x, scene.gates.cave.y + TILE, 'overworld');
  } else if (area === 'dungeon' && at(scene.dungeonLadder)) {
    warpTo(scene, scene.gates.dungeon.x, scene.gates.dungeon.y + TILE, 'overworld');
  } else if (area === 'rift' && at(scene.riftExit)) {
    showBanner('🌀 you escaped the Rift', `${Math.round(st.arenaT || 0)}s survived`);
    warpTo(scene, scene.gates.rift.x, scene.gates.rift.y + TILE, 'overworld');
  }

  // gate & exit hints
  scene.gateHintT = (scene.gateHintT || 0) - dt;
  if (scene.gateHintT <= 0) {
    let hints = [];
    if (area === 'overworld') {
      hints = [['DEEP CAVE 🕳️ — step in', scene.gates.cave], ['DUNGEON 🏛️ — step in', scene.gates.dungeon], ['RIFT 🌀 — step in', scene.gates.rift]];
    } else {
      const m = area === 'cave' ? scene.caveLadder : area === 'dungeon' ? scene.dungeonLadder : scene.riftExit;
      if (m) hints = [[area === 'rift' ? 'EXIT 🌀 — step in' : 'EXIT 🪜 — step on', { x: m.tx * TILE + 16, y: m.ty * TILE + 16 }]];
    }
    for (const [name, gd] of hints) {
      if (Phaser.Math.Distance.Between(scene.player.x, scene.player.y, gd.x, gd.y) < 110) {
        scene.gateHintT = 2.2;
        showDamage(scene, gd.x, gd.y - 24, name, '#b08ae8');
        break;
      }
    }
  }
}

// where's the way out of the current interior? (for the HUD arrow)
function areaExitMarker(scene) {
  const area = currentArea(scene);
  let m = area === 'cave' ? scene.caveLadder : area === 'dungeon' ? scene.dungeonLadder : area === 'rift' ? scene.riftExit : null;
  if (area.startsWith('loft') && scene.loftExits) m = scene.loftExits[Number(area.slice(4)) || 0];
  return m ? { x: m.tx * TILE + 16, y: m.ty * TILE + 16 } : null;
}

// area-specific spawning, called from updateSpawner
function areaSpawner(scene, area) {
  const st = scene.state;
  if (area.startsWith('loft')) { st.spawnT = 3; return; } // peaceful up here
  if (area === 'cave') {
    st.spawnT = 3.0;
    const alive = scene.enemies.getChildren().filter(e => e.active && !e.dying && e.fromCave).length;
    if (alive >= 18) return;
    const n = 2 + Math.floor(Math.random() * 2) + (st.isNight ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 220 + Math.random() * 160;
      const x = Phaser.Math.Clamp(scene.player.x + Math.cos(a) * d, (CAVE_RECT.x + 3) * TILE, (CAVE_RECT.x + CAVE_RECT.w - 4) * TILE);
      const y = Phaser.Math.Clamp(scene.player.y + Math.sin(a) * d, (CAVE_RECT.y + 3) * TILE, (CAVE_RECT.y + CAVE_RECT.h - 4) * TILE);
      const e = spawnEnemy(scene, Math.random() < 0.6 ? 'bat' : 'slime', x, y);
      if (e) { e.fromCave = true; e.noBurn = true; }
    }
    return;
  }
  if (area === 'dungeon') { st.spawnT = 2; return; } // the court is set at the door

  // the Rift: escalation without end
  st.arenaT = (st.arenaT || 0);
  st.spawnT = Math.max(0.7, 2.2 - st.arenaT / 70);
  const mult = 1 + st.arenaT / 40;
  const pool = ['zombie', 'spider', 'skeleton', 'creeper', 'bat', 'slime', 'treant'];
  const burst = 4 + Math.floor(st.arenaT / 22);
  for (let i = 0; i < burst; i++) {
    const a = Math.random() * Math.PI * 2, d = 320 + Math.random() * 180;
    const x = Phaser.Math.Clamp(scene.player.x + Math.cos(a) * d, (RIFT_RECT.x + 3) * TILE, (RIFT_RECT.x + RIFT_RECT.w - 4) * TILE);
    const y = Phaser.Math.Clamp(scene.player.y + Math.sin(a) * d, (RIFT_RECT.y + 3) * TILE, (RIFT_RECT.y + RIFT_RECT.h - 4) * TILE);
    const e = spawnEnemy(scene, pool[Math.floor(Math.random() * pool.length)], x, y);
    if (e) {
      e.noBurn = true;
      e.hp = e.maxHp = Math.round(e.maxHp * mult);
      e.dmg = Math.round(e.dmg * (1 + st.arenaT / 90));
    }
  }
  // periodic brute to keep you honest
  if (Math.floor(st.arenaT / 75) > (st.arenaBosses || 0)) {
    st.arenaBosses = Math.floor(st.arenaT / 75);
    const b = spawnEnemy(scene, 'brute', scene.player.x + 400, scene.player.y);
    if (b) { b.noBurn = true; b.hp = b.maxHp = Math.round(b.maxHp * mult); }
    showBanner('🌀 THE RIFT STIRS', 'something big broke through');
    SFX.boss();
  }
}
