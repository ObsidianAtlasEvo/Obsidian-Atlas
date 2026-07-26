# SpEffectParam edits (Smithbox)

Two ways to apply, both supported by Smithbox/DSMapStudio:
1. **CSV import** (Param → export/import): edit the exported `SpEffectParam.csv`, re-import.
2. **Mass Edit** (recommended for scripted, reviewable edits): paste the scripts below into
   Smithbox's *Mass Edit* box. Syntax is `<row selection>: <field>: <operation>;`.

> Field names are standard Paramdex names. A few are `[VERIFY]` — Smithbox shows the exact
> field on hover; if a name differs in your version, substitute the equivalent. Do **not**
> guess; confirm in the editor before committing.

## 10.1 Mode / state tag SpEffects (inert markers)
These carry no combat effect; they exist so EMEVD/HKS can test "does the player have effect
7700000?". Keep them harmless: no HP change, long/refreshed duration while the mode is held.

```
# Create rows first via CSV (duplicate an inert vanilla SpEffect like a lamp/marker), then:
param SpEffectParam: id 7700000 7700001 7700002 7700003 7700004 7700005: motionInterval: = -1;   # infinite until removed  [VERIFY field: 'effectEndurance'/'motionInterval']
param SpEffectParam: id 7700000 7700001 7700002 7700003 7700004 7700005: effectTargetSelf: = 1;
# Make the six MODE_* mutually exclusive via a shared category so a new one cancels the last:
param SpEffectParam: id 7700000 7700001 7700002 7700003 7700004 7700005: stateInfo: = 7700; # shared category id  [VERIFY 'stateInfo'/'category']
```
(Exclusivity is enforced both by `stateInfo` category and by the HKS explicitly removing the
other five when it grants one — belt and suspenders.)

## 10.2 Armor passive hub (C.1) — one resident SpEffect that stacks sub-effects
`EquipParamProtector.residentSpEffectId1` on the Doom body = `7700100` (the hub). The hub does
nothing itself except stay applied; each passive is its own SpEffect the EMEVD grants while the
hub is present, OR (simpler) put the stats directly on the hub:

```
param SpEffectParam: id 7700100: physicsDamageCutRate:   = 0.85;   # take 15% less physical
param SpEffectParam: id 7700100: magicDamageCutRate:     = 0.80;
param SpEffectParam: id 7700100: fireDamageCutRate:      = 0.80;
param SpEffectParam: id 7700100: thunderDamageCutRate:   = 0.75;
param SpEffectParam: id 7700100: darkDamageCutRate:      = 0.85;   # holy in ER = 'darkDamageCutRate'? [VERIFY: holy is 'darkDamageCutRate' historically]
param SpEffectParam: id 7700100: poizonResistPoint:      = 9999;   # poison immune [VERIFY spelling 'poizon']
param SpEffectParam: id 7700100: diseaseResistPoint:     = 9999;
param SpEffectParam: id 7700100: bloodResistPoint:       = 9999;
param SpEffectParam: id 7700100: freezeResistPoint:      = 9999;
param SpEffectParam: id 7700100: maxStaminaRate:         = 1.3;
param SpEffectParam: id 7700100: staminaRecoverRate:     = 1.5;    # [VERIFY field]
param SpEffectParam: id 7700100: noDead:                 = 0;      # never set invulnerable
param SpEffectParam: id 7700100: poise... :              = ...;    # poise via 'toughnessDamageRate'/'poise' [VERIFY]
```
Balanced vs Lore is handled by EMEVD swapping the hub to a weaker row (`7700101`) when
`CFG_LORE` is absent, OR by a second, milder set of numbers — keep both rows.

## 10.3 Force-field shield (Aegis Barrier, F1/F7) — timed damage cut
```
param SpEffectParam: id 7700200: physicsDamageCutRate: = 0.10;   # 90% cut
param SpEffectParam: id 7700200: magicDamageCutRate:   = 0.10;
param SpEffectParam: id 7700200: fireDamageCutRate:    = 0.10;
param SpEffectParam: id 7700200: thunderDamageCutRate: = 0.10;
param SpEffectParam: id 7700200: motionInterval:       = 2.0;    # 2 second duration
param SpEffectParam: id 7700200: vfxId:                = 7700200;# dome FXR while active [VERIFY 'vfxId0'/'vfxId1']
```
Emergency Field (P7) reuses this SpEffect; EMEVD applies it on the HP-threshold trigger.

## 10.4 Slow debuff (Time Stone TI1/TI8, Odin O16) — the "time" primitive
Elden Ring has no literal time control; slow = animation-speed reduction on the target.
```
param SpEffectParam: id 7700300: animationSpeedRate: = 0.40;  # 60% slow  [VERIFY field name 'animIdOffset'/'changeSpeedRate']
param SpEffectParam: id 7700300: motionInterval:     = 8.0;
param SpEffectParam: id 7700301: animationSpeedRate: = 0.02;  # Time Stop = 98% slow (ordinary)
param SpEffectParam: id 7700301: motionInterval:     = 6.0;
param SpEffectParam: id 7700302: animationSpeedRate: = 0.35;  # boss version of Time Stop (extreme-slow, not stop)
```
EMEVD applies 7700301 to ordinary enemies, 7700302 to `IS_BOSS` enemies — this is the boss
branch that prevents stun-lock (§26/§54).

## 10.5 On-hit debuffs & drains (examples)
```
# Sunder Defenses (Odin O11): lower target defense 12s
param SpEffectParam: id 7700400: physicsDamageCutRate: = 1.25;  # takes 25% MORE physical (cut>1) [VERIFY semantics]
param SpEffectParam: id 7700400: motionInterval:       = 12.0;
# Soul Drain (SO1): damage + heal caster — heal handled by the Bullet's on-hit changeHpPoint on caster,
# or an EMEVD 'award HP to player' on hit flag; see params/20 and event/common_doom.js.
param SpEffectParam: id 7700401: changeHpPoint: = -300;   # damage on target (LA); Balanced row 7700402 = -110
```

## 10.6 Empower-next (Power Stone PO7 / AMP_NEXT)
```
param SpEffectParam: id 7700040: motionInterval: = 6.0;   # window to spend the amplify
# No damage field; it's a pure tag. Every offensive Bullet/AtkParam's on-cast EMEVD checks it
# and multiplies output, then clears it. (Logic in event/common_doom.js.)
```

## 10.7 CSV creation note
Mass Edit **edits existing rows**; to *create* the rows first, in Smithbox select a suitable
inert vanilla SpEffect, **Duplicate** into the reserved ID, then run the scripts above. Or
export `SpEffectParam.csv`, append rows with the reserved IDs (copy a template row's columns),
and re-import. Keep a `SpEffectParam.doom.csv` in version control as the source of truth.
