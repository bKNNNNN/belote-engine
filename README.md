# belote-engine

A rules engine for French belote and its main variants, written in TypeScript.

- **Pure.** No I/O, no clock, no `Math.random`, no Node built-ins. It runs the same in a browser, in Node and in a worker.
- **Deterministic.** The random generator lives in the state. The same variant, seed and intents always give the same game, event for event.
- **Immutable.** Every state and every event is a frozen value. `step` returns a new state and never changes the old one.
- **One engine, many variants.** A variant is a `VariantConfig` value (deck, deal, trump selection, play obligations, declarations, scoring, end of match). The engine never branches on a variant name.
- **Seat views.** `viewFor(state, seat)` returns only what a player at that seat may know, plus their legal intents. Humans and programs read the same view.

## Supported variants

The ten variants described in the rules bible ([`docs/rules/belote-variants-bible.md`](docs/rules/belote-variants-bible.md)), with their preset ids:

| Variant | Preset |
|---|---|
| Belote classique (à la retourne) | `classique@1`, `classique-annonces@1` |
| Belote de concours | `concours@1` |
| Belote à la vache | `vache@1`, `vache-retourne@1` |
| Belote moderne (SA / TA overbid) | `moderne@1` |
| Belote contrée | `contree@3` |
| Coinche, FFB rules, optional SA / TA | `coinche-ffb@2`, `coinche-sa-ta-ffb2015@1` |
| Coinche / belote bridgée (pagat tradition) | `bridgee@1` |
| Coinche stéphanoise | `stephanoise-marquez@1` |
| Belote à 2 | `a-deux@1` |
| Belote à 3 | `a-trois@1` |

`PRESET_REGISTRY` also holds frozen presets kept to replay older games (`coinche@1`, `contree@2`) and the `cavaillon@1` inverted-rank curiosity. Use `resolveVariant(preset, overrides)` to apply table options; incoherent combinations are rejected with an explicit error.

## Install

```sh
npm install belote-engine
```

ESM only, Node 22 or later, or any modern bundler. Types are included.

## Usage

```ts
import {
  chooseRandomLegalIntent, createMatch, findPreset, seatToAct,
  seedFromNumber, step, systemIntents, viewFor, type Intent,
} from "belote-engine";

const config = findPreset({ id: "classique", version: 1 })!.config;
let state = createMatch(config, seedFromNumber(2026)).state;

while (state.deal.phase !== "matchFinished") {
  const seat = seatToAct(state); // null when the engine waits for "nextDeal"
  let intent: Intent;
  if (seat === null) intent = systemIntents(state)[0]!;
  else {
    const view = viewFor(state, seat); // only what this seat may know
    console.log(`seat ${seat}: ${view.me?.hand.length} cards, ${view.legal.length} legal`);
    intent = chooseRandomLegalIntent(view, Math.random); // plug your player in here
  }
  const result = step(state, intent);
  if (!result.ok) throw new Error(result.reason); // illegal intents are rejected
  state = result.state;
}
console.log("scores", state.match.scores, "winner side", state.match.winner);
```

A checked, seeded version of this loop is in [`examples/play-match.ts`](examples/play-match.ts).

## Determinism and randomness

The engine uses xoshiro128** with a 128-bit seed (`Seed`, four uint32 words) stored in the state. Pass a seed to `createMatch`; `seedFromNumber(n)` expands a number into a full seed for tests and local games. For anything with stakes, draw the seed from a secure source (for example `crypto.getRandomValues`) and log it. `replay(config, seed, intents)` rebuilds the final state from a log.

Players and bots must use their own random source, never the engine's. The engine itself never reads ambient time or entropy.

## Documentation

- [`docs/rules/belote-variants-bible.md`](docs/rules/belote-variants-bible.md): rules of each variant, with sources (French).
- [`docs/rules/engine-design.md`](docs/rules/engine-design.md): `VariantConfig`, state machine, seat view, test strategy and rules arbitrations (French).
- [`docs/arena-design.md`](docs/arena-design.md): design notes for an agent-versus-agent arena (not built yet).

## Used by

Used by Cercle 32 (https://cercle32.app).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run check` before opening a pull request.

## Licence

Code: MIT, see [LICENSE](LICENSE). Rules documentation under `docs/rules/`: CC BY-SA 4.0, see [docs/LICENSE-docs](docs/LICENSE-docs).
