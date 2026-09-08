# Docs first, then one feature: a Signal K AI trial on instrument lighting

*For Signal K core and plugin authors. A proposal we ran on a small, overlapping problem — and what actually happened.*

Two plugins dimmed the same B&G glass. Both spoke PGN 130845. They did not agree on Signal K.

One published a blob, `environment.displayMode`, and emitted HEX. The other wrote typed `electrical.displays.*` paths and (until this work) still pushed display PGNs of its own. A third plugin, the widescreen instrument display, read the blob for a CSS filter and `environment.mode` for night chrome.

That is the overlap smell the [Signal K AI approach](https://grok.com/share/bGVnYWN5LWNvcHk_c17d438a-11df-46d0-b319-406dae755a73) is meant to catch: two plugins, one job, two contracts, and a bandage (HEX) around a converter that did not yet own the PGN.

We used lighting as a trial because it is small enough to finish, painful enough to be real, and spread across four repos. The question was not “can an agent write a plugin?” It was: **can a short, layered corpus make an agent (and a human) do the right job, in the right repo, without dumping the monorepo into context?**

The trial branch is `showcase/instrument-lighting`. Start here:

- [htool/signalk-n2k-displays](https://github.com/htool/signalk-n2k-displays/tree/showcase/instrument-lighting) — policy, maps, PUT, webapp ([AGENTS.md](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/AGENTS.md))
- [htool/signalk-to-nmea2000](https://github.com/htool/signalk-to-nmea2000/tree/showcase/instrument-lighting) — encode ([display-encode.md](https://github.com/htool/signalk-to-nmea2000/blob/showcase/instrument-lighting/docs/display-encode.md))
- [htool/signalk-bandg-displaydaynight](https://github.com/htool/signalk-bandg-displaydaynight/tree/showcase/instrument-lighting) — compat stub, no HEX
- [htool/signalk-instrument-display-plugin](https://github.com/htool/signalk-instrument-display-plugin/tree/showcase/instrument-lighting) — consumer of brightness, layouts stay there



## What the approach asked for

Keep knowledge small and indexed. Do not merge it into one giant `AGENTS.md`. Five layers, plus a sixth for task skills:


| Layer            | Job                                                                     |
| ---------------- | ----------------------------------------------------------------------- |
| Agent index      | Table of contents. Read order. “Do not import `signalk-server` `src/`.” |
| System map       | What lives where and why.                                               |
| Public contract  | v1 paths and PUT. Internals off-limits.                                 |
| Decisions (ADRs) | Why. Agents stop if a change contradicts an accepted one.               |
| Gaps             | What plugins must not invent (DisplayProvider, HEX for known PGNs).     |
| Skills           | On-demand playbook (here: lighting maps and the control webapp).        |


Token rule: **index + one relevant page**, never the tree. Scope card on the README so the next author (or agent) can see the job, the overlaps, and what this plugin is not.

Intended benefits, in one line each:

- Cheaper Q&A (human and AI).
- Plugins stop papering over core holes.
- Overlap becomes a named split, not a second HEX emitter.
- Folklore in Discord becomes a backlog.

We did not implement the whole org plan (llms.txt, GitHub App, registry clustering). We implemented the **plugin-sized** slice and ran it until glass on the boat followed lux.

## How development actually ran

**Align first.** In conversation we locked the pipeline: source → skipper brightness 0–1 → per-device native → vendor Signal K → converter → N2K. Palettes are mode → native color, not dim levels. Control is `off | auto | auto-learning`. Encode is not the lighting plugin’s job.

**Write the corpus (F0), then code.** [Seven ADRs](https://github.com/htool/signalk-n2k-displays/tree/showcase/instrument-lighting/docs/adr), [architecture](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/architecture.md), [features.md](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/features.md), [known-gaps](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/known-gaps.md), a [lighting skill](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/skills/lighting/SKILL.md). Each repo got a short `AGENTS.md` that points at those files and forbids growing the prompt. If a slice cannot be done from the files, **fix the docs**.

**One pending row, one commit.** `features.md` is the queue. The agent implements the next `pending` line, links the ADR, and does not re-argue it. Done-when includes tests where the row says so.

That is the whole loop. Later sessions load `AGENTS.md` + the lighting skill, not the Sunday alignment chat.

## Speed

Calendar time: **6–7 September 2026**. Alignment started midday on the 6th. F0 (agent context) landed the same day. By the morning of the 7th, F0–F14 were done and the boat was running the result.


|                                  | Count      |
| -------------------------------- | ---------- |
| Feature slices (F0–F14)          | 15         |
| ADRs                             | 7          |
| n2k-displays commits after F0    | 16         |
| Converter encode commits         | 4 (+ docs) |
| Mocha tests in the policy plugin | 85         |


That is not “AI wrote a plugin overnight.” It is **decisions already written**, then small, testable slices. The expensive part was the alignment (paths, palettes, who emits N2K). The cheap part was F3–F12 once the ADRs existed.

We pulled F13 (lux → sun → time cascade) **ahead of F10** during boat testing. The feature list allowed a named later row. That is a human override of the queue, recorded in `features.md`, not a silent rewrite of an ADR.

## How decisions were made and recorded

Conversation proposed; **ADRs locked**. Examples that actually constrained code:

- [0001](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/adr/0001-intent-and-actuation-paths.md) — glass is `electrical.displays.{brightness,mode,control}`. Vessel day/night stays spec `environment.mode`. Do not grow the old blob except a one-major mirror.
- [0003](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/adr/0003-palettes-are-device-native.md) — Raymarine 0/2/3/4 are palettes, not dim levels. Navico and Raymarine do not share a color enum.
- [0004](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/adr/0004-converter-owns-n2k-encode.md) — plugins write Signal K; [signalk-to-nmea2000](https://github.com/htool/signalk-to-nmea2000) encodes. HEX only when the PGN is not understood. 130845 **is** understood.
- [0006](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/adr/0006-source-cascade-lux-sun-mode.md) — fresh lux wins, then sun, then `environment.mode`. Stale readings fall back.

Known-gaps is the “do not invent” list: no DisplayProvider in this plugin, no Garmin HEX-guess, brightness is not candela-equal across glass.

On the boat, that last cascade earned its keep: GNSS `navigation.datetime` was stuck on **22 January 2007**, so derived-data still reported `environment.mode = night` after sunrise. Lux did not care. Glass went day. The lighting plugin did not try to “fix” derived-data. That is the approach working: **name the owner, do not bandage the neighbour.**

## What the intended benefits looked like in practice

**Cheaper context.** A lighting session did not load signalk-server `src/`, KIP, or n2k-signalk except as reference. The agent followed the index. When it wanted a DisplayProvider, the gap page said no.

**One job per plugin.** Policy stayed in n2k-displays. Encode moved to the converter (F1, F2). The old B&G plugin became a stub that maps the 1–10 PUT and **does not emit 130845** (F11). The widescreen app reads `electrical.displays.brightness` and keeps `environment.mode` for chrome (F12). Independent upgrades: the deprecated blob still works for one major ([displayMode-compat.md](https://github.com/htool/signalk-n2k-displays/blob/showcase/instrument-lighting/docs/displayMode-compat.md)).

**Overlap became a split, not a second HEX path.** Tests in the policy plugin fail if `nmea2000out` or `nmea2000JsonOut` reappear. Converter tests compare expected vs produced n2k JSON (the existing 0.85 → Brightness 85 pattern).

**Decisions survived boat taste.** Skipper-facing UI never says “intent.” Chrome follows the phone `prefers-color-scheme`, not vessel mode. Off is brightness 0, not a third `DisplayMode`. Those were conversation refinements written into the skill and webapp, then tested as strings in `test/webapp.js`.

## When committed code breaks a decision

Agents will still do it. Humans will still do it. The corpus is not a compiler. Treat ADRs as **law**, tests as **guards**, CI as **the rude friend**, and Discord as **the hallway**.

### 1. Make the decision executable

If ADR 0004 says no HEX, a test must grep the plugin source for `nmea2000out`. If ADR 0003 says palettes are not dim levels, a test must refuse Raymarine 0/2/3/4 as brightness. If the README scope says “does not emit N2K,” F11’s stub test must fail on `130845` in `index.js`.

Soft prose in an ADR without a test is a wish.

### 2. Tell the agent to stop, not to patch around

`AGENTS.md` already says: if the slice cannot be done from these files, fix the docs. Add the sibling rule: **if a change contradicts an accepted ADR, stop and open** `needs-decision`**.** Do not silently supersede 0004 with a “quick HEX until the converter lands.”

That is how F4 existed: converter first, then delete JSON-out. The temporary window was a feature row, not a quiet exception.

### 3. GitHub workflows (cheap, no PAT)

These match the org proposal. Start as comments; block later if they stay noisy.

- **PR template** — “Which ADR? Or which gap?” Checkbox: “I almost worked around a core hole.”
- **CODEOWNERS** on `docs/adr/` and `AGENTS.md` so decision edits are reviewed.
- **Warn, then fail** — PRs that touch `src/`** without touching `docs/adr|features.md|known-gaps.md` get a bot comment. After the culture sticks, make it required.
- **Invariant greps in CI** — `signalk-server/src`, `nmea2000out` where the ADR forbids them. Fast, boring, effective.
- **Architecture drift** — if you keep a module list in `docs/architecture.md`, fail when top-level dirs appear without a bullet (more relevant to the server than to a plugin).
- **CodeRabbit / review** — ask it to flag ADR citations, not to invent architecture.

Do not auto-fail “similar plugin exists.” False positives punish hardware drivers. Do fail “this plugin imports core `src/`.”

If a bad commit already landed: revert, or write a **superseding ADR** in the same PR that fixes the code. Never leave code and ADR disagreeing.

### 4. Discord’s job

Discord is where Signal K actually thinks out loud. It is a terrible source of truth for agents.

Use it for:

- **Smell checks** — “two plugins emitting 130845, is that a converter gap?” Yes. Thread, then a GitHub Discussion or `core-gap` issue.
- **Review of proposed ADRs** before they are `accepted`. A Discussion template “Proposed ADR” beats a 40-message scrollback.
- **Digest, not archaeology** — a weekly GitHub Action that posts open `needs-decision` / `core-gap` issues into a `#decisions` channel. Discord becomes the inbox; GitHub stays the file.

Do not:

- Tell agents “see Discord.” They cannot retrieve it cheaply or stably.
- Let a thumbs-up in chat supersede an ADR. Promote it: chat → issue → ADR → tests.
- Put vessel-specific taste (this boat’s red night palette) in core skills. That stays in the plugin’s maps and the skipper’s webapp.

The lighting trial found a GNSS date of January 2007 because we were watching Discord-unrelated boat data. The *interpretation* (“derived-data is not wrong; the plotter clock is”) belongs in a comment or a derived-data issue, not in the lighting plugin.

## What we would copy into core next

The plugin slice is enough to recommend, without waiting for llms.txt:

1. Every plugin that an agent will touch: short `AGENTS.md` (index), README scope card, `docs/adr/` for the fights you keep having, `known-gaps.md` for the fights you refuse to have in this repo.
2. Brand-agnostic `SKILL.md` under `skills/`, not three copies in `.cursor`, `.claude`, and `.github`.
3. `features.md` as a queue when the work is a showcase or a migration, not as a second roadmap product.
4. Tests that encode the bans.
5. Discord as the hallway; GitHub labels `core-gap` and `needs-decision` as the cupboard.

What we would **not** copy yet: a DisplayProvider invented in a plugin because Admin PUT auth is awkward. That stays a gap.

## Closing

The approach is not “let the model read the org.” It is **write the why in files the model is allowed to read**, slice the work so one commit cannot quietly revive HEX, and put overlap on a scope card so the next plugin does not clone the job.

Instrument lighting was the smallest honest trial we had. In two calendar days the four repos agreed on a pipeline, the converter owned 130845/126720, the stub stopped shouting HEX, and the boat’s glass followed a light meter even when the plotter thought it was January.

That is the benefit. The workflow to keep it is: ADR, test, CI comment, Discord only to start the next ADR.