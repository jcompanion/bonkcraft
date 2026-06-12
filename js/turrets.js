// ---------- structures: placement, turret AI ----------

function enterPlacement(scene, id) {
  const st = scene.state;
  if (!st.stock[id]) return;
  touchDismantleOff(); // placing and dismantling are exclusive modes
  st.placing = id;
  if (!scene.ghost) {
    scene.ghost = scene.add.image(0, 0, 'px').setDepth(30).setAlpha(0.55);
  }
  const def = STRUCTURES[id];
  scene.ghost.setTexture(def.turret ? TURRET_INFO[def.turret].tex
    : def.trap ? TURRET_INFO[def.trap].tex
    : def.floor ? 'floor_icon'
    : ({ [T.WOODWALL]: 'woodwall_icon', [T.STONEWALL]: 'stonewall_icon',
         [T.IRONWALL]: 'ironwall_icon', [T.DIAMONDWALL]: 'diamondwall_icon',
         [T.OBSIDIANWALL]: 'obsidianwall_icon' })[def.tile]);
  scene.ghost.setOrigin(0.5, 0.5);
  scene.ghost.setVisible(true);
  refreshHotbar(scene);
}

function cancelPlacement(scene) {
  scene.state.placing = null;
  if (scene.ghost) scene.ghost.setVisible(false);
  refreshHotbar(scene);
}

function placementValid(scene, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= GRID_H) return false; // interiors are buildable too
  const p = scene.player;
  if (Phaser.Math.Distance.Between(p.x, p.y, tx * TILE + 16, ty * TILE + 16) > 5.5 * TILE) return false;
  // on the balcony: turret-types only, on the deck, one per spot
  if (scene.state.onFloor2) {
    const d2 = STRUCTURES[scene.state.placing];
    if (!d2 || !d2.turret || d2.turret === 'stair') return false;
    if (!deckContains(scene, tx, ty)) return false;
    if (scene.turretGrid['U' + tx + ',' + ty]) return false;
    return true;
  }
  const def = STRUCTURES[scene.state.placing];
  const bt = scene.blockLayer.getTileAt(tx, ty);
  if (bt) {
    // turrets may be mounted ON walls; floors may replace tall grass;
    // drills may be planted straight onto rock/trees (they break in on placement)
    const turretOnWall = def && def.turret && isWallTile(bt.index);
    const floorOnGrass = def && def.floor && bt.index === T.TALLGRASS;
    const drillOnRock = def && def.turret && def.turret.startsWith('drill') &&
      bt.index >= T.TREE && bt.index <= T.DIAMOND;
    if (!turretOnWall && !floorOnGrass && !drillOnRock) return false;
  }
  const g = scene.groundLayer.getTileAt(tx, ty);
  if (!g || g.index === T.WATER) return false;
  if (def && def.floor && g.index === T.FLOOR) return false; // already floored
  if (scene.turretGrid[tx + ',' + ty]) return false;
  // don't entomb yourself (floors are walkable, pave away)
  if (!(def && def.floor)) {
    const rect = new Phaser.Geom.Rectangle(tx * TILE, ty * TILE, TILE, TILE);
    if (Phaser.Geom.Intersects.RectangleToRectangle(rect, p.body)) return false;
  }
  return true;
}

function updatePlacementGhost(scene) {
  const st = scene.state;
  if (!st.placing || !scene.ghost) return;
  const ptr = scene.input.activePointer;
  const wx = ptr.worldX, wy = ptr.worldY;
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  scene.ghost.setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  scene.ghost.setTint(placementValid(scene, tx, ty) ? 0xffffff : 0xff5050);
  scene.ghost.setAlpha(placementValid(scene, tx, ty) ? 0.65 : 0.35);
}

function tryPlace(scene) {
  const ptr = scene.input.activePointer;
  return placeAt(scene, Math.floor(ptr.worldX / TILE), Math.floor(ptr.worldY / TILE), false);
}

function placeAt(scene, tx, ty, quiet) {
  const st = scene.state;
  if (!st.placing) return false;
  if (!placementValid(scene, tx, ty)) {
    if (quiet) return false;
    // explain the red ghost
    const def2 = STRUCTURES[st.placing];
    const wx = tx * TILE + 16, wy = ty * TILE + 16;
    const g3 = scene.groundLayer.getTileAt(tx, ty);
    let why = 'blocked';
    if (Phaser.Math.Distance.Between(scene.player.x, scene.player.y, wx, wy) > 5.5 * TILE) why = 'too far away';
    else if (def2 && def2.floor && g3 && g3.index === T.FLOOR) why = 'already floored';
    else if (g3 && g3.index === T.WATER) why = 'water';
    else if (scene.turretGrid[tx + ',' + ty]) why = 'occupied';
    else if (scene.blockLayer.getTileAt(tx, ty)) why = 'block in the way';
    showDamage(scene, wx, wy - 14, why, '#ff9a3e');
    return false;
  }

  const id = st.placing;
  const def = STRUCTURES[id];
  if (def.turret) {
    // drill planted on a block: it chews through that block to set up (drops included)
    const bt3 = scene.blockLayer.getTileAt(tx, ty);
    if (!st.onFloor2 && def.turret.startsWith('drill') && bt3 && bt3.index >= T.TREE && bt3.index <= T.DIAMOND) {
      const cx3 = bt3.getCenterX(), cy3 = bt3.getCenterY();
      const idx = destroyBlockTile(scene, tx, ty);
      if (idx >= 0) dropResources(scene, cx3, cy3, BLOCK_INFO[idx].drops);
    }
    // pool exhausted? don't eat the player's stock
    if (!placeTurret(scene, def.turret, tx, ty, st.onFloor2)) {
      showBanner('⚠ STRUCTURE LIMIT REACHED', 'dismantle something first (right-click)');
      return false;
    }
  } else if (def.trap) {
    placeTrap(scene, def.trap, tx, ty);
  } else if (def.floor) {
    const bt2 = scene.blockLayer.getTileAt(tx, ty);
    if (bt2 && bt2.index === T.TALLGRASS) scene.blockLayer.removeTileAt(tx, ty);
    scene.groundLayer.putTileAt(T.FLOOR, tx, ty);
  } else {
    placeWallTile(scene, tx, ty, def.tile);
  }
  st.stock[id]--;
  gainSkill(scene, 'building', 2);
  if (!quiet) SFX.place();
  queueSave(scene);
  if (!st.stock[id]) cancelPlacement(scene);
  refreshHotbar(scene);
  return true;
}

// drag a path while placing → stamp the whole line on release
function finishPlaceDrag(scene) {
  const drag = scene.placeDrag;
  scene.placeDrag = null;
  if (!drag || !scene.state.placing) return;
  if (drag.tiles.length <= 1) { tryPlace(scene); return; }
  let placed = 0, blocked = 0;
  for (const k of drag.tiles) {
    if (!scene.state.placing) break; // stock ran dry
    const [tx, ty] = k.split(',').map(Number);
    if (placeAt(scene, tx, ty, true)) placed++; else blocked++;
  }
  if (placed) {
    SFX.place();
    showBanner(`🔨 PLACED x${placed}`, blocked ? `${blocked} spots blocked` : 'nice line');
  }
}

function updatePlaceDrag(scene) {
  const drag = scene.placeDrag;
  if (!drag || !scene.state.placing) return;
  const ptr = scene.input.activePointer;
  const tx = Math.floor(ptr.worldX / TILE), ty = Math.floor(ptr.worldY / TILE);
  if (drag.last.tx === tx && drag.last.ty === ty) return;
  // walk the line so fast drags don't skip tiles
  let { tx: cx, ty: cy } = drag.last;
  let guard = 0;
  while ((cx !== tx || cy !== ty) && guard++ < 64) {
    cx += Math.sign(tx - cx);
    cy += Math.sign(ty - cy);
    const k = cx + ',' + cy;
    if (!drag.set.has(k) && drag.tiles.length < 200) { drag.set.add(k); drag.tiles.push(k); }
  }
  drag.last = { tx, ty };
}

function placeTurret(scene, type, tx, ty, floor2) {
  const info = TURRET_INFO[type];
  const t = scene.turrets.get(tx * TILE + 16, ty * TILE + 16, info.tex);
  if (!t) return null;
  t.floor2 = !!floor2;
  t.setActive(true).setVisible(true).setDepth(floor2 ? 13 : 4).clearTint().setAlpha(1).setScale(1);
  t.setTexture(info.tex);
  t.body.enable = !floor2; // balcony turrets are out of physical reach
  t.body.reset(tx * TILE + 16, ty * TILE + 16);
  t.body.setImmovable(true);
  t.ttype = type;
  t.info = info;
  const buildMul = 1 + 0.02 * (((scene.state.skills.building || { lvl: 1 }).lvl) - 1);
  t.hp = Math.round(info.hp * buildMul);
  t.maxHp = t.hp;
  t.cd = 0;
  t.tileKey = (floor2 ? 'U' : '') + tx + ',' + ty;
  scene.turretGrid[t.tileKey] = t;

  // campfires and tesla glow at night
  if (type === 'campfire' || type === 'tesla') {
    t.light = scene.add.image(t.x, t.y, 'glow').setDepth(11)
      .setScale(type === 'campfire' ? 2.2 : 1.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(type === 'campfire' ? 0xffc060 : 0x80c0ff)
      .setAlpha(0);
  }
  const pop = scene.add.image(t.x, t.y, 'ring').setDepth(15).setScale(0.4);
  scene.tweens.add({ targets: pop, scale: 1, alpha: 0, duration: 250, onComplete: () => pop.destroy() });
  return t;
}

function damageTurret(scene, t, dmg) {
  if (!t.active) return;
  t.hp -= dmg;
  t.setTintFill(0xffffff);
  t.flashT = 0.08;
  if (t.hp <= 0) {
    delete scene.turretGrid[t.tileKey];
    if (t.light) { t.light.destroy(); t.light = null; }
    spawnDebris(scene, t.x, t.y, T.STONE);
    SFX.breakBlk();
    t.setActive(false).setVisible(false);
    if (t.body) t.body.enable = false;
  }
}

// ---------- floor traps (no physics body — they sit under everything) ----------
function placeTrap(scene, type, tx, ty) {
  const info = TURRET_INFO[type];
  const t = scene.add.image(tx * TILE + 16, ty * TILE + 16, info.tex).setDepth(1);
  t.ttype = type;
  t.info = info;
  t.hp = info.hp;
  t.maxHp = info.hp;
  t.tick = 0;
  t.fuseT = -1;
  t.flashT = 0;
  t.tileKey = tx + ',' + ty;
  scene.turretGrid[t.tileKey] = t;
  scene.trapList.push(t);
  const pop = scene.add.image(t.x, t.y, 'ring').setDepth(15).setScale(0.4);
  scene.tweens.add({ targets: pop, scale: 1, alpha: 0, duration: 250, onComplete: () => pop.destroy() });
}

function destroyTrap(scene, t) {
  delete scene.turretGrid[t.tileKey];
  spawnDebris(scene, t.x, t.y, T.WOODWALL);
  t.destroy();
}

function updateTraps(scene, dt) {
  for (let i = scene.trapList.length - 1; i >= 0; i--) {
    const t = scene.trapList[i];
    if (!t.active) { scene.trapList.splice(i, 1); continue; }

    if (t.ttype === 'spike') {
      t.setAlpha(0.55 + 0.45 * (t.hp / t.maxHp)); // fades as it wears out
      t.tick -= dt;
      if (t.tick > 0) continue;
      t.tick = t.info.tick;
      for (const e of scene.enemies.getChildren()) {
        if (!e.active || e.dying) continue;
        if (Phaser.Math.Distance.Between(e.x, e.y, t.x, t.y) < 24) {
          damageEnemy(scene, e, t.info.dmg, 0, 0);
          t.hp -= 2;
        }
      }
      if (t.hp <= 0) { destroyTrap(scene, t); scene.trapList.splice(i, 1); }
      continue;
    }

    // tntTrap
    if (t.fuseT >= 0) {
      t.fuseT -= dt;
      t.setTintFill(Math.floor(t.fuseT * 12) % 2 ? 0xffffff : 0xff4040);
      if (t.fuseT <= 0) {
        const x = t.x, y = t.y;
        destroyTrap(scene, t);
        scene.trapList.splice(i, 1);
        explode(scene, x, y, t.info.radius, t.info.dmg, { friendly: true });
      }
      continue;
    }
    for (const e of scene.enemies.getChildren()) {
      if (!e.active || e.dying) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, t.x, t.y) < t.info.trigger) {
        t.fuseT = t.info.fuse;
        SFX.zap();
        break;
      }
    }
  }
}

// mounted on a wall tile? (computed live — survives the wall being chewed away)
function isTurretElevated(scene, t) {
  const tile = scene.blockLayer.getTileAt(Math.floor(t.x / TILE), Math.floor(t.y / TILE));
  return !!(tile && isWallTile(tile.index));
}

function updateTurrets(scene, dt) {
  const nightAlpha = scene.state.darkness;
  for (const t of scene.turrets.getChildren()) {
    if (!t.active) continue;
    if (t.flashT > 0) { t.flashT -= dt; if (t.flashT <= 0) t.clearTint(); }
    if (t.light) {
      t.light.setAlpha(0.25 + nightAlpha * 0.75 + Math.random() * 0.06);
    }
    t.cd -= dt;
    if (t.cd > 0) continue;
    const info = t.info;

    if (t.ttype === 'bed' || t.ttype === 'scarecrow') { t.cd = 1; continue; } // decor with a job

    if (t.info.mineDps) { // drill rigs: tireless little miners
      t.cd = 0.6;
      drillTick(scene, t, 0.6);
      continue;
    }

    if (t.ttype === 'campfire') {
      t.cd = info.cd;
      const p = scene.player;
      // upstairs campfires warm the ground around their staircase too
      let cfx = t.x, cfy = t.y;
      const cli = loftIndexAt(Math.floor(t.x / TILE), Math.floor(t.y / TILE));
      if (cli >= 0 && (scene.stairSlots || [])[cli]) {
        const a2 = scene.stairSlots[cli];
        if (Phaser.Math.Distance.Between(a2.tx * TILE + 16, a2.ty * TILE + 16, p.x, p.y) <
            Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y)) { cfx = a2.tx * TILE + 16; cfy = a2.ty * TILE + 16; }
      }
      if (Phaser.Math.Distance.Between(cfx, cfy, p.x, p.y) < info.range && scene.state.hp < scene.state.maxHp) {
        scene.state.hp = Math.min(scene.state.maxHp, scene.state.hp + info.heal);
        showDamage(scene, p.x, p.y - 24, '+' + info.heal, '#7ef76a');
      }
      // critters warm up too (fainted ones recover in updatePets)
      for (const pet of scene.pets) {
        if (!pet.fainted && pet.hp < petMaxHp(pet) &&
            Phaser.Math.Distance.Between(t.x, t.y, pet.x, pet.y) < info.range) {
          pet.hp = Math.min(petMaxHp(pet), pet.hp + info.heal);
        }
      }
      // flicker
      t.setScale(1 + Math.random() * 0.06);
      continue;
    }

    // balcony turrets get the high-ground bonus — while their staircase stands
    let fx = t.x, fy = t.y, rangeMul = isTurretElevated(scene, t) ? 1.25 : 1;
    if (t.floor2) {
      const ttx = Math.floor(t.x / TILE), tty = Math.floor(t.y / TILE);
      if (!deckContains(scene, ttx, tty)) {
        t.idleHintT = (t.idleHintT || 0) - dt;
        if (t.idleHintT <= 0) { t.idleHintT = 5; showDamage(scene, t.x, t.y - 22, 'no staircase below!', '#ff9a3e'); }
        t.cd = 0.5;
        continue;
      }
      rangeMul = 1.25; // tower advantage
    }
    const range = info.range * rangeMul;
    const target = nearestEnemy(scene, fx, fy, range);
    if (!target) { t.cd = 0.15; continue; }
    t.cd = info.cd;
    const ang = Phaser.Math.Angle.Between(fx, fy, target.x, target.y);

    if (t.ttype === 'arrow') {
      spawnProj(scene, fx, fy - 8, 'arrow', ang, 380, info.dmg, { life: range / 380 + 0.2 });
      SFX.shoot();
    } else if (t.ttype === 'crossbow') {
      spawnProj(scene, fx, fy - 8, 'bolt', ang, 520, info.dmg, { pierce: info.pierce, life: range / 520 + 0.2 });
      SFX.shoot();
    } else if (t.ttype === 'flame') {
      const a = ang + (Math.random() - 0.5) * 0.35;
      const f = spawnProj(scene, fx, fy - 8, 'fireball', a, 240, info.dmg, { pierce: 1, life: range / 240 });
      if (f) {
        f.setScale(0.7 + Math.random() * 0.5);
        f.setBlendMode(Phaser.BlendModes.ADD);
      }
    } else if (t.ttype === 'tesla') {
      teslaChain(scene, t, target, fx, fy);
    }
  }
}

function teslaChain(scene, t, first, fx, fy) {
  const info = t.info;
  const hits = [first];
  let cur = first;
  for (let i = 1; i < info.chain; i++) {
    let best = null, bestD = 150;
    for (const e of scene.enemies.getChildren()) {
      if (!e.active || hits.includes(e)) continue;
      const d = Phaser.Math.Distance.Between(cur.x, cur.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) break;
    hits.push(best);
    cur = best;
  }
  let px = fx !== undefined ? fx : t.x, py = (fy !== undefined ? fy : t.y) - 10;
  for (const e of hits) {
    const line = scene.add.line(0, 0, px, py, e.x, e.y, 0x9ad8ff).setOrigin(0).setLineWidth(2).setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    const line2 = scene.add.line(0, 0, px, py, e.x, e.y, 0xffffff).setOrigin(0).setLineWidth(1).setDepth(15);
    scene.tweens.add({ targets: [line, line2], alpha: 0, duration: 180, onComplete: () => { line.destroy(); line2.destroy(); } });
    damageEnemy(scene, e, info.dmg, 0, 0);
    px = e.x; py = e.y;
  }
  SFX.zap();
}


// ---------- drill rigs: stationary auto-miners ----------
function findDrillTarget(scene, t) {
  const ctx2 = Math.floor(t.x / TILE), cty = Math.floor(t.y / TILE);
  const R = t.info.mineR;
  let best = null, bd = (R + 1) * (R + 1);
  let gated = false; // blocks in reach, but above your pickaxe tier
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const tile = scene.blockLayer.getTileAt(ctx2 + dx, cty + dy);
      if (!tile) continue;
      const idx = tile.index;
      const natural = idx >= T.TREE && idx <= T.DIAMOND;
      if (!natural) continue;
      if (BLOCK_INFO[idx].tier > scene.state.flags.pickTier) { gated = true; continue; } // pickaxe gates the machines too
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = { x: ctx2 + dx, y: cty + dy }; }
    }
  }
  t.idleReason = best ? null : (gated ? 'need better pickaxe!' : 'no blocks in reach');
  return best;
}

function drillTick(scene, t, dt) {
  const st = scene.state;
  if (!t.mineTile || !scene.blockLayer.getTileAt(t.mineTile.x, t.mineTile.y)) {
    t.mineTile = findDrillTarget(scene, t);
  }
  if (!t.mineTile) {
    // say WHY it's idle, so it never looks broken
    t.idleHintT = (t.idleHintT || 0) - dt;
    if (t.idleReason && t.idleHintT <= 0) {
      t.idleHintT = 4;
      showDamage(scene, t.x, t.y - 22, t.idleReason, '#ff9a3e');
    }
    t.setAngle(0);
    return;
  }
  const k = t.mineTile.x + ',' + t.mineTile.y;
  if (!(k in scene.blockHP)) { t.mineTile = null; return; }
  const chip = t.info.mineDps * dt;
  scene.blockHP[k] -= chip;
  scene.damagedBlocks.add(k);
  // visible work: chip numbers + sparks on the block being drilled
  const bx = t.mineTile.x * TILE + 16, by = t.mineTile.y * TILE + 16;
  showDamage(scene, bx + (Math.random() - 0.5) * 10, by - 6, Math.round(chip), '#c8d0dc');
  const spark = scene.add.image(bx + (Math.random() - 0.5) * 16, by + (Math.random() - 0.5) * 16, 'px')
    .setDepth(15).setTint(0xffd95e);
  scene.tweens.add({ targets: spark, y: spark.y - 10, alpha: 0, duration: 250, onComplete: () => spark.destroy() });
  t.setAngle((Math.random() - 0.5) * 8); // chugga chugga
  if (scene.blockHP[k] <= 0) {
    t.setAngle(0);
    const idx = destroyBlockTile(scene, t.mineTile.x, t.mineTile.y);
    if (idx >= 0) {
      // straight to your pockets — that's the whole point
      for (const [r, n] of Object.entries(BLOCK_INFO[idx].drops)) st.res[r] += n;
      logRes(scene, 'drill_' + t.ttype, '🛠 ' + STRUCTURES[{ drill1: 'drill1', drill2: 'drill2', drill3: 'drill3' }[t.ttype]].name, BLOCK_INFO[idx].drops);
      gainXP(scene, BLOCK_INFO[idx].xp || 0);
      gainSkill(scene, 'mining', 1);
    }
    t.mineTile = null;
  }
}
