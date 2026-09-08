# ADR 0002 — Control is off | auto | auto-learning

## Decision

`electrical.displays.control` is a tri-state. Skipper labels are **Manual**, **Auto**, **Learning**.

| Wire | Label | Sources (lux → sun → time) | Glass Day / Night / brightness | Mapping tables | Records Sun / Lux from glass | Learns `maps.json` |
| --- | --- | --- | --- | --- | --- | --- |
| `off` | Manual | Ignored | Actuates native immediately | Editable | No | No |
| `auto` | Auto | Applied | Locked | Locked | No | No |
| `auto-learning` | Learning | Applied (same as Auto) | Editable | Editable | Yes (live Sun and Lux rows) | Yes |

Glass **Off** is brightness 0. It is not a control value and is not added to `electrical.displays.mode`.

Manual mapping-table edits still save plugin config (explicit Time / Sun / Lux / native cells). Glass Day / Night / brightness in Manual does **not** auto-record those curves. Learning is the only mode that stores from glass.

Identity-quantize maps are enough to ship Auto; the first learned point is the first stored cell.

## Why

Skippers correct brightness through a day of sun and lux bins, then lock. Auto is that lock. Manual is “I am driving the glass now.” The old bandg checkbox “update only when source changes” plus a boolean on/off was two ideas.

## Consequences

- No separate “learning phase” timer in the product; 24h is skipper practice, then Auto.
- Knob on one brand does not rewrite other brands or vessel glass brightness / mode.
- Hardware gamma stays given. Source bins (lux range, sun, `environment.mode`) are plugin config, edited in the webapp while Manual or Learning ([ADR 0007](0007-mapping-table-webapp.md)). Native cells stay in `maps.json`.
- Which source is live is not a skipper picker: [ADR 0006](0006-source-cascade-lux-sun-mode.md) cascade lux → sun → time.
- Power-on resync re-applies last glass brightness and mode through maps, including in Manual.
