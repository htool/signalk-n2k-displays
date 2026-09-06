# Migrating off `environment.displayMode`

For one major this plugin **mirrors** glass intent onto the old blob and accepts the old PUT. Then the blob goes away.

## Read

| Old | New |
| --- | --- |
| `environment.displayMode.mode` | `electrical.displays.mode` (`day` \| `night`) |
| `environment.displayMode.backlight` (1–10) | `electrical.displays.brightness` (0–1, step 0.1) |

Mirror value: `{ mode, backlight: round(brightness × 10) }`. Brightness 0 (Off) is backlight 0. Vessel day/night stays `environment.mode` (spec).

## PUT

Old Node-RED / `signalk-send-put` path `environment.displayMode.control`:

```json
{ "mode": "night", "backlight": 3 }
```

maps to brightness `0.3` and mode `night`. Optional `group` is ignored (intent is vessel-wide). Prefer PUT on `electrical.displays.brightness` and `electrical.displays.mode`.

## After this major

Disable the mirror. `signalk-bandg-displaydaynight` is a stub that only forwards the old PUT onto intent and does not emit PGN 130845. Widescreen layouts in `signalk-instrument-display-plugin` read intent brightness, with a fallback to `.backlight` until this blob is unused.
