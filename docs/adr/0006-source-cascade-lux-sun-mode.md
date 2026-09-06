# ADR 0006 — Source cascade is lux → sun → time

## Decision

When control is `auto` or `auto-learning`, steering picks the first *fresh* reading in this order:

1. Lux — configured path, default `environment.outside.lux`
2. Sun — `environment.sun`
3. Time — `environment.mode`

Vessel-wide. Not per group. Not a skipper picker. Default curves are in [architecture.md](../architecture.md); skippers may edit bins in the mapping table ([ADR 0007](0007-mapping-table-webapp.md)).

Fresh means a value has been seen and is not older than 15 minutes (lux) or 5 minutes (sun, mode). Stale lux falls back to sun, then time. When lux reconnects, it takes over on the next lux delta. If none are fresh, keep last intent.

The old `source` config enum is legacy. Do not use it to pin a single source.

## Why

A physical lux sensor drops off the bus (MQTT LightMeter offline after a Signal K restart). Sun and time from derived-data keep working. Pinning one source leaves glass stuck until that path returns.

## Consequences

- Subscribe to all three paths always.
- Bin identity includes which source won, so lux returning after sun dusk is a bin change and applies.
- Tests cover prefer / fallback / reconnect. No live bus.
