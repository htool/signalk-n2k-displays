# Known gaps

## Not this plugin

- No `DisplayProvider` in the server. File a core gap if that is needed later; do not invent one here.
- Plugin HTTP routes are admin-only. The webapp PUTs v1 paths (`electrical.displays.*`). Extra auth UX for phone PUT is unresolved.
- Garmin lighting write protocol is missing. Do not HEX-guess.
- House theme packs (Freeboard/KIP) are not this job.

## Map persistence (decide in F5)

Do not lock until the map feature starts. Options:

| Option | Where | Tradeoff |
| --- | --- | --- |
| A — plugin config | `app.savePluginOptions` | Survives restart, admin-visible. Sparse per-device tables fight the form. |
| B — data-dir JSON | `pluginDataDir/maps.json` | Easy to inspect, backup, fixture in tests. Not on the SK tree. |
| C — SK paths + persist | `electrical.displays.maps.*` | Queryable. Not spec. Wildcard subscribe risk. |

B is the likely default for tests.

## Encode window

Until signalk-to-nmea2000 has Navico 130845 and Raymarine color, this plugin still emits JSON PGN (`nmea2000JsonOut`). That is a window, not the end state ([ADR 0004](adr/0004-converter-owns-n2k-encode.md)). Do not add HEX.

## Scott / in-tree

Showcase lives on `htool/signalk-n2k-displays` branch `showcase/instrument-lighting`. Upstream merge is a Discussion: policy + webapp in-tree vs a companion that `requires` this plugin and does not emit N2K.

## Brightness is not SI-equal on glass

A Zeus at intent 0.4 is not a Triton at 0.4. Maps exist because of that. Do not claim candela.

## HEX

If a display field is still unknown, stop and write it here. Do not invent canboat enums. 130845 / 126720 lighting fields in this showcase are known.
