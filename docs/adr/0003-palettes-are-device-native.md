# ADR 0003 — Palettes are device-native, keyed by mode

## Decision

There is no vessel path `electrical.displays.palette`. Brands do not share palette names.

Palette map: **mode → native color**, per device/group, only where the driver declares palettes. Changing palette never writes brightness.

| Family | When | Values | Path / wire |
| --- | --- | --- | --- |
| Navico / B&G | Night only. Hide in day. | red, green, blue, white. Default red. | `electrical.displays.navico.<group>.nightModeColor`. PGN 130845 key Night mode color 0–3. (canboat also lists Magenta=4; Zeus 3S does not offer it.) |
| Raymarine | Always. Day cell and night cell. | Day: Day 1, Day 2. Night: Red/Black, Inverse. Defaults Day 1 / Red/Black. | `electrical.displays.raymarine.<group>.color`. PGN 126720 Display Color: 0=Day1, 2=Day2, 3=Red/Black, 4=Inverse. Night mode **is** this color switch. |
| Garmin | Later | Day full / high contrast; night full / red-black / green-black | No lighting write yet. |

Webapp: show a palette control only if declared. Omit the row otherwise.

## Why

Raymarine 0/2/3/4 are palettes, not dim levels. Navico night color is independent of backlight. A single vessel enum would lie.

## Consequences

- n2k-displays already PUT-handles vendor color paths; keep those as actuation.
- Learning a palette stores one cell for the current `electrical.displays.mode`.
- Converter must emit Raymarine color and Navico night-mode color, not only brightness.
