# VFX Palette & Family definitions (§40)

A screenshot must reveal the active power without UI text. Each source owns a color + motion
signature; recolor variants are fast via ER-SFXRecolorTool, bespoke shapes via `@cccode/fxr`.
RGBA values are authoring targets (0–1 linear); tune to taste in-engine.

| Source | Primary RGBA | Secondary | Shape / motion signature |
|---|---|---|---|
| Doom Tech | `0.10, 0.95, 0.35` (green) | white core `1,1,1` | geometric, hard-edged, electric arcs, hex panels |
| Doom Sorcery | `0.15, 0.85, 0.40` (green) | dark emerald | rotating runic circles, sigils, smoky trails |
| Doom Electric | `0.55, 1.0, 0.55` (green-white) | white | thin fast branching arcs, mechanical |
| Mjolnir | `0.55, 0.75, 1.0` (blue-white) | white core | thick storm bolts, ground forks, cloud flashes |
| Odinforce | `1.0, 0.9, 0.55` (gold-white) | pure white | broad radiant beams, floating runes, vast aura |
| Bifrost | rainbow gradient sweep | prismatic | shifting spectrum column, cosmic shimmer |
| Space Stone | `0.20, 0.45, 1.0` (blue) | cyan | folding/warping distortion, portal rings |
| Mind Stone | `1.0, 0.85, 0.15` (yellow) | amber | radial psionic waves, eye motifs |
| Reality Stone | `0.95, 0.15, 0.20` (red) | crimson | liquid/warping matter, wrongness ripples |
| Power Stone | `0.60, 0.20, 0.95` (purple) | magenta | dense energy, heavy blooms, shockwaves |
| Time Stone | `0.20, 0.90, 0.45` (green) | pale green | clock/ripple rings, slow trails |
| Soul Stone | `1.0, 0.50, 0.15` (orange) | ember | spectral wisps, drifting souls |
| Disintegrate | fine dissolving embers of the killing source's color | — | particles float up + fade, no ragdoll |
| Infinity (combined) | all six, sequenced | white flash | six-color sequential ignition, then unified burst |
| Emperor Doom | green+gold+cosmic | white | levitation aura, cosmic runes, layered |

## Readability rules (§40 avoid noise)
- One dominant color per effect; secondary only as a core/rim highlight.
- Combined effects **sequence** colors in time rather than mixing them into mud.
- Cap simultaneous emitters; ultimates burst-then-clear (§55).
- Keep a bright white core on projectiles for silhouette clarity in busy scenes.
