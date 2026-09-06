# Features

Ordered slices for the instrument-lighting showcase. Implement the next `pending` row only. One feature, one commit. Link the ADR; do not re-argue it.

Done-when includes tests where the row says so.

| ID | Repo | Outcome | Decisions | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| F0 | n2k-displays | Agent context exists | All ADRs | `AGENTS.md` + this file + ADRs on the showcase branch | done (this commit) |
| F1 | signalk-to-nmea2000 | Navico PGN 130845 from SK: backlight, night mode, night color | [0004](adr/0004-converter-owns-n2k-encode.md), [0001](adr/0001-intent-and-actuation-paths.md), [0003](adr/0003-palettes-are-device-native.md) | Conversion + n2k JSON tests (percent, Value 4 → night, color 0–4) | done |
| F2 | signalk-to-nmea2000 | Raymarine Display Color from `electrical.displays.raymarine.<group>.color` | [0003](adr/0003-palettes-are-device-native.md), [0004](adr/0004-converter-owns-n2k-encode.md) | Conversion + n2k JSON tests. Brightness already exists — do not regress it. | done |
| F3 | n2k-displays | Intent paths `electrical.displays.{brightness,mode,control}` published and PUT | [0001](adr/0001-intent-and-actuation-paths.md), [0002](adr/0002-control-off-auto-learning.md) | PUT handlers; meta; no new N2K emit | done |
| F4 | n2k-displays | Stop emitting display PGNs once F1+F2 land; write vendor SK paths only | [0004](adr/0004-converter-owns-n2k-encode.md) | No `nmea2000JsonOut` for 130845/126720 display keys. Group sync still copies SK values. | pending |
| F5 | n2k-displays | Identity brightness maps; apply in `auto` / `auto-learning` | [0001](adr/0001-intent-and-actuation-paths.md), [0002](adr/0002-control-off-auto-learning.md) | Source bin → intent 0–1 → vendor brightness. Persistence: pick from [known-gaps](known-gaps.md) in that commit’s ADR. | pending |
| F6 | n2k-displays | Palette map mode → native color | [0003](adr/0003-palettes-are-device-native.md) | Navico night color; Raymarine day/night colors. Hidden when not declared. | pending |
| F7 | n2k-displays | Time / sun / lux policy | [0002](adr/0002-control-off-auto-learning.md) | Same sources as bandg (mode, sun, lux). Lux curve given. | pending |
| F8 | n2k-displays | Power-on resync | bandg behaviour | Re-apply last intent when a configured device path appears | pending |
| F9 | n2k-displays | Control webapp in `public/` | [0001](adr/0001-intent-and-actuation-paths.md), [0002](adr/0002-control-off-auto-learning.md), [0003](adr/0003-palettes-are-device-native.md) | off/auto/auto-learning, day/night, intent 0.1, native + palette. PUT v1 paths. Phone-first 48px. Chrome follows `environment.mode`. | pending |
| F10 | n2k-displays | Deprecated `environment.displayMode` mirror + PUT for one major | [0001](adr/0001-intent-and-actuation-paths.md) | `{ mode, backlight: round(brightness*10) }`. Document migration. | pending |
| F11 | bandg-displaydaynight | Stub: map blob PUT onto intent paths; no HEX 130845 | [0004](adr/0004-converter-owns-n2k-encode.md) | Plugin does not emit N2K. README says survivor is n2k-displays. | pending |
| F12 | instrument-display-plugin | CSS filter from `electrical.displays.brightness` (0–1) | [0001](adr/0001-intent-and-actuation-paths.md) | Keep `environment.mode` for night chrome. Blob `.backlight` fallback until F10 is unused. | pending |

Out of scope for every row: Garmin keypad lighting, DisplayProvider, widescreen layouts, Naviop, simpleCan, new HEX PGN strings.
