# Magic + Bullet edits (Smithbox)

A castable ability = a `Magic` row (cast type, FP cost, motion, catalyst requirement, and the
`refId`/`Bullet` it spawns) → one or more `Bullet` rows (the actual projectile physics + on-hit
SpEffect + VFX). Fields below are Paramdex names; `[VERIFY]` on your version.

## 20.1 Palm Blast (E1) — the reference projectile
`Magic` 7700 (cast from the gauntlet catalyst / Ash-of-War, see params/30):
```
param Magic: id 7700: refId1:        = 7700000;   # spawns Bullet 7700000
param Magic: id 7700: mp:            = 0;          # FP 0 — E1 uses Armor Energy, gated in EMEVD not FP
param Magic: id 7700: sfxVariationId: = 7700000;   # cast FXR (gauntlet charge)
param Magic: id 7700: refCategory:   = 1;          # sorcery/incantation category [VERIFY]
```
`Bullet` 7700000:
```
param Bullet: id 7700000: atkId_Bullet:   = 7700000;  # AtkParam row = damage/knockback (params/30)
param Bullet: id 7700000: life:           = 4.0;
param Bullet: id 7700000: dist:           = 60;       # range
param Bullet: id 7700000: shootInterval:  = 0;        # single shot
param Bullet: id 7700000: gravityInRange: = 0;        # flat trajectory
param Bullet: id 7700000: hormingStopRange: = 0;      # no homing (E1); (yes: Eldritch Bolt S1)
param Bullet: id 7700000: sfxId:          = 7700010;  # trail FXR (green energy)
param Bullet: id 7700000: HitBulletId:    = 0;        # no on-hit spawn
param Bullet: id 7700000: spEffectIDForShooter: = 0;
param Bullet: id 7700000: addLife: = 0;
```
**Damage & LA/B:** the *number* lives on the AtkParam (params/30), and LA/B is chosen by EMEVD
granting a damage-multiplier SpEffect on cast when `CFG_LORE` is set — so E1 is ONE Bullet, not
two. (This is how the whole mod avoids duplicated rows per mode, §50.)

## 20.2 Charged Beam (E4) — charge → big Bullet
Charging is an **Ash-of-War with a charge motion** (params/30 TAE holds the charge window). The
released attack fires:
```
param Bullet: id 7700004: atkId_Bullet: = 7700004;
param Bullet: id 7700004: life: = 3.0;
param Bullet: id 7700004: dist: = 90;
param Bullet: id 7700004: isPenetrate: = 1;         # pierces multiple enemies [VERIFY 'isPenetrate'/'penetrateMap']
param Bullet: id 7700004: bulletSize: = 2.5;        # thick beam [VERIFY 'radius'/'bulletSize']
param Bullet: id 7700004: sfxId: = 7700011;         # beam FXR
```

## 20.3 Continuous Beam (E3) — sustained laser (tick damage)
```
param Bullet: id 7700003: life: = 0.2; shootInterval: = 0.1;   # rapid re-fire while held = sustained
param Bullet: id 7700003: followType: = 1;                     # beam follows the emitter [VERIFY]
param Bullet: id 7700003: atkId_Bullet: = 7700003;             # low per-tick damage
```

## 20.4 Chain Lightning (T3 / L3) — jumping bolt
```
param Bullet: id 7700020: atkId_Bullet: = 7700020;
param Bullet: id 7700020: HitBulletId:  = 7700021;   # on hit, spawn the 'jump' bullet
param Bullet: id 7700020: sfxId:        = 7700030;   # Doom electric (green) OR Mjolnir (blue) via variant
param Bullet: id 7700021: HitBulletId:  = 7700021;   # each jump spawns another (cap via 'numShoot'/life) [VERIFY chain cap field]
param Bullet: id 7700021: dist: = 12;                # jump range
```
The **same chain mechanic** serves Doom's green electricity (T3) and Mjolnir's blue lightning
(L3) — two Bullet rows differing only in `sfxId` and AtkParam attribute, preserving the visual
distinction (§40) without duplicating logic.

## 20.5 Explosive Bolt (E7) — projectile + on-hit AoE child
```
param Bullet: id 7700007: HitBulletId: = 7700008;   # spawn explosion on impact
param Bullet: id 7700008: atkId_Bullet: = 7700008;  # radial AtkParam (params/30)
param Bullet: id 7700008: bulletSize: = 4.0;        # explosion radius
param Bullet: id 7700008: life: = 0.3;
```

## 20.6 Mjolnir Throw + Return (TR1/§A.5)
```
# Outbound (the flying hammer):
param Bullet: id 7700100: atkId_Bullet: = 7700100;  # heavy strike + lightning SpEffect
param Bullet: id 7700100: life: = 6.0; dist: = 120; isPenetrate: = 1;
param Bullet: id 7700100: sfxId: = 7700100;         # fxr_mjolnir_throw streak
param Bullet: id 7700100: spEffectIDForShooter: = 7700030;  # sets HAMMER_THROWN on the player at fire
# Return-path (thin follow-bullet spawned by EMEVD at recall):
param Bullet: id 7700101: atkId_Bullet: = 7700101;  # lighter path damage
param Bullet: id 7700101: sfxId: = 7700101;         # fxr_mjolnir_return
```
The state transitions (set/clear `HAMMER_THROWN`, weapon swap, auto-recall safety net) are in
[`../event/common_doom.js`](../event/common_doom.js). The Bullet only carries the projectile;
EMEVD/HKS own the *state*.

## 20.7 Spell list (Magic rows) — index
| Magic id | Ability | Bullet(s) | Notes |
|---|---|---|---|
| 7700 | E1 Palm Blast | 7700000 | |
| 7701 | E2 Finger Blast | 7700001 | low cost |
| 7702 | E3 Beam | 7700003 | sustained |
| 7703 | E4 Charged Beam | 7700004 | charge art |
| 7710–7723 | S1–S14 Sorcery | 77000xx | occult FXR |
| 7730–7737 | T1–T8 Electric | 770030x | green |
| 7740–7750 | L1–L11 Lightning | 770040x | blue |
| 7760–7767 | O1–O8 Odin energy | 770050x | gold |
| 7770–77xx | Stone spells | 770060x+ | per-stone color |

Full per-row CSVs live beside this file as `Magic.doom.csv` / `Bullet.doom.csv` (source of
truth; regenerate the in-editor rows from these).
