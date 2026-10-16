# Agent arena: design notes

Design only, not built. Goal: programs, including LLM agents, play belote against each other with replayable results.

## (a) CLI arena

`belote-arena run --preset classique@1 --deals 200 --seed <hex> --seat0 ./a --seat1 ./b --seat2 ./a --seat3 ./b`

- A seat agent is a child process speaking JSON lines on stdin/stdout, or an HTTP endpoint (`POST /act`).
- When a seat must act, the arena sends one message: `{"type":"act","matchId","seq","view","legal","deadlineMs"}`. `view` is `viewFor(state, seat)` and `legal` is the seat's legal intents.
- The agent answers `{"type":"intent","seq","intent"}` with an intent copied from `legal`, or an index into it.
- Other messages: `hello` (preset, seat, protocol version), `event` (public events), `end` (scores).
- Timeouts: 2 s per decision plus a per-match bank. On timeout the arena plays the first legal intent and records a strike.
- Illegal or malformed answers: `step` rejects them without changing the state. The arena records a strike, asks once more, then plays the fallback. Three strikes forfeit the match.
- Deals are duplicated (same seed, teams swapped) so card luck cancels out.

## (b) MCP server

An MCP server wraps the same loop for LLM agents:

- `new_table(preset, opponents)`: returns `tableId` and seat. Opponents are bots or other connected agents.
- `my_view(tableId)`: the seat view, already filtered by `viewFor`.
- `legal_moves(tableId)`: legal intents, each with an index and a readable label.
- `play(tableId, index)`: plays one; returns public events until the agent's next turn.
- `score(tableId)`: match and deal scores.

The server holds state and seed; a session is bound to one seat, so it cannot request another seat's view.

## (c) Partner communication

Partners communicate only through legal play: bids, doubles, declarations and card choice. The arena enforces this:

- No free-text field in the protocol; anything else an agent prints is ignored.
- Teammates run as separate processes or sessions, with no shared memory, files or network during a match.
- Signalling conventions are allowed if published with the agent, as in bridge.

## (d) Logs, replay and leaderboard

One JSON-lines file per match: a header (arena and engine versions, `variantKey`, seed, agent hashes), then one line per accepted intent (`seq`, seat, intent, think time, strikes). The engine is deterministic, so `replay(config, seed, intents)` rebuilds every state and anyone can verify a log. The leaderboard recomputes scores by replay and rates agents per variant family (Elo or TrueSkill on duplicate pairs).

## Effort estimate

| Piece | Agent-days |
|---|---|
| Arena core: match loop, seat rotation, duplicate deals, timeouts, strikes | 2 |
| JSON-lines and HTTP adapters, protocol schema and tests | 1.5 |
| Log format, replay checker | 1 |
| MCP server with the five tools | 1.5 |
| Leaderboard (offline script plus static page) | 1.5 |
| Docs, sample agents in TypeScript and Python | 1 |
| **Total** | **about 8.5** |
