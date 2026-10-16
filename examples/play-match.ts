import {
  chooseRandomLegalIntent, createMatch, findPreset,
  seatToAct, seedFromNumber, step, systemIntents, viewFor,
} from "../src/index";

export function playMatch(seed: number, presetId = "classique") {
  const config = findPreset({ id: presetId, version: 1 })!.config;
  let state = createMatch(config, seedFromNumber(seed)).state;
  let botRandom = seed + 1;
  const random = () => ((botRandom = (botRandom * 48271) % 2147483647) / 2147483647);
  while (state.deal.phase !== "matchFinished") {
    const seat = seatToAct(state);
    const intent = seat === null
      ? systemIntents(state)[0]! // e.g. "nextDeal" between deals
      : chooseRandomLegalIntent(viewFor(state, seat), random);
    const result = step(state, intent);
    if (!result.ok) throw new Error(`rejected: ${result.reason}`);
    state = result.state;
  }
  return { scores: state.match.scores, winner: state.match.winner, deals: state.dealNumber };
}
