// ---------- procedural pixel-art textures (no asset files) ----------

// Paint an ASCII pixel grid into a texture. rows = ['..aa..', ...], palette = {a:'#hex'}
function pixelTex(scene, key, rows, palette, scale = 2) {
  if (scene.textures.exists(key)) return;
  const h = rows.length, w = rows[0].length;
  const canv = scene.textures.createCanvas(key, w * scale, h * scale);
  const ctx = canv.getContext();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || c === ' ') continue;
      ctx.fillStyle = palette[c] || '#f0f';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  canv.refresh();
}

function makeAllTextures(scene) {
  makeTileset(scene);
  makeCharacters(scene);
  makePetTextures(scene);
  makeAreaTextures(scene);
  makeTurretTextures(scene);
  makeItemTextures(scene);
  makeEffectTextures(scene);
}

// ---------- tileset: 12 tiles of 32px in one row ----------
function makeTileset(scene) {
  if (scene.textures.exists('tiles')) return;
  const canv = scene.textures.createCanvas('tiles', 20 * TILE, TILE);
  const ctx = canv.getContext();

  const speckle = (tx, base, specks, n, sMin = 2, sMax = 4) => {
    ctx.fillStyle = base;
    ctx.fillRect(tx, 0, TILE, TILE);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = specks[Math.floor(Math.random() * specks.length)];
      const s = sMin + Math.floor(Math.random() * (sMax - sMin + 1));
      ctx.fillRect(tx + Math.floor(Math.random() * (TILE - s)), Math.floor(Math.random() * (TILE - s)), s, s);
    }
  };

  // 0/1 grass variants
  speckle(0 * TILE, '#4f9b35', ['#46892e', '#5cab3e', '#3e7d28'], 26);
  speckle(1 * TILE, '#4a9232', ['#418227', '#57a53a', '#5cab3e'], 30);
  // 2 dirt
  speckle(2 * TILE, '#7a5230', ['#6b4628', '#8a5e38', '#5f3e22'], 24);
  // 3 sand
  speckle(3 * TILE, '#dcc46f', ['#cdb45f', '#e8d381', '#c3a955'], 22);
  // 4 water
  speckle(4 * TILE, '#2a64c8', ['#2456ae', '#3a78dd', '#1f4c9c'], 16, 3, 6);

  // 5 tree: trunk + leaf blob (transparent corners)
  {
    const tx = 5 * TILE;
    ctx.fillStyle = '#5d3a1e';
    ctx.fillRect(tx + 12, 18, 8, 14);
    ctx.fillStyle = '#4a2d15';
    ctx.fillRect(tx + 12, 18, 3, 14);
    ctx.fillStyle = '#2e6b1e';
    ctx.fillRect(tx + 4, 4, 24, 18);
    ctx.fillRect(tx + 8, 0, 16, 26);
    ctx.fillStyle = '#3a8526';
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(tx + 5 + Math.floor(Math.random() * 21), 1 + Math.floor(Math.random() * 19), 3, 3);
    }
    ctx.fillStyle = '#235617';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(tx + 5 + Math.floor(Math.random() * 21), 3 + Math.floor(Math.random() * 17), 3, 3);
    }
  }

  // 6 stone block
  const rock = (tx, oreColor, oreHi) => {
    speckle(tx, '#8d8d94', ['#7c7c84', '#9d9da4', '#6f6f78'], 18, 3, 6);
    ctx.strokeStyle = '#5f5f68';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx + 1, 1, TILE - 2, TILE - 2);
    if (oreColor) {
      for (let i = 0; i < 5; i++) {
        const x = tx + 4 + Math.floor(Math.random() * 21), y = 4 + Math.floor(Math.random() * 21);
        ctx.fillStyle = oreColor;
        ctx.fillRect(x, y, 5, 5);
        ctx.fillStyle = oreHi;
        ctx.fillRect(x + 1, y + 1, 2, 2);
      }
    }
  };
  rock(6 * TILE, null);
  rock(7 * TILE, '#c8a888', '#e8d8c8');   // iron
  rock(8 * TILE, '#f5c842', '#ffe89a');   // gold
  rock(9 * TILE, '#35c8be', '#9af0ea');   // diamond

  // 10 wood wall (planks)
  {
    const tx = 10 * TILE;
    ctx.fillStyle = '#9a6b35';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#7e5527';
    for (let y = 0; y < TILE; y += 8) ctx.fillRect(tx, y, TILE, 2);
    ctx.fillStyle = '#b07f42';
    for (let y = 2; y < TILE; y += 8) ctx.fillRect(tx, y, TILE, 1);
    ctx.fillStyle = '#5f3e1c';
    ctx.fillRect(tx + 8, 2, 2, 6); ctx.fillRect(tx + 22, 10, 2, 6); ctx.fillRect(tx + 14, 18, 2, 6); ctx.fillRect(tx + 4, 26, 2, 5);
  }
  // 11 stone wall (bricks)
  {
    const tx = 11 * TILE;
    ctx.fillStyle = '#a8a8b0';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#83838c';
    for (let y = 0; y < TILE; y += 8) ctx.fillRect(tx, y, TILE, 2);
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) * 8;
      for (let x = off; x < TILE; x += 16) ctx.fillRect(tx + x, r * 8, 2, 8);
    }
    ctx.fillStyle = '#bcbcc4';
    for (let i = 0; i < 8; i++) ctx.fillRect(tx + Math.floor(Math.random() * 28), Math.floor(Math.random() * 28), 3, 2);
  }

  // 13 iron wall (riveted plate)
  {
    const tx = 13 * TILE;
    ctx.fillStyle = '#9aa2ae';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#7c8490';
    for (let y = 0; y < TILE; y += 16) ctx.fillRect(tx, y, TILE, 2);
    ctx.fillRect(tx + 15, 0, 2, TILE);
    ctx.fillStyle = '#b8c0cc';
    ctx.fillRect(tx, 2, TILE, 2); ctx.fillRect(tx, 18, TILE, 2);
    ctx.fillStyle = '#5c646e';
    for (const [rx, ry] of [[4, 5], [26, 5], [4, 26], [26, 26], [15, 15]]) {
      ctx.fillRect(tx + rx, ry, 3, 3);
    }
  }
  // 14 diamond wall (dark obsidian, studded)
  {
    const tx = 14 * TILE;
    ctx.fillStyle = '#2a2438';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#3a3450';
    for (let i = 0; i < 10; i++) ctx.fillRect(tx + Math.floor(Math.random() * 28), Math.floor(Math.random() * 28), 4, 3);
    ctx.strokeStyle = '#1a1626';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx + 1, 1, TILE - 2, TILE - 2);
    for (const [dx2, dy2] of [[8, 8], [24, 8], [16, 16], [8, 24], [24, 24]]) {
      ctx.fillStyle = '#35c8be';
      ctx.fillRect(tx + dx2 - 2, dy2 - 2, 5, 5);
      ctx.fillStyle = '#9af0ea';
      ctx.fillRect(tx + dx2 - 1, dy2 - 1, 2, 2);
    }
  }

  // 15 bedrock (unbreakable shell of caves & dungeons)
  {
    const tx = 15 * TILE;
    ctx.fillStyle = '#16161c';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#24242e';
    for (let i = 0; i < 12; i++) ctx.fillRect(tx + Math.floor(Math.random() * 28), Math.floor(Math.random() * 28), 4, 3);
    ctx.fillStyle = '#0a0a10';
    for (let i = 0; i < 8; i++) ctx.fillRect(tx + Math.floor(Math.random() * 28), Math.floor(Math.random() * 28), 5, 2);
  }
  // 16 corrupted ground (the Rift)
  {
    const tx = 16 * TILE;
    ctx.fillStyle = '#241233';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#321a48';
    for (let i = 0; i < 18; i++) ctx.fillRect(tx + Math.floor(Math.random() * 29), Math.floor(Math.random() * 29), 3, 3);
    ctx.fillStyle = '#5a2a80';
    for (let i = 0; i < 5; i++) ctx.fillRect(tx + Math.floor(Math.random() * 29), Math.floor(Math.random() * 29), 2, 2);
  }

  // 17 stone floor (smooth slabs)
  {
    const tx = 17 * TILE;
    ctx.fillStyle = '#9a9aa2';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(tx, 0, 16, 16); ctx.fillRect(tx + 16, 16, 16, 16);
    ctx.strokeStyle = '#74747e';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, 0.5, 16, 16); ctx.strokeRect(tx + 16.5, 0.5, 16, 16);
    ctx.strokeRect(tx + 0.5, 16.5, 16, 16); ctx.strokeRect(tx + 16.5, 16.5, 16, 16);
    ctx.fillStyle = '#a8a8b2';
    for (let i = 0; i < 5; i++) ctx.fillRect(tx + Math.floor(Math.random() * 29), Math.floor(Math.random() * 29), 2, 2);
  }
  // 18 obsidian wall (deep purple-black, big-monster-proof)
  {
    const tx = 18 * TILE;
    ctx.fillStyle = '#150b20';
    ctx.fillRect(tx, 0, TILE, TILE);
    ctx.fillStyle = '#241238';
    for (let i = 0; i < 10; i++) ctx.fillRect(tx + Math.floor(Math.random() * 27), Math.floor(Math.random() * 27), 5, 4);
    ctx.fillStyle = '#3d2050';
    for (let i = 0; i < 6; i++) ctx.fillRect(tx + Math.floor(Math.random() * 28), Math.floor(Math.random() * 28), 3, 2);
    ctx.strokeStyle = '#0a0512';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx + 1, 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#8a5ac8';
    ctx.fillRect(tx + 6, 6, 2, 2); ctx.fillRect(tx + 24, 12, 2, 2); ctx.fillRect(tx + 12, 24, 2, 2);
  }

  // 12 tall grass (walkable, transparent background — wild critters live here)
  {
    const tx = 12 * TILE;
    for (let i = 0; i < 26; i++) {
      const bx = tx + 2 + Math.floor(Math.random() * 28);
      const by = 10 + Math.floor(Math.random() * 18);
      const h = 8 + Math.floor(Math.random() * 12);
      ctx.fillStyle = i % 3 ? '#2e7a1e' : '#3a9426';
      ctx.fillRect(bx, by + (22 - by) - h + 8, 2, h);
      ctx.fillStyle = '#54b438';
      ctx.fillRect(bx, by + (22 - by) - h + 8, 2, 3);
    }
  }

  canv.refresh();

  // standalone wall textures (placement ghost previews)
  const src = canv.canvas;
  for (const [key, idx] of [['woodwall_icon', T.WOODWALL], ['stonewall_icon', T.STONEWALL],
                            ['ironwall_icon', T.IRONWALL], ['diamondwall_icon', T.DIAMONDWALL],
                            ['obsidianwall_icon', T.OBSIDIANWALL], ['floor_icon', T.FLOOR]]) {
    if (!scene.textures.exists(key)) {
      const c2 = scene.textures.createCanvas(key, TILE, TILE);
      c2.getContext().drawImage(src, idx * TILE, 0, TILE, TILE, 0, 0, TILE, TILE);
      c2.refresh();
    }
  }
}

// ---------- characters ----------

// player (blocky Steve-ish) — colors come from SETTINGS.avatar so the
// look can be customized in settings and rebuilt live
function makePlayerTexture(scene) {
  if (scene.textures.exists('player')) scene.textures.remove('player');
  const av = SETTINGS.avatar;
  const shade = (hex, f) => '#' + [1, 3, 5].map(i =>
    Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('');
  pixelTex(scene, 'player', [
    '..hhhhhh..',
    '.hhhhhhhh.',
    '.hssssssh.',
    '.ssssssss.',
    '.seSsseSs.',
    '.ssssssss.',
    '.sssmmsss.',
    '.tttttttt.',
    'stttttttts',
    'stttttttts',
    '.pppppppp.',
    '.ppp..ppp.',
    '.ppp..ppp.',
    '.gg....gg.',
  ], { h: av.hair, s: av.skin, e: '#ffffff', S: '#3a55c8', m: shade(av.skin, 0.8),
       t: av.shirt, p: av.pants, g: '#444a55' });
}

function makeCharacters(scene) {
  makePlayerTexture(scene);

  pixelTex(scene, 'zombie', [
    '..hhhhhh..',
    '.hhhhhhhh.',
    '.hssssssh.',
    '.ssssssss.',
    '.sESssESs.',
    '.ssssssss.',
    '.sssmmsss.',
    '.tttttttt.',
    'stttttttts',
    'stt.tt.tts',
    '.pppppppp.',
    '.ppp..ppp.',
    '.pp....pp.',
    '.gg....gg.',
  ], { h: '#2d4a1e', s: '#5fa848', E: '#1a2812', m: '#3e7030', t: '#2a6b8a', p: '#4a3a7c', g: '#333' });

  pixelTex(scene, 'skeleton', [
    '..wwwwww..',
    '.wwwwwwww.',
    '.wwwwwwww.',
    '.wEwwwwEw.',
    '.wwwwwwww.',
    '.www..www.',
    '..wwwwww..',
    '..gwwwwg..',
    '.gwgwwgwg.',
    '.g.gwwg.g.',
    '...gwwg...',
    '..gw..wg..',
    '..gw..wg..',
    '..g....g..',
  ], { w: '#e8e8e0', E: '#1a1a1a', g: '#b8b8b0' });

  pixelTex(scene, 'creeper', [
    'cccccccccc',
    'cCccccccCc',
    'cEEccccEEc',
    'cEEccccEEc',
    'ccccMMcccc',
    'cccMMMMccc',
    'cccMMMMccc',
    'cccMccMccc',
    'cccMccMccc',
    'cccccccccc',
    'cCcccccCcc',
    'cccCcccccc',
    'cc....cccc',
    'cc....cccc',
  ], { c: '#4fae3e', C: '#3d8c2f', E: '#142810', M: '#1f3a18' });

  pixelTex(scene, 'spider', [
    'L...l..l...L',
    '.L.l....l.L.',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    'lbbREbbERbbl',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '.L.l....l.L.',
    'L...l..l...L',
  ], { b: '#1e1a22', L: '#2e2a35', l: '#2e2a35', R: '#d83030', E: '#881818' });

  // boss = big mean zombie, red eyes
  pixelTex(scene, 'brute', [
    '..hhhhhh..',
    '.hhhhhhhh.',
    '.hssssssh.',
    '.ssssssss.',
    '.sRSssRSs.',
    '.ssssssss.',
    '.ssmmmmss.',
    '.tttttttt.',
    'stttttttts',
    'stttttttts',
    '.pppppppp.',
    '.ppp..ppp.',
    '.pp....pp.',
    '.gg....gg.',
  ], { h: '#1e3812', s: '#3e7c2e', R: '#ff3020', S: '#881010', m: '#1a2812', t: '#1e4a62', p: '#352a5c', g: '#222' }, 5);
}

// ---------- pets / wild critters ----------
function makePetTextures(scene) {
  pixelTex(scene, 'pet_wolf', [
    'e..........e',
    'ee........ee',
    'gggggggggg..',
    'gWggggggggt.',
    'gggggggggttt',
    '.gggggggg.tt',
    '.gg....gg...',
    '.gg....gg...',
  ], { g: '#9aa2ae', W: '#1a1a1a', e: '#6f7782', t: '#6f7782' });

  pixelTex(scene, 'pet_bee', [
    '.ww..ww.',
    'wwwwwwww',
    '.ybybyb.',
    'yybybyby',
    'yybybyby',
    '.ybybyb.',
    '...ss...',
  ], { y: '#f5c842', b: '#2a2a2a', w: '#cfe8ff', s: '#888' });

  pixelTex(scene, 'pet_beaver', [
    '.bbbbbb...',
    'bbWbbWbb..',
    'bbbbbbbb..',
    'bbbttbbb..',
    'bbbbbbbbDD',
    '.bbbbbb.DD',
    '.bb..bb.DD',
  ], { b: '#7a5230', W: '#1a1a1a', t: '#fff', D: '#5a3a20' });

  pixelTex(scene, 'pet_golem', [
    '.gggggggg.',
    'ggEggggEgg',
    'gggggggggg',
    'ggggmmgggg',
    '.gggggggg.',
    '.ggg..ggg.',
    'gggg..gggg',
    '.gg....gg.',
  ], { g: '#8d8d94', E: '#7ad8ff', m: '#4a8a3a' });

  // rare
  pixelTex(scene, 'pet_fox', [
    'e..........e',
    'ee........ee',
    'oooooooooo..',
    'oWooooooooo.',
    'ooooooooooTT',
    '.oooooooo.TT',
    '.oo....oo.T.',
    '.oo....oo...',
  ], { o: '#e07820', e: '#b85a10', W: '#1a1a1a', T: '#f0f0f0' });

  pixelTex(scene, 'pet_owl', [
    'h........h',
    '.bbbbbbbb.',
    'bYWbbbbWYb',
    'bYYbbbbYYb',
    'bbbbOObbbb',
    'bwbwbbwbwb',
    'bbwbwwbwbb',
    '.bbbbbbbb.',
    '..bbbbbb..',
    '..y....y..',
  ], { b: '#7a5230', h: '#5a3a20', Y: '#f5c842', W: '#1a1a1a', O: '#e8a020', w: '#9a7048', y: '#e8a020' });

  pixelTex(scene, 'pet_badger', [
    'wkwggggggggg',
    'kkwggggggggg',
    'wEwggggggggg',
    'kkwggggggggg',
    'wkwggggggggg',
    '.gggggggggg.',
    '.gg..gg..gg.',
    '.kk..kk..kk.',
  ], { w: '#e8e8e0', k: '#2a2a30', E: '#1a1a1a', g: '#7a7a84' });

  // legendary (bigger, scale 3)
  pixelTex(scene, 'pet_dragon', [
    '.h..........h.',
    '.gg...ww...gg.',
    'gRgg.wwww.ggg.',
    'ggggwwwwwwgggg',
    '.gggGGGGGGggg.',
    '..gGGGGGGGGg..',
    '..gGGyyGGGGgt.',
    '.ggGGyyGGGGttt',
    '.gGGGGGGGGGtt.',
    '..gg.gggg.gg..',
    '..gg.gggg.gg..',
    '..cc..cc..cc..',
  ], { g: '#2e8b3a', G: '#3aa84a', h: '#e8e8e0', R: '#ff3020', w: '#1e6b2a', y: '#f5c842', t: '#2e8b3a', c: '#e8e8e0' }, 3);

  pixelTex(scene, 'pet_phoenix', [
    '...f..f...',
    '..ffYff...',
    '.fYYYYf...',
    'foWoooof..',
    'fooooooff.',
    '.ooooooooF',
    '.foooooof.',
    '..ffooff..',
    '...y..y...',
  ], { f: '#ff5a10', F: '#ffd040', Y: '#ffd040', o: '#ff8a20', W: '#1a1a1a', y: '#f5c842' }, 3);

  pixelTex(scene, 'pet_yeti', [
    '..wwwwwww...',
    '.wwwwwwwww..',
    '.wbEwwwEbw..',
    '.wbbwwwbbw..',
    '.wwbmmbwww..',
    'wwwwwwwwwww.',
    'wwwwwwwwwwww',
    'wWWwwwwwwWWw',
    '.wwwwwwwww..',
    '.www....www.',
    '.www....www.',
    '.bbb....bbb.',
  ], { w: '#e8f0f5', W: '#c8d8e5', b: '#6a8aa8', E: '#1a2a40', m: '#3a5a78' }, 3);

  pixelTex(scene, 'bobber', [
    '..ll..',
    '.rrrr.',
    'rrrrrr',
    'wwwwww',
    '.wwww.',
  ], { r: '#d83030', w: '#f0f0f0', l: '#888' });

  pixelTex(scene, 'orb', [
    '..rr..',
    '.rrrr.',
    'rrRrrr',
    'wwwwww',
    '.wwww.',
    '..ww..',
  ], { r: '#d83030', R: '#ff7a6a', w: '#f0f0f0' });
}

// ---------- area dwellers & gates ----------
function makeAreaTextures(scene) {
  pixelTex(scene, 'treant', [
    '..LLLLLL..',
    '.LLLLLLLL.',
    'LLLELLELLL',
    '.LLLLLLLL.',
    '..bbbbbb..',
    '..bbmmbb..',
    '..bbbbbb..',
    '.bb.bb.bb.',
    '.bb.bb.bb.',
    '.bb.bb.bb.',
    '.gg.gg.gg.',
  ], { L: '#2e6b1e', E: '#ffd040', b: '#5d3a1e', m: '#3a2410', g: '#4a2d15' });

  pixelTex(scene, 'bat', [
    'w..........w',
    'ww..bbbb..ww',
    'wwwbbEEbbwww',
    '.wwbbbbbbww.',
    '..wbbbbbbw..',
    '....b..b....',
  ], { b: '#3a2a4a', w: '#241a33', E: '#ff4040' });

  pixelTex(scene, 'slime', [
    '...gggg...',
    '..gGGGGg..',
    '.gGGGGGGg.',
    'gGEGGGGEGg',
    'gGGGGmmGGg',
    'gGGGGGGGGg',
    '.gggggggg.',
  ], { g: '#2f8a3a', G: '#52c45e', E: '#1a3a1e', m: '#1a3a1e' });

  pixelTex(scene, 'dungeonlord', [
    '..ccCCcc..',
    '..kkkkkk..',
    '.kkRkkRkk.',
    '.kkkkkkkk.',
    '..kkmmkk..',
    '.ppppppp p',
    'pppppppppp',
    'ppkppppkpp',
    '.pppppppp.',
    '.pp.pp.pp.',
    '.kk.kk.kk.',
    '.kk.kk.kk.',
  ], { c: '#ffd040', C: '#ffe89a', k: '#1a1422', R: '#ff3020', m: '#0a0810', p: '#3d2050' }, 4);

  const make = (key, draw) => {
    if (scene.textures.exists(key)) return;
    const canv = scene.textures.createCanvas(key, 32, 32);
    draw(canv.getContext());
    canv.refresh();
  };
  make('deepcave', ctx => {
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath(); ctx.ellipse(16, 17, 16, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000008';
    ctx.beginPath(); ctx.ellipse(16, 18, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a3ac8';
    ctx.fillRect(6, 6, 3, 6); ctx.fillRect(24, 8, 3, 5); ctx.fillRect(14, 3, 3, 5);
    ctx.fillStyle = '#b08ae8';
    ctx.fillRect(7, 6, 1, 3); ctx.fillRect(25, 8, 1, 2);
  });
  make('dgate', ctx => {
    ctx.fillStyle = '#55555e';
    ctx.fillRect(2, 6, 7, 26); ctx.fillRect(23, 6, 7, 26); ctx.fillRect(2, 2, 28, 7);
    ctx.fillStyle = '#74747e';
    ctx.fillRect(2, 2, 28, 2); ctx.fillRect(2, 6, 2, 22); ctx.fillRect(23, 6, 2, 22);
    ctx.fillStyle = '#3d1060';
    ctx.fillRect(9, 9, 14, 23);
    ctx.fillStyle = '#7a3ac8';
    ctx.fillRect(11, 11, 10, 19);
    ctx.fillStyle = '#b08ae8';
    ctx.fillRect(14, 14, 4, 12);
  });
  make('riftgate', ctx => {
    for (const [r, col] of [[15, '#3d1060'], [11, '#7a3ac8'], [7, '#35c8be'], [4, '#e8e8ff']]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(16, 16, r, r * 0.8, 0.5, 0, Math.PI * 2); ctx.fill();
    }
  });
  make('ladder', ctx => {
    ctx.fillStyle = '#9a6b35';
    ctx.fillRect(7, 2, 4, 28); ctx.fillRect(21, 2, 4, 28);
    for (let y = 5; y < 30; y += 6) ctx.fillRect(7, y, 18, 3);
    ctx.fillStyle = '#b07f42';
    ctx.fillRect(7, 2, 2, 28); ctx.fillRect(21, 2, 2, 28);
  });
}

// ---------- turrets (drawn with ctx) ----------
function makeTurretTextures(scene) {
  const base = (ctx, topColor, topHi) => {
    // stone base
    ctx.fillStyle = '#6f6f78';
    ctx.fillRect(3, 18, 26, 12);
    ctx.fillStyle = '#83838c';
    ctx.fillRect(3, 18, 26, 3);
    ctx.fillStyle = '#55555e';
    ctx.fillRect(3, 27, 26, 3);
    // post
    ctx.fillStyle = '#5d3a1e';
    ctx.fillRect(13, 8, 6, 12);
    // head
    ctx.fillStyle = topColor;
    ctx.fillRect(8, 2, 16, 10);
    ctx.fillStyle = topHi;
    ctx.fillRect(8, 2, 16, 3);
  };

  const make = (key, draw) => {
    if (scene.textures.exists(key)) return;
    const canv = scene.textures.createCanvas(key, 32, 32);
    draw(canv.getContext());
    canv.refresh();
  };

  make('turret_arrow', ctx => {
    base(ctx, '#9a6b35', '#b07f42');
    ctx.fillStyle = '#e8e8e0'; ctx.fillRect(22, 5, 8, 3);   // arrow tip out the side
    ctx.fillStyle = '#d83030'; ctx.fillRect(28, 4, 3, 5);
  });
  make('turret_crossbow', ctx => {
    base(ctx, '#4a4f5c', '#5d6375');
    ctx.fillStyle = '#c8a888'; ctx.fillRect(4, 6, 24, 2);   // bow arms
    ctx.fillStyle = '#e8e8e0'; ctx.fillRect(14, 3, 4, 8);
  });
  make('turret_flame', ctx => {
    base(ctx, '#8c3a1e', '#b04a24');
    ctx.fillStyle = '#ff8a20'; ctx.fillRect(11, 0, 10, 5);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(13, 0, 6, 3);
  });
  make('turret_tesla', ctx => {
    base(ctx, '#2a4a8c', '#3a62b5');
    ctx.fillStyle = '#7ad8ff'; ctx.fillRect(14, 0, 4, 6);   // coil tip
    ctx.fillStyle = '#bff0ff'; ctx.fillRect(15, 0, 2, 3);
  });
  make('bed', ctx => {
    ctx.fillStyle = '#5d3a1e';                       // wood frame
    ctx.fillRect(4, 2, 24, 28);
    ctx.fillStyle = '#4a2d15';
    ctx.fillRect(4, 2, 24, 3); ctx.fillRect(4, 27, 24, 3);
    ctx.fillStyle = '#e8e8e0';                       // pillow
    ctx.fillRect(7, 5, 18, 7);
    ctx.fillStyle = '#c8c8c0';
    ctx.fillRect(7, 10, 18, 2);
    ctx.fillStyle = '#c92e1f';                       // blanket
    ctx.fillRect(7, 12, 18, 15);
    ctx.fillStyle = '#a82318';
    ctx.fillRect(7, 12, 18, 3);
    ctx.fillStyle = '#e8473a';
    ctx.fillRect(7, 17, 18, 2);
  });
  make('grave', ctx => {
    ctx.fillStyle = '#3e4248';                       // dirt mound shadow
    ctx.fillRect(4, 26, 24, 4);
    ctx.fillStyle = '#8d8d94';                       // stone
    ctx.fillRect(8, 8, 16, 20);
    ctx.fillRect(10, 4, 12, 6);
    ctx.fillStyle = '#a8a8b0';
    ctx.fillRect(10, 4, 12, 2); ctx.fillRect(8, 8, 3, 20);
    ctx.fillStyle = '#55555e';                       // engraving
    ctx.fillRect(14, 10, 4, 10); ctx.fillRect(11, 13, 10, 3);
  });
  make('spike', ctx => {
    ctx.fillStyle = '#7e5527';                       // plank base
    ctx.fillRect(2, 6, 28, 22);
    ctx.fillStyle = '#5f3e1c';
    ctx.fillRect(2, 24, 28, 4);
    ctx.fillStyle = '#c8c8d0';                       // spikes
    for (let i = 0; i < 4; i++) {
      const x = 5 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x, 22); ctx.lineTo(x + 3, 6); ctx.lineTo(x + 6, 22);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e8e8f0';
    for (let i = 0; i < 4; i++) ctx.fillRect(7 + i * 7, 8, 1, 8);
  });
  make('tnt_trap', ctx => {
    ctx.fillStyle = '#6b4628';                       // disturbed dirt mound
    ctx.beginPath(); ctx.ellipse(16, 22, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8c1e10';                       // tnt poking out
    ctx.fillRect(7, 8, 18, 12);
    ctx.fillStyle = '#d83020';
    ctx.fillRect(7, 8, 18, 4);
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(7, 13, 18, 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(13, 13, 6, 4);                      // 'TNT' band mark
    ctx.fillStyle = '#3a3a3a';                       // fuse
    ctx.fillRect(15, 4, 2, 5);
  });
  make('scarecrow', ctx => {
    ctx.fillStyle = '#5d3a1e';                       // post + arms
    ctx.fillRect(14, 8, 4, 22);
    ctx.fillRect(4, 12, 24, 4);
    ctx.fillStyle = '#c8a23e';                       // straw hands/skirt
    ctx.fillRect(2, 12, 3, 6); ctx.fillRect(27, 12, 3, 6);
    ctx.fillRect(11, 26, 10, 5);
    ctx.fillStyle = '#e07820';                       // pumpkin head
    ctx.fillRect(9, 0, 14, 11);
    ctx.fillStyle = '#b85a10';
    ctx.fillRect(9, 8, 14, 3);
    ctx.fillStyle = '#2a1a08';                       // face
    ctx.fillRect(12, 3, 3, 3); ctx.fillRect(18, 3, 3, 3);
    ctx.fillRect(13, 7, 6, 2);
  });
  make('cave', ctx => {
    ctx.fillStyle = '#6f6f78';                       // rock rim
    ctx.beginPath(); ctx.ellipse(16, 18, 16, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#55555e';
    ctx.beginPath(); ctx.ellipse(16, 16, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a10';                       // the void
    ctx.beginPath(); ctx.ellipse(16, 17, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d83030';                       // eyes in the dark
    ctx.fillRect(10, 15, 2, 2); ctx.fillRect(20, 18, 2, 2);
    ctx.fillStyle = '#8d8d94';                       // rim highlights
    ctx.fillRect(4, 8, 5, 3); ctx.fillRect(22, 6, 6, 3); ctx.fillRect(14, 4, 4, 3);
  });
  make('stairs', ctx => {
    ctx.fillStyle = '#5d3a1e';
    ctx.fillRect(2, 2, 28, 28);
    ctx.fillStyle = '#9a6b35';
    for (let i = 0; i < 5; i++) ctx.fillRect(4 + i * 2, 24 - i * 5, 24 - i * 4, 4);
    ctx.fillStyle = '#b07f42';
    for (let i = 0; i < 5; i++) ctx.fillRect(4 + i * 2, 24 - i * 5, 24 - i * 4, 1);
  });

  const drill = (key, bitColor, bitHi) => make(key, ctx => {
    ctx.fillStyle = '#6f6f78';                     // base
    ctx.fillRect(4, 20, 24, 10);
    ctx.fillStyle = '#83838c';
    ctx.fillRect(4, 20, 24, 3);
    ctx.fillStyle = '#5d3a1e';                     // frame
    ctx.fillRect(8, 6, 4, 16); ctx.fillRect(20, 6, 4, 16);
    ctx.fillRect(6, 4, 20, 4);
    ctx.fillStyle = bitColor;                      // drill bit
    ctx.beginPath();
    ctx.moveTo(12, 10); ctx.lineTo(20, 10); ctx.lineTo(16, 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = bitHi;
    ctx.fillRect(14, 10, 2, 8);
  });
  drill('drill1', '#9aa2ae', '#c8d0dc');
  drill('drill2', '#f5c842', '#ffe89a');
  drill('drill3', '#35c8be', '#9af0ea');

  make('campfire', ctx => {
    ctx.fillStyle = '#5d3a1e';
    ctx.save(); ctx.translate(16, 24);
    ctx.rotate(0.5); ctx.fillRect(-12, -3, 24, 5);
    ctx.rotate(-1.0); ctx.fillRect(-12, -3, 24, 5);
    ctx.restore();
    ctx.fillStyle = '#ff8a20'; ctx.fillRect(11, 8, 10, 12);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(13, 12, 6, 8);
    ctx.fillStyle = '#fff0a0'; ctx.fillRect(14, 16, 4, 4);
  });
}

// ---------- items / pickups / projectiles ----------
function makeItemTextures(scene) {
  pixelTex(scene, 'drop_wood', [
    '.bbbbbb.',
    'bBBBBBBb',
    'bBwwwwBb',
    'bBwBBwBb',
    'bBwwwwBb',
    'bBBBBBBb',
    '.bbbbbb.',
  ], { b: '#5d3a1e', B: '#8a5a2b', w: '#b07f42' });

  pixelTex(scene, 'drop_stone', [
    '..ssss..',
    '.ssssss.',
    'sssSSsss',
    'ssSSSSss',
    'sssssss.',
    '.ssssss.',
    '..ssss..',
  ], { s: '#8d8d94', S: '#a8a8b0' });

  pixelTex(scene, 'drop_iron', [
    '........',
    '.iiiiii.',
    'iIIIIIIi',
    'iIIIIIIi',
    '.iiiiii.',
    '........',
  ], { i: '#a89888', I: '#d8c8b8' });

  pixelTex(scene, 'drop_gold', [
    '........',
    '.gggggg.',
    'gGGGGGGg',
    'gGGGGGGg',
    '.gggggg.',
    '........',
  ], { g: '#c89a20', G: '#f5c842' });

  pixelTex(scene, 'drop_diamond', [
    '...dd...',
    '..dDDd..',
    '.dDDDDd.',
    'dDDDDDDd',
    '.dDDDDd.',
    '..dDDd..',
    '...dd...',
  ], { d: '#1e9890', D: '#4ee0d8' });

  pixelTex(scene, 'drop_apple', [
    '...s....',
    '..ss....',
    '.rrrrr..',
    'rrRrrrr.',
    'rRRrrrr.',
    'rrrrrrr.',
    '.rrrrr..',
    '..rrr...',
  ], { r: '#d83030', R: '#ff7a6a', s: '#2e6b1e' });

  pixelTex(scene, 'gem', [
    '..gg..',
    '.gGGg.',
    'gGGGGg',
    'gGGGGg',
    '.gGGg.',
    '..gg..',
  ], { g: '#1f8a18', G: '#52e83e' });

  pixelTex(scene, 'coin', [
    '..cc..',
    '.cCCc.',
    'cCcCCc',
    'cCcCCc',
    '.cCCc.',
    '..cc..',
  ], { c: '#c89a20', C: '#ffd95e' });

  pixelTex(scene, 'drop_fish', [
    '...ff..f',
    '.ffFFf.f',
    'fFFeFFff',
    '.ffFFf.f',
    '...ff..f',
  ], { f: '#4a8ac8', F: '#7ab8e8', e: '#1a1a1a' });

  pixelTex(scene, 'arrow', [
    'ww.ssssss.t',
    'wwsssssssttt',
    'ww.ssssss.t',
  ], { s: '#b07f42', w: '#e8e8e0', t: '#d8d8d8' });

  pixelTex(scene, 'bolt', [
    '.ssssssss.tt',
    'sssssssssttt',
    '.ssssssss.tt',
  ], { s: '#4a4f5c', t: '#c8e8ff' });

  pixelTex(scene, 'fireball', [
    '..oo..',
    '.oYYo.',
    'oYWWYo',
    'oYWWYo',
    '.oYYo.',
    '..oo..',
  ], { o: '#ff5a10', Y: '#ffb020', W: '#fff0a0' });

  pixelTex(scene, 'axe_proj', [
    '..ww....',
    '.wWWw...',
    'wWWWWhh.',
    'wWWWhhhh',
    '.wWWhh..',
    '..whh...',
    '...hh...',
    '...hh...',
  ], { w: '#c8c8d0', W: '#e8e8f0', h: '#5d3a1e' });

  pixelTex(scene, 'blade', [
    '...ww...',
    '..wWWw..',
    '.wWWWWw.',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wWWw..',
    '...ww...',
  ], { w: '#8a9ab0', W: '#dde8f5' });

  pixelTex(scene, 'shard', [
    '...ii...',
    '..iIIi..',
    '.iIWWIi.',
    'iIWWWWIi',
    '.iIWWIi.',
    '..iIIi..',
    '...ii...',
  ], { i: '#3a8ac8', I: '#7ad8ff', W: '#d8f4ff' });

  pixelTex(scene, 'boomerang', [
    'bbbb....',
    'bBBbb...',
    '.bBBb...',
    '..bBBb..',
    '...bBBbb',
    '...bbBBb',
    '....bbbb',
  ], { b: '#7e5527', B: '#b07f42' });

  pixelTex(scene, 'tnt', [
    '.rrrrrr.',
    'rRRRRRRr',
    'rRRRRRRr',
    'wwwwwwww',
    'wTwwTwww',
    'wwwwwwww',
    'rRRRRRRr',
    '.rrrrrr.',
  ], { r: '#8c1e10', R: '#d83020', w: '#e8e0d0', T: '#1a1a1a' });

  pixelTex(scene, 'enemy_arrow', [
    't.ssssss.ww',
    'tttsssssssww',
    't.ssssss.ww',
  ], { s: '#888', w: '#e8e8e0', t: '#aaa' });
}

// ---------- effects ----------
function makeEffectTextures(scene) {
  // soft radial glow
  if (!scene.textures.exists('glow')) {
    const canv = scene.textures.createCanvas('glow', 128, 128);
    const ctx = canv.getContext();
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,220,150,0.85)');
    g.addColorStop(0.4, 'rgba(255,190,100,0.32)');
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    canv.refresh();
  }

  // sword slash arc
  if (!scene.textures.exists('slash')) {
    const canv = scene.textures.createCanvas('slash', 96, 96);
    const ctx = canv.getContext();
    ctx.lineCap = 'round';
    for (const [w, col] of [[16, 'rgba(255,255,255,0.25)'], [10, 'rgba(255,255,255,0.55)'], [5, 'rgba(255,255,255,0.95)']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(48, 48, 36, -1.1, 1.1);
      ctx.stroke();
    }
    canv.refresh();
  }

  // lightning bolt (jagged)
  if (!scene.textures.exists('bolt_strike')) {
    const canv = scene.textures.createCanvas('bolt_strike', 28, 80);
    const ctx = canv.getContext();
    ctx.lineCap = 'round';
    const pts = [[14, 0]];
    for (let y = 12; y <= 80; y += 12) pts.push([6 + Math.random() * 16, y]);
    for (const [w, col] of [[9, 'rgba(140,200,255,0.4)'], [5, 'rgba(200,235,255,0.8)'], [2, '#ffffff']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.stroke();
    }
    canv.refresh();
  }

  // single white pixel block for particles
  if (!scene.textures.exists('px')) {
    const canv = scene.textures.createCanvas('px', 4, 4);
    const ctx = canv.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
    canv.refresh();
  }

  // explosion ring
  if (!scene.textures.exists('ring')) {
    const canv = scene.textures.createCanvas('ring', 96, 96);
    const ctx = canv.getContext();
    ctx.strokeStyle = 'rgba(255,200,80,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(48, 48, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(48, 48, 40, 0, Math.PI * 2);
    ctx.stroke();
    canv.refresh();
  }
}
