// ============================================================================
//  FXR authoring scaffold  (Node + @cccode/fxr)
// ----------------------------------------------------------------------------
//  Purpose: derive the mod's per-source VFX families from existing ER effects by
//  RECOLORING to the palette (fxr/palette.md), which is the fast, reliable path;
//  and show where to author bespoke shapes from scratch.
//
//  Setup:
//    npm init -y && npm install @cccode/fxr
//    # unpack the sfx bnd first:  WitchyBND sfxbnd_commoneffects.ffxbnd.dcx
//    node build_fxr.mjs
//
//  [VERIFY] API surface against https://fxr-docs.pages.dev (pin the version — the
//  library's class/field names change across majors). The high-level calls used
//  here (FXR.read, fxr.recolor, fxr.write) are the library's documented entry
//  points; confirm exact signatures for your installed version before relying on
//  a build pipeline.
// ============================================================================

import { FXR } from '@cccode/fxr';           // [VERIFY export name/path]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Palette (linear RGBA 0..1) — mirrors fxr/palette.md
const PAL = {
  doom:    [0.10, 0.95, 0.35, 1],
  sorcery: [0.15, 0.85, 0.40, 1],
  mjolnir: [0.55, 0.75, 1.00, 1],
  odin:    [1.00, 0.90, 0.55, 1],
  space:   [0.20, 0.45, 1.00, 1],
  mind:    [1.00, 0.85, 0.15, 1],
  reality: [0.95, 0.15, 0.20, 1],
  power:   [0.60, 0.20, 0.95, 1],
  time:    [0.20, 0.90, 0.45, 1],
  soul:    [1.00, 0.50, 0.15, 1],
};

// Map: new FXR id (reserved band, params/00)  <-  donor vanilla FXR file  +  target color
// Choose donors whose SHAPE already matches the ability (a beam donor for beams, a
// nova donor for radial bursts) so recolor alone yields a convincing effect.
const RECIPES = [
  { out: 7700010, donor: 'f000450360.fxr', color: PAL.doom,    note: 'Doom energy trail' },      // [VERIFY donor ids]
  { out: 7700011, donor: 'f000XXXXXX.fxr', color: PAL.doom,    note: 'Doom charged beam' },
  { out: 7700030, donor: 'f000XXXXXX.fxr', color: PAL.doom,    note: 'Doom electric arc (green-white)' },
  { out: 7700100, donor: 'f000XXXXXX.fxr', color: PAL.mjolnir, note: 'Mjolnir throw streak' },
  { out: 7700101, donor: 'f000XXXXXX.fxr', color: PAL.mjolnir, note: 'Mjolnir return streak' },
  { out: 7700200, donor: 'f000XXXXXX.fxr', color: PAL.doom,    note: 'Aegis dome' },
  { out: 7700600, donor: 'f000XXXXXX.fxr', color: PAL.odin,    note: 'Odinforce aura' },
  { out: 7700700, donor: 'f000XXXXXX.fxr', color: PAL.space,   note: 'Space stone' },
  { out: 7700701, donor: 'f000XXXXXX.fxr', color: PAL.mind,    note: 'Mind stone' },
  { out: 7700702, donor: 'f000XXXXXX.fxr', color: PAL.reality, note: 'Reality stone' },
  { out: 7700703, donor: 'f000XXXXXX.fxr', color: PAL.power,   note: 'Power stone' },
  { out: 7700704, donor: 'f000XXXXXX.fxr', color: PAL.time,    note: 'Time stone' },
  { out: 7700705, donor: 'f000XXXXXX.fxr', color: PAL.soul,    note: 'Soul stone' },
];

const SRC = './sfxbnd_commoneffects-ffxbnd/effect';   // WitchyBND unpack dir  [VERIFY path]
const OUT = './out';
mkdirSync(OUT, { recursive: true });

for (const r of RECIPES) {
  if (r.donor.includes('XXXX')) { console.log(`skip ${r.out} (${r.note}): pick a donor fxr`); continue; }
  const fxr = FXR.read(readFileSync(`${SRC}/${r.donor}`));     // [VERIFY read signature]
  // Recolor every color-bearing property to the target hue while preserving the
  // effect's alpha/brightness dynamics. The library exposes a recolor helper that
  // walks the effect's color properties.
  fxr.recolor(([r0, g0, b0, a0]) => {
    // Preserve luminance so bright cores stay bright; tint toward target.
    const lum = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    return [r.color[0] * (0.4 + lum), r.color[1] * (0.4 + lum), r.color[2] * (0.4 + lum), a0];
  });                                                          // [VERIFY recolor signature]
  writeFileSync(`${OUT}/f${String(r.out).padStart(9,'0')}.fxr`, fxr.write());  // [VERIFY write]
  console.log(`built ${r.out}: ${r.note}`);
}

// ---- Authoring from scratch (for shapes no donor matches) -------------------
// The library also lets you build an FXR from Node/Action trees (emitters,
// particles, lights). Use this for the Infinity sequential-ignition and the
// disintegration dissolve, which have no clean vanilla donor. See fxr-docs for
// the current BasicNode/Action API; keep particle counts budgeted (§55).

// After building: copy ./out/*.fxr back into the unpacked effect folder, add each
// new file to _witchy-bnd4.xml (the bnd manifest) as a new entry, then repack:
//   WitchyBND sfxbnd_commoneffects-ffxbnd   ->  sfxbnd_commoneffects.ffxbnd.dcx
// Place the result in Doom/sfx/. The new FXR ids are now referenceable from
// Bullet.sfxId / SpEffect.vfxId / TAE VFX events (params/20, params/10).
