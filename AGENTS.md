# Agents

This plugin owns **display lighting policy** for Navico/B&G and Raymarine glass: source → skipper brightness 0–1 and day/night → per-device native values. It does **not** emit NMEA 2000.

## Read first

1. [README.md](README.md) — scope card (job, in, out)
2. [docs/architecture.md](docs/architecture.md) — pipeline and path split
3. [docs/showcase.md](docs/showcase.md) — instrument lighting showcase (F0–F14)
4. [docs/adr/](docs/adr/) — locked decisions
5. [docs/features.md](docs/features.md) — ordered slices; implement the next pending row only
6. [docs/known-gaps.md](docs/known-gaps.md) — do not invent a DisplayProvider or HEX fields
7. [skills/lighting/SKILL.md](skills/lighting/SKILL.md) — when the work is lighting, maps, or the control webapp
8. Then `src/` — never import `signalk-server` `src/`

## Overlap

| Repo | Role |
| --- | --- |
| This plugin | Policy, maps, PUT, webapp. Writes Signal K only. |
| [signalk-to-nmea2000](https://github.com/htool/signalk-to-nmea2000) | SK → N2K encode (canboatjs). Tests: expected vs produced n2k JSON. |
| [signalk-bandg-displaydaynight](https://github.com/htool/signalk-bandg-displaydaynight) | Compat stub. Must not emit PGN 130845. |
| [signalk-instrument-display-plugin](https://github.com/htool/signalk-instrument-display-plugin) | Consumer of glass brightness. Widescreen layouts stay there. |

If a slice cannot be done from these files, fix the docs. Do not grow the prompt.
