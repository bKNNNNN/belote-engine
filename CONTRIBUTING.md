# Contributing

Thanks for your interest. Bug reports, rule corrections with a source, and
pull requests are welcome.

## Ground rules

- The engine stays pure: no I/O, no clock, no `Math.random`, no Node
  built-ins under `src/engine`. `test/engine/purity.test.ts` enforces it.
- State is immutable. Functions return new frozen values.
- A variant is data (`VariantConfig`). The engine never branches on a variant
  name. A new variant is a new preset, plus options in `VariantConfig` if the
  existing ones cannot express it.
- Rule changes need a source (federation rules, pagat, Wikipedia, a club
  rulebook) cited in the preset `sources` and, when relevant, in
  `docs/rules/belote-variants-bible.md`.
- Write the failing test first, then the fix.

## Workflow

```sh
npm ci
npm run check   # typecheck + lint + test + build
```

Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, `chore:`). Keep pull requests small and focused.

## Licences

Code contributions are accepted under the MIT licence. Contributions to
`docs/rules/` are accepted under CC BY-SA 4.0.
