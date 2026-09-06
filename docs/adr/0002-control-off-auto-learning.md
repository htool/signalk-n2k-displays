# ADR 0002 — Control is off | auto | auto-learning

## Decision

`electrical.displays.control` is a tri-state:

| Value | Pipeline | Overrides |
| --- | --- | --- |
| `off` | Do not steer from time/sun/lux | Day/Night, native brightness, and palette are live device PUTs. Nothing stored. Power-on resync may still apply the last map. |
| `auto` | Source → intent → native → vendor paths | Live override until the next source-bin change (brightness) or next mode change (palette). Not stored. |
| `auto-learning` | Same apply as auto | Intent ± stores a day/night curve point. Per-instrument native stores that device at current intent. Palette stores that device’s cell for current mode. A physical knob stores brightness for that device only. |

Only `auto-learning` writes maps. Identity-quantize maps are enough to ship auto; the first learned point is the first stored cell.

## Why

The old bandg checkbox “update only when source changes” plus a boolean on/off was two ideas. Skippers need a mode that follows dusk without training, and a mode that remembers a dimmed helm.

## Consequences

- No separate “learning phase” in the product.
- Knob on one brand does not rewrite other brands or vessel intent.
- Hardware gamma stays given. Source bins (lux range, sun, `environment.mode`) are plugin config, edited in the webapp or admin form ([ADR 0007](0007-mapping-table-webapp.md)). Native cells stay in `maps.json`. `auto-learning` still stores from a live knob.
- Which source is live is not a skipper picker: [ADR 0006](0006-source-cascade-lux-sun-mode.md) cascade lux → sun → time.
