# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-15

### Added

- Parameterised belote rules engine: `createMatch`, `step`, `legalIntents`,
  `seatToAct`, `systemIntents`, `replay`.
- Variant presets for the classic, auction and small-table families, resolved
  and validated through `VariantConfig` and `resolveVariant`.
- Seat views (`viewFor`) that never leak hidden information, plus
  `deduce` / `rememberTricks` for what an attentive player can infer.
- Deterministic xoshiro128** RNG kept in the state (`createRng`,
  `seedFromNumber`).
- `chooseRandomLegalIntent`, a baseline example bot.
- Rules bible and engine design notes (French, CC BY-SA 4.0) under
  `docs/rules/`.
