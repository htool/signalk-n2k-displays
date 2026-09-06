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

Do **not** grow `environment.displayMode`. That blob is not in the spec and collides with `environment.mode`. This plugin publishes a one-major **deprecated** mirror `{ mode, backlight: round(brightness×10) }` and accepts PUT on `environment.displayMode.control`. See [displayMode-compat.md](displayMode-compat.md). Then drop it.

## Maps

- Brightness: intent 0–1 → vendor SK brightness 0–1. Identity is quantize 0.1 (copy). Learned cells live in `maps.json` ([ADR 0005](adr/0005-map-persistence.md)). Native brightness is shown 0–100% for both Navico and Raymarine. Brightness maps stay keyed by display `day`/`night`; the source bin drives intent, not the native table.
- When a vendor group is enabled (brand added), start that group at the mapped native for current intent (identity if no cell) and the family palette defaults. Do not publish 0. Do not write identity cells.
- Source (when control is `auto` / `auto-learning`): cascade **lux → sun → time** ([ADR 0006](adr/0006-source-cascade-lux-sun-mode.md)). Lux is the configured path (default `environment.outside.lux`). Sun is `environment.sun`. Time is `environment.mode`. First fresh reading wins. Stale lux (15 min) falls back; stale sun/mode (5 min) fall further. Vessel-wide — intent is not per group. The old single-source config enum is unused.
- Default source → intent is the table below. Skippers edit Time / Sun / Lux in the webapp (large screen) or the plugin admin form; both are plugin config ([ADR 0007](adr/0007-mapping-table-webapp.md)). Native cells stay in `maps.json`. Live override until the next source bin (brightness) or mode change (palette).

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

Hardware gamma is given. Source bins are plugin config (Time / Sun / Lux). Native cells are brand Day and Night tables in the webapp (Night below Day; night palettes next to each brand). Identity native is still not written.

## Power-on resync

A chartplotter that last ran at night can boot dark. Configure `resync` triggers (path, optional `N2K.src` source, timeout seconds). When that path appears after silence, re-apply the last intent through maps — including when control is `off`. Do not wait for the next source-bin change. No apply if intent has never been applied.

## Encode

See [ADR 0004](adr/0004-converter-owns-n2k-encode.md). This plugin does not call `nmea2000out`, `nmea2000JsonOut`, or simpleCan.

## Webapp

Standalone `public/` webapp (bookmark `/signalk-n2k-displays/`). Live control PUTs v1 paths. Phone-first 48px targets. Chrome follows the phone `prefers-color-scheme` setting, not vessel `environment.mode`. Glass is Day, Night, Off (Off is brightness 0). Brightness is 0–100% in 10% steps; the PUT value stays 0–1. Navico and Raymarine native brightness both show 0–100%. Palette row omitted where undeclared (Navico in day, Garmin). Mapping at `min-width: 900px` is Time, Sun, and Lux (mode + brightness; live reading in each heading) plus brand Day and Night tables (Night below Day; night palettes next to each brand’s brightness, with select for all). Source tables share plugin config with the admin form. Plugin admin links here.
