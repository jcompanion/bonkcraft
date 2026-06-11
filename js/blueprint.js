// ---------- blueprints: drag-select your fort, stamp it later at a discount ----------

const BP_DISCOUNT = 0.7;   // pay 70% of the piece-by-piece cost
const BP_MAX = 8;          // saved blueprint slots
const BP_MAX_ITEMS = 400;

const WALL_TO_STRUCT = {
  [T.WOODWALL]: 'woodWall', [T.STONEWALL]: 'stoneWall',
  [T.IRONWALL]: 'ironWall', [T.DIAMONDWALL]: 'diamondWall',
  [T.OBSIDIANWALL]: 'obsidianWall',
};
const TTYPE_TO_STRUCT = {
  arrow: 'arrowTurret', crossbow: 'crossbowTurret', flame: 'flameTurret', tesla: 'teslaTurret',
  campfire: 'campfire', bed: 'bed', scarecrow: 'scarecrow', spike: 'spike', tntTrap: 'tntTrap',
  drill1: 'drill1', drill2: 'drill2', drill3: 'drill3',
};

function structCost(id) {
  const r = RECIPES.find(rec => rec.id === id);
  return r ? r.cost : {};
}

function blueprintCost(bp) {
  const total = {};
  for (const it of bp.items) {
    for (const [r, n] of Object.entries(structCost(it.id))) total[r] = (total[r] || 0) + n;
  }
  for (const r in total) total[r] = Math.ceil(total[r] * BP_DISCOUNT);
  return total;
}

// ---------- capture mode [G] ----------
function toggleBpCapture(scene) {
  const st = scene.state;
  if (st.gameOver || anyModalOpen()) return;
  if (st.placing) cancelPlacement(scene);
  if (st.placingBp) cancelBpPlacement(scene);
  st.bpCapture = !st.bpCapture;
  scene.bpDragStart = null;
  if (st.bpCapture) {
    if (st.blueprints.length >= BP_MAX) {
      st.bpCapture = false;
      showBanner('📐 blueprint slots full', `max ${BP_MAX} — delete one in the craft menu [C]`);
      return;
    }
    showBanner('📐 BLUEPRINT MODE', 'click & drag a box around your fort · [G]/ESC to cancel');
  } else {
    showBanner('📐 blueprint mode off', '');
  }
}

function finishBpCapture(scene, x0, y0, x1, y1) {
  const st = scene.state;
  st.bpCapture = false;
  scene.bpDragStart = null;

  const tx0 = Math.floor(Math.min(x0, x1) / TILE), ty0 = Math.floor(Math.min(y0, y1) / TILE);
  const tx1 = Math.floor(Math.max(x0, x1) / TILE), ty1 = Math.floor(Math.max(y0, y1) / TILE);
  const items = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = scene.blockLayer.getTileAt(tx, ty);
      if (tile && WALL_TO_STRUCT[tile.index]) {
        items.push({ dx: tx - tx0, dy: ty - ty0, id: WALL_TO_STRUCT[tile.index] });
      }
      const t = scene.turretGrid[tx + ',' + ty];
      if (t && !t.isDen && t.ttype && TTYPE_TO_STRUCT[t.ttype]) {
        items.push({ dx: tx - tx0, dy: ty - ty0, id: TTYPE_TO_STRUCT[t.ttype] });
      }
    }
  }
  if (!items.length) { showBanner('📐 nothing captured', 'the box needs to contain your walls/turrets'); return; }
  if (items.length > BP_MAX_ITEMS) { showBanner('📐 too big!', `max ${BP_MAX_ITEMS} pieces per blueprint`); return; }

  const bp = { name: `Fort ${st.blueprints.length + 1}`, items };
  st.blueprints.push(bp);
  const cost = Object.entries(blueprintCost(bp)).map(([r, n]) => `${n} ${r === 'coins' ? '🪙' : r}`).join(' · ');
  showBanner(`📐 "${bp.name.toUpperCase()}" SAVED!`, `${items.length} pieces · rebuild for ${cost} (30% off) — craft menu [C]`);
  queueSave(scene);
  SFX.craft();
}

// ---------- placement (stamp) mode ----------
function enterBpPlacement(scene, bp) {
  cancelBpPlacement(scene);
  if (scene.state.placing) cancelPlacement(scene);
  scene.state.placingBp = bp;
  scene.bpGhostImgs = bp.items.map(it => {
    const def = STRUCTURES[it.id];
    const tex = def.turret ? TURRET_INFO[def.turret].tex
      : def.trap ? TURRET_INFO[def.trap].tex
      : ({ [T.WOODWALL]: 'woodwall_icon', [T.STONEWALL]: 'stonewall_icon',
           [T.IRONWALL]: 'ironwall_icon', [T.DIAMONDWALL]: 'diamondwall_icon' })[def.tile];
    return scene.add.image(0, 0, tex).setDepth(30).setAlpha(0.5);
  });
  showBanner(`📐 PLACING "${bp.name.toUpperCase()}"`, 'click to stamp the whole fort · right-click/ESC to cancel');
}

function cancelBpPlacement(scene) {
  scene.state.placingBp = null;
  if (scene.bpGhostImgs) { scene.bpGhostImgs.forEach(i => i.destroy()); scene.bpGhostImgs = null; }
}

function bpTileValid(scene, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= GRID_H) return false;
  const g = scene.groundLayer.getTileAt(tx, ty);
  if (!g || g.index === T.WATER) return false;
  const bt = scene.blockLayer.getTileAt(tx, ty);
  if (bt && bt.index !== T.TALLGRASS) return false; // tall grass gets built over
  if (scene.turretGrid[tx + ',' + ty]) return false;
  return true;
}

function updateBpGhost(scene) {
  const bp = scene.state.placingBp;
  if (!bp || !scene.bpGhostImgs) return;
  const ptr = scene.input.activePointer;
  const btx = Math.floor(ptr.worldX / TILE), bty = Math.floor(ptr.worldY / TILE);
  bp.items.forEach((it, i) => {
    const img = scene.bpGhostImgs[i];
    img.setPosition((btx + it.dx) * TILE + 16, (bty + it.dy) * TILE + 16);
    img.setTint(bpTileValid(scene, btx + it.dx, bty + it.dy) ? 0xffffff : 0xff5050);
  });
}

function stampBlueprint(scene) {
  const st = scene.state;
  const bp = st.placingBp;
  if (!bp) return;
  const cost = blueprintCost(bp);
  if (!canAfford(st, cost)) {
    showBanner('📐 can\'t afford it', Object.entries(cost).map(([r, n]) => `${n} ${r === 'coins' ? '🪙' : r}`).join(' · '));
    return;
  }
  const ptr = scene.input.activePointer;
  const btx = Math.floor(ptr.worldX / TILE), bty = Math.floor(ptr.worldY / TILE);

  // need at least most of it to fit before charging
  const validCount = bp.items.filter(it => bpTileValid(scene, btx + it.dx, bty + it.dy)).length;
  if (validCount < bp.items.length * 0.5) {
    showBanner('📐 too cramped here', 'over half the blueprint is blocked — find open ground');
    return;
  }

  payCost(st, cost);
  let placed = 0, skipped = 0;
  for (const it of bp.items) {
    const tx = btx + it.dx, ty = bty + it.dy;
    if (!bpTileValid(scene, tx, ty)) { skipped++; continue; }
    const def = STRUCTURES[it.id];
    if (def.turret) {
      if (placeTurret(scene, def.turret, tx, ty)) placed++; else skipped++;
    } else if (def.trap) {
      placeTrap(scene, def.trap, tx, ty);
      placed++;
    } else {
      placeWallTile(scene, tx, ty, def.tile);
      placed++;
    }
  }
  scene.cameras.main.shake(150, 0.004);
  SFX.place();
  SFX.craft();
  showBanner(`📐 "${bp.name.toUpperCase()}" BUILT!`, `${placed} pieces placed${skipped ? ` · ${skipped} skipped (blocked)` : ''}`);
  cancelBpPlacement(scene);
  queueSave(scene);
  updateHUD(scene);
}

// ---------- craft-menu section ----------
function renderBlueprintRows(scene, el) {
  const st = scene.state;
  const head = document.createElement('div');
  head.style.cssText = 'grid-column: 1 / -1; font-size: 10px; color: #7ad8ff; margin-top: 10px;';
  head.textContent = `📐 BLUEPRINTS (${st.blueprints.length}/${BP_MAX}) — press [G] in-game to capture your fort`;
  el.appendChild(head);

  st.blueprints.forEach((bp, i) => {
    const cost = blueprintCost(bp);
    const div = document.createElement('div');
    div.className = 'recipe';
    div.innerHTML = `
      <div class="icon">📐</div>
      <div class="info">
        <div class="rname">${bp.name} <span style="color:#8fa3c8">(${bp.items.length} pieces)</span></div>
        <div class="rdesc">stamp the whole fort anywhere — 30% off</div>
        <div class="cost">${costHTML(st, cost)}</div>
      </div>
      <div class="craft-btns">
        <button data-a="place" ${canAfford(st, cost) ? '' : 'disabled'}>PLACE</button>
        <button data-a="del" class="qty" style="background:#8c2e1e">✕ DEL</button>
      </div>`;
    const placeBtn = div.querySelector('[data-a=place]');
    if (!placeBtn.disabled) placeBtn.onclick = () => { toggleCraft(scene); enterBpPlacement(scene, bp); };
    div.querySelector('[data-a=del]').onclick = () => {
      st.blueprints.splice(i, 1);
      queueSave(scene);
      renderCraftMenu(scene);
    };
    el.appendChild(div);
  });
}
