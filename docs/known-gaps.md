# Known gaps

## Not this plugin

- No `DisplayProvider` in the server. File a core gap if that is needed later; do not invent one here.
- Plugin HTTP routes are admin-only. Live webapp control PUTs v1 paths (`electrical.displays.*`). Mapping GET/PUT `/plugins/signalk-n2k-displays/mapping` writes the same plugin options as the admin Time/Sun/Lux fields. Extra auth UX for phone PUT is unresolved.
- Garmin lighting write protocol is missing. Do not HEX-guess.
- House theme packs (Freeboard/KIP) are not this job.

## Map persistence

Locked in [ADR 0005](adr/0005-map-persistence.md): `pluginDataDir/maps.json`. `auto` applies and does not write. `auto-learning` stores native and palette cells on device PUT. Palettes live under the `palettes` key in the same file. Enabling a brand starts at identity + family palettes; identity cells are not written.

## Encode

F1–F2 plus Raymarine brightness live in signalk-to-nmea2000. This plugin does not emit `nmea2000JsonOut` or `nmea2000out` for display lighting ([ADR 0004](adr/0004-converter-owns-n2k-encode.md)). Enable the Navico and Raymarine display conversions on the converter.

## Scott / in-tree

Showcase lives on `htool/signalk-n2k-displays` branch `showcase/instrument-lighting`. Upstream merge is a Discussion: policy + webapp in-tree vs a companion that `requires` this plugin and does not emit N2K.

## Brightness is not SI-equal on glass

A Zeus at intent 0.4 is not a Triton at 0.4. Maps exist because of that. Do not claim candela.

## HEX

If a display field is still unknown, stop and write it here. Do not invent canboat enums. 130845 / 126720 lighting fields in this showcase are known.
