# Testing, Troubleshooting, Backup & Uninstall

## 1. Backup (do BEFORE any edit) (§2/§52)
- Copy `regulation.bin` → `regulation.bin.vanilla` (a bad merge corrupts saves).
- Copy `c0000.behbnd.dcx`, target `*.ffxbnd.dcx`, edited `*.anibnd.dcx`, `*.msgbnd.dcx`.
- Copy your `ERxxxxx.sl2` **save** to a dated folder. Test on a **throwaway character** first.
- Keep the mod in ModEngine2's folder — never overwrite the Steam install, so vanilla is always
  one launcher away.

## 2. Test matrix (§54) — run every ability against every row
Environments: ordinary enemy · groups · large enemy · humanoid boss · enormous boss ·
magic-resistant · lightning-resistant · narrow interior · open field · uneven terrain · elevator
· ladder · scripted boss arena · Site of Grace · mounted area.

Mechanics needing dedicated tests: teleport, portals, hammer return, flight, time manipulation,
enemy displacement, summons, transformations, combined powers.

For each (ability × environment) record: fires? correct VFX/SFX? correct damage (LA & B)? correct
enemy reaction? FPS impact? any of the failure classes below?

## 3. Failure classes to watch (§54) + fixes
| Symptom | Likely cause | Fix |
|---|---|---|
| Crash on cast | bad Bullet/SpEffect ref, missing FXR ID | verify referenced IDs exist; check FXR packed into ffxbnd |
| Enemy AI freeze/breaks | faction-swap/stun-lock on a boss | ensure `IS_BOSS` branch routes bosses to resistant path |
| Permanent slow-motion | Time-field SpEffect never cleared | add hard timer + on-area-change cleanup in EMEVD |
| Stuck hammer (can't attack) | throw state never cleared | auto-recall safety net on life-expiry/area-change (§A.5) |
| Stuck transformation | timer/CD flag desync | single authoritative timer; clear-all on death/grace/area-change |
| Fall through terrain | teleport to invalid point | clamp warp to navmesh; forbid warp during boss-intro flags |
| Broken boss phase | warp/despawn during scripted phase | guard abilities behind phase flags; block traversal warps in arenas |
| Invincibility bug | i-frame SpEffect not expiring | frame-bounded windows only; never open-ended |
| Save "corrupt"/won't load | edited regulation mismatch or added items on a vanilla save | test on throwaway char; restore `regulation.bin.vanilla`; back up saves |
| Huge FPS drop | too many persistent emitters/summons/checks | budget particles (§55); burst-then-clear; cap summons; throttle EMEVD loops |

## 4. Debugging procedure
- Reproduce minimally (single ability, single enemy, open field).
- Bisect: disable modules via the Doom Console to isolate the culprit (§49 modularity pays off).
- EMEVD: add debug flags / on-screen text events; check DarkScript3 compile warnings.
- Params: re-open in Smithbox; confirm no dangling references (Smithbox flags some).
- FXR: confirm the FXR ID is both authored *and* packed into the ffxbnd and referenced by the
  right param field.
- HKS: test the control layer in isolation; if a moveset mod conflicts, use Compatibility
  fallback (direct-cast rows, HKS layer off).
- Keep a changelog per phase so regressions are bisectable.

## 5. Rollback
- Restore `regulation.bin.vanilla` and any backed-up chr/sfx/anibnd files into the mod folder,
  or simply launch vanilla via Steam (mod is folder-isolated).
- The Doom Console can disable modules at runtime without a rebuild for quick triage.

## 6. Uninstall
- Delete the `Doom/` mod folder (or remove it from `config_victorvondoom.toml` load order).
- If you played a modded character: items/effects added by the mod may linger on that save —
  keep a pre-mod save backup; the mod adds nothing that persists once its rows are gone except
  inventory references (unequip/drop modded items before uninstalling to be safe).
- No changes are made to the Steam install, so uninstalling the mod fully restores vanilla.

## 7. Performance budget (§55)
- Persistent VFX: prefer <a few hundred live particles; ultimates burst then clear within ~2s.
- Dynamic lights: cap concurrent; disable on distant/off-screen effects.
- Summons: hard cap (Doombots ≤3, spectral ≤ small); despawn on timer.
- EMEVD loops: throttle high-frequency monitors (HP watch, resource regen) to a sane tick, not
  every frame.
- Projectile counts: barrages use timed waves, not simultaneous hundreds.
