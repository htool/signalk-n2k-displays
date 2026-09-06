# Architecture — instrument lighting

Three stages, one direction when control is `auto` or `auto-learning`.

```
source (time / sun / lux / webapp)
  → intent (electrical.displays.brightness 0–1, mode day|night, control)
  → native per vendor group (brightness + palette)
  → Signal K vendor paths
  → signalk-to-nmea2000 + canboatjs
  → NMEA 2000
```

This plugin stops at vendor Signal K paths. Encode is not this plugin’s job.

## Paths

| Stage | Path | Notes |
| --- | --- | --- |
| Vessel day/night | `environment.mode` | Spec. derived-data, Freeboard, KIP chrome. |
| Sun bins | `environment.sun` | derived-data. |
| Lux | configured path | Physical, not skipper-editable. |
| Intent brightness | `electrical.displays.brightness` | 0–1 in 0.1 steps. |
| Intent mode | `electrical.displays.mode` | `day` \| `night`. |
| Control | `electrical.displays.control` | `off` \| `auto` \| `auto-learning`. |
| Navico actuation | `electrical.displays.navico.<group>.*` | `brightness` (0–1), `nightMode.state`, `nightModeColor`. n2k-signalk already writes these from the bus. |
| Raymarine actuation | `electrical.displays.raymarine.<group>.*` | `brightness` (0–1), `nightMode.state`, `color`. |

Reserved leaves under `electrical.displays`: `brightness`, `mode`, `control`. Do not put vendor groups in those names. Avoid subscribe wildcards that mix intent with vendor branches.

Do **not** grow `environment.displayMode`. That blob is not in the spec and collides with `environment.mode`. One-major compat mirror is a listed feature, then drop it.

## Maps

- Brightness: intent 0–1 → vendor SK brightness 0–1. Identity is quantize 0.1 (copy). Learned cells live in `maps.json` ([ADR 0005](adr/0005-map-persistence.md)). Native 1–10 is webapp/display, not the SK path. Brightness maps stay keyed by display `day`/`night`; the source bin drives intent, not the native table.
- Source (when control is `auto` / `auto-learning`): `mode` (`environment.mode`), `sun` (`environment.sun`), or `lux` (configured path, default `environment.outside.lux`). Same sources as bandg. Vessel-wide — intent is not per group.
- Given source → intent (not skipper editors). Live override until the next source bin (brightness) or mode change (palette).

| Source | Bin | Mode | Brightness |
| --- | --- | --- | --- |
| mode | `day` (anything but `night`) | day | 0.6 |
| mode | `night` | night | 0.3 |
| sun | nauticalDawn | night | 0.3 |
| sun | dawn | night | 0.4 |
| sun | sunrise | day | 0.4 |
| sun | day | day | 0.6 |
| sun | sunset | day | 0.4 |
| sun | dusk | night | 0.4 |
| sun | nauticalDusk | night | 0.3 |
| sun | night | night | 0.2 |
| lux | 0–1 | night | 0.2 |
| lux | 1–10 | night | 0.3 |
| lux | 10–100 | night | 0.4 |
| lux | 100–1000 | day | 0.4 |
| lux | 1000–10000 | day | 0.6 |
| lux | ≥10000 | day | 1 |

- Palette: `mode` → native color, only if the driver declares palettes. Not keyed by intent step. Not a vessel path (brands do not share names). Navico night only (default red). Raymarine day/night (defaults Day 1 / Red/Black). Garmin undeclared — hidden. Changing palette never writes brightness.
- Only `auto-learning` stores map points. `auto` applies maps and does not train. `off` is live PUTs, nothing stored.

Hardware gamma and the lux/sun curve are given, not skipper editors.

## Encode

See [ADR 0004](adr/0004-converter-owns-n2k-encode.md). This plugin does not call `nmea2000out`, `nmea2000JsonOut`, or simpleCan.
