// ---------- enemies: spawning, AI, death ----------

function nightScaling(night) {
  // linear early, compounding after night 8 so late waves stay scary
  const late = Math.pow(1.04, Math.max(0, night - 8));
  return { hp: (1 + 0.28 * (night - 1)) * late, dmg: (1 + 0.13 * (night - 1)) * Math.pow(1.02, Math.max(0, night - 8)) };
}

function spawnEnemy(scene, type, x, y) {
  if (scene.enemies.countActive(true) > 140) return null;
  const info = ENEMY_INFO[type];
  const e = scene.enemies.get(x, y, info.tex);
  if (!e) return null;
  const sc = nightScaling(Math.max(1, scene.state.night));

  e.setActive(true).setVisible(true).setDepth(5);
  e.setTexture(info.tex);
  e.body.enable = true;
  e.body.reset(x, y);
  e.setScale(1).setAlpha(1).clearTint();
  e.setFlipX(false);

  e.etype = type;
  e.info = info;
  e.hp = info.hp * sc.hp * (info.boss ? 1 + 0.5 * Math.floor(scene.state.night / 3) : 1);
  // wild critters keep pace with YOUR power, not just the calendar — otherwise
  // late-game weapons delete them before an orb can fly
  if (info.wild) e.hp = info.hp * sc.hp * (1 + 0.30 * (scene.state.level - 1));
  e.maxHp = e.hp;
  e.dmg = info.dmg * sc.dmg;
  e.speed = info.speed * (0.9 + Math.random() * 0.2);
  e.dying = false;
  e.kbT = 0;
  e.flashT = 0;
  e.touchCd = 0;
  e.attackCd = 0;
  e.bladeCd = 0;
  e.shootT = Math.random() * 1.5;
  e.fuseT = -1;
  e.burnTick = 0;
  e.wobble = Math.random() * Math.PI * 2;
  e.catchLock = false;
  e.den = null;
  e.noBurn = false;
  e.slowT = 0;

  const w = e.width, h = e.height;
  e.body.setSize(w * 0.7, h * 0.7);
  if (info.boss) {
    e.setDepth(6);
    scene.bossBar = e;
  }
  return e;
}

function killEnemy(scene, e) {
  if (e.dying) return;
  e.dying = true;
  scene.state.kills++;
  const info = e.info;
  gainSkill(scene, 'combat', info.boss ? 15 : 1 + Math.floor(scene.state.night / 3));

  // tougher nights drop richer gems — leveling keeps pace with difficulty
  dropGem(scene, e.x, e.y, Math.ceil(info.xp * (1 + 0.10 * (scene.state.night - 1))));
  dropCoin(scene, e.x, e.y, 1 + Math.floor(Math.random() * (1 + scene.state.night * 0.5)));
  if (e.etype === 'treant') dropResources(scene, e.x, e.y, { wood: 3 });
  if (info.boss) logEvent(scene, `👑 slew ${e.etype === 'dungeonlord' ? 'the DUNGEON LORD' : 'a Brute'}!`, true);
  if (e.etype === 'dungeonlord') {
    const st = scene.state;
    st.dungeonClears = (st.dungeonClears || 0) + 1;
    st.lastClearDay = st.day;
    dropResources(scene, e.x, e.y, { diamond: 4, gold: 5, iron: 5 });
    for (let i = 0; i < 8; i++) dropCoin(scene, e.x + (Math.random() - 0.5) * 80, e.y + (Math.random() - 0.5) * 80, 10 + Math.floor(Math.random() * 8));
    for (let i = 0; i < 8; i++) dropGem(scene, e.x + (Math.random() - 0.5) * 80, e.y + (Math.random() - 0.5) * 80, 6);
    const up = chestWeaponUpgrade(scene, true);
    showBanner('👑 DUNGEON LORD DEFEATED!', (up ? up + ' · ' : '') + 'he returns at dawn — stronger');
    queueSave(scene);
  }
  if (info.boss) {
    // boss piñata
    dropResources(scene, e.x, e.y, { iron: 4, gold: 3, diamond: 2 });
    for (let i = 0; i < 6; i++) dropGem(scene, e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60, 5);
    for (let i = 0; i < 5; i++) dropCoin(scene, e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60, 5);
    scene.bossBar = null;
    scene.cameras.main.shake(300, 0.012);
  } else if (Math.random() < 0.06) {
    dropResources(scene, e.x, e.y, Math.random() < 0.5 ? { wood: 1 } : { stone: 1 });
  }

  e.body.enable = false;
  scene.tweens.add({
    targets: e, scaleX: e.scaleX * 1.3, scaleY: 0.1, alpha: 0, angle: (Math.random() - 0.5) * 40,
    duration: 200,
    onComplete: () => { e.setActive(false).setVisible(false); e.setAngle(0); },
  });
  spawnDebris(scene, e.x, e.y, T.STONE);
}

function updateEnemies(scene, dt) {
  const p = scene.player;
  const isDay = !scene.state.isNight;

  for (const e of scene.enemies.getChildren()) {
    if (!e.active || e.dying) continue;

    // timers
    if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.clearTint(); }
    if (e.touchCd > 0) e.touchCd -= dt;
    if (e.attackCd > 0) e.attackCd -= dt;
    if (e.bladeCd > 0) e.bladeCd -= dt;
    if (e.slowT > 0) e.slowT -= dt; // yeti chill

    // daylight burns zombies & skeletons (cave dwellers are hardened)
    if (isDay && e.info.burns && !e.noBurn) {
      e.burnTick += dt;
      if (e.burnTick > 0.5) {
        e.burnTick = 0;
        e.hp -= 8;
        e.setTintFill(0xff7020);
        e.flashT = 0.15;
        showDamage(scene, e.x, e.y - 18, '🔥', '#ff8a20');
        if (e.hp <= 0) { killEnemy(scene, e); continue; }
      }
    }

    // scarecrows taunt melee mobs that wander near
    let tgt = p;
    if (e.info.wild && petsCanBattle(scene)) {
      // a proper battle: the wild squares up against your nearest conscious critter
      let bd = 500;
      for (const pet of scene.pets) {
        if (pet.fainted) continue;
        const d = Phaser.Math.Distance.Between(e.x, e.y, pet.x, pet.y);
        if (d < bd) { bd = d; tgt = pet; }
      }
    } else if (!e.info.ranged) {
      let bd = (TURRET_INFO.scarecrow.taunt || 240);
      for (const t of scene.turrets.getChildren()) {
        if (!t.active || t.ttype !== 'scarecrow') continue;
        const d = Phaser.Math.Distance.Between(e.x, e.y, t.x, t.y);
        if (d < bd) { bd = d; tgt = t; }
      }
    }
    const dist = Phaser.Math.Distance.Between(e.x, e.y, tgt.x, tgt.y);
    const ang = Phaser.Math.Angle.Between(e.x, e.y, tgt.x, tgt.y);
    e.setFlipX(tgt.x < e.x);

    // creeper fuse
    if (e.info.exploder) {
      if (e.fuseT >= 0) {
        e.fuseT -= dt;
        e.setTintFill(Math.floor(e.fuseT * 10) % 2 ? 0xffffff : 0xff4040);
        e.body.setVelocity(0, 0);
        if (e.fuseT <= 0) {
          e.dying = true;
          e.setActive(false).setVisible(false);
          e.body.enable = false;
          explode(scene, e.x, e.y, e.info.blastR, e.dmg, { friendly: false });
          scene.state.kills++; // it counts
        }
        continue;
      }
      if (dist < 34) { e.fuseT = e.info.fuse; SFX.zap(); continue; }
    }

    // knockback overrides steering briefly
    if (e.kbT > 0) { e.kbT -= dt; continue; }

    // skeleton: keep distance and shoot
    if (e.info.ranged && dist < e.info.shootRange) {
      e.shootT -= dt;
      if (dist < 130) {
        e.body.setVelocity(Math.cos(ang + Math.PI) * e.speed * 0.8, Math.sin(ang + Math.PI) * e.speed * 0.8);
      } else {
        e.body.setVelocity(0, 0);
      }
      if (e.shootT <= 0) {
        e.shootT = e.info.shootCd;
        const s = scene.enemyProj.get(e.x, e.y, 'enemy_arrow');
        if (s) {
          s.setActive(true).setVisible(true).setDepth(8);
          s.body.enable = true;
          s.body.reset(e.x, e.y);
          s.setRotation(ang);
          s.body.setVelocity(Math.cos(ang) * 300, Math.sin(ang) * 300);
          s.dmg = e.dmg;
          s.life = 1.6;
          SFX.shoot();
        }
      }
      continue;
    }

    // default: chase target, with spider wobble
    let vx = Math.cos(ang), vy = Math.sin(ang);
    if (e.etype === 'spider' || e.info.wobbles) {
      e.wobble += dt * 6;
      const perp = Math.sin(e.wobble) * 0.6;
      vx += -Math.sin(ang) * perp;
      vy += Math.cos(ang) * perp;
    }
    // slide along obstacles
    if (e.body.blocked.left || e.body.blocked.right) vy = Math.sign(tgt.y - e.y) || 1;
    if (e.body.blocked.up || e.body.blocked.down) vx = Math.sign(tgt.x - e.x) || 1;
    const len = Math.hypot(vx, vy) || 1;
    const spd = e.speed * (e.slowT > 0 ? 0.55 : 1);
    e.body.setVelocity((vx / len) * spd, (vy / len) * spd);
  }
}

// enemy walked into a block tile: chew through it (walls fast, nature slow)
function enemyHitBlock(scene, e, tile) {
  if (!e.active || e.dying || !e.info || e.attackCd > 0) return;
  e.attackCd = 0.7;
  const k = tile.x + ',' + tile.y;
  if (!(k in scene.blockHP)) return;
  if (tile.index === T.OBSIDIANWALL && !e.info.big) return; // too hard for little teeth
  const isWall = isWallTile(tile.index);
  const chew = isWall ? e.dmg * 1.2 : e.dmg * 0.4;
  scene.blockHP[k] -= chew;
  scene.damagedBlocks.add(k);
  // bite feedback on walls
  if (isWall) {
    const fx = scene.add.image(tile.getCenterX(), tile.getCenterY(), 'px').setDepth(15).setTint(0xffffff).setScale(2);
    scene.tweens.add({ targets: fx, alpha: 0, scale: 0.5, duration: 150, onComplete: () => fx.destroy() });
  }
  if (scene.blockHP[k] <= 0) destroyBlockTile(scene, tile.x, tile.y);
}

// ---------- spawner ----------
function updateSpawner(scene, dt) {
  const st = scene.state;
  if (currentArea(scene) === 'rift') st.arenaT = (st.arenaT || 0) + dt; // rift clock runs always
  st.spawnT -= dt;
  if (st.spawnT > 0) return;

  const area = currentArea(scene);
  if (area !== 'overworld') { areaSpawner(scene, area); return; }

  if (st.isNight) {
    // ENDLESS: they just keep coming, all night (only the alive-cap holds them back)
    st.spawnT = Math.max(1.0, 2.8 - st.night * 0.12);
    const burst = 3 + Math.floor(st.night * 0.9) + Math.floor(Math.random() * 3);
    const pool = NIGHT_POOLS[Math.min(NIGHT_POOLS.length - 1, st.night >= 5 ? 3 : st.night - 1)];
    for (let i = 0; i < burst; i++) {
      const pos = edgeSpawnPos(scene);
      if (pos) spawnEnemy(scene, pool[Math.floor(Math.random() * pool.length)], pos.x, pos.y);
    }
  } else {
    // daytime trickle so XP keeps flowing (spiders don't burn in daylight)
    const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);
    const inForest = ptx >= DENSE_FOREST.x0 && ptx <= DENSE_FOREST.x1 && pty >= DENSE_FOREST.y0 && pty <= DENSE_FOREST.y1;
    st.spawnT = inForest ? 5 : 7; // the deep woods are restless
    if (scene.enemies.countActive(true) < (inForest ? 14 : 10)) {
      const pos = edgeSpawnPos(scene);
      const type = inForest && Math.random() < 0.55 ? 'treant'
        : (st.night >= 3 && Math.random() < 0.08) ? 'creeper' : 'spider';
      if (pos) spawnEnemy(scene, type, pos.x, pos.y);
    }
  }
}

function startNight(scene) {
  const st = scene.state;
  st.isNight = true;
  st.phaseT = NIGHT_LEN;
  st.nightBudget = 20 + 14 * st.night;
  st.spawnT = 1.5;
  SFX.night();
  showBanner(`NIGHT ${st.night}`, 'THEY ARE COMING...');

  if (st.night % 3 === 0) {
    pushAction(scene, 5, () => {
      const pos = edgeSpawnPos(scene);
      if (pos) {
        spawnEnemy(scene, 'brute', pos.x, pos.y);
        showBanner('⚠ ZOMBIE BRUTE ⚠', 'something big is out there');
        SFX.boss();
      }
    });
  }
}

function startDay(scene) {
  const st = scene.state;
  st.isNight = false;
  st.night++; // night counter == upcoming night
  st.day++;
  st.phaseT = DAY_LEN;
  st.spawnT = 4;
  st.nightWarn60 = false;
  st.nightWarn15 = false;
  SFX.dawn();
  showBanner(`DAY ${st.day}`, 'mine, craft, build — the sun won\'t last');
  const best = Number(localStorage.getItem('blockbonk_best') || 0);
  if (st.day - 1 > best) localStorage.setItem('blockbonk_best', String(st.day - 1));
  // dawn revives fainted critters at half strength; phoenixes recharge their rebirth
  for (const pet of scene.pets || []) {
    if (pet.fainted) revivePet(scene, pet, 0.5);
    pet.rebirthUsed = false;
  }
  // morning repairs: walls and turrets mend themselves
  let repaired = 0;
  for (const k of [...scene.damagedBlocks]) {
    const [tx, ty] = k.split(',').map(Number);
    const tile = scene.blockLayer.getTileAt(tx, ty);
    if (!tile || !isWallTile(tile.index)) continue;
    const max = scene.blockMaxHP[k];
    scene.blockHP[k] = Math.min(max, scene.blockHP[k] + max * DAWN_REPAIR);
    if (scene.blockHP[k] >= max) scene.damagedBlocks.delete(k);
    repaired++;
  }
  for (const t of scene.turrets.getChildren()) {
    if (t.active && t.hp < t.maxHp) { t.hp = Math.min(t.maxHp, t.hp + t.maxHp * DAWN_REPAIR); repaired++; }
  }

  const bloom = st.day % BLOOM_EVERY === 0;
  const grown = regrowResources(scene, bloom);
  logEvent(scene, `${bloom ? '🌸 BLOOM DAY —' : '🌄 dawn —'} ${grown || 0} blocks regrew · ${repaired || 0} structures repaired`, bloom);
  st.harvestedToday = 0; // fresh ledger for the new day
  if (bloom && grown) {
    pushAction(scene, 1.2, () => showBanner('🌸 THE WORLD BLOOMS 🌸', `every harvested block regrown (${grown}!)`));
  }
  if (saveGame(scene)) {
    pushAction(scene, bloom ? 4.5 : 2.5, () => {
      const bits = ['progress saved'];
      if (grown && !bloom) bits.push(`nature regrew ${grown} blocks`);
      if (repaired) bits.push(`${repaired} structures repaired`);
      showBanner('💾 DAWN CHECKPOINT', bits.join(' · '));
    });
  }
}

// monster dens: endless spawners while the player is close
function updateDens(scene, dt) {
  if (!scene.dens) return;
  const p = scene.player;
  for (const den of scene.dens) {
    den.glow.setAlpha(0.18 + scene.state.darkness * 0.4 + Math.random() * 0.05);
    const d = Phaser.Math.Distance.Between(p.x, p.y, den.x, den.y);
    if (d > DEN_RANGE) continue;
    if (!den.seen) {
      den.seen = true;
      showBanner('⚠ MONSTER DEN ⚠', 'they keep coming — endless XP if you can take it');
      SFX.boss();
    }
    den.timer -= dt;
    if (den.timer > 0) continue;
    den.timer = DEN_RATE;
    let alive = 0;
    for (const e of scene.enemies.getChildren()) if (e.active && !e.dying && e.den === den) alive++;
    if (alive >= DEN_MAX_ALIVE) continue;
    const pool = NIGHT_POOLS[Math.min(NIGHT_POOLS.length - 1, scene.state.night >= 5 ? 3 : Math.max(0, scene.state.night - 1))];
    const n = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = spawnEnemy(scene, pool[Math.floor(Math.random() * pool.length)],
        den.x + Math.cos(a) * 26, den.y + Math.sin(a) * 26);
      if (e) {
        e.den = den;
        e.noBurn = true; // cave dwellers don't burn in daylight
        e.setScale(0.3);
        scene.tweens.add({ targets: e, scaleX: 1, scaleY: 1, duration: 250 });
      }
    }
  }
}

function edgeSpawnPos(scene) {
  const p = scene.player;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 480 + Math.random() * 220;
    let x = p.x + Math.cos(a) * d;
    let y = p.y + Math.sin(a) * d;
    x = Phaser.Math.Clamp(x, TILE, MAP_W * TILE - TILE);
    y = Phaser.Math.Clamp(y, TILE, MAP_H * TILE - TILE);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (scene.blockLayer.getTileAt(tx, ty)) continue;
    const g = scene.groundLayer.getTileAt(tx, ty);
    if (g && g.index === T.WATER) continue;
    return { x, y };
  }
  return null;
}
