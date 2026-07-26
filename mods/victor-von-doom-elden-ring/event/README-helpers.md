# EMEVD helper-alias → real EMEDF instruction mapping

`common_doom.js` uses readable aliases so the logic is legible. Each alias is a **thin wrapper
over one or a few real EMEVD instructions** — none is an invented engine feature. Before
compiling in DarkScript3, define each alias at the top of your script using the exact EMEDF
instruction (`Help > View EMEDF`). Below is the honest mapping and any caveat. `[VERIFY]` =
confirm exact instruction name/signature in your EMEDF.

| Alias | Real EMEVD basis | Caveat |
|---|---|---|
| `SetSpEffect(char, id)` | `SetSpEffect` / `SetSpecialEffect` | core, well-supported |
| `ClearSpEffect(char, id)` | `ClearSpEffect` | some builds clear by category |
| `PlayerHasSpEffect / CharacterHasSpEffect` | condition `PlayerHasSpEffect` / `CharacterHasSpEffect` | core |
| `SetEventFlag / GetEventFlag` | `SetEventFlag`, condition `EventFlag` | core |
| `WaitFixedTimeSeconds(s)` | `WaitFixedTimeSeconds` | core |
| `WaitFor(cond)` | condition-group + `IfConditionGroup`/`GotoIf` | DarkScript3 sugar over cond registers |
| `PlayerHasItem(type,id)` | condition `PlayerHasItem`/`PlayerHasdItem` | `[VERIFY]` spelling |
| `AwardItemLot(id)` | `AwardItemLot` | for acquisition |
| `SpawnNpcNearPlayer(npc,team)` | map-object activation: enable a **pre-placed** disabled enemy, or asset spawn | ER spawns are usually **enable a map-placed, disabled entity**, not create-from-nothing. Pre-place Doombot spawn points in the maps you support, or use a generator. `[VERIFY]` |
| `scheduleDespawn(char,s,fx)` | timer + `DisableCharacter`/`KillCharacter` + FX | |
| `forEachEnemyInRadius(c,r,fn)` | `IsCharacterInsideRegion`/area conditions over a region, or apply an **area SpEffect bullet** | Cleanest: fire an invisible AoE `Bullet`/`SpEffect` region so the *engine* applies the SpEffect to everyone inside, instead of iterating in EMEVD. Prefer that. |
| `SlowActiveProjectiles` | area SpEffect that affects projectiles `[VERIFY]` | may be limited; fallback: only slow enemies |
| `WarpPlayerToRegion(r)` | `WarpPlayer`/`SetPlayerRespawnPoint`+move `[VERIFY]` | guard per §A.4 |
| `DuckAudio / ShiftLighting` | sound-environment + `SetAreaWeather`/light-scattering event params `[VERIFY]` | presentation only; safe to no-op |
| `MassKnockbackPulse(r)` | area `Bullet` with knockback AtkParam | reuse F6 shockwave bullet |
| `DealCappedDamage(char,n)` | apply a SpEffect with `changeHpPoint = -n` (bounded) | never one-shot bosses beyond cap |
| `meterAdd/meterSpend` | flag-range counter pattern OR helper DLL | see common_doom.js honest note; cooldown-only path avoids this entirely |
| `SwapToEmptyHandWeapon / RestoreHammerWeapon` | remove/give weapon + re-equip, or `ChangeWeapon` `[VERIFY]` | key to §A.5; test thoroughly |
| `PlayActivationFX/PlayStoneBurst/PlayReturnStreak` | `PlaySE`/`CreateFX at entity` / display SpEffect VFX | FXR IDs from fxr/ |

## The single most important simplification
Where `common_doom.js` shows `forEachEnemyInRadius(...) { SetSpEffect(enemy, X) }`, the
**preferred real implementation** is to spawn an **area-of-effect `Bullet`** whose on-hit
applies SpEffect X to every character it overlaps — letting the engine do the iteration. Use the
EMEVD loop form only for logic the engine can't express (e.g. the boss-vs-ordinary branch that
picks a *different* SpEffect per target). This keeps the event script small and performant (§55).
