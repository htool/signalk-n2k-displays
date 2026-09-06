# Lighting skill

Brand-agnostic rules for Signal K instrument lighting. Load after `AGENTS.md` and the path ADR.

## Contract

- Vessel day/night: `environment.mode` (spec).
- Glass intent: `electrical.displays.brightness` (0–1, step 0.1), `.mode` (`day`|`night`), `.control` (`off`|`auto`|`auto-learning`).
- Actuation: `electrical.displays.<vendor>.<group>.*` as n2k-signalk already publishes.
- Do not put glass brightness on `environment.displayMode` except a documented one-major compat mirror.

## Pipeline

Source (time / sun / lux) → intent → native per device → SK vendor paths → **signalk-to-nmea2000** → N2K.

Time is `environment.mode`, sun is `environment.sun`, lux is a configured path. Cascade lux → sun → time when a reading is missing or stale ([ADR 0006](../../docs/adr/0006-source-cascade-lux-sun-mode.md)). Sun and lux curves are given (see [architecture.md](../../docs/architecture.md)). Apply only on source-bin change so a live override survives repeated derived-data ticks. Power-on resync re-applies last intent when a configured device path appears after silence.

Only `auto-learning` stores maps. Identity apply (missing cell) is quantized intent on the vendor 0–1 path. Enabling a brand starts at that mapping, not 0. Persistence is `pluginDataDir/maps.json` ([ADR 0005](../../docs/adr/0005-map-persistence.md)). Palettes are `mode` → native color, per family, not vessel intent. Palette changes never write brightness. Hide palette where the driver declares none (Navico day, Garmin).

## Encode

Plugins write Signal K. Converters encode. HEX only when the PGN is not understood. simpleCan only to claim another N2K address — not for ordinary group lighting.

## Webapp (if present)

PUT v1 paths, not `/plugins/<id>`. Phone-first, 48px targets. Chrome follows the phone light/dark setting (`prefers-color-scheme`). Intent is 0–100% in 10% steps on screen; PUT remains 0–1. Show native scale next to per-instrument values. Hide palette where the driver declares none. Bookmark `/signalk-n2k-displays/` when glass is unreadable.

## Tests

Policy: Signal K path values. Encode: expected vs produced n2k JSON in the converter. Do not require a live bus for CI.

## Do not

- Import server `src/`.
- Dual-send the same PGN from two plugins.
- Treat Raymarine 0/2/3/4 as dim levels (they are palettes).
- Share one palette enum across Navico and Raymarine.
