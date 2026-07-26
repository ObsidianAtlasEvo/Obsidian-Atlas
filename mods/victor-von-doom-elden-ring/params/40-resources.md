# Resource & balance tables (LA = Lore-Accurate, B = Balanced)

Meters are EMEVD counters (docs/01 §B.2, params/00). `CFG_LORE` selects the column. One code
path reads these constants; edit here to rebalance without touching ability rows.

## 40.1 Regen (per second)
| Meter | LA | B |
|---|---|---|
| Armor Energy (`ARMOR_E`, 0–100) | 25 | 6 |
| Divine Energy (`DIVINE_E`) | 20 | 5 (flood to +60/s while `XF_ODINFORCE`) |
| Infinity Energy (`INF_E`) | 15 | 4 |
| FP (Arcane) | vanilla + talisman | vanilla |

## 40.2 Global damage multiplier vs vanilla (applied via EMEVD damage-up SpEffect)
| Source | LA ×mult | B ×mult |
|---|---|---|
| Doom Tech / Sorcery | 2.8 | 1.0 |
| Mjolnir | 3.2 | 1.05 |
| Odinforce (base) | 3.5 | 1.1 |
| Odinforce (while `XF_ODINFORCE`) | 5.0 | 1.4 |
| Infinity Stones (single) | 3.5 | 1.1 |
| Infinity Stones (`XF_INFINITY`) | 6.0 | 1.6 |
| Emperor Doom (`XF_EMPEROR`) | 8.0 | 2.0 |

(Balanced keeps the game challenging; LA is the intentional power fantasy, §1.)

## 40.3 Cooldowns (seconds) — burst/ultimate abilities
| Ability | LA | B |
|---|---|---|
| Charged Beam E4 | 4 | 6 |
| Doombot Cadre D2 | 12 | 20 |
| Emergency Field P7 | 45 | 60 |
| Odinforce transform | 60 | 90 |
| Stone ultimates (SP9/MI7/RE7/PO8/TI8/SO7) | 25 | 45 |
| Infinity ultimate | 90 | 180 |
| Emperor Doom | 180 | 300 |
| Time Stop TI8 | 25 | 45 |
| Temporal Reversal TI7 | 20 | 40 |

## 40.4 Transformation durations (seconds; never permanent, §39)
| State | LA | B |
|---|---|---|
| Odinforce `XF_ODINFORCE` | 60 | 30 |
| Infinity `XF_INFINITY` | 45 | 25 |
| Emperor `XF_EMPEROR` | 60 | 30 |

## 40.5 Meter costs (representative; full list in event/common_doom.js cost table)
| Ability | Meter | LA cost | B cost |
|---|---|---|---|
| Palm Blast E1 | Armor | 5 | 5 |
| Charged Beam E4 | Armor | 25 | 25 |
| Doombot (per) D1 | Armor | 20 | 20 |
| Mjolnir Quick Throw TR1 | Divine | 10 | 10 |
| Odin Beam O1 | Divine | 20 | 20 |
| Stone active (typical) | Infinity | 15 | 15 |
| Stone ultimate | Infinity | 60 | 60 |

Costs are the same across modes; **LA makes them cheap by regenerating fast** (40.1), Balanced
makes the same cost meaningful. This keeps one set of ability rows for both modes (§50).
