# ⛏ BlockBonk — Survive the Night

A Minecraft × Vampire Survivors mashup with a tower-defense twist, built in Phaser 3.
All art is generated procedurally in code — no asset files, nothing to download
(Phaser itself loads from a CDN, so you need internet the first time).

> **🧊 3D prototype:** a Babylon.js proof of concept lives in [`3d/`](3d/) — same
> zero-build, CDN-loaded setup. Run the server below and open
> `http://localhost:8000/3d/`. It has the terrain, day/night cycle, mining and
> zombie nights in real 3D; it's a feel test, not the full game.

## Run it

Easiest (recommended):

```sh
cd ~/Documents/Game
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `Play.command`, which does that for you and opens the browser.
Opening `index.html` directly also works in most browsers.

## The loop

- **Day** (~1.5 min): walk into trees and rocks to auto-mine wood, stone, iron,
  gold and diamond. Blocks have HP like enemies — partial damage is remembered
  (and saved). Press **C** to craft pickaxes, swords, walls, turrets and traps.
  Place structures with **1–8** + click. Build a kill box. Stand by water to
  **fish** for food, coins and treasure.
- **Night** (~1.25 min): waves of zombies, spiders, skeletons and creepers swarm
  you. Your weapons fire automatically — your job is positioning, your base does
  the rest. Every 3rd night a **Zombie Brute** boss shows up.
- Kill mobs → collect emeralds and **coins** → level up → pick 1 of 3 upgrades,
  Vampire Survivors style. Spend coins on **loot chests** in the craft menu.
  Nights get denser forever. See how many days you last.
- **11 weapons, all scaling to level 99** (sword, bow, axe, orbiting blades,
  TNT, lightning, blaze rod, frost shard, boomerang, shard nova, bonk aura —
  max 7 per run). Upgrade cards show exactly what changes: damage, fire rate,
  projectile count, area, pierce.
- **12 passives** including the ability boosters: 🔍 area, 🪬 +1 quantity to
  everything, 💨 projectile speed, 🎲 crits, 🌿 regen.
- **Monster Dens** dot the rocky wilds: endless spawners — endless XP, if you
  can take the heat. Nature **regrows** a chunk of harvested blocks every dawn.
- **Six RuneScape-style skills** level as you play: ⛏ Mining, 🎣 Fishing,
  ⚔ Combat, 🔨 Building (+structure HP), ⚒ Forging (cheaper crafting),
  🐾 Taming (stronger critters, better catches).
- **✨ Prestige** (pause menu, day 8+): reset the world but keep your skills,
  critters, and blueprints — and gain permanent +15% damage & XP, +20 max HP
  per ascension. Stack it forever.
  Fishing has a proper cast: line, bobber, and a "❗" dip right before the bite.
- **Wild critters** rustle in **tall grass** — a battle starts! If you have a
  conscious critter, YOUR PARTY fights it Pokémon-style (your weapons hold fire,
  and your critters never finish it — they leave it at 1 HP for your orb).
  Throw a **Catch Orb [F]** — lower HP, better odds. If your whole party faints,
  your weapons step in.
  - **Common**: 🐺 Wolf / 🐝 Bee (fighters) · 🦫 Beaver (chops trees) ·
    🗿 Golem (mines rock & ore, pickaxe-gated)
  - **Rare ✨** (~15%): 🦊 Fox (heavy hitter) · 🦉 Owl (blinding speed) ·
    🦡 Badger (digs rock AND trees)
  - **Legendary 🌟** (~2.5%, doubled at night): 🐉 **Dragon** (fire splash hits
    the whole crowd) · 🔥 **Phoenix** (rebirths from the ashes once per day
    instead of fainting) · ❄️ **Yeti** (massive, chills enemies to a crawl)
  - Rarer critters are far harder to catch (legendaries ~⅓ the odds) — stock up
    on orbs before engaging one.
- **Build an army**: party starts at 3 — buy extra slots with coins (each pricier
  than the last, up to 12). Extra catches go to your **critter box** ([B] to
  manage party, box, and the ⭐ guard).
- Critters have HP and can **faint** — they revive at dawn, by resting near a
  campfire, or instantly with a **Critter Tonic**. By day, non-guard critters
  roam and work a wide area around you; at night the whole army snaps back to
  fight at your side.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move (mining is automatic — walk into blocks) |
| C | crafting menu |
| 1–8 | select structure, click to place, right-click/ESC to cancel |
| 9 / 0 | drink Health / Strength potion |
| E | sleep in a nearby bed (night only, no monsters close) |
| right-click | dismantle your own wall/turret (when not placing) |
| ESC | pause |
| M | mute |

## Saves & death

- The game **autosaves at every dawn** (and via SAVE in the pause menu).
- On death you can **wake at the last dawn** in the same world, or start a new one.
- A **gravestone** holding half the resources you died with marks where you fell —
  an edge-of-screen arrow points the way back to it.
- A **Bed** lets you skip a night entirely: full heal, but you forfeit that
  night's XP. No sleeping with monsters nearby.

## Tips

- Iron ore needs a **Stone Pickaxe**, gold/diamond need an **Iron Pickaxe**.
- Zombies and skeletons burn at dawn — spiders and creepers don't.
- Creepers explode through walls. Kill them at range or run.
- Campfires heal you and light the night. Stand near one between waves.
- **Blueprints [G]**: drag a box around your fort to save its layout, then
  rebuild the whole thing anywhere from the craft menu at **30% off**.
- **Industry**: ⛏ **Drill Rigs** (3 tiers) auto-mine everything in their radius
  forever — resources go straight to your pockets, even while the tab is
  hidden. 🟫 **Stone Floors** make your fort +30% faster to walk. 🟣 **Obsidian
  Walls** (4000 HP) can only be damaged by Brutes, Treants & bosses — regular
  mobs and creeper blasts can't touch them.
- Nights are **endless waves** — they keep coming until dawn. Every 5th day is
  a **🌸 Bloom Day**: every harvested block on the map regrows.
- **Explore beyond the overworld** — three gates are hidden in the wilds:
  - 🕳️ **The Deep Cave** — pitch-dark tunnels packed with ore (~50% ore density,
    heavy on gold & diamond). Bats and slimes live there. Fresh layout every day.
  - 🏛️ **The Dungeon** — a daily boss arena. The **Dungeon Lord** grows ~55%
    stronger with every clear. Slay him for diamonds, coin showers, and a free
    weapon upgrade. Gate seals until dawn after each kill.
  - 🌀 **The Rift** — an endless corrupted arena, pure Vampire Survivors mode:
    waves never stop and scale harder the longer you stay. Leave via the portal
    — if you can reach it.
- The **🌲 Dense Forest** (northwest) crawls with **Treants** — tree monsters
  that drop wood when felled.
- Walls funnel mobs into turret fire, but mobs chew through them. Four tiers:
  wood (150 HP) → stone (420) → **iron (1100)** → **diamond (2600)**. Every dawn
  your walls and turrets **self-repair 35%** — a surviving base compounds.
- Chopped trees sometimes drop **apples** (instant heal). Brew **potions** with
  gold before things get spicy, and grab the **Enchanted Book** passive to
  level faster.
- A banner + orange clock warn you **1 minute before nightfall**.

## Files

```
index.html      page + HUD/menus (DOM overlay UI)
js/data.js      all tuning: weapons, passives, recipes, turrets, enemies, day length
js/textures.js  procedural pixel art (tiles, mobs, items, effects)
js/world.js     terrain generation (noise), mining, drops
js/weapons.js   auto-attack weapons, damage, explosions
js/enemies.js   mob AI, spawner, day/night waves, boss
js/turrets.js   placement system + turret behaviors
js/ui.js        HUD, crafting menu, level-up cards
js/main.js      game scene, player, day/night cycle, collisions
js/sfx.js       synthesized sound effects (WebAudio, no files)
```

Balance lives almost entirely in `js/data.js` — tweak numbers there.
