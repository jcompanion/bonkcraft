// ---------- static game data: weapons, passives, recipes, enemies, tiles ----------

const TILE = 32;
const MAP_W = 180;
const MAP_H = 180;

// tile indices in the generated tileset
const T = {
  GRASS: 0, GRASS2: 1, DIRT: 2, SAND: 3, WATER: 4,
  TREE: 5, STONE: 6, IRON: 7, GOLD: 8, DIAMOND: 9,
  WOODWALL: 10, STONEWALL: 11,
  TALLGRASS: 12, // walkable — wild critters lurk here
  IRONWALL: 13, DIAMONDWALL: 14,
  BEDROCK: 15,   // unbreakable — cave & dungeon shell
  FLOOR: 17,        // placeable flooring — +30% move speed at home
  OBSIDIANWALL: 18, // only the BIG monsters can crack it
};

// the tile grid extends below the overworld to hold interior areas
const GRID_H = 372;
// floor 2: a misty balcony layer over your fort, anchored to staircases
const LOFT_Y = 340;   // legacy platform region (kept for save migration)
const LOFT_RECTS = [0, 1, 2, 3].map(i => ({ x: 8 + i * 36, y: LOFT_Y, w: 30, h: 24 }));
const MAX_LOFTS = 4;  // max staircases
const DECK_HW = 5;    // deck half-width  (11 tiles wide per staircase)
const DECK_HH = 4;    // deck half-height (9 tiles tall)
const FALL_DAMAGE = 0.15; // % of max HP when the stairs collapse under you
const CAVE_RECT = { x: 10, y: 196, w: 62, h: 52 };
const DUNGEON_RECT = { x: 104, y: 196, w: 52, h: 44 };
const RIFT_RECT = { x: 24, y: 268, w: 110, h: 56 };
const DENSE_FOREST = { x0: 8, y0: 8, x1: 64, y1: 64 }; // thick woods, treant country
const T_CORRUPT = 16; // rift ground tile

function isWallTile(idx) {
  return idx === T.WOODWALL || idx === T.STONEWALL || idx === T.IRONWALL || idx === T.DIAMONDWALL || idx === T.OBSIDIANWALL;
}

// mineable block info: resource drops, base mine time (s), pickaxe tier required,
// HP (shared pool — player mining, mob chewing, and explosions all damage it), XP for breaking it
const BLOCK_INFO = {
  [T.TREE]:     { drops: { wood: 3 },               time: 1.1, tier: 0, hp: 50,  xp: 2 },
  [T.STONE]:    { drops: { stone: 2 },              time: 1.8, tier: 0, hp: 120, xp: 2 },
  [T.IRON]:     { drops: { iron: 2, stone: 1 },     time: 2.6, tier: 1, hp: 150, xp: 4 },
  [T.GOLD]:     { drops: { gold: 2 },               time: 3.0, tier: 2, hp: 150, xp: 6 },
  [T.DIAMOND]:  { drops: { diamond: 1 },            time: 4.0, tier: 2, hp: 180, xp: 10 },
  [T.WOODWALL]: { drops: { wood: 1 },               time: 0.4, tier: 0, hp: 150,  xp: 0 },
  [T.STONEWALL]:{ drops: { stone: 2 },              time: 0.7, tier: 0, hp: 420,  xp: 0 },
  [T.IRONWALL]: { drops: { iron: 1 },               time: 0.9, tier: 0, hp: 1100, xp: 0 },
  [T.DIAMONDWALL]: { drops: { diamond: 1 },         time: 1.2, tier: 0, hp: 2600, xp: 0 },
  [T.OBSIDIANWALL]: { drops: { diamond: 2 },        time: 1.5, tier: 0, hp: 4000, xp: 0 },
};

// dawn structure repair: walls & turrets self-mend this fraction each morning
const DAWN_REPAIR = 0.35;

// dawn regrowth: fraction of harvested blocks that may return each morning, by type
const REGROW_CHANCE = { [T.TREE]: 1.0, [T.STONE]: 0.85, [T.IRON]: 0.6, [T.GOLD]: 0.5, [T.DIAMOND]: 0.4 };

const PICKAXES = [
  { name: 'Wooden Pickaxe',  speed: 1.0, icon: '⛏' },
  { name: 'Stone Pickaxe',   speed: 1.6, icon: '⛏' },
  { name: 'Iron Pickaxe',    speed: 2.4, icon: '⛏' },
  { name: 'Diamond Pickaxe', speed: 3.5, icon: '⛏' },
];

// ---------- auto-attack weapons (Vampire Survivors style), max level 99 ----------
// stats are smooth formulas: damage grows steadily, fire rate compounds toward a
// floor, counts/areas hit milestones — so every level-up means something.
const WEAPONS = {
  sword: {
    name: 'Bonk Sword', icon: '🗡️', maxLevel: 99,
    desc: 'Swings at the nearest enemy.',
    stats: l => ({
      cd: Math.max(0.32, 1.1 * Math.pow(0.988, l - 1)),
      dmg: Math.round(12 * (1 + 0.16 * (l - 1))),
      range: 62 + Math.min(l, 45) * 1.3,
      arc: Math.min(3.2, 2.1 + 0.02 * l),
      double: l >= 8,
    }),
  },
  bow: {
    name: 'Bow', icon: '🏹', maxLevel: 99,
    desc: 'Fires arrows at the nearest enemy.',
    stats: l => ({
      cd: Math.max(0.30, 1.25 * Math.pow(0.985, l - 1)),
      dmg: Math.round(10 * (1 + 0.15 * (l - 1))),
      count: Math.min(9, 1 + Math.floor(l / 5)),
      pierce: Math.min(6, Math.floor(l / 8)),
      speed: 430 + 3 * l,
    }),
  },
  axe: {
    name: 'Throwing Axe', icon: '🪓', maxLevel: 99,
    desc: 'Lobs heavy spinning axes. Big damage.',
    stats: l => ({
      cd: Math.max(0.55, 1.7 * Math.pow(0.985, l - 1)),
      dmg: Math.round(26 * (1 + 0.17 * (l - 1))),
      count: Math.min(8, 1 + Math.floor(l / 6)),
    }),
  },
  orbit: {
    name: 'Orbiting Blades', icon: '🌀', maxLevel: 99,
    desc: 'Blades circle you and shred whatever they touch.',
    stats: l => ({
      count: Math.min(14, 2 + Math.floor(l / 4)),
      dmg: Math.round(10 * (1 + 0.15 * (l - 1))),
      radius: 70 + Math.min(l, 60),
      rotSpeed: 2.6 + 0.03 * l,
    }),
  },
  tnt: {
    name: 'TNT Toss', icon: '🧨', maxLevel: 99,
    desc: 'Throws TNT that explodes in an area.',
    stats: l => ({
      cd: Math.max(1.2, 3.6 * Math.pow(0.982, l - 1)),
      dmg: Math.round(40 * (1 + 0.18 * (l - 1))),
      radius: Math.min(220, 70 + 1.6 * l),
    }),
  },
  lightning: {
    name: 'Lightning Ring', icon: '⚡', maxLevel: 99,
    desc: 'Smites random enemies from above.',
    stats: l => ({
      cd: Math.max(0.8, 2.9 * Math.pow(0.984, l - 1)),
      dmg: Math.round(20 * (1 + 0.16 * (l - 1))),
      strikes: Math.min(12, 2 + Math.floor(l / 4)),
    }),
  },
  fireStaff: {
    name: 'Blaze Rod', icon: '🪄', maxLevel: 99,
    desc: 'Spits a rapid stream of fireballs.',
    stats: l => ({
      cd: Math.max(0.22, 0.9 * Math.pow(0.985, l - 1)),
      dmg: Math.round(8 * (1 + 0.15 * (l - 1))),
      count: Math.min(5, 1 + Math.floor(l / 7)),
      pierce: 1 + Math.floor(l / 15),
      speed: 320 + 2 * l,
    }),
  },
  frost: {
    name: 'Frost Shard', icon: '❄️', maxLevel: 99,
    desc: 'Icy shards that chill enemies to a crawl.',
    stats: l => ({
      cd: Math.max(0.4, 1.4 * Math.pow(0.985, l - 1)),
      dmg: Math.round(9 * (1 + 0.14 * (l - 1))),
      count: Math.min(6, 1 + Math.floor(l / 6)),
      slow: Math.min(3, 1.5 + 0.02 * l),
      speed: 380 + 2 * l,
    }),
  },
  boomerang: {
    name: 'Boomerang', icon: '🪃', maxLevel: 99,
    desc: 'Flies through the crowd — and back through it again.',
    stats: l => ({
      cd: Math.max(0.6, 1.8 * Math.pow(0.985, l - 1)),
      dmg: Math.round(18 * (1 + 0.16 * (l - 1))),
      count: Math.min(4, 1 + Math.floor(l / 8)),
      speed: 330 + 2 * l,
    }),
  },
  nova: {
    name: 'Shard Nova', icon: '💥', maxLevel: 99,
    desc: 'Bursts shards in every direction.',
    stats: l => ({
      cd: Math.max(1.0, 3.0 * Math.pow(0.983, l - 1)),
      dmg: Math.round(12 * (1 + 0.15 * (l - 1))),
      shards: Math.min(36, 8 + Math.floor(l / 3)),
      speed: 300 + 2 * l,
    }),
  },
  aura: {
    name: 'Bonk Aura', icon: '🧿', maxLevel: 99,
    desc: 'A bonking halo damages everything near you — and swats enemy arrows out of the air.',
    stats: l => ({
      dmg: Math.round(5 * (1 + 0.15 * (l - 1))),
      radius: Math.min(200, 70 + 1.5 * l),
    }),
  },
};
const MAX_OWNED_WEAPONS = 7;

// ---------- passives ----------
const PASSIVES = {
  boots:  { name: 'Swift Boots',  icon: '👢', maxLevel: 9, desc: '+7% move speed' },
  heart:  { name: 'Golden Heart', icon: '❤️', maxLevel: 9, desc: '+20 max HP (and heals 20)' },
  power:  { name: 'Power Totem',  icon: '💪', maxLevel: 9, desc: '+10% damage' },
  frenzy: { name: 'Frenzy Charm', icon: '🔥', maxLevel: 9, desc: '+8% attack speed' },
  magnet: { name: 'Emerald Magnet', icon: '🧲', maxLevel: 9, desc: '+35 pickup range' },
  armor:  { name: 'Iron Plating', icon: '🛡️', maxLevel: 9, desc: '-6% damage taken' },
  wisdom: { name: 'Enchanted Book', icon: '📖', maxLevel: 99, desc: '+10% XP gained' },
  area:   { name: 'Bonk Lens',    icon: '🔍', maxLevel: 9, desc: '+8% weapon area & blast size' },
  quantity: { name: 'Echo Totem', icon: '🪬', maxLevel: 3, desc: '+1 projectile / strike / blade on everything' },
  haste:  { name: 'Wind Charm',   icon: '💨', maxLevel: 9, desc: '+8% projectile speed' },
  crit:   { name: 'Lucky Dice',   icon: '🎲', maxLevel: 9, desc: '+5% crit chance (crits deal 2x)' },
  regen:  { name: 'Moss Heart',   icon: '🌿', maxLevel: 9, desc: '+0.6 HP/s regeneration' },
};

// ---------- crafting recipes ----------
// kind: 'placeable' adds to hotbar stock; 'upgrade' sets a flag; 'consume' instant effect
const RECIPES = [
  { id: 'woodWall',  kind: 'placeable', name: 'Wood Wall',      icon: '🪵', cost: { wood: 4 },                      desc: 'Cheap barrier. Mobs chew through it.' },
  { id: 'stoneWall', kind: 'placeable', name: 'Stone Wall',     icon: '🧱', cost: { stone: 6 },                     desc: 'Sturdy barrier. Holds the line.' },
  { id: 'ironWall',    kind: 'placeable', name: 'Iron Wall',    icon: '🔩', cost: { iron: 4, stone: 2 },            desc: 'Serious fortification — 1100 HP.' },
  { id: 'diamondWall', kind: 'placeable', name: 'Diamond Wall', icon: '🔷', cost: { diamond: 2, stone: 4 },         desc: 'Nigh-indestructible — 2600 HP.' },
  { id: 'obsidianWall', kind: 'placeable', name: 'Obsidian Wall', icon: '🟣', cost: { diamond: 5, iron: 8 },        desc: '4000 HP. Normal mobs CANNOT damage it — only Brutes, Treants & bosses can.' },
  { id: 'floorTile',    kind: 'placeable', name: 'Stone Floor',   icon: '🟫', cost: { stone: 2 },                   desc: 'Cozy fort flooring. You move +30% faster on it.' },
  { id: 'drill1', kind: 'placeable', name: 'Drill Rig',     icon: '🛠️', cost: { iron: 12, stone: 10 },        desc: 'Auto-mines nearby blocks forever. Resources go straight to you.' },
  { id: 'drill2', kind: 'placeable', name: 'Gold Drill',    icon: '⚙️', cost: { gold: 8, iron: 10 },          desc: 'Faster drill, wider reach.' },
  { id: 'drill3', kind: 'placeable', name: 'Diamond Drill', icon: '💠', cost: { diamond: 6, iron: 10 },       desc: 'Top-tier auto-miner. Industrial-grade idle.' },
  { id: 'campfire',  kind: 'placeable', name: 'Campfire',       icon: '🔥', cost: { wood: 6, stone: 2 },            desc: 'Heals you nearby. Lights the night.' },
  { id: 'arrowTurret',    kind: 'placeable', name: 'Arrow Turret',    icon: '🎯', cost: { wood: 12, stone: 6 },          desc: 'Shoots arrows at mobs. The classic.' },
  { id: 'crossbowTurret', kind: 'placeable', name: 'Crossbow Turret', icon: '⚙️', cost: { wood: 10, iron: 8 },           desc: 'Fast piercing bolts, long range.' },
  { id: 'flameTurret',    kind: 'placeable', name: 'Flame Turret',    icon: '🌋', cost: { stone: 8, iron: 6, gold: 2 },  desc: 'Short range fire hose. Melts crowds.' },
  { id: 'teslaTurret',    kind: 'placeable', name: 'Tesla Turret',    icon: '⚡', cost: { iron: 6, gold: 4, diamond: 2 }, desc: 'Chain lightning. Top of the line.' },
  { id: 'pick1', kind: 'upgrade', name: 'Stone Pickaxe',   icon: '⛏️', cost: { wood: 4, stone: 6 },   desc: 'Mine faster. Unlocks IRON ore.',    requires: null,    sets: { pickTier: 1 } },
  { id: 'pick2', kind: 'upgrade', name: 'Iron Pickaxe',    icon: '⛏️', cost: { wood: 4, iron: 8 },    desc: 'Mine faster. Unlocks GOLD & DIAMOND.', requires: 'pick1', sets: { pickTier: 2 } },
  { id: 'pick3', kind: 'upgrade', name: 'Diamond Pickaxe', icon: '⛏️', cost: { wood: 4, diamond: 4 }, desc: 'Mine everything, very fast.',       requires: 'pick2', sets: { pickTier: 3 } },
  { id: 'sword1', kind: 'upgrade', name: 'Stone Sword',   icon: '🗡️', cost: { wood: 2, stone: 8 },   desc: 'Bonk Sword damage +40%.',  requires: null,     sets: { swordTier: 1 } },
  { id: 'sword2', kind: 'upgrade', name: 'Iron Sword',    icon: '🗡️', cost: { wood: 2, iron: 8 },    desc: 'Bonk Sword damage +90%.',  requires: 'sword1', sets: { swordTier: 2 } },
  { id: 'sword3', kind: 'upgrade', name: 'Diamond Sword', icon: '🗡️', cost: { wood: 2, diamond: 5 }, desc: 'Bonk Sword damage +160%.', requires: 'sword2', sets: { swordTier: 3 } },
  { id: 'apple', kind: 'consume', name: 'Golden Apple', icon: '🍎', cost: { gold: 2 }, desc: 'Heal 50 HP instantly.' },
  { id: 'bed', kind: 'placeable', name: 'Bed', icon: '🛏️', cost: { wood: 10, stone: 4 }, desc: 'Sleep through the night ([E] nearby, no monsters close). Full heal — but you miss the XP.' },
  { id: 'spike',    kind: 'placeable', name: 'Spike Trap',  icon: '🔱', cost: { wood: 6, stone: 3 },  desc: 'Floor spikes shred mobs that walk over them. Wears out with use.' },
  { id: 'tntTrap',  kind: 'placeable', name: 'TNT Trap',    icon: '💥', cost: { wood: 5, gold: 2 },   desc: 'Buried TNT — explodes when a mob steps close. Also great for blast-mining.' },
  { id: 'scarecrow',kind: 'placeable', name: 'Scarecrow',   icon: '🎃', cost: { wood: 8, iron: 2 },   desc: 'Mobs attack it instead of you. A brave pumpkin.' },
  { id: 'armor1', kind: 'upgrade', name: 'Iron Armor',    icon: '🦺', cost: { iron: 10 },             desc: 'Take 10% less damage.', requires: null,     sets: { armorTier: 1 } },
  { id: 'armor2', kind: 'upgrade', name: 'Diamond Armor', icon: '💠', cost: { diamond: 4, iron: 4 },  desc: 'Take 20% less damage.', requires: 'armor1', sets: { armorTier: 2 } },
  { id: 'healthPotion',   kind: 'potion', name: 'Health Potion',   icon: '🧪', cost: { gold: 2 },          desc: 'Heal 60 HP. Drink mid-fight with [9].' },
  { id: 'strengthPotion', kind: 'potion', name: 'Strength Potion', icon: '💜', cost: { gold: 1, iron: 4 }, desc: '+50% damage for 30s. Drink with [0].' },
  { id: 'catchOrb',       kind: 'potion', name: 'Catch Orb',       icon: '🔴', cost: { iron: 2, gold: 1 }, desc: 'Throw at a wild critter with [F] to catch it. Weaken it first for better odds!' },
  { id: 'tonic',          kind: 'consume', name: 'Critter Tonic',  icon: '🧉', cost: { gold: 2, wood: 3 }, desc: 'Revive all fainted critters (60% HP) and heal the rest +30.' },
];

// chests bought with coins (shop section of the craft menu)
const CHESTS = [
  { id: 'woodChest',    kind: 'chest', tier: 1, name: 'Wooden Chest',  icon: '📦', cost: { coins: 25 },  desc: 'Random loot: resources or a potion.' },
  { id: 'ironChest',    kind: 'chest', tier: 2, name: 'Iron Chest',    icon: '🧰', cost: { coins: 60 },  desc: 'Better loot — rare metals, potions, maybe a weapon upgrade.' },
  { id: 'diamondChest', kind: 'chest', tier: 3, name: 'Diamond Chest', icon: '💎', cost: { coins: 140 }, desc: 'Top loot — guaranteed weapon upgrade or serious treasure.' },
];

const POTIONS = {
  healthPotion:   { icon: '🧪', key: '9', name: 'Health Potion' },
  strengthPotion: { icon: '💜', key: '0', name: 'Strength Potion' },
};
const POTION_ORDER = ['healthPotion', 'strengthPotion'];

// chance a mined tree drops a healing apple
const APPLE_CHANCE = 0.18;
const APPLE_HEAL = 15;

const SWORD_TIER_MULT = [1, 1.4, 1.9, 2.6];

// ---------- placeable structures ----------
const STRUCTURES = {
  woodWall:  { tile: T.WOODWALL,  icon: '🪵', name: 'Wood Wall' },
  stoneWall: { tile: T.STONEWALL, icon: '🧱', name: 'Stone Wall' },
  ironWall:    { tile: T.IRONWALL,    icon: '🔩', name: 'Iron Wall' },
  diamondWall: { tile: T.DIAMONDWALL, icon: '🔷', name: 'Diamond Wall' },
  campfire:       { turret: 'campfire', icon: '🔥', name: 'Campfire' },
  arrowTurret:    { turret: 'arrow',    icon: '🎯', name: 'Arrow Turret' },
  crossbowTurret: { turret: 'crossbow', icon: '⚙️', name: 'Crossbow Turret' },
  flameTurret:    { turret: 'flame',    icon: '🌋', name: 'Flame Turret' },
  teslaTurret:    { turret: 'tesla',    icon: '⚡', name: 'Tesla Turret' },
  bed:            { turret: 'bed',      icon: '🛏️', name: 'Bed' },
  obsidianWall:   { tile: T.OBSIDIANWALL, icon: '🟣', name: 'Obsidian Wall' },
  floorTile:      { floor: true,        icon: '🟫', name: 'Stone Floor' },
  drill1:         { turret: 'drill1',   icon: '🛠️', name: 'Drill Rig' },
  drill2:         { turret: 'drill2',   icon: '⚙️', name: 'Gold Drill' },
  drill3:         { turret: 'drill3',   icon: '💠', name: 'Diamond Drill' },
  spike:          { trap: 'spike',      icon: '🔱', name: 'Spike Trap' },
  tntTrap:        { trap: 'tntTrap',    icon: '💥', name: 'TNT Trap' },
  scarecrow:      { turret: 'scarecrow',icon: '🎃', name: 'Scarecrow' },
};
const HOTBAR_ORDER = ['woodWall', 'stoneWall', 'ironWall', 'diamondWall', 'obsidianWall', 'floorTile', 'campfire', 'arrowTurret', 'crossbowTurret', 'flameTurret', 'teslaTurret', 'drill1', 'drill2', 'drill3', 'bed', 'spike', 'tntTrap', 'scarecrow'];

const TURRET_INFO = {
  arrow:    { hp: 70,  range: 210, cd: 1.0,  dmg: 9,  tex: 'turret_arrow' },
  crossbow: { hp: 90,  range: 280, cd: 0.65, dmg: 14, tex: 'turret_crossbow', pierce: 2 },
  flame:    { hp: 110, range: 130, cd: 0.16, dmg: 4,  tex: 'turret_flame' },
  tesla:    { hp: 100, range: 190, cd: 1.4,  dmg: 18, tex: 'turret_tesla', chain: 4 },
  campfire: { hp: 60,  range: 100, cd: 1.0,  heal: 3, tex: 'campfire' },
  bed:      { hp: 80,  range: 0,   cd: 1.0,           tex: 'bed' },
  scarecrow:{ hp: 160, range: 0,   cd: 1.0,           tex: 'scarecrow', taunt: 240 },
  drill1:   { hp: 150, tex: 'drill1', mineDps: 14, mineR: 4 },
  drill2:   { hp: 200, tex: 'drill2', mineDps: 24, mineR: 5 },
  drill3:   { hp: 260, tex: 'drill3', mineDps: 38, mineR: 7 },
  spike:    { hp: 60,  tex: 'spike',    dmg: 7,  tick: 0.5 },
  tntTrap:  { hp: 1,   tex: 'tnt_trap', dmg: 70, radius: 90, trigger: 34, fuse: 0.5 },
};

// monster dens: endless cave spawners found in rocky areas
const DEN_COUNT = 3;
const DEN_RANGE = 340;       // player must be this close to wake a den
const DEN_RATE = 2.2;        // seconds between spawns
const DEN_MAX_ALIVE = 10;    // per den

// ---------- enemies ----------
const ENEMY_INFO = {
  zombie:   { hp: 30,  speed: 55,  dmg: 8,  xp: 2, tex: 'zombie',   touchR: 20, burns: true },
  spider:   { hp: 18,  speed: 100, dmg: 5,  xp: 1, tex: 'spider',   touchR: 22, burns: false },
  skeleton: { hp: 26,  speed: 62,  dmg: 7,  xp: 3, tex: 'skeleton', touchR: 20, burns: true, ranged: true, shootCd: 2.2, shootRange: 230 },
  creeper:  { hp: 26,  speed: 72,  dmg: 30, xp: 4, tex: 'creeper',  touchR: 20, burns: false, exploder: true, fuse: 0.8, blastR: 75 },
  brute:    { hp: 650, speed: 42,  dmg: 25, xp: 40, tex: 'brute',   touchR: 34, burns: false, boss: true, big: true },
  // wild critters — catch them with orbs ([F]) instead of killing them
  wild_wolf:   { hp: 80,  speed: 85,  dmg: 6, xp: 5, tex: 'pet_wolf',   touchR: 18, burns: false, wild: 'wolf' },
  wild_bee:    { hp: 50,  speed: 120, dmg: 4, xp: 5, tex: 'pet_bee',    touchR: 16, burns: false, wild: 'bee' },
  wild_beaver: { hp: 65,  speed: 90,  dmg: 5, xp: 5, tex: 'pet_beaver', touchR: 18, burns: false, wild: 'beaver' },
  wild_golem:  { hp: 130, speed: 55,  dmg: 9, xp: 8, tex: 'pet_golem',  touchR: 20, burns: false, wild: 'golem' },
  // rare
  wild_fox:    { hp: 110, speed: 130, dmg: 8,  xp: 10, tex: 'pet_fox',    touchR: 18, burns: false, wild: 'fox' },
  wild_owl:    { hp: 90,  speed: 150, dmg: 7,  xp: 10, tex: 'pet_owl',    touchR: 18, burns: false, wild: 'owl' },
  wild_badger: { hp: 140, speed: 95,  dmg: 9,  xp: 10, tex: 'pet_badger', touchR: 18, burns: false, wild: 'badger' },
  // legendary
  wild_dragon:  { hp: 380, speed: 95,  dmg: 16, xp: 30, tex: 'pet_dragon',  touchR: 26, burns: false, wild: 'dragon' },
  wild_phoenix: { hp: 260, speed: 140, dmg: 12, xp: 30, tex: 'pet_phoenix', touchR: 24, burns: false, wild: 'phoenix' },
  wild_yeti:    { hp: 450, speed: 65,  dmg: 20, xp: 30, tex: 'pet_yeti',    touchR: 26, burns: false, wild: 'yeti' },
  // biome & interior dwellers
  treant: { hp: 130, speed: 38,  dmg: 16, xp: 7,  tex: 'treant', touchR: 22, burns: false, big: true },
  bat:    { hp: 24,  speed: 135, dmg: 6,  xp: 3,  tex: 'bat',    touchR: 16, burns: false, wobbles: true },
  slime:  { hp: 90,  speed: 42,  dmg: 14, xp: 5,  tex: 'slime',  touchR: 20, burns: false },
  dungeonlord: { hp: 1200, speed: 52, dmg: 28, xp: 60, tex: 'dungeonlord', touchR: 34, burns: false, boss: true, big: true },
};

// ---------- pets (caught critters that follow & work for you) ----------
const PETS = {
  // common (rarity 1)
  wolf:   { name: 'Wolf',   icon: '🐺', tex: 'pet_wolf',   rarity: 1, role: 'fighter', hp: 70,  dmg: 11, speed: 175, atkCd: 0.8 },
  bee:    { name: 'Bee',    icon: '🐝', tex: 'pet_bee',    rarity: 1, role: 'fighter', hp: 45,  dmg: 6,  speed: 215, atkCd: 0.45 },
  beaver: { name: 'Beaver', icon: '🦫', tex: 'pet_beaver', rarity: 1, role: 'lumber',  hp: 55,  dmg: 5,  speed: 160, atkCd: 1.0, mines: 'tree', mineDps: 22 },
  golem:  { name: 'Golem',  icon: '🗿', tex: 'pet_golem',  rarity: 1, role: 'miner',   hp: 110, dmg: 9,  speed: 115, atkCd: 1.2, mines: 'rock', mineDps: 15 },
  // rare (rarity 2)
  fox:    { name: 'Fox',    icon: '🦊', tex: 'pet_fox',    rarity: 2, role: 'fighter', hp: 65,  dmg: 18, speed: 200, atkCd: 0.6 },
  owl:    { name: 'Owl',    icon: '🦉', tex: 'pet_owl',    rarity: 2, role: 'fighter', hp: 50,  dmg: 12, speed: 245, atkCd: 0.4 },
  badger: { name: 'Badger', icon: '🦡', tex: 'pet_badger', rarity: 2, role: 'digger',  hp: 85,  dmg: 8,  speed: 140, atkCd: 1.0, mines: 'any', mineDps: 30 },
  // legendary (rarity 3)
  dragon:  { name: 'Dragon',  icon: '🐉', tex: 'pet_dragon',  rarity: 3, role: 'fighter', hp: 200, dmg: 32, speed: 165, atkCd: 0.9, splash: 60 },
  phoenix: { name: 'Phoenix', icon: '🔥', tex: 'pet_phoenix', rarity: 3, role: 'fighter', hp: 120, dmg: 20, speed: 230, atkCd: 0.55, rebirth: true },
  yeti:    { name: 'Yeti',    icon: '❄️', tex: 'pet_yeti',    rarity: 3, role: 'fighter', hp: 280, dmg: 26, speed: 120, atkCd: 1.1, slow: true },
};
const PET_ROLES = {
  fighter: 'fights at your side',
  lumber: 'chops nearby trees for you',
  miner: 'mines nearby rock & ore for you',
  digger: 'mines rock AND chops trees for you',
};
const RARITY = {
  1: { name: '',           color: '#5a4a7c', catchMult: 1.0 },
  2: { name: 'RARE ✨',     color: '#8a5ac8', catchMult: 0.6 },
  3: { name: 'LEGENDARY 🌟', color: '#d8a020', catchMult: 0.35 },
};
const RARE_WILDS = ['fox', 'owl', 'badger'];
const LEGENDARY_WILDS = ['dragon', 'phoenix', 'yeti'];
const MAX_PETS = 12;        // hard ceiling
const BASE_PET_CAP = 3;     // starting party size — buy more slots with coins
const PET_SLOT_BASE_COST = 40;
const PET_SLOT_COST_MULT = 1.9;
const WILD_WEIGHTS = [['wolf', 0.30], ['bee', 0.30], ['beaver', 0.25], ['golem', 0.15]];
const ENCOUNTER_CD = 16;      // seconds between encounters
const ENCOUNTER_CHANCE = 0.16; // roll per ~0.8s walking in tall grass
const WILD_LIFETIME = 25;     // wanders off if not caught

// which enemy types appear from which night
// creepers & archer skeletons kept scarce — they're spice, not the meal
const NIGHT_POOLS = [
  ['zombie', 'zombie', 'spider'],                                            // night 1
  ['zombie', 'zombie', 'zombie', 'spider', 'spider', 'skeleton'],            // night 2
  ['zombie', 'zombie', 'zombie', 'spider', 'spider', 'skeleton', 'creeper'], // night 3+
  ['zombie', 'zombie', 'zombie', 'spider', 'spider', 'skeleton', 'creeper'], // night 5+
];

// day/night timing (seconds)
const DAY_LEN = 300;       // 5 minutes of mining, building, fishing, roaming
const NIGHT_LEN = 150;     // 2.5 minutes of endless horde
const FIRST_DAY_LEN = 300;
const BLOOM_EVERY = 5;     // every Nth day, dawn regrows EVERYTHING
