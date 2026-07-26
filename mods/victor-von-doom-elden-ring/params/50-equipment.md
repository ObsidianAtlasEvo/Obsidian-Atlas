# Equipment: armor, Mjolnir, talismans, items, acquisition (Smithbox)

## 50.1 Doom armor (EquipParamProtector) — 4 rows
```
param EquipParamProtector: id 7700000: # Doom Mask+Hood (head)
  residentSpEffectId: = 7700100;        # armor passive hub (params/10) [VERIFY field 'residentSpEffectId1']
  defenseMaterial/absorption fields ...  # set per docs/06 durability spec
param EquipParamProtector: id 7700001: # Doom Torso+Cloak (body)  residentSpEffectId2: = 7700101;
param EquipParamProtector: id 7700002: # Doom Gauntlets (arms)    (palm dummypoly for VFX)
param EquipParamProtector: id 7700003: # Doom Greaves (legs)
```
Only ONE part needs to carry each resident SpEffect (avoid double-stacking). Model/textures =
Class-C (docs/06 §1). FMG names/icons in params/60.

## 50.2 Mjolnir (EquipParamWeapon) — real + empty-hand variant
```
param EquipParamWeapon: id 7700000: # Mjolnir (real)
  wepType: = hammer/great-hammer [VERIFY enum];
  swordArtsParamId: = 7700200;         # Mjolnir Ash of War slot (throw/charge/lightning arts)
  weight/strReq/scaling ...            # heavy; high strike
  spEffectBehaviorId0: = ...           # on-hit lightning behavior [VERIFY]
param EquipParamWeapon: id 7700001: # Mjolnir (empty-hand variant, used while HAMMER_THROWN)
  # identical stats but invisible/absent model so the model isn't duplicated during throw (§A.5)
```
EMEVD swaps 7700000 ⇄ 7700001 on throw/recall.

## 50.3 Passive-system talismans (EquipParamAccessory) — optional split of armor systems
For players who want the armor *look* separate from the *systems*, expose select passives as
talismans (Target Analysis, Arc-Reactor Reserves). Each = a `refId` to a SpEffect.
```
param EquipParamAccessory: id 7700000: refId: = 7700106;  # Target Analysis
param EquipParamAccessory: id 7700001: refId: = 7700105;  # Arc-Reactor Reserves (Armor Energy regen)
```

## 50.4 Goods items (EquipParamGoods) — console, activators, stone selectors
```
param EquipParamGoods: id 7700000: # "Doom Console" — opens config ESD menu
  goodsType: = ... ; refId: = 7700500;   # SpEffect that triggers the talk/menu event [VERIFY menu-open path]
param EquipParamGoods: id 7700010..15: # Stone selectors (Space..Soul) — set STONE_SEL_* tag
param EquipParamGoods: id 7700020: # "Invoke Odinforce" activator (or use Ash of War)
param EquipParamGoods: id 7700021: # "Infinity State" activator (checks 6-stone ownership)
param EquipParamGoods: id 7700022: # "Emperor Doom" activator (checks OWN_* gates)
```
Activation via item is the simplest reliable trigger; the control-scheme radial/console
(doc 03) is the polished front-end that ultimately sets the same tags.

## 50.5 Acquisition (ItemLotParam) — how the player gets everything
For a clean start, grant the full kit at a known location or via the Console:
```
param ItemLotParam_map: id 7700000: # a lot that awards Doom armor set + Mjolnir + Console + all 6 Stone selectors
  # place at an accessible spot (e.g. a reachable corpse/chest near the start), or
  # have the Console 'give items' on first interaction (EMEVD AwardItemLot).
```
Document the exact placement so testers can reach it immediately (§52 installation clarity).

## 50.6 Ownership gates (Emperor Doom prerequisite)
Owning each artifact sets an `OWN_*` tag (params/00: 7700080–83) via an EMEVD "has item →
grant SpEffect" loop. Emperor activation checks all four tags. `OWN_6STONES` requires all six
Stone selector items in inventory.
