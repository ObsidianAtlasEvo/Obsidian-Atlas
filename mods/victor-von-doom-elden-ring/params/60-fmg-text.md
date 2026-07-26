# FMG text (Smithbox → Text/FMG editor)

Every item/weapon/armor/spell needs a **name** and **description** FMG entry at the matching ID
(the row ID in the EquipParam maps to the FMG entry ID). Write in-character, comic-accurate
(§56 generic-descriptions ban). Edit via Smithbox's Text editor; entries live in
`msg/engus/*.msgbnd.dcx` (item names, weapon names, goods descriptions, etc.).

## Naming conventions
- Weapons/armor/goods: **Title Case**, regal tone.
- Descriptions: 2–4 sentences, lore-anchored, hint at the mechanic.

## Sample entries (fill the rest from the ability catalogue)

| FMG target | ID | Name | Description |
|---|---|---|---|
| Weapon name | 7700000 | **Mjolnir** | Uru hammer forged in a dying star's heart. Answers the worthy hand and returns to it, wreathed in storm. Its weight is absolute to all it strikes. |
| Weapon desc | 7700000 | | Heavy strikes call localized lightning. Throw and recall it at will. In Doom's grip, the enchantment bends to a will that refuses to be told it is unworthy. |
| Protector name | 7700001 | **Armor of Doom (Cuirass)** | The iron shell of Latveria's monarch — powered plate wedding sorcery to science. |
| Goods name | 7700000 | **Doom Console** | A gauntlet interface. Commands the systems of the armor and configures the sovereign's arsenal. |
| Goods name | 7700010 | **Space Stone** | A shard of the primordial cosmos. Bends where things may exist. |
| Goods desc | 7700010 | | While attuned, distance becomes suggestion: blink, portal, and collapse space around your foes. |
| Sorcery name | 7710 | **Eldritch Bolt** | A seeking lance of green mystic fire, the first lesson of Doom's black arts. |
| Sorcery name | 7740 | **Thunder of Mjolnir** | Call the sky's judgment upon a marked foe. |
| Goods name | 7700020 | **Invoke the Odinforce** | Draw upon the All-Father's stolen authority. The world dims before it. |

## Text families to complete
- Doom armor ×4, Mjolnir ×2, Doom Console, 6 Stone selectors, transformation activators.
- Every Magic row (E/T/S/L/O/Stone spells) — name + description.
- Any custom menu strings for the config ESD (params/config).

Keep a `fmg.doom.json`/CSV export in version control as the source of truth so text survives
regulation rebuilds.
