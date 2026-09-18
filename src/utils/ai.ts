import { AIDifficulty, AIStrategy, Card, PlayedCard, Player, Suit, Trick } from '../types';
import { determineTrickWinner, getPlayableCards } from './deck';

export interface BotProfile {
  name: string;
  avatarSeed: string;
}

export const ALL_BOT_PROFILES: BotProfile[] = [
  { name: "Thom's Kora", avatarSeed: 'thoms_kora' },
  { name: 'Don WizeMan', avatarSeed: 'don_wizeman' },
  { name: 'Kora Boy Malo', avatarSeed: 'kora_boy_malo' },
  { name: 'Zing Efoulan', avatarSeed: 'zing_efoulan' },
  { name: 'Black Bozar', avatarSeed: 'black_bozar' },
  { name: 'SystemTchakap', avatarSeed: 'systemtchakap' },
  { name: 'Zing Mignon', avatarSeed: 'zing_mignon' },
  { name: 'Vie2Poulet', avatarSeed: 'vie2poulet' },
  { name: 'Kora Malox', avatarSeed: 'kora_malox' },
  { name: 'Robam Hokuto', avatarSeed: 'robam_hokuto' },
];

export interface BotTimingConfig {
  botThinkTimeMs: number;
  hokutoSpawnRatePct: number;
}

export interface BotDialogueConfig {
  botEmoteCooldownSeconds: number;
  botMaxEmotesPerRound: number;
  botEmoteHokutoRatePct: number;
  botEmoteMbapRatePct: number;
  botEmoteLeadDiscardRatePct: number;
  botEmoteCriticalBypassLimit: boolean;
}

let activeBotConfig: BotTimingConfig = {
  botThinkTimeMs: 800,
  hokutoSpawnRatePct: 75,
};

let activeBotDialogueConfig: BotDialogueConfig = {
  botEmoteCooldownSeconds: 7,
  botMaxEmotesPerRound: 2,
  botEmoteHokutoRatePct: 28,
  botEmoteMbapRatePct: 25,
  botEmoteLeadDiscardRatePct: 10,
  botEmoteCriticalBypassLimit: true,
};

export function setBotTimingConfig(config: Partial<BotTimingConfig>) {
  activeBotConfig = { ...activeBotConfig, ...config };
}

export function getBotTimingConfig(): BotTimingConfig {
  return { ...activeBotConfig };
}

export function setBotDialogueConfig(config: Partial<BotDialogueConfig>) {
  activeBotDialogueConfig = { ...activeBotDialogueConfig, ...config };
}

export function getBotDialogueConfig(): BotDialogueConfig {
  return { ...activeBotDialogueConfig };
}

export function getBotThinkDelay(customSpeedMultiplier: number = 1): number {
  return Math.max(200, Math.round(activeBotConfig.botThinkTimeMs * customSpeedMultiplier));
}

/**
 * Returns a random sample of `count` distinct bot profiles from the available pool.
 * "Robam Hokuto" priority appearance is governed dynamically by `hokutoSpawnRatePct` (default from Katika config).
 */
export function getRandomBotProfiles(count: number = 3, hokutoSpawnRatePct?: number): BotProfile[] {
  const effectiveHokutoRate = typeof hokutoSpawnRatePct === 'number' ? hokutoSpawnRatePct : activeBotConfig.hokutoSpawnRatePct;
  const safeCount = Math.max(1, Math.min(count, ALL_BOT_PROFILES.length));
  const robamProfile = ALL_BOT_PROFILES.find((p) => p.name === 'Robam Hokuto');
  const otherProfiles = ALL_BOT_PROFILES.filter((p) => p.name !== 'Robam Hokuto');

  // Use dynamic probability to force-include Robam Hokuto (0 to 1)
  const spawnProbability = Math.max(0, Math.min(100, effectiveHokutoRate)) / 100;
  const includeRobam = robamProfile && Math.random() < spawnProbability;

  let selected: BotProfile[] = [];

  if (includeRobam && robamProfile) {
    selected.push(robamProfile);
    const shuffledOthers = [...otherProfiles].sort(() => Math.random() - 0.5);
    selected.push(...shuffledOthers.slice(0, safeCount - 1));
  } else {
    const shuffledAll = [...ALL_BOT_PROFILES].sort(() => Math.random() - 0.5);
    selected = shuffledAll.slice(0, safeCount);
  }

  // Shuffle selected array so Robam Hokuto isn't always in the first bot position
  return selected.sort(() => Math.random() - 0.5);
}

export const STANDARD_BOT_STRATEGIES: AIStrategy[] = [
  'CONSERVATIVE',
  'TRICK_4_CONTROL',
  'PURGER',
  'AGGRESSIVE_LEADER',
  'DYNAMIC',
  'CARD_COUNTER',
  'BLUFFER',
  'GATEKEEPER',
  'POSITIONAL_MASTER',
];

export const ALL_BOT_STRATEGIES: AIStrategy[] = [
  ...STANDARD_BOT_STRATEGIES,
  'KORA_HUNTER',
  'HOKUTO_ADAPTIVE',
];

/**
 * -------------------------------------------------------------
 * ROBAM HOKUTO ADAPTIVE ENGINE (Opponent Profile & Memory)
 * -------------------------------------------------------------
 * Tracks human play patterns across rounds/manches:
 * - Early Aggression: Playing 10s or cards >= 8 on Trick 1 & 2
 * - Late Hoarding: Saving 10s or dynamic bosses for Trick 4 & 5
 * - Kora Tendency: Attempting to sweep early tricks
 * - Folding Habits: Folding on bad hands
 */
export interface HumanProfile {
  totalPlays: number;
  earlyAggressionPlays: number;
  lateHoardingPlays: number;
  koraAttempts: number;
  roundsObserved: number;
  style: 'EARLY_AGGRESSIVE' | 'LATE_HOARDER' | 'KORA_HUNTER' | 'BALANCED';
}

const globalHumanProfile: HumanProfile = {
  totalPlays: 0,
  earlyAggressionPlays: 0,
  lateHoardingPlays: 0,
  koraAttempts: 0,
  roundsObserved: 0,
  style: 'BALANCED',
};

export function getHumanProfile(): HumanProfile {
  return globalHumanProfile;
}

export function updateHumanProfileFromGame(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = [],
  players: Player[] = []
): HumanProfile {
  const humanPlayer = players.find((p) => p.isHuman);
  if (!humanPlayer) return globalHumanProfile;

  const humanIndex = players.findIndex((p) => p.id === humanPlayer.id);
  if (humanIndex === -1) return globalHumanProfile;

  let earlyAgg = 0;
  let lateHoard = 0;
  let totalCards = 0;

  const allPlaysSoFar = [
    ...tricksHistory.flatMap((t) => t.plays || []),
    ...currentPlays,
  ];

  allPlaysSoFar.forEach((p) => {
    if (p.playerIndex === humanIndex) {
      totalCards++;
      const foundTrick = tricksHistory.find((t) => (t.plays || []).includes(p));
      const trickNo = foundTrick ? foundTrick.trickNumber : (tricksHistory.length + 1);

      if (trickNo <= 2 && p.card.value >= 8) {
        earlyAgg++;
      } else if (trickNo >= 4 && p.card.value >= 8) {
        lateHoard++;
      }
    }
  });

  if (totalCards > 0) {
    globalHumanProfile.totalPlays += totalCards;
    globalHumanProfile.earlyAggressionPlays += earlyAgg;
    globalHumanProfile.lateHoardingPlays += lateHoard;

    const earlyRate = globalHumanProfile.earlyAggressionPlays / Math.max(1, globalHumanProfile.totalPlays);
    const lateRate = globalHumanProfile.lateHoardingPlays / Math.max(1, globalHumanProfile.totalPlays);

    if (humanPlayer.tricksWonInRound >= 2) {
      globalHumanProfile.koraAttempts++;
    }

    if (earlyRate > 0.35) {
      globalHumanProfile.style = 'EARLY_AGGRESSIVE';
    } else if (lateRate > 0.35) {
      globalHumanProfile.style = 'LATE_HOARDER';
    } else if (globalHumanProfile.koraAttempts >= 2) {
      globalHumanProfile.style = 'KORA_HUNTER';
    } else {
      globalHumanProfile.style = 'BALANCED';
    }
  }

  return globalHumanProfile;
}

/**
 * Checks if a hand has high potential to win all 5 tricks (Kora or Double Kora).
 */
export function hasKoraPotential(hand: Card[]): boolean {
  if (!hand || hand.length === 0) return false;

  const topCardsCount = hand.filter(
    (c) => c.value === 10 || (c.suit === 'PIQUE' && c.value === 9)
  ).length;

  const avgValue = hand.reduce((sum, c) => sum + c.value, 0) / hand.length;

  // 3+ top cards (10s or 9♠) OR 2 top cards with overall very strong hand (avg >= 8.2)
  if (topCardsCount >= 3) return true;
  if (topCardsCount >= 2 && avgValue >= 8.2) return true;

  return false;
}

/**
 * Checks if a bot with an atrocious hand in a 3 or 4-player game should tactically fold.
 */
export function shouldBotFoldRound(
  hand: Card[],
  trickNumber: number,
  activePlayersCount: number,
  personality: AIStrategy = 'CONSERVATIVE',
  difficulty: AIDifficulty = 'NORMAL'
): boolean {
  // Only consider folding in multiway pots (3 or 4 active players) during Trick 1
  if (activePlayersCount < 3 || trickNumber !== 1 || !hand || hand.length < 5) {
    return false;
  }

  // Easy AI rarely folds
  if (difficulty === 'EASY') return false;

  // Grand Katika folds strictly based on mathematical expected value in 3-4 player tables
  if (difficulty === 'GRAND_MASTER') {
    const maxVal = Math.max(...hand.map((c) => c.value), 0);
    const avgVal = hand.reduce((sum, c) => sum + c.value, 0) / hand.length;
    const hasAnyHighCard = hand.some((c) => c.value >= 8);
    const isCatastrophic = !hasAnyHighCard && maxVal <= 6 && avgVal <= 4.4;
    return isCatastrophic && Math.random() < 0.25;
  }

  const maxVal = Math.max(...hand.map((c) => c.value), 0);
  const avgVal = hand.reduce((sum, c) => sum + c.value, 0) / hand.length;
  const hasAnyHighCard = hand.some((c) => c.value >= 8);

  // Catastrophic hand criteria: No cards >= 8, max card <= 6 (or 7 with very low average <= 4.6)
  const isCatastrophicHand = !hasAnyHighCard && (maxVal <= 6 || (maxVal === 7 && avgVal <= 4.6));

  if (!isCatastrophicHand) {
    return false;
  }

  // Fold probabilities by personality
  if (personality === 'CONSERVATIVE' || personality === 'GATEKEEPER') {
    return Math.random() < 0.35; // 35% chance to fold a truly hopeless hand
  } else if (personality === 'PURGER' || personality === 'DYNAMIC') {
    return Math.random() < 0.20;
  } else if (personality === 'BLUFFER' || personality === 'KORA_HUNTER' || personality === 'AGGRESSIVE_LEADER') {
    return false; // Aggressive / bluffer bots never fold early!
  }

  return Math.random() < 0.15;
}

export function getBotFoldReaction(): BotCommentResult {
  const foldEmotes: BotCommentResult[] = [
    { text: 'Les cartes-ci sont trop vilaines, je me couche !', emoji: '🏳️' },
    { text: 'Pas de patronne, rien du tout... Je passe cette fois !', emoji: '🎴' },
    { text: 'Battez-vous seulement entre vous, je vous regarde !', emoji: '👀' },
    { text: 'Je garde mes jetons pour la donne suivante !', emoji: '🧘' },
    { text: 'Trop faible pour rivaliser, je me couche.', emoji: '✋' },
  ];
  return foldEmotes[Math.floor(Math.random() * foldEmotes.length)];
}

/**
 * Returns a random AI strategy from the standard pool of archetypes (excluding Kora Hunter by default).
 */
export function getRandomBotStrategy(allowKoraHunter: boolean = false): AIStrategy {
  const pool = allowKoraHunter ? ALL_BOT_STRATEGIES : STANDARD_BOT_STRATEGIES;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

/**
 * Checks if a bot can mathematically and tactically still make a Kora / Double Kora in this round.
 */
export function canBotAchieveKora(
  player: Player,
  trickNumber: number
): boolean {
  if (player.isHuman || player.isEliminated || !player.hand || player.hand.length === 0) {
    return false;
  }

  // If the bot lost any previous trick in this round, Kora is strictly impossible
  const hasWonAllPreviousTricks = player.tricksWonInRound === (trickNumber - 1);
  if (!hasWonAllPreviousTricks) {
    return false;
  }

  // At trick 1, needs strong initial Kora potential hand
  if (trickNumber === 1) {
    return hasKoraPotential(player.hand);
  }

  // Mid-round (trick 2 to 5): Has won all previous tricks AND has high-value cards remaining
  const hasHighCard = player.hand.some((c) => c.value >= 9);
  return hasHighCard || hasKoraPotential(player.hand);
}

/**
 * Resolves dynamic strategy into a concrete operational strategy based on hand composition & game state.
 */
export function resolveDynamicStrategy(hand: Card[]): AIStrategy {
  if (hasKoraPotential(hand)) {
    return 'KORA_HUNTER';
  }

  const topCardsCount = hand.filter(
    (c) => c.value === 10 || (c.suit === 'PIQUE' && c.value === 9)
  ).length;

  if (topCardsCount >= 2) {
    return 'TRICK_4_CONTROL';
  }

  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  const hasWeakSingleton = hand.some(
    (c) => suitCounts[c.suit] === 1 && c.value <= 6
  );

  if (hasWeakSingleton) {
    return 'PURGER';
  }

  const avgValue =
    hand.reduce((sum, c) => sum + c.value, 0) / (hand.length || 1);
  if (avgValue >= 7.5) {
    return 'AGGRESSIVE_LEADER';
  }

  return 'CONSERVATIVE';
}

/**
 * Evaluates game context and dynamically shifts a bot's active strategy when justified.
 * Note: Keeps personality stable throughout the round (no chaotic 30% random mutations).
 */
export function evaluateAndShiftBotStrategy(
  player: Player,
  trickNumber: number,
  allPlayers: Player[],
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = []
): AIStrategy {
  const currentStrategy = player.aiStrategy || player.basePersonality || 'CONSERVATIVE';
  const isKoraPossible = canBotAchieveKora(player, trickNumber);

  // 1. KORA_HUNTER Activation:
  if (isKoraPossible) {
    if (currentStrategy === 'KORA_HUNTER') {
      return 'KORA_HUNTER';
    }
    if (hasKoraPotential(player.hand)) {
      return 'KORA_HUNTER';
    }
  }

  // 2. KORA_HUNTER Fallback:
  if (currentStrategy === 'KORA_HUNTER' && !isKoraPossible) {
    const fallback = player.basePersonality && player.basePersonality !== 'KORA_HUNTER'
      ? player.basePersonality
      : 'TRICK_4_CONTROL';
    return fallback;
  }

  // 3. Situational Tactical Shifts
  // Gatekeeper shift at Trick 4 if chip leader is winning
  if (trickNumber === 4 && currentStrategy !== 'BLUFFER') {
    const chipLeader = [...allPlayers].sort((a, b) => b.capital - a.capital)[0];
    if (chipLeader && chipLeader.id !== player.id) {
      const isChipLeaderWinningTrick = currentPlays.some(
        (p) => p.playerIndex === allPlayers.findIndex((pl) => pl.id === chipLeader.id) && p.isWinningSoFar
      );
      if (isChipLeaderWinningTrick) {
        return 'GATEKEEPER';
      }
    }
  }

  // DYNAMIC personality re-evaluates cleanly
  if (currentStrategy === 'DYNAMIC') {
    return resolveDynamicStrategy(player.hand);
  }

  return currentStrategy;
}

/**
 * Determines if a bot should trigger the Kora Hunter alert banner.
 */
export function shouldBotTriggerKoraAlert(
  player: Player,
  activeStrategy: AIStrategy,
  isMidRoundCheck: boolean = false
): boolean {
  if (player.isHuman || player.isEliminated) return false;

  const koraChance = isMidRoundCheck ? 0.4 : 0.5;
  const bluffChance = isMidRoundCheck ? 0.1 : 0.15;

  if (activeStrategy === 'KORA_HUNTER') {
    return Math.random() < koraChance;
  }

  const basePersonality = player.basePersonality || player.aiStrategy;
  if (basePersonality === 'BLUFFER') {
    return Math.random() < bluffChance;
  }

  return false;
}

/**
 * Helper to gather all cards played publicly on the table in this round (history + current trick).
 */
export function getPlayedCardsInRound(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = []
): Card[] {
  const playedCards: Card[] = [];
  tricksHistory.forEach((t) => {
    (t.plays || []).forEach((p) => playedCards.push(p.card));
  });
  currentPlays.forEach((p) => playedCards.push(p.card));
  return playedCards;
}

/**
 * -------------------------------------------------------------
 * 1. DYNAMIC BOSS CARDS ENGINE (Suivi des Cartes Maîtresses)
 * -------------------------------------------------------------
 * In Njambo Kora:
 * - Coeur, Carreau, Trèfle: max value is 10 (down to 3)
 * - Pique: max value is 9 (10 of Spades is excluded, down to 3)
 *
 * As higher cards fall on the table, lower cards become the new dynamic Bosses!
 */
export function getInitialMaxSuitValue(suit: Suit): number {
  return suit === 'PIQUE' ? 9 : 10;
}

/**
 * Computes the highest unplayed card value for a given suit based on all publicly played cards.
 */
export function getDynamicBossValue(suit: Suit, playedCards: Card[]): number {
  const maxVal = getInitialMaxSuitValue(suit);
  const playedValuesInSuit = new Set(
    playedCards.filter((c) => c.suit === suit).map((c) => c.value)
  );

  for (let val = maxVal; val >= 3; val--) {
    if (!playedValuesInSuit.has(val)) {
      return val;
    }
  }
  return 3;
}

/**
 * Checks whether a specific card is currently the unbeatable Boss card of its suit.
 */
export function isDynamicBossCard(card: Card, playedCards: Card[]): boolean {
  const currentBossValue = getDynamicBossValue(card.suit, playedCards);
  return card.value >= currentBossValue;
}

/**
 * Returns all cards in hand that are currently dynamic Bosses of their suits.
 */
export function getDynamicBossesInHand(hand: Card[], playedCards: Card[]): Card[] {
  return hand.filter((c) => isDynamicBossCard(c, playedCards));
}

/**
 * Evaluates the future strength/safety of a card in hand (0 to 10 scale).
 */
export function evaluateCardStrength(
  card: Card,
  hand: Card[],
  playedCards: Card[]
): number {
  const currentBossVal = getDynamicBossValue(card.suit, playedCards);
  if (card.value >= currentBossVal) {
    return 10; // Invincible Boss
  }

  const gap = currentBossVal - card.value;
  if (gap === 1) return 7; // Second highest card (e.g. 9 when 10 is out there)
  if (gap === 2) return 5; // Third highest
  if (card.value <= 5) return 2; // Weak card
  return 3;
}

/**
 * -------------------------------------------------------------
 * 4. ANTI-KORA DEFENSE DETECTOR (Chacun pour soi)
 * -------------------------------------------------------------
 * Detects if another player (human or other bot) is on a Kora streak (won all tricks so far)
 * and is currently winning or threatening to win the current trick.
 */
export function findThreateningKoraLeader(
  players: Player[],
  tricksHistory: Trick[],
  currentPlays: PlayedCard[],
  currentTrickNumber: number,
  myPlayerIndex?: number
): { playerIndex: number; playerName: string; winningCard: Card } | null {
  if (currentTrickNumber < 2) return null; // Kora threat becomes critical from trick 2+

  const requiredTricksWon = currentTrickNumber - 1;

  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    if (myPlayerIndex !== undefined && pIdx === myPlayerIndex) continue;

    const player = players[pIdx];
    if (player.isEliminated) continue;

    if (player.tricksWonInRound === requiredTricksWon) {
      // This player has won 100% of previous tricks in this round!
      // Check if they currently played a winning card in this trick
      const leadSuit = currentPlays[0]?.card?.suit || null;
      const { winnerPlay } = determineTrickWinner(currentPlays, leadSuit);

      if (winnerPlay && winnerPlay.playerIndex === pIdx) {
        return {
          playerIndex: pIdx,
          playerName: player.name,
          winningCard: winnerPlay.card,
        };
      }
    }
  }

  return null;
}

/**
 * -------------------------------------------------------------
 * 5. INTELLIGENT DISCARD ENGINE (Trash Priority)
 * -------------------------------------------------------------
 * When the bot cannot follow suit, selects the smartest card to throw away:
 * 1. Never throw away Dynamic Bosses (10s, 9♠, or current boss) if possible.
 * 2. Prioritize dead/weak singletons (3-6 in suits without boss).
 * 3. Preserve cards with high future winning potential.
 */
/**
 * Tracks which suits players failed to follow, meaning they have a VOID (0 cards) in that suit.
 * This is 100% legal, non-cheating public card inference.
 */
export function getKnownPlayerVoids(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = [],
  currentLeadSuit: Suit | null = null
): Map<number, Set<Suit>> {
  const voids = new Map<number, Set<Suit>>();

  const addVoid = (playerIndex: number, suit: Suit) => {
    if (!voids.has(playerIndex)) {
      voids.set(playerIndex, new Set());
    }
    voids.get(playerIndex)!.add(suit);
  };

  tricksHistory.forEach((trick) => {
    const lead = trick.leadSuit;
    if (!lead || !trick.plays) return;
    trick.plays.forEach((p) => {
      if (p.card && p.card.suit !== lead) {
        addVoid(p.playerIndex, lead);
      }
    });
  });

  if (currentLeadSuit) {
    currentPlays.forEach((p) => {
      if (p.card && p.card.suit !== currentLeadSuit) {
        addVoid(p.playerIndex, currentLeadSuit);
      }
    });
  }

  return voids;
}

/**
 * Super-human discard calculator for Grand Katika:
 * Mathematically scores each candidate card based on dynamic boss status,
 * singleton void creation potential, and opponent void distribution.
 */
export function chooseGrandMasterDiscard(
  validCards: Card[],
  hand: Card[],
  playedCards: Card[],
  knownVoids: Map<number, Set<Suit>>
): Card {
  if (validCards.length <= 1) return validCards[0];

  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  const scoredDiscards = validCards.map((card) => {
    const isBoss = isDynamicBossCard(card, playedCards);
    const suitCount = suitCounts[card.suit];
    const rawVal = card.value;

    let discardScore = 100;

    // 1. Dynamic bosses are strictly preserved
    if (isBoss) {
      discardScore -= 140;
    }

    // 2. High cards protection
    if (rawVal === 10 || (card.suit === 'PIQUE' && rawVal === 9)) {
      discardScore -= 160;
    } else if (rawVal === 9) {
      discardScore -= 60;
    } else if (rawVal === 8) {
      discardScore -= 30;
    } else if (rawVal <= 5) {
      discardScore += 45; // Prime trash candidate
    }

    // 3. Void creation: dumping a weak singleton opens up 100% cutting freedom in future tricks!
    if (suitCount === 1 && !isBoss && rawVal <= 6) {
      discardScore += 65;
    }

    // 4. Opponent void exploitation: if opponents have voids in this suit, our cards in this suit are protected!
    let opponentsVoidInSuit = 0;
    knownVoids.forEach((suits) => {
      if (suits.has(card.suit)) opponentsVoidInSuit++;
    });
    if (opponentsVoidInSuit > 0) {
      discardScore -= opponentsVoidInSuit * 20;
    }

    return { card, score: discardScore };
  });

  scoredDiscards.sort((a, b) => b.score - a.score);
  return scoredDiscards[0].card;
}

/**
 * Minimax Endgame Solver for Trick 4:
 * Evaluates the impact of playing card A vs card B on both Trick 4 and Trick 5,
 * maximizing the probability of winning the crucial final pot.
 */
export function solveGrandMasterEndgame(
  validCards: Card[],
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  cardsPlayedSoFar: Card[],
  isLastPlayerInTrick: boolean,
  currentWinningValue: number
): Card {
  if (validCards.length === 1) return validCards[0];

  const candidateScores = validCards.map((candidate) => {
    const remainingCards = hand.filter((c) => c.id !== candidate.id);
    const remainingCard = remainingCards[0] || candidate;
    const cardsPlayedAfterCandidate = [...cardsPlayedSoFar, candidate];

    let score = 0;

    // Trick 4 simulation:
    let winsTrick4 = false;
    if (!leadSuit) {
      if (isDynamicBossCard(candidate, cardsPlayedSoFar)) {
        winsTrick4 = true;
        score += 350;
      } else {
        score += candidate.value * 12;
      }
    } else {
      if (candidate.value > currentWinningValue) {
        if (isLastPlayerInTrick) {
          winsTrick4 = true;
          score += 350;
        } else {
          score += (candidate.value - currentWinningValue) * 20;
        }
      } else {
        score -= 60;
      }
    }

    // Trick 5 simulation with remainingCard:
    const remainingIsBoss = isDynamicBossCard(remainingCard, cardsPlayedAfterCandidate);
    if (remainingIsBoss) {
      score += 550;
      if (winsTrick4) {
        // Winning Trick 4 AND holding an unbeatable boss for Trick 5 -> 100% sweep of both tricks!
        score += 900;
      }
    } else {
      score += remainingCard.value * 15;
      if (winsTrick4 && remainingCard.value <= 6) {
        // Warning: winning Trick 4 forces bot to lead a weak card on Trick 5, risking surrender of the pot
        score -= 280;
      }
    }

    return { card: candidate, score };
  });

  candidateScores.sort((a, b) => b.score - a.score);
  return candidateScores[0].card;
}

export function chooseSmartDiscard(
  validCards: Card[],
  hand: Card[],
  playedCards: Card[],
  difficulty: AIDifficulty = 'NORMAL'
): Card {
  if (validCards.length <= 1) return validCards[0];

  if (difficulty === 'EASY') {
    // Easy mode: simple lowest card
    return [...validCards].sort((a, b) => a.value - b.value)[0];
  }

  // Count suit distribution in hand
  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  // Score each card for discard desirability (higher score = better to discard)
  const scoredDiscards = validCards.map((card) => {
    const isBoss = isDynamicBossCard(card, playedCards);
    const suitCount = suitCounts[card.suit];
    const rawVal = card.value;

    let discardScore = 100;

    if (isBoss) {
      discardScore -= 80; // Highly protect boss cards!
    }

    if (rawVal === 10 || (card.suit === 'PIQUE' && rawVal === 9)) {
      discardScore -= 90; // Never throw absolute top cards
    } else if (rawVal === 9) {
      discardScore -= 40;
    } else if (rawVal <= 5) {
      discardScore += 30; // Great candidate for trash
    }

    // Discarding a singleton helps empty that suit completely for future discards
    if (suitCount === 1 && !isBoss && rawVal <= 7) {
      discardScore += 25;
    }

    return { card, score: discardScore };
  });

  // Sort descending by discardScore (highest discardScore thrown first)
  scoredDiscards.sort((a, b) => b.score - a.score);
  return scoredDiscards[0].card;
}

/**
 * Relais IA (Bot de relais pour joueur déconnecté)
 * Règle essentielle : joue le coup le plus neutre possible, pas le coup optimal.
 * Le relais IA ne doit pas jouer agressivement ni tenter de remporter un tour
 * qui avantagerait artificiellement le joueur absent ou léserait les autres.
 * Il joue la carte la plus basse de la couleur demandée, ou une défausse neutre.
 */
export function chooseRelayAICard(hand: Card[], leadSuit: Suit | null): Card {
  const validCards = getPlayableCards(hand, leadSuit);
  if (validCards.length === 0) {
    return hand[0];
  }
  if (validCards.length === 1) {
    return validCards[0];
  }

  if (leadSuit) {
    // Si le joueur a la couleur demandée, jouer la carte de valeur la plus basse
    const matchingSuitCards = validCards.filter((c) => c.suit === leadSuit);
    if (matchingSuitCards.length > 0) {
      return matchingSuitCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), matchingSuitCards[0]);
    }
    // Si pas de la couleur : défausse neutre la plus basse
    return validCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), validCards[0]);
  }

  // Le joueur absent a la main (entame) : jouer la carte de valeur la plus basse
  return validCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), validCards[0]);
}

/**
 * -------------------------------------------------------------
 * MAIN AI DECISION ENGINE
 * -------------------------------------------------------------
 * Implements all 6 major recommendations:
 * 1. Dynamic Boss Tracking
 * 2. Bleeding & Forcing (Mains 1 à 3)
 * 3. Tactical Trick 4 & Trick 5 Setup
 * 4. Anti-Kora Hunter Defense
 * 5. Intelligent Discard Hierarchy
 * 6. Difficulty Levels (EASY, NORMAL, EXPERT)
 */
export function chooseAICard(
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  trickNumber: number,
  strategy: AIStrategy = 'CONSERVATIVE',
  tricksHistory: Trick[] = [],
  activePlayerCount: number = 4,
  difficulty: AIDifficulty = 'NORMAL',
  players: Player[] = [],
  myPlayerIndex?: number
): Card {
  const validCards = getPlayableCards(hand, leadSuit);

  if (validCards.length === 0) {
    return hand[0];
  }

  if (validCards.length === 1) {
    return validCards[0];
  }

  // Detect Robam Hokuto bot identity
  const currentBotPlayer = myPlayerIndex !== undefined && players[myPlayerIndex] ? players[myPlayerIndex] : null;
  const isRobamHokuto = Boolean(
    (currentBotPlayer && currentBotPlayer.name.includes('Robam Hokuto')) ||
    strategy === 'HOKUTO_ADAPTIVE'
  );

  // Force EXPERT difficulty for Robam Hokuto, unless table difficulty is GRAND_MASTER
  const effectiveDifficulty: AIDifficulty =
    difficulty === 'GRAND_MASTER' ? 'GRAND_MASTER' : isRobamHokuto ? 'EXPERT' : difficulty;
  const isGrandMaster = effectiveDifficulty === 'GRAND_MASTER';

  // Extract known voids per player (legal, public inference)
  const knownVoids = getKnownPlayerVoids(tricksHistory, currentPlays, leadSuit);

  // Track & update human profile across manches/rounds
  const humanProfile = updateHumanProfileFromGame(tricksHistory, currentPlays, players);

  const activeStrategy =
    strategy === 'DYNAMIC' ? resolveDynamicStrategy(hand) : strategy;

  // Gather all public cards played this round
  const cardsPlayedSoFar = getPlayedCardsInRound(tricksHistory, currentPlays);

  // Identify bosses in current hand
  const bossesInHand = getDynamicBossesInHand(hand, cardsPlayedSoFar);

  // Position in current trick (1st, 2nd, 3rd, 4th)
  const playerPositionInTrick = currentPlays.length + 1;
  const isLastPlayerInTrick = playerPositionInTrick === activePlayerCount;

  // =========================================================================
  // --- TRICK 5 : THE DECISIVE POT TRICK ---
  // =========================================================================
  if (trickNumber === 5) {
    const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);

    if (!leadSuit) {
      // Lead with the absolute highest/boss card to capture the pot
      return sortedDesc[0];
    }

    const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
    if (hasLeadSuit) {
      const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
      const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
      const winningCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

      if (winningCards.length > 0) {
        // Grand Master plays the lowest winning card to win at minimal risk; others play highest
        return isGrandMaster ? winningCards[0] : winningCards[winningCards.length - 1];
      } else {
        // Cannot win -> discard lowest card of suit
        return leadSuitCardsAsc[0];
      }
    }

    // Discarding on trick 5 (cannot win without lead suit)
    return validCards.sort((a, b) => a.value - b.value)[0];
  }

  // =========================================================================
  // --- 4. ANTI-KORA EMERGENCY DEFENSE (All tricks 1 to 4) ---
  // =========================================================================
  if (difficulty !== 'EASY' && players.length > 0) {
    const koraThreat = findThreateningKoraLeader(
      players,
      tricksHistory,
      currentPlays,
      trickNumber,
      myPlayerIndex
    );

    if (koraThreat && leadSuit) {
      const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
      if (hasLeadSuit) {
        const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
        const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
        const beatingCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

        if (beatingCards.length > 0) {
          // Play the lowest card that beats the Kora leader to break the streak!
          return beatingCards[0];
        }
      }
    }
  }

  // =========================================================================
  // --- 3. TRICK 4 : TACTICAL SETUP FOR TRICK 5 ---
  // =========================================================================
  if (trickNumber === 4 && difficulty !== 'EASY') {
    // Grand Master Minimax Endgame solver
    if (isGrandMaster) {
      const { winningValue } = leadSuit ? determineTrickWinner(currentPlays, leadSuit) : { winningValue: 0 };
      return solveGrandMasterEndgame(
        validCards,
        hand,
        leadSuit,
        currentPlays,
        cardsPlayedSoFar,
        isLastPlayerInTrick,
        winningValue
      );
    }

    // Remaining cards that will be left for trick 5 (cards in hand minus the one we play)
    const hasBossForTrick5 = bossesInHand.length >= 2 || (bossesInHand.length === 1 && hand.length === 2);

    if (!leadSuit) {
      const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);
      const sortedAsc = [...validCards].sort((a, b) => a.value - b.value);

      // TRICK_4_CONTROL or GATEKEEPER attacks to seize Trick 4
      if (activeStrategy === 'TRICK_4_CONTROL' || activeStrategy === 'GATEKEEPER') {
        return sortedDesc[0];
      }

      // If CONSERVATIVE, save the only boss for Trick 5 and lead low
      if (activeStrategy === 'CONSERVATIVE' && bossesInHand.length === 1 && hand.length === 2) {
        return sortedAsc[0];
      }

      // If we have 2+ bosses, lead one to win Trick 4 and keep the other for Trick 5
      if (bossesInHand.length >= 2) {
        return sortedDesc[0];
      }

      // If holding a non-boss high card and a boss, play non-boss high card to win trick 4
      const nonBossDesc = sortedDesc.filter((c) => !isDynamicBossCard(c, cardsPlayedSoFar));
      if (nonBossDesc.length > 0 && bossesInHand.length >= 1) {
        return nonBossDesc[0];
      }

      if (hasBossForTrick5 || difficulty === 'EXPERT') {
        return sortedDesc[0];
      } else {
        return sortedAsc[0];
      }
    }

    // Following suit on Trick 4
    const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
    if (hasLeadSuit) {
      const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
      const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
      const winningCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

      if (hasBossForTrick5 || activeStrategy === 'TRICK_4_CONTROL' || activeStrategy === 'GATEKEEPER') {
        if (winningCards.length > 0) {
          // Win trick 4 with lowest winning card to gain entame for Trick 5!
          return winningCards[0];
        }
      }
    }
  }

  // =========================================================================
  // --- CASE 1: AI IS LEAD PLAYER (!leadSuit) ON TRICKS 1 TO 3 ---
  // =========================================================================
  if (!leadSuit) {
    const sortedAsc = [...validCards].sort((a, b) => a.value - b.value);
    const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);

    // Suit counts in hand
    const suitCounts: Record<Suit, number> = {
      COEUR: 0,
      CARREAU: 0,
      TREFLE: 0,
      PIQUE: 0,
    };
    hand.forEach((c) => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    // GRAND MASTER ADVANCED LEAD ENGINE (Tricks 1 to 3)
    if (isGrandMaster) {
      // 1. Anti-Kora lead exploitation:
      // If an opponent is threatening Kora, check if they have known voids to exploit
      if (trickNumber >= 2 && players.length > 0) {
        const requiredTricksWon = trickNumber - 1;
        const koraLeader = players.find(
          (p, idx) => idx !== myPlayerIndex && !p.isEliminated && p.tricksWonInRound === requiredTricksWon
        );
        if (koraLeader) {
          const leaderIdx = players.indexOf(koraLeader);
          const leaderVoids = knownVoids.get(leaderIdx);
          if (leaderVoids && leaderVoids.size > 0) {
            // Lead a suit where the Kora leader is void! They cannot follow suit and therefore cannot win!
            const voidLead = sortedAsc.find((c) => leaderVoids.has(c.suit));
            if (voidLead) return voidLead;
          }
        }
      }

      // 2. High Forcing / Bleeding lead:
      // If Grand Master holds both dynamic boss and sub-boss (e.g. 10 & 9, or 9 & 8) in the same suit,
      // lead the sub-boss to force out opponent 10s while retaining absolute control!
      const suitsToCheck: Suit[] = ['COEUR', 'CARREAU', 'TREFLE', 'PIQUE'];
      for (const suit of suitsToCheck) {
        const cardsInSuit = hand.filter((c) => c.suit === suit).sort((a, b) => b.value - a.value);
        if (cardsInSuit.length >= 2) {
          const top = cardsInSuit[0];
          const second = cardsInSuit[1];
          if (isDynamicBossCard(top, cardsPlayedSoFar) && second.value >= 7) {
            const subBossLead = validCards.find((c) => c.id === second.id);
            if (subBossLead && trickNumber <= 3) return subBossLead;
          }
        }
      }

      // 3. Purge weak singletons early (Tricks 1-2) to open up cutting freedom
      if (trickNumber <= 2) {
        const weakSingleton = sortedAsc.find(
          (c) => suitCounts[c.suit] === 1 && c.value <= 6 && !isDynamicBossCard(c, cardsPlayedSoFar)
        );
        if (weakSingleton) return weakSingleton;
      }

      // 4. On Trick 3: If holding multiple dynamic bosses, cash one in safely
      if (trickNumber === 3 && bossesInHand.length >= 2) {
        return bossesInHand[0];
      }

      // 5. Default safe lead: lowest non-boss card
      const nonBossCards = sortedAsc.filter((c) => !isDynamicBossCard(c, cardsPlayedSoFar));
      if (nonBossCards.length > 0) {
        return nonBossCards[0];
      }
      return sortedAsc[0];
    }

    // ROBAM HOKUTO ADAPTIVE LEAD:
    if (isRobamHokuto) {
      if (humanProfile.style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
        // Human dumps early 10s -> Robam leads low non-boss cards to absorb early human attacks
        const lowNonBoss = sortedAsc.filter((c) => !isDynamicBossCard(c, cardsPlayedSoFar) && c.value <= 6);
        if (lowNonBoss.length > 0) return lowNonBoss[0];
      } else if (humanProfile.style === 'LATE_HOARDER' && trickNumber <= 3) {
        // Human hoards 10s for late game -> Robam attacks early with forcing 8/9s or dynamic bosses
        const forcing = sortedDesc.filter((c) => c.value >= 8);
        if (forcing.length > 0) return forcing[0];
      }
    }

    // KORA_HUNTER: Play boss card to take trick and keep momentum
    if (activeStrategy === 'KORA_HUNTER') {
      return sortedDesc[0];
    }

    // EASY DIFFICULTY: Simple low lead
    if (difficulty === 'EASY') {
      const nonTens = sortedAsc.filter((c) => c.value < 10);
      return nonTens.length > 0 ? nonTens[0] : sortedAsc[0];
    }

    // 2. BLEEDING & FORCING STRATEGY (Normal & Expert):
    // A. Purge weak singletons early (Tricks 1-2) to enable discards later
    if (trickNumber <= 2) {
      const weakSingleton = sortedAsc.find(
        (c) => suitCounts[c.suit] === 1 && c.value <= 6 && !isDynamicBossCard(c, cardsPlayedSoFar)
      );
      if (weakSingleton) {
        return weakSingleton;
      }
    }

    // B. Pressure/Extraction: Lead medium/high card (8 or 9) to force out opponent 10s
    if (difficulty === 'EXPERT' || activeStrategy === 'AGGRESSIVE_LEADER') {
      const forcingCards = sortedDesc.filter((c) => {
        const isBoss = isDynamicBossCard(c, cardsPlayedSoFar);
        return !isBoss && c.value >= 7 && c.value <= 9;
      });

      if (forcingCards.length > 0 && trickNumber <= 3) {
        return forcingCards[0]; // Attack with an 8 or 9 to bleed enemy 10s!
      }
    }

    // C. CARD_COUNTER: If holding a verified boss and it's trick 3+, cash it in
    if (activeStrategy === 'CARD_COUNTER' && trickNumber >= 3 && bossesInHand.length > 0) {
      return bossesInHand[0];
    }

    // Default safe lead: lowest non-boss card
    const nonBossCards = sortedAsc.filter((c) => !isDynamicBossCard(c, cardsPlayedSoFar));
    if (nonBossCards.length > 0) {
      return nonBossCards[0];
    }

    return sortedAsc[0];
  }

  // =========================================================================
  // --- CASE 2: AI MUST FOLLOW SUIT (hasLeadSuit) ON TRICKS 1 TO 3 ---
  // =========================================================================
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (hasLeadSuit) {
    const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
    const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
    const winningCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

    // GRAND MASTER SURGICAL FOLLOW SUIT:
    if (isGrandMaster) {
      // Check if current winner is an unbeatable card (unbeatable 10 or current Boss)
      const currentBossVal = getDynamicBossValue(leadSuit, cardsPlayedSoFar);
      const isWinnerUnbeatable = winningValue >= currentBossVal;

      if (isWinnerUnbeatable) {
        // Unbeatable winner -> dump absolute lowest card
        return leadSuitCardsAsc[0];
      }

      // If last player to act in the trick:
      if (isLastPlayerInTrick) {
        if (winningCards.length > 0) {
          // Play lowest card that wins the trick!
          return winningCards[0];
        }
        return leadSuitCardsAsc[0];
      }

      // If 2nd or 3rd player to act:
      if (winningCards.length > 0) {
        // If the winning card is a dynamic boss or if higher cards are already dead, take control
        const lowestWinner = winningCards[0];
        const isLowestWinnerBoss = isDynamicBossCard(lowestWinner, cardsPlayedSoFar);
        if (isLowestWinnerBoss) {
          return lowestWinner;
        }

        // If current winner is weak (<= 6) and lowestWinner >= 8, take the trick
        if (winningValue <= 6 && lowestWinner.value >= 8 && playerPositionInTrick >= 3) {
          return lowestWinner;
        }
      }

      // Default safe follow: duck with lowest
      return leadSuitCardsAsc[0];
    }

    // ROBAM HOKUTO ADAPTIVE FOLLOW:
    if (isRobamHokuto) {
      if (humanProfile.style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
        // Human dumps heavy cards early -> Robam ducks cleanly on trick 1 & 2 to save bosses for late game
        return leadSuitCardsAsc[0];
      }
    }

    // KORA_HUNTER: Win trick with lowest sufficient card
    if (activeStrategy === 'KORA_HUNTER') {
      if (winningCards.length > 0) {
        return winningCards[0];
      }
      return leadSuitCardsAsc[0];
    }

    // EASY: Always play lowest card
    if (difficulty === 'EASY') {
      return leadSuitCardsAsc[0];
    }

    // Check if the current winning card is already an unbeatable 10 or current Boss
    const isCurrentWinnerUnbeatable =
      winningValue === 10 ||
      (leadSuit === 'PIQUE' && winningValue === 9) ||
      winningValue >= getDynamicBossValue(leadSuit, cardsPlayedSoFar);

    if (isCurrentWinnerUnbeatable) {
      // Opponent already locked the trick -> don't waste any good card, give lowest!
      return leadSuitCardsAsc[0];
    }

    // 2. CONTESTING & TAKING CONTROL (Late Position / In-Main Contestation):
    // If in 3rd or 4th position and winning card is weak (<= 7 or 8), take the trick!
    if ((isLastPlayerInTrick || playerPositionInTrick >= 3) && winningCards.length > 0) {
      const cheapWinningCard = winningCards.find(
        (c) => c.value <= 9 && !isDynamicBossCard(c, cardsPlayedSoFar)
      );

      if (cheapWinningCard) {
        // Seize the trick cheaply without burning a final Boss!
        return cheapWinningCard;
      }

      if (isLastPlayerInTrick && winningCards.length > 0) {
        // Last player: we know 100% we win the trick if we play winningCards[0]
        const lowestWinner = winningCards[0];
        // If it's not our only boss, take the trick
        if (!isDynamicBossCard(lowestWinner, cardsPlayedSoFar) || bossesInHand.length >= 2) {
          return lowestWinner;
        }
      }
    }

    // In early position (e.g. 2nd player): play low to avoid walking into 3rd/4th player traps
    return leadSuitCardsAsc[0];
  }

  // =========================================================================
  // --- CASE 3: DISCARDING (AI DOES NOT HAVE LEAD SUIT) ---
  // =========================================================================
  if (isGrandMaster) {
    return chooseGrandMasterDiscard(validCards, hand, cardsPlayedSoFar, knownVoids);
  }
  return chooseSmartDiscard(validCards, hand, cardsPlayedSoFar, difficulty);
}

export interface BotCommentResult {
  text: string;
  emoji: string;
}

/**
 * Generates a tactically coherent, in-character commentary for a bot based on the exact play outcome.
 */
export function getBotPlayReaction(params: {
  card: Card;
  isLeadPlay: boolean;
  leadSuit: Suit | null;
  isWinningSoFar: boolean;
  isCut: boolean; // Discard (cannot follow suit)
  trickNumber: number;
  isDynamicBoss: boolean;
  brokeKoraStreak: boolean;
  strategy: AIStrategy;
  botName: string;
  difficulty?: AIDifficulty;
}): BotCommentResult | null {
  const {
    card,
    isLeadPlay,
    isWinningSoFar,
    isCut,
    trickNumber,
    isDynamicBoss,
    brokeKoraStreak,
    strategy,
    botName,
    difficulty,
  } = params;

  // If bot emotes are completely disabled (max per round = 0)
  if (activeBotDialogueConfig.botMaxEmotesPerRound === 0) {
    return null;
  }

  const hokutoRate = (activeBotDialogueConfig.botEmoteHokutoRatePct ?? 28) / 100;
  const mbapRate = (activeBotDialogueConfig.botEmoteMbapRatePct ?? 25) / 100;
  const leadDiscardRate = (activeBotDialogueConfig.botEmoteLeadDiscardRatePct ?? 10) / 100;

  // Grand Katika Master Commentary (L'ancien respecté de la table)
  if (difficulty === 'GRAND_MASTER' && Math.random() < Math.max(0.05, hokutoRate * 0.9)) {
    if (brokeKoraStreak && isWinningSoFar) {
      const grandKatikaBreak = [
        { text: 'Pas de chelem devant les anciens. Kora gâté.', emoji: '🛑' },
        { text: 'Chaque carte a été lue depuis la donne. Pas de Kora ici.', emoji: '⚔️' },
        { text: 'Tu as voulu forcer, mais la table a de la mémoire.', emoji: '⚡' },
      ];
      return grandKatikaBreak[Math.floor(Math.random() * grandKatikaBreak.length)];
    }

    if (trickNumber === 4) {
      const grandKatikaTrick4 = [
        { text: 'Le quatrième tour décide toujours du cinquième.', emoji: '🎯' },
        { text: 'La fin de partie est déjà écrite.', emoji: '👑' },
        { text: 'Posez vos cartes, le dénouement approche.', emoji: '⚡' },
      ];
      return grandKatikaTrick4[Math.floor(Math.random() * grandKatikaTrick4.length)];
    }

    if (trickNumber === 5 && isWinningSoFar) {
      const grandKatikaTrick5 = [
        { text: 'Ce pot était scellé depuis le début. Respectez le jeu.', emoji: '🏆' },
        { text: 'L’expérience a parlé sur le tapis.', emoji: '⚡' },
      ];
      return grandKatikaTrick5[Math.floor(Math.random() * grandKatikaTrick5.length)];
    }
  }

  // Robam Hokuto Special Adaptive Commentary (Le champion de quartier)
  const isHokuto = Boolean((botName && botName.includes('Robam Hokuto')) || strategy === 'HOKUTO_ADAPTIVE');
  if (isHokuto && Math.random() < hokutoRate) {
    const style = globalHumanProfile.style;

    if (style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
      const hokutoEarlyEmotes = [
        { text: 'Tu brûles tes 10 trop vite, mon ami ! Tu dors !', emoji: '🧠' },
        { text: 'Tape seulement, je t’attends au tournant !', emoji: '🛡️' },
        { text: 'Tu t’agites pour rien, c’est à la fin qu’on compte les points !', emoji: '🥷' },
      ];
      return hokutoEarlyEmotes[Math.floor(Math.random() * hokutoEarlyEmotes.length)];
    }

    if (style === 'LATE_HOARDER' && trickNumber >= 3) {
      const hokutoLateEmotes = [
        { text: 'Tu gardais tes cartes jusqu’à la fin ? Mauvais calcul, tu dors !', emoji: '👁️' },
        { text: 'La pression monte, tes 10 sont obligés de sortir !', emoji: '💥' },
        { text: 'Tes cartes fortes sont finies, je te vois venir depuis le début !', emoji: '🔮' },
      ];
      return hokutoLateEmotes[Math.floor(Math.random() * hokutoLateEmotes.length)];
    }

    if (brokeKoraStreak && isWinningSoFar) {
      const hokutoKoraEmotes = [
        { text: 'Tu voulais faire Kora devant Robam Hokuto ? Jamais !', emoji: '🔒' },
        { text: 'Kora verrouillé ! Respecte un peu le maître du jeu !', emoji: '🛑' },
      ];
      return hokutoKoraEmotes[Math.floor(Math.random() * hokutoKoraEmotes.length)];
    }

    if (trickNumber === 5 && isWinningSoFar) {
      const hokutoVictoryEmotes = [
        { text: 'Le pot est pour Robam Hokuto ! C’est le quartier qui gagne !', emoji: '👑' },
        { text: 'Maîtrise totale du tapis. Le patron, c’est moi !', emoji: '🥷' },
        { text: 'Robam Hokuto ne partage pas le pot. Merci pour les jetons !', emoji: '💰' },
      ];
      return hokutoVictoryEmotes[Math.floor(Math.random() * hokutoVictoryEmotes.length)];
    }
  }

  // 1. HIGHEST PRIORITY: Breaking an opponent's Kora streak (Tricks 2-4)
  if (brokeKoraStreak && isWinningSoFar) {
    if (Math.random() < Math.min(0.85, Math.max(0.2, mbapRate * 2.4))) {
      const koraBreakerEmotes = [
        { text: 'Ton Kora est gâté aujourd’hui !', emoji: '🛑' },
        { text: 'Pas de Kora sur cette table avec moi !', emoji: '⛔' },
        { text: 'Le grand chelem est mort, assieds-toi !', emoji: '✋' },
        { text: 'Tu croyais que tu allais faire Kora ? Tu rêves !', emoji: '🛡️' },
      ];
      return koraBreakerEmotes[Math.floor(Math.random() * koraBreakerEmotes.length)];
    }
    return null;
  }

  // 2. TRICK 5: The decisive Pot trick
  if (trickNumber === 5) {
    if (isLeadPlay) {
      if (Math.random() < Math.min(0.7, Math.max(0.05, mbapRate * 1.4))) {
        const trick5LeadEmotes = [
          { text: 'C’est l’heure du pot ! Tout se joue ici !', emoji: '🪙' },
          { text: 'Le pot-ci ne va pas m’échapper !', emoji: '💰' },
          { text: 'Dernière carte, voyons qui est le vrai patron !', emoji: '🏁' },
        ];
        return trick5LeadEmotes[Math.floor(Math.random() * trick5LeadEmotes.length)];
      }
    } else if (isCut) {
      // Discarding / no lead suit on trick 5
      if (Math.random() < Math.min(0.5, Math.max(0.05, leadDiscardRate * 2.0))) {
        const trick5CutEmotes = [
          { text: 'Aïe, je n’ai même pas la couleur du pot...', emoji: '😔' },
          { text: 'C’est gâté pour moi sur le pot, je n’ai pas la carte.', emoji: '🍂' },
        ];
        return trick5CutEmotes[Math.floor(Math.random() * trick5CutEmotes.length)];
      }
    } else if (isWinningSoFar) {
      if (Math.random() < Math.min(0.75, Math.max(0.1, mbapRate * 1.6))) {
        const trick5WinEmotes = [
          { text: 'Le pot rentre à la maison ! Merci pour les jetons !', emoji: '💰' },
          { text: 'Contrôle total sur le pot ! C’est plié !', emoji: '👑' },
          { text: 'Je ramasse la caisse ! Bien essayé quand même !', emoji: '🏆' },
        ];
        return trick5WinEmotes[Math.floor(Math.random() * trick5WinEmotes.length)];
      }
    } else {
      // Followed suit on trick 5 but didn't win
      if (Math.random() < Math.min(0.4, Math.max(0.05, leadDiscardRate * 1.5))) {
        const trick5LoseEmotes = [
          { text: 'Ma carte était trop courte pour le pot...', emoji: '😅' },
          { text: 'Bien joué pour le pot, tu as assuré !', emoji: '👏' },
        ];
        return trick5LoseEmotes[Math.floor(Math.random() * trick5LoseEmotes.length)];
      }
    }
    return null;
  }

  // 3. PAS LA COULEUR / COUPURE SANS COULEUR (Mains 1 à 4): Le bot n'a pas la couleur demandée
  if (isCut) {
    if (Math.random() < Math.max(0.01, leadDiscardRate * 1.2)) {
      const discardEmotes = [
        { text: 'Je n’ai pas la carte !', emoji: '🤷' },
        { text: 'Pas la couleur, je m’en débarrasse.', emoji: '🍃' },
        { text: 'Pas cette couleur chez moi, jouez seulement !', emoji: '💨' },
        { text: 'Zéro de cette couleur en main !', emoji: '🙅' },
      ];
      return discardEmotes[Math.floor(Math.random() * discardEmotes.length)];
    }
    return null;
  }

  // 4. ENTAME / LEAD PLAY (Mains 1 à 4)
  if (isLeadPlay) {
    if (isDynamicBoss || card.value === 10 || (card.suit === 'PIQUE' && card.value === 9)) {
      // Opening with strong card / boss
      if (Math.random() < Math.max(0.02, leadDiscardRate * 2.0)) {
        const strongLeadEmotes = [
          { text: 'J’ouvre direct avec du lourd !', emoji: '🔥' },
          { text: 'Qui a le courage de suivre ?', emoji: '👀' },
          { text: 'Je pose la patronne d’entrée de jeu !', emoji: '👑' },
        ];
        return strongLeadEmotes[Math.floor(Math.random() * strongLeadEmotes.length)];
      }
    } else {
      // Opening with low/medium card
      if (Math.random() < Math.max(0.01, leadDiscardRate)) {
        const softLeadEmotes = [
          { text: 'Je pose une petite d’abord, on regarde...', emoji: '🎴' },
          { text: 'Voyons ce que vous avez dans vos mains !', emoji: '👀' },
          { text: 'C’est à vous de répondre maintenant.', emoji: '🎲' },
        ];
        return softLeadEmotes[Math.floor(Math.random() * softLeadEmotes.length)];
      }
    }
    return null;
  }

  // 5. FOLLOWING SUIT & CURRENTLY WINNING THE TRICK (isWinningSoFar === true)
  // Prise de contrôle / Couper la carte
  if (isWinningSoFar) {
    const isTrueBoss =
      card.value === 10 ||
      (card.suit === 'PIQUE' && card.value === 9) ||
      isDynamicBoss;

    if (isTrueBoss) {
      // Couper avec une carte maîtresse / 10 / Patronne
      if (Math.random() < mbapRate) {
        // Archétypes
        if (strategy === 'BLUFFER' || strategy === 'KORA_HUNTER') {
          const aggressiveControl = [
            { text: 'Je coupe ça sec !', emoji: '💥' },
            { text: 'Je prends le contrôle de la table !', emoji: '🔥' },
            { text: 'Qui peut monter sur ma carte ? Personne !', emoji: '👑' },
            { text: 'Je ramasse tout, circulez !', emoji: '⚔️' },
          ];
          return aggressiveControl[Math.floor(Math.random() * aggressiveControl.length)];
        } else if (strategy === 'CARD_COUNTER') {
          const counterControl = [
            { text: 'Le contrôle était prévu ici.', emoji: '🧠' },
            { text: 'La patronne est sortie au bon moment.', emoji: '👑' },
            { text: 'Je coupe au bon timing.', emoji: '✋' },
          ];
          return counterControl[Math.floor(Math.random() * counterControl.length)];
        } else if (strategy === 'GATEKEEPER') {
          const gatekeeperControl = [
            { text: 'Personne ne passe ici !', emoji: '🛡️' },
            { text: 'Je ferme le chemin !', emoji: '🛑' },
          ];
          return gatekeeperControl[Math.floor(Math.random() * gatekeeperControl.length)];
        } else {
          const generalControl = [
            { text: 'Je prends le contrôle !', emoji: '💥' },
            { text: 'La patronne est sur la table !', emoji: '👑' },
            { text: 'Je coupe direct !', emoji: '✋' },
            { text: 'Tu dors, et moi je ramasse !', emoji: '😴' },
            { text: 'Tu dors sur tes cartes ou quoi ?', emoji: '👀' },
          ];
          return generalControl[Math.floor(Math.random() * generalControl.length)];
        }
      }
    } else {
      // Takes lead with a modest winning card (e.g. 7, 8, 9)
      if (Math.random() < Math.max(0.02, mbapRate * 0.48)) {
        const modestWinEmotes = [
          { text: 'Je prends la main !', emoji: '✋' },
          { text: 'Ça suffit pour l’instant 😉', emoji: '🎯' },
          { text: 'En tête !', emoji: '✨' },
          { text: 'Ça passe !', emoji: '👌' },
          { text: 'Mon ami, tu dors debout !', emoji: '🥱' },
        ];
        return modestWinEmotes[Math.floor(Math.random() * modestWinEmotes.length)];
      }
    }
    return null;
  }

  // 6. FOLLOWING SUIT BUT LOSING (isWinningSoFar === false)
  if (Math.random() < Math.max(0.01, leadDiscardRate * 0.8)) {
    const loseEmotes = [
      { text: 'Trop haut pour moi !', emoji: '😅' },
      { text: 'Je passe sous ta carte...', emoji: '🛡️' },
      { text: 'Je garde mon énergie pour après.', emoji: '⏳' },
      { text: 'Bien joué, tu as la main.', emoji: '👏' },
    ];
    return loseEmotes[Math.floor(Math.random() * loseEmotes.length)];
  }

  return null;
}
