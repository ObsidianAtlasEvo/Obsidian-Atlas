# D. Control Scheme

Goal (§3): command ~150 abilities without menu-diving, on both controller and KBM, with
minimal misfires, usable at Elden Ring combat speed.

Core model = **Source Modifier × Ability Slot × Input Flavor**:

- **Source Modifier** picks the power system (`MODE_*`).
- **Ability Slot** picks which ability within that system (reuses ER's spell/AoW/item slots,
  re-scoped by the active mode).
- **Input Flavor** (tap / hold-charge / + direction) picks the variant.

One physical button therefore yields *(modes) × (flavors)* abilities.

## D.1 Layer 1 — Source Modifier (which power)

Held selector. On controller, **hold L1+L2 together = "Cosmic Selector"**; while held, the
**D-pad** picks the active source; release to lock it. A quick double-tap of a single bumper can
also cycle. The chosen source lights the HUD source indicator (doc §UI).

| Selector input | Sets |
|---|---|
| D-pad Up (in selector) | `MODE_DOOM` (tech) |
| D-pad Up ×2 / hold | `MODE_DOOM_SORCERY` |
| D-pad Right | `MODE_MJOLNIR` |
| D-pad Down | `MODE_ODIN` |
| D-pad Left | `MODE_STONE` (uses selected Stone) |
| L1+L2 hold + R3 | `MODE_COSMIC` (combined) |

Implemented in [`hks/c0000_doom_layer.hks`](../hks/c0000_doom_layer.hks): the HKS reads the held
combo each frame and grants/removes the exclusive `MODE_*` SpEffect. Because it's a *held*
selector, walking around never changes your mode by accident (misfire mitigation, §3).

## D.2 Layer 2 — Ability Slots (which ability)

Four "action buttons" become **mode-scoped ability triggers**. In ER terms we bind them to
custom Ash-of-War / spell casts, and the active `MODE_*` tag routes each to the right row.

| Physical (controller) | Role | Example by mode |
|---|---|---|
| **R1** (with modifier held) | Primary attack ability | Doom: Palm Blast · Mjolnir: Quick Throw · Odin: Divine Bolts · Stone: (Stone primary) |
| **R2** (with modifier) | Heavy/charged ability | Doom: Charged Beam · Mjolnir: Charged Throw · Odin: Charged Beam |
| **L1** (with modifier) | Utility/defense | Doom: Aegis Barrier · Mjolnir: Weather · Stone: Space blink |
| **L2** (with modifier) | Signature/ultimate | Doom: Doombots · Mjolnir: Superbolt · Stone: Stone Ultimate |
| **△/Y** (with modifier) | Mobility | Doom: Teleport · Mjolnir: Flight/Bifrost · Space: Portal |

Within a Stone (`MODE_STONE`), the **six Stones** are chosen by a **radial** (see D.4), and the
same four action buttons fire that Stone's primary/heavy/utility/ultimate.

## D.3 Layer 3 — Input Flavor

Handled in TAE cancel windows + HKS input read:
- **Tap** = quick version (low cost, fast recovery).
- **Hold** = charged version (release to fire; charge level scales damage/size).
- **Modifier + Direction (stick)** = directional variant (e.g. directional teleport, angled
  shield, ground-skim throw).
- **Contextual** = some abilities auto-vary (e.g. Blink Behind Target only when locked on).

## D.4 Radial menus (Stone select + quick-cast)

Two radials via **hold-to-open** (menus only when you *want* them, §3):
- **Stone Radial** (hold D-pad Left): 6 wedges, one per Stone → sets `STONE_SEL_*`.
- **Quick-Cast Radial** (hold Touchpad / Back): 8 user-favorited abilities for instant fire,
  regardless of current mode. Configurable in the Doom Console.

Radials are implemented via ESD talk-menu tech (the same "custom shop"/menu system used for the
config console) or, if smoother, a HUD-overlay FXR ring with HKS selection — the ESD path is
the verified-safe default; the FXR-ring is an optional polish path `[VERIFY]`.

## D.5 Full controller map (Xbox layout; PS analogous)

```
                    [Cosmic Selector]  = LB + LT (hold) → D-pad = source ; +R3 = Cosmic
   ┌───────────────────────────────────────────────────────────────────┐
   │  LT ── (with source held) Heavy/Charged ability                    │
   │  LB ── (with source held) Utility / Defense                        │
   │  RT ── (with source held) — reserved: Amplify(Power)/Empower       │
   │  RB ── (with source held) Primary ability                          │
   │  Y  ── (with source held) Mobility (teleport / flight / portal)    │
   │  X  ── (with source held) Secondary attack                         │
   │  B/A ─ vanilla dodge/jump PRESERVED (never remapped — reliability) │
   │  D-pad ── source select (in selector) / Stone radial (hold Left)   │
   │  Touchpad/Back (hold) ── Quick-Cast radial                         │
   │  Start ── Doom Console (config: Lore/Balanced, modules)            │
   └───────────────────────────────────────────────────────────────────┘
   Transformations: LB+LT+R3 (Cosmic) then Y (hold) = context transform
     (Odinforce in MODE_ODIN, Infinity in MODE_COSMIC w/ 6 stones, Emperor if all owned)
```

Dodge (B), jump (A), sprint, and interact stay **exactly vanilla** so core survival inputs
never depend on the mod layer (critical reliability choice, §3).

## D.6 Keyboard & mouse map

| Input | Function |
|---|---|
| **CapsLock (hold)** | Cosmic Selector; number row 1–6 = source / Stone while held |
| **LMB** (+source) | Primary ability |
| **RMB** (+source) | Heavy/charged (hold to charge) |
| **Q** (+source) | Utility/defense |
| **E** (+source) | Signature/ultimate |
| **F** (+source) | Mobility |
| **Mouse4/Mouse5** | Quick-Cast radial / Stone radial (hold) |
| **R** | Amplify / Empower (Power Stone) |
| **Shift/Space/Ctrl** | vanilla sprint/jump/crouch PRESERVED |
| **G** | Doom Console |

KBM directional variants read WASD during the ability's cast window.

## D.7 Customization & misfire mitigation

- Bindings that route through Ash-of-War/spell slots inherit ER's own remap where possible;
  the modifier combos live in `c0000.hks` and are editable constants at the top of that file
  (documented) for users who want different chords (§3 customizable-where-feasible).
- **Misfire mitigation:** every ability requires *modifier held* + action; bare button presses
  remain vanilla. Transformations require a **hold** (not a tap). Cooldowns + resource checks
  prevent accidental spam. A short input-lock after transformation prevents double-activate.
- **Reliability fallback (Compatibility module):** disabling the HKS layer falls back to plain
  spell/AoW slots — every ability also exists as a directly-castable row, so nothing becomes
  unreachable if a user's HKS setup conflicts with another mod.
