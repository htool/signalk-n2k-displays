# ADR 0007 — Mapping tables are Time, Sun, Lux, and brand brightness

## Decision

Skippers edit **source curves** in three tables: Time (`environment.mode`), Sun (`environment.sun`), and Lux (configured path). Each source table is **mode and brightness only**. A fourth table maps **brightness → B&G and Raymarine native brightness** for day and night. The webapp shows them at `min-width: 900px`. The plugin admin form shows Time / Sun / Lux. Both source editors read and write **plugin config** (Signal K plugin options). Learned native cells stay in `maps.json` ([ADR 0005](0005-map-persistence.md)), not config.

Phone layout stays F9 (off/auto/learn, glass Day/Night/Off, instruments). Plugin schema still links to `/signalk-n2k-displays/`.

Live vessel readings sit in each source table heading: time on Time, sun on Sun, lux on Lux. Matching rows are highlighted. Palettes stay on the instrument cards, not on these tables ([ADR 0003](0003-palettes-are-device-native.md)).

### Time

Two rows: **day** and **night**. Brightness (10–100%).

### Sun

One row per `environment.sun` bin (nautical dawn … night): sun bin, day/night, brightness.

### Lux

Always shown, including when the lux path is missing on the vessel (then live lux is blank and a note says the path is missing). Same shape as the old bandg plugin: min, max, day/night, brightness. Add and remove rows. Defaults are the architecture lux curve. Empty max is unbounded.

### Brand brightness

Rows are day 100%→10% then night 100%→10%. B&G and Raymarine start equal to brightness (identity). Native columns write `maps.json` for every enabled group of that family. Missing native cells stay identity and are not written ([ADR 0005](0005-map-persistence.md)). Saving this table does not clear palettes. If PUT omits `native`, existing maps are left as they are.

Live glass still PUTs v1 paths. Tables GET/PUT `/plugins/signalk-n2k-displays/mapping` (admin session), which updates plugin options via `savePluginOptions`. `source.json` is only a fallback when plugin options have no source tables yet.

Cascade order is still lux → sun → time ([ADR 0006](0006-source-cascade-lux-sun-mode.md)).

## Why

One row per brightness cell mixed three sources onto a grid that could not show two sun bins at the same brightness. Brand native is one curve per mode, not per source bin, so it belongs in its own table.

## Consequences

- Tests: plugin-config roundtrip; lux add/remove; identity cells omitted; palettes preserved on native save; webapp hides mapping under 900px; schema has time/sun/lux.
- Overlapping lux ranges are rejected on save.
- B&G and Raymarine native brightness both display 0–100% in 10% steps.
- Raymarine 0/2/3/4 stay palettes, never dim steps.
- Do not put learned maps in plugin config.
