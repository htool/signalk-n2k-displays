# signalk-n2k-displays

Signal K plugin that controls and syncs NMEA 2000 display devices from Raymarine and Navico.

You can control brightness, night mode, and colors via Signal K.

The plugin can also sync between the device manufacturers. So if you change brightness directly on a Raymarine device, the plugin will change it for Navico devices.

Requires signalk-server 2.3.0 or newer.

## Control webapp

Phone-first lighting control. Bookmark `/signalk-n2k-displays/` when glass is unreadable. PUT goes to v1 paths (`electrical.displays.*`), not plugin REST. Chrome follows `environment.mode`.

![Display lighting webapp on a phone, night chrome, Auto and Night selected, intent 40%, Navico 4/10 red palette and Raymarine 40% Red/Black](docs/webapp.png)

## Scope

**Job:** Own display lighting *policy*: light steering source → intent 0–1 → per-device native brightness and palette. Write those as Signal K paths. Provide a phone-first control webapp (`off` | `auto` | `auto-learning`).

**In:** Time / sun / lux steering, intent paths, maps, group sync, power-on resync, PUT on v1 paths, embeddable webapp.

**Out:** NMEA 2000 encode (that is [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) + canboatjs). Widescreen instrument layouts ([signalk-instrument-display-plugin](https://github.com/htool/signalk-instrument-display-plugin)). HEX PGN strings. simpleCan / second bus address. Garmin keypad until a lighting write protocol exists. Server `DisplayProvider`.

**Related:** [signalk-bandg-displaydaynight](https://github.com/htool/signalk-bandg-displaydaynight) becomes a stub that maps the old 1–10 blob onto intent paths and must not emit 130845.

Agents: start at [AGENTS.md](AGENTS.md). Features and ADRs are under [docs/](docs/).
