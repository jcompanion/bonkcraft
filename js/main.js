// ---------- main scene: game loop, player, day/night, collisions ----------

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    window.gameScene = this;
    this.physics.world.resume();
    this.tweens.killAll();
    this.input.mouse.disableContextMenu();

    this.loadData = window.PENDING_LOAD || null;
    window.PENDING_LOAD = null;

    this.state = this.freshState();
    this.actionQueue = [];
    this.dmgTextPool = [];
    this.orbitBlades = [];
    this.turretGrid = {};
    this.stairSlots = [null, null, null, null];
    this.trapList = [];
    this.dens = [];
    this.pets = [];
    this.wildCritter = null;
    this.bobber = null;
    this.bossBar = null;
    this.ghost = null;
    this.grave = null;
    this.graveRes = null;
    this.hudT = 0;
    this.saveQueuedT = 0;
    this.mist = null;          // floor-2 haze (display objects die on restart;
    this.deckImgs = null;      //  these refs must die with them)
    this.placeDrag = null;
    this._lastDeckPos = null;
    this.stairArm = true;
    this.warpCd = 0;

    // last line of defense: save when the tab closes
    if (!window._unloadHook) {
      window._unloadHook = true;
      window.addEventListener('beforeunload', () => {
        const s = window.gameScene;
        if (s && s.state && !s.state.gameOver) saveGame(s);
      });
    }

    makeAllTextures(this);
    buildWorld(this);

    // ---- player ----
    const cx = MAP_W * TILE / 2, cy = MAP_H * TILE / 2;
    this.player = this.physics.add.sprite(cx, cy, 'player').setDepth(5);
    this.player.body.setSize(16, 12);
    this.player.body.setOffset(2, 16);
    this.player.setCollideWorldBounds(true);
    this.player.invulnT = 0;
    this.playerGlow = this.add.image(cx, cy, 'glow').setDepth(11).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.nameTag = this.add.text(cx, cy - 20, SETTINGS.avatar.name, {
      fontFamily: '"Press Start 2P", monospace', fontSize: '8px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(6).setVisible(!!SETTINGS.avatar.name);

    this.physics.world.setBounds(0, 0, MAP_W * TILE, GRID_H * TILE);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // ---- groups ----
    this.enemies = this.physics.add.group({ maxSize: 200 });
    this.friendlyProj = this.physics.add.group({ maxSize: 150 });
    this.enemyProj = this.physics.add.group({ maxSize: 80 });
    this.pickups = this.physics.add.group({ maxSize: 500 });
    this.turrets = this.physics.add.group({ maxSize: -1 }); // no structure limit — build your empire

    // ---- night overlay + bars gfx ----
    this.nightRect = this.add.rectangle(0, 0, 10, 10, 0x0a1030).setOrigin(0).setScrollFactor(0).setDepth(10).setAlpha(0);
    this.gfx = this.add.graphics().setDepth(24);

    // ---- collisions ----
    // you phase through your own walls (enemies still can't — they have to chew)
    this.physics.add.collider(this.player, this.blockLayer, null, (p, tile) => !isWallTile(tile.index));
    this.physics.add.collider(this.player, this.groundLayer);
    // (no player↔turret collider — you walk through your own beds & turrets)
    this.physics.add.collider(this.enemies, this.blockLayer, (e, tile) => enemyHitBlock(this, e, tile));
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.enemies, this.turrets, (e, t) => {
      // collider arg order isn't guaranteed — sort it out
      const enemy = e.etype ? e : t, turret = e.etype ? t : e;
      if (enemy.attackCd > 0 || enemy.dying) return;
      if (isTurretElevated(this, turret)) return; // the wall underneath soaks the hits
      enemy.attackCd = 0.8;
      damageTurret(this, turret, enemy.dmg);
    });
    this.physics.add.overlap(this.player, this.enemies, (p, e) => {
      if (this.state.onFloor2) return; // they can't reach the balcony
      if (!e.active || e.dying || e.info.exploder) return;
      if (e.touchCd > 0) return;
      e.touchCd = 0.8;
      hurtPlayer(this, e.dmg);
    });
    this.physics.add.overlap(this.friendlyProj, this.enemies, (proj, e) => {
      if (!proj.active || !e.active || e.dying) return;
      const a = proj.body.velocity.angle();
      damageEnemy(this, e, proj.dmg, Math.cos(a) * 120, Math.sin(a) * 120);
      if (proj.slows && e.active && !e.dying) {
        e.slowT = Math.max(e.slowT || 0, proj.slows);
        showDamage(this, e.x, e.y - 14, '❄', '#9ad8ff');
      }
      if (proj.pierce > 0) proj.pierce--;
      else killProj(this, proj);
    });
    this.physics.add.collider(this.friendlyProj, this.blockLayer, proj => {
      if (proj.pierce < 50) killProj(this, proj); // lobbed axes fly over blocks
    }, (proj, tile) => !isWallTile(tile.index));  // friendly fire sails through your walls
    this.physics.add.collider(this.enemyProj, this.blockLayer, proj => killProj(this, proj));
    this.physics.add.overlap(this.player, this.enemyProj, (p, proj) => {
      if (!proj.active || this.state.onFloor2) return;
      killProj(this, proj);
      hurtPlayer(this, proj.dmg);
    });
    this.physics.add.overlap(this.player, this.pickups, (p, s) => this.collectPickup(s, false));

    // ---- input ----
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SHIFT');
    this.input.keyboard.on('keydown-C', () => {
      if (!this.state.gameOver && !$('modal-levelup').classList.contains('open') && !$('modal-pause').classList.contains('open')) toggleCraft(this);
    });
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.state.gameOver || $('modal-levelup').classList.contains('open') || $('modal-start').classList.contains('open')) return;
      if ($('modal-craft').classList.contains('open')) { toggleCraft(this); return; }
      if ($('modal-settings').classList.contains('open')) { closeSettings(this); return; }
      if ($('modal-box').classList.contains('open')) { toggleBoxModal(this); return; }
      if (this.state.bpCapture) { this.state.bpCapture = false; this.bpDragStart = null; showBanner('\ud83d\udcd0 blueprint mode off', ''); return; }
      if (this.state.placingBp) { cancelBpPlacement(this); return; }
      if (this.state.placing) { cancelPlacement(this); return; }
      this.togglePause();
    });
    this.input.keyboard.on('keydown-M', () => {
      showBanner(SFX.toggleMute() ? '🔇 MUTED' : '🔊 SOUND ON', '');
    });
    this.input.keyboard.on('keydown-E', () => trySleep(this));
    this.input.keyboard.on('keydown-F', () => throwOrb(this));
    this.input.keyboard.on('keydown-B', () => {
      if (!this.state.gameOver) toggleBoxModal(this);
    });
    this.input.keyboard.on('keydown-G', () => toggleBpCapture(this));
    this.input.keyboard.on('keydown-N', () => {
      SETTINGS.minimap = !SETTINGS.minimap;
      saveSettings();
      $('minimap').style.display = SETTINGS.minimap ? '' : 'none';
    });
    this.input.keyboard.on('keydown-NINE', () => drinkPotion(this, 'healthPotion'));
    this.input.keyboard.on('keydown-ZERO', () => drinkPotion(this, 'strengthPotion'));
    const digits = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];
    digits.forEach((d, i) => {
      this.input.keyboard.on('keydown-' + d, () => {
        if (this.state.gameOver || anyModalOpen()) return;
        const id = HOTBAR_ORDER[i];
        if (this.state.placing === id) cancelPlacement(this);
        else enterPlacement(this, id);
      });
    });
    this.input.on('pointerdown', ptr => {
      if (this.state.gameOver || anyModalOpen()) return;
      if (ptr.rightButtonDown()) {
        if (this.state.bpCapture) { this.state.bpCapture = false; this.bpDragStart = null; return; }
        if (this.state.placingBp) { cancelBpPlacement(this); return; }
        if (this.state.placing) { cancelPlacement(this); return; }
        this.tryDismantle(ptr);
        return;
      }
      if (TOUCH_INPUT.dismantle) { this.tryDismantle(ptr); return; } // touch: 🔨 mode replaces right-click
      if (this.state.bpCapture) { this.bpDragStart = { x: ptr.worldX, y: ptr.worldY }; return; }
      if (this.state.placingBp) { stampBlueprint(this); return; }
      if (this.state.placing) {
        // start a placement drag — release to stamp the whole path
        const tx = Math.floor(ptr.worldX / TILE), ty = Math.floor(ptr.worldY / TILE);
        this.placeDrag = { tiles: [tx + ',' + ty], set: new Set([tx + ',' + ty]), last: { tx, ty } };
      }
    });
    this.input.on('pointerup', ptr => {
      if (this.state.bpCapture && this.bpDragStart) {
        finishBpCapture(this, this.bpDragStart.x, this.bpDragStart.y, ptr.worldX, ptr.worldY);
        return;
      }
      if (this.placeDrag) finishPlaceDrag(this);
    });

    // ---- UI ----
    setModal('modal-levelup', false);
    setModal('modal-craft', false);
    setModal('modal-pause', false);
    setModal('modal-gameover', false);
    setModal('modal-start', false);

    // ---- save / load flow ----
    if (this.loadData) {
      applyLoad(this, this.loadData);
      this.loadData = null;
      showBanner(`DAY ${this.state.day}`, 'welcome back — the world remembers');
    } else {
      const existing = readSave();
      if (existing && !window.askedContinue) {
        window.askedContinue = true;
        $('start-stats').innerHTML =
          `found a saved world:<br>DAY ${existing.state.day} · level ${existing.state.level} · ${existing.state.kills} kills` +
          `<br><span style="color:#8fa3c8">saved ${savedAgo(existing.savedAt)}</span>` +
          (existing.grave ? '<br><span style="color:#ff9a3e">⚰️ your gravestone is out there</span>' : '');
        $('start-continue').textContent = `CONTINUE — DAY ${existing.state.day}`;
        setModal('modal-start', true);
        this.setPaused(true);
      } else if (window.PRESTIGE_CARRY) {
        const c = window.PRESTIGE_CARRY;
        window.PRESTIGE_CARRY = null;
        const st2 = this.state;
        st2.prestige = c.prestige;
        st2.skills = c.skills;
        st2.box = c.box;
        st2.petCap = c.petCap;
        st2.blueprints = c.blueprints;
        st2.maxHp = 100 + 20 * c.prestige;
        st2.hp = st2.maxHp;
        for (const pd of c.pets) if (PETS[pd.sp]) addPet(this, pd.sp, pd.lvl, pd.xp);
        saveGame(this);
        showBanner(`✨ PRESTIGE ${c.prestige} ✨`, `+${15 * c.prestige}% damage & XP · +${20 * c.prestige} max HP · a new world trembles`);
        SFX.levelup();
        this.cameras.main.flash(800, 255, 230, 150);
      } else {
        saveGame(this); // fresh world becomes the checkpoint
        showBanner('⛏ BLOCKBONK ⛏', 'mine by walking into blocks · craft turrets before dark');
      }
    }
    // settings: shake gate, minimap visibility, control bindings
    const cam = this.cameras.main;
    const realShake = cam.shake.bind(cam);
    cam.shake = (...a) => (SETTINGS.shake ? realShake(...a) : cam);
    $('minimap').style.display = SETTINGS.minimap ? '' : 'none';
    $('activity-log').style.display = SETTINGS.log ? '' : 'none';
    $('activity-log').innerHTML = '';
    initSettingsUI();

    refreshWeaponList(this);
    refreshHotbar(this);
    updatePartyHUD(this);
    updateHUD(this);
  }

  freshState() {
    return {
      hp: 100, maxHp: 100,
      level: 1, xp: 0, xpNext: 8, pendingLevels: 0,
      res: { wood: 0, stone: 0, iron: 0, gold: 0, diamond: 0 },
      stock: {}, crafted: {}, flags: { pickTier: 0, swordTier: 0 },
      weapons: { sword: 1 }, weaponCd: {}, passives: {}, orbitAngle: 0,
      day: 1, night: 1, isNight: false, phaseT: FIRST_DAY_LEN,
      spawnT: 4, nightBudget: 0,
      kills: 0, darkness: 0,
      coins: 0,
      skills: { mining: { xp: 0, lvl: 1 }, fishing: { xp: 0, lvl: 1 }, combat: { xp: 0, lvl: 1 },
                building: { xp: 0, lvl: 1 }, forging: { xp: 0, lvl: 1 }, taming: { xp: 0, lvl: 1 } },
      prestige: 0,
      box: [], petCap: BASE_PET_CAP,
      harvestedToday: 0,
      blueprints: [], bpCapture: false, placingBp: null,
      dungeonClears: 0, lastClearDay: 0, caveGenDay: -1, arenaT: 0, arenaBosses: 0,
      placing: null, paused: false, gameOver: false,
      mineKey: null, mineT: 0, mineHintT: 0, fishT: 0, biteShown: false,
      encounterCd: 0, grassT: 0,
      buffs: { strength: 0 },
      nightWarn60: false, nightWarn15: false,
      sleeping: false, bedHintT: 0,
      onFloor2: false,
    };
  }

  tryPrestige() {
    const st = this.state;
    if (st.gameOver) return;
    if (st.day < 8) {
      this.togglePause();
      showBanner('✨ ASCENSION LOCKED', `survive to DAY 8 first (you're on day ${st.day})`);
      return;
    }
    if (!this._prestigeArm || Date.now() - this._prestigeArm > 6000) {
      this._prestigeArm = Date.now();
      this.togglePause();
      showBanner('✨ ASCEND? PRESS AGAIN TO CONFIRM', 'keeps: skills · critters · blueprints · prestige power — resets: world, level, gear');
      return;
    }
    // carry the soul, burn the body
    const carry = {
      prestige: (st.prestige || 0) + 1,
      skills: JSON.parse(JSON.stringify(st.skills)),
      pets: this.pets.map(p => ({ sp: p.sp, lvl: p.lvl, xp: p.xp })),
      box: st.box.map(b => ({ ...b })),
      petCap: st.petCap,
      blueprints: st.blueprints.map(b => ({ name: b.name, items: b.items.map(it => ({ ...it })) })),
    };
    clearSave();
    window.PRESTIGE_CARRY = carry;
    window.askedContinue = true;
    this.restartRun();
  }

  saveNow() {
    if (this.state.gameOver) return;
    if (saveGame(this)) showBanner('💾 SAVED', 'autosaves happen every dawn too');
    this.togglePause();
  }

  manualSave() {
    if (this.state.gameOver) return;
    if (saveGame(this)) {
      const save = readSave();
      $('set-saveinfo').textContent = save ? `— day ${save.state.day}, saved ${savedAgo(save.savedAt)}` : '';
      showBanner('💾 SAVED', 'exact time of day captured');
    }
  }

  newWorld() {
    clearSave();
    window.askedContinue = true; // don't re-prompt
    this.restartRun();
  }

  continueFromSave() {
    const d = readSave();
    if (!d) { this.newWorld(); return; }
    window.PENDING_LOAD = d;
    this.restartRun();
  }

  setPaused(on) {
    if (this.state.gameOver) return;
    if (!on && anyModalOpen()) return;
    this.state.paused = on;
    if (on) { this.physics.world.pause(); this.tweens.pauseAll(); }
    else { this.physics.world.resume(); this.tweens.resumeAll(); }
  }

  togglePause() {
    const open = $('modal-pause').classList.contains('open');
    setModal('modal-pause', !open);
    this.setPaused(!open);
  }

  restartRun() {
    setModal('modal-levelup', false);
    setModal('modal-craft', false);
    setModal('modal-pause', false);
    setModal('modal-gameover', false);
    setModal('modal-start', false);
    $('sleep-fade').style.opacity = 0;
    this.scene.restart();
  }

  tryDismantle(ptr) {
    const tx = Math.floor(ptr.worldX / TILE), ty = Math.floor(ptr.worldY / TILE);
    const p = this.player;
    // mounted turret comes off first, then the wall under it
    const t = this.turretGrid[tx + ',' + ty];
    if (t && !t.isDen && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 90) {
      damageTurret(this, t, 99999);
      queueSave(this);
      return;
    }
    const tile = this.blockLayer.getTileAt(tx, ty);
    if (tile && isWallTile(tile.index) &&
        Phaser.Math.Distance.Between(p.x, p.y, tile.getCenterX(), tile.getCenterY()) < 90) {
      const idx = destroyBlockTile(this, tx, ty);
      if (idx >= 0) {
        dropResources(this, tile.getCenterX(), tile.getCenterY(), BLOCK_INFO[idx].drops);
        logRes(this, 'you_salvage', '🔨 you salvaged', BLOCK_INFO[idx].drops);
      }
      queueSave(this);
      return;
    }
    // pull up flooring
    const g2 = this.groundLayer.getTileAt(tx, ty);
    if (g2 && g2.index === T.FLOOR &&
        Phaser.Math.Distance.Between(p.x, p.y, g2.getCenterX(), g2.getCenterY()) < 90) {
      this.groundLayer.putTileAt(T.GRASS, tx, ty);
      dropResources(this, g2.getCenterX(), g2.getCenterY(), { stone: 1 });
      logRes(this, 'you_salvage', '🔨 you salvaged', { stone: 1 });
      queueSave(this);
    }
  }

  update(time, delta) {
    const st = this.state;
    this.nightRect.setSize(this.cameras.main.width, this.cameras.main.height);
    if (st.gameOver) return;
    if (this.saveQueuedT > 0) {
      this.saveQueuedT -= delta / 1000;
      if (this.saveQueuedT <= 0) saveGame(this);
    }
    if (st.paused) { updateHUD(this); return; }
    const dt = Math.min(delta / 1000, 0.05);

    // scheduled actions
    for (let i = this.actionQueue.length - 1; i >= 0; i--) {
      const a = this.actionQueue[i];
      a.t -= dt;
      if (a.t <= 0) { this.actionQueue.splice(i, 1); a.fn(); }
    }

    this.updatePlayer(dt);
    updateFloor2(this, dt);
    checkGates(this, dt);
    this.updateMining(dt);
    this.updateFishing(dt);
    updateWeapons(this, dt);
    updateEnemies(this, dt);
    updateTurrets(this, dt);
    updateTraps(this, dt);
    updateDens(this, dt);
    updatePets(this, dt);
    updateEncounters(this, dt);
    updateSpawner(this, dt);
    this.updatePickups(dt);
    this.updateProjectiles(dt);
    this.updateDayNight(dt);
    updatePlacementGhost(this);
    updatePlaceDrag(this);
    updateBpGhost(this);
    this.updateExtras(dt);
    this.drawBars();

    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; updateHUD(this); }
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT <= 0) { this.miniT = 1.0; updateMinimap(this); }
    this.logT = (this.logT || 0) - dt;
    if (this.logT <= 0) { this.logT = 4.0; flushLog(this); }
  }

  updatePlayer(dt) {
    const k = this.keys, p = this.player, st = this.state;
    let vx = (k.A.isDown || k.LEFT.isDown ? -1 : 0) + (k.D.isDown || k.RIGHT.isDown ? 1 : 0);
    let vy = (k.W.isDown || k.UP.isDown ? -1 : 0) + (k.S.isDown || k.DOWN.isDown ? 1 : 0);
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    if (!vx && !vy && TOUCH_INPUT.active) { vx = TOUCH_INPUT.x; vy = TOUCH_INPUT.y; } // virtual joystick
    const gt = this.groundLayer.getTileAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    const floorMul = gt && gt.index === T.FLOOR ? 1.3 : 1;
    const speed = 170 * (1 + 0.07 * (st.passives.boots || 0)) * (1 + 0.03 * (st.prestige || 0)) * floorMul;
    p.body.setVelocity(vx * speed, vy * speed);
    if (vx) p.setFlipX(vx < 0);

    if (p.invulnT > 0) {
      p.invulnT -= dt;
      p.setAlpha(Math.floor(p.invulnT * 20) % 2 ? 0.4 : 1);
      if (p.invulnT <= 0) p.setAlpha(1);
    }
    // Moss Heart regen
    if (st.passives.regen && st.hp < st.maxHp) {
      st.hp = Math.min(st.maxHp, st.hp + 0.6 * st.passives.regen * dt);
    }
    this.playerGlow.setPosition(p.x, p.y);
    this.playerGlow.setAlpha(st.darkness * 0.55);
    this.nameTag.setPosition(p.x, p.y - 20);
  }

  // auto-mine the nearest block you're standing against.
  // blocks have HP like enemies: each swing is a damage hit, and partial damage
  // is remembered per-tile (and saved) — walk away and come back, it's still chipped.
  updateMining(dt) {
    const st = this.state, p = this.player;
    if (st.onFloor2) { st.mineKey = null; return; } // too high to swing
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    let best = null, bestD = 46, bestTile = null;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = ptx + dx, ty = pty + dy;
        const tile = this.blockLayer.getTileAt(tx, ty);
        if (!tile || !(tile.index in BLOCK_INFO)) continue;
        if (isWallTile(tile.index)) continue; // own walls: right-click to remove
        const d = Phaser.Math.Distance.Between(p.x, p.y, tile.getCenterX(), tile.getCenterY());
        if (d < bestD) { bestD = d; best = tx + ',' + ty; bestTile = tile; }
      }
    }

    if (!best) { st.mineKey = null; return; }
    st.mineKey = best;

    const info = BLOCK_INFO[bestTile.index];
    if (info.tier > st.flags.pickTier) {
      st.mineHintT -= dt;
      if (st.mineHintT <= 0) {
        st.mineHintT = 1.5;
        showDamage(this, bestTile.getCenterX(), bestTile.getCenterY() - 20, 'need ' + PICKAXES[info.tier].name + '!', '#ff6b5e');
      }
      return;
    }

    st.mineT += dt;
    if (st.mineT < 0.35) return;
    st.mineT = 0;

    // swing! dmg preserves overall mine time: maxHP * pickSpeed / baseTime, per second
    const miningBoost = 1 + 0.02 * (st.skills.mining.lvl - 1);
    const dmg = this.blockMaxHP[best] * (PICKAXES[st.flags.pickTier].speed * miningBoost / info.time) * 0.35;
    this.blockHP[best] -= dmg;
    this.damagedBlocks.add(best);
    showDamage(this, bestTile.getCenterX() + (Math.random() - 0.5) * 12, bestTile.getCenterY() - 8, Math.round(dmg), '#c8d0dc');
    spawnDebris(this, bestTile.getCenterX(), bestTile.getCenterY(), bestTile.index);
    SFX.mine();

    if (this.blockHP[best] <= 0) {
      const cxp = bestTile.getCenterX(), cyp = bestTile.getCenterY();
      const idx = destroyBlockTile(this, bestTile.x, bestTile.y);
      if (idx >= 0) {
        dropResources(this, cxp, cyp, BLOCK_INFO[idx].drops);
        logRes(this, 'you_mine', '⛏ you mined', BLOCK_INFO[idx].drops);
        if (idx === T.TREE && Math.random() < APPLE_CHANCE) dropApple(this, cxp, cyp);
        gainXP(this, BLOCK_INFO[idx].xp || 0);
        gainSkill(this, 'mining', (BLOCK_INFO[idx].xp || 1) * 2);
      }
      st.mineKey = null;
    }
  }

  // RuneScape says hi: stand next to water and you'll fish automatically
  updateFishing(dt) {
    const st = this.state, p = this.player;
    if (st.onFloor2) { this.hideBobber(); return; }
    if (st.mineKey) { st.fishT = Math.max(0, st.fishT - dt); this.hideBobber(); return; } // mining takes priority
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    let wx = 0, wy = 0, bestD = 1e9;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const g = this.groundLayer.getTileAt(ptx + dx, pty + dy);
        if (!g || g.index !== T.WATER) continue;
        const cx = g.getCenterX(), cy = g.getCenterY();
        const d = Phaser.Math.Distance.Between(p.x, p.y, cx, cy);
        if (d < bestD) { bestD = d; wx = cx; wy = cy; }
      }
    }
    if (!bestD || bestD === 1e9) { st.fishT = 0; this.hideBobber(); return; }

    st.fishT += dt;
    const need = Math.max(2.2, 5 * (1 - 0.03 * (st.skills.fishing.lvl - 1)));

    // ---- bobber: cast line, idle bob, dip right before the bite ----
    if (!this.bobber) this.bobber = this.add.image(0, 0, 'bobber').setDepth(6);
    const biting = st.fishT > need - 0.6;
    if (!this.bobber.visible) {
      // fresh cast: plop it in
      this.bobber.setVisible(true).setPosition(wx, wy - 14).setAlpha(0);
      this.bobber.fixedByTween = true;
      this.tweens.add({
        targets: this.bobber, y: wy, alpha: 1, duration: 250, ease: 'Bounce.Out',
        onComplete: () => { this.bobber.fixedByTween = false; },
      });
      this.splash(wx, wy, 3);
    } else if (!this.bobber.fixedByTween) {
      this.bobber.x = wx;
      this.bobber.y = wy + Math.sin(st.fishT * 3) * 2 + (biting ? 4 : 0);
    }
    if (biting && !st.biteShown) {
      st.biteShown = true;
      showDamage(this, wx, wy - 18, '❗', '#ffd95e');
      this.splash(wx, wy, 4);
    }

    if (st.fishT < need) return;
    st.fishT = 0;
    st.biteShown = false;
    this.splash(wx, wy, 9);

    const lvl = st.skills.fishing.lvl;
    const roll = Math.random();
    if (roll < 0.02 + lvl * 0.004) {
      st.res.diamond += 1; st.coins += 10;
      logEvent(this, '🎣 sunken treasure! +1 💎 +10 🪙', true);
      showBanner('🎣 SUNKEN TREASURE!', '+1 diamond · +10 coins');
    } else if (roll < 0.10) {
      st.res.gold += 1;
      showDamage(this, p.x, p.y - 26, '🎣 +1 gold', '#f5c842');
    } else if (roll < 0.35) {
      const c = 2 + Math.floor(Math.random() * lvl);
      st.coins += c;
      showDamage(this, p.x, p.y - 26, `🎣 +${c} coins`, '#ffd95e');
    } else if (st.hp < st.maxHp) {
      st.hp = Math.min(st.maxHp, st.hp + 12);
      showDamage(this, p.x, p.y - 26, '🎣 +12 hp', '#7ef76a');
    } else {
      st.coins += 2;
      showDamage(this, p.x, p.y - 26, '🎣 sold it, +2 coins', '#ffd95e');
    }
    gainSkill(this, 'fishing', 4);
    gainXP(this, 2);
    logRes(this, 'fishing', '🎣 fishing', { catches: 1 });
    SFX.pickup();
  }

  hideBobber() {
    if (this.bobber && this.bobber.visible) {
      this.bobber.setVisible(false);
      this.state.biteShown = false;
    }
  }

  splash(x, y, n) {
    for (let i = 0; i < n; i++) {
      const px = this.add.image(x + (Math.random() - 0.5) * 14, y, 'px')
        .setDepth(6).setTint(i % 2 ? 0x7ab8e8 : 0xcfe8ff);
      this.tweens.add({
        targets: px, y: y - 8 - Math.random() * 10, alpha: 0,
        duration: 300 + Math.random() * 150, onComplete: () => px.destroy(),
      });
    }
  }

  // buffs, gravestone pickup, bed hint
  updateExtras(dt) {
    const st = this.state, p = this.player;

    if (st.buffs.strength > 0) st.buffs.strength -= dt;

    if (this.grave && this.grave.active &&
        Phaser.Math.Distance.Between(p.x, p.y, this.grave.x, this.grave.y) < 36) {
      const parts = [];
      for (const [r, n] of Object.entries(this.graveRes || {})) {
        if (n > 0) { st.res[r] += n; parts.push(`${n} ${r}`); }
      }
      showBanner('⚰️ RECOVERED YOUR STUFF', parts.length ? parts.join(' · ') : 'the grave was empty');
      spawnDebris(this, this.grave.x, this.grave.y, T.STONE);
      this.grave.destroy();
      this.grave = null;
      this.graveRes = null;
      clearGraveFromSave();
      SFX.pickup();
    }

    st.bedHintT -= dt;
    if (st.isNight && !st.sleeping && st.bedHintT <= 0) {
      for (const t of this.turrets.getChildren()) {
        if (t.active && t.ttype === 'bed' && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 60) {
          st.bedHintT = 2.5;
          showDamage(this, t.x, t.y - 26, '[E] sleep', '#ffd95e');
          break;
        }
      }
    }
  }

  // shared collection: player pickups make noise, critter deliveries are silent
  collectPickup(s, byPet) {
    if (!s.active) return;
    if (s.kind === 'gem' || s.kind === 'coin') {
      // only kill-loot here — mined resources are already credited to whoever dug them
      logRes(this, byPet ? 'crew' : 'you_loot', byPet ? '🐾 crew looted' : '💰 you looted',
             s.kind === 'gem' ? { xp: s.value } : { coins: s.value });
    }
    if (s.kind === 'gem') { gainXP(this, s.value); if (!byPet) SFX.gem(); }
    else if (s.kind === 'coin') { this.state.coins += s.value; if (!byPet) SFX.pickup(); }
    else if (s.kind === 'apple') {
      const healed = Math.min(s.value, this.state.maxHp - this.state.hp);
      this.state.hp += healed;
      if (healed > 0) showDamage(this, this.player.x, this.player.y - 24, '+' + Math.round(healed), '#7ef76a');
      if (!byPet) SFX.pickup();
    }
    else { this.state.res[s.res] += s.value; if (!byPet) SFX.pickup(); }
    s.setActive(false).setVisible(false);
    s.body.enable = false;
  }

  updatePickups(dt) {
    const st = this.state, p = this.player;
    const magnetR = 80 + 35 * (st.passives.magnet || 0);
    for (const s of this.pickups.getChildren()) {
      if (!s.active) continue;
      const d = Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y);
      if (d < magnetR) {
        const a = Phaser.Math.Angle.Between(s.x, s.y, p.x, p.y);
        const sp = 180 + (magnetR - d) * 4;
        s.body.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
        continue;
      }
      // critters scoop up anything they pass — and deliver it instantly
      let best = null, bd = 70;
      for (const pet of this.pets) {
        if (pet.fainted) continue;
        const pd = Phaser.Math.Distance.Between(s.x, s.y, pet.x, pet.y);
        if (pd < bd) { bd = pd; best = pet; }
      }
      if (best) {
        if (bd < 18) { this.collectPickup(s, true); continue; }
        const a = Phaser.Math.Angle.Between(s.x, s.y, best.x, best.y);
        s.body.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260);
      } else {
        s.body.setVelocity(0, 0);
      }
    }
  }

  updateProjectiles(dt) {
    for (const g of [this.friendlyProj, this.enemyProj]) {
      for (const s of g.getChildren()) {
        if (!s.active) continue;
        s.life -= dt;
        if (s.life <= 0) killProj(this, s);
      }
    }
  }

  updateDayNight(dt) {
    const st = this.state;
    st.phaseT -= dt;
    if (st.phaseT <= 0) {
      if (st.isNight) startDay(this); else startNight(this);
    }
    if (!st.isNight) {
      if (st.phaseT <= 60 && !st.nightWarn60) {
        st.nightWarn60 = true;
        showBanner('🌙 NIGHT IN 1 MINUTE', 'build walls · place turrets · top up HP');
        SFX.night();
      }
      if (st.phaseT <= 15 && !st.nightWarn15) {
        st.nightWarn15 = true;
        showBanner('🌙 15 SECONDS', 'get behind your walls!');
      }
    }
    // dusk/dawn fade in the last seconds of each phase
    let target = st.isNight ? 1 : (st.phaseT < 6 ? (6 - st.phaseT) / 6 * 0.5 : 0);
    const area = currentArea(this);
    if (area === 'cave') target = 1.15;
    else if (area === 'dungeon') target = 0.95;
    else if (area === 'rift') target = 0.9;
    this.nightRect.fillColor = area === 'rift' ? 0x1a0526 : 0x0a1030;
    st.darkness = Phaser.Math.Linear(st.darkness, target, dt * 1.5);
    this.nightRect.setAlpha(Math.min(0.78, st.darkness * 0.62));
  }

  drawBars() {
    const g = this.gfx, st = this.state;
    g.clear();

    // placement drag path (green = will place, red = blocked)
    if (this.placeDrag && st.placing && this.placeDrag.tiles.length > 1) {
      for (const k of this.placeDrag.tiles) {
        const [tx, ty] = k.split(',').map(Number);
        const ok = placementValid(this, tx, ty);
        g.fillStyle(ok ? 0x52e83e : 0xff5050, 0.3);
        g.fillRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4);
        g.lineStyle(1, ok ? 0x52e83e : 0xff5050, 0.8);
        g.strokeRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4);
      }
    }

    // blueprint capture rectangle
    if (st.bpCapture && this.bpDragStart) {
      const ptr2 = this.input.activePointer;
      g.lineStyle(2, 0x7ad8ff, 0.9);
      g.strokeRect(Math.min(this.bpDragStart.x, ptr2.worldX), Math.min(this.bpDragStart.y, ptr2.worldY),
        Math.abs(ptr2.worldX - this.bpDragStart.x), Math.abs(ptr2.worldY - this.bpDragStart.y));
      g.fillStyle(0x7ad8ff, 0.08);
      g.fillRect(Math.min(this.bpDragStart.x, ptr2.worldX), Math.min(this.bpDragStart.y, ptr2.worldY),
        Math.abs(ptr2.worldX - this.bpDragStart.x), Math.abs(ptr2.worldY - this.bpDragStart.y));
    }

    // fishing line: player → bobber
    if (this.bobber && this.bobber.visible) {
      g.lineStyle(1, 0xe8e8f0, 0.7);
      g.lineBetween(this.player.x + (this.player.flipX ? -8 : 8), this.player.y - 6,
        this.bobber.x, this.bobber.y - 4);
    }

    // pet bars: HP when hurt, XP when progressing
    for (const pet of this.pets) {
      const max = petMaxHp(pet);
      if (!pet.fainted && pet.hp < max) {
        g.fillStyle(0x11141a, 0.75); g.fillRect(pet.x - 9, pet.y - 20, 18, 4);
        g.fillStyle(0x7ef76a, 1); g.fillRect(pet.x - 8, pet.y - 19, 16 * Math.max(0, pet.hp / max), 2);
      }
      const need = 8 + pet.lvl * 6;
      if (!pet.xp || pet.fainted) continue;
      g.fillStyle(0x11141a, 0.7); g.fillRect(pet.x - 9, pet.y - 15, 18, 3);
      g.fillStyle(0xffd95e, 1); g.fillRect(pet.x - 8, pet.y - 14, 16 * Math.min(1, pet.xp / need), 1);
    }

    // placement AoE preview: drills show their dig square, turrets their range
    if (st.placing && this.ghost && this.ghost.visible) {
      const pdef = STRUCTURES[st.placing];
      const tinfo = pdef && pdef.turret ? TURRET_INFO[pdef.turret] : null;
      if (tinfo) {
        const gx = this.ghost.x, gy = this.ghost.y;
        if (tinfo.mineDps) {
          // square dig zone, gold
          const r = tinfo.mineR * TILE + TILE / 2;
          g.fillStyle(0xffd95e, 0.07);
          g.fillRect(gx - r, gy - r, r * 2, r * 2);
          g.lineStyle(2, 0xffd95e, 0.55);
          g.strokeRect(gx - r, gy - r, r * 2, r * 2);
        } else if (tinfo.range) {
          // firing/heal circle — accounts for the wall-mount range bonus
          const gtx = Math.floor(gx / TILE), gty = Math.floor(gy / TILE);
          const bt2 = this.blockLayer.getTileAt(gtx, gty);
          const mul = bt2 && isWallTile(bt2.index) ? 1.25 : 1;
          const r = tinfo.range * mul;
          const col = pdef.turret === 'campfire' ? 0xffa040 : 0x7ad8ff;
          g.fillStyle(col, 0.06);
          g.fillCircle(gx, gy, r);
          g.lineStyle(2, col, 0.5);
          g.strokeCircle(gx, gy, r);
        }
      }
    }

    // mining target highlight
    if (st.mineKey) {
      const [tx, ty] = st.mineKey.split(',').map(Number);
      g.lineStyle(2, 0xffffff, 0.45);
      g.strokeRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4);
    }

    // turret HP
    for (const t of this.turrets.getChildren()) {
      if (!t.active || t.hp >= t.maxHp) continue;
      const x = t.x - 13, y = t.y - 24;
      g.fillStyle(0x11141a, 0.8); g.fillRect(x, y, 26, 4);
      g.fillStyle(0x7ef76a, 1); g.fillRect(x + 1, y + 1, 24 * Math.max(0, t.hp / t.maxHp), 2);
    }

    // block HP (any chipped block — walls orange, nature yellow-green)
    for (const key of this.damagedBlocks) {
      const hp = this.blockHP[key], max = this.blockMaxHP[key];
      if (hp === undefined || hp >= max) continue;
      const [tx, ty] = key.split(',').map(Number);
      const tile = this.blockLayer.getTileAt(tx, ty);
      if (!tile) continue;
      const isWall = isWallTile(tile.index);
      const x = tx * TILE + 3, y = ty * TILE - 6;
      g.fillStyle(0x11141a, 0.8); g.fillRect(x, y, TILE - 6, 4);
      g.fillStyle(isWall ? 0xff9a3e : 0xbfe84a, 1);
      g.fillRect(x + 1, y + 1, (TILE - 8) * Math.max(0, hp / max), 2);
    }

    // direction arrows for offscreen points of interest
    const edgeArrow = (wx, wy, color) => {
      const cam = this.cameras.main;
      const view = new Phaser.Geom.Rectangle(cam.scrollX, cam.scrollY, cam.width, cam.height);
      if (view.contains(wx, wy)) return;
      const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
      const ang = Phaser.Math.Angle.Between(cx, cy, wx, wy);
      const ax = Phaser.Math.Clamp(wx, cam.scrollX + 36, cam.scrollX + cam.width - 36);
      const ay = Phaser.Math.Clamp(wy, cam.scrollY + 36, cam.scrollY + cam.height - 36);
      g.fillStyle(0x11141a, 0.7);
      g.fillCircle(ax, ay, 13);
      g.fillStyle(color, 1);
      g.fillTriangle(
        ax + Math.cos(ang) * 11, ay + Math.sin(ang) * 11,
        ax + Math.cos(ang + 2.5) * 8, ay + Math.sin(ang + 2.5) * 8,
        ax + Math.cos(ang - 2.5) * 8, ay + Math.sin(ang - 2.5) * 8);
    };
    // gravestone (white), and the way OUT of any interior (cyan)
    if (this.grave && this.grave.active) edgeArrow(this.grave.x, this.grave.y, 0xd8d8e0);
    const exitM = areaExitMarker(this);
    if (exitM) edgeArrow(exitM.x, exitM.y, 0x35c8be);

    // boss HP
    if (this.bossBar && this.bossBar.active) {
      const b = this.bossBar;
      const x = b.x - 40, y = b.y - b.displayHeight / 2 - 14;
      g.fillStyle(0x11141a, 0.85); g.fillRect(x, y, 80, 8);
      g.fillStyle(0xd83030, 1); g.fillRect(x + 1, y + 1, 78 * Math.max(0, b.hp / b.maxHp), 6);
    }
  }
}

// ---------- player damage & XP (global helpers) ----------
function hurtPlayer(scene, dmg) {
  const st = scene.state, p = scene.player;
  if (st.gameOver || p.invulnT > 0) return;
  const reduced = dmg * (1 - 0.06 * (st.passives.armor || 0)) * (1 - 0.10 * (st.flags.armorTier || 0));
  st.hp -= reduced;
  p.invulnT = 0.45;
  showDamage(scene, p.x, p.y - 24, Math.round(reduced), '#ff6b5e');
  scene.cameras.main.shake(120, 0.005);
  SFX.hurt();
  updateHUD(scene);

  if (st.hp <= 0) {
    st.hp = 0;
    st.gameOver = true;
    SFX.death();
    scene.physics.world.pause();
    cancelPlacement(scene);
    recordGrave(scene); // tombstone with half your resources, saved into the checkpoint
    scene.tweens.add({ targets: p, angle: 90, alpha: 0.3, duration: 600 });
    setTimeout(() => showGameOver(scene), 900);
  }
}

function gainXP(scene, v) {
  if (!v) return;
  const st = scene.state;
  st.xp += v * (1 + 0.10 * (st.passives.wisdom || 0)) * (1 + 0.15 * (st.prestige || 0));
  let leveled = 0;
  while (st.xp >= st.xpNext) {
    st.xp -= st.xpNext;
    st.level++;
    leveled++;
    st.xpNext = Math.round((6 + (st.level - 1) * 5) * Math.pow(1.035, st.level - 1));
  }
  if (leveled > 0) {
    logEvent(scene, `⬆ LEVEL ${st.level}!`);
    st.pendingLevels += leveled - 1;
    showLevelUp(scene);
  }
}

// RuneScape-style use-it-to-train-it skills
const SKILL_META = {
  mining:   { icon: '⛏', perk: lvl => `mining ${2 * (lvl - 1)}% faster` },
  fishing:  { icon: '🎣', perk: () => 'better and faster catches' },
  combat:   { icon: '⚔', perk: lvl => `you +${Math.round(1.5 * (lvl - 1) * 10) / 10}% & critters +${lvl - 1}% damage` },
  building: { icon: '🔨', perk: lvl => `new structures +${2 * (lvl - 1)}% HP` },
  forging:  { icon: '⚒', perk: lvl => `crafting costs -${lvl - 1}%` },
  taming:   { icon: '🐾', perk: lvl => `critters +${2 * (lvl - 1)}% dmg · catches +${lvl - 1}%` },
};

function gainSkill(scene, skill, amount) {
  const s = scene.state.skills[skill];
  if (!s || s.lvl >= 20) { if (s) s.xp += amount; return; }
  s.xp += amount;
  while (s.lvl < 20 && s.xp >= Math.round(30 * Math.pow(s.lvl, 1.5))) {
    s.xp -= Math.round(30 * Math.pow(s.lvl, 1.5));
    s.lvl++;
    showBanner(`${SKILL_META[skill].icon} ${skill.toUpperCase()} LEVEL ${s.lvl}!`, SKILL_META[skill].perk(s.lvl));
    SFX.levelup();
  }
}

// ---------- potions & sleeping ----------
function drinkPotion(scene, id) {
  const st = scene.state;
  if (st.gameOver || st.paused) return;
  if (!st.stock[id]) { showBanner(POTIONS[id].icon + ' none left', 'craft more at the bench [C]'); return; }
  if (id === 'healthPotion') {
    if (st.hp >= st.maxHp) { showBanner('🧪 HP already full', ''); return; }
    st.hp = Math.min(st.maxHp, st.hp + 60);
    showDamage(scene, scene.player.x, scene.player.y - 24, '+60', '#7ef76a');
  } else if (id === 'strengthPotion') {
    st.buffs.strength = 30;
    showDamage(scene, scene.player.x, scene.player.y - 24, '💜 +50% DMG', '#b08ae8');
  }
  st.stock[id]--;
  SFX.craft();
  refreshHotbar(scene);
  updateHUD(scene);
}

function trySleep(scene) {
  const st = scene.state;
  if (st.gameOver || st.paused || st.sleeping || anyModalOpen()) return;
  const p = scene.player;
  let bed = null;
  for (const t of scene.turrets.getChildren()) {
    if (t.active && t.ttype === 'bed' && Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 60) { bed = t; break; }
  }
  if (!bed) return;
  if (!st.isNight) { showBanner('🛏️ you can only sleep at night', ''); return; }
  for (const e of scene.enemies.getChildren()) {
    if (e.active && !e.dying && Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < 280) {
      showBanner('🛏️ monsters are nearby!', 'clear them out first');
      return;
    }
  }

  st.sleeping = true;
  $('sleep-fade').style.opacity = 1;
  pushAction(scene, 1.0, () => {
    // skip the night: despawn the horde (their XP is forfeit), heal up, dawn
    for (const e of scene.enemies.getChildren()) {
      if (!e.active) continue;
      e.dying = true;
      e.setActive(false).setVisible(false);
      e.body.enable = false;
    }
    scene.bossBar = null;
    st.nightBudget = 0;
    st.hp = st.maxHp;
    startDay(scene);
    showBanner('🛏️ YOU SLEPT THROUGH THE NIGHT', 'fully rested — but the XP is gone');
    $('sleep-fade').style.opacity = 0;
    pushAction(scene, 1.0, () => { st.sleeping = false; });
  });
}

// ---------- background idle mode ----------
// Hidden tabs lose the render loop and get their timers throttled, so real
// combat can't run. Instead: a Web Worker heartbeat (workers aren't throttled)
// keeps your WORKERS working — mining, chopping, fishing, healing — while the
// clock and combat freeze. Come back to a "while you were away" haul.
function idleTick(scene, dt) {
  const st = scene.state;
  if (!st || st.paused || st.gameOver || st.isNight) return;
  if (!scene._idleGains) scene._idleGains = { res: {}, coins: 0, xp: 0, blocks: 0 };
  const g = scene._idleGains;

  for (const pet of scene.pets) {
    if (pet.fainted || !pet.def.mines) continue;
    if (!pet.workTile || !scene.blockLayer.getTileAt(pet.workTile.x, pet.workTile.y)) {
      pet.workTile = findPetWork(scene, pet, true);
      if (pet.workTile) pet.setPosition(pet.workTile.x * TILE + 16, pet.workTile.y * TILE + 16);
    }
    if (!pet.workTile) continue;
    const k = pet.workTile.x + ',' + pet.workTile.y;
    if (!(k in scene.blockHP)) { pet.workTile = null; continue; }
    const lvlMul = 1 + 0.15 * (pet.lvl - 1);
    const toolMul = 1 + 0.25 * st.flags.pickTier;
    scene.blockHP[k] -= pet.def.mineDps * lvlMul * toolMul * dt;
    scene.damagedBlocks.add(k);
    if (scene.blockHP[k] <= 0) {
      const idx = destroyBlockTile(scene, pet.workTile.x, pet.workTile.y, true);
      if (idx >= 0) {
        st.harvestedToday = (st.harvestedToday || 0) + 1;
        for (const [r, n] of Object.entries(BLOCK_INFO[idx].drops)) {
          st.res[r] += n;
          g.res[r] = (g.res[r] || 0) + n;
        }
        g.xp += BLOCK_INFO[idx].xp || 0;
        g.blocks++;
        gainSkill(scene, 'mining', (BLOCK_INFO[idx].xp || 1) * 2);
        petGainXP(scene, pet, 1);
      }
      pet.workTile = null;
    }
  }

  // drill rigs never sleep
  for (const t of scene.turrets.getChildren()) {
    if (t.active && t.info && t.info.mineDps) {
      const before = { ...st.res };
      drillTick(scene, t, dt);
      for (const r of Object.keys(st.res)) {
        const gain = st.res[r] - before[r];
        if (gain > 0) g.res[r] = (g.res[r] || 0) + gain;
      }
    }
  }

  // fishing by the shore continues
  const ptx = Math.floor(scene.player.x / TILE), pty = Math.floor(scene.player.y / TILE);
  let water = false;
  for (let dy = -1; dy <= 1 && !water; dy++) for (let dx = -1; dx <= 1 && !water; dx++) {
    const gt = scene.groundLayer.getTileAt(ptx + dx, pty + dy);
    if (gt && gt.index === T.WATER) water = true;
  }
  if (water) {
    st.fishT += dt;
    const need = Math.max(2.2, 5 * (1 - 0.03 * (st.skills.fishing.lvl - 1)));
    if (st.fishT >= need) {
      st.fishT = 0;
      const c = 2 + Math.floor(Math.random() * st.skills.fishing.lvl);
      st.coins += c;
      g.coins += c;
      g.xp += 2;
      gainSkill(scene, 'fishing', 4);
    }
  }

  // campfire warmth + regen still apply
  let nearFire = false;
  for (const t of scene.turrets.getChildren()) {
    if (t.active && t.ttype === 'campfire' &&
        Phaser.Math.Distance.Between(t.x, t.y, scene.player.x, scene.player.y) < t.info.range) { nearFire = true; break; }
  }
  if (nearFire) st.hp = Math.min(st.maxHp, st.hp + 3 * dt);
  if (st.passives.regen) st.hp = Math.min(st.maxHp, st.hp + 0.6 * st.passives.regen * dt);

  // keep the save warm so even closing the hidden tab loses nothing
  scene._idleSaveT = (scene._idleSaveT || 0) + dt;
  if (scene._idleSaveT >= 30) { scene._idleSaveT = 0; saveGame(scene); }
}

function endIdle(scene) {
  const g = scene._idleGains;
  scene._idleGains = null;
  if (!g) return;
  const parts = Object.entries(g.res).filter(([, n]) => n > 0).map(([r, n]) => `+${n} ${r}`);
  if (g.coins) parts.push(`+${g.coins} 🪙`);
  if (g.xp) { gainXP(scene, g.xp); parts.push(`+${Math.round(g.xp)} xp`); }
  if (parts.length) {
    showBanner('😴 WHILE YOU WERE AWAY', parts.join(' · '));
    saveGame(scene);
    updateHUD(scene);
    refreshWeaponList(scene);
  }
}

function setupIdleMode() {
  if (window._idleHook) return;
  window._idleHook = true;
  try {
    const w = new Worker(URL.createObjectURL(
      new Blob(['setInterval(() => postMessage(0), 1000);'], { type: 'application/javascript' })));
    w.onmessage = () => {
      const s = window.gameScene;
      if (s && s.state && document.hidden) idleTick(s, 1);
    };
  } catch (e) { /* no worker support — idle mode unavailable */ }
  document.addEventListener('visibilitychange', () => {
    const s = window.gameScene;
    if (!s || !s.state) return;
    if (!document.hidden) endIdle(s);
    // mobile browsers rarely fire beforeunload — bank the save when backgrounded
    else if (!s.state.gameOver) saveGame(s);
  });
}
setupIdleMode();

// ---------- boot ----------
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#1a2030',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [GameScene],
};

window.game = new Phaser.Game(config);
