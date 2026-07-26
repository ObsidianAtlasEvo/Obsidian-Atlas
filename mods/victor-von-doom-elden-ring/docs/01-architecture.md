# B. Final Architecture — one framework, four power sources

The core problem: four power systems must feel like *one character's* growing arsenal, not
four mods running at once. The solution is **three shared spine layers** that every ability
plugs into, plus a **per-source identity layer** on top.

```
                        ┌─────────────────────────────────────────────┐
                        │            IDENTITY LAYER (per source)        │
   Doom Tech  Doom Sorcery  Doombots  Mjolnir  Odinforce  6 Stones     │
   └── unique VFX palette · SFX family · animation posture · lore ─────┘
                        ▲            ▲            ▲            ▲
   ┌────────────────────┴────────────┴────────────┴────────────┴───────┐
   │  SPINE 3 — CONTROL LAYER   (hks/c0000 + Ash-of-War slots + Goods)  │  D
   │      modifier system, combined inputs, quick/charged/hold          │
   ├───────────────────────────────────────────────────────────────────┤
   │  SPINE 2 — RESOURCE LAYER  (SpEffect meters + EMEVD regen loops)   │  §44
   │   Armor Energy · Arcane Power · Divine Energy · Infinity Energy    │
   ├───────────────────────────────────────────────────────────────────┤
   │  SPINE 1 — STATE LAYER     (EMEVD state machine + SpEffect tags)   │  §23/§39
   │   active source · active Stone · transformations · hammer state    │
   └───────────────────────────────────────────────────────────────────┘
                        ▲
   ┌────────────────────┴──────────────────────────────────────────────┐
   │  ENGINE PRIMITIVES:  Magic · Bullet · SpEffect · AtkParam · Behavior│
   │  · Throw · ItemLot · EquipParam* · TAE · FXR · Weather · EMEVD      │
   └───────────────────────────────────────────────────────────────────┘
```

## B.1 Spine 1 — State layer

A single EMEVD-driven state machine holds the character's mode. State is stored as
**SpEffect tags** (a SpEffect the player carries = a boolean the whole system can read) and
**EMEVD variables**. Canonical state tags (IDs reserved in [`params/00-id-allocation.md`](../params/00-id-allocation.md)):

| Tag SpEffect | Meaning | Set by |
|---|---|---|
| `MODE_DOOM` | Doom modifier active | control layer |
| `MODE_MJOLNIR` | Mjolnir modifier active | control layer |
| `MODE_ODIN` | Odinforce modifier active | control layer |
| `MODE_STONE` | Infinity modifier active | control layer |
| `MODE_COSMIC` | Combined modifier active | control layer |
| `STONE_SEL_{SPACE..SOUL}` | currently selected Stone (6 exclusive) | Goods item / radial |
| `XF_ODINFORCE` | Odinforce transformation ON | activation ability |
| `XF_INFINITY` | Infinity State ON (all 6 owned) | activation ability |
| `XF_EMPEROR` | Emperor Doom ON | activation ability (requires all) |
| `HAMMER_THROWN` | Mjolnir is out | throw ability |
| `IS_BOSS` (on enemies) | route to resistant CC branch | enemy NpcParam |

Rule: transformations are **timed and mutually gated**, never permanently on (§39). Entering
one applies a "master aura" SpEffect that itself grants sub-effects, so a single toggle
cleanly changes dozens of downstream numbers.

## B.2 Spine 2 — Resource layer (§44)

Elden Ring has **FP** and **stamina**. We do not overload FP for everything. Instead each
source gets a **conceptual meter** implemented as a slow-changing SpEffect value + EMEVD regen
loop, surfaced through the UI layer (§48 / doc 03):

| Meter | Powers it fuels | Implementation |
|---|---|---|
| **Armor Energy** | Doom tech, shields, energy weapons, Doombots | tracked EMEVD counter `ARMOR_E` (0–100), regen +N/sec; abilities check-and-decrement. Surfaced via a repurposed HUD gauge (see doc 03 §UI). |
| **Arcane Power** | Doom sorcery | mapped to **FP** (natural fit: catalyst spells) with reduced cost under transformations. |
| **Divine Energy** | Mjolnir, Odinforce | tracked EMEVD counter `DIVINE_E`; Odinforce transformation floods it. |
| **Infinity Energy** | Stone abilities | tracked EMEVD counter `INF_E`; each Stone draws differently. |

**Lore-Accurate Mode** sets regen so high it's effectively unlimited (§44). **Balanced Mode**
uses the real drain/regen tables in [`params/40-resources.md`](../params/40-resources.md).
Because meters are EMEVD counters, the *same ability rows* work in both modes — only the
regen/cost constants differ, selected by the config item (§B.5).

## B.3 Spine 3 — Control layer (summarized; full map in doc 03)

The problem: ~150 abilities, a gamepad with ~14 buttons. Solution = **modifier + category**
model implemented across three real hooks:

1. **Source modifier** (which power system) — a **hold** input cycles/selects
   `MODE_*`. Implemented in `c0000.hks` reading a held bumper combo + d-pad, setting the
   `MODE_*` tag.
2. **Ability slots** — Elden Ring's spell/Ash-of-War/item slots become **category-scoped**:
   the *same* physical cast button fires a different `Magic`/`SwordArts` row depending on the
   active `MODE_*` tag (EMEVD/HKS switch on the tag → grant the matching Ash-of-War
   temporarily, or swap the equipped spell). This is how one button = dozens of abilities.
3. **Input flavor** — quick tap vs **charge (hold)** vs **directional** handled in TAE/HKS
   cancel windows: e.g. tap = quick blast, hold = charged beam, hold+direction = directional
   variant.

Fallbacks for reliability: every ability *also* has a plain, always-available spell/item entry
so nothing is unreachable if the modifier layer is disabled (Compatibility module).

## B.4 Identity layer (§40/§41)

Each source is pinned to a **fixed VFX palette + SFX family + animation posture** so a
screenshot reveals the active power (§40 objective). Central palette table in
[`fxr/palette.md`](../fxr/palette.md):

| Source | Color | Motion feel | SFX family |
|---|---|---|---|
| Doom Tech | green/white, geometric, electric | precise, mechanical | electromagnetic charge, metallic |
| Doom Sorcery | green arcane, sigils/circles | deliberate, gestural | occult resonance, whispers |
| Mjolnir | blue-white lightning, storm | heavy, grounded | thundercrack, rumble |
| Odinforce | gold-white celestial | expansive, regal | deep divine resonance |
| Space | blue | Time | green | Reality | red | Power | purple | Mind | yellow | Soul | orange | cosmic distortion tones |

## B.5 Configuration & modularity (§49/§52)

- A single **"Doom Console" Goods item** opens an ESD talk-menu (custom shop tech) to set:
  Lore-Accurate ⇄ Balanced, and enable/disable each module. Selection sets config SpEffect
  tags (`CFG_LORE`, `CFG_MOD_MJOLNIR_OFF`, …) the whole system branches on.
- Each module is a **separable set of param rows + one EMEVD file segment + one FXR group**,
  documented with its dependencies in [`04-dependency-map.md`](04-dependency-map.md). Disabling
  a module = not loading its rows; the state/resource spine tolerates missing modules.
- Shared-resource edits are kept minimal (§2): we add **new rows in reserved ID ranges**
  rather than overwriting vanilla rows wherever possible, which is also what makes the mod
  merge-friendly with other mods (Compatibility module).

## B.6 How the four systems complement (not collide)

- **Doom is the chassis.** Armor/tech/sorcery are always the baseline moveset; the other three
  sources are *acquired power-ups* Doom channels through his armor and magic (§36–38). Even
  holding Mjolnir, animations keep Doom's posture (§36 objective: "not suddenly fighting like Thor").
- **Combined modifier (`MODE_COSMIC`)** exposes cross-source abilities (Space+Power, Time+Power,
  etc., §34) as their own Ash-of-War rows that internally chain two source effects.
- **Emperor Doom** is the capstone state that unlocks the whole combined table at once and
  buffs every meter (§39).

Proceed to the ability catalogue.
