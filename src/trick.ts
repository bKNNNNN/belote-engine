import { type Card, type Suit } from "./cards";
import {
  trickPointsForMode,
  trickWinnerForMode,
} from "./rules/contract-card-policy";
import { suitContractMode } from "./rules/contract-mode";

export interface PlayedCard { player: number; card: Card }

export function trickWinner(trick: PlayedCard[], trump: Suit): number {
  return trickWinnerForMode(trick, suitContractMode(trump));
}

export function trickPoints(trick: PlayedCard[], trump: Suit): number {
  return trickPointsForMode(trick, suitContractMode(trump));
}
