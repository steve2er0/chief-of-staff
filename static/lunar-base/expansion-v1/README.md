# Lunar Base expansion 01

Five future assets in the existing ivory/slate, amber/cyan pixel-art style.
This directory is independent of the MVP, demos, live scene and backend.

| Sprite | Logical canvas | Ground anchor |
| --- | --- | --- |
| Rover garage | 356 × 218 | 178, 210 |
| Greenhouse | 316 × 165 | 158, 157 |
| Communications dish | 166 × 191 | 83, 183 |
| Empty launch pad | 346 × 173 | 173, 165 |
| Rover | 151 × 101 | 76, 93 |

`sprites/` contains transparent logical-size PNGs. `sprites-3x/` contains
matching display sprites for the current high-density asset approach. Each
sprite has eight logical pixels of padding. Anchors use the bottom-centre
ground baseline, rather than the centre of the visible object. See
`manifest.json` for dimensions, anchors, source bounds and hashes.

Open `index.html` to review the contact sheet, common-scale placement and
eight-second motion preview. The existing habitat and two crew are references
for scale. The garage and launch pad contain no baked vehicle or astronaut.
The rover has eight registered rolling states; the greenhouse and dish have
restrained cyan display activity. These are illustrative asset previews.
Pause and reduced motion show the static placement, with no app connection.

`source/prompts.json` contains the exact built-in imagegen prompts.
`source/prepare_assets.py` prepares crops, alpha, scale and wheel/emission
layers. `source/render_previews.py` reproduces the PNG/GIF compositions.
Preparation/rendering needs Python 3.9+ and Pillow; viewing exported files does
not. From this directory, run:

```sh
python3 source/prepare_assets.py
python3 source/render_previews.py
python3 source/validate_pack.py
```

This repository includes the unchanged generated masters in `source/masters/`
and the terrain/habitat reference copies in `references/`, so complete
compositions can be rebuilt from the checkout. The compact download omits
those larger originals and references; it retains editable 3× PNGs, separated
mechanical layers, exact prompts, manifest, scripts and rendered previews.
Restore the omitted files from this repository before rebuilding complete
compositions. Without masters, preparation can reuse the 3× exports. The
approved Library board identity is retained in the provenance JSON; its image
is unchanged in the original project.
