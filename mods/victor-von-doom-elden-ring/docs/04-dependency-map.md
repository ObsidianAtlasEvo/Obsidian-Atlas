# E. Technical Dependency Map

Which framework/tool owns each mechanic, and what each module depends on. Use this to disable a
module cleanly (§49) and to sequence the build (doc 05).

## E.1 Mechanic → owning tool

| Mechanic | Owned by | Artifact in this repo |
|---|---|---|
| File injection / load order / offline launch | **ModEngine2** | [`modengine/config_victorvondoom.toml`](../modengine/config_victorvondoom.toml) |
| Stats, resists, regen, buffs/debuffs, meters | `regulation.bin` **SpEffectParam** (Smithbox) | [`params/10-speffect.md`](../params/10-speffect.md) |
| Spells / projectiles | **Magic** + **Bullet** params (Smithbox) | [`params/20-magic-bullet.md`](../params/20-magic-bullet.md) |
| Button-triggered scripted attacks | **Ash of War**: SwordArtsParam + Behavior + AtkParam_Pc (Smithbox) | [`params/30-attacks-aow.md`](../params/30-attacks-aow.md) |
| Weapons, armor, talismans, items | **EquipParamWeapon/Protector/Accessory/Goods** | [`params/50-equipment.md`](../params/50-equipment.md) |
| Meters, transformation state, Doombots, hammer return, ultimates, weather | **EMEVD** (DarkScript3) | [`event/common_doom.js`](../event/common_doom.js) |
| Modifier control scheme, combined inputs | **HKS** `c0000` (Havok Script) | [`hks/c0000_doom_layer.hks`](../hks/c0000_doom_layer.hks) |
| Animations (events, hitboxes, cancel windows) | **TAE** (DSAnimStudio) + **ERClipGenerator** for new clips | [`docs/06-asset-specifications.md`](06-asset-specifications.md) |
| Particle/light VFX | **FXR** (@cccode/fxr) + WitchyBND repack | [`fxr/`](../fxr/) |
| SFX recolor / new banks | ER-SFXRecolorTool / wwise pipeline | doc 06 |
| Config menus, radials | **ESD** talk scripts (Smithbox) | [`config/doom-console.md`](../config/doom-console.md) |
| Models / textures / rigs / cloth | **Blender + SoulsFormats FLVER + Substance** | doc 06 |
| Text (item/spell names, menus) | **FMG** (Smithbox) | [`params/60-fmg-text.md`](../params/60-fmg-text.md) |

## E.2 Module dependency graph

```
Doom.Core ──────────────┬──> everything (state + resource spine)
  ├─ Doom.Armor         │        depends on: Core
  ├─ Doom.Tech          │        depends on: Core, Armor(meter)
  ├─ Doom.Sorcery       │        depends on: Core
  ├─ Doom.Doombots      │        depends on: Core, Tech(meter), EMEVD spawn
  └─ Doom.Combat        │        depends on: Core, TAE
Mjolnir  ───────────────┤        depends on: Core; optional Doom synergies
Odinforce ──────────────┤        depends on: Core; boosts Mjolnir if present
InfinityStones ─────────┤        depends on: Core; 6 sub-modules independent
Combined ───────────────┤        depends on: >=2 of {Mjolnir,Odinforce,Stones}
EmperorDoom ────────────┘        depends on: ALL of the above
VFX / Audio / UI ── cross-cutting, referenced by all
Compatibility ── provides fallback direct-cast rows; depends on nothing
```

Rule: **Core is mandatory**; every other module degrades gracefully if a dependency is absent
(state/resource spine tolerates missing tags). Combined/Emperor simply hide the rows whose
prerequisite modules aren't loaded (ownership-tag checks in EMEVD).

## E.3 External dependencies (versions to pin at build time — `[VERIFY]` current)

- ModEngine2 (latest release)
- Smithbox (1.12+ regulation) *or* DSMapStudio v1.11.1 (pre-1.12)
- DSAnimStudio (latest), ERClipGenerator
- WitchyBND (latest)
- DarkScript3 (latest; matching EMEDF)
- Node.js + `@cccode/fxr` (pin the version; its action/field IDs change across major versions)
- ER-SFXRecolorTool (optional)
- Paramdex bundled with Smithbox (field names in this repo are validated against it; still
  `[VERIFY]` per your version)

## E.4 Shared-resource footprint (merge-friendliness, §2/§49)

Files this mod touches (kept minimal):
- `regulation.bin` — **adds rows in reserved ID ranges**; overwrites vanilla rows only where
  unavoidable (listed in [`params/00-id-allocation.md`](../params/00-id-allocation.md)).
- `event/common.emevd.dcx` — **appends** event blocks (constructor calls added, existing events
  untouched) so other event mods can be merged by concatenation.
- `chr/c0000` (`behbnd` HKS, optional TAE) — the main conflict surface; documented for
  compatibility patching.
- `sfx/*.ffxbnd` — adds new FXR IDs in a reserved range; no vanilla FXR overwritten.
- `parts/*` + `msg/*.fmg` — new armor/weapon rows + text.

Anything editing `c0000` (movesets/HKS) is the usual conflict point with other moveset mods;
the Compatibility module documents the load-order + merge steps.
