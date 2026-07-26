# C. Ability Catalogue

Every ability has: **Source · Input · Function · Effect · Range · Resource · Cooldown · Impl**.
Signature abilities (one per system) use the **full §56 template**; the rest use compact rows
carrying the same fields. IDs reference reserved ranges in
[`params/00-id-allocation.md`](../params/00-id-allocation.md). Two damage columns are given
where relevant: **LA** = Lore-Accurate, **B** = Balanced.

Implementation shorthand:
`Magic`=spell row · `AoW`=Ash-of-War (`SwordArtsParam`+`Behavior`+`AtkParam_Pc`+TAE) ·
`Bullet`=projectile row · `SpEff`=SpEffectParam · `Thr`=ThrowParam · `EV`=EMEVD event ·
`Tal`=EquipParamAccessory (talisman) · `Prot`=EquipParamProtector.

---

## C.1 DOOM — Armor passives (§6)  · Source: Doom Tech · always-on

Implemented as a **talisman-style permanent `SpEffect` chain** granted by wearing the armor
(`EquipParamProtector.residentSpEffectId1-4` → a hub SpEffect that adds sub-effects).

| # | Name | Effect (LA / B) | Impl |
|---|---|---|---|
| P1 | Reinforced Frame | +physical/strike absorb; +poise | `Prot` defense + `SpEff` `poise` |
| P2 | Energy Shielding | +magic/fire/light/lightning cut | `SpEff` `*GuardCutRate` |
| P3 | Life-Support | poison/rot/thermal/electrical immunity | `SpEff` `*ResistRate=large` |
| P4 | Servo-Assist | +stamina, +stamina regen, no fall damage | `SpEff` `staminaAttackRate`, `fallDamage` off |
| P5 | Arc-Reactor Reserves | passive Armor-Energy regen | `EV` regen loop (see §44) |
| P6 | Target Analysis | +lock-on range, weakpoint highlight | `SpEff` lock range + FXR marker on locked enemy |
| P7 | Auto-Defense (Emergency Field) | at HP<20% auto-deploy 2s damage-cut dome, 60s CD | **`EV`**: watch HP → apply F-shield SpEff + FXR |

> Auto-Defense is EMEVD, not a stat: a monitor loop compares HP to threshold and, if the
> cooldown flag is clear, grants a 2s `damageCutRate` SpEffect + dome FXR + sets a 60s CD flag.

---

## C.2 DOOM — Force Fields (§7)  · Source: Doom Tech · Armor Energy

### ★ FULL TEMPLATE — *Aegis Barrier* (signature)

- **Name:** Aegis Barrier
- **Power Source:** Doom Technology
- **Input:** Doom modifier + Guard (hold = sustained; tap = instant burst)
- **Function:** Deploys a geometric green energy dome. Tap = 1s hard block (reflects
  projectiles); hold = sustained frontal barrier that drains Armor Energy while up and
  degrades under fire.
- **Damage/Effect:** Tap: reflects incoming `Bullet`s as a counter-`Bullet` (LA 100% dmg / B 40%).
  Hold: `damageCutRate` 90% front / 40% rear; breaks when accumulated hits exceed a poise-like
  barrier value (LA 3000 / B 900).
- **Range:** Self, ~3m dome.
- **Resource Cost:** Tap 8 Armor Energy; Hold 6/sec.
- **Cooldown:** Tap 3s; Hold none (resource-gated).
- **Animation:** Left-arm raise, palm-out (reuse guard-parry base HKX, re-timed; Class-C polish anim).
- **VFX:** `fxr_doom_field_dome` — hex-lattice shell, edge glow, impact ripples + sparks on hit
  (green/white palette). Dynamic light on activation.
- **SFX:** electromagnetic snap on raise; layered hum while up; glass-metallic crack on break.
- **Enemy Reaction:** melee attackers bounce (small knockback SpEff on the reflect AtkParam);
  reflected projectiles can stagger the original caster.
- **Synergies:** Odinforce → dome also emits a `mass knockback` pulse on break; Power Stone →
  reflect damage ×2; Space Stone → reflected projectile homes.
- **Lore Basis:** Doom's signature personal force field, a constant in his appearances.
- **Implementation Method:** `AoW` (guard-type) → `Behavior` grants block-state `SpEff`
  (`damageCutRate`, projectile-reflect via on-guard `Bullet` spawn) + EMEVD barrier-integrity
  counter for the break mechanic; FXR via TAE spawn event.
- **Files/Params/Scripts:** `EquipParamWeapon`(catalyst art), `SwordArtsParam`, `Behavior`,
  `AtkParam_Pc`, `SpEffectParam` (dome + reflect), `Bullet` (reflect projectile), TAE (VFX/SFX
  events), `event/common_doom.js` (integrity/break), `fxr_doom_field_dome`.
- **Known Limitations:** True omnidirectional block only while facing threats for the "front"
  cut; rear cut intentionally weaker. Reflect works on projectiles that are `Bullet`s (most are).

| # | Name | Effect (LA/B) | Resource / CD | Impl |
|---|---|---|---|---|
| F1 | Instant Shield | 1s 95% cut, i-frame-lite | 8 AE / 3s | `SpEff` + `AoW` |
| F2 | Sustained Barrier | frontal wall, drains | 6/s | `AoW` guard state |
| F3 | Directional Shield | angled panel absorbs one direction | 6 AE / 2s | `SpEff` dir cut |
| F4 | Spherical Barrier | 360° 60% cut 4s, immobile-ish | 20 AE / 12s | `SpEff` + FXR sphere |
| F5 | Reflection Field | reflects projectiles 3s | 12 AE / 8s | reflect `Bullet` |
| F6 | Shockwave Barrier | drop field → radial knockback | 15 AE / 10s | `AtkParam` radial + knockback SpEff |
| F7 | Emergency Field | = P7 auto-trigger | — / 60s | `EV` |

---

## C.3 DOOM — Energy Manipulation (§8)  · Source: Doom Tech · Armor Energy

The "complete weapons platform": each row differs in speed/range/stagger/area/role — **not**
one projectile recolored (§8 objective). All are `Magic` rows firing distinct `Bullet`s from
the gauntlet dummypoly.

| # | Name | Role | Effect (LA/B) | Speed·Range·Stagger | Resource/CD | Impl |
|---|---|---|---|---|---|---|
| E1 | Palm Blast | bread-and-butter | LA 420 / B 150 mag | fast · med · low | 5 AE / — | `Bullet` |
| E2 | Finger Blast | quick poke | LA 180 / B 70 | very fast · med · none | 2 AE / — | `Bullet` low-cost |
| E3 | Continuous Beam | sustained DPS | LA 90/tick / B 35 | instant · long · none | 4/s | `Bullet` laser-type + tick SpEff |
| E4 | Charged Beam | burst nuke | LA 1400 / B 500 | hold→release · long · high | 25 AE / 6s | charge TAE → big `Bullet` |
| E5 | Chest Discharge | panic clear | LA 600 radial / B 220 | instant · 6m · med | 18 AE / 8s | radial `AtkParam` |
| E6 | Radial Burst | crowd | LA 500 ring / B 180 | instant · 8m · med | 15 AE / 6s | ring `Bullet` fan |
| E7 | Explosive Bolt | AoE lob | LA 700 / B 260 | med · long · med | 10 AE / 3s | arc `Bullet`+explosion child |
| E8 | Rapid Bolts | pressure | LA 120×5 / B 45×5 | fast stream · med | 12 AE / 2s | `Bullet` `spawnBullet` burst |
| E9 | Piercing Lance | anti-line | LA 900 / B 320 | fast · long · high · penetrates | 16 AE / 5s | penetrating `Bullet` |
| E10 | Ground Rupture | anti-melee | LA 650 line / B 240 | med · 10m line · knockdown | 14 AE / 5s | traveling ground `Bullet` |
| E11 | Denial Field | zoning | LA 60/tick zone 8s / B 25 | places hazard | 20 AE / 12s | persistent `Bullet`/AssetSfx zone |
| E12 | Aerial Bombardment | siege | LA 300×6 rain / B 110×6 | delayed · wide | 30 AE / 15s | `EV` timed sky `Bullet`s over region |

---

## C.4 DOOM — Electricity / tech (§9)  · Source: Doom Tech (green/white, *artificial*)

Distinct from Mjolnir's blue divine lightning (§40). Uses `lightning`/`strike` attribute but a
green-white FXR family and mechanical SFX.

| # | Name | Effect (LA/B) | Notes | Impl |
|---|---|---|---|---|
| T1 | Gauntlet Discharge | LA 350 / B 130, stun | short cone | `Bullet` + `stun` SpEff |
| T2 | Electric Beam | LA 80/tick / B 30 | sustained | `Bullet` laser |
| T3 | Chain Electricity | LA 300 → 3 jumps / B 110 | `spawnBullet` chain | chaining `Bullet` |
| T4 | Electrical Stun | LA low dmg, 2.5s stun / B 1.2s | control | `SpEff` stun buildup |
| T5 | EMP Discharge | radial, disables enemy specials 4s | debuff | radial `AtkParam`+`SpEff` "silence" |
| T6 | Charged Gauntlets | melee +lightning 20s | buff | weapon-buff `SpEff` |
| T7 | Electric Trap | placed, triggers on approach | zoning | `EV` region-trigger `Bullet` |
| T8 | Sustained Electrocution | channel single target, ramping | execute | `Bullet` tether + ramp SpEff |

---

## C.5 DOOM — Sorcery (§10)  · Source: Doom Sorcery · Arcane Power (FP)

Master-sorcerer arsenal; visually occult (sigils/circles), **not** identical to tech beams
(§10 objective). These are `Magic` incantation-type rows with gestural cast animations.

| # | Name | School | Effect (LA/B) | Impl |
|---|---|---|---|---|
| S1 | Eldritch Bolt | attack | LA 380 / B 140 magic, homing | homing `Bullet` |
| S2 | Mystic Ward | defense | 8s magic-cut aura + status cleanse | `SpEff` |
| S3 | Binding Sigil | control | roots enemy 3s (LA) / 1.5s (B) | ground `Bullet` + `SpEff` bind (slow to ~0) |
| S4 | Banishment | control | despawn *summoned* enemies; heavy dmg to summons | `EV` despawn tag + `SpEff` |
| S5 | Hexfire Nova | AoE | LA 900 radial / B 330, magic+fire | radial `AtkParam` |
| S6 | Curse of Doom | debuff | −defense −damage 12s | `SpEff` stackable debuff |
| S7 | Soul Siphon (sorcery) | drain | LA 200 dmg → heal 50% / B 80→30% | `SpEff` `changeHpPoint` on hit |
| S8 | Energy Absorption | counter | absorb next magic hit → Arcane Power | `EV` + `SpEff` window |
| S9 | Mystic Riposte | counter | on-parry magic burst | `Behavior` on-parry `Bullet` |
| S10 | Runic Enchant | buff | weapon +magic, sigil trail 25s | weapon-buff `SpEff` |
| S11 | Summon Servitor | summon | 1 demon add, 30s | `EV` spawn NPC (see Doombots tech) |
| S12 | Sigil Field | zoning | slow+damage circle 8s | persistent zone `Bullet` |
| S13 | Dimensional Rift | attack | short-range space tear, LA 750 / B 270, pulls | `Bullet` + pull `SpEff` |
| S14 | Arcane Dominion | area control | wide silence+slow 5s | radial `SpEff` |

---

## C.6 DOOM — Teleportation (§11)  · Source: Doom Sorcery/Tech · low cost

Responsive repositioning; guarded against clipping/arena-break (§A.4, EV guards).

| # | Name | Effect | Impl |
|---|---|---|---|
| TP1 | Combat Blink | short i-frame dash w/ green collapse VFX | `AoW` root-motion dash + i-frames |
| TP2 | Forward Teleport | ~8m forward warp | `AoW` + `EV` clamp-to-navmesh |
| TP3 | Backstep Teleport | ~6m back, i-frames | `AoW` |
| TP4 | Directional Teleport | stick-relative warp | `AoW` dir variants |
| TP5 | Blink Behind Target | warp behind lock-on | `EV` relative warp `[VERIFY]`; fallback dash+reface |
| TP6 | Traversal Teleport | long OOC warp to marked point | `EV`, disabled in boss arenas |
| TP7 | Emergency Teleport | reactive escape + brief slow-field left behind | `AoW` + `SpEff` |

---

## C.7 DOOM — Doombots (§12)  · Source: Doom Tech · Armor Energy

Summoned via EMEVD spawning **custom NPCs** (a `c0000`-based or reused humanoid chr reskinned
to Doom, `NpcParam` on the player's team). Not a renamed vanilla summon (§12 objective) — a
dedicated Doombot NpcParam/chr entry.

### ★ FULL TEMPLATE — *Summon Doombot Cadre* (signature)

- **Name:** Summon Doombot Cadre
- **Power Source:** Doom Technology
- **Input:** Doom modifier + Summon input (tap = 1 bot; hold = up to 3)
- **Function:** Spawns robotic duplicates of Doom that fire energy bolts and engage Doom's
  current target; expire after 45s or on death; can be ordered to self-destruct.
- **Damage/Effect:** each bot: ranged E1-clone (LA 200 / B 80), melee (LA 150 / B 60);
  self-destruct (LA 600 / B 220 radial).
- **Range:** spawn within 5m; bots roam to engage.
- **Resource Cost:** 20 Armor Energy per bot.
- **Cooldown:** 20s; max 3 active.
- **Animation:** Doom raises hand, teleport-in flash for each bot.
- **VFX:** green teleport-in; bots carry a subtle green tech aura + eye glow.
- **SFX:** mechanical servo + electromagnetic pop on spawn; metallic footfalls.
- **Enemy Reaction:** bots pull some enemy aggro (act as decoys); self-destruct staggers.
- **Synergies:** Mind Stone → charmed enemies + bots stack a mob; Emperor Doom → +2 max bots.
- **Lore Basis:** Doom's ever-present robotic doubles/proxies.
- **Implementation Method:** `EV` spawn of a dedicated Doombot `NpcParam` (AI = ranged
  humanoid) set to player's team; lifetime timer; order-flags for follow/attack/self-destruct
  read from player SpEffect tags.
- **Files/Params/Scripts:** `NpcParam` (Doombot), `chr` reskin (Class-C or vanilla knight
  placeholder), `AiThinkParam`/`NpcThinkParam` [VERIFY], `event/common_doom.js` (spawn/lifetime/orders),
  `SpEffectParam` (order tags), `fxr_doom_teleport`.
- **Known Limitations:** Summon AI quality bounded by vanilla humanoid think params; pathing on
  extreme terrain may lag. Placeholder model until Class-C Doombot chr is produced.

| # | Name | Effect | Impl |
|---|---|---|---|
| D1 | Single Doombot | 1 ranged bot 45s | `EV` spawn |
| D2 | Doombot Cadre | up to 3 bots | `EV` |
| D3 | Guard Formation | bots hold position around Doom, +block | `EV` order tag |
| D4 | Decoy Bot | high-aggro, low-HP taunt bot | `EV` + taunt SpEff |
| D5 | Self-Destruct | detonate all active bots | `EV` → kill + radial `Bullet` |
| D6 | Focus Fire | all bots target Doom's lock-on | `EV` order tag |

---

## C.8 DOOM — Melee (§13)  · Source: Doom physical · stamina

Custom armored moveset (Class-C anims; falls back to a heavy-fist/gauntlet vanilla base).
Posture = regal, minimal wasted motion (§42).

| # | Name | Effect | Impl |
|---|---|---|---|
| M1 | Gauntlet Jab / combo | fast light chain | `AtkParam_Pc` R1 chain + TAE |
| M2 | Backhand | wide horizontal, small knockback | heavy attack row |
| M3 | Heavy Kick | launcher, poise dmg | `AtkParam` high `atkSuperArmor` |
| M4 | Shockwave Punch | charged, radial knockback | charge → `Bullet` shock |
| M5 | Ground Slam | AoE knockdown | jump-attack row + `AtkParam` radial |
| M6 | Energy-Assisted Strike | melee + E1 discharge on hit | on-hit `Bullet` spawn |
| M7 | Grab/Throw | if feasible: command-grab | `Behavior` throw `[VERIFY throw setup]` |
| M8 | Aerial Slam | air → ground AoE | jump attack + shock |

---

## C.9 MJOLNIR — Melee moveset (§16)  · Source: Mjolnir physical · heavy impact

Signature weight: every heavy hit = camera shake + debris + localized lightning (§16).

| # | Name | Effect (LA/B) | Impl |
|---|---|---|---|
| H1 | Fast Strike (R1 chain) | LA 300 / B 120 strike | `AtkParam_Pc` + TAE hit |
| H2 | Heavy Overhead Smash | LA 900 / B 340, big poise, shock | `AtkParam` high poise + ground `Bullet` |
| H3 | Horizontal Sweep | crowd, knockback | wide `AtkParam` |
| H4 | Spinning Strike | 360°, multi-hit | spin TAE |
| H5 | Rising Hammer | launcher, anti-air | `AtkParam` launch SpEff |
| H6 | Aerial Slam | jump → radial shock+lightning | jump attack + radial `Bullet` |
| H7 | Running Attack | gap-close smash | running `AtkParam` |
| H8 | Charged Strike | LA 1600 / B 560 + shockwave | charge TAE → big + `Bullet` |
| H9 | Shockwave Slam | ground slam → traveling shock line | ground `Bullet` |

Impact package (all heavies): `atkSuperArmor` high (stagger), `knockbackDist`, camera-shake TAE
event, debris/dust FXR, `fxr_mjolnir_shock`, thunder SFX.

---

## C.10 MJOLNIR — Throw & Return (§17)  · signature system (see §A.5)

### ★ FULL TEMPLATE — *Mjolnir Throw & Recall*

- **Name:** Mjolnir Throw & Recall
- **Power Source:** Mjolnir
- **Input:** Mjolnir modifier + Throw (tap = quick throw; hold = charged; lock-on = homing)
- **Function:** Hurls Mjolnir; it flies (optionally penetrating/ricochet/homing), then
  **returns to hand**, damaging enemies along the return path. While thrown, Doom is in the
  `HAMMER_THROWN` state (hand empty; limited to sorcery/tech until recall).
- **Damage/Effect:** Quick LA 700 / B 260 strike + lightning; Charged LA 1500 / B 540;
  return-path LA 300 / B 120 per enemy hit.
- **Range:** long; charged crosses arena.
- **Resource Cost:** Divine Energy 10 (quick) / 25 (charged).
- **Cooldown:** none, but cannot re-throw until recalled.
- **Animation:** wind-up + throw HKX; empty-hand idle while out; catch HKX on return.
- **VFX:** `fxr_mjolnir_throw` streak (blue-white) outbound; `fxr_mjolnir_return` streak inbound;
  spark burst on catch.
- **SFX:** whoosh + thunder on throw; rising whistle on return; metal-catch clank.
- **Enemy Reaction:** heavy stagger/knockback on direct hit; small stagger on return-path hits.
- **Synergies:** **Space Stone** → hammer teleports to target instantly + returns via portal
  (§38); **Doom tech targeting** → multi-target throw hits several locked enemies (§36);
  **teleport recall** → Doom blinks to the hammer instead of it returning (§36).
- **Lore Basis:** Mjolnir always returns to the worthy hand.
- **Implementation Method:** Per §A.5 — throw `Bullet` (Mjolnir mesh, long life, penetrate) +
  weapon-swap to empty-hand variant + `HAMMER_THROWN` tag; recall input despawns projectile,
  spawns return streak, restores weapon, thin follow-`Bullet` for path damage. Auto-recall on
  life-expiry as a safety net so the state can never get stuck (§54 stuck-hammer test).
- **Files/Params/Scripts:** `Bullet` (throw, return-path), `ThrowParam` n/a, `EquipParamWeapon`
  (real + empty-hand variant), `SpEffectParam` (`HAMMER_THROWN`), `event/common_doom.js`
  (throw/recall/auto-recall state machine), `hks/c0000_doom_layer.hks` (input), TAE, FXR pair.
- **Known Limitations:** Mid-flight the hammer follows the Bullet path, not true physics; the
  "returns to hand" is a scripted streak, not rigid-body flight (documented compromise, §A.5).

| # | Name | Effect | Impl |
|---|---|---|---|
| TR1 | Quick Throw | fast, returns | as above |
| TR2 | Charged Throw | big, returns | charge TAE |
| TR3 | Lock-On Throw | homes to target | homing `Bullet` |
| TR4 | Penetrating Throw | pierces line | penetrate `Bullet` |
| TR5 | Ricochet Throw | bounces to 3 targets | `spawnBullet` chain |
| TR6 | Multi-Target Throw | hits several locked (tech) | `EV` multi-spawn |
| TR7 | Vertical / Ground-Skim | trajectory variants | `Bullet` angle |

---

## C.11 MJOLNIR — Divine Lightning (§18)  · blue-white celestial

| # | Name | Effect (LA/B) | Impl |
|---|---|---|---|
| L1 | Targeted Strike | LA 600 / B 220 bolt from sky on lock-on | `EV`/`Bullet` sky-strike |
| L2 | Lightning Bolt | LA 400 / B 150 forward | `Bullet` |
| L3 | Chain Lightning | LA 350 → jumps / B 130 | chaining `Bullet` |
| L4 | Lightning Beam | LA 90/tick / B 35 sustained | laser `Bullet` |
| L5 | Lightning Explosion | LA 800 radial / B 300 | radial `AtkParam` |
| L6 | Radial Storm | timed strikes around Doom 6s | `EV` timed `Bullet`s |
| L7 | Ground Lightning | traveling arcs | ground `Bullet` |
| L8 | Superbolt (charged) | LA 2000 / B 700 pillar | charge → big `Bullet` |
| L9 | Sky Barrage | rain of bolts over region | `EV` |
| L10 | Lightning-Infused Melee | H-attacks +lightning 25s | weapon-buff `SpEff` |
| L11 | Charged Throw + Lightning | TR2 + on-hit storm | combo |

Dynamic interaction (§18 objective): while a **storm** (§C.12) is active, all L-abilities get
+20% and extra ground-arc FXR — implemented by a `STORM_ACTIVE` tag that L-`Bullet`s' on-cast
`EV` checks to grant a temporary boost SpEffect.

---

## C.12 MJOLNIR — Weather Control (§19)  · atmosphere

Limited by map weather support (§A.3). Where available:

| # | Name | Effect | Impl |
|---|---|---|---|
| W1 | Gather Storm | darken sky, clouds, wind; sets `STORM_ACTIVE` | `EV` weather cmd + tag |
| W2 | Localized Storm | persistent lightning over a region 20s | `EV` timed `Bullet`s |
| W3 | Battlefield Storm | larger region, buffs all L-abilities | `EV` + tag |
| W4 | Dismiss Storm | clear | `EV` |

---

## C.13 MJOLNIR — Flight & Bifrost (§20–21)  · mobility (hover/dash approximation)

| # | Name | Effect | Impl |
|---|---|---|---|
| FL1 | Launch | leap up on hammer | `AoW` launch root-motion + low-gravity `SpEff` window |
| FL2 | Aerial Dash | horizontal air burst | `AoW` air dash |
| FL3 | Hover | brief sustained float | `SpEff` gravity-reduction window (§A.4 limit) |
| FL4 | Controlled Descent | slow-fall + slam option | `SpEff` + jump attack |
| FL5 | Bifrost Warp | rainbow teleport to marked point | `EV` warp, distinct rainbow FXR |
| FL6 | Bifrost Strike | warp-in overhead smash | `EV` warp + `AtkParam` |

Bifrost VFX explicitly rainbow/cosmic to distinguish from Doom's green teleport (§21 objective).

---

## C.14 ODINFORCE — Transformation & abilities (§22–26)  · gold-white · Divine Energy

### ★ FULL TEMPLATE — *Invoke the Odinforce* (signature transformation)

- **Name:** Invoke the Odinforce
- **Power Source:** Odinforce
- **Input:** Odinforce modifier + Transform (hold)
- **Function:** Enters an empowerment state (`XF_ODINFORCE`, 60s LA / 30s B) that floods Divine
  Energy, buffs the whole kit, and upgrades several abilities.
- **Damage/Effect:** while active — +strength/poise/stagger-resist, +spell & lightning potency
  (LA +60% / B +25%), HP regen, +magic defense, reduced Divine cost; Mjolnir gains gold arcs.
- **Range:** self (aura visible to enemies).
- **Resource Cost:** activation 40 Divine Energy; then near-free upkeep (LA) / drain (B).
- **Cooldown:** 90s after expiry.
- **Animation:** raise-to-sky activation HKX; glowing eyes; standing aura.
- **VFX:** `fxr_odin_aura` gold-white celestial aura + runic ring + energy arcs; sky brightens.
- **SFX:** deep celestial swell on activation; sustained divine tone.
- **Enemy Reaction:** activation shockwave staggers nearby enemies (mass knockback pulse).
- **Synergies:** channels through every Doom system (§37); massively boosts Emperor Doom.
- **Lore Basis:** tapping the All-Father's power.
- **Implementation Method:** activation `AoW`/item grants a **master aura `SpEffect`** whose
  sub-effects apply all buffs; `XF_ODINFORCE` tag drives ability-upgrade branches in EMEVD;
  timer + CD flags in `event/common_doom.js`.
- **Files/Params/Scripts:** `SpEffectParam` (master + subs), `EquipParamGoods`/`SwordArtsParam`
  (activator), `event/common_doom.js` (timer/CD/upgrades), `fxr_odin_aura`.
- **Known Limitations:** "glowing eyes" needs a Class-C material/overlay on the head part;
  fallback = face-area FXR.

**Odinforce active abilities** (available in `MODE_ODIN`):

| # | Name | Effect (LA/B) | Impl |
|---|---|---|---|
| O1 | Odinforce Beam | LA 1600 / B 560, long, piercing, high stagger | big laser `Bullet` |
| O2 | Charged Cosmic Beam | LA 2600 / B 900 | charge → `Bullet` |
| O3 | Divine Bolts | LA 250×N / B 90×N rapid | `spawnBullet` |
| O4 | Radial Blast | LA 1000 / B 360 | radial `AtkParam` |
| O5 | Directional Wave | LA 900 line / B 320 | traveling `Bullet` |
| O6 | Celestial Explosion | LA 1400 / B 500 | delayed AoE `Bullet` |
| O7 | Piercing Blast | anti-line | penetrate `Bullet` |
| O8 | Battlefield Judgment | wide screen-clear | `EV` region `AtkParam` |
| **Matter/energy (§25)** | | | |
| O9 | Transmute Projectiles | incoming `Bullet`s→harmless | `EV` despawn hostile `Bullet` in region |
| O10 | Energy Absorption | absorb magic → Divine Energy | `EV`+`SpEff` window |
| O11 | Sunder Defenses | −enemy defense 12s | `SpEff` debuff |
| O12 | Dispel | remove enemy buffs / hostile statuses on self | `EV`/`SpEff` cleanse |
| O13 | Unmake Summons | destroy summoned entities | `EV` despawn tag |
| O14 | Reinforce Weapon | +damage buff | weapon-buff `SpEff` |
| **Authority (§26)** | | | |
| O15 | Mass Knockback | radial launch | radial knockback `AtkParam` |
| O16 | Suppression | wide slow+silence 5s (bosses resist) | `SpEff` (branch on `IS_BOSS`) |
| O17 | Immobilize | root ordinary enemies 3s | `SpEff` bind |
| O18 | Divine Pressure | gravity-like pull-down + poise drain | `SpEff` |
| O19 | Dread | fear/flee on weak enemies | `SpEff` (AI flee) `[VERIFY]` |

---

## C.15 INFINITY STONES (§27–33)

Each Stone = **passive (while selected/owned) + active kit + ultimate**, with its own color,
SFX, and *gameplay philosophy* (§27). Selecting a Stone sets `STONE_SEL_*`. Abilities fire in
`MODE_STONE` scoped by the selected Stone.

### C.15.1 SPACE (blue) — control where things are (§28)
Passive: +teleport range, reduced blink CD.
| # | Name | Effect | Impl |
|---|---|---|---|
| SP1 | Instant Teleport | warp to aim point | `EV` warp |
| SP2 | Enemy Teleport | yank target to you (or away) | `EV` enemy warp `[VERIFY]` + `SpEff` |
| SP3 | Position Swap | swap places with target | `EV` swap |
| SP4 | Short Blink | quick i-frame reposition | `AoW` |
| SP5 | Portal Pair | entry/exit; projectiles & Doom pass | `EV` region link `[VERIFY]`; fallback: portal-attack |
| SP6 | Portal Attack | fire E1 out of a portal near target | `EV`+`Bullet` |
| SP7 | Spatial Displacement | scatter nearby enemies | radial `EV` warp |
| SP8 | Projectile Redirect | bend hostile `Bullet`s away | `EV` |
| SP9 | **Ultimate — Spatial Collapse** | pull enemies in region inward, then violent release (LA 2500 / B 900) | `EV` pull `SpEff` → delayed radial `Bullet` |

### C.15.2 MIND (yellow) — change behavior, not just damage (§29)
Passive: +lock-on awareness, enemy intent marker.
| # | Name | Effect | Impl |
|---|---|---|---|
| MI1 | Charm | ordinary enemy fights for Doom 20s | `EV` team swap (branch `IS_BOSS`→debuff) |
| MI2 | Confuse | enemy attacks randomly 8s | `EV` AI scramble `[VERIFY]` |
| MI3 | Redirect Aggression | enemy targets its allies | `EV` target set |
| MI4 | Psychic Stun | mental stun 3s | `SpEff` stun |
| MI5 | Psychic Blast/Wave | LA 500 / B 180 magic, no i-frames respected | `Bullet` (magic) |
| MI6 | Suppression | disable enemy specials 5s | `SpEff` silence |
| MI7 | **Ultimate — Dominion** | ordinary enemies in big radius fight for Doom 15s; bosses: −damage/−defense | `EV` mass team swap + boss branch |

### C.15.3 REALITY (red) — rule-breaking & strange (§30)
Passive: chance to nullify a hostile status on self.
| # | Name | Effect | Impl |
|---|---|---|---|
| RE1 | Transform Enemy | shrink/weaken target (LA 60% stats / B 80%) | `SpEff` stat-mult + scale `[VERIFY scale]` |
| RE2 | Disarm | disable enemy weapon/attack 5s | `SpEff` |
| RE3 | Transmute Projectile | hostile `Bullet` → harmless/into buff pickup | `EV` |
| RE4 | Resistance Inversion | flip target's weakness/resist 10s | `SpEff` altered resist |
| RE5 | Disintegrate | matter-strip DoT, dissolve on death | `SpEff` DoT + disintegration FXR |
| RE6 | Defensive Transmute | turn self briefly to "stone" (heavy cut, can't act) | `SpEff` |
| RE7 | **Ultimate — Reality Rewrite** | 10s altered-battlefield state: enemies −defense, −speed, warped visuals | `EV` region buff/debuff + full-screen FXR/filter `[VERIFY]` |

### C.15.4 POWER (purple) — brutally simple amplification (§31)
Passive: +% damage to all sources.
| # | Name | Effect (LA/B) | Impl |
|---|---|---|---|
| PO1 | Cosmic Blast | LA 900 / B 330 | `Bullet` |
| PO2 | Massive Beam | LA 120/tick / B 45 | laser |
| PO3 | Explosive Punch | melee LA 1200 / B 430 + radial | `AtkParam` |
| PO4 | Ground Rupture | line quake, knockdown | ground `Bullet` |
| PO5 | Radial Shockwave | LA 800 / B 300 | radial |
| PO6 | Charged Cosmic Projectile | LA 1800 / B 640 | charge `Bullet` |
| PO7 | Amplify | next ability of ANY source ×2 (LA) / ×1.5 (B) | `SpEff` "empower next" tag |
| PO8 | **Ultimate — Planetbreaker** | huge localized strike LA 4000 / B 1400, screen FX, no progression damage | `EV` cinematic `Bullet` + camera |

Amplify (PO7) is the cross-system glue (§31): it tags "next cast", and every source's cast
`EV`/`AtkParam` checks the tag and multiplies — this is how Power Stone amplifies Doom tech,
sorcery, Mjolnir, Odinforce, and other Stones (§34/§38).

### C.15.5 TIME (green) — manipulate tempo (§32) — *no true pause; extreme slow*
Passive: −ability cooldowns, +regen tick rate.
| # | Name | Effect | Impl |
|---|---|---|---|
| TI1 | Slow Enemy | target 60% slow 8s | `SpEff` speed |
| TI2 | Extreme Slow | target 90% slow 5s | `SpEff` |
| TI3 | Haste Self | +attack/move speed 10s | `SpEff` |
| TI4 | Time Field | region slow-bubble 8s | `EV` region `SpEff` |
| TI5 | Projectile Slow | hostile `Bullet`s crawl | `EV`/`SpEff` |
| TI6 | Freeze Target | 99% slow 2.5s (looks frozen) | `SpEff` |
| TI7 | Temporal Reversal | restore player HP/FP/pos/status to ~6s ago (PLAYER ONLY) | `EV` rolling snapshot (§A.4) |
| TI8 | **Ultimate — Time Stop** | ordinary enemies+projectiles 98% slow 6s; bosses extreme-slow; Doom normal | `EV` region mass-slow, boss branch |

### C.15.6 SOUL (orange) — life essence (§33)
Passive: on-kill small heal.
| # | Name | Effect (LA/B) | Impl |
|---|---|---|---|
| SO1 | Soul Drain | LA 300 / B 110 → heal 50%/30% | `SpEff` `changeHpPoint` |
| SO2 | Spirit Bolt | LA 350 / B 130 spectral, ignores some armor | `Bullet` holy/magic |
| SO3 | Soul Detection | reveal/mark enemies (incl. hidden) | `EV` marker FXR |
| SO4 | Spectral Summon | pull a slain enemy's spirit to fight 20s | `EV` spawn |
| SO5 | Soul Debuff | −healing, −resist on target | `SpEff` |
| SO6 | Essence Ward | store essence → later revive-lite (safe) | `EV`+`SpEff` `[VERIFY safe]` |
| SO7 | **Ultimate — Soul Dominion** | area drain: damage all, heal/empower Doom | `EV` region `SpEff` drain |

---

## C.16 COMBINED — Stone pairs & Infinity State (§34–35)

Available in `MODE_COSMIC` (needs the relevant Stones) or during `XF_INFINITY`.

| # | Combo | Effect | Impl |
|---|---|---|---|
| CB1 | Space+Power | teleported cosmic explosion at target | `EV` warp `Bullet` + PO blast |
| CB2 | Time+Power | suspended detonation (freeze then boom) | TI6 → delayed PO `Bullet` |
| CB3 | Reality+Mind | mass perception warp: enemies fight each other + weakened | MI + RE region `EV` |
| CB4 | Soul+Mind | metaphysical domination: charm + drain | MI1 + SO1 chain |
| CB5 | Space+Time | spacetime: freeze region + reposition all | TI4 + SP7 |
| CB6 | Reality+Power | large-scale matter destruction, disintegrate | RE5 + PO radial |

### ★ Infinity State (§34) & **Ultimate — "Infinity"** (§35)
- **Infinity State** (`XF_INFINITY`, requires all 6 owned): cosmic aura with all six color
  highlights, all meters buffed, unlocks the combined table + the "Infinity" ultimate.
- **Infinity** ultimate — deliberate multi-second activation; Stones "activate sequentially"
  (six timed FXR bursts), sound dampens, lighting shifts, then:
  - **Erasure Mode:** ordinary enemies in an enormous radius take lethal + **disintegration
    FXR** (dissolve, not ragdoll).
  - **Boss Mode:** catastrophic capped damage (LA 8000 / B 2500) + stacked debuffs, never
    auto-kill.
  - **Sandbox Mode:** raise/remove the cap (config).
  - Impl: `event/common_doom.js` orchestrates the sequence (FXR timeline, camera, sound duck,
    then region `SpEffect`/`Bullet` with boss branch). Explicitly *not* just a big explosion
    (§35 objective).

---

## C.17 EMPEROR DOOM (§39)  · capstone state

- **Requires:** Doom armor + Mjolnir + Odinforce + all 6 Stones (checked via ownership tags).
- **Input:** dedicated activation (Combined modifier + Transform, hold, long cast).
- **Effect (30–60s, never permanent):** levitation pose, altered aura + glowing eyes + cosmic
  runes; extreme resistance; enhanced physical/energy/Mjolnir/magic/teleport; reduced costs on
  ALL meters; the full **Combined** table + a few exclusive fusions unlocked; Infinity ultimate
  cost slashed.
- **Impl:** a master `XF_EMPEROR` aura `SpEffect` layering every source's buff + a set of
  EMEVD branches that unlock exclusive rows; monumental activation sequence (camera + FXR +
  sound); hard timer + long CD. Class-C: bespoke levitation/aura anim + eye overlay.
- **Fantasy (§39):** the culmination — Victor holding several of Marvel's highest powers at once.

---

*Ability count: ~150 rows across 17 groups. Every row carries source, input, effect, resource,
and a real implementation primitive. Damage numbers are starting values to be tuned against the
test matrix (doc 07); LA/B are selected at runtime by the config item, not by separate rows.*
