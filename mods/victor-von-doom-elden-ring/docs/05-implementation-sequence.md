# F. Implementation Sequence

Build reliable foundations before spectacle (§53). Each phase lists: goal, artifacts, exact
tool steps, and an in-game **acceptance test** before moving on. Do not start a phase until the
previous phase's acceptance test passes.

## Phase 0 — Environment & safety (½ day)
1. Install ModEngine2; create mod folder `Doom/`; confirm `launchmod_eldenring.bat` boots
   vanilla game offline (EAC off).
2. **Back up** `regulation.bin`, `c0000.behbnd.dcx`, target `.ffxbnd`, and your save (§ doc 07).
3. Install Smithbox, DSAnimStudio, WitchyBND, DarkScript3, Node + `@cccode/fxr`.
4. Drop [`modengine/config_victorvondoom.toml`](../modengine/config_victorvondoom.toml) in and
   point it at `Doom/`.
**Acceptance:** empty mod folder loads; game runs; backups verified restorable.

## Phase 1 — Architecture spine (Core) (§53 Ph1)
Goal: state + resource + control skeleton with **one** proof-of-life ability.
1. Smithbox: create the reserved param rows from [`params/00-id-allocation.md`](../params/00-id-allocation.md):
   the `MODE_*`/`STONE_SEL_*`/`XF_*` **tag SpEffects**, the resource-meter SpEffects, and the
   config tags (`CFG_LORE`, module toggles).
2. DarkScript3: paste the **Core** section of [`event/common_doom.js`](../event/common_doom.js)
   (resource regen loops, config init, tag housekeeping); Batch Resave → `common.emevd.dcx`.
3. HKS: install [`hks/c0000_doom_layer.hks`](../hks/c0000_doom_layer.hks) into `c0000.behbnd`
   (WitchyBND unpack → replace `c0000.hks` → repack). Wire the Cosmic Selector → `MODE_*`.
4. Add **one** test ability: Palm Blast (E1) as a Magic+Bullet, castable in `MODE_DOOM`.
5. Add the **Doom Console** Goods item + ESD menu skeleton ([`config/doom-console.md`](../config/doom-console.md)).
**Acceptance:** hold selector → D-pad Up sets Doom mode (HUD indicator changes); RB fires Palm
Blast; Armor Energy drains and regens; Console toggles Lore/Balanced and the damage changes.

## Phase 2 — Doom (§53 Ph2)
Order: Armor → Melee → Tech energy → Shields → Electricity → Sorcery → Teleport → Doombots.
1. **Armor** (`params/50`): EquipParamProtector rows + resident SpEffect chain (C.1). Add FMG
   names/icons. (Model = Class-C; use a placeholder set meanwhile.)
2. **Melee** (`params/30`): AtkParam_Pc chains + TAE hit events (C.8) on a heavy-fist base.
3. **Tech energy** (`params/20`): E1–E12 Bullets + Magic rows; distinct FXR per role.
4. **Shields** (`params/30`): Aegis Barrier AoW + EMEVD integrity/break + Emergency Field monitor.
5. **Electricity** (`params/20`): T1–T8, green-white FXR family.
6. **Sorcery** (`params/20`): S1–S14 incantation rows, occult FXR.
7. **Teleport** (`params/30` + EMEVD guards): TP1–TP7; test clipping/arena guards hard.
8. **Doombots** (EMEVD + NpcParam): spawn/lifetime/orders/self-destruct.
**Acceptance:** full Doom kit playable end-to-end; teleport never clips test arenas; Doombots
spawn, fight, expire, and self-destruct without AI hangs.

## Phase 3 — Mjolnir (§53 Ph3)
1. Weapon: EquipParamWeapon (real) + empty-hand variant; FMG. (Model = Class-C.)
2. Melee moveset H1–H9 (AtkParam + TAE impact package: shake/debris/shock).
3. **Throw & Return** state machine (EMEVD + HKS, per §A.5) — the signature system; test the
   auto-recall safety net exhaustively (stuck-hammer is the #1 risk).
4. Divine Lightning L1–L11 (blue-white FXR); wire `STORM_ACTIVE` boost.
5. Weather W1–W4 (EMEVD weather cmds; note map limits).
6. Flight/Bifrost FL1–FL6 (launch/hover/air-dash SpEffect windows; rainbow Bifrost FXR).
**Acceptance:** throw always returns (even on whiff, on enemy death mid-flight, on area change);
lightning reads as clearly different from Doom's green tech; flight never falls through floor.

## Phase 4 — Odinforce (§53 Ph4)
1. Transformation `XF_ODINFORCE` master aura + timer/CD (EMEVD) + gold FXR aura.
2. Energy O1–O8; Matter/energy O9–O14; Authority O15–O19 (boss-branch on `IS_BOSS`).
3. Wire Odinforce → Doom/Mjolnir synergies (§37): cost reduction, gold arcs, celestial slams.
**Acceptance:** transform buffs measurable; authority CC overwhelms trash but bosses resist;
no permanent-transformation bug (timer always expires; §54).

## Phase 5 — Infinity Stones (§53 Ph5) — build one Stone fully, then repeat
Per Stone: passive SpEffect + active kit + ultimate + color FXR family + SFX tone.
Order: **Power → Space → Time → Soul → Mind → Reality** (simplest mechanics first; Mind/Reality
have the trickiest AI/faction/scale edge cases, so do them last).
- Power: amplification tag (PO7) is a Core-level primitive many others reuse — build it early.
- Space: warp/portal guards reuse Phase-2 teleport guards.
- Time: EMEVD mass-slow + player-only snapshot (TI7) — verify no world-state corruption.
- Soul: drain/heal + spectral summon (reuse Doombot spawn tech).
- Mind: team-swap/confuse — heaviest `[VERIFY]` on AI commands; boss branch mandatory.
- Reality: transform/scale/resist-invert/full-screen filter — heaviest `[VERIFY]`; ship the
  verified subset, gate the rest behind a config flag.
**Acceptance (each Stone):** passive + all actives + ultimate fire; boss branches safe; no
permanent debuff leaks; disintegration FXR plays on erasure kills.

## Phase 6 — Combined systems (§53 Ph6)
1. Stone pairs CB1–CB6 (chain two Stone effects in one AoW/EMEVD call).
2. Cross-source synergies: Doom+Mjolnir (§36), Doom+Odinforce (§37), Doom+Stones (§38),
   Mjolnir+Odinforce.
3. Infinity State `XF_INFINITY` + "Infinity" ultimate (sequential-Stone activation timeline).
**Acceptance:** combined abilities feel emergent (not two buffs); Infinity ultimate sequence
plays fully; boss/erasure/sandbox modes behave per config.

## Phase 7 — Emperor Doom (§53 Ph7)
1. Ownership-gate check (armor+Mjolnir+Odinforce+6 Stones).
2. `XF_EMPEROR` master aura layering every buff + unlocking exclusive fusions + cost cuts.
3. Monumental activation sequence (camera + FXR + sound duck).
**Acceptance:** only activatable when all prerequisites owned; timer + long CD; monumental but
not game-breaking to the point of crashes.

## Phase 8 — Polish (§53 Ph8)
Animations (Class-C), FXR pass, SFX banks, UI/HUD, balancing against the full test matrix
(doc 07), compatibility/load-order docs, performance budget (§55), debugging.
**Acceptance:** full doc-07 test matrix green; stable 20-min play sessions; no save corruption.

---

### Per-feature micro-loop (apply within every phase, §58)
1. State desired behavior → 2. Identify ER system → 3. Identify files/params/scripts →
4. Implement rows/script → 5. Provide exact config → 6. Install → 7. Test (acceptance) →
8. Check interactions → 9. Resolve conflicts → 10. Next.
