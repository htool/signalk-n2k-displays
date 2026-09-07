# ADR 0001 — Intent paths vs actuation paths

## Decision

Skipper intent lives on brand-neutral paths:

- `electrical.displays.brightness` — 0–1, step 0.1
- `electrical.displays.mode` — `day` | `night`
- `electrical.displays.control` — see [ADR 0002](0002-control-off-auto-learning.md)

Hardware state stays on vendor groups that n2k-signalk already uses: `electrical.displays.navico.<group>.*` and `electrical.displays.raymarine.<group>.*`.

`environment.mode` remains vessel day/night (spec). Glass brightness is not that path.

## Native scales (maps and webapp)

Intent is always 0–1. Drivers convert to native:

| Family | Brightness native | Wire (converter) |
| --- | --- | --- |
| Navico / B&G | 10 steps (UI 1–10). Live SK stack treats the PGN value as 0–100 percent. | PGN 130845 key Backlight level. canboat `SIMNET_BACKLIGHT_LEVEL` mixes 0=10% … 99=100% with 1=Day and 4=Night. |
| Raymarine | Percent 0–100 (path 0–1). Not 0–4 dim modes. | PGN 126720 Seatalk1 Display Brightness, field unit %. |
| Garmin (later) | 0–20 = 0–100% in 5% steps | No write protocol in this plugin yet. |

Navico night mode on the wire: 1 = Day, 4 = Night. (2 also switches Zeus to day; keep 1 — that is Day Mode in the historic Parameter Handle table.)

## Why

`environment.displayMode` mixed source, intent, and actuation into one blob. Two plugins already disagreed on the contract. Intent belongs next to the hardware tree, not next to spec `environment.mode`.

## Consequences

- Webapp and Node-RED PUT v1 paths, not `/plugins/<id>`.
- Compat blob PUT is deprecated for one major: [displayMode-compat.md](../displayMode-compat.md).
- instrument-display-plugin reads `electrical.displays.brightness` for CSS filter; keeps `environment.mode` for chrome.
