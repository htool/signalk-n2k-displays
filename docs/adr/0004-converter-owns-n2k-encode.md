# ADR 0004 — Converter owns N2K encode

## Decision

Plugins write Signal K. [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) plus canboatjs emit NMEA 2000.

This plugin must not emit `nmea2000out` or `nmea2000JsonOut` for display lighting once the converter has the conversions. It does not use simpleCan (no second bus address, no device impersonation).

Encode ladder (org-wide, not only this plugin):

1. **Preferred** — SK paths → signalk-to-nmea2000 → canboatjs JSON PGN.
2. **HEX from a plugin** — only when the PGN layout is not understood. Do not invent canboat fields. Prefer a canboat PR when the layout is known.
3. **simpleCan** — only when the plugin must claim another N2K address. Not this plugin.

Display PGNs 130845 and 126720 **are** understood. HEX is not the stuck case here. bandg-displaydaynight’s HEX strings retire with the stub.

Today signalk-to-nmea2000 already converts `electrical.displays.raymarine.<group>.brightness` to PGN 126720. Missing: Navico 130845 (backlight, night mode, night color) and Raymarine Display Color. Those conversions are features in the converter repo. Tests compare expected vs produced n2k JSON (existing harness: input 0.85 → Brightness 85).

Until those conversions exist, do not add new HEX in this plugin. Prefer JSON PGN via the converter; keep current `nmea2000JsonOut` only as a temporary window documented in [features.md](../features.md), then delete it.

## Why

Two plugins emitting 130845 is the overlap smell. v1 is the data model; encode is one place.

## Consequences

- Policy tests in this repo assert Signal K paths.
- Encode tests live in signalk-to-nmea2000.
- Enabling converter display mappings and this plugin’s old JSON out on the same groups would double-send — the JSON out must go when converter coverage lands.
