# Attacks, Ashes of War, damage & knockback (Smithbox)

An "ability button" that plays an animation and does damage = **Ash of War**:
`SwordArtsParam` (the art) → `Behavior` (links the art's motion to an attack) →
`AtkParam_Pc` (hitbox, damage, poise, knockback, on-hit SpEffect) → **TAE** (timing/VFX/SFX).
Projectile abilities instead route through Magic/Bullet (params/20); AtkParam is shared (the
Bullet's `atkId_Bullet` points at an AtkParam row).

## 30.1 AtkParam_Pc — the damage/reaction row (shared by melee & projectiles)
Example: Palm Blast impact (7700000) and Mjolnir overhead (7700 melee):
```
# --- E1 Palm Blast impact ---
param AtkParam_Pc: id 7700000: atkPhysCorrection: ...        # scaling [VERIFY]
param AtkParam_Pc: id 7700000: atkMagic:        = 200;       # magic damage (LA base; EMEVD mult for LA/B)
param AtkParam_Pc: id 7700000: atkStam:         = 60;        # stamina damage
param AtkParam_Pc: id 7700000: atkSuperArmor:   = 120;       # poise damage (stagger)
param AtkParam_Pc: id 7700000: knockbackDist:   = 2.0;
param AtkParam_Pc: id 7700000: atkAttribute:    = 1;         # strike/standard [VERIFY enum]
param AtkParam_Pc: id 7700000: spEffectId0:     = 0;         # optional on-hit SpEffect

# --- Mjolnir Heavy Overhead (H2) ---
param AtkParam_Pc: id 7700900: atkPhys:        = 340;        # Balanced base; big strike
param AtkParam_Pc: id 7700900: atkSuperArmor:  = 400;        # heavy stagger
param AtkParam_Pc: id 7700900: knockbackDist:  = 5.0;
param AtkParam_Pc: id 7700900: atkAttribute:   = 0;          # strike (hammer)
param AtkParam_Pc: id 7700900: spEffectId0:    = 7700910;    # on-hit localized lightning + small burn
param AtkParam_Pc: id 7700900: TotalDamageRate...            # [VERIFY]
```

## 30.2 Enemy reactions (§46) — how to get stagger / launch / knockback / knockdown
All driven by AtkParam + target SpEffect:
- **Stagger:** high `atkSuperArmor` vs target poise.
- **Knockback:** `knockbackDist` + hit-type.
- **Launch / knockdown:** set the attack's **hit type / damage level** to a launching level
  ([VERIFY the AtkParam field controlling hit reaction level, historically 'atkAttribute' +
  'hit type'/'damageLevel']). Launchers (M3, H5) use the launch level; ground slams use knockdown.
- **Pull (Dimensional Rift S13, Spatial Collapse SP9):** on-hit SpEffect that applies a small
  toward-caster displacement, or an EMEVD warp of light enemies toward a point.
- **Fear/flee, paralysis, confusion:** target SpEffect that alters AI (`[VERIFY]` AI-state
  SpEffects) — used by Odin O19 Dread, Mind Stone. Bosses excluded via `IS_BOSS` branch.
- **Disintegration (Reality RE5, Infinity Erasure):** lethal SpEffect + `fxr_disintegrate` so
  the corpse dissolves instead of ragdolling.

## 30.3 Ashes of War (SwordArtsParam) — the button-triggered scripted attacks
Used for: Aegis Barrier (guard-type art), all teleports (dash arts), Mjolnir throw/charge, melee
combos, transformations (activation arts). Each art references a **moveset behavior + TAE**.
```
param SwordArtsParam: id 7700: swordArtsType: = ...       # attack vs guard vs buff [VERIFY]
param SwordArtsParam: id 7700: useMagicPoint: = 0;        # cost handled by EMEVD meter, not FP
param SwordArtsParam: id 7700: behaviorVariationId: = 7700;  # → Behavior rows for the motion
```
- **Teleport arts** (TP1–TP7): type = a dash/quickstep behavior with an **i-frame window** set
  in TAE (`InvincibilityWindow` event); root-motion HKX moves the player. EMEVD post-check
  clamps/guards the destination (params guards + event/common_doom.js).
- **Guard art** (Aegis Barrier F1/F2): guard-type art granting the block SpEffect (params/10
  7700200) + reflect Bullet spawn on successful guard.
- **Charge arts** (E4, TR2, H8): TAE holds a charge loop; release transitions to the fire clip.

## 30.4 Behavior (PC) — links art motion → AtkParam
```
param Behavior: id 7700000: variationId: = 7700;      # matches SwordArts behaviorVariationId
param Behavior: id 7700000: behaviorJudgeId: = ...;   # animation category [VERIFY]
param Behavior: id 7700000: refId: = 7700000;         # → AtkParam_Pc row
param Behavior: id 7700000: refType: = 0;             # 0 = AtkParam [VERIFY enum]
```

## 30.5 The LA/Balanced multiplier (why there's one row, not two)
Every offensive AtkParam carries the **Balanced** base number. On cast/hit, EMEVD checks
`CFG_LORE`; if set, it grants the attacker a short `damageUp` SpEffect (e.g. ×2.8) so Lore mode
hits far harder without duplicating rows (§50 no-duplicated-abilities). The multiplier table per
source is in [`40-resources.md`](40-resources.md).

## 30.6 Cooldowns
Elden Ring has no native ability cooldown. Cooldowns are **EMEVD flags**: on use, set a flag +
start a timer; the ability's use-check requires the flag clear. Documented per ability in
`event/common_doom.js` (`cooldown(id, seconds)` helper). Resource-gated abilities (meters) often
need no cooldown; burst ultimates always have one.
