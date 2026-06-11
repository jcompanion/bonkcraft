// ---------- world generation + mining ----------

// cheap value noise: random lattice + bilinear interpolation
function makeNoise(cell) {
  const lat = {};
  const rnd = (x, y) => {
    const k = x + ',' + y;
    if (!(k in lat)) lat[k] = Math.random();
    return lat[k];
  };
  return (x, y) => {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    const fx = (x / cell) - gx, fy = (y / cell) - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = rnd(gx, gy), b = rnd(gx + 1, gy), c = rnd(gx, gy + 1), d = rnd(gx + 1, gy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function buildWorld(scene) {
  const map = scene.make.tilemap({ width: MAP_W, height: GRID_H, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
  const ground = map.createBlankLayer('ground', tileset).setDepth(0);
  const blocks = map.createBlankLayer('blocks', tileset).setDepth(2);

  scene.map = map;
  scene.groundLayer = ground;
  scene.blockLayer = blocks;

  if (scene.loadData) {
    restoreWorld(scene, scene.loadData);
    ground.setCollision(T.WATER);
    blocks.setCollisionBetween(T.TREE, T.STONEWALL);
    blocks.setCollisionBetween(T.IRONWALL, T.BEDROCK);
    blocks.setCollision(T.OBSIDIANWALL);
    return;
  }

  scene.blockHP = {};          // 'x,y' -> remaining hp (mining, mob chewing, explosions)
  scene.blockMaxHP = {};
  scene.damagedBlocks = new Set();
  scene.origBlocks = new Int16Array(MAP_W * MAP_H).fill(-1); // natural layout, for dawn regrowth

  generateTerrain(scene, () => false);

  ground.setCollision(T.WATER);
  blocks.setCollisionBetween(T.TREE, T.STONEWALL);
  blocks.setCollisionBetween(T.IRONWALL, T.BEDROCK);
  blocks.setCollision(T.OBSIDIANWALL);

  placeDens(scene, pickDenSpots(scene));
  setupGates(scene, null);
}

// generate terrain for every tile where skip(x,y) is false — used for fresh
// worlds AND for the new wilderness ring when an older, smaller save migrates
function generateTerrain(scene, skip) {
  const ground = scene.groundLayer, blocks = scene.blockLayer;
  const water = makeNoise(11);
  const forest = makeNoise(7);
  const rocks = makeNoise(6);
  const dirtN = makeNoise(5);
  const tall = makeNoise(6);
  const cx = MAP_W / 2, cy = MAP_H / 2;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (skip(x, y)) continue;
      const distSpawn = Math.hypot(x - cx, y - cy);
      const w = water(x, y);

      // ground
      let g;
      if (w < 0.24 && distSpawn > 9) g = T.WATER;
      else if (w < 0.30 && distSpawn > 9) g = T.SAND;
      else if (dirtN(x, y) > 0.78) g = T.DIRT;
      else g = Math.random() < 0.5 ? T.GRASS : T.GRASS2;
      ground.putTileAt(g, x, y);
      if (g === T.WATER || g === T.SAND) continue;

      // blocks (keep spawn area clear)
      if (distSpawn < 7) continue;
      let b = -1;
      const r = rocks(x, y);
      if (r > 0.72 && Math.random() < 0.75) {
        b = T.STONE;
        const depth = (r - 0.72) / 0.28;        // deeper into the outcrop = better ore
        const roll = Math.random();
        if (depth > 0.55 && roll < 0.06) b = T.DIAMOND;
        else if (depth > 0.35 && roll < 0.16) b = T.GOLD;
        else if (roll < 0.34) b = T.IRON;
      } else {
        const dense = x >= DENSE_FOREST.x0 && x <= DENSE_FOREST.x1 && y >= DENSE_FOREST.y0 && y <= DENSE_FOREST.y1;
        if (forest(x, y) > (dense ? 0.40 : 0.60) && Math.random() < (dense ? 0.62 : 0.45)) b = T.TREE;
      }
      if (b >= 0) {
        blocks.putTileAt(b, x, y);
        scene.blockHP[x + ',' + y] = BLOCK_INFO[b].hp;
        scene.blockMaxHP[x + ',' + y] = BLOCK_INFO[b].hp;
        scene.origBlocks[y * MAP_W + x] = b;
      } else if ((g === T.GRASS || g === T.GRASS2) && tall(x, y) > 0.64 && distSpawn > 10) {
        blocks.putTileAt(T.TALLGRASS, x, y); // walkable — wild critter territory
      }
    }
  }
}

// find den locations: inside rocky areas, far from spawn and from each other
function pickDenSpots(scene) {
  const cx = MAP_W / 2, cy = MAP_H / 2;
  const spots = [];
  for (let tries = 0; tries < 4000 && spots.length < DEN_COUNT; tries++) {
    const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
    const y = 4 + Math.floor(Math.random() * (MAP_H - 8));
    if (Math.hypot(x - cx, y - cy) < 22) continue;
    const g = scene.groundLayer.getTileAt(x, y);
    if (!g || g.index === T.WATER) continue;
    // want stone neighbours so it reads as a cave mouth
    let rocky = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = scene.blockLayer.getTileAt(x + dx, y + dy);
      if (t && t.index >= T.STONE && t.index <= T.DIAMOND) rocky++;
    }
    if (rocky < 4) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.y - y) < 30)) continue;
    spots.push({ x, y });
  }
  return spots;
}

function placeDens(scene, spots) {
  scene.dens = [];
  for (const s of spots) {
    // clear the mouth tile itself
    if (scene.blockLayer.getTileAt(s.x, s.y)) destroyBlockTile(scene, s.x, s.y, true);
    scene.origBlocks[s.y * MAP_W + s.x] = -1;
    const wx = s.x * TILE + 16, wy = s.y * TILE + 16;
    const img = scene.add.image(wx, wy, 'cave').setDepth(1);
    img.isDen = true;
    const glow = scene.add.image(wx, wy, 'glow').setDepth(11)
      .setScale(1.3).setTint(0x9040c0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25);
    scene.dens.push({ tx: s.x, ty: s.y, x: wx, y: wy, img, glow, timer: 1 + Math.random() * 2, seen: false });
    scene.turretGrid[s.x + ',' + s.y] = img; // can't build on the hole
  }
}

// dawn regrowth: some harvested blocks return in their original spots.
// On Bloom Day (every BLOOM_EVERY days) EVERYTHING regrows.
function regrowResources(scene, bloom) {
  if (!scene.origBlocks) return;
  const p = scene.player;
  const candidates = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const idx = scene.origBlocks[y * MAP_W + x];
      if (idx < 0) continue;
      if (scene.blockLayer.getTileAt(x, y)) continue;
      if (scene.turretGrid[x + ',' + y]) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, x * TILE + 16, y * TILE + 16) < 8 * TILE) continue;
      candidates.push({ x, y, idx });
    }
  }
  Phaser.Utils.Array.Shuffle(candidates);
  // the world gives back what was taken TODAY (plus a trickle for old scars)
  const taken = scene.state.harvestedToday || 0;
  let budget = bloom ? candidates.length : Math.min(candidates.length, taken + 6);
  let grown = 0;
  for (const c of candidates) {
    if (budget <= 0) break;
    budget--;
    if (!bloom && Math.random() > (REGROW_CHANCE[c.idx] || 0.3)) continue;
    scene.blockLayer.putTileAt(c.idx, c.x, c.y);
    scene.blockHP[c.x + ',' + c.y] = BLOCK_INFO[c.idx].hp;
    scene.blockMaxHP[c.x + ',' + c.y] = BLOCK_INFO[c.idx].hp;
    grown++;
  }
  return grown;
}

// rebuild tile layers from a save — saves from smaller map versions load into
// the top-left region and fresh wilderness generates around them
function restoreWorld(scene, data) {
  scene.blockHP = {};
  scene.blockMaxHP = {};
  scene.damagedBlocks = new Set();
  scene.origBlocks = new Int16Array(MAP_W * MAP_H).fill(-1);
  const orig = data.orig || data.blocks; // old saves: treat current layout as original
  const sw = Math.round(Math.sqrt(data.ground.length)); // saved map was sw × sw
  const sh = sw;

  for (let y = 0; y < Math.min(sh, MAP_H); y++) {
    for (let x = 0; x < Math.min(sw, MAP_W); x++) {
      const i = y * sw + x;
      const g = decodeChar(data.ground[i]);
      if (g >= 0) scene.groundLayer.putTileAt(g, x, y);
      const b = decodeChar(data.blocks[i]);
      if (b >= 0) {
        scene.blockLayer.putTileAt(b, x, y);
        if (BLOCK_INFO[b]) {
          scene.blockHP[x + ',' + y] = BLOCK_INFO[b].hp;
          scene.blockMaxHP[x + ',' + y] = BLOCK_INFO[b].hp;
        }
      }
      const o = decodeChar(orig[i]);
      if (o >= 0 && o <= T.DIAMOND) scene.origBlocks[y * MAP_W + x] = o; // natural blocks only
    }
  }

  // map grew since this save: generate the new wilderness ring
  if (sw < MAP_W || sh < MAP_H) {
    generateTerrain(scene, (x, y) => x < sw && y < sh);
  }

  for (const [k, hp] of Object.entries(data.damaged || {})) {
    if (!(k in scene.blockHP)) continue;
    scene.blockHP[k] = hp;
    scene.damagedBlocks.add(k);
  }
}

// place a structure tile (walls) at tile coords
function placeWallTile(scene, tx, ty, tileIndex) {
  scene.blockLayer.putTileAt(tileIndex, tx, ty);
  const buildMul = 1 + 0.02 * (((scene.state.skills.building || { lvl: 1 }).lvl) - 1);
  scene.blockHP[tx + ',' + ty] = Math.round(BLOCK_INFO[tileIndex].hp * buildMul);
  scene.blockMaxHP[tx + ',' + ty] = Math.round(BLOCK_INFO[tileIndex].hp * buildMul);
}

// remove a block tile with debris particles; returns the removed tile index or -1
function destroyBlockTile(scene, tx, ty, silent) {
  const tile = scene.blockLayer.getTileAt(tx, ty);
  if (!tile) return -1;
  const idx = tile.index;
  // tally today's harvest of natural blocks — dawn regrows what was taken
  // (interior areas regenerate on their own and don't count)
  if (!silent && idx >= T.TREE && idx <= T.DIAMOND && scene.state && ty < MAP_H) {
    scene.state.harvestedToday = (scene.state.harvestedToday || 0) + 1;
  }
  scene.blockLayer.removeTileAt(tx, ty);
  delete scene.blockHP[tx + ',' + ty];
  delete scene.blockMaxHP[tx + ',' + ty];
  scene.damagedBlocks.delete(tx + ',' + ty);
  if (!silent) {
    spawnDebris(scene, tx * TILE + TILE / 2, ty * TILE + TILE / 2, idx);
    SFX.breakBlk();
  }
  return idx;
}

const DEBRIS_COLORS = {
  [T.TREE]: [0x5d3a1e, 0x2e6b1e], [T.STONE]: [0x8d8d94, 0x6f6f78],
  [T.IRON]: [0x8d8d94, 0xd8c8b8], [T.GOLD]: [0x8d8d94, 0xf5c842],
  [T.DIAMOND]: [0x8d8d94, 0x4ee0d8], [T.WOODWALL]: [0x9a6b35, 0x7e5527],
  [T.STONEWALL]: [0xa8a8b0, 0x83838c],
  [T.IRONWALL]: [0x9aa2ae, 0x7c8490], [T.DIAMONDWALL]: [0x2a2438, 0x35c8be],
};

function spawnDebris(scene, x, y, tileIdx) {
  const colors = DEBRIS_COLORS[tileIdx] || [0xffffff];
  for (let i = 0; i < 8; i++) {
    const p = scene.add.image(x, y, 'px').setDepth(20).setTint(colors[i % colors.length]);
    const ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 80;
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(ang) * spd * 0.5,
      y: y + Math.sin(ang) * spd * 0.5 - 18,
      alpha: 0,
      scale: 0.4,
      duration: 380 + Math.random() * 200,
      onComplete: () => p.destroy(),
    });
  }
}

// drop resource pickups around a point
function dropResources(scene, x, y, drops) {
  for (const [res, n] of Object.entries(drops)) {
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * 22;
      const py = y + (Math.random() - 0.5) * 22;
      const s = scene.pickups.get(px, py, 'drop_' + res);
      if (!s) continue;
      s.setActive(true).setVisible(true).setDepth(3);
      s.setTexture('drop_' + res);
      s.body.enable = true;
      s.body.reset(px, py);
      s.kind = 'res';
      s.res = res;
      s.value = 1;
      s.setScale(0).setAlpha(1);
      scene.tweens.add({ targets: s, scale: 1, duration: 180, ease: 'Back.Out' });
    }
  }
}

// drop a healing apple
function dropApple(scene, x, y) {
  const s = scene.pickups.get(x, y, 'drop_apple');
  if (!s) return;
  s.setActive(true).setVisible(true).setDepth(3);
  s.setTexture('drop_apple');
  s.body.enable = true;
  s.body.reset(x, y);
  s.kind = 'apple';
  s.value = APPLE_HEAL;
  s.setScale(0).setAlpha(1);
  scene.tweens.add({ targets: s, scale: 1.2, duration: 200, ease: 'Back.Out' });
}

// drop coins
function dropCoin(scene, x, y, value) {
  const s = scene.pickups.get(x, y, 'coin');
  if (!s) return;
  s.setActive(true).setVisible(true).setDepth(3);
  s.setTexture('coin');
  s.body.enable = true;
  s.body.reset(x, y);
  s.kind = 'coin';
  s.value = value;
  s.setScale(0).setAlpha(1);
  scene.tweens.add({ targets: s, scale: value >= 5 ? 1.5 : 1.1, duration: 180, ease: 'Back.Out' });
}

// drop an XP gem
function dropGem(scene, x, y, value) {
  const s = scene.pickups.get(x, y, 'gem');
  if (!s) return;
  s.setActive(true).setVisible(true).setDepth(3);
  s.setTexture('gem');
  s.body.enable = true;
  s.body.reset(x, y);
  s.kind = 'gem';
  s.value = value;
  s.setScale(0).setAlpha(1);
  scene.tweens.add({ targets: s, scale: value >= 5 ? 1.4 : 1, duration: 180, ease: 'Back.Out' });
}
