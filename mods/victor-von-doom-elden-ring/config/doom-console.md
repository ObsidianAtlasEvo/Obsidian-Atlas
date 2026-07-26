# Doom Console — configuration & UI system (§48/§49)

A single Goods item, **Doom Console** (EquipParamGoods 7700000), is the mod's front-end. Using
it opens an **ESD talk menu** (the same "custom shop / talk" tech used for merchant menus) so
the player configures the mod in-game without editing files.

## Menu tree
```
DOOM CONSOLE
├─ Power Mode
│   ├─ Lore-Accurate   → SetEventFlag CFG_LORE ON   (fast regen, high mult; §1 power fantasy)
│   └─ Balanced        → SetEventFlag CFG_LORE OFF  (tuned costs/cooldowns/damage)
├─ Modules  (toggle each; sets CFG_MOD_*_OFF tags → EMEVD/HKS skip that module)
│   ├─ Mjolnir      [on/off]
│   ├─ Odinforce    [on/off]
│   ├─ Infinity Stones [on/off]
│   ├─ Doombots     [on/off]
│   └─ Emperor Doom [on/off]
├─ Infinity Ultimate Target Rule
│   ├─ Erasure (ordinary disintegrate)      → CFG default
│   ├─ Boss-safe (capped dmg + debuff)       → always applies to IS_BOSS
│   └─ Sandbox (uncapped)                     → SetEventFlag CFG_SANDBOX ON
├─ Quick-Cast Radial  → assign 8 favorite abilities (writes selection tags)
└─ Grant Kit  → AwardItemLot 7700000 (armor + Mjolnir + 6 Stone selectors), for testing
```

## Implementation
- **ESD talk script** (edit in Smithbox's ESD/EzState editor, or DarkScript-adjacent tooling):
  each menu leaf runs a talk command that sets the corresponding **event flag** (`CFG_*`). The
  whole system already branches on these flags (params/40 selects LA/B tables; EMEVD checks
  `CFG_MOD_*_OFF` before running a module's events; HKS checks them before routing abilities).
- **Opening the menu:** the Console Goods item's use triggers an EMEVD event
  (`PlayerUsedItem 7700000` → `TalkToPlayer <esd menu>`), `[VERIFY]` the exact "open talk from
  item" path — alternative is binding it to a Site-of-Grace sub-menu.

## HUD / feedback (§48) — honest options
Elden Ring has no official custom-HUD API. Two real paths:
1. **Repurpose existing UI** (verified-safe default): show the active source and meters by
   repurposing existing gauges/status-icon slots — e.g. a persistent status-icon per active
   `MODE_*`/`XF_*` (status icons are a real SpEffect feature: a SpEffect can show an icon),
   and represent meter thresholds with tiered status icons (low/med/high). Cooldowns shown as
   temporary status icons. Not pixel-perfect, but reliable and text-free.
2. **Custom HUD overlay** (polish, extra dependency): a memory-hook/overlay mod draws real
   bars. This is the clean UX but adds a DLL dependency — gate it behind the UI module and mark
   `[VERIFY]` for the specific overlay framework you choose.

The default build uses path 1 so the mod is self-contained; path 2 is an opt-in upgrade.

## Why a console instead of scattered options
- One discoverable entry point (§48 "always understand what powers are available").
- All config is **event flags**, so nothing needs a rebuild to change at runtime (§ doc 07
  debugging: bisect modules live).
- Keeps the mod modular (§49): disabling a module is a flag, not a reinstall.
