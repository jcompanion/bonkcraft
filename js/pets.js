// ---------- wild critter encounters & pet followers ----------
// Walk through tall grass → "A WILD X APPEARED!" → it fights you (your weapons
// fight back automatically) → throw a Catch Orb [F]. Lower HP = better odds.
// Caught critters follow you forever: fighters brawl, beavers chop, golems mine.

function pickWildSpecies(scene) {
  // legendaries lurk more boldly at night
  const legChance = 0.025 + (scene.state.isNight ? 0.025 : 0);
  const r = Math.random();
  if (r < legChance) return LEGENDARY_WILDS[Math.floor(Math.random() * LEGENDARY_WILDS.length)];
  if (r < legChance + 0.15) return RARE_WILDS[Math.floor(Math.random() * RARE_WILDS.length)];
  const r2 = Math.random();
  let acc = 0;
  for (const [sp, w] of WILD_WEIGHTS) {
    acc += w;
    if (r2 < acc) return sp;
  }
  return 'wolf';
}

function updateEncounters(scene, dt) {
  const st = scene.state;
  if (st.onFloor2) return; // no rustling up on the balcony
  st.encounterCd = Math.max(0, (st.encounterCd || 0) - dt);

  // manage current wild critter
  if (scene.wildCritter && (!scene.wildCritter.active || scene.wildCritter.dying)) scene.wildCritter = null;
  if (scene.wildCritter) {
    const w = scene.wildCritter;
    w.wildT -= dt;
    // nudge: it's weak — now's the moment
    w.orbHintT = (w.orbHintT || 0) - dt;
    if (w.hp < w.maxHp * 0.4 && w.orbHintT <= 0 && !w.catchLock) {
      w.orbHintT = 2.2;
      showDamage(scene, w.x, w.y - 24, 'throw an orb! [F]', '#ffd95e');
    }
    if (w.wildT <= 0) {
      w.dying = true;
      w.body.enable = false;
      scene.tweens.add({ targets: w, alpha: 0, duration: 600, onComplete: () => w.setActive(false).setVisible(false).setAlpha(1) });
      scene.wildCritter = null;
      showBanner('💨 it wandered off...', 'critters don\'t wait around forever');
    } else if (w.wildT < 6 && !w.leaveWarned) {
      w.leaveWarned = true;
      showDamage(scene, w.x, w.y - 22, 'getting bored...', '#aab4c8');
    }
    return;
  }
  if (st.encounterCd > 0) return;

  // standing in tall grass?
  const tile = scene.blockLayer.getTileAt(Math.floor(scene.player.x / TILE), Math.floor(scene.player.y / TILE));
  if (!tile || tile.index !== T.TALLGRASS) { st.grassT = 0; return; }
  st.grassT = (st.grassT || 0) + dt;
  if (st.grassT < 0.8) return;
  st.grassT = 0;
  if (Math.random() > ENCOUNTER_CHANCE) return;

  // encounter!
  const sp = pickWildSpecies(scene);
  const def = PETS[sp];
  const a = Math.random() * Math.PI * 2;
  const wx = scene.player.x + Math.cos(a) * 70;
  const wy = scene.player.y + Math.sin(a) * 70;
  const w = spawnEnemy(scene, 'wild_' + sp, wx, wy);
  if (!w) return;
  w.wildT = def.rarity === 3 ? WILD_LIFETIME + 12 : WILD_LIFETIME;
  w.leaveWarned = false;
  scene.wildCritter = w;
  st.encounterCd = ENCOUNTER_CD;

  // rustle + drama (scaled to rarity)
  for (let i = 0; i < 8 + def.rarity * 4; i++) {
    const px = scene.add.image(wx + (Math.random() - 0.5) * 24, wy + (Math.random() - 0.5) * 24, 'px')
      .setDepth(15).setTint(def.rarity === 3 ? 0xffd040 : def.rarity === 2 ? 0xb08ae8 : 0x54b438);
    scene.tweens.add({ targets: px, y: px.y - 14 - def.rarity * 6, alpha: 0, duration: 400 + def.rarity * 100, onComplete: () => px.destroy() });
  }
  showDamage(scene, wx, wy - 26, '❗', '#ffd95e');
  if (def.rarity === 3) {
    showBanner(`🌟 A LEGENDARY ${def.name.toUpperCase()} APPEARED!! 🌟`, `catch odds are slim — bring every orb you have!`);
    scene.cameras.main.shake(350, 0.008);
    SFX.boss();
    pushAction(scene, 0.4, () => SFX.boss());
  } else if (def.rarity === 2) {
    showBanner(`✨ A RARE ${def.name.toUpperCase()} APPEARED! ✨`, `weaken it, then throw a Catch Orb [F] · it ${PET_ROLES[def.role]}`);
    SFX.boss();
  } else {
    showBanner(`A WILD ${def.name.toUpperCase()} APPEARED!`, `weaken it, then throw a Catch Orb [F] · it ${PET_ROLES[def.role]}`);
    SFX.boss();
  }
}

// ---------- catching ----------
function throwOrb(scene) {
  const st = scene.state;
  if (st.gameOver || st.paused || anyModalOpen()) return;
  if (!st.stock.catchOrb) { showBanner('🔴 no Catch Orbs', 'craft them at the bench [C]'); return; }

  let wild = null, bd = 150;
  for (const e of scene.enemies.getChildren()) {
    if (!e.active || e.dying || !e.info.wild) continue;
    const d = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, e.x, e.y);
    if (d < bd) { bd = d; wild = e; }
  }
  if (!wild) { showBanner('🔴 no wild critter in range', 'find one rustling in tall grass'); return; }
  // full party? no problem — caught critters overflow into the box

  st.stock.catchOrb--;
  refreshHotbar(scene);
  wild.catchLock = true; // your own weapons can't snipe it mid-catch

  const orb = scene.add.image(scene.player.x, scene.player.y - 10, 'orb').setDepth(15);
  scene.tweens.add({
    targets: orb, x: wild.x, y: wild.y - 6, duration: 380, ease: 'Quad.Out',
    onUpdate: tw => { orb.angle += 14; orb.setScale(1 + Math.sin(tw.progress * Math.PI) * 0.5); },
  });
  SFX.shoot();

  pushAction(scene, 0.4, () => {
    orb.destroy();
    if (!wild.active || wild.dying) { showBanner('🔴 too late', 'it was already gone'); return; }
    const chance = 0.30 + 0.60 * (1 - Math.max(0, wild.hp) / wild.maxHp);
    // wobble suspense
    wild.setTintFill(0xffffff);
    scene.tweens.add({ targets: wild, angle: 12, duration: 90, yoyo: true, repeat: 3, onComplete: () => { if (wild.active) { wild.setAngle(0); wild.clearTint(); } } });
    pushAction(scene, 0.5, () => {
      if (!wild.active || wild.dying) return;
      const tameBonus = 0.01 * (((scene.state.skills.taming || { lvl: 1 }).lvl) - 1);
      if (Math.random() < Math.min(0.95, chance * RARITY[PETS[wild.info.wild].rarity].catchMult + tameBonus)) {
        const sp = wild.info.wild;
        wild.dying = true;
        wild.body.enable = false;
        wild.setActive(false).setVisible(false);
        if (scene.wildCritter === wild) scene.wildCritter = null;
        const ring = scene.add.image(wild.x, wild.y, 'ring').setDepth(15).setScale(0.5).setTint(0xffd95e);
        scene.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
        // the party won the battle — XP for everyone who was in it
        gainSkill(scene, 'taming', 12);
        for (const pet of scene.pets) if (!pet.fainted) petGainXP(scene, pet, 3);
        const rarityTag = PETS[sp].rarity > 1 ? RARITY[PETS[sp].rarity].name + ' ' : '';
        logEvent(scene, `${PETS[sp].icon} caught a ${rarityTag}${PETS[sp].name}!`, PETS[sp].rarity > 1);
        if (scene.pets.length >= petCap(scene)) {
          scene.state.box.push({ sp, lvl: 1, xp: 0 });
          showBanner(`${PETS[sp].icon} ${rarityTag}${PETS[sp].name.toUpperCase()} CAUGHT!`, 'party full — sent to your critter box 🎒 [B]');
        } else {
          addPet(scene, sp);
          showBanner(`${PETS[sp].icon} ${rarityTag}${PETS[sp].name.toUpperCase()} JOINED YOUR PARTY!`, `it ${PET_ROLES[PETS[sp].role]}`);
        }
        if (PETS[sp].rarity === 3) scene.cameras.main.shake(300, 0.008);
        queueSave(scene);
        SFX.levelup();
      } else {
        wild.catchLock = false;
        const realOdds = Math.round(chance * RARITY[PETS[wild.info.wild].rarity].catchMult * 100);
        showBanner('💢 IT BROKE FREE!', `${realOdds}% odds — ${PETS[wild.info.wild].rarity > 1 ? 'rare critters resist harder. keep throwing!' : 'weaken it more'}`);
        wild.kbT = 0;
        SFX.hurt();
      }
    });
  });
}

// ---------- pet followers ----------
function petMaxHp(pet) {
  return Math.round(pet.def.hp * (1 + 0.12 * (pet.lvl - 1)));
}

// can the party fight a wild critter for you?
function petsCanBattle(scene) {
  return scene.pets && scene.pets.some(p => !p.fainted);
}

function addPet(scene, sp, lvl = 1, xp = 0) {
  const def = PETS[sp];
  const s = scene.add.image(scene.player.x, scene.player.y + 20, def.tex).setDepth(5);
  s.sp = sp;
  s.def = def;
  s.lvl = lvl;
  s.xp = xp;
  s.atkT = 0;
  s.workT = 0;
  s.hurtCd = 0;
  s.flashT = 0;
  s.fainted = false;
  s.bobT = Math.random() * 6;
  s.hp = petMaxHp(s);
  s.rebirthUsed = false;
  s.stay = !scene.pets.some(p => p.stay); // first critter becomes the guard
  if (def.rarity === 3) {
    s.aura = scene.add.image(s.x, s.y, 'glow').setDepth(4)
      .setScale(1.1).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(def.slow ? 0x9ad8ff : 0xffb040).setAlpha(0.22);
  }
  scene.pets.push(s);
  updatePartyHUD(scene);
  return s;
}

function removePetSprite(scene, pet) {
  if (pet.aura) pet.aura.destroy();
  pet.destroy();
}

function petGainXP(scene, pet, amount) {
  pet.xp += amount;
  const need = 8 + pet.lvl * 6;
  if (pet.xp >= need) {
    pet.xp -= need;
    pet.lvl++;
    pet.hp = petMaxHp(pet); // level-ups fully heal, Pokémon style
    showDamage(scene, pet.x, pet.y - 20, 'LEVEL UP!', '#ffd95e');
    const ring = scene.add.image(pet.x, pet.y, 'ring').setDepth(15).setScale(0.4).setTint(0xffd95e);
    scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    SFX.levelup();
    updatePartyHUD(scene);
  }
}

function damagePet(scene, pet, dmg) {
  if (pet.fainted) return;
  pet.hp -= dmg;
  pet.setTintFill(0xffffff);
  pet.flashT = 0.08;
  showDamage(scene, pet.x, pet.y - 14, Math.round(dmg), '#ff9a9a');
  if (pet.hp <= 0) faintPet(scene, pet);
  else updatePartyHUD(scene);
}

function faintPet(scene, pet) {
  // phoenix gimmick: once per day it erupts back to life instead of fainting
  if (pet.def.rebirth && !pet.rebirthUsed) {
    pet.rebirthUsed = true;
    pet.hp = petMaxHp(pet);
    const flare = scene.add.image(pet.x, pet.y, 'glow').setDepth(15).setScale(1.6).setTint(0xff8a20).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: flare, scale: 2.4, alpha: 0, duration: 500, onComplete: () => flare.destroy() });
    for (let i = 0; i < 12; i++) {
      const px = scene.add.image(pet.x, pet.y, 'px').setDepth(15).setTint(i % 2 ? 0xffd040 : 0xff5a10).setScale(1.5);
      const fa = Math.random() * Math.PI * 2;
      scene.tweens.add({ targets: px, x: pet.x + Math.cos(fa) * 50, y: pet.y + Math.sin(fa) * 50 - 20, alpha: 0, duration: 450, onComplete: () => px.destroy() });
    }
    showBanner('🔥 PHOENIX REBIRTH!', 'risen from the ashes — once per day');
    SFX.levelup();
    updatePartyHUD(scene);
    return;
  }
  logEvent(scene, `💫 ${pet.def.name} fainted!`);
  pet.fainted = true;
  pet.hp = 0;
  pet.workTile = null;
  pet.clearTint();
  pet.setAlpha(0.4).setAngle(90);
  showBanner(`💫 ${pet.def.icon} ${pet.def.name.toUpperCase()} FAINTED!`, 'revives at dawn · rest it by a campfire · or craft a Critter Tonic');
  SFX.hurt();
  updatePartyHUD(scene);
}

function revivePet(scene, pet, frac) {
  pet.fainted = false;
  pet.hp = Math.max(1, Math.round(petMaxHp(pet) * frac));
  pet.setAlpha(1).setAngle(0);
  showDamage(scene, pet.x, pet.y - 18, '✨ revived!', '#7ef76a');
  const ring = scene.add.image(pet.x, pet.y, 'ring').setDepth(15).setScale(0.4).setTint(0x7ef76a);
  scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
  updatePartyHUD(scene);
}

function updatePets(scene, dt) {
  const p = scene.player;

  // recall conditions: a monster near YOU, or your HP under 50% — everyone comes home
  let danger = scene.state.hp < scene.state.maxHp * 0.5;
  if (!danger) {
    for (const e of scene.enemies.getChildren()) {
      if (e.active && !e.dying && !e.info.wild &&
          Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < 280) { danger = true; break; }
    }
  }
  scene._petDanger = danger;

  scene.pets.forEach((pet, i) => {
    const def = pet.def;
    const lvlMul = 1 + 0.15 * (pet.lvl - 1);

    // free-range by day; recalled by night, danger, or low player HP
    const roam = !pet.stay && !scene.state.isNight && !danger && !pet.fainted;
    // leash: roamers range FAR; when recalled they poof straight back to you
    const leash = roam ? 1400 : (danger || scene.state.isNight) ? 320 : 450;
    if (Phaser.Math.Distance.Between(pet.x, pet.y, p.x, p.y) > leash) {
      pet.setPosition(p.x + (Math.random() - 0.5) * 40, p.y + 30);
      pet.workTile = null;
      const poof = scene.add.image(pet.x, pet.y, 'glow').setDepth(11).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: poof, alpha: 0, duration: 300, onComplete: () => poof.destroy() });
    }

    if (pet.flashT > 0) { pet.flashT -= dt; if (pet.flashT <= 0) pet.clearTint(); }
    if (pet.hurtCd > 0) pet.hurtCd -= dt;

    // ring formation — scales from a trio to a full army
    const n = scene.pets.length;
    const ha = (i / Math.max(1, n)) * Math.PI * 2 + 0.7;
    const hr = (n <= 3 ? 34 : 42) + 10 * Math.floor(i / 8);
    const home = { x: p.x + Math.cos(ha) * hr, y: p.y + Math.sin(ha) * hr };

    // fainted: drift along behind you, ghost-like; campfires slowly nurse it back
    if (pet.fainted) {
      pet.setAlpha(0.3 + Math.sin(pet.bobT) * 0.08);
      pet.bobT += dt * 3;
      const fd = Phaser.Math.Distance.Between(pet.x, pet.y, home.x, home.y);
      if (fd > 14) {
        const fa = Phaser.Math.Angle.Between(pet.x, pet.y, home.x, home.y);
        pet.x += Math.cos(fa) * def.speed * 0.45 * dt;
        pet.y += Math.sin(fa) * def.speed * 0.45 * dt;
      }
      for (const t of scene.turrets.getChildren()) {
        if (t.active && t.ttype === 'campfire' && Phaser.Math.Distance.Between(t.x, t.y, pet.x, pet.y) < t.info.range) {
          pet.hp += 5 * dt;
          if (pet.hp >= petMaxHp(pet) * 0.25) revivePet(scene, pet, 0.25);
          break;
        }
      }
      return;
    }

    pet.bobT += dt * 7;
    pet.setScale(1, 1 + Math.sin(pet.bobT) * 0.06);
    if (pet.aura) {
      pet.aura.setPosition(pet.x, pet.y + 4);
      pet.aura.setAlpha(0.16 + Math.sin(pet.bobT * 0.5) * 0.06 + scene.state.darkness * 0.15);
    }
    if (pet.atkT > 0) pet.atkT -= dt;

    let target = home;
    let enemy = null;

    // battle priority: an active wild critter is THE fight — whole party piles in
    const wild = scene.wildCritter;
    if (wild && wild.active && !wild.dying &&
        Phaser.Math.Distance.Between(p.x, p.y, wild.x, wild.y) < 350) {
      enemy = wild;
      target = wild;
    } else if (def.role === 'fighter') {
      // fighters engage near the player — roamers hunt at much longer range
      let bd = roam ? 470 : 230;
      for (const e of scene.enemies.getChildren()) {
        if (!e.active || e.dying || e.info.wild) continue; // pets don't bully potential friends
        const d = Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y);
        if (d < bd) { bd = d; enemy = e; }
      }
      if (enemy) target = enemy;
    }

    // take hits: anything in contact bites back (pets are tough — half damage)
    if (pet.hurtCd <= 0) {
      for (const e of scene.enemies.getChildren()) {
        if (!e.active || e.dying || e.info.exploder) continue;
        if (Phaser.Math.Distance.Between(pet.x, pet.y, e.x, e.y) < 24) {
          pet.hurtCd = 0.7;
          damagePet(scene, pet, e.dmg * 0.5);
          break;
        }
      }
      if (pet.fainted) return; // that hit was the last straw
    }

    // out-of-combat regen
    if (!enemy && pet.hp < petMaxHp(pet)) {
      pet.hp = Math.min(petMaxHp(pet), pet.hp + 2 * dt);
    }

    // workers find a job when the coast is clear.
    // "clear" means no enemy near THE PET — the cave's ambient bats shouldn't
    // freeze the whole mining operation. Night blocks work only on the surface.
    const area2 = currentArea(scene);
    const nightBlock = scene.state.isNight && area2 === 'overworld';
    let petThreat = false;
    if (def.mines) {
      for (const e of scene.enemies.getChildren()) {
        if (!e.active || e.dying || e.info.wild) continue;
        if (e.fromCave) continue; // cave bats are a nuisance, not a work stoppage
        if (Phaser.Math.Distance.Between(pet.x, pet.y, e.x, e.y) < 180) { petThreat = true; break; }
      }
    }
    if (!enemy && def.mines && !nightBlock && !petThreat) {
      pet.workT -= dt;
      if (!pet.workTile || !scene.blockLayer.getTileAt(pet.workTile.x, pet.workTile.y)) {
        pet.workTile = findPetWork(scene, pet, roam);
      }
      if (pet.workTile) {
        target = { x: pet.workTile.x * TILE + 16, y: pet.workTile.y * TILE + 16 };
      }
    } else {
      pet.workTile = null;
    }

    // nothing to do? roamers wander off with purpose, prospecting new ground
    if (roam && !enemy && !pet.workTile && target === home) {
      pet.wanderT = (pet.wanderT || 0) - dt;
      const stale = pet.wanderPt && Phaser.Math.Distance.Between(pet.x, pet.y, pet.wanderPt.x, pet.wanderPt.y) > 450;
      if (pet.wanderT <= 0 || !pet.wanderPt || stale) {
        pet.wanderT = 2.5 + Math.random() * 3;
        const wa = Math.random() * Math.PI * 2;
        // wander from where THEY are; drift back toward you if straying too far
        const tooFar = Phaser.Math.Distance.Between(pet.x, pet.y, p.x, p.y) > 900;
        const cx2 = tooFar ? p.x : pet.x, cy2 = tooFar ? p.y : pet.y;
        pet.wanderPt = { x: cx2 + Math.cos(wa) * (150 + Math.random() * 220), y: cy2 + Math.sin(wa) * (150 + Math.random() * 220) };
      }
      target = pet.wanderPt;
    } else {
      pet.wanderPt = null;
    }

    // move (pets are nimble spirits — no collision, never stuck)
    const dist = Phaser.Math.Distance.Between(pet.x, pet.y, target.x, target.y);
    if (dist > 10) {
      const ang = Phaser.Math.Angle.Between(pet.x, pet.y, target.x, target.y);
      const spd = def.speed * Math.min(1, dist / 60 + 0.4);
      pet.x += Math.cos(ang) * spd * dt;
      pet.y += Math.sin(ang) * spd * dt;
      pet.setFlipX(Math.cos(ang) < 0);
    }

    // fight — pet damage rides the night curve so they stay relevant late game
    if (enemy && Phaser.Math.Distance.Between(pet.x, pet.y, enemy.x, enemy.y) < 26 && pet.atkT <= 0) {
      pet.atkT = def.atkCd;
      const wasDying = enemy.dying;
      const nightMul = 1 + 0.13 * Math.max(0, scene.state.night - 1);
      const combatMul = 1 + 0.01 * (((scene.state.skills.combat || { lvl: 1 }).lvl) - 1);
      const tameMul = 1 + 0.02 * (((scene.state.skills.taming || { lvl: 1 }).lvl) - 1);
      const ea = Phaser.Math.Angle.Between(pet.x, pet.y, enemy.x, enemy.y);
      damageEnemy(scene, enemy, def.dmg * lvlMul * nightMul * combatMul * tameMul, Math.cos(ea) * 120, Math.sin(ea) * 120, 'pet');
      // dragon: fire splash scorches the whole cluster
      if (def.splash && !enemy.info.wild) {
        const flare = scene.add.image(enemy.x, enemy.y, 'glow').setDepth(14).setScale(def.splash / 50).setTint(0xff8a20).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: flare, alpha: 0, duration: 250, onComplete: () => flare.destroy() });
        for (const e2 of scene.enemies.getChildren()) {
          if (!e2.active || e2.dying || e2 === enemy || e2.info.wild) continue;
          if (Phaser.Math.Distance.Between(enemy.x, enemy.y, e2.x, e2.y) < def.splash) {
            damageEnemy(scene, e2, def.dmg * lvlMul * nightMul * 0.6, 0, 0, 'pet');
          }
        }
      }
      // yeti: chilling blows slow whatever survives
      if (def.slow && enemy.active && !enemy.dying) {
        enemy.slowT = 2.2;
        showDamage(scene, enemy.x, enemy.y - 16, '❄', '#9ad8ff');
      }
      if (enemy.info && enemy.info.wild) petGainXP(scene, pet, 1); // battle training
      if (enemy.dying && !wasDying) { petGainXP(scene, pet, 2); gainSkill(scene, 'taming', 1); }
    }

    // work
    if (!enemy && pet.workTile && Phaser.Math.Distance.Between(pet.x, pet.y, pet.workTile.x * TILE + 16, pet.workTile.y * TILE + 16) < 30 && pet.workT <= 0) {
      pet.workT = 0.6;
      const k = pet.workTile.x + ',' + pet.workTile.y;
      const tile = scene.blockLayer.getTileAt(pet.workTile.x, pet.workTile.y);
      if (!tile || !(k in scene.blockHP)) { pet.workTile = null; return; }
      const toolMul = 1 + 0.25 * scene.state.flags.pickTier; // better pickaxe, harder workers
      scene.blockHP[k] -= def.mineDps * lvlMul * toolMul * 0.6;
      scene.damagedBlocks.add(k);
      pet.setAngle((Math.random() - 0.5) * 14);
      pushAction(scene, 0.1, () => pet.setAngle(0));
      if (scene.blockHP[k] <= 0) {
        const bx = tile.getCenterX(), by = tile.getCenterY();
        const idx = destroyBlockTile(scene, pet.workTile.x, pet.workTile.y);
        if (idx >= 0) {
          dropResources(scene, bx, by, BLOCK_INFO[idx].drops);
          logRes(scene, 'pet_' + pet.sp, pet.def.icon + ' ' + pet.def.name, BLOCK_INFO[idx].drops);
          if (idx === T.TREE && Math.random() < APPLE_CHANCE) dropApple(scene, bx, by);
          gainXP(scene, BLOCK_INFO[idx].xp || 0);
          petGainXP(scene, pet, 1);
        }
        pet.workTile = null;
      }
    }
  });
}

// nearest matching block within working range of the player
function findPetWork(scene, pet, roam) {
  // roamers search wide around THEMSELVES (leashed to the player);
  // the guard searches tight around the player
  const def = pet.def;
  const ctx = Math.floor((roam ? pet.x : scene.player.x) / TILE);
  const cty = Math.floor((roam ? pet.y : scene.player.y) / TILE);
  const R = roam ? 12 : 5;
  const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);
  let best = null, bd = (R + 1) * (R + 1);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const tx = ctx + dx, ty = cty + dy;
      const tile = scene.blockLayer.getTileAt(tx, ty);
      if (!tile) continue;
      const idx = tile.index;
      const isTree = idx === T.TREE;
      const isRock = idx >= T.STONE && idx <= T.DIAMOND;
      const wants = def.mines === 'any' ? (isTree || isRock) : (def.mines === 'tree' ? isTree : isRock);
      if (!wants) continue;
      if (BLOCK_INFO[idx].tier > scene.state.flags.pickTier) continue; // your pickaxe gates their work too
      if (roam && Math.hypot(tx - ptx, ty - pty) > 40) continue; // stay on (a very long) leash
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = { x: tx, y: ty }; }
    }
  }
  return best;
}

// ---------- army size (coin-bought slots) ----------
function petCap(scene) {
  return scene.state.petCap || BASE_PET_CAP;
}

function slotCost(scene) {
  return Math.round(PET_SLOT_BASE_COST * Math.pow(PET_SLOT_COST_MULT, petCap(scene) - BASE_PET_CAP));
}

function buyPetSlot(scene) {
  const st = scene.state;
  if (petCap(scene) >= MAX_PETS) { showBanner('🎖️ MAX ARMY SIZE', `${MAX_PETS} critters is plenty of chaos`); return; }
  const cost = slotCost(scene);
  if (st.coins < cost) { showBanner('🪙 not enough coins', `next slot costs ${cost}`); return; }
  st.coins -= cost;
  st.petCap = petCap(scene) + 1;
  showBanner('🎖️ ARMY EXPANDED!', `you can now field ${st.petCap} critters`);
  SFX.levelup();
  renderBoxModal(scene);
  updatePartyHUD(scene);
  updateHUD(scene);
}

// ---------- party HUD ----------
function updatePartyHUD(scene) {
  const el = $('party');
  const chips = scene.pets.map(p => {
    const max = petMaxHp(p);
    const pct = Math.max(0, Math.min(100, Math.round((p.hp / max) * 100)));
    return `<span class="pet-chip${p.fainted ? ' fainted' : ''}" style="border-color:${RARITY[p.def.rarity].color}">${p.stay ? '⭐' : ''}${p.fainted ? '💫' : p.def.icon} <b>Lv${p.lvl}</b>` +
      `<span class="php"><span style="width:${p.fainted ? 0 : pct}%"></span></span></span>`;
  }).join('');
  const boxChip = `<span class="pet-chip" style="border-color:#8a6d3a">🎒${scene.state.box.length ? ' ' + scene.state.box.length : ''}</span>`;
  el.innerHTML = chips + boxChip;
  el.onclick = () => toggleBoxModal(scene);
}

// ---------- party & box management modal [B] ----------
function toggleBoxModal(scene) {
  const open = $('modal-box').classList.contains('open');
  if (open) {
    setModal('modal-box', false);
    scene.setPaused(false);
  } else if (!anyModalOpen() && !scene.state.gameOver) {
    renderBoxModal(scene);
    setModal('modal-box', true);
    scene.setPaused(true);
  }
}

function renderBoxModal(scene) {
  const st = scene.state;
  const pl = $('party-list');
  pl.innerHTML = '';

  // army size + expansion
  const cap = document.createElement('div');
  cap.className = 'recipe';
  const maxed = petCap(scene) >= MAX_PETS;
  cap.innerHTML = `<div class="icon">🎖️</div><div class="info">` +
    `<div class="rname">ARMY SIZE: ${scene.pets.length}/${petCap(scene)}</div>` +
    `<div class="rdesc">buy slots to field a bigger army — each costs more than the last</div>` +
    `<div class="cost">${maxed ? '<span class="ok">MAXED</span>' : `<span class="${st.coins >= slotCost(scene) ? 'ok' : 'no'}">${slotCost(scene)} 🪙</span>`}</div></div>` +
    `<button ${maxed || st.coins < slotCost(scene) ? 'disabled' : ''}>+1 SLOT</button>`;
  const capBtn = cap.querySelector('button');
  if (!capBtn.disabled) capBtn.onclick = () => buyPetSlot(scene);
  pl.appendChild(cap);

  scene.pets.forEach((p2, i) => {
    const div = document.createElement('div');
    div.className = 'recipe';
    const rtag = p2.def.rarity > 1 ? ` <span style="color:${RARITY[p2.def.rarity].color}">${RARITY[p2.def.rarity].name}</span>` : '';
    div.innerHTML = `<div class="icon">${p2.fainted ? '💫' : p2.def.icon}</div>` +
      `<div class="info"><div class="rname">${p2.stay ? '⭐ ' : ''}${p2.def.name} Lv${p2.lvl}${rtag}</div>` +
      `<div class="rdesc">${PET_ROLES[p2.def.role]} · ${p2.fainted ? 'fainted' : Math.round(p2.hp) + '/' + petMaxHp(p2) + ' hp'}</div></div>` +
      `<button data-a="guard" title="make this the guard">⭐</button><button data-a="box" class="alt">BOX</button>`;
    div.querySelector('[data-a=guard]').onclick = () => {
      scene.pets.forEach(q => { q.stay = false; });
      p2.stay = true;
      renderBoxModal(scene);
      updatePartyHUD(scene);
    };
    div.querySelector('[data-a=box]').onclick = () => sendToBox(scene, i);
    pl.appendChild(div);
  });

  $('box-head').textContent = `IN THE BOX (${st.box.length})`;
  const bl = $('box-list');
  bl.innerHTML = st.box.length ? '' : '<div style="font-size:8px;color:#8fa3c8;padding:6px">empty — catch more critters in tall grass!</div>';
  st.box.forEach((bd, i) => {
    const div = document.createElement('div');
    div.className = 'recipe';
    const brtag = PETS[bd.sp].rarity > 1 ? ` <span style="color:${RARITY[PETS[bd.sp].rarity].color}">${RARITY[PETS[bd.sp].rarity].name}</span>` : '';
    div.innerHTML = `<div class="icon">${PETS[bd.sp].icon}</div>` +
      `<div class="info"><div class="rname">${PETS[bd.sp].name} Lv${bd.lvl}${brtag}</div>` +
      `<div class="rdesc">${PET_ROLES[PETS[bd.sp].role]} · rested &amp; fully healed</div></div>` +
      `<button ${scene.pets.length >= petCap(scene) ? 'disabled' : ''}>JOIN PARTY</button>`;
    const b = div.querySelector('button');
    if (!b.disabled) b.onclick = () => takeFromBox(scene, i);
    bl.appendChild(div);
  });
}

function sendToBox(scene, i) {
  const p2 = scene.pets[i];
  scene.state.box.push({ sp: p2.sp, lvl: p2.lvl, xp: p2.xp });
  removePetSprite(scene, p2);
  scene.pets.splice(i, 1);
  if (!scene.pets.some(q => q.stay) && scene.pets.length) scene.pets[0].stay = true;
  queueSave(scene);
  renderBoxModal(scene);
  updatePartyHUD(scene);
}

function takeFromBox(scene, i) {
  if (scene.pets.length >= petCap(scene)) return;
  const bd = scene.state.box.splice(i, 1)[0];
  addPet(scene, bd.sp, bd.lvl, bd.xp); // comes out of the box fully rested
  queueSave(scene);
  renderBoxModal(scene);
  updatePartyHUD(scene);
}
