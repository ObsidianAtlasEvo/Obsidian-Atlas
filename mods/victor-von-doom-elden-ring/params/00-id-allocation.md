# regulation.bin — ID Allocation Map

To stay merge-friendly (§2/§49) we **add rows in reserved ID ranges** rather than overwrite
vanilla rows wherever possible. Before building, confirm each range is unused in *your*
regulation version in Smithbox (`[VERIFY]` — vanilla ER uses IDs well below these; large mods
may collide, so pick a free band if needed).

These are conventional free bands, not engine-fixed values. Field names below are the standard
Paramdex names shipped with Smithbox; still `[VERIFY]` against your version.

## Reserved ID bands (base offsets)

| Param | Band start | Count | Purpose |
|---|---|---|---|
| `SpEffectParam` | 7 700 000 | 2000 | mode/stone/xf tags, resource meters, buffs, debuffs, on-hit effects |
| `Magic` | 7 700 | 400 | all castable spell rows (Doom tech/sorcery, Odin, Stone spells) |
| `Bullet` | 7 700 000 | 2000 | projectiles (mirrors SpEffect band for readability) |
| `SwordArtsParam` | 7 700 | 200 | Ash-of-War definitions (shields, teleport, throws, melee arts) |
| `Behavior` (PC) | 7 700 000 | 2000 | attack behaviors linking arts→AtkParam |
| `AtkParam_Pc` | 7 700 000 | 2000 | hitbox/damage/knockback rows |
| `EquipParamWeapon` | 7 700 000 | 100 | Mjolnir (+ empty-hand variant), catalysts |
| `EquipParamProtector` | 7 700 000 | 100 | Doom armor parts |
| `EquipParamAccessory` | 7 700 | 100 | passive-system "armor" talismans |
| `EquipParamGoods` | 7 700 | 100 | Doom Console, transformation activators, Stone selectors |
| `NpcParam` | 7 700 000 | 100 | Doombot, spectral summons |
| `ItemLotParam_map` | 7 700 000 | 100 | how the player obtains the items |
| `ShopLineupParam` | 7 700 | 100 | Doom Console shop entries (if shop-style) |
| FXR IDs (in ffxbnd) | 7 700 000 | 1000 | all new particle effects |

## Tag SpEffect IDs (state layer — see docs/01 §B.1)

| ID | Name | Notes |
|---|---|---|
| 7700000 | `MODE_DOOM` | exclusive mode group A |
| 7700001 | `MODE_DOOM_SORCERY` | |
| 7700002 | `MODE_MJOLNIR` | |
| 7700003 | `MODE_ODIN` | |
| 7700004 | `MODE_STONE` | |
| 7700005 | `MODE_COSMIC` | |
| 7700010..15 | `STONE_SEL_SPACE/MIND/REALITY/POWER/TIME/SOUL` | exclusive group B |
| 7700020 | `XF_ODINFORCE` | transformation, timed |
| 7700021 | `XF_INFINITY` | requires 6 stones owned |
| 7700022 | `XF_EMPEROR` | requires all |
| 7700030 | `HAMMER_THROWN` | hammer-out state |
| 7700031 | `STORM_ACTIVE` | weather boost tag |
| 7700040 | `AMP_NEXT` | Power-Stone "empower next cast" |
| 7700050 | `IS_BOSS` | placed on boss NpcParam to route CC to resistant branch |
| 7700060 | `CFG_LORE` | Lore-Accurate mode (else Balanced) |
| 7700061..75 | `CFG_MOD_*_OFF` | per-module disable toggles |
| 7700080 | `OWN_ARMOR` / 81 `OWN_MJOLNIR` / 82 `OWN_ODIN` / 83 `OWN_6STONES` | ownership gates for Emperor |

## Resource-meter representation (docs/01 §B.2)
Meters are EMEVD integer variables, not single SpEffects (SpEffect values don't hold arbitrary
counters cleanly). The mapping:

| Meter | EMEVD var | Regen/sec (LA / B) | Surfaced as |
|---|---|---|---|
| Armor Energy | `ARMOR_E` (0–100) | 25 / 6 | HUD gauge (doc 03 §UI) |
| Arcane Power | = FP | (natural) | FP bar |
| Divine Energy | `DIVINE_E` (0–100) | 20 / 5 (flood under Odinforce) | HUD gauge |
| Infinity Energy | `INF_E` (0–100) | 15 / 4 | HUD gauge |

The `CFG_LORE` tag selects which regen/cost constants EMEVD uses — one code path, two tables.
