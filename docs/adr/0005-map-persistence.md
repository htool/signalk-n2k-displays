# ADR 0005 — Brightness maps persist as data-dir JSON

## Decision

Learned brightness maps live in `maps.json` under `app.getDataDirPath()` (Signal K plugin data dir). Not plugin config. Not Signal K paths.

Identity maps need no file: missing cells mean `native = quantize(brightness)` on the vendor 0–1 path (step 0.1). Enabling a brand/group applies that identity (plus family palette defaults) as the start mapping. Auto never writes the file. Learning writes cells when native or palette PUT changes a device.

Shape:

```json
{
  "brightness": {
    "navico.group1": {
      "day": { "0.5": 0.4 },
      "night": { "0.3": 0.2 }
    }
  },
  "palettes": {
    "navico.group1": { "night": "green" },
    "raymarine.helm1": { "day": "day2", "night": "inverse" }
  }
}
```

Keys are device ids `vendor.group`. Brightness steps are strings of the 0.1 grid. Brightness maps stay keyed by display `day`/`night`. Source bins (`environment.mode`, `environment.sun`, log-lux) drive glass brightness and mode; they are not native-map keys. Palettes are mode → native color and are omitted where the driver declares none.

## Why

Option A fights the admin form for sparse tables. Option C is not spec and collides with vendor wildcards. Option B is inspectable, fixture-friendly, and off the tree.

## Consequences

- Tests use a temp dir, not a running persist plugin.
- Backup is copy `maps.json`.
- Palettes use the same file under a `palettes` key.
