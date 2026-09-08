# Dev lessons

Process traps, not product law. ADRs, [known-gaps](known-gaps.md), and [architecture](architecture.md) still win. Read the section for the phase you are in.

**Append** only if the trap was non-obvious and reusable — the next agent would otherwise rediscover it. Own small docs commit. No one-machine notes, skipper taste, or session dumps.

---

## When starting work

### Sync the converter fork before adding conversions

**The trap.** This lighting showcase lives on a fork of [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000). Adding a Raymarine brightness conversion on a stale branch duplicates work Scott already shipped (`conversions/raymarineBrightness.js`, `optionKey: RAYMARINE`, needs `groups`).

**What to do instead.** Fast-forward onto upstream **before** new display conversions. Use the in-tree Raymarine brightness file. Do not add a second `raymarineDisplayBrightness.js`.

---

## When encoding

Encode is [signalk-to-nmea2000](https://github.com/htool/signalk-to-nmea2000) `conversions/navicoDisplays.js`, not this plugin.

### PGN 130845 needs Spare and MinLength

**The trap.** A canboat `simnetKeyValue` object without `Spare: 0` and `MinLength: 1` does not pack the value the way Navico glass expects. Backlight frames that work are `12,00,01,<level>`. Without those two fields, displays ignore the PGN even though the JSON looks right.

**What to do instead.** Include both on every 130845 key (backlight, night mode, night color). Tests: expected vs produced n2k JSON, not “the object has Key and Value.”

### Night color does not pack like backlight

**The trap.** Backlight and night mode pack as `…,01,ff,ff,12,00,01,<n>` and `…,01,ff,ff,26,00,01,<n>` — glass accepts those. The canboat key **Night mode color** (44079, `0xAC2F`) packs as `…,01,ff,2f,ac,00,01,<n>`. Zeus ignores that frame. Round-trip parse of the color JSON is still correct. The old HEX plugin never sent color; it only sent night `26,00,01` and backlight `12,00,01`.

**What to do instead.** Do not emit HEX from this plugin to “fix” color ([ADR 0004](adr/0004-converter-owns-n2k-encode.md), [known-gaps](known-gaps.md)). Packing belongs in the converter / canboat. Until that is fixed, webapp color PUTs can win in Signal K and lose on glass.

---

## When coding (this plugin)

### Glass ignored a PGN is not a reason to HEX

**The trap.** If vendor SK paths update and the plotter does not, it is tempting to paste a working HEX string into `nmea2000out` from the lighting plugin. That is how two plugins dual-send 130845.

**What to do instead.** Write Signal K only. Fix encode in signalk-to-nmea2000. If the field is still unknown, add a [known-gaps](known-gaps.md) row and stop. Do not invent canboat enums or a DisplayProvider.
