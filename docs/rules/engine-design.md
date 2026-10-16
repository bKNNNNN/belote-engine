# Conception du moteur de règles de belote (extrait public)

> Licence : CC BY-SA 4.0, voir `docs/LICENSE-docs`. Ce document est un extrait du document de conception interne du moteur. Il ne garde que les parties qui décrivent les règles, la configuration des variantes, la machine d'état, la vue par siège, les tests et les arbitrages de règles. La numérotation des sections est celle du document d'origine, citée dans le code : les trous sont voulus.

Version de travail du 14 octobre 2026. Entrées : `belote-variants-bible.md` (avec les deux corrections ci-dessous) et la lecture du code.

Corrections appliquées à la bible :

- La FFB publie bien des règles de coinche : <https://www.ffbelote.org/regles-coinche/>. Elles servent de référence au préréglage « Coinche FFB ». Le dépôt s'appuyait déjà sur le PDF FFB 2015 (`REGLES-DE-LA-BELOTE-COINCHEE.pdf`) pour `coinche-sa-ta-ffb2015@1`. Les écarts entre la page web actuelle et le code sont listés en 1.6.
- « Belote à la vache » : un seul tour de prise. Chaque joueur peut nommer la couleur d'atout de son choix. Pas de carte retournée. Si tout le monde passe, le donneur doit prendre. Partie en 3000 (Ludi, belote.tv). Option (jeudebelote.org) : une carte est retournée et, si tout le monde passe, le donneur est forcé de prendre dans sa couleur. L'option « donneur forcé au 2e tour » de la bible (Belote Rebelote) reste une option distincte de la classique, sous le nom « donneur forcé ».

---

### 1.4 Bogues de marque de l'ancien moteur de contrée

Le module `src/engine/scoring/contract-legacy.ts` reproduit volontairement l'ancien décompte de la contrée (écarts 2.1 à 2.3) pour rejouer des parties enregistrées. Les écarts 2.4 à 2.6 venaient de l'ancienne machine d'état et ne sont pas reproduits. Écarts connus de l'ancien moteur :

| # | Gravité | Constat |
|---|---|---|
| 2.1 | haute | Contrat chuté : la défense perd sa propre belote. Preneur 80♠ chuté, belote défense : marque `[0, 240]` au lieu de `[0, 260]` |
| 2.2 | moyenne | Capot non demandé sans prime : 80 réussi en capot marque 242 (80 + 162), pas 250 + 80. Capot demandé réussi marque 412 (250 + 162), ni 500 ni 252 + 250 |
| 2.3 | moyenne | Contre : seul le contrat est multiplié (80 contré réussi en capot : 322). La défense garde ses points sur un contrat réussi |
| 2.4 | haute | Belote suivie par équipe : le Roi joué par un joueur et la Dame par son partenaire donnent la belote |
| 2.5 | haute | Rebelote jouée sur la 32e carte perdue : la donne est marquée avant que la belote soit posée |
| 2.6 | moyenne | Contrée : égalité au-dessus de la cible, partie terminée sans gagnant |

`contree@3` corrige tous ces points.

### 1.6 Écarts entre `coinche@1` (PDF FFB 2015) et la page FFB actuelle

| Point | Code `coinche@1` | Page FFB `regles-coinche` | Décision proposée |
|---|---|---|---|
| Échelle | 80 à 160 par 10, capot 250 | 80 à 650, pas d'au moins 10, ou capot | préréglage `coinche-ffb@2` : 80 à 650 ; `coinche@1` figé pour rejouer les parties existantes |
| Réussite | atteindre le contrat **et** strictement plus que la défense | atteindre le contrat ; chute si la défense fait plus | égalité = réussite en `@2`. À confirmer par mail FFB, le texte peut se lire des deux façons |
| Capot demandé chuté | 160 + 250 = 410 | 500 | 500 en `@2` |
| Capot coinché / surcoinché | `(250 + 250 + …) × M` | 1 000 / 2 000 | compatible si annonces et belote restent hors multiplication |
| Coinche réussie | `(160 + C + annonces + belote preneur) × M` | `(160 + C) × 2` | la page ne mentionne pas les annonces : garder le paramètre `multipliedIncludes` |
| Arrondi | à la dizaine, 5 au-dessus | idem, et « l'arrondi ne fait jamais réussir » (89 chute à 90) | ajouter `roundingNeverDecidesContract: true` |
| Annonces | comptent pour le contrat | comptent pour le contrat (exemple : 83 + tierce = 103 remplit 100) | identique |
| Égalité d'annonces | atout puis rien | plus haute carte, puis atout, sinon aucune | identique |
| SA / TA | matrice FFB 2015 à 152 | annexe facultative, sans barème | garder FFB 2015 comme option de `coinche-ffb@2` |
| Fin de partie | 500/1000/1500 + verrou belote sous capot | cible non précisée ; « pas de fin sur capot + belote » | garder le verrou, cible 2000 par défaut (pagat) en attendant la FFB |
| Faute de jeu | non gérée (coups illégaux refusés) | pénalité 160 | sans objet en ligne, les coups illégaux sont impossibles |

---

## 2. Cible : un moteur paramétrique unique

### 2.1 Principes

1. Une variante est une **valeur** `VariantConfig`, complète, gelée et versionnée (`id@version`). Le moteur ne lit jamais le nom d'une variante.
2. Le moteur est une **fonction pure** : `step(state, intent) → { state, events } | rejet`. Pas d'horloge, pas d'I/O, pas de `node:*`, pas de `Math.random`. Il tourne à l'identique dans le navigateur et dans Node.
3. **Hasard injecté et déterministe** : la graine est dans l'état ; un même couple (config, graine, intentions) produit le même journal d'événements, octet pour octet.
4. **Immutabilité** : toute la structure est `Readonly` et gelée en dev/test (`deepFreeze`), copiée seulement aux frontières.
5. **Unions discriminées plutôt que booléens** : une combinaison incohérente (sans atout dans une variante à la retourne sans surenchère, coinche dans une prise classique) ne doit pas être représentable. `resolveVariant(preset, overrides)` valide le reste et renvoie une erreur explicite. Rien n'est corrigé en silence.
6. **Une seule vue publique** par siège (section 3), consommée de la même façon par un joueur humain ou un programme.

### 2.2 Type `VariantConfig`

```ts
// src/engine/variant-config.ts
type SeatCount = 2 | 3 | 4;
type ModeKind = "suit" | "no-trump" | "all-trump";

export type VariantConfig = Readonly<{
  id: string;                 // "coinche-ffb"
  version: number;            // 2
  confidence: "canonique" | "candidate" | "campagne";
  sources: readonly string[]; // URL ou ancre de document, une par règle distinctive
  table: TableConfig;
  deck: DeckConfig;
  deal: DealConfig;
  trump: TrumpSelection;
  cards: CardScaleConfig;
  play: PlayRules;
  belote: BeloteRules | null;
  declarations: DeclarationRules | null;
  scoring: ScoringRules;
  match: MatchRules;
}>;

type TableConfig = Readonly<{
  seats: SeatCount;
  sides:
    | { kind: "fixedPairs" }          // 4 joueurs : sièges 0+2 contre 1+3
    | { kind: "takerVsRest" }         // 3 joueurs : alliance de donne, marque individuelle
    | { kind: "headsUp" };            // 2 joueurs
  direction: "counterclockwise" | "clockwise";
  tableau: null | Readonly<{          // belote à 2 : cartes posées devant soi
    columns: number;                  // 4
    layers: 2;                        // cachée dessous, visible dessus
    reveal: "immediate" | "endOfTrick";
  }>;
  trickHistory: "full" | "lastTrickOnly"; // ce que la vue publique garde des plis ramassés
}>;

type DeckConfig = Readonly<{ removed: readonly Card[] }>; // [] = 32 cartes

type DealConfig = Readonly<{
  shuffle: "everyDeal" | "cutOnly";
  firstDealer: "random";
  steps: readonly DealStep[];        // interprétées dans l'ordre
}>;

type DealStep =
  | { kind: "packets"; sizes: readonly number[]; zone: "hand" | "tableauHidden" | "tableauVisible" }
  | { kind: "turnup"; source: "deck" | "dealerTableauLast" }
  | { kind: "trumpSelection" }       // point d'arrêt : on attend les intentions
  | { kind: "completeAfterTaking"; takerReceivesTurnup: boolean; takerCount: number; othersCount: number }
  | { kind: "packetsAfterSelection"; sizes: readonly number[] }; // stéphanoise : +2

type TrumpSelection =
  | Readonly<{
      kind: "turnup";
      secondRound: "otherSuits" | "anySuit" | "none";
      forcedJack: boolean;                         // valet forcé
      dealerForcedAfterRound2: boolean;            // « donneur forcé »
      overbid: null | readonly ("no-trump" | "all-trump")[]; // belote moderne
    }>
  | Readonly<{
      kind: "freeChoice";                          // belote à la vache
      modes: readonly ModeKind[];                  // ["suit"]
      allPassed: "dealerMustChoose" | "dealerTakesTurnupSuit";
    }>
  | Readonly<{
      kind: "auction";
      ladder: Readonly<{ min: number; step: number; max: number; specials: readonly ("capot" | "generale")[] }>;
      modes: readonly ModeKind[];
      modeHierarchy: "none" | "suitOrderBreaksTies"; // pagat : 100♣ > 90 SA > 90♥
      overbidSelf: boolean;
      maxSpeechesPerPlayer: number | null;
      doubling: null | Readonly<{
        labels: "coinche" | "contre";
        timing: "inTurn" | "anytime";
        closesAuction: boolean;                    // false = décoinche stéphanoise
        redouble: boolean;
        minDoublableBid: number | null;
        capotDoublable: boolean;
      }>;
      allPassed: "redeal";
    }>;

type CardScaleConfig = Readonly<{
  noTrump: "scaled152" | "raw120";                 // FFB 2015 = scaled152
  allTrump: "ffb2015" | "tableB" | "raw248";       // FFB 2015 = J13 9:9 A6 10:5 K3 Q2
  lastTrickBonus: 10;
  capotLastTrickBonus: 100;                         // 252 au capot
  invertedRanks: boolean;                           // défi Cavaillon
}>;

type PlayRules = Readonly<{
  undertrump: "required" | "optional";             // FFB coinche : optional
  partnerMaster: "free" | "mustTrump" | "mustOvertrumpOnly";
  allTrumpMustClimb: boolean;                       // TA : monter même sur le partenaire
  firstLead: "rightOfDealer" | "generaleDeclarer";
}>;

type BeloteRules = Readonly<{
  points: 20;
  holder: "anyone" | "takerSideOnly";
  declaration: "automatic" | "spoken";             // spoken : « belote » puis « rebelote »
  order: "any" | "kingFirst";
  onFailedContract: "keep" | "toDefence";
  allTrump: "perSuit" | "none";
  golden: number | null;                            // 4 Rois + 4 Dames en TA
}>;

type DeclarationRules = Readonly<{
  table: "ffb";                                     // tierce 20, 50, 100, carrés 200/150/100
  tierce: 20 | 30;
  noTrumpSquares: "ffb" | "sa-aces-200";
  folklore: Readonly<{ eightsCancel: boolean; sevensCancelDeal: boolean }>;
  tieBreak: "highCardThenTrumpThenNone" | "firstInOrder";
  countTowardContract: boolean;
  timing: "announceFirstTrickShowSecond";
  capotTransfersOpponents: boolean;
}>;

type ScoringRules =
  | Readonly<{
      kind: "classicSplit";                         // classique, vache, à 2
      success: "beatDefence";
      tie: "litigeCarryOver" | "defenceWins" | "takerWins";
      failure: Readonly<{ defenceBase: 162; takerKeepsBelote: boolean }>;
      capot: Readonly<{ points: 252 | 250 }>;
      rounding: 1 | 5 | 10;
    }>
  | Readonly<{
      kind: "contract";                             // contrée, coinche, bridgée, stéphanoise
      method: "pointsFaits" | "pointsAnnonces";
      success: Readonly<{ reachBid: true; versusDefence: "strictlyMore" | "notLess"; margin: 0 | 2 }>;
      failureBase: 160;
      capot: Readonly<{ unbidBonus: "250PlusContract" | "none"; bidMade: number; bidFailed: number }>;
      generale: null | Readonly<{ made: number; failed: number }>;
      doubling: Readonly<{ scope: "contract" | "contractPlusBase" | "wholeScore"; multipliers: readonly [2, 4] | readonly [2, 3]; multipliedIncludes: "declarationsAndTakerBelote" | "nothingElse" }>;
      rounding: Readonly<{ to: 10; half: "up"; neverDecidesContract: boolean }>;
    }>
  | Readonly<{
      kind: "takerVsEach";                          // belote à 3
      capotBonusPerOpponent: 50;
      cancelLastTrickOnCapot: boolean;
    }>;

type MatchRules = Readonly<{
  end:
    | { kind: "target"; points: number; tie: "extraDeal" | "lastDealWinner" }
    | { kind: "deals"; count: number }
    | { kind: "singleDeal" };
  finishLock: "none" | "beloteOnlyAfterFailOrCapot"; // verrou FFB coinche
  formats: readonly Readonly<{ id: string; target: number; isDefault: boolean }>[];
}>;
```

Règles de cohérence vérifiées par `resolveVariant` (chacune a son test de rejet) :

- `table.tableau !== null` ⇔ `seats === 2`.
- `sides.kind === "takerVsRest"` ⇔ `seats === 3` ⇔ `scoring.kind === "takerVsEach"`.
- `trump.kind !== "auction"` ⇒ `scoring.kind !== "contract"`.
- `deck`, `deal.steps` et `seats` donnent des mains de taille égale. Nombre de plis = cartes / sièges.
- `belote.allTrump === "perSuit"` seulement si `all-trump` fait partie des modes.
- `trump.kind === "turnup"` ⇒ exactement une étape `turnup` avant `trumpSelection`.
- Tout champ inconnu est rejeté (même politique que `parseContractMode`).

### 2.3 Préréglages

Chaque préréglage est un objet de données dans `src/engine/presets/`, sans code. Les colonnes montrent ce qui le distingue de la ligne de base.

| Préréglage | Statut | Valeurs distinctives | Source |
|---|---|---|---|
| `classique@1` (= `belote-classique@1`) | canonique, en ligne | 4, paires, `packets [3,2]`, retourne, `secondRound: otherSuits`, `complete 2/3`, belote auto, pas d'annonces, `classicSplit`, litige, capot 252, cible 1000 (500/1500) | profil historique |
| `classique-annonces@1` (= `belote-annonces@1`) | canonique, spécifié | classique + `declarations: ffb`, belote dite | règles d'annonces FFB |
| `concours@1` | candidate | classique, `shuffle: cutOnly`, `trickHistory: lastTrickOnly`, fin en nombre de donnes (N à relever dans le règlement FD 33) | règlements Générations Mouvement |
| `vache@1` | candidate | `packets [3,2]`, pas de retourne, `freeChoice {modes:["suit"], allPassed: dealerMustChoose}`, `packetsAfterSelection [3]`, `classicSplit`, cible 3000 | Ludi, belote.tv |
| `vache-retourne@1` | candidate | vache + `turnup` + `allPassed: dealerTakesTurnupSuit` | jeudebelote.org |
| `moderne@1` | candidate | classique + `overbid: ["no-trump","all-trump"]`, barèmes `scaled152` / `ffb2015` | regles-du-jeu.net, Wikipédia |
| `contree@3` | canonique | `packets [3,2,3]`, `auction 80/10/160 + capot`, modes `suit`, `contre` en tour, ferme les enchères, `contract/pointsAnnonces`, capot chuté 410, cible 1000 ; corrige 2.1 à 2.6 | Wikipédia Belote contrée, bible 3.4 |
| `coinche@1` | canonique, figé | profil historique (FFB 2015) | PDF FFB 2015 |
| `coinche-sa-ta-ffb2015@1` | canonique, figé | `coinche@1` + 6 modes | annexe SA/TA du PDF FFB 2015 |
| `coinche-ffb@2` | canonique | `auction 80/10/650 + capot`, `coinche` en tour, `undertrump: optional`, annonces qui comptent, `notLess`, capot 500/500, coinché 1000/2000, arrondi qui ne décide jamais, verrou de fin, cible 2000 ; SA/TA FFB 2015 en option | page FFB, 1.6 |
| `bridgee@1` | candidate | coinche « tradition pagat/Wikipédia » : 80/10/160 + capot + générale, SA/TA tableau A, `doubling.scope: contract`, surcoinche ×4 (option ×3), générale 800, cible 2000 | pagat Coinche, Wikipédia Coinche |
| `stephanoise-marquez@1` | candidate, bloquée | `packets [3,3]`, `trumpSelection`, `packetsAfterSelection [2]`, `ladder.min 82`, pas de TA, `closesAuction: false` (décoinche), `undertrump: optional`, annonces sur 8 cartes | arbitrage du 05/08. Pas, rôle des annonces et marque restent en NO-GO |
| `a-deux@1` | candidate | 2, `headsUp`, `tableau {4 colonnes, 2 couches}`, main 8 + table 8, 16 plis, `turnup.source: dealerTableauLast`, belote comptée, `classicSplit` (chute à 81) | Wikipédia (« bis »), pagat |
| `a-trois@1` | candidate | 3, `takerVsRest`, paquet sans 7♠ 7♣ (30 cartes, total toujours 162), `packets [3,3]`, retourne, `complete 3/4` (preneur : retourne + 3, autres : 4, soit 10 chacun), `takerVsEach`, capot 50 + 50 | Wikipédia Belote. Schéma de complément en règle maison, à valider en jeu |
| `cavaillon@1` | hors parties classées | coinche + `invertedRanks` | Wikipédia Coinche |

Les profils figés (`coinche@1`, `coinche-sa-ta-ffb2015@1`, `contree@2`) restent résolvables pour rejouer les journaux existants. Ils ne sont plus proposés à la création de table.

### 2.4 Machine d'état

```ts
// src/engine/index.ts
export type EngineState = Readonly<{
  variant: VariantRef;               // { id, version } ; la config est résolue par registre
  rng: RngState;                     // xoshiro128** : 4 × uint32
  match: MatchState;                 // scores par camp, donneur, numéro de donne, report de litige, verrous
  deal: DealState;                   // union discriminée par phase
  seq: number;                       // révision, sert d'idempotence à l'appelant
}>;

type DealPhase =
  | "trumpSelection" | "declaring" | "playing" | "dealScored" | "matchFinished";

export type Intent =
  | { kind: "pass"; seat: Seat }
  | { kind: "take"; seat: Seat; mode: ContractMode }                       // retourne, vache, moderne
  | { kind: "bid"; seat: Seat; value: number | "capot" | "generale"; mode: ContractMode }
  | { kind: "double"; seat: Seat } | { kind: "redouble"; seat: Seat }
  | { kind: "declare"; seat: Seat; combinationIds: readonly string[] }
  | { kind: "belote"; seat: Seat }                                         // si declaration: "spoken"
  | { kind: "play"; seat: Seat; card: Card }
  | { kind: "nextDeal" };                                                  // système, après dealScored

export function createMatch(config: VariantConfig, seed: Seed, options: { formatId: string }): Transition;
export function step(state: EngineState, intent: Intent): Transition | Rejection;
export function legalIntents(state: EngineState, seat: Seat): readonly Intent[];
export function viewFor(state: EngineState, viewer: Seat | "spectator"): SeatView;
export function replay(config: VariantConfig, seed: Seed, intents: readonly Intent[]): EngineState;
```

Règles d'exécution :

- `Rejection` est une valeur typée (`notYourTurn`, `illegalCard`, `illegalBid`, `wrongPhase`…). Jamais d'exception sur une intention joueur. Les exceptions restent réservées aux invariants violés (état corrompu).
- Une intention acceptée produit au moins un événement. Les transitions automatiques (pli complet, fin de donne, fin de match, redonne après quatre passes) sortent dans la même transition, sous forme d'événements ordonnés. L'appelant gère le rythme d'affichage ; l'état ne l'attend pas.
- `nextDeal` est la seule intention système. Elle tire la donne suivante à partir de `rng`, ce qui laisse les redémarrages et revanches à l'appelant.
- Composition interne, une fonction pure par fichier : `seats.ts` (sens, partenaires, alliances de donne), `deal-interpreter.ts`, `trump-turnup.ts`, `trump-free-choice.ts`, `trump-auction.ts`, `legal.ts`, `belote.ts`, `declarations.ts`, `scoring/classic-split.ts`, `scoring/contract.ts`, `scoring/taker-vs-each.ts`, `match.ts`, `view.ts`. Chaque fichier reste sous 400 lignes.
- Hasard : `rng.ts` implémente xoshiro128** en TypeScript pur. L'appelant fournit la graine (par exemple tirée avec `crypto.getRandomValues`) et la journalise. Un joueur programmé utilise son propre flux aléatoire, jamais celui du moteur.

### 2.5 Légalité des cartes

`legal.ts` appelle `legalMovesForMode` sans le modifier et ajoute trois couches autour :

1. **Cartes jouables** = main ∪ cartes visibles du tableau (belote à 2).
2. **Partenaire** = alliance de donne (`seats.ts`) : partenaire fixe à 4, co-défenseur à 3, aucun à 2.
3. **Options** : `partnerMaster: mustTrump | mustOvertrumpOnly` filtre le résultat de la politique par défaut, qui laisse le joueur libre quand son partenaire est maître (FFB, pagat). `undertrump` passe tel quel.

---


## 3. Vue publique par siège

Un joueur programmé consomme **exactement** ce que voit un humain assis au même siège, plus la liste de ses intentions légales.

```ts
// src/engine/view.ts
export type SeatView = Readonly<{
  variant: VariantRef;
  rulesDigest: VariantSummary;           // pastilles lisibles : partenaire maître, sous-coupe, cible…
  viewer: Seat | "spectator";
  seq: number;
  phase: DealPhase;
  dealNumber: number;
  dealer: Seat;
  toAct: Seat | null;

  seats: readonly Readonly<{
    seat: Seat;
    side: SideId;                        // camp de marque
    dealAllies: readonly Seat[];         // partenaire fixe, ou co-défenseur à 3
    handCount: number;
    tableau: readonly Readonly<{ visible: Card | null; hiddenCount: 0 | 1 }>[] | null;
    tricksWon: number;
  }>[];

  me: Readonly<{
    seat: Seat;
    hand: readonly Card[];
    pendingReserveCount: number;         // stéphanoise : 2 avant la fin des enchères
    declarableCombinations: readonly DeclarationCandidate[];
  }> | null;

  turnup: Readonly<{ card: Card; status: "proposed" | "takenBy"; seat?: Seat }> | null;
  trumpSelection: Readonly<{
    history: readonly AuctionAction[];   // { seat, kind: pass|take|bid|double|redouble, value?, mode? }, ordre de parole
    round: 1 | 2 | null;
    highest: AuctionAction | null;
    doubledBy: SideId | null;
  }>;
  contract: Readonly<{
    taker: Seat; side: SideId; mode: ContractMode;
    value: number | "capot" | "generale" | null;   // null en classique
    multiplier: 1 | 2 | 3 | 4;
  }> | null;

  belotes: readonly Readonly<{ seat: Seat; suit: Suit; stage: "belote" | "rebelote" }>[];
  declarations: Readonly<{
    announced: readonly Readonly<{ seat: Seat; label: DeclarationLabel }>[];          // 1er pli : la hauteur
    shown: readonly Readonly<{ seat: Seat; cards: readonly Card[]; points: number }>[]; // 2e pli : le camp gagnant seulement
    winningSide: SideId | null;
  }>;

  trick: Readonly<{ leader: Seat; cards: readonly PlayedCard[] }>;
  completedTricks: readonly Readonly<{ leader: Seat; cards: readonly PlayedCard[]; winner: Seat }>[];
  // trickHistory "lastTrickOnly" : seul le dernier pli ramassé est rendu, le reste vaut []

  score: Readonly<{
    sides: readonly SideId[];
    match: Readonly<Record<SideId, number>>;
    target: number | null; dealsLeft: number | null;
    litigePending: Readonly<{ side: SideId; points: number }> | null;
    finishLocks: Readonly<Record<SideId, boolean>>;
    lastDeal: DealResult | null;         // détail ligne à ligne, identique pour tous
  }>;

  legal: readonly Intent[];              // vide si le spectateur ou si ce n'est pas mon tour
}>;
```

Règles :

- La vue est construite par **liste blanche**, champ par champ, à partir de l'état. Elle n'est jamais obtenue en retirant des champs d'un objet complet.
- Visible : sa main, les cartes jouées, la retourne, l'historique complet des enchères, le contrat, les belotes dites, les annonces selon le calendrier FFB, les scores, les verrous, les alliances, le nombre de cartes de chaque main.
- Jamais visible : les autres mains, la couche cachée du tableau, la réserve stéphanoise, le talon, l'état du RNG, les annonces non montrées du camp perdant.
- `knowledge.ts` (pur, entrée `SeatView` seulement) calcule ce qu'un joueur attentif peut déduire : cartes restantes, coupes certaines, atouts restants, cartes maîtresses, points restant en jeu. Avec `trickHistory: lastTrickOnly`, le joueur garde sa propre mémoire au fil des vues (`rememberTricks`), comme un humain.
- Le moteur vérifie l'intention d'un joueur programmé comme celle d'un humain.

---


## 5. Stratégie de tests dorés

### 5.1 Tables de marque par préréglage, tirées des sources

Un fichier `test/golden/<preset>.cases.ts` par préréglage. Chaque cas donne des totaux d'entrée (plis, belotes, annonces, multiplicateur, capot) et la marque attendue, ligne à ligne, avec l'URL de la source en commentaire. Le noyau de marque est testé seul, sans jouer de partie.

Cas obligatoires minimum :

| Préréglage | Cas | Attendu | Source |
|---|---|---|---|
| classique | réussite 100/62 + belote preneur | 120 / 62 | Wikipédia Belote |
| classique | chute 80/82 | 0 / 162 (+20 si belote défense) | idem |
| classique | litige 81/81 puis donne suivante gagnée | 0 / 81, puis +81 au gagnant | usage du litige, profil historique |
| classique | capot | 252 / 0 (272 avec belote) | Wikipédia |
| contrée@3 | 100 contré, chuté (marque points annoncés) | défense : 100 × 2 = 200 ; preneur : sa belote seulement, si `onFailedContract: keep` | Wikipédia Belote contrée |
| contrée@3 | capot demandé chuté | 0 / 410 | Wikipédia Belote contrée |
| contrée@3 | 2.1 : 80 chuté, belote défense | 0 / 260 (points faits) | règle commune bible 3.4 |
| bridgée | 100 coinché, chuté, belote preneur | 20 / 360 | pagat Coinche (exemple chiffré) |
| bridgée | capot annoncé réussi / chuté / non annoncé | 500 / 500 défense / 250 + contrat | Wikipédia Coinche |
| coinche-ffb@2 | 100 demandé, 83 + tierce | réussi (103) | page FFB |
| coinche-ffb@2 | 89 sur 90 | chute (pas d'arrondi qui sauve) | page FFB |
| coinche-ffb@2 | coinche réussie | (160 + C) × 2 | page FFB |
| coinche-ffb@2 | capot coinché / surcoinché | 1 000 / 2 000 | page FFB |
| coinche-ffb@2 | capot non annoncé | 250 + C | page FFB |
| coinche-sa-ta | exemples 1 à 5 de l'annexe SA/TA | `[190,70]`, 740/20, 40/1 480, `[462,20]`, base 250 | PDF FFB 2015 |
| a-trois | preneur battu par un adversaire | l'adversaire marque ses points + ceux du preneur, le troisième garde les siens | Wikipédia Belote |
| a-trois | un joueur capot | +50 à chacun des deux autres, dix de der annulé | Wikipédia Belote |
| a-deux | preneur à 81 | chute | pagat |
| vache | tous passent | le donneur doit nommer une couleur ; aucune redonne | Ludi, belote.tv |

En plus des cas tirés des sources, chaque noyau reçoit une **matrice exhaustive générée** : issue (réussite, chute, litige) × multiplicateur (1, 2, 4) × capot (aucun, preneur, défense) × propriétaire de belote (aucun, preneur, défense, les deux en TA) × annonces (aucune, preneur, défense). Les valeurs attendues sont calculées par l'oracle (5.3), jamais par le moteur.

### 5.2 Simulateur d'invariants

`test/engine/simulate-*.test.ts` : pour chaque préréglage, 1 000 parties (moins en CI), graines fixes, joueurs qui tirent une intention au hasard dans `legalIntents`. Contrôles après chaque transition :

1. Conservation : mains + tableau + plis + réserve = paquet de la variante, chaque carte une fois.
2. Tailles de main égales en début de jeu ; nombre de plis = cartes / sièges.
3. Somme des points de cartes + dix de der = 162 (ou 130 / 258 selon le barème) ; 252 au capot.
4. `legalIntents(siège à jouer)` jamais vide ; toute intention hors de la liste est rejetée sans changer l'état.
5. Non-fuite : pour tout siège `s`, la sérialisation de `viewFor(state, s)` ne contient aucune carte d'une autre main ni d'une couche cachée, sauf si elle a été jouée ou montrée.
6. Déterminisme : deux exécutions avec la même graine donnent le même hash de journal ; `replay(config, graine, intentions)` redonne l'état final.
7. Immutabilité : l'état d'entrée, gelé, reste identique (`structuredClone` comparé avant et après).
8. Terminaison : chaque match se termine en moins de 200 donnes ; pas d'égalité finale sans gagnant si `tie: extraDeal`.
9. Cohérence de marque : en `classicSplit` sans capot ni litige, la somme des marques = 162 + belotes + annonces ; en `contract`, une seule des deux équipes marque le contrat.
10. Événements : chaque transition acceptée émet au moins un événement, et `seq` augmente de 1.

### 5.3 Oracle croisé

- **Oracle indépendant** dans `test/oracle/` : implémentation naïve écrite à partir de la bible et des sources, pas du moteur. Pas de performance, pas de partage de code sauf `Card`. Il contient une légalité par prédicats explicites (« doit fournir », « doit couper »…), un gagnant de pli par tri, et les formules de marque recopiées des sources. Il sert à des tests différentiels sur positions aléatoires (légalité, gagnant, marque) pour chaque préréglage. Toute divergence produit un rapport minimal (graine, position, attendu, obtenu).
- **Contrôle en jeu réel**, décision ouverte n° 1 de la bible : jouer 20 donnes sur Belote.com et Belote Rebelote, noter les réglages et ajouter ces donnes comme cas dorés `apps/*.cases.ts` étiquetés avec l'application et la date.

---

## 6. Décisions ouvertes

1. `coinche-ffb@2` : égalité de totaux = réussite ? Demander à la FFB ; à défaut, `strictlyMore` comme dans le PDF 2015.
2. `coinche-sa-ta-ffb2015@1` : exposé ou non comme option de table. Tranché en 7.2.
3. `concours@1` : nombre de donnes et règle d'égalité à relever dans un règlement de concours précis (FD 33 ou Mayenne).
4. `a-trois@1` : schéma de complément après la prise (3 + 3, retourne, puis 4 / retourne + 3) décidé en règle maison faute de source détaillée. À valider en partie test avant de passer en `canonique`.
5. `stephanoise-marquez@1` : NO-GO levé. Le règlement Marquez est de nouveau en ligne (https://coinche-stephanoise.com/mesdocuments/reglement_coinche.pdf, PDF 6 pages créé le 2013-02-21, sha256 `7950e8cd458494d6a9315e12949c64d2597becd68103b3cba7070abf966f2408`, snapshot Wayback 2013-10-08). Il tranche : annonces comptées pour faire le contrat, chevauchement d'annonces autorisé (y compris tierce-belote), matrice des carrés atout / sans atout, SA doublé, marque simple / coinchée / capot, fin à 2000 sans finir sur capot + annonce. Silences du règlement comblés en règle maison, tous paramétrables : enchères au point près 82..160 puis capot ; défense d'un contrat simple réussi = ses points faits + annonces ; surcoinche = 160 + 4 × contrat ; décoinche ouverte à tout joueur à son tour sauf le coincheur.

## 7. Arbitrages (2026-10-14)

1. `coinche-ffb@2` : égalité de totaux = chute (`strictlyMore`), comme le PDF FFB 2015. Révisable si la FFB répond autrement.
2. `coinche-sa-ta-ffb2015@1` : SA/TA exposés comme option de table de la coinche, désactivée par défaut.
3. `concours@1` : partie en 12 donnes (défaut de Belote Rebelote) ; égalité au terme = une donne supplémentaire.
4. `a-trois@1` : schéma proposé adopté tel quel, statut `maison`, validé par playtest avant `canonique`.
5. `stephanoise-marquez@1` : voir §6.5, NO-GO levé sur la base du règlement Marquez retrouvé ; silences comblés en règle maison paramétrable.
