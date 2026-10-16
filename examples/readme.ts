import {
  chooseRandomLegalIntent, createMatch, findPreset, seatToAct,
  seedFromNumber, step, systemIntents, viewFor, type Intent,
} from "../src/index";

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
