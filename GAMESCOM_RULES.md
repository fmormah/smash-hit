# GamesCom Rules

GamesCom mode is the curated exhibition configuration for the GamesCom Canyon level. It is enabled by default and forces a focused ruleset over the normal dev settings while it is active.

## Title Modes

- `Play` starts GamesCom mode in a finite five-level Google-colour run: Blue, Green, Yellow, Red, and Rainbow.
- `Test Flight` starts GamesCom mode in the current greyscale canyon sandbox and keeps infinite levels enabled.
- The title screen keeps `HOW TO PLAY`; the previous `INSERT COIN` start button has been removed.
- Starting either mode respawns the streamed world immediately, so the chosen palette and rules are visible from the first playable canyon segment.

## Level

- `Test Flight` forces the `GAMESCOM CANYON` chapter for streamed segments.
- `Play` changes the canyon chapter per level to the Google Blue, Green, Yellow, Red, and Rainbow palettes.
- Uses a high-contrast grayscale canyon palette and reflection environment, with a darker central sky and brighter side-horizon wash to emphasize the vanishing point.
- `Test Flight` suppresses normal chapter gates and pre-gate void transitions.
- `Play` restores crystal gates and pre-gate void transitions between the five Google-colour levels.
- Builds a plain reflective glass floor with canyon walls on both sides.
- Wall gap, wall height, and left/right cliff wall slopes are controlled in the F9 `GamesCom Rules` section.
- Current GamesCom canyon defaults are wall gap `22m`, wall height `12m`, mirrored slopes enabled, and mirrored slope `43°`.
- Cliff wall slope sliders can be set from `0°` to `90°`; the mesh generation clamps the extreme end internally to keep the wall geometry finite.
- Cliff wall curve sliders can be mirrored or asymmetric. Negative values carve the face back into the cliff; positive values bulge the face inward toward the canyon.
- `Flatten cliff curve at top` makes curved cliff faces peak through the mid-wall, ease back before the rim, and stay flat through the upper wall band. This gives an elongated S-like side profile instead of carrying the curve through the whole wall height.
- `Canyon side draw distance` lengthens the GamesCom canyon floor/walls/grid along the track. The default is `1.5×`.
- The minimum canyon wall gap is `6m`.
- Canyon wall height can be reduced as low as `3m`.
- The reflective floor uses a broad grayscale wash. It has no guide, grid, or streak lines unless the GamesCom grid toggle is enabled.
- `Player floor reflection` controls the opacity of a planar floor reflector that mirrors the active scene, including the player, over the GamesCom glass floor. The default is `10%`.
- `Show subtle canyon grid` adds low-opacity grid lines to the gap floor and inner canyon walls.
- `Grid opacity` controls the GamesCom grid line strength. The default is `20%`.
- Grid changes apply to newly streamed or restarted canyon segments.
- In `Play`, each level tightens the canyon wall gap, increases the cliff slope, increases obstacle density, and slightly raises base speed, acceleration, and boost strength.
- The `Play wall-gap difficulty`, `Play slope difficulty`, `Play obstacle difficulty`, `Play base-speed difficulty`, `Play acceleration difficulty`, and `Play boost difficulty` sliders scale those per-level increases from `0.0×` to `10.0×`. The authored default is `1.0×`.
- In `Play`, crystal gates are coloured to represent the upcoming Google-colour zone.
- In `Play`, each zone places exactly one pickup crystal in that zone's representative colour.

## Track And Camera

- Left/right track turning remains controlled by the normal `Turn sharpness (L/R)` setting.
- Up/down track slope is forced off with `elevMax = 0`.
- The normal `Slope sharpness (up/down)` row is disabled while GamesCom mode is active.
- Camera roll is suppressed with `keepLevel = true`, `bank = 0`, and `manualRoll = 0`.
- Manual/world barrel-roll triggers are disabled while GamesCom mode is active.

## Player Scale And Bounds

- Hero container scale is controlled by the GamesCom `Hero container scale` slider.
- The GamesCom default hero container scale is `1.6`.
- Booster Y offset is controlled by the GamesCom `Booster offset Y` slider.
- The GamesCom default booster Y offset is `-1.26`.
- GamesCom lateral bounds are derived from the canyon wall gap, so bringing the walls closer also narrows player reach.
- GamesCom also owns the lateral/top/bottom reach offsets in the `GamesCom Rules` section.
- Current GamesCom reach offsets are lateral `-1.05`, top `+15`, and bottom `+5.7`.
- The generic world-scale mechanic is not overridden by GamesCom mode.

## Boosts, Shields, And Trails

- Shield/boost armour is forced off.
- Shield always-on is forced off.
- Shield trail type is overridden, and shield comet/ribbon trail visibility is suppressed.
- Crystal rings do not apply speed boosts, long crystal boosts, or boost-streak increments in GamesCom mode.
- Normal non-crystal ring boosts still work.

## Rings

- GamesCom rings render as grayscale sphere/orb pickups rather than hoops.
- Orb size is controlled by `Ring orb size` in the `GamesCom Rules` section.
- Default ring orb size is `250%` of the hero scale baseline.
- Normal-mode crystal rings keep their existing ring/gem/electron presentation; the orb conversion is GamesCom-only.
- GamesCom orbs use stronger emissive/additive glow so they read clearly in the canyon.

## Scatter Missiles

- Missile cone range defaults to `200`.
- Nearby threats can be acquired outside the main cone so close obstacles are not ignored.
- Missile scatter time is shorter and close targets can be homed during the scatter phase.

## Shatter Effects

- Obstacle break/removal and scoring still happen.
- Shard bursts, shatter audio, missile impact bursts, crash shatter bursts, and shield-loss shatter bursts are suppressed while GamesCom mode is active.

## Visual Tuning

- Bloom is overridden by `GamesCom bloom override`.
- Current GamesCom bloom default is `0.08`.
- Generic controls that are overridden by GamesCom mode are disabled while the mode is active.
- The settings JSON export includes top-level `dev`, `gamescom`, and `colors` objects so all dev-panel controls, including palette swatches, can round-trip.

## Obstacle Filtering

- The normal F9 `Obstacles` section lists every pattern generator that can appear in the track.
- Each pattern can be toggled independently.
- `Check all` and `Uncheck all` apply to the full pattern list.
- Missing entries default to enabled.
