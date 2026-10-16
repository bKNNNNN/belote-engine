# Bible des règles de belote

> Licence : CC BY-SA 4.0, voir `docs/LICENSE-docs`. Vous pouvez copier, adapter et redistribuer ce document, y compris commercialement, à condition de créditer la source et de partager vos modifications sous la même licence. Ce document est la version publique d'un document de conception plus large : les sections 1 (étude de marché), 6 et 7 (décisions de produit) ne sont pas publiées. La numérotation d'origine est gardée parce que le code la cite.

Version de travail du 14 octobre 2026. Document de référence pour un moteur de règles de belote paramétrable.

## 0. À lire d'abord : statut des sources

1. **Il n'existe pas de règlement fédéral unique et consultable.** Wikipédia recense plusieurs associations déclarées sous le nom « Fédération française de belote » (Dax 1999, Bastia 2000, Paris 2010, Nice 2015) et un Championnat de France depuis 2006 ([Wikipédia FR, Belote](https://fr.wikipedia.org/wiki/Belote)). Aucune recherche n'a fait remonter de texte FFB en ligne. Les règlements de concours trouvés sont ceux de clubs et d'associations (Générations Mouvement, mairies). Ils convergent sur un socle commun : pas d'annonces sauf la belote, 20 points, chute à 162 ([règlement FD 33](https://lotetgaronne.generations-mouvement.org/wp-content/uploads/2023/09/Reglement-belote-FD-33-1.pdf), [Mayenne, concours sans annonces 2024](https://mayenne.generations-mouvement.org/wp-content/uploads/2024/04/Belote_reglement_concours_sans_annonces-2024.pdf)).
2. **Conséquence.** Ce document ne prétend pas reproduire « la règle FFB ». Il fixe un **préréglage « Concours »** qui suit le socle des règlements de concours, un **préréglage « Salon »** qui suit l'usage familial décrit par Wikipédia et pagat, et les préréglages des applications dominantes. Chaque divergence devient une option de table.
3. **Fédération de contrée.** Je n'ai trouvé aucune source FFB ou « FFBC » publiant un règlement de contrée. La contrée est donc documentée à partir de Wikipédia FR et des applications.
4. Sources principales : [Wikipédia FR Belote](https://fr.wikipedia.org/wiki/Belote), [Wikipédia FR Belote contrée](https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e), [Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e) (« Belote bridgée » y redirige), [Wikipedia EN Coinche](https://en.wikipedia.org/wiki/Coinche), [pagat Belote](https://www.pagat.com/jass/belote.html), [pagat Coinche](https://www.pagat.com/jass/coinche.html), [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/), [aide Board Game Arena](https://en.doc.boardgamearena.com/Gamehelpbelote), fiches App Store des applications de belote.

---

## 2. Socle commun à toutes les variantes

### 2.1 Paquet, ordre et valeur des cartes (couleur d'atout)

Paquet de 32 cartes : As, Roi, Dame, Valet, 10, 9, 8, 7 dans chaque couleur.

| Carte | Ordre à l'atout | Points à l'atout | Ordre hors atout | Points hors atout |
|---|---|---:|---|---:|
| Valet | 1 | 20 | 5 | 2 |
| 9 | 2 | 14 | 6 | 0 |
| As | 3 | 11 | 1 | 11 |
| 10 | 4 | 10 | 2 | 10 |
| Roi | 5 | 4 | 3 | 4 |
| Dame | 6 | 3 | 4 | 3 |
| 8 | 7 | 0 | 7 | 0 |
| 7 | 8 | 0 | 8 | 0 |

Total : 62 à l'atout + 3 × 30 hors atout = 152, plus 10 de dix de der = **162** ([pagat](https://www.pagat.com/jass/belote.html), [Wikipédia Belote contrée](https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e)).

### 2.2 Sans atout (SA) et tout atout (TA)

Deux conventions de comptage coexistent. Le moteur doit porter les deux.

| Carte | SA réel | SA ramené à 162 | TA réel | TA ramené à 162 (A) | TA ramené à 162 (B) |
|---|---:|---:|---:|---:|---:|
| Valet | 2 | 2 | 20 | 14 | 13 |
| 9 | 0 | 0 | 14 | 9 | 9 |
| As | 11 | **19** | 11 | 6 | 6 |
| 10 | 10 | 10 | 10 | 5 | 5 |
| Roi | 4 | 4 | 4 | 3 | 3 |
| Dame | 3 | 3 | 3 | 1 | 2 |
| 8, 7 | 0 | 0 | 0 | 0 | 0 |
| Par couleur | 30 | 38 | 62 | 38 | 38 |
| Total + dix de der | **120 + 10 = 130** | 152 + 10 = 162 | **248 + 10 = 258** | 162 | 162 |

- Ordre SA : As, 10, Roi, Dame, Valet, 9, 8, 7 dans chaque couleur. Ordre TA : Valet, 9, As, 10, Roi, Dame, 8, 7 dans chaque couleur.
- Tableau TA (A) : [Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e), [Wikipedia EN](https://en.wikipedia.org/wiki/Coinche), [pagat Coinche](https://www.pagat.com/jass/coinche.html). Tableau TA (B) : [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/). Les deux totalisent 38 par couleur ; seule la répartition Valet/Dame change.
- Wikipédia propose aussi un troisième mode : compter en points réels puis multiplier par 152/120 (SA) ou 152/248 (TA). À éviter en ligne, l'arrondi produit des litiges.
- Réglage par défaut proposé : **ramené à 162, tableau A**. C'est la convention de Wikipédia et de pagat, et elle garde l'échelle d'enchères 80 à 160 identique dans toutes les couleurs.
- Le preneur à 258 est l'usage de certaines tables (le « TA 248 + 10 »). Il oblige à une échelle d'enchères propre au TA. Il est exposé en option avancée.
- **Belote en SA** : aucune. **Belote en TA** : une par couleur (Roi + Dame de même couleur), 20 chacune, jusqu'à 80. Certains joueurs comptent la « belote dorée » (quatre Rois + quatre Dames) 100 au lieu de 80 ([Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e)).
- **Carrés en SA** : As 200, 10 150, Roi, Dame, Valet, 9 à 100 ([Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e), [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/)). **Carrés en TA** : barème normal (Valets 200, 9 150).
- **Obligation de monter** : toujours en TA (toutes les couleurs sont atout). Jamais en SA ([pagat Coinche](https://www.pagat.com/jass/coinche.html)).

### 2.3 Obligations de jeu (plis)

Ordre de priorité, par joueur et par pli :

1. **Fournir** la couleur demandée si possible.
2. Si l'atout est demandé : **monter** sur le plus fort atout du pli si possible, sinon fournir un atout plus faible.
3. Sans la couleur demandée :
   - si l'adversaire est maître : **couper** ; si un atout est déjà posé, **surcouper** ; à défaut, **sous-couper** (« pisser » au sens de pagat) ;
   - si le **partenaire est maître** : libre de couper ou de se défausser ([pagat](https://www.pagat.com/jass/belote.html), [Wikipédia](https://fr.wikipedia.org/wiki/Belote)).
4. Sans couleur ni atout : défausse libre.

Options de table nécessaires :

| Option | Valeurs | Source |
|---|---|---|
| `partnerMasterTrump` | `free` (par défaut) / `mustTrump` / `mustOvertrumpOnly` | pagat : variante « on est toujours obligé de pisser » contre « on ne pisse pas sur le partenaire » |
| `undertrumpRequired` | oui (par défaut) / non | pagat |
| `mustOvertrumpInTrumpLead` | oui (par défaut) | universel |
| `playDirection` | antihoraire (traditionnel) / horaire | pagat, BGA |

### 2.4 Annonces

| Annonce | Valeur | Notes |
|---|---:|---|
| Belote-rebelote (Roi + Dame d'atout) | 20 | annoncée en jouant les cartes ; perdue si non annoncée ; jamais annulée par une annonce adverse |
| Tierce (3 cartes qui se suivent) | 20 | « 20 ou 30 selon la variante » sur Wikipédia : option |
| Cinquante / quarte (4) | 50 | |
| Cent / quinte (5 et plus) | 100 | au-delà de 5, compte comme une quinte |
| Carré de Valets | 200 | |
| Carré de 9 | 150 | |
| Carré d'As, 10, Rois, Dames | 100 | |
| Carré de 8 ou de 7 | 0 | |

Sources : [pagat](https://www.pagat.com/jass/belote.html), [Wikipédia](https://fr.wikipedia.org/wiki/Belote), [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/).

Règles de résolution :
- Ordre des suites pour les annonces : As, Roi, Dame, Valet, 10, 9, 8, 7 (ordre « naturel », pas l'ordre de prise).
- Seule l'équipe qui détient **la meilleure annonce** marque **toutes** ses annonces. La belote est hors comparaison.
- Hiérarchie : carré > suite ; plus de points > moins ; plus haute carte > plus basse ; à égalité, la suite d'atout l'emporte ; à égalité hors atout, premier annonceur dans l'ordre de jeu (pagat) ou annulation (variante pagat Coinche).
- Une carte ne sert qu'à une annonce, sauf pour la belote.
- Moment : on annonce en jouant sa première carte, on montre au deuxième pli. Une annonce qu'on ne peut pas montrer est une « renonce » : ses points vont à l'adversaire ([regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/)).
- Options régionales : carré d'As 110 et carré de 9 140 ; carré de 8 qui annule les autres annonces ; carré de 7 qui annule la donne ([Wikipédia](https://fr.wikipedia.org/wiki/Belote)). Exposées en options « folkloriques », désactivées par défaut.

---

## 3. Fiches variantes

### 3.1 Belote classique (dite « à la retourne »), 4 joueurs

- **Joueurs** : 4, deux équipes, partenaires face à face.
- **Paquet** : 32 cartes. Pas de mélange entre les donnes, on coupe seulement (pagat). En ligne : option `shuffleBetweenDeals`.
- **Distribution** : 3 puis 2 cartes (ou 2 puis 3) à chacun, en commençant à droite du donneur ; la carte suivante est retournée (la « retourne »).
- **Prise** :
  - 1er tour : chacun, à partir de la droite du donneur, prend à la couleur de la retourne ou passe.
  - 2e tour : chacun peut nommer une autre couleur ou passer (« deux »).
  - Tout le monde passe deux fois : on redonne (donneur suivant).
  - Le preneur reçoit la retourne + 2 cartes, les autres 3 ([Wikipédia](https://fr.wikipedia.org/wiki/Belote), [pagat](https://www.pagat.com/jass/belote.html)).
- **Entame** : joueur à droite du donneur.
- **Annonces** : section 2.4. Préréglage Concours : belote seule. Préréglage Salon : toutes annonces.
- **Décompte** :
  - Chaque équipe compte ses plis + dix de der + ses annonces si elle a la meilleure + belote.
  - **Contrat rempli** : les preneurs ont strictement plus que les défenseurs (82 sur 162 sans annonces). Chacun marque ses points.
  - **Dedans (chute)** : les preneurs marquent 0 (sauf belote, selon l'option `beloteKeptOnFail`). Les défenseurs marquent 162 + toutes les annonces des deux camps.
  - **Litige** (égalité, 81-81 sans annonces) : la défense marque ses points, ceux des preneurs restent « en suspens » et vont au gagnant de la donne suivante ([Wikipédia](https://fr.wikipedia.org/wiki/Belote), [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/)). Variantes pagat : égalité au profit de la défense, ou égalité qui suffit aux preneurs.
  - **Capot** (8 plis) : le dix de der vaut 100, donc 252 (Wikipédia : 252 ou 272 avec belote ; certaines tables 250 ou 270 pour un capot non annoncé). L'équipe capotée perd ses annonces, sauf la belote. Si les preneurs font capot, les annonces adverses leur reviennent ([regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/)).
  - **Arrondi** : au point près, à 5 ou à 10 (pagat).
- **Fin de partie** : 1000 points (« 1001 » ou « 1010 » si arrondi). Égalité au-delà de la cible : donne supplémentaire, ou victoire de l'équipe qui a gagné la dernière donne. Variante vendéenne : 12 donnes, plus gros total gagne ([Wikipédia](https://fr.wikipedia.org/wiki/Belote)). BGA propose 500 (demi-partie) et donne unique.
- **Options régionales documentées** :
  - **Valet forcé** (usage belge) : si la retourne est un Valet, le premier à parler doit prendre ([Wikipédia](https://fr.wikipedia.org/wiki/Belote), Belote Rebelote).
  - **À la vache** : si tout le monde passe au 2e tour, le donneur doit prendre (mêmes sources).
  - **Main nulle** : un joueur avec moins de 11 points et sans atout peut faire annuler la donne (Wikipédia).
  - **Arrêt** : après un pli, un joueur peut arrêter la partie s'il estime avoir atteint la cible ; s'il se trompe, l'adversaire gagne (pagat).
  - **Roi d'abord** pour la belote (pagat).
  - **Tierce à 30** (Wikipédia).

### 3.2 Belote moderne (classique + surenchère SA/TA)

Le terme désigne deux choses selon les sources. Wikipédia l'applique à la belote à 3 avec « sans » et « tout ». regles-du-jeu.net décrit la même mécanique à 4 joueurs sous le nom « variante Sans Atout / Tout Atout ». Le moteur traite ces deux cas avec un seul paramètre.

- Prise comme en classique, mais le tour **ne s'arrête plus** à la première prise.
- Une prise à la couleur peut être surenchérie en SA ou en TA, une prise en SA par une prise en TA. TA ne peut plus être couvert. On peut surenchérir sur son partenaire, pas sur soi-même.
- Fin des enchères : une prise suivie de trois « passe » ([regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/)).
- Ordre complet des « montées » selon Wikipédia : trèfle < carreau < cœur < pique < sans atout < tout atout.
- Valeurs : section 2.2. Décompte : identique à la classique.

### 3.3 Coinche (belote coinchée, belote bridgée)

« Belote bridgée » redirige vers « Coinche » sur Wikipédia FR. Un seul mode, avec un nom affiché « Coinche » et les synonymes en sous-titre pour le référencement.

- **Joueurs** : 4, deux équipes.
- **Distribution** : les 8 cartes avant les enchères, par 3-3-2 ou 2-3-3 (pagat) ou 3-2-3. Pas de retourne.
- **Enchères** :
  - Un tour qui continue jusqu'à 3 « passe » consécutifs après une enchère. Un joueur qui a passé peut reparler.
  - Enchère = valeur + couleur. Couleurs : ♣, ♦, ♥, ♠, SA, TA.
  - **Paliers** : 80 minimum, par 10, jusqu'à 160 ; puis **capot** (250) ; puis éventuellement **générale** (un seul joueur fait les 8 plis) ([Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e), [pagat Coinche](https://www.pagat.com/jass/coinche.html)).
  - Variantes : montée par 5 ; plafond 160 ; 180 (« 160 + belote ») avant capot ([règle Stay and Play](https://stayandplay.cards/wp-content/uploads/2020/03/Rules_Coinche.pdf)) ; hiérarchie de couleurs pagat où « 100 ♣ bat 90 SA qui bat 90 ♥ ».
  - Tous passent : on redonne.
- **Coinche et surcoinche** :
  - Un adversaire du dernier enchérisseur dit « coinche » : ×2. L'équipe preneuse peut répondre « surcoinche » : ×4.
  - Version de base : la coinche ferme les enchères (sauf la surcoinche).
  - Variantes : coinche « à la volée » (hors tour) ou seulement à son tour ; coinche qui ne ferme pas les enchères ; 80 non coinchable ; capot et générale non coinchables ([pagat Coinche](https://www.pagat.com/jass/coinche.html), [Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e)).
- **Jeu** : obligations de la section 2.3. Pour la générale, l'annonceur peut entamer (option).
- **Annonces** : celles de la section 2.4, déclarées au premier pli. Tout le reste est une option, et les sources se contredisent :
  - annonces qui aident le preneur à remplir son contrat ou non (Wikipédia FR : elles « ne servent pas à faire chuter », mais la section Variantes cite les deux usages) ;
  - annonces désactivées (y compris la belote chez certaines tables, pagat).
- **Belote** : 20, annoncée par l'équipe qui la détient. Variantes : seule l'équipe preneuse peut l'annoncer ; elle passe à la défense quand le contrat chute (pagat).
- **Décompte « points faits »** (défaut Wikipédia FR et pagat) :
  - Le contrat est rempli si les preneurs atteignent la valeur annoncée **et** font plus que la défense.
  - Rempli : preneurs = points faits arrondis à la dizaine + contrat. Défense = ses points faits.
  - Chute : preneurs = 0 (+ belote). Défense = 160 + contrat.
  - Capot annoncé et fait : 500 (250 + 250). Capot annoncé et chuté : 500 à la défense. Capot fait sans l'avoir annoncé : 250 + contrat.
  - Générale : 800 sur Wikipédia (400 + 400) ; ailleurs 350, 500, 700 ou 1000. Paramètre libre.
  - Coinche : Wikipédia FR double « les points du gagnant » et la défense ne marque rien hors belote. pagat ne double que la valeur du contrat (exemple pagat : 100 coinché, chuté avec belote, donne 20 aux preneurs et 360 à la défense = 160 + 2 × 100). Variante pagat : surcoinche ×3 au lieu de ×4. **Trois paramètres** : `coincheScope` (`contract` / `wholeScore`), `coincheMultiplier` (2), `surcoincheMultiplier` (4 ou 3).
  - Arrondi à la dizaine, 5 arrondi au-dessus.
  - Variante « +2 » : il faut faire contrat + 2 (112 pour 110) (pagat).
- **Décompte « points annoncés »** : seule la valeur du contrat est marquée (par les preneurs s'ils réussissent, par la défense s'ils chutent) ([Wikipédia Belote contrée](https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e)). Partie habituelle : 1000.
- **Fin de partie** : 2000 (pagat), 3000 (Wikipédia FR), 1000 ou 1500 sans annonces (pagat), 701 sur certains sites (Stay and Play). Défaut proposé : **2000 en points faits, 1000 en points annoncés**.
- **Options supplémentaires** : misère (main de moins de 10 ou 11 points annonçable) ; carré de 7 qui annule la donne ; un joueur ne parle que deux fois ; on ne peut se surenchérir qu'en changeant de couleur (toutes sur Wikipédia FR Coinche).

### 3.4 Belote contrée

- Même moteur que la coinche, vocabulaire « contre » / « surcontre ».
- Différences documentées par [Wikipédia FR Belote contrée](https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e) :
  - **ni sans atout ni tout atout** ;
  - enchères de 80 à 160 par 10, puis capot, pas d'enchère au-dessus du capot ;
  - contre ×2 et surcontre ×4 sur les points de l'équipe gagnante. Le contre fige les enchères ; seuls les preneurs peuvent encore surcontrer ;
  - contre « à la volée » souvent interdit en compétition ;
  - deux méthodes de décompte : points faits (contrat + points faits, arrondis) ou points annoncés. Partie à 3000 en points faits, 1000 « la plupart du temps » en points annoncés ;
  - capot : 250 ; capot fait = 500 ; capot chuté = 410 à la défense (Wikipédia) ;
  - option du Sud : un joueur avec 10 points ou moins peut demander une redonne ;
  - deux conventions d'annonces de jeu (« petit jeu » ou « aux as ») sont citées comme usage, sans valeur réglementaire.
- **Écart avec la demande du brief.** Le brief parle de « contrée avec SA/TA ». Wikipédia exclut SA/TA de la contrée. Belote.com et Belote Rebelote séparent Coinche et Contrée en deux modes. Recommandation : préréglage « Contrée » = coinche **sans SA/TA**, **belote seule**, **points annoncés**, contre en tour ; SA/TA disponibles en option pour les tables qui le veulent.

### 3.5 Coinche stéphanoise (« beloinche »)

- 6 cartes distribuées, enchères, puis 2 cartes de plus. On enchérit sans connaître ses deux dernières cartes.
- Pas de tout atout.
- Sources : [Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e), [Wikipedia EN](https://en.wikipedia.org/wiki/Coinche) (« Saint-Étienne variant »), option « à la stéphanoise » de [Belote Rebelote](https://apps.apple.com/us/app/belote-rebelote/id842742355?l=fr-FR). Le Wiktionnaire signale aussi la « coinche stéphanoise » en Rhône-Alpes.
- Paramètres : `dealPattern = [6 | bidding | 2]`, `allowAllTrump = false`.

### 3.6 Belote à 3

Source principale : [Wikipédia FR Belote](https://fr.wikipedia.org/wiki/Belote).

- **Joueurs** : 3, sans équipe fixe. Le preneur joue seul contre les deux autres.
- **Paquets et distributions documentées** :
  - 3 × 8 : on retire les 7 et les 8 (24 cartes) ;
  - 3 × 10 : on retire deux 7 (30 cartes) ;
  - 6 + 3 cartes : 3 puis 3 cartes, retourne, prise comme en classique, puis 3 de plus (9 chacun). Si le preneur prend à la couleur de la retourne, il ne la ramasse pas, sauf s'il échange le 7 d'atout contre elle. Le donneur garde 4 cartes, retourne la dernière (« la bergère ») et laisse 3 cartes cachées ;
  - talon de 8 cartes utilisé selon les conventions ([regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/), non détaillé).
- **Variante moderne** : après le choix de la couleur, chaque joueur peut monter en « sans » ou en « tout ».
- **Décompte** :
  - Le preneur doit battre **chacun** de ses adversaires, sans seuil de 81.
  - Un adversaire qui fait plus que lui le met « dedans » : cet adversaire marque ses points et ceux du preneur, le troisième garde les siens.
  - Un joueur sans pli est « capot » : ses deux adversaires se partagent 100 points de bonus (50 chacun), le dix de der est annulé.
- **Point d'attention** : les adversaires du preneur jouent ensemble pendant la donne mais marquent séparément. Les obligations « partenaire maître » s'appliquent donc à un partenaire temporaire. Il faut un paramètre `teamMode = takerVsRest`.
- **Recommandation** : livrer la distribution 3 × 10 (30 cartes) par défaut. Elle garde le plus de cartes en jeu et le moins de talon à expliquer. 3 × 8 et 6 + 3 en options. Classer cette variante « jeu traditionnel, règles régionales » dans l'interface, vu la faiblesse des sources.

### 3.7 Belote à 2

Trois formes documentées, toutes avec des cartes de table qui jouent le rôle du partenaire absent.

| Forme | Main | Table par joueur | Source |
|---|---|---|---|
| Découverte | 6 | 10 en deux rangées de 5 (cachées dessous, visibles dessus) | [Wikipédia](https://fr.wikipedia.org/wiki/Belote) |
| Bis | 8 | 8 en deux rangées de 4 (« deux tas de 8 ») | [Wikipédia](https://fr.wikipedia.org/wiki/Belote) |
| Simple | 8 | 8 en deux rangées, une visible | [regles-du-jeu.net](https://www.regles-du-jeu.net/regles-de-la-belote/) ; version courte sans 7 ni 8 |

- **Découverte (Wikipédia)** :
  - Main par 3 et 2 en commençant par l'adversaire, puis 5 cartes de table cachées par joueur, puis une retourne qui permet au non-donneur de « parler ».
  - Le joueur qui ne prend pas reçoit une carte de plus.
  - On pose enfin 5 cartes visibles par-dessus. Une carte visible se joue comme une carte de main. Quand elle part, la carte cachée dessous se retourne.
- **pagat (« Belote découverte »)** : 4 colonnes cachées couvertes de 4 visibles. La dernière carte posée côté donneur fixe la couleur proposée, sans que le preneur la ramasse. 16 plis. **Ni annonces ni belote**. Le preneur chute à 81 ou moins. Variantes pagat : retourner tout de suite la carte cachée libérée ; SA, TA et coinche adaptables ([pagat](https://www.pagat.com/jass/belote.html)).
- **Recommandation** : forme « Bis » par défaut (8 en main + 8 en table, 16 plis), prise classique à la retourne, belote comptée, autres annonces en option. 1 contre 1 se prête au jeu asynchrone.

### 3.8 Belote de comptoir (2 à 6 joueurs)

- Jeu à part, sans équipes, avec un barème d'enchères fixe : sous 51 points = 1 ; de 51 à 70 (« Banco ») = 2 ; de 71 à 90 (« super Banco ») = 3. Scores de départ 6 ou 12. 5 cartes chacun en général. Variante lyonnaise avec chien ([Wikipédia](https://fr.wikipedia.org/wiki/Belote), [PDF Polo](https://polo.legtux.org/PluXml/data/medias/jeux/belote-de-comptoir.pdf)).
- C'est le seul format documenté de 5 ou 6 joueurs. Il partage les cartes et leur valeur, mais ni la structure d'équipe, ni le décompte, ni la fin de partie. **À traiter comme un jeu séparé**, pas comme un préréglage du moteur principal.

### 3.9 Belote à 5 et à 6

Aucune règle publiée trouvée (Wikipédia, pagat, regles-du-jeu.net, recherches ciblées). 30 et 70 recherches par mois. **Ne pas livrer.** Pour accueillir 5 ou 6 amis, proposer la belote de comptoir ou des tables de 4 avec rotation.

### 3.10 Coinche inversée (Cavaillon)

Enchères identiques, ordre inversé : à l'atout 7 = 20, 8 = 14, Dame 11, Roi 10, 10 = 4, As 3, 9 et Valet 0 ([Wikipédia FR Coinche](https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e)). Une seule source. Intéressante comme défi, pas comme mode classé.

---

## 4. Où les sources et les apps divergent

| Point | Usage concours / Wikipédia | pagat | Apps |
|---|---|---|---|
| Annonces en classique | concours : belote seule | toutes, belote seule en tournoi | option chez Belote Rebelote ; Belote.com sépare « Belote » et « Belote avec annonces » |
| Capot classique | 252 (ou 250 non annoncé) | 252, annonces perdues sauf belote | non vérifié |
| Égalité classique | litige, points en suspens | égalité = défense, ou en suspens | non vérifié |
| Cible classique | 1000 / 1001 / 1010 ; 12 donnes en Vendée | 1000 | 1000 ou 12 donnes (Belote Rebelote) ; 1000 / 500 / 1 donne (BGA) |
| Coinche × | points du gagnant ×2 / ×4 | contrat seul ×2 / ×4, variante ×3 | non vérifié |
| Cible coinche | 3000 | 2000 | 701 (Stay and Play) |
| SA / TA en contrée | exclus | n/a | séparés par mode |
| Valeurs TA | J14 9 A6 10:5 K3 Q1 | idem | J13 … Q2 sur regles-du-jeu.net |
| Partenaire maître | libre de couper | libre ; variante « toujours pisser » | option à vérifier en jeu |

Les fiches App Store ne détaillent pas les barèmes. Avant figement, il faut jouer 20 donnes sur Belote.com et Belote Rebelote et noter les réglages réels. **Action à prévoir, non faite ici.**

---

## 5. Modèle de règles paramétrique (un seul moteur)

Principe : une variante = un **préréglage** (objet de paramètres immuable). Une table = préréglage + surcharges autorisées. Le moteur ne connaît que les paramètres, jamais le nom des variantes.

### 5.1 Paramètres

```ts
type RulesConfig = {
  // Table
  players: 2 | 3 | 4;
  teamMode: "fixedPairs" | "takerVsRest" | "solo";
  playDirection: "counterclockwise" | "clockwise";
  dummyLayout: null | { handSize: number; tableColumns: number; layers: 2; revealOnFree: "immediate" | "nextTrick" }; // belote à 2

  // Paquet et donne
  deck: { removed: Card[] };                        // 32 par défaut ; [7♠,7♣] pour 3 × 10 ; 7 et 8 pour 3 × 8
  dealPattern: DealStep[];                          // ex. [3,2,"turnup","take",3|2] ; [3,3,2,"bid"] ; [6,"bid",2]
  shuffleBetweenDeals: boolean;
  redealOnWeakHand: null | { maxPoints: number; requireNoTrump: boolean };

  // Choix de l'atout
  trumpSelection:
    | { kind: "turnup"; rounds: 2; secondRoundAnySuit: true;
        overbid: null | ("SA" | "TA")[];             // belote moderne
        forcedJackTurnup: boolean;                  // valet forcé
        dealerForcedIfAllPass: boolean;             // à la vache
        takerGetsTurnup: "always" | "exchangeSevenOnly" }
    | { kind: "auction";
        min: number; step: number; max: number;     // 80 / 10 / 160
        aboveMax: ("capot" | "generale")[];
        suitOrderBreaksTies: boolean;               // hiérarchie pagat
        denominations: ("suit" | "SA" | "TA")[];
        doubling: { enabled: boolean; names: ["coinche","surcoinche"] | ["contre","surcontre"];
                    outOfTurn: boolean; closesBidding: boolean;
                    minBidDoublable: number; capotDoublable: boolean };
        maxSpeechesPerPlayer: number | null;
        misereAllowed: boolean };

  // Valeurs et ordres
  cardTables: { trump: Table; plain: Table; noTrump: Table; allTrump: Table };
  allTrumpScale: "scaled162A" | "scaled162B" | "raw258";
  noTrumpScale: "scaled162" | "raw130";
  lastTrickBonus: 10;
  rankOrderInverted: boolean;                       // Cavaillon

  // Obligations de jeu
  mustFollow: true;
  mustOvertrumpOnTrumpLead: boolean;
  mustTrumpWhenOpponentMaster: boolean;
  partnerMasterTrump: "free" | "mustTrump" | "mustOvertrumpOnly";
  undertrumpRequired: boolean;
  allTrumpAlwaysOvertake: boolean;

  // Annonces
  belote: { enabled: boolean; value: 20; whoMayDeclare: "anyone" | "takingTeam";
            kingFirst: boolean; goesToDefenseOnFail: boolean; multiInAllTrump: boolean; goldenBelote: number | null };
  declarations: null | { tierce: 20 | 30; quarte: 50; quinte: 100;
                         carres: Record<Rank, number>;           // dont barème SA
                         eightsCancelOthers: boolean; sevensCancelDeal: boolean;
                         tieBreak: "firstInOrder" | "cancel";
                         countTowardContract: boolean };

  // Décompte
  contractRule: "beatDefense" | "reachBid" | "reachBidAndBeatDefense" | "beatEachOpponent";
  bidMargin: 0 | 2;                                 // variante « +2 »
  scoringMode: "pointsFaits" | "pointsAnnonces" | "classicSplit";
  failPayout: { defenseGets: "162" | "160PlusBid" | "bidOnly"; takerKeepsBelote: boolean };
  tieRule: "litigeCarryOver" | "defenseWins" | "takerWins";
  capot: { unannounced: number; announcedMade: number; announcedFailed: number; losesDeclarations: boolean };
  generale: null | { value: number; declarerLeads: boolean };
  doublingScope: "contract" | "wholeScore";
  doublingMultipliers: [2, 4] | [2, 3];
  rounding: 1 | 5 | 10;

  // Fin de partie
  end: { kind: "target"; points: number; tieBreak: "extraDeal" | "lastDealWinner" | "draw" }
     | { kind: "deals"; count: number }
     | { kind: "single" };
  bestOf: 1 | 3;
  arretAllowed: boolean;
};
```

Les deux familles « retourne » et « enchères » partagent tout sauf `trumpSelection`, et la belote moderne fait le pont (`overbid`). Belote à 2 et à 3 ne changent que `players`, `teamMode`, `deck`, `dealPattern`, `dummyLayout` et `contractRule`. Le reste du moteur ne bouge pas.

### 5.2 Préréglages livrés

| Préréglage | Clés qui le distinguent |
|---|---|
| Classique · Concours | `turnup`, annonces = belote seule, `beatDefense`, litige, capot 252, cible 1000 |
| Classique · Salon | idem + annonces complètes (tierce 20) |
| Classique · Moderne | `overbid: ["SA","TA"]`, échelles ramenées à 162 |
| Coinche | `auction` 80/10/160 + capot + générale, SA/TA, annonces, points faits, `doublingScope: contract`, cible 2000 |
| Coinche · Bistrot | coinche hors tour, annonces qui comptent pour le contrat, générale 500, cible 1000 |
| Coinche · Stéphanoise | `dealPattern [6,"bid",2]`, pas de TA |
| Contrée | `auction` sans SA/TA, belote seule, points annoncés, contre en tour, capot chuté 410, cible 1000 |
| Belote à 3 | `players 3`, `takerVsRest`, paquet 30, `beatEachOpponent`, capot 50 + 50 |
| Belote à 2 | `players 2`, `dummyLayout` 8 + 8, 16 plis |
| Défi Cavaillon (hors parties classées) | `rankOrderInverted` |

### 5.3 Règles d'implémentation

- Un préréglage classé ne se modifie pas. Les tables privées peuvent tout surcharger. Le résumé des surcharges s'affiche à l'entrée de la table, sous forme de pastilles lisibles (« Partenaire maître : obligé de couper »).
- Chaque option a un libellé régional (« à la vache », « valet forcé ») et une phrase d'aide.
- Tests : une donne de référence par préréglage, avec score attendu ligne à ligne, recopiée des exemples chiffrés de pagat (coinche 100 coinchée, chutée avec belote = 20 / 360) et de Wikipédia (belote à 3).
