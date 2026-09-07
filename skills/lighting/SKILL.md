# Lighting skill

Brand-agnostic rules for Signal K instrument lighting. Load after `AGENTS.md` and the path ADR.

## Contract

- Vessel day/night: `environment.mode` (spec).
- Glass intent: `electrical.displays.brightness` (0–1, step 0.1), `.mode` (`day`|`night`), `.control` (`off`|`auto`|`auto-learning`). Skipper labels: Manual / Auto / Learning.
- Actuation: `electrical.displays.<vendor>.<group>.*` as n2k-signalk already publishes.
- Do not put glass brightness on `environment.displayMode` except the documented one-major compat mirror ([displayMode-compat.md](../../docs/displayMode-compat.md)).

## Pipeline

Source (time / sun / lux) → intent → native per device → SK vendor paths → **signalk-to-nmea2000** → N2K.

Time is `environment.mode`, sun is `environment.sun`, lux is a configured path. Cascade lux → sun → time when a reading is missing or stale ([ADR 0006](../../docs/adr/0006-source-cascade-lux-sun-mode.md)). Default curves are in [architecture.md](../../docs/architecture.md). Skippers edit Time / Sun / Lux in the webapp or plugin admin; both are plugin config ([ADR 0007](../../docs/adr/0007-mapping-table-webapp.md)). Apply only on source-bin change so a live override survives repeated derived-data ticks. Power-on resync re-applies last intent when a configured device path appears after silence.

Only `auto-learning` (Learning) stores maps. After a day of corrections, Auto locks the curves (webapp read-only, still follows lux/sun/time). Identity apply (missing cell) is quantized intent on the vendor 0–1 path. Enabling a brand starts at that mapping, not 0. Persistence is `pluginDataDir/maps.json` ([ADR 0005](../../docs/adr/0005-map-persistence.md)). Palettes are `mode` → native color, per family, not vessel intent. Palette changes never write brightness. Hide palette where the driver declares none (Navico day, Garmin).

## Encode

Plugins write Signal K. Converters encode. HEX only when the PGN is not understood. simpleCan only to claim another N2K address — not for ordinary group lighting.

## Webapp (if present)

Live control PUTs v1 paths. Mapping GET/PUT `/plugins/signalk-n2k-displays/mapping` (admin) writes plugin options. Phone-first, 48px targets; mapping only at `min-width: 900px`. Chrome follows the phone light/dark setting (`prefers-color-scheme`). Glass is Day / Night / Off. Brightness is a 0–100% slider in 10% steps (same % size on Glass and Instruments); PUT remains 0–1. Control: Manual (live, ignore sources), Auto (follow and lock), Learning (edit and store the live Sun/Lux row). Navico and Raymarine native both show 0–100%. Time / Sun / Lux (mode + brightness, live reading in each heading) plus brand Day and Night tables (Night below Day; night palettes next to each brand’s brightness, with select for all); lux always shown (add/remove). Hide palette where the driver declares none. Bookmark `/signalk-n2k-displays/` when glass is unreadable. Plugin schema links to that path.

## Tests

Policy: Signal K path values. Encode: expected vs produced n2k JSON in the converter. Do not require a live bus for CI.

## Do not

- Import server `src/`.
- Dual-send the same PGN from two plugins.
- Treat Raymarine 0/2/3/4 as dim levels (they are palettes).
- Share one palette enum across Navico and Raymarine.
