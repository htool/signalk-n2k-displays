# Instrument lighting showcase

Branch `showcase/instrument-lighting` across four repos. This plugin owns **policy**. Encode is [signalk-to-nmea2000](https://github.com/htool/signalk-to-nmea2000). The old B&G plugin is a PUT stub. Widescreen layouts stay in [signalk-instrument-display-plugin](https://github.com/htool/signalk-instrument-display-plugin).

Boatnet (the live Signal K on the boat) is the demo: enable this plugin, enable the Navico and Raymarine conversions on signalk-to-nmea2000, bookmark `/signalk-n2k-displays/`.

Narrative for core and plugin authors: [blog-signalk-ai-lighting.md](blog-signalk-ai-lighting.md) — how the Signal K AI approach ran on this showcase.

## Job

Source → skipper brightness 0–1 and day/night → per-device native brightness and palette → vendor Signal K paths → converter → NMEA 2000.

```
source (lux / sun / time / webapp)
  → electrical.displays.{brightness,mode,control}
  → electrical.displays.navico.<group>.*
     electrical.displays.raymarine.<group>.*
  → signalk-to-nmea2000 + canboatjs
  → PGN 130845 / 126720
```

This plugin stops at vendor Signal K. It does not emit N2K.

## Path split

| Stage | Path | Notes |
| --- | --- | --- |
| Vessel day/night | `environment.mode` | Spec. Chrome (Freeboard, KIP, instrument layouts). |
| Sun | `environment.sun` | derived-data bins. |
| Lux | configured (default `environment.outside.lux`) | Physical. |
| Glass brightness | `electrical.displays.brightness` | 0–1, step 0.1. |
| Glass day/night | `electrical.displays.mode` | `day` \| `night`. Not `off` — Off is brightness 0. |
| Control | `electrical.displays.control` | `off` \| `auto` \| `auto-learning`. |
| Navico | `electrical.displays.navico.<group>.*` | brightness 0–1, nightMode.state, nightModeColor. |
| Raymarine | `electrical.displays.raymarine.<group>.*` | brightness 0–1, nightMode.state, color. |
| Deprecated blob | `environment.displayMode` | One-major mirror. [displayMode-compat.md](displayMode-compat.md). |

Reserved leaves under `electrical.displays`: `brightness`, `mode`, `control`.

## Control and maps

Control is Manual / Auto / Learning (wire `off` / `auto` / `auto-learning`). Details: [ADR 0002](adr/0002-control-off-auto-learning.md).

| Label | Wire | Sources | Glass | Mapping | Records Sun/Lux from glass | Learns `maps.json` |
| --- | --- | --- | --- | --- | --- | --- |
| Manual | `off` | Ignored | Actuates native immediately | Editable | No | No |
| Auto | `auto` | lux → sun → time | Locked | Locked | No | No |
| Learning | `auto-learning` | Same as Auto | Editable | Editable | Yes | Yes |

Glass Off is brightness 0. Power-on resync still applies last glass brightness and mode in Manual.

Source cascade ([ADR 0006](adr/0006-source-cascade-lux-sun-mode.md)): fresh lux (15 min) → sun (5 min) → `environment.mode` (5 min). Apply only on source-bin change so a live override survives derived-data ticks.

Palettes are **mode → native color**, not per brightness step ([ADR 0003](adr/0003-palettes-are-device-native.md)). Navico night only (red/green/blue/white, default red). Raymarine day (day1/day2) and night (red/black, inverse). Raymarine 0/2/3/4 are palettes, not dim levels.

Maps persist in `pluginDataDir/maps.json` ([ADR 0005](adr/0005-map-persistence.md)). Identity native is not written.

Webapp: standalone `signalk-webapp`, PUT `/signalk/v1/api/vessels/self/...`. Phone-first. Chrome follows `prefers-color-scheme`. Mapping tables at `min-width: 900px`. Control: Manual / Auto / Learning. Glass: Day, Night, Off. Brightness sliders 0–100% in 10% steps.

## Features (F0–F14)

Ordered slices; all rows below are done. Details in [features.md](features.md).

| ID | Repo | What landed |
| --- | --- | --- |
| F0 | n2k-displays | Agent context, ADRs, feature list. |
| F1 | signalk-to-nmea2000 | Navico PGN 130845 from vendor SK (backlight %, night 4/day 1, night color 0–3). |
| F2 | signalk-to-nmea2000 | Raymarine Display Color from `electrical.displays.raymarine.<group>.color`. Brightness conversion already existed. |
| F3 | n2k-displays | Glass paths `electrical.displays.{brightness,mode,control}` published and PUT. |
| F4 | n2k-displays | Stop emitting display PGNs; vendor SK only. |
| F5 | n2k-displays | Identity brightness maps in `auto` / `auto-learning`. |
| F6 | n2k-displays | Palette map mode → native color. |
| F7 | n2k-displays | Time / sun / lux policy (bandg curves). |
| F8 | n2k-displays | Power-on resync when a configured device path appears. |
| F9 | n2k-displays | Phone-first control webapp. |
| F10 | n2k-displays | Deprecated `environment.displayMode` mirror + PUT. Migration: [displayMode-compat.md](displayMode-compat.md). |
| F11 | bandg-displaydaynight | Stub: old blob PUT → glass brightness and mode. **No HEX 130845.** |
| F12 | instrument-display-plugin | CSS `filter: brightness(0–1)` from `electrical.displays.brightness`. Night chrome still `environment.mode`. Blob `.backlight / 10` until F10 unused. |
| F13 | n2k-displays | Source cascade lux → sun → time (pulled ahead of F10 on the boat). |
| F14 | n2k-displays | Mapping table: Time / Sun / Lux plus brand Day and Night (palettes on Night). |

## Migration (F10)

Old Node-RED `signalk-send-put` on `environment.displayMode.control` `{ mode, backlight: 0–10 }` still works. Prefer `electrical.displays.brightness` and `.mode`. After this major, drop the mirror.

## Compat stub (F11)

[signalk-bandg-displaydaynight](https://github.com/htool/signalk-bandg-displaydaynight) keeps plugin id `signalk-bandg-displaydayNight` so existing installs load. It forwards the old PUT onto `electrical.displays` brightness and mode and does not emit N2K. Disable it once nothing PUTs the blob. Policy, maps, and the webapp are here.

## Widescreen consumer (F12)

[signalk-instrument-display-plugin](https://github.com/htool/signalk-instrument-display-plugin) keeps B&G-style layouts. It dims `#display` from `electrical.displays.brightness` and does not implement lighting policy.

## Encode

[signalk-to-nmea2000 `docs/display-encode.md`](https://github.com/htool/signalk-to-nmea2000/blob/showcase/instrument-lighting/docs/display-encode.md). Enable the Navico and Raymarine display conversions. Tests compare expected vs produced n2k JSON. Which night palette to send is decided here, not in the converter.

## Out of scope

Garmin keypad lighting (no write protocol). Server `DisplayProvider`. Widescreen layouts in this plugin. Naviop. simpleCan / second bus address. New HEX PGN strings. House theme packs (Freeboard/KIP). Claiming candela equality across glass.

Upstream merge (policy + webapp in-tree vs a companion) is a Discussion, not this branch.

## Locked decisions

[docs/adr/](adr/) — 0001 paths, 0002 control, 0003 palettes, 0004 converter encode, 0005 maps.json, 0006 cascade, 0007 mapping webapp.
