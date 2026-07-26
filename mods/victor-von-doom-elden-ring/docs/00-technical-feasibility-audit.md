# A. Technical Feasibility Audit

Purpose: establish exactly what Elden Ring's engine + the current modding toolchain can and
cannot do, so no ability in this project is designed against an impossible mechanic. Every
"comic ability" is mapped to a **verified engine mechanism** or an honest **abstraction**.

## A.0 Verified toolchain (2025–2026)

| Tool | Owns | Notes |
|---|---|---|
| **ModEngine2** | Runtime file injection, load order, offline launch | Mod lives in its own folder, not the Steam install. |
| **Smithbox** (Vawser; fork of DSMapStudio) | `regulation.bin` params, FMG text, FLVER view, map/event browsing | Use on patch 1.12+. Ships Paramdex field defs. Pre-1.12 → DSMapStudio v1.11.1. |
| **DSAnimStudio** | TAE (Time Action Events): hitboxes, VFX spawns, SFX, cancel windows | The event layer over animations. |
| **ERClipGenerator** | Register a new HKX clip into an anibnd + link to a TAE | Required to add *new* animations, not just re-time existing. |
| **WitchyBND** | Pack/unpack BND4/DCX containers (`anibnd`, `ffxbnd`, `partsbnd`, `chrbnd`) | Replaces older UXM/Yabber for containers. |
| **DarkScript3** (AinTunez) | EMEVD event scripting in JS; `Help > View EMEDF` = command reference | Compile to `common.emevd.dcx` via Batch Resave. |
| **@cccode/fxr** (EvenTorset/fxr) | Author/edit FXR particle+light effects programmatically (Node) | Real npm-installable JS lib; classes for FXR structures. |
| **ER-SFXRecolorTool** | Bulk recolor existing FXR RGBA | Fast path for palette variants. |
| **HKS** (`c0000.hks` in `c0000.behbnd`) | Player behavior/state machine, input reactions | Havok Script (Lua dialect). Where a true "modifier + combo" input layer lives. |

Everything below is designed only on top of these.

## A.1 What the engine natively supports (Class A — high confidence)

- **Stat/resist/regen changes** via `SpEffectParam` (hundreds of fields: `maxHpRate`,
  `physicsAttackPowerRate`, `fireGuardCutRate`, `poisonResistRate`, `changeHpPoint`,
  `haveSoulRate`, `hp` regen via `changeHpPoint` + `motionInterval`, speed via
  `animIdOffset`/`accumErosion`… [VERIFY exact field names in your Paramdex]).
- **New "spells"** as `Magic` param rows (sorcery/incantation) cast from a catalyst, each
  spawning `Bullet` param rows. `Bullet` supports: homing, chaining (`spawnBullet`),
  life, gravity, penetration, follow, arc, on-hit `SpEffect`, on-hit VFX.
- **New weapons / Ashes of War** via `EquipParamWeapon` + `SwordArtsParam` + a moveset
  (`Behavior` + `AtkParam_Pc` + TAE). Ash-of-War is the cleanest hook for "press a button →
  do a scripted attack that costs FP."
- **New armor** via `EquipParamProtector` (defense, resist, weight, `SpEffect` while worn).
- **Talismans** via `EquipParamAccessory` (passive `SpEffect` — perfect for "armor systems").
- **Consumable/trigger items** via `EquipParamGoods` → `refId`/`SpEffect` (great for
  "activate transformation" and "select active Stone").
- **Throw mechanics** via `ThrowParam` (real system; used by hammer-throw abstraction).
- **On-hit reactions**: poise/stagger via `Behavior` `atkParamId` → `AtkParam_Pc`
  (`atkPhys`, `atkSuperArmor` = poise damage, `knockbackDist`, `atkAttribute`, plus
  `spEffectId0-4` to inflict debuffs). Knockback, launch, and stagger are all real fields.
- **Status buildup** (frostbite/poison/rot/bleed/sleep/madness) as vehicles for exotic
  effects (see A.3).
- **Event logic** via EMEVD: timers, flags, "if player has SpEffect X → do Y", spawn/despawn
  assets, warp player, area-effect on entities in region.
- **VFX**: any `Bullet`/`AtkParam`/`SpEffect`/TAE can reference an `sfxId` (FXR). New FXR are
  authorable. Dynamic lights ride on FXR.
- **Weather / sky**: map-scoped and controllable to a degree via EMEVD weather commands
  and `WorldMapWeather`/`Map` params [VERIFY per-map]. Full free storm control is limited
  (see A.4).

## A.2 What requires asset production (Class C — not text-generable)

- Custom Doom armor + Mjolnir **FLVER models**, materials, textures, LODs, cloth/cloak.
- Custom **rigged animations** (HKX) for melee movesets, throws, transformations,
  channeling poses, flight.
- Bespoke **audio** (WEM/FSB via wwise/fmod pipeline) — new SFX banks.

These are specified exactly in [`06-asset-specifications.md`](06-asset-specifications.md).
The mod *runs* without them by falling back to vanilla animations/effects; they are the
polish layer, not a blocker for the systems.

## A.3 Comic ability → engine mechanism map (the hard cases)

| Comic ability | Naive impossible version | Verified faithful implementation |
|---|---|---|
| Force field that blocks damage | "invulnerability" | `SpEffect` granting large `damageCutRate` for N frames + guard-like state; visible FXR dome; EMEVD auto-triggers an **emergency** field `SpEffect` when `changeHpPoint`-tracked HP crosses a threshold. |
| Teleport / blink | free 3D warp anywhere | Ash-of-War attack with a **root-motion dash HKX** + i-frames (real backstep/quickstep tech); "teleport behind target" = lock-on-relative warp via EMEVD `WarpPlayer`-to-region-relative-to-target [VERIFY relative warp support] — fallback: long i-frame dash. |
| Mjolnir throw + **return** | true physics projectile that comes back | Two-stage: throw = `Bullet` with long life + on-hit `SpEffect`; **return** = EMEVD/HKS state flag `HAMMER_THROWN` → recall grants weapon back + return-VFX. Hammer is modeled as a *state*, not a tracked rigid body (see A.5). |
| Time Stop | halt world simulation | EMEVD applies a **massive slow `SpEffect`** (`animIdOffset`/speed fields) to all enemies in region + freezes their AI goals; player unaffected. "Stop" = 95–99% slow, not true pause (engine has no global time pause hook). Honest abstraction. |
| Reality Rewrite / temporal reversal | rewind world state | Player-only snapshot: EMEVD records HP/FP/position/flags to variables on a rolling timer; on activate, restore those. **No world-state rewind** (would corrupt event progression) — documented compromise. |
| Infinity "Erasure" | delete enemies from existence | Ordinary enemies: apply lethal `SpEffect` + **disintegration FXR** so they *dissolve* not ragdoll. Bosses: capped catastrophic damage + debuff stack. Sandbox: raise the cap. |
| Mind control / charm | flip enemy faction permanently | Temporary **team/allegiance swap** via `NpcParam` team change through EMEVD `SetCharAiId`/team commands for ordinary enemies [VERIFY command]; bosses get a "confusion" AI-disable + damage-taken-up debuff instead. |
| Flight | 6-DoF free flight | Launch + air-dash + long hover via a **custom aerial moveset** with gravity-reduction `SpEffect` windows; not free flight (engine constrains player Y). Best safe approximation, per §20. |
| Weather control | author storms freely | Trigger existing weather states + spawn persistent lightning-strike `Bullet`s over a region; large bespoke storms limited to maps whose weather param exposes it. |

## A.4 Hard limits (state honestly, design around)

- **No global time pause.** Time Stop = extreme slow. Documented in every Time ability.
- **No true free flight.** Player vertical control is engine-bounded; flight = launch/hover/air-dash.
- **No safe world rewind.** Only player-state rewind is safe.
- **Teleport can clip geometry / break arenas.** Mitigation: warp only to validated regions,
  clamp to navmesh, forbid during specific boss cutscene flags (EMEVD guards in
  [`event/common_doom.js`](../event/common_doom.js)).
- **Boss AI can break** under stun-lock/faction-swap. All crowd-control abilities check a
  `IS_BOSS` SpEffect tag and route bosses to the "resistant" branch.
- **Weather is largely map-authored**; not every arena supports storm swaps.

## A.5 The Mjolnir-return design decision (worked example of the method)

Comic requirement (§17): throw Mjolnir; it flies out, hits things, and **physically returns**.

Engine reality: Elden Ring has no user-controllable returning-projectile-that-is-your-weapon
system. Options evaluated:

1. **Pure Bullet projectile** (throw a `Bullet`, no return) — rejected: fails "returns."
2. **Kunai/returning-knife mods exist** using a Bullet + a paired recall Bullet — viable but
   the weapon visually leaves your hand and the "hammer" is just a projectile mesh.
3. **State-machine hammer (chosen):** treat "hammer thrown" as a player **state flag**
   (`HAMMER_THROWN`, tracked as a `SpEffect` + EMEVD variable). On throw:
   - Play throw HKX; spawn a Mjolnir-mesh `Bullet` (long life, penetrating, on-hit lightning `SpEffect`).
   - Set `HAMMER_THROWN`; swap the equipped weapon to an invisible "empty-hand" variant so the model isn't duplicated.
   - **Recall input** (or auto after life expires / on second press): despawn projectile at its
     location, spawn a **return-streak FXR** from projectile position to player, restore the
     real weapon, clear `HAMMER_THROWN`, optionally deal damage to enemies along the return
     path via a thin follow-`Bullet`.

   This gives the full fantasy (leaves hand, flies, hits, returns to hand, damages on the way
   back) using only verified systems. It is the mod's signature system precisely because it's
   built from real primitives rather than faked with a lightning bolt. Full logic in
   [`event/common_doom.js`](../event/common_doom.js) and [`hks/c0000_doom_layer.hks`](../hks/c0000_doom_layer.hks).

## A.6 Verdict

Every system in this project is buildable to a faithful degree. The four honest compromises
(time = slow, flight = hover/dash, rewind = player-only, erasure = disintegrate-with-cap) are
each the *closest convincing representation* and are documented at their point of use, exactly
as §47/§58 require. Proceed to architecture.
