// ---------- auto-attack weapon systems ----------

function nearestEnemy(scene, x, y, maxDist) {
  let best = null, bestD = maxDist;
  for (const e of scene.enemies.getChildren()) {
    if (!e.active) continue;
    const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// scheduled gameplay actions that respect our pause (unlike time.delayedCall)
function pushAction(scene, delay, fn) {
  scene.actionQueue.push({ t: delay, fn });
}

function playerDamageMult(scene) {
  const combatLvl = (scene.state.skills.combat || { lvl: 1 }).lvl;
  return (1 + 0.10 * (scene.state.passives.power || 0))
    * (1 + 0.015 * (combatLvl - 1))
    * (1 + 0.15 * (scene.state.prestige || 0))
    * (scene.state.buffs.strength > 0 ? 1.5 : 1);
}

// ability passives: area/size, projectile quantity, projectile speed
function areaMult(scene) { return 1 + 0.08 * (scene.state.passives.area || 0); }
function qtyBonus(scene) { return scene.state.passives.quantity || 0; }
function hasteMult(scene) { return 1 + 0.08 * (scene.state.passives.haste || 0); }

function updateWeapons(scene, dt) {
  const st = scene.state;
  const frenzy = 1 + 0.08 * (st.passives.frenzy || 0);

  for (const [key, lvl] of Object.entries(st.weapons)) {
    if (key === 'orbit' || key === 'aura') continue; // continuous, handled below
    st.weaponCd[key] = (st.weaponCd[key] || 0) - dt * frenzy;
    if (st.weaponCd[key] > 0) continue;
    const stats = WEAPONS[key].stats(lvl);
    const fired = FIRE_FNS[key](scene, stats);
    if (fired) st.weaponCd[key] = stats.cd;
    else st.weaponCd[key] = 0.2; // no target — retry soon
  }
  updateOrbit(scene, dt);
  updateAura(scene, dt, frenzy);
}

// ---------- bonk aura: a damage halo around the player ----------
function updateAura(scene, dt, frenzy) {
  const st = scene.state;
  const lvl = st.weapons.aura || 0;
  if (!lvl) {
    if (scene.auraVis) { scene.auraVis.destroy(); scene.auraVis = null; }
    return;
  }
  const s = WEAPONS.aura.stats(lvl);
  const radius = s.radius * areaMult(scene);
  const p = scene.player;
  if (!scene.auraVis) {
    scene.auraVis = scene.add.image(p.x, p.y, 'ring').setDepth(3)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a40);
  }
  scene.auraVis.setPosition(p.x, p.y)
    .setScale(radius / 40)
    .setAlpha(0.10 + Math.sin(scene.time.now * 0.006) * 0.04);

  // the halo swats incoming projectiles out of the air (continuous, not on the damage tick)
  for (const proj of scene.enemyProj.getChildren()) {
    if (!proj.active) continue;
    if (Phaser.Math.Distance.Between(p.x, p.y, proj.x, proj.y) < radius) {
      killProj(scene, proj);
      const fz = scene.add.image(proj.x, proj.y, 'px').setDepth(15).setTint(0xff9a40).setScale(1.6);
      scene.tweens.add({ targets: fz, alpha: 0, scale: 0.3, duration: 200, onComplete: () => fz.destroy() });
      scene.auraVis.setAlpha(0.35); // flare on block
    }
  }

  st.auraT = (st.auraT || 0) - dt * frenzy;
  if (st.auraT > 0) return;
  st.auraT = 0.5;
  const dmg = s.dmg * playerDamageMult(scene);
  let hit = false;
  for (const e of scene.enemies.getChildren()) {
    if (!e.active || e.dying) continue;
    if (Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < radius + e.body.halfWidth) {
      damageEnemy(scene, e, dmg, 0, 0);
      hit = true;
    }
  }
  if (hit) scene.auraVis.setAlpha(0.3);
}

const FIRE_FNS = {
  sword(scene, s) {
    const p = scene.player;
    const range = s.range * areaMult(scene);
    const target = nearestEnemy(scene, p.x, p.y, range + 40);
    if (!target) return false;
    const ang = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y);
    doSlash(scene, ang, s);
    if (s.double) pushAction(scene, 0.16, () => doSlash(scene, ang + Math.PI, s));
    return true;
  },

  bow(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 430);
    if (!target) return false;
    const ang = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y);
    const dmg = s.dmg * playerDamageMult(scene);
    const count = s.count + qtyBonus(scene);
    for (let i = 0; i < count; i++) {
      const a = ang + (i - (count - 1) / 2) * 0.14;
      spawnProj(scene, p.x, p.y, 'arrow', a, s.speed * hasteMult(scene), dmg, { pierce: s.pierce, life: 1.2 });
    }
    SFX.shoot();
    return true;
  },

  fireStaff(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 400);
    if (!target) return false;
    const ang = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y);
    const dmg = s.dmg * playerDamageMult(scene);
    const count = s.count + qtyBonus(scene);
    for (let i = 0; i < count; i++) {
      const a = ang + (i - (count - 1) / 2) * 0.12 + (Math.random() - 0.5) * 0.08;
      const f = spawnProj(scene, p.x, p.y, 'fireball', a, s.speed * hasteMult(scene), dmg, { pierce: s.pierce, life: 1.1 });
      if (f) f.setBlendMode(Phaser.BlendModes.ADD).setScale(0.9 + Math.random() * 0.4);
    }
    SFX.shoot();
    return true;
  },

  frost(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 420);
    if (!target) return false;
    const ang = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y);
    const dmg = s.dmg * playerDamageMult(scene);
    const count = s.count + qtyBonus(scene);
    for (let i = 0; i < count; i++) {
      const a = ang + (i - (count - 1) / 2) * 0.16;
      spawnProj(scene, p.x, p.y, 'shard', a, s.speed * hasteMult(scene), dmg, { pierce: 1, life: 1.2, slows: s.slow });
    }
    SFX.zap();
    return true;
  },

  boomerang(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 360);
    if (!target) return false;
    const dmg = s.dmg * playerDamageMult(scene);
    const count = s.count + qtyBonus(scene);
    for (let i = 0; i < count; i++) {
      const a = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y) + (i - (count - 1) / 2) * 0.4;
      const spd = s.speed * hasteMult(scene);
      const b = spawnProj(scene, p.x, p.y, 'boomerang', a, spd, dmg, { pierce: 99, life: 1.5 });
      if (b) {
        b.body.setAcceleration(-Math.cos(a) * spd * 1.6, -Math.sin(a) * spd * 1.6);
        b.body.setAngularVelocity(780);
      }
    }
    SFX.swing();
    return true;
  },

  nova(scene, s) {
    if (!nearestEnemy(scene, scene.player.x, scene.player.y, 450)) return false;
    const p = scene.player;
    const dmg = s.dmg * playerDamageMult(scene);
    const shards = s.shards + qtyBonus(scene) * 2;
    for (let i = 0; i < shards; i++) {
      const a = (i / shards) * Math.PI * 2;
      const pr = spawnProj(scene, p.x, p.y, 'shard', a, s.speed * hasteMult(scene), dmg, { pierce: 1, life: 0.7 * areaMult(scene) });
      if (pr) pr.setTint(0xffd95e);
    }
    SFX.explode();
    return true;
  },

  axe(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 320);
    if (!target) return false;
    const dmg = s.dmg * playerDamageMult(scene);
    const axeCount = s.count + qtyBonus(scene);
    for (let i = 0; i < axeCount; i++) {
      pushAction(scene, i * 0.12, () => {
        if (scene.state.gameOver) return;
        const t = nearestEnemy(scene, p.x, p.y, 320) || target;
        const ang = Phaser.Math.Angle.Between(p.x, p.y, t.x, t.y) + (Math.random() - 0.5) * 0.3;
        const proj = spawnProj(scene, p.x, p.y - 10, 'axe_proj', ang, 260, dmg, { pierce: 99, life: 1.0 });
        if (proj) {
          proj.body.velocity.y -= 160;
          proj.body.setAccelerationY(520);
          proj.body.setAngularVelocity(720);
        }
        SFX.swing();
      });
    }
    return true;
  },

  tnt(scene, s) {
    const p = scene.player;
    const target = nearestEnemy(scene, p.x, p.y, 300);
    if (!target) return false;
    const dmg = s.dmg * playerDamageMult(scene);
    const tx = target.x + (Math.random() - 0.5) * 30;
    const ty = target.y + (Math.random() - 0.5) * 30;
    const bomb = scene.add.image(p.x, p.y, 'tnt').setDepth(8);
    scene.tweens.add({
      targets: bomb, x: tx, y: ty, duration: 550, ease: 'Quad.Out',
      onUpdate: (tw, t2) => { bomb.angle += 8; bomb.setScale(1 + Math.sin(tw.progress * Math.PI) * 0.6); },
    });
    pushAction(scene, 0.55 + 0.35, () => {
      bomb.destroy();
      explode(scene, tx, ty, s.radius * areaMult(scene), dmg, { friendly: true });
    });
    // flash red while fused
    scene.tweens.add({ targets: bomb, alpha: 0.5, duration: 90, yoyo: true, repeat: 6 });
    return true;
  },

  lightning(scene, s) {
    const cam = scene.cameras.main;
    const candidates = scene.enemies.getChildren().filter(e =>
      e.active && e.x > cam.scrollX - 40 && e.x < cam.scrollX + cam.width + 40 &&
      e.y > cam.scrollY - 40 && e.y < cam.scrollY + cam.height + 40);
    if (!candidates.length) return false;
    const dmg = s.dmg * playerDamageMult(scene);
    Phaser.Utils.Array.Shuffle(candidates);
    const targets = candidates.slice(0, s.strikes + qtyBonus(scene));
    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      pushAction(scene, i * 0.08, () => {
        if (!e.active) return;
        const bolt = scene.add.image(e.x, e.y - 38, 'bolt_strike').setDepth(15).setOrigin(0.5, 0).setFlipY(true).setScale(1, 0.95);
        const flash = scene.add.image(e.x, e.y, 'glow').setDepth(14).setScale(0.6).setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: [bolt, flash], alpha: 0, duration: 220, onComplete: () => { bolt.destroy(); flash.destroy(); } });
        damageEnemy(scene, e, dmg, 0, 0);
        SFX.zap();
      });
    }
    return true;
  },
};

function doSlash(scene, ang, s) {
  const p = scene.player;
  const st = scene.state;
  const range = s.range * areaMult(scene);
  const dmg = s.dmg * playerDamageMult(scene) * SWORD_TIER_MULT[st.flags.swordTier || 0];
  const slash = scene.add.image(p.x + Math.cos(ang) * 26, p.y + Math.sin(ang) * 26, 'slash')
    .setDepth(9).setRotation(ang).setScale(range / 60).setAlpha(0.9);
  scene.tweens.add({ targets: slash, alpha: 0, scale: slash.scale * 1.25, duration: 160, onComplete: () => slash.destroy() });
  for (const e of scene.enemies.getChildren()) {
    if (!e.active) continue;
    const d = Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y);
    if (d > range + e.body.halfWidth) continue;
    const ea = Phaser.Math.Angle.Between(p.x, p.y, e.x, e.y);
    if (Math.abs(Phaser.Math.Angle.Wrap(ea - ang)) > s.arc / 2) continue;
    damageEnemy(scene, e, dmg, Math.cos(ea) * 160, Math.sin(ea) * 160);
  }
  SFX.swing();
}

// ---------- orbiting blades ----------
function updateOrbit(scene, dt) {
  const st = scene.state;
  const lvl = st.weapons.orbit || 0;
  const want = lvl ? WEAPONS.orbit.stats(lvl).count + qtyBonus(scene) : 0;

  while (scene.orbitBlades.length < want) {
    scene.orbitBlades.push(scene.add.image(scene.player.x, scene.player.y, 'blade').setDepth(9));
  }
  while (scene.orbitBlades.length > want) scene.orbitBlades.pop().destroy();
  if (!lvl) return;

  const s = WEAPONS.orbit.stats(lvl);
  const radius = s.radius * areaMult(scene);
  st.orbitAngle = (st.orbitAngle || 0) + s.rotSpeed * hasteMult(scene) * dt;
  const dmg = s.dmg * playerDamageMult(scene);
  const p = scene.player;

  for (let i = 0; i < scene.orbitBlades.length; i++) {
    const b = scene.orbitBlades[i];
    const a = st.orbitAngle + (i / scene.orbitBlades.length) * Math.PI * 2;
    b.x = p.x + Math.cos(a) * radius;
    b.y = p.y + Math.sin(a) * radius;
    b.rotation = a + Math.PI / 2;
    for (const e of scene.enemies.getChildren()) {
      if (!e.active) continue;
      if (e.bladeCd && e.bladeCd > 0) continue;
      if (Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) < 18 + e.body.halfWidth) {
        e.bladeCd = 0.45;
        const ea = Phaser.Math.Angle.Between(p.x, p.y, e.x, e.y);
        damageEnemy(scene, e, dmg, Math.cos(ea) * 140, Math.sin(ea) * 140);
      }
    }
  }
}

// ---------- projectiles ----------
function spawnProj(scene, x, y, tex, ang, speed, dmg, opts = {}) {
  const s = scene.friendlyProj.get(x, y, tex);
  if (!s) return null;
  s.setActive(true).setVisible(true).setDepth(8);
  s.setTexture(tex);
  s.body.enable = true;
  s.body.reset(x, y);
  s.body.setAcceleration(0, 0);
  s.body.setAngularVelocity(0);
  s.setRotation(ang).setScale(1).setAlpha(1);
  s.body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
  s.dmg = dmg;
  s.pierce = opts.pierce || 0;
  s.life = opts.life || 1.5;
  s.slows = opts.slows || 0;
  s.clearTint();
  return s;
}

function killProj(scene, s) {
  s.setActive(false).setVisible(false);
  s.body.enable = false;
}

// ---------- damage ----------
function damageEnemy(scene, e, dmg, kbx, kby, src) {
  if (!e.active || e.dying) return;
  if (e.catchLock) return; // mid-catch: the orb has dibs
  // Lucky Dice: player/turret hits can crit for double (gold numbers)
  let crit = false;
  if (!src && scene.state.passives.crit && Math.random() < 0.05 * scene.state.passives.crit) {
    dmg *= 2;
    crit = true;
  }
  if (e.info && e.info.wild) {
    // Pokémon rules: while you have a conscious critter, the battle is THEIRS —
    // your weapons/turrets/traps hold fire. If the whole party faints, you may step in.
    if (src !== 'pet' && petsCanBattle(scene)) {
      if (!scene._battleHintAt || scene.time.now - scene._battleHintAt > 2000) {
        scene._battleHintAt = scene.time.now;
        showDamage(scene, e.x, e.y - 24, 'your critters battle it!', '#ffd95e');
      }
      return;
    }
    // and wilds can never be one-shot — hits cap at 30% max HP, so there's
    // always a window of several hits to throw an orb
    dmg = Math.min(dmg, e.maxHp * 0.30);
    // pets know not to finish it — they leave it at 1 HP, primed for your orb
    if (src === 'pet' && e.hp - dmg < 1) {
      dmg = Math.max(0, e.hp - 1);
      if (dmg <= 0) {
        if (!scene._koHintAt || scene.time.now - scene._koHintAt > 2000) {
          scene._koHintAt = scene.time.now;
          showDamage(scene, e.x, e.y - 24, 'it\'s weak — catch it! [F]', '#7ef76a');
        }
        return;
      }
    }
  }
  e.hp -= dmg;
  showDamage(scene, e.x, e.y - e.body.halfHeight - 4, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffd95e' : '#ffffff');
  e.setTintFill(0xffffff);
  e.flashT = 0.07;
  if (kbx || kby) {
    e.kbT = 0.13;
    e.body.setVelocity(kbx, kby);
  }
  SFX.hit();
  if (e.hp <= 0) killEnemy(scene, e);
}

function explode(scene, x, y, radius, dmg, opts = {}) {
  const ring = scene.add.image(x, y, 'ring').setDepth(15).setScale(radius / 48);
  const flash = scene.add.image(x, y, 'glow').setDepth(14).setScale(radius / 40).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: ring, scale: ring.scale * 1.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
  scene.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });
  for (let i = 0; i < 10; i++) {
    const p = scene.add.image(x, y, 'px').setDepth(15).setTint(i % 2 ? 0xffb020 : 0xff5a10).setScale(1.5);
    const a = Math.random() * Math.PI * 2, d = radius * (0.4 + Math.random() * 0.6);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 320, onComplete: () => p.destroy() });
  }
  scene.cameras.main.shake(160, 0.006);
  SFX.explode();

  if (opts.friendly) {
    for (const e of scene.enemies.getChildren()) {
      if (!e.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < radius + e.body.halfWidth) {
        const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
        damageEnemy(scene, e, dmg, Math.cos(a) * 240, Math.sin(a) * 240);
      }
    }
    // blast-mining: damages natural blocks your pickaxe could mine (never your own walls)
    const tx0 = Math.floor((x - radius) / TILE), tx1 = Math.floor((x + radius) / TILE);
    const ty0 = Math.floor((y - radius) / TILE), ty1 = Math.floor((y + radius) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = scene.blockLayer.getTileAt(tx, ty);
        if (!tile || isWallTile(tile.index)) continue;
        const bi = BLOCK_INFO[tile.index];
        if (!bi || bi.tier > scene.state.flags.pickTier) continue;
        const k = tx + ',' + ty;
        scene.blockHP[k] -= dmg;
        if (scene.blockHP[k] <= 0) {
          const bx = tile.getCenterX(), by = tile.getCenterY();
          const idx = destroyBlockTile(scene, tx, ty);
          if (idx >= 0) {
            dropResources(scene, bx, by, BLOCK_INFO[idx].drops);
            if (idx === T.TREE && Math.random() < APPLE_CHANCE) dropApple(scene, bx, by);
            gainXP(scene, BLOCK_INFO[idx].xp || 0);
            gainSkill(scene, 'mining', (BLOCK_INFO[idx].xp || 1) * 2);
          }
        } else {
          scene.damagedBlocks.add(k);
        }
      }
    }
  } else {
    // hostile explosion (creeper): hits player, structures and tiles
    const pd = Phaser.Math.Distance.Between(x, y, scene.player.x, scene.player.y);
    if (pd < radius + 12) hurtPlayer(scene, dmg);
    for (const t of scene.turrets.getChildren()) {
      if (t.active && Phaser.Math.Distance.Between(x, y, t.x, t.y) < radius + 16) damageTurret(scene, t, dmg * 2);
    }
    const tx0 = Math.floor((x - radius) / TILE), tx1 = Math.floor((x + radius) / TILE);
    const ty0 = Math.floor((y - radius) / TILE), ty1 = Math.floor((y + radius) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = scene.blockLayer.getTileAt(tx, ty);
        if (!tile || tile.index === T.BEDROCK || tile.index === T.OBSIDIANWALL) continue; // blast-proof
        const k = tx + ',' + ty;
        scene.blockHP[k] = (scene.blockHP[k] || 50) - dmg * 2;
        if (scene.blockHP[k] <= 0) destroyBlockTile(scene, tx, ty);
        else scene.damagedBlocks.add(k);
      }
    }
  }
}

// ---------- floating damage numbers ----------
function showDamage(scene, x, y, text, color) {
  if (typeof SETTINGS !== 'undefined' && !SETTINGS.floatText) return;
  const t = scene.dmgTextPool.length ? scene.dmgTextPool.pop()
    : scene.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '10px', stroke: '#000', strokeThickness: 3 }).setDepth(25).setOrigin(0.5);
  t.setText('' + text).setColor(color).setPosition(x + (Math.random() - 0.5) * 10, y).setAlpha(1).setActive(true).setVisible(true);
  scene.tweens.add({
    targets: t, y: y - 26, alpha: 0, duration: 600, ease: 'Quad.Out',
    onComplete: () => { t.setVisible(false); scene.dmgTextPool.push(t); },
  });
}
