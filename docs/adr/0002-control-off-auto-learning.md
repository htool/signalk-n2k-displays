# ADR 0002 — Control is off | auto | auto-learning

## Decision

`electrical.displays.control` is a tri-state. Skipper labels are **Manual**, **Auto**, **Learning**.

| Value | Label | Pipeline | Overrides |
| --- | --- | --- | --- |
| `off` | Manual | Do not steer from time/sun/lux | Glass, native brightness, and palette are live device PUTs. Nothing stored. |
| `auto` | Auto | Source → intent → native → vendor paths | Follow the recorded curves. No skipper edits (webapp locked). Switch here after a day of Learning. |
| `auto-learning` | Learning | Same apply as auto | Glass Day/Night/brightness writes the **active** Sun and Lux config rows (and Time is still a source table). Other Sun/Lux rows can be edited. Per-instrument native still stores that device at current intent. Palette stores that device’s cell for current mode. |

Only `auto-learning` writes maps and source-curve cells. Identity-quantize maps are enough to ship auto; the first learned point is the first stored cell.

## Why

Skippers correct brightness through a day of sun and lux bins, then lock. Auto is that lock. Manual is “I am driving the glass now.” The old bandg checkbox “update only when source changes” plus a boolean on/off was two ideas.

## Consequences

- No separate “learning phase” timer in the product; 24h is skipper practice, then Auto.
- Knob on one brand does not rewrite other brands or vessel intent.
- Hardware gamma stays given. Source bins (lux range, sun, `environment.mode`) are plugin config, edited in the webapp while Learning ([ADR 0007](0007-mapping-table-webapp.md)). Native cells stay in `maps.json`.
- Which source is live is not a skipper picker: [ADR 0006](0006-source-cascade-lux-sun-mode.md) cascade lux → sun → time.
- Glass Off (brightness 0) is not a control value.
