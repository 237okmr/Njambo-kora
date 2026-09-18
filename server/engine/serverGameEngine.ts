import {
  Card,
  GameState,
  MultiplayerRoom,
  Player,
  RoomPlayer,
  RoomStatus,
  PartieWinType,
  Trick,
  PlayedCard,
  InstantWinReveal,
  EmoteMessage,
  PreviousPartieSummary,
  Suit,
} from '../../src/types';
import { build31Deck, dealCards, determineTrickWinner, getPlayableCards, isCardPlayable, shuffleDeck } from '../../src/utils/deck';
import {
  chooseAICard,
  chooseRelayAICard,
  evaluateAndShiftBotStrategy,
  hasKoraPotential,
  shouldBotFoldRound,
  getBotFoldReaction,
  getRandomBotProfiles,
  getRandomBotStrategy,
} from '../../src/utils/ai';
import { getEngineConfig, KatikaEngineConfig } from './engineConfig';

export interface ActiveRoomState {
  room: MultiplayerRoom;
  engineConfig?: KatikaEngineConfig;
  turnTimeoutTimer: NodeJS.Timeout | null;
  trickResolutionTimer: NodeJS.Timeout | null;
  nextPartieTimer: NodeJS.Timeout | null;
  botMoveTimer: NodeJS.Timeout | null;
  instantWinTimer?: NodeJS.Timeout | null;
  autoStartTimer?: NodeJS.Timeout | null;
  hostTransferTimer?: NodeJS.Timeout | null;
  isHostDisconnectTimer?: boolean;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  aiRelayTimers?: Map<string, NodeJS.Timeout>;
  consecutiveTimeouts: Map<string, number>;
  emergencyTrickPlayed?: Map<string, number>;
  onPlayerForfeit?: (playerId: string, room: MultiplayerRoom, isExplicit?: boolean) => void;
  onPartieCompleted?: (room: MultiplayerRoom) => void;
}

export function maskOpponentCards(room: MultiplayerRoom, viewerPlayerId: string): MultiplayerRoom {
  // Deep clone to prevent mutating internal server state
  const clonedRoom: MultiplayerRoom = JSON.parse(JSON.stringify(room));

  if (!clonedRoom.gameState) {
    return clonedRoom;
  }

  // Preserve instantWinReveal unmasked for all clients so everyone can see the dramatic cards!
  if (room.instantWinReveal) {
    clonedRoom.instantWinReveal = JSON.parse(JSON.stringify(room.instantWinReveal));
  }
  if (room.gameState.instantWinReveal) {
    clonedRoom.gameState.instantWinReveal = JSON.parse(JSON.stringify(room.gameState.instantWinReveal));
  }

  // Mask players' hands in gameState
  clonedRoom.gameState.players = clonedRoom.gameState.players.map((p, pIdx) => {
    if (p.id === viewerPlayerId) {
      // The player sees their own real cards
      return p;
    }
    // If this player is the instant win winner during instantWinReveal, do not mask!
    if (
      room.gameState?.instantWinReveal &&
      room.gameState.instantWinReveal.winnerIndex === pIdx
    ) {
      return p;
    }
    // Opponent cards are masked to dummy cards with exact length
    const maskedHand: Card[] = (p.hand || []).map((_, idx) => ({
      id: `MASKED_${p.id}_${idx}`,
      suit: 'COEUR',
      value: 0,
      label: '?',
      shortLabel: '?',
    }));
    return {
      ...p,
      hand: maskedHand,
    };
  });

  // Also mask in room.players
  clonedRoom.players = clonedRoom.players.map((p, pIdx) => {
    if (p.id === viewerPlayerId) {
      return p;
    }
    if (
      room.gameState?.instantWinReveal &&
      room.gameState.instantWinReveal.winnerIndex === pIdx
    ) {
      return p;
    }
    const maskedHand: Card[] = (p.hand || []).map((_, idx) => ({
      id: `MASKED_${p.id}_${idx}`,
      suit: 'COEUR',
      value: 0,
      label: '?',
      shortLabel: '?',
    }));
    return {
      ...p,
      hand: maskedHand,
    };
  });

  return clonedRoom;
}

/**
 * Synchronise strictement l'état des joueurs entre room.players (Lobby/RoomPlayer)
 * et room.gameState.players (Game/Player) pour garantir l'unicité de la vérité terrain.
 */
export function syncRoomPlayersWithGameState(room: MultiplayerRoom): void {
  if (!room.gameState) return;
  const gs = room.gameState;
  room.players = (room.players || []).map((rp) => {
    const gp = (gs.players || []).find((p) => p.id === rp.id);
    if (!gp) return rp;
    return {
      ...rp,
      isSpectator: false,
      hand: gp.hand || rp.hand || [],
      capital: gp.capital,
      score: gp.capital,
      tricksWonInRound: gp.tricksWonInRound || 0,
      isEliminated: gp.isEliminated || false,
      isFoldedInRound: gp.isFoldedInRound || false,
      isForfeit: gp.isForfeit || false,
      connected: gp.connected !== undefined ? gp.connected : rp.connected,
      isAiRelay: gp.isAiRelay !== undefined ? gp.isAiRelay : rp.isAiRelay,
      aiRelayPlaysCount: gp.aiRelayPlaysCount !== undefined ? gp.aiRelayPlaysCount : rp.aiRelayPlaysCount,
    };
  });
}

export function selectBotToReplace(
  bots: { id: string; name: string; capital: number; tricksWonInRound?: number; index: number }[]
): { id: string; name: string; capital: number; index: number } | null {
  if (bots.length === 0) return null;
  const sorted = [...bots].sort((a, b) => {
    // 1. Lowest capital
    if (a.capital !== b.capital) {
      return a.capital - b.capital;
    }
    // 2. Highest seat index (last added)
    if (a.index !== b.index) {
      return b.index - a.index;
    }
    // 3. Lowest tricks won
    return (a.tricksWonInRound || 0) - (b.tricksWonInRound || 0);
  });
  return sorted[0];
}

/**
 * Bot d'urgence minimal neutre (Jalon 1):
 * - Respecte strictement l'obligation de couleur (leadSuit).
 * - Joue systématiquement la carte ayant la plus faible valeur nominale.
 * - Ne défausse JAMAIS un 3 (carte de Kora) s'il possède une autre carte légale en main.
 * - Ne cherche jamais à couper agressivement ni à optimiser.
 */
export function selectNeutralCard(hand: Card[], leadSuit: Suit | null): Card {
  if (!hand || hand.length === 0) {
    throw new Error('Cannot select neutral card from empty hand');
  }

  // 1. Si une couleur est demandée
  if (leadSuit) {
    const matchingCards = (hand || []).filter((c) => c.suit === leadSuit);
    if (matchingCards.length > 0) {
      // Priorité : carte la plus faible nominalement hors 3 (Kora)
      const nonThreeCards = matchingCards.filter((c) => c.value !== 3);
      if (nonThreeCards.length > 0) {
        return [...nonThreeCards].sort((a, b) => a.value - b.value)[0];
      }
      // Si la main ne contient que des 3 dans la couleur demandée
      return matchingCards[0];
    }
  }

  // 2. Si aucune carte de la couleur demandée ou si c'est l'entame :
  // Défausse la carte la plus faible hors 3
  const nonThreeAll = (hand || []).filter((c) => c.value !== 3);
  if (nonThreeAll.length > 0) {
    return [...nonThreeAll].sort((a, b) => a.value - b.value)[0];
  }

  // 3. Cas extrême : la main ne contient que des 3
  return hand[0];
}

export class ServerGameEngine {
  public static getConfig(activeRoomState?: ActiveRoomState): KatikaEngineConfig {
    return activeRoomState?.engineConfig || getEngineConfig();
  }

  public static startNewGame(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    this.clearAllTimers(activeRoomState);

    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    // Keep only human players initially to reset bot roster cleanly (connected humans prioritized)
    const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected !== false);
    const disconnectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected === false);
    const humanPlayers = [...connectedHumans, ...disconnectedHumans];
    let currentPlayers: RoomPlayer[] = humanPlayers.slice(0, maxCapacity);

    // If fillWithBots is enabled and room not full, add bots
    if (room.fillWithBots && currentPlayers.length < maxCapacity) {
      const botsToAdd = maxCapacity - currentPlayers.length;
      const engineCfg = this.getConfig(activeRoomState);
      const botProfiles = getRandomBotProfiles(botsToAdd, engineCfg.hokutoSpawnRatePct);
      for (let i = 0; i < botsToAdd; i++) {
        const profile = botProfiles[i];
        const isRobam = profile.name === 'Robam Hokuto';
        currentPlayers.push({
          id: `bot_${Math.random().toString(36).substring(2, 8)}`,
          name: profile.name,
          isHost: false,
          isHuman: false,
          avatarSeed: profile.avatarSeed,
          score: room.initialCapital,
          capital: room.initialCapital,
          isEliminated: false,
          isSpectator: false,
          isPendingIntegration: false,
          hand: [],
          tricksWonInRound: 0,
          aiStrategy: isRobam ? 'HOKUTO_ADAPTIVE' : getRandomBotStrategy(false),
          connected: true,
          isReady: true,
        });
      }
    }

    // Prepare deck and deal
    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, currentPlayers.length);

    // Initial pot from baseBet of all players
    const baseBet = room.baseBet;
    const initialCapital = room.initialCapital;
    let pot = 0;

    // Update room.players in exact 1:1 order with current active game players
    room.players = currentPlayers;

    const gamePlayers: Player[] = currentPlayers.map((p, idx) => {
      const actualHand = hands[idx];
      const newCapital = Math.max(0, initialCapital - baseBet);
      pot += baseBet;

      p.hand = actualHand;
      p.capital = newCapital;
      p.score = initialCapital;

      return {
        id: p.id,
        name: p.name,
        score: initialCapital,
        capital: newCapital,
        isEliminated: false,
        hand: actualHand,
        isHuman: p.isHuman,
        avatarSeed: p.avatarSeed,
        tricksWonInRound: 0,
        basePersonality: p.aiStrategy || 'CONSERVATIVE',
        aiStrategy: p.aiStrategy || 'CONSERVATIVE',
      };
    });

    const dealerIndex = 0;
    const leadIndex = (dealerIndex + 1) % gamePlayers.length;

    const initialTrick: Trick = {
      trickNumber: 1,
      leadSuit: null,
      leadPlayerIndex: leadIndex,
      leadPlayerName: gamePlayers[leadIndex].name,
      plays: [],
      winnerIndex: null,
      winnerName: null,
      winningCard: null,
      isComplete: false,
    };

    const initialGameState: GameState = {
      phase: 'PLAYING',
      players: gamePlayers,
      pot,
      baseBet,
      initialBaseBet: room.initialBaseBet || baseBet,
      initialCapital,
      enableDoubleKora: room.enableDoubleKora ?? true,
      enableUnder21: room.enableUnder21 ?? true,
      showBotPersonalityIcons: false,
      enableKoraHunterAlerts: true,
      dealerIndex,
      leadIndex,
      currentTurnIndex: leadIndex,
      currentTrickNumber: 1,
      currentTrick: initialTrick,
      tricksHistory: [],
      partieWinnerIndex: null,
      partieWinnerName: null,
      partieWinType: null,
      consecutiveThreesCountByPlayer: {},
      doubleKoraAchievedByPlayer: {},
      mancheWinnerIndex: null,
      mancheWinnerName: null,
      roundWinnerIndex: null,
      roundWinnerName: null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      humanSelectedCardId: null,
      partieCount: 1,
      roundCount: 1,
      turnStartedAt: Date.now(),
    };

    room.status = 'PLAYING';
    room.manchePartiesPlayed = 0;
    room.integrationProposal = null;

    const seatedPlayerIds = new Set(currentPlayers.map((p) => p.id));
    const spectators = (room.players || []).filter((p) => !seatedPlayerIds.has(p.id)).map((p) => ({
      ...p,
      isSpectator: true,
      hand: [],
      readyForNextPartie: false,
    }));

    room.players = [
      ...currentPlayers.map((p, idx) => ({
        ...p,
        name: p.name.replace(/\s*\(Obs\)$/, ''),
        isSpectator: false,
        isPendingIntegration: false,
        isEliminated: false,
        isForfeit: false,
        hand: gamePlayers[idx].hand,
        capital: gamePlayers[idx].capital,
        score: gamePlayers[idx].score,
        tricksWonInRound: 0,
        isReady: true,
        readyForNextPartie: false,
        connected: p.connected !== false,
      })),
      ...spectators,
    ];
    room.gameState = initialGameState;
    room.updatedAt = Date.now();

    // Check Instant Win on deal (Three Sevens & Under 21)
    if (this.checkInstantWinOnDeal(room, onStateChange, activeRoomState)) {
      return;
    }

    onStateChange(room);

    // Schedule turn timer or bot play
    this.scheduleTurnAction(room, onStateChange, activeRoomState);
  }

  /**
   * Checks for instant win conditions (Three Sevens, Under 21) immediately after dealing.
   * Returns true if an instant win occurred.
   */
  private static checkInstantWinOnDeal(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): boolean {
    const gs = room.gameState;
    if (!gs) return false;

    // Check A: Three Sevens (777)
    let threeSevensWinnerIdx: number | null = null;
    (gs.players || []).forEach((player, pIdx) => {
      if (!player.isEliminated && (player.hand || []).length > 0) {
        const sevensCount = (player.hand || []).filter((c) => c.value === 7).length;
        if (sevensCount >= 3) {
          threeSevensWinnerIdx = pIdx;
        }
      }
    });

    if (threeSevensWinnerIdx !== null) {
      const winner = gs.players[threeSevensWinnerIdx];
      const count = (winner.hand || []).filter((c) => c.value === 7).length;
      const reveal: InstantWinReveal = {
        winnerIndex: threeSevensWinnerIdx,
        winnerName: winner.name,
        winType: 'THREE_SEVENS',
        hand: [...winner.hand],
        scoreOrCount: count,
      };
      this.triggerInstantWinReveal(room, reveal, onStateChange, activeRoomState);
      return true;
    }

    // Check B: Moins de 21 points (<= 21)
    if (gs.enableUnder21) {
      let under21WinnerIdx: number | null = null;
      let lowestSum = 999;

      (gs.players || []).forEach((player, pIdx) => {
        if (!player.isEliminated && (player.hand || []).length === 5) {
          const sum = (player.hand || []).reduce((acc, c) => acc + c.value, 0);
          if (sum <= 21 && sum < lowestSum) {
            lowestSum = sum;
            under21WinnerIdx = pIdx;
          }
        }
      });

      if (under21WinnerIdx !== null) {
        const winner = gs.players[under21WinnerIdx];
        const reveal: InstantWinReveal = {
          winnerIndex: under21WinnerIdx,
          winnerName: winner.name,
          winType: 'UNDER_21',
          hand: [...winner.hand],
          scoreOrCount: lowestSum,
        };
        this.triggerInstantWinReveal(room, reveal, onStateChange, activeRoomState);
        return true;
      }
    }

    return false;
  }

  private static triggerInstantWinReveal(
    room: MultiplayerRoom,
    reveal: InstantWinReveal,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    // Neutralize turn indicator so no player gets a 15s timer
    gs.currentTurnIndex = -1;

    const cfg = this.getConfig(activeRoomState);
    reveal.expiresAt = Date.now() + cfg.instantWinAnimationTimeMs;

    // Set reveal object in room & gameState
    gs.instantWinReveal = reveal;
    room.instantWinReveal = reveal;
    room.updatedAt = Date.now();

    // Broadcast reveal to all players
    onStateChange(room);

    // After Xms (matching solo mode dramatic reveal duration), proceed to resolve instant win and show EndRoundModal
    activeRoomState.instantWinTimer = setTimeout(() => {
      // Re-fetch the fresh room reference to avoid closure state staleness if firestore synced
      const { RoomManager } = require('../rooms/roomManager');
      const activeRoom = RoomManager.getRoom(room.id) || room;
      
      if (activeRoom.gameState) {
        activeRoom.gameState.instantWinReveal = null;
      }
      activeRoom.instantWinReveal = null;
      
      this.resolveInstantWin(activeRoom, reveal.winnerIndex, reveal.winType, onStateChange, activeRoomState);
    }, cfg.instantWinAnimationTimeMs);
  }

  private static resolveInstantWin(
    room: MultiplayerRoom,
    winnerIndex: number,
    winType: 'THREE_SEVENS' | 'UNDER_21',
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    const winner = gs.players[winnerIndex];
    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';

    gs.partieWinnerIndex = winnerIndex;
    gs.partieWinnerName = winner.name;
    gs.partieWinType = winType;
    gs.roundWinnerIndex = winnerIndex;
    gs.roundWinnerName = winner.name;

    // Award pot to winner (with global rake deducted if configured)
    const previousPot = gs.pot;
    const cfg = this.getConfig(activeRoomState);
    const rakeAmount = 0; // cfg.globalRakePct > 0 ? Math.floor((previousPot * cfg.globalRakePct) / 100) : 0; (Désactivé en mode virtuel)
    const netPot = previousPot - rakeAmount;
    winner.capital += netPot;
    winner.score = winner.capital;
    gs.pot = 0;

    // Check eliminations
    let nonEliminatedCount = 0;
    let lastStandingPlayer: Player | null = null;

    (gs.players || []).forEach((p) => {
      if (p.capital < gs.baseBet) {
        p.isEliminated = true;
      } else {
        nonEliminatedCount++;
        lastStandingPlayer = p;
      }
      p.score = p.capital;
    });

    if (nonEliminatedCount <= 1 && lastStandingPlayer) {
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
      gs.mancheWinnerName = (lastStandingPlayer as Player).name;
    }

    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          readyForNextPartie: false,
        };
      }
      return rp;
    });

    room.previousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: winner.name,
      winType,
      potWon: netPot,
      playersSummary: (gs.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        deltaCapital: p.id === winner.id ? netPot - gs.baseBet : -gs.baseBet,
        finalCapital: p.capital,
      })),
    };

    const transitionDelay = cfg.transitionDelayMs;
    room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
    room.manchePartiesPlayed = (room.manchePartiesPlayed || 0) + 1;
    room.updatedAt = Date.now();
    onStateChange(room);

    activeRoomState.nextPartieTimer = setTimeout(() => {
      this.advanceToNextPartie(room, onStateChange, activeRoomState);
    }, transitionDelay);
  }

  public static handlePlayCard(
    room: MultiplayerRoom,
    playerId: string,
    cardId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    isAutoPlayedByEmergencyBot: boolean = false
  ): boolean {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') {
      return false;
    }

    const currentPlayer = gs.players[gs.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      // Not player's turn
      return false;
    }

    // Network tolerance buffer (1000ms):
    // Compare arrival timestamp with turn expiration. If human player played within tolerance (1000ms),
    // or if the bot has not yet finalized a move, accept the play cleanly.
    if (!isAutoPlayedByEmergencyBot) {
      const roomPlayer = (room.players || []).find((p) => p.id === playerId);
      const isConnected = roomPlayer ? roomPlayer.connected : true;
      if (isConnected && gs.turnStartedAt) {
        const nominalTurnMs = (room.turnTimerSeconds || 15) * 1000;
        const graceDeadline = gs.turnStartedAt + nominalTurnMs + 1000;
        if (Date.now() > graceDeadline && !activeRoomState.botMoveTimer) {
          console.log(`[PlayCard] Card from ${currentPlayer.name} rejected: received beyond network grace buffer (Tour expiré)`);
          return false;
        }
      }
    }

    const cardIndex = (currentPlayer.hand || []).findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      // Card not in hand
      return false;
    }

    const card = currentPlayer.hand[cardIndex];
    if (!isCardPlayable(card, currentPlayer.hand, gs.currentTrick.leadSuit)) {
      // Illegal card play
      return false;
    }

    // Play is legal! Clear timers
    this.clearAllTimers(activeRoomState);
    if (activeRoomState.consecutiveTimeouts) {
      activeRoomState.consecutiveTimeouts.set(playerId, 0);
    }
    if (!isAutoPlayedByEmergencyBot) {
      currentPlayer.consecutiveMissedTurns = 0;
      const roomPlayer = (room.players || []).find((p) => p.id === playerId);
      if (roomPlayer) {
        roomPlayer.consecutiveMissedTurns = 0;
      }
    }

    // Update trick
    const isLeadCard = gs.currentTrick.plays.length === 0;
    const leadSuit = isLeadCard ? card.suit : gs.currentTrick.leadSuit;

    // Check if card is winning so far
    const playedCard: PlayedCard = {
      card,
      playerIndex: gs.currentTurnIndex,
      playerName: currentPlayer.name,
      playerId: currentPlayer.id,
      isLeadCard,
      isMatchingSuit: card.suit === leadSuit,
      isWinningSoFar: false,
      playedOrder: gs.currentTrick.plays.length + 1,
      isAutoPlayedByEmergencyBot,
      autoPlaySeconds: isAutoPlayedByEmergencyBot ? 20 : undefined,
    };

    const newPlays = [...gs.currentTrick.plays, playedCard];
    const { winnerPlay } = determineTrickWinner(newPlays, leadSuit);
    const updatedPlays = newPlays.map((p) => ({
      ...p,
      isWinningSoFar: winnerPlay ? p.card.id === winnerPlay.card.id : false,
    }));

    // Remove card from hand
    if(currentPlayer.hand) currentPlayer.hand.splice(cardIndex, 1);

    // Update room.players hand as well
    const roomPlayer = (room.players || []).find((p) => p.id === playerId);
    if (roomPlayer) {
      roomPlayer.hand = [...currentPlayer.hand];
    }

    gs.currentTrick = {
      ...gs.currentTrick,
      leadSuit,
      plays: updatedPlays,
    };

    const activePlayersCount = (gs.players || []).filter((p) => !p.isEliminated && !p.isFoldedInRound && !p.isForfeit).length;

    // Check if trick is complete
    if (gs.currentTrick.plays.length >= activePlayersCount) {
      // Trick is finished
      gs.phase = 'TRICK_RESOLVED';
      const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, leadSuit);
      const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
      const winner = gs.players[winnerIndex];

      gs.currentTrick.winnerIndex = winnerIndex;
      gs.currentTrick.winnerName = winner.name;
      gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
      gs.currentTrick.isComplete = true;

      winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
      const roomWinner = (room.players || []).find((p) => p.id === winner.id);
      if (roomWinner) {
        roomWinner.tricksWonInRound = winner.tricksWonInRound;
      }

      room.updatedAt = Date.now();
      onStateChange(room);

      // Delay for fluid trick appreciation and sweep animation
      const cfg = this.getConfig(activeRoomState);
      activeRoomState.trickResolutionTimer = setTimeout(() => {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }, cfg.trickResolutionTimeMs);

      return true;
    }

    // Trick continues to next player
    let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
    while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isFoldedInRound || gs.players[nextIndex].isForfeit) {
      nextIndex = (nextIndex + 1) % (gs.players || []).length;
    }

    gs.currentTurnIndex = nextIndex;
    gs.turnStartedAt = Date.now();
    room.updatedAt = Date.now();
    onStateChange(room);

    // Schedule turn for next player
    this.scheduleTurnAction(room, onStateChange, activeRoomState);
    return true;
  }

  private static resolveCompletedTrick(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    gs.tricksHistory.push(gs.currentTrick);
    let winnerIndex = gs.currentTrick.winnerIndex ?? gs.leadIndex;

    // Question 2: If the trick winner was eliminated/forfeited, trick is burned and lead passes to next active player
    const isWinnerEliminated = gs.players[winnerIndex].isEliminated || gs.players[winnerIndex].isForfeit;
    if (isWinnerEliminated) {
      gs.currentTrick.winnerIndex = null;
      gs.currentTrick.winnerName = 'Cartes brûlées (Joueur éliminé)';
      gs.players[winnerIndex].tricksWonInRound = Math.max(0, (gs.players[winnerIndex].tricksWonInRound || 1) - 1);
      let nextLead = (winnerIndex + 1) % (gs.players || []).length;
      let loops = 0;
      while ((gs.players[nextLead].isEliminated || gs.players[nextLead].isForfeit) && loops < (gs.players || []).length) {
        nextLead = (nextLead + 1) % (gs.players || []).length;
        loops++;
      }
      winnerIndex = nextLead;
    }

    // If trick 4 was won with a 3, track for potential Double Kora in trick 5
    if (gs.currentTrickNumber === 4 && gs.currentTrick.winningCard?.value === 3) {
      gs.consecutiveThreesCountByPlayer = {
        ...(gs.consecutiveThreesCountByPlayer || {}),
        [winnerIndex]: 1,
      };
    }

    if (gs.currentTrickNumber < 5) {
      // Start next trick
      const nextTrickNum = gs.currentTrickNumber + 1;
      gs.currentTrickNumber = nextTrickNum;
      gs.leadIndex = winnerIndex;
      gs.currentTurnIndex = winnerIndex;
      gs.currentTrick = {
        trickNumber: nextTrickNum,
        leadSuit: null,
        leadPlayerIndex: winnerIndex,
        leadPlayerName: gs.players[winnerIndex].name,
        plays: [],
        winnerIndex: null,
        winnerName: null,
        winningCard: null,
        isComplete: false,
      };
      gs.phase = 'PLAYING';
      gs.turnStartedAt = Date.now();
      room.updatedAt = Date.now();
      onStateChange(room);

      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    } else {
      // All 5 tricks are complete -> Partie Over!
      this.resolvePartieOver(room, onStateChange, activeRoomState);
    }
  }

  private static resolvePartieOver(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';

    // The winner of the 5th trick wins the standard partie!
    const lastTrick = gs.tricksHistory[gs.tricksHistory.length - 1];
    const fifthTrickWinnerIndex = lastTrick.winnerIndex ?? 0;
    const fifthTrickWinner = gs.players[fifthTrickWinnerIndex];
    const isFifthTrickWonWithThree = lastTrick.winningCard?.value === 3;

    // Check Trick 4 to detect Double Kora (same player won trick 4 with a 3 and trick 5 with a 3)
    const fourthTrick = gs.tricksHistory.find((t) => t.trickNumber === 4) || gs.tricksHistory[3];
    const isFourthTrickWonWithThree = Boolean(
      fourthTrick &&
      fourthTrick.winnerIndex === fifthTrickWinnerIndex &&
      fourthTrick.winningCard?.value === 3
    );

    let winType: PartieWinType = 'STANDARD';
    let multiplier = 1;
    const partieWinnerIndex = fifthTrickWinnerIndex;

    if (isFifthTrickWonWithThree) {
      if (isFourthTrickWonWithThree && gs.enableDoubleKora) {
        winType = 'DOUBLE_KORA';
        multiplier = 4;
        gs.doubleKoraAchievedByPlayer = {
          ...(gs.doubleKoraAchievedByPlayer || {}),
          [partieWinnerIndex]: true,
        };
      } else {
        winType = 'KORA';
        multiplier = 2;
      }
    }

    const winner = gs.players[partieWinnerIndex];
    gs.partieWinnerIndex = partieWinnerIndex;
    gs.partieWinnerName = winner.name;
    gs.partieWinType = winType;
    gs.roundWinnerIndex = partieWinnerIndex;
    gs.roundWinnerName = winner.name;

    // Record capital before payout for accurate delta calculation
    const capitalsBefore: Record<string, number> = {};
    (gs.players || []).forEach((p) => {
      capitalsBefore[p.id] = p.capital;
    });

    // Collect extra penalty chips from losers if Kora (x2) or Double Kora (x4)
    let totalExtraCollected = 0;
    if (multiplier > 1) {
      const extraCostPerLoser = (multiplier - 1) * gs.baseBet;
      (gs.players || []).forEach((p, idx) => {
        // Official Fold rule: All losers who actively participated in this partie or folded during it pay the Kora/Double Kora penalty
        const participatedInThisPartie = gs.tricksHistory.some((t) => t.plays.some((play) => play.playerIndex === idx)) || p.isFoldedInRound;
        if (idx !== partieWinnerIndex && participatedInThisPartie) {
          const penalty = Math.min(p.capital, extraCostPerLoser);
          p.capital = Math.max(0, p.capital - penalty);
          p.score = p.capital;
          totalExtraCollected += penalty;
          if (p.isFoldedInRound) {
            const emote: EmoteMessage = {
              id: 'em_' + Math.random().toString(36).substring(2, 9),
              playerId: 'system',
              playerName: 'Table',
              text: `⚖️ Règle officielle de l'abandon : ${p.name} ayant abandonné subit la pénalité ${multiplier === 4 ? 'Double Kora (x4)' : 'Kora (x2)'} de ${penalty} 🪙.`,
              emoji: '⚖️',
              timestamp: Date.now(),
              isBot: true,
            };
            room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
          }
        }
      });
    }

    // Distribute pot + extra penalty to winner (applying global rake if configured)
    const totalWon = gs.pot + totalExtraCollected;
    const cfg = this.getConfig(activeRoomState);
    const rakeAmount = 0; // cfg.globalRakePct > 0 ? Math.floor((totalWon * cfg.globalRakePct) / 100) : 0; (Désactivé en mode virtuel)
    const netWon = totalWon - rakeAmount;
    winner.capital += netWon;
    winner.score = winner.capital;
    gs.pot = 0;

    // Check eliminations (capital < baseBet)
    let nonEliminatedCount = 0;
    let lastStandingPlayer: Player | null = null;

    (gs.players || []).forEach((p) => {
      if (p.capital < gs.baseBet) {
        p.isEliminated = true;
      } else {
        nonEliminatedCount++;
        lastStandingPlayer = p;
      }
      p.score = p.capital;
    });

    // Check if Manche Over (only 1 player remaining with chips)
    if (nonEliminatedCount <= 1 && lastStandingPlayer) {
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
      gs.mancheWinnerName = (lastStandingPlayer as Player).name;
    }

    // Sync room.players
    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          readyForNextPartie: false,
        };
      }
      return rp;
    });

    // Create summary with true net delta (including the initial baseBet ante paid at start)
    room.previousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: winner.name,
      winType,
      potWon: netWon,
      winningCard: lastTrick.winningCard || undefined,
      playersSummary: (gs.players || []).map((p) => {
        const participated = gs.tricksHistory.some((t) => t.plays.some((play) => play.playerId === p.id));
        const delta = p.id === winner.id
          ? netWon - gs.baseBet
          : (p.capital - (capitalsBefore[p.id] || p.capital)) - (participated ? gs.baseBet : 0);
        return {
          id: p.id,
          name: p.name,
          deltaCapital: delta,
          finalCapital: p.capital,
        };
      }),
    };

    // Auto-advance timestamp only for next partie if manche is still ongoing
    if (gs.phase !== 'MANCHE_OVER') {
      const transitionDelay = cfg.transitionDelayMs;
      room.roundEndAutoAdvanceAt = cfg.allowAutoAdvance !== false ? Date.now() + transitionDelay : null;
      room.manchePartiesPlayed = (room.manchePartiesPlayed || 0) + 1;
      if (cfg.allowAutoAdvance !== false) {
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, transitionDelay);
      }
    } else {
      room.roundEndAutoAdvanceAt = null;
    }
    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static advanceToNextPartie(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    this.clearAllTimers(activeRoomState);
    activeRoomState.onPartieCompleted?.(room);

    const gs = room.gameState;
    if (!gs || room.status === 'MANCHE_OVER') {
      return;
    }

    // Integrate pending human players if any (e.g. accepted during the previous partie)
    const pendingHumans = (room.players || []).filter((p) => p.isPendingIntegration && !p.isEliminated);
    for (const pendingPlayer of pendingHumans) {
      // Clean candidate display name
      const cleanName = pendingPlayer.name.replace(/\s*\((Obs|E)\)\s*$/gi, '').trim();
      pendingPlayer.name = cleanName;

      // Find candidate bots in gs.players
      const botEntries = gs.players
        .map((p, index) => ({
          id: p.id,
          name: p.name,
          capital: p.capital,
          tricksWonInRound: p.tricksWonInRound,
          index,
          isHuman: p.isHuman,
        }))
        .filter((p) => !p.isHuman);

      const botToReplace = selectBotToReplace(botEntries);
      if (botToReplace) {
        const replacedBotName = botToReplace.name;
        const prorataCap = pendingPlayer.prorataCapital !== undefined
          ? pendingPlayer.prorataCapital
          : Math.max(gs.baseBet, room.initialCapital - ((room.manchePartiesPlayed || 0) * gs.baseBet));

        // Replace in gs.players at exact seat
        gs.players[botToReplace.index] = {
          id: pendingPlayer.id,
          name: cleanName,
          score: prorataCap,
          capital: prorataCap,
          isEliminated: false,
          hand: [],
          isHuman: true,
          avatarSeed: pendingPlayer.avatarSeed,
          tricksWonInRound: 0,
        };

        // Remove replaced bot from room.players and activate human
        room.players = (room.players || []).filter((p) => p.id !== botToReplace.id);
        const rp = (room.players || []).find((p) => p.id === pendingPlayer.id);
        if (rp) {
          rp.name = cleanName;
          rp.isSpectator = false;
          rp.isPendingIntegration = false;
          rp.capital = prorataCap;
          rp.score = prorataCap;
          rp.isReady = true;
          rp.readyForNextPartie = true;
        }

        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `🎉 ${cleanName} intègre la table (remplace ${replacedBotName}) avec ${prorataCap} 🪙 !`,
          emoji: '👋',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      }
    }

    // Deduplicate room.players and gs.players to strictly prevent ghost clone seats
    const seenIds = new Set<string>();
    room.players = (room.players || []).filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    const seenGsIds = new Set<string>();
    gs.players = (gs.players || []).filter((p) => {
      if (seenGsIds.has(p.id)) return false;
      seenGsIds.add(p.id);
      return true;
    });
    room.integrationProposal = null;

    // Revive reconnected human players who were previously forfeited due to disconnection and have enough chips
    (room.players || []).forEach((rp) => {
      if (rp.isHuman && rp.connected) {
        const gp = (gs.players || []).find((g) => g.id === rp.id);
        if (gp && gp.isForfeit && rp.capital >= gs.baseBet) {
          rp.isForfeit = false;
          rp.isEliminated = false;
          rp.isSpectator = false;
          rp.isAiRelay = false;
          gp.isForfeit = false;
          gp.isEliminated = false;
          gp.isAiRelay = false;
          
          console.log(`[Revive] Reconnected player ${rp.name} reinstated for the next partie.`);
          
          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `🔄 ${rp.name} s'est reconnecté et participe à cette nouvelle partie !`,
            emoji: '🔄',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        }
      }
    });

    // Check disconnected human players at start of new partie:
    // Any player not connected is declared forfeit for this partie
    (room.players || []).forEach((p) => {
      if (p.isHuman && !p.connected && !p.isEliminated) {
        const wasAlreadyForfeit = p.isForfeit;
        p.isForfeit = true;
        p.isAiRelay = false;
        p.hand = [];
        const gp = (gs.players || []).find((g) => g.id === p.id);
        if (gp) {
          gp.isForfeit = true;
          gp.isAiRelay = false;
          gp.hand = [];
        }

        if (!wasAlreadyForfeit) {
          console.log(`[Pre-Deal Forfeit] Player ${p.name} offline at start of next partie. Declaring forfeit for this partie.`);
          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `🚪 ${p.name} n'est pas connecté : forfait pour cette donne.`,
            emoji: '🚪',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        }
      }
    });

    // Reset missed turns counter for connected players
    (room.players || []).forEach((p) => {
      if (p.connected) {
        p.consecutiveMissedTurns = 0;
      }
    });
    (gs.players || []).forEach((gp) => {
      if (gp.connected) {
        gp.consecutiveMissedTurns = 0;
      }
    });

    // Host migration if host was disconnected/forfeited/eliminated
    const hostPlayer = (room.players || []).find((p) => p.id === room.hostId);
    if (!hostPlayer || !hostPlayer.connected || hostPlayer.isForfeit || hostPlayer.isEliminated) {
      const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit) ||
                       (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit) ||
                       (room.players || []).find((p) => !p.isEliminated && !p.isForfeit) ||
                       room.players[0];
      if (nextHost && nextHost.id !== room.hostId) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
        nextHost.isHost = true;
      }
    }

    // Check remaining active humans in the room:
    const activeHumans = (room.players || []).filter((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.connected);
    const inGraceHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isEliminated && !p.connected && p.disconnectGraceExpiresAt && Date.now() < p.disconnectGraceExpiresAt
    );

    if (activeHumans.length === 0) {
      if (inGraceHumans.length > 0) {
        // Wait for player reconnection grace period before concluding
        const waitMs = Math.max(1500, Math.min(30000, (inGraceHumans[0].disconnectGraceExpiresAt || 0) - Date.now()));
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, waitMs);
        onStateChange(room);
        return;
      }

      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      onStateChange(room);
      return;
    }

    // Check active players (human + bots) with sufficient chips who are NOT eliminated and NOT forfeit
    const activePlayers = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && p.capital >= gs.baseBet);
    if (activePlayers.length <= 1) {
      // Only 1 player left overall with enough chips: they win the entire manche!
      const lastStandingPlayer = activePlayers[0] || (gs.players || []).find((p) => !p.isEliminated && !p.isForfeit) || gs.players[0];
      const soleGp = (gs.players || []).find((p) => p.id === lastStandingPlayer.id);
      const potWon = gs.pot;
      if (soleGp) {
        soleGp.capital += potWon;
        soleGp.score = soleGp.capital;
      }
      const roomP = (room.players || []).find((p) => p.id === lastStandingPlayer.id);
      if (roomP) {
        roomP.capital += potWon;
        roomP.score = roomP.capital;
      }
      gs.pot = 0;

      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      const wIdx = (gs.players || []).findIndex((p) => p.id === lastStandingPlayer.id);
      gs.mancheWinnerIndex = wIdx !== -1 ? wIdx : 0;
      gs.mancheWinnerName = lastStandingPlayer.name;
      gs.partieWinnerIndex = gs.mancheWinnerIndex;
      gs.partieWinnerName = lastStandingPlayer.name;
      gs.partieWinType = 'STANDARD';

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🏆 Victoire de la manche pour ${lastStandingPlayer.name} !`,
        emoji: '👑',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const nextPartieCount = (gs.partieCount || 1) + 1;

    // Automatic Stake Escalation (Anti-stagnation)
    const engineConfig = this.getConfig(activeRoomState);
    if (engineConfig.enableAutoBetEscalation !== false && nextPartieCount > 1) {
      const interval = engineConfig.autoBetEscalationInterval || 5;
      if ((nextPartieCount - 1) % interval === 0) {
        const initialBet = room.initialBaseBet || gs.initialBaseBet || room.baseBet || 10;
        const maxMultiplier = engineConfig.maxAutoBetMultiplier || 4;
        const maxAllowedBet = initialBet * maxMultiplier;
        const ratePct = (engineConfig.autoBetEscalationRatePct || 50) / 100;
        const increaseStep = Math.max(5, Math.round(gs.baseBet * ratePct));
        const targetBet = gs.baseBet + increaseStep;

        // Ensure no active non-eliminated player is priced out by the ante increase alone
        const minActiveCap = Math.min(...activePlayers.map((p) => p.capital));
        const newEscalatedBet = Math.min(targetBet, maxAllowedBet, minActiveCap);

        if (newEscalatedBet > gs.baseBet) {
          const oldBet = gs.baseBet;
          gs.baseBet = newEscalatedBet;
          room.baseBet = newEscalatedBet;

          const escalationEmote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `⚡ Escalade automatique ! La mise passe de ${oldBet} à ${newEscalatedBet} 🪙 (palier donne #${nextPartieCount}).`,
            emoji: '⚡',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), escalationEmote].slice(-5);
        }
      }
    }

    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, activePlayers.length);

    let pot = 0;
    let handIdx = 0;
    (gs.players || []).forEach((p) => {
      p.tricksWonInRound = 0;
      p.isFoldedInRound = false;
      if (!p.isEliminated && !p.isForfeit && p.capital >= gs.baseBet) {
        p.hand = hands[handIdx++] || [];
        p.capital = Math.max(0, p.capital - gs.baseBet);
        p.score = p.capital;
        pot += gs.baseBet;
      } else {
        p.hand = [];
        if (p.capital < gs.baseBet) {
          p.isEliminated = true;
        }
      }
    });

    // Strictly sync room.players hands and state with gs.players
    (room.players || []).forEach((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        rp.hand = [...gp.hand];
        rp.capital = gp.capital;
        rp.score = gp.capital;
        rp.isEliminated = gp.isEliminated;
        rp.isForfeit = gp.isForfeit;
      } else {
        rp.hand = [];
      }
    });

    // Dealer is the winner of the previous round (or fallback to rotation if not found or eliminated/forfeited)
    const prevWinnerIdx = gs.partieWinnerIndex ?? gs.roundWinnerIndex;
    let nextDealer = (prevWinnerIdx !== null && prevWinnerIdx !== undefined && !gs.players[prevWinnerIdx]?.isEliminated && !gs.players[prevWinnerIdx]?.isForfeit)
      ? prevWinnerIdx
      : (gs.dealerIndex + 1) % (gs.players || []).length;
    let dealerLoops = 0;
    while ((gs.players[nextDealer].isEliminated || gs.players[nextDealer].isForfeit) && dealerLoops < (gs.players || []).length) {
      nextDealer = (nextDealer + 1) % (gs.players || []).length;
      dealerLoops++;
    }

    let nextLead = (nextDealer + 1) % (gs.players || []).length;
    let leadLoops = 0;
    while ((gs.players[nextLead].isEliminated || gs.players[nextLead].isForfeit) && leadLoops < (gs.players || []).length) {
      nextLead = (nextLead + 1) % (gs.players || []).length;
      leadLoops++;
    }

    gs.phase = 'PLAYING';
    room.status = 'PLAYING';
    gs.pot = pot;
    gs.dealerIndex = nextDealer;
    gs.leadIndex = nextLead;
    gs.currentTurnIndex = nextLead;
    gs.currentTrickNumber = 1;
    gs.currentTrick = {
      trickNumber: 1,
      leadSuit: null,
      leadPlayerIndex: nextLead,
      leadPlayerName: gs.players[nextLead].name,
      plays: [],
      winnerIndex: null,
      winnerName: null,
      winningCard: null,
      isComplete: false,
    };
    gs.tricksHistory = [];
    gs.partieWinnerIndex = null;
    gs.partieWinnerName = null;
    gs.partieWinType = null;
    gs.partieCount = nextPartieCount;
    gs.roundCount = nextPartieCount;
    gs.turnStartedAt = Date.now();
    room.roundEndAutoAdvanceAt = null;

    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          isSpectator: false,
          isPendingIntegration: false,
          hand: gp.hand || [],
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          isForfeit: gp.isForfeit,
          isFoldedInRound: false,
          readyForNextPartie: false,
        };
      }
      return {
        ...rp,
        isSpectator: true,
        hand: [],
        readyForNextPartie: false,
      };
    });

    room.updatedAt = Date.now();

    // Check Instant Win on next deal
    if (this.checkInstantWinOnDeal(room, onStateChange, activeRoomState)) {
      return;
    }

    onStateChange(room);

    this.scheduleTurnAction(room, onStateChange, activeRoomState);
  }

  public static scheduleTurnAction(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    if (activeRoomState.turnTimeoutTimer) {
      clearTimeout(activeRoomState.turnTimeoutTimer);
      activeRoomState.turnTimeoutTimer = null;
    }
    if (activeRoomState.botMoveTimer) {
      clearTimeout(activeRoomState.botMoveTimer);
      activeRoomState.botMoveTimer = null;
    }

    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') {
      return;
    }

    const activePlayersWithCards = (gs.players || []).filter(
      (p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound && p.hand && p.hand.length > 0
    );

    // If nobody has cards remaining to play, resolve the completed trick
    if (activePlayersWithCards.length === 0) {
      if (gs.currentTrick && gs.currentTrick.plays.length > 0) {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }
      return;
    }

    // Advance currentTurnIndex to a valid player who has cards and is not eliminated/forfeit/folded
    let safetySkip = 0;
    while (
      safetySkip < (gs.players || []).length &&
      (!gs.players[gs.currentTurnIndex] ||
        gs.players[gs.currentTurnIndex].isEliminated ||
        gs.players[gs.currentTurnIndex].isForfeit ||
        gs.players[gs.currentTurnIndex].isFoldedInRound ||
        !gs.players[gs.currentTurnIndex].hand ||
        !(gs.players[gs.currentTurnIndex].hand) || gs.players[gs.currentTurnIndex].hand.length === 0)
    ) {
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      safetySkip++;
    }

    const currentPlayer = gs.players[gs.currentTurnIndex];
    if (!currentPlayer || currentPlayer.isEliminated || currentPlayer.isForfeit || !currentPlayer.hand || (currentPlayer.hand || []).length === 0) {
      if (gs.currentTrick && gs.currentTrick.plays.length > 0) {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }
      return;
    }

    const isBot = !currentPlayer.isHuman;
    const isDisconnected = !(room.players || []).find((p) => p.id === currentPlayer.id)?.connected;

    if (isBot || isDisconnected || currentPlayer.isAiRelay) {
      // Bot or AI Relay plays after a realistic thinking delay
      const cfg = this.getConfig(activeRoomState);
      const thinkDelay = isDisconnected ? 800 : cfg.botThinkTimeMs;
      activeRoomState.botMoveTimer = setTimeout(() => {
        this.executeBotMove(room, currentPlayer, onStateChange, activeRoomState);
      }, thinkDelay);
      return;
    }

    // Turn Timer calculation:
    // If player is connected: standard turn timer (e.g. 15s) + 500ms network buffer
    let effectiveTimerMs = (room.turnTimerSeconds || 15) * 1000 + 500;
    gs.turnStartedAt = Date.now();

    activeRoomState.turnTimeoutTimer = setTimeout(() => {
      if (!activeRoomState.consecutiveTimeouts) {
        activeRoomState.consecutiveTimeouts = new Map<string, number>();
      }

      const playerDisconnected = !(room.players || []).find((p) => p.id === currentPlayer.id)?.connected;

      if (playerDisconnected) {
        console.log(`[Turn Relay] Player ${currentPlayer.name} is offline. AI Relay auto-playing neutral card.`);
        const playableCards = getPlayableCards(currentPlayer.hand, gs.currentTrick.leadSuit);
        if (playableCards.length > 0) {
          const cardToPlay = chooseRelayAICard(currentPlayer.hand, gs.currentTrick.leadSuit);
          this.handlePlayCard(room, currentPlayer.id, cardToPlay.id, onStateChange, activeRoomState, true);
        } else {
          gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
          this.scheduleTurnAction(room, onStateChange, activeRoomState);
        }
        return;
      }

      // Player is connected but timed out (AFK)
      const count = (activeRoomState.consecutiveTimeouts.get(currentPlayer.id) || 0) + 1;
      activeRoomState.consecutiveTimeouts.set(currentPlayer.id, count);

      if (count >= 3) {
        if (room.afkAction === 'replace_bot') {
          console.log(`[Timer Expired] Player ${currentPlayer.name} reached 3 consecutive timeouts. Replacing with Bot.`);
          this.replacePlayerWithBot(room, currentPlayer.id, onStateChange, activeRoomState, 'AFK');
        } else {
          console.log(`[Timer Expired] Player ${currentPlayer.name} reached 3 consecutive timeouts. Declaring player FORFEIT.`);
          this.forfeitPlayer(room, currentPlayer.id, onStateChange, activeRoomState);
        }
      } else {
        console.log(`[Timer Expired] Player ${currentPlayer.name} timed out (${count}/3). Auto-playing valid card on their behalf.`);
        const playableCards = getPlayableCards(currentPlayer.hand, gs.currentTrick.leadSuit);
        if (playableCards.length > 0) {
          // Play neutral card so timed-out player does not gain unfair advantage
          const cardToPlay = chooseRelayAICard(currentPlayer.hand, gs.currentTrick.leadSuit);
          this.handlePlayCard(room, currentPlayer.id, cardToPlay.id, onStateChange, activeRoomState, true);
        } else {
          gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
          this.scheduleTurnAction(room, onStateChange, activeRoomState);
        }
      }
    }, effectiveTimerMs);
  }

  public static handlePlayerDisconnect(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const rp = (room.players || []).find((p) => p.id === playerId);
    if (!rp) return;

    rp.connected = false;
    rp.lastSeen = Date.now();
    rp.isAiRelay = true;

    const gs = room.gameState;
    if (!gs || room.status !== 'PLAYING') {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const gp = (gs.players || []).find((p) => p.id === playerId);
    if (gp) {
      gp.connected = false;
      gp.isAiRelay = true;
    }

    if (rp.isEliminated || rp.isForfeit) {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    // Announce AI Relay warning to table (relayed for current partie, forfeit if offline at next partie)
    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🤖 ${rp.name} s'est déconnecté. Un relais IA termine la donne en cours avec des cartes neutres. Forfait aux donnes suivantes si absent.`,
      emoji: '🤖',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    room.updatedAt = Date.now();
    onStateChange(room);

    // If it is currently this player's turn, execute AI move immediately
    if (gs.phase === 'PLAYING' && gs.players[gs.currentTurnIndex]?.id === playerId) {
      this.clearAllTimers(activeRoomState);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    }
  }

  public static handlePlayerReconnect(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    const rp = (room.players || []).find((p) => p.id === playerId);
    const gs = room.gameState;
    const relayCount = rp?.aiRelayPlaysCount || (gs?.players.find((p) => p.id === playerId)?.aiRelayPlaysCount) || 0;
    if (rp) {
      rp.connected = true;
      rp.lastSeen = Date.now();
      rp.disconnectGraceExpiresAt = null;
      rp.isAiRelay = false;
      rp.consecutiveMissedTurns = 0;
      rp.aiRelayPlaysCount = 0;
      if (rp.hand && rp.hand.length > 0) {
        rp.isForfeit = false;
        rp.isEliminated = false;
      }
    }

    if (gs) {
      const gp = (gs.players || []).find((p) => p.id === playerId);
      if (gp) {
        gp.connected = true;
        gp.disconnectGraceExpiresAt = null;
        gp.isAiRelay = false;
        gp.consecutiveMissedTurns = 0;
        gp.aiRelayPlaysCount = 0;
        if (gp.hand && gp.hand.length > 0) {
          gp.isForfeit = false;
          gp.isEliminated = false;
        }
      }
    }

    const relayInfoText = relayCount > 0
      ? ` (L'IA a joué ${relayCount} tour${relayCount > 1 ? 's' : ''} en votre absence)`
      : '';

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🟢 ${rp?.name || 'Le joueur'} s'est reconnecté et a repris la main !${relayInfoText}`,
      emoji: '🟢',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    room.updatedAt = Date.now();
    onStateChange(room);

    // If player reconnected and it is their turn, give them standard turn control
    if (gs && gs.phase === 'PLAYING' && !rp?.isForfeit && gs.players[gs.currentTurnIndex]?.id === playerId) {
      this.clearAllTimers(activeRoomState);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    }
  }


  public static replacePlayerWithBot(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    reason: string
  ): void {
    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    const rp = (room.players || []).find((p) => p.id === playerId);
    if (rp) {
      rp.isHuman = false;
      rp.connected = true; // Bots are always connected
      rp.disconnectGraceExpiresAt = undefined;
      rp.isAiRelay = false;
      rp.name = `${rp.name} (Bot)`;
      
      const emote = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🤖 ${rp.name} a été remplacé par un Bot (${reason}).`,
        emoji: '🤖',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    const gs = room.gameState;
    if (gs) {
      const gp = (gs.players || []).find((p) => p.id === playerId);
      if (gp) {
        gp.isHuman = false;
        gp.connected = true;
        gp.disconnectGraceExpiresAt = undefined;
        gp.isAiRelay = false;
        gp.name = `${gp.name} (Bot)`;
      }
      
      // If it is currently this player's turn, schedule a bot move
      if (gs.phase === 'PLAYING' && gs.players[gs.currentTurnIndex]?.id === playerId) {
        this.clearAllTimers(activeRoomState);
        this.scheduleTurnAction(room, onStateChange, activeRoomState);
      }
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static forfeitPlayer(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    isExplicit: boolean = false
  ): void {
    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    const rp = (room.players || []).find((p) => p.id === playerId);
    if (rp) {
      rp.isForfeit = true;
      rp.isEliminated = true;
      rp.disconnectGraceExpiresAt = null;
      rp.hand = []; // Burning remaining cards
      if (rp.isHuman) {
        activeRoomState.onPlayerForfeit?.(playerId, room, isExplicit);
      }
    }

    const gs = room.gameState;
    if (!gs) {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const gpIdx = (gs.players || []).findIndex((p) => p.id === playerId);
    if (gpIdx !== -1) {
      const gp = gs.players[gpIdx];
      gp.isForfeit = true;
      gp.isEliminated = true;
      gp.disconnectGraceExpiresAt = null;
      gp.hand = []; // Burning remaining cards
    }

    // Migrate host role if the forfeiting player was the host
    if (room.hostId === playerId) {
      const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => p.id !== playerId);
      if (nextHost) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
        nextHost.isHost = true;
      }
    }

    // Anti-fuite Kora / Double Kora check:
    // If an active opponent won trick 4 with a 3 -> Double Kora multiplier (x4)
    // If an active opponent is in Kora trajectory in trick 4/5 -> Kora multiplier (x2)
    let antiFuiteMultiplier = 1;
    if (gs.phase === 'PLAYING' && gs.currentTrickNumber >= 4) {
      const trick4 = gs.tricksHistory.find((t) => t.trickNumber === 4);
      const isTrick4WonWith3 = trick4 && trick4.winnerIndex !== null && gs.players[trick4.winnerIndex]?.id !== playerId && trick4.winningCard?.value === 3;
      if (isTrick4WonWith3 && gs.enableDoubleKora) {
        antiFuiteMultiplier = 4;
      } else {
        antiFuiteMultiplier = 2;
      }
    }

    if (antiFuiteMultiplier > 1 && gs.phase === 'PLAYING') {
      const extraCost = (antiFuiteMultiplier - 1) * gs.baseBet;
      const penalty = Math.min(rp ? rp.capital : 0, extraCost);
      if (rp) {
        rp.capital = Math.max(0, rp.capital - penalty);
        rp.score = rp.capital;
      }
      if (gpIdx !== -1) {
        gs.players[gpIdx].capital = Math.max(0, gs.players[gpIdx].capital - penalty);
        gs.players[gpIdx].score = gs.players[gpIdx].capital;
      }
      gs.pot += penalty;

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `⚖️ Règle anti-fuite (${antiFuiteMultiplier === 4 ? 'Double Kora x4' : 'Kora x2'}) : pénalité de ${penalty} 🪙 prélevée sur ${rp?.name}.`,
        emoji: '🛡️',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    // Check remaining human players: if 0 humans left, end manche
    const activeHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId
    );

    if (activeHumans.length === 0) {
      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    // Check all active players remaining in the partie (including bots)
    const remainingActiveInPartie = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit);

    // If only 1 active player remains across ALL players (no bots or all bots eliminated)
    if (remainingActiveInPartie.length <= 1) {
      this.clearAllTimers(activeRoomState);
      const lastWinner = remainingActiveInPartie[0] || (gs.players || []).find((p) => !p.isEliminated) || gs.players[0];
      const winnerIndex = (gs.players || []).findIndex((p) => p.id === lastWinner.id);

      const cfg = this.getConfig(activeRoomState);
      const rawPot = gs.pot;
      const rakeAmount = 0; // cfg.globalRakePct > 0 ? Math.floor((rawPot * cfg.globalRakePct) / 100) : 0; (Désactivé en mode virtuel)
      const potWon = rawPot - rakeAmount;
      lastWinner.capital += potWon;
      lastWinner.score = lastWinner.capital;
      gs.pot = 0;

      // Check eliminations across all players based on their capital
      let nonEliminatedCount = 0;
      let lastStandingPlayer: Player | null = null;
      (gs.players || []).forEach((p) => {
        if (p.capital < gs.baseBet) {
          p.isEliminated = true;
        } else {
          nonEliminatedCount++;
          lastStandingPlayer = p;
        }
        p.score = p.capital;
      });

      const isMancheOver = nonEliminatedCount <= 1;
      const winType: PartieWinType = (rp && rp.isHuman && remainingActiveInPartie.length === 1) ? 'FORFEIT' : 'STANDARD';

      gs.phase = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      room.status = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      gs.partieWinnerIndex = winnerIndex;
      gs.partieWinnerName = lastWinner.name;
      gs.partieWinType = winType;
      gs.roundWinnerIndex = winnerIndex;
      gs.roundWinnerName = lastWinner.name;

      if (isMancheOver && lastStandingPlayer) {
        gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
        gs.mancheWinnerName = (lastStandingPlayer as Player).name;
      }

      room.players = (room.players || []).map((p) => {
        const g = (gs.players || []).find((gp) => gp.id === p.id);
        return g
          ? {
              ...p,
              capital: g.capital,
              score: g.capital,
              isEliminated: g.isEliminated,
              isForfeit: g.isForfeit,
              readyForNextPartie: false,
            }
          : p;
      });

      room.previousPartieSummary = {
        partieCount: gs.partieCount,
        winnerName: lastWinner.name,
        winType,
        potWon,
        playersSummary: (gs.players || []).map((p) => ({
          id: p.id,
          name: p.name,
          deltaCapital: p.id === lastWinner.id ? potWon - gs.baseBet : -gs.baseBet,
          finalCapital: p.capital,
        })),
      };

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: winType === 'FORFEIT'
          ? `👑 Victoire par forfait pour ${lastWinner.name} !`
          : `🏆 ${lastWinner.name} remporte la manche !`,
        emoji: '🏆',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

      if (!isMancheOver) {
        const transitionDelay = cfg.transitionDelayMs;
        room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, transitionDelay);
      }
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    // If 2 or more players (human + bot(s)) remain, announce that the human can continue against IA or claim forfeit!
    if (activeHumans.length === 1 && rp && rp.isHuman) {
      const soleHuman = activeHumans[0];
      const activeBotsCount = remainingActiveInPartie.filter((p) => !p.isHuman).length;
      if (activeBotsCount > 0) {
        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `⚠️ ${rp.name} a quitté. ${soleHuman.name} peut continuer contre l'IA ou réclamer la victoire par forfait !`,
          emoji: '⚔️',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      }
    }

    // If partie is still in progress with 2 or more active players
    if (gs.phase === 'PLAYING') {
      const neededPlays = remainingActiveInPartie.length;
      if (gs.currentTrick.plays.length >= neededPlays) {
        this.clearAllTimers(activeRoomState);
        gs.phase = 'TRICK_RESOLVED';
        const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, gs.currentTrick.leadSuit);
        const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
        const winner = gs.players[winnerIndex];

        gs.currentTrick.winnerIndex = winnerIndex;
        gs.currentTrick.winnerName = winner.name;
        gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
        gs.currentTrick.isComplete = true;

        winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
        const roomWinner = (room.players || []).find((p) => p.id === winner.id);
        if (roomWinner) {
          roomWinner.tricksWonInRound = winner.tricksWonInRound;
        }

        room.updatedAt = Date.now();
        onStateChange(room);

        const cfg = this.getConfig(activeRoomState);
        activeRoomState.trickResolutionTimer = setTimeout(() => {
          this.resolveCompletedTrick(room, onStateChange, activeRoomState);
        }, cfg.trickResolutionTimeMs || 1600);
        return;
      }

      // If it was the forfeited player's turn to play: advance turn immediately!
      if (gs.currentTurnIndex === gpIdx) {
        let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
        while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isForfeit) {
          nextIndex = (nextIndex + 1) % (gs.players || []).length;
        }
        gs.currentTurnIndex = nextIndex;
        gs.turnStartedAt = Date.now();
        room.updatedAt = Date.now();
        onStateChange(room);
        this.scheduleTurnAction(room, onStateChange, activeRoomState);
        return;
      }
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static handleFoldRound(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') return;

    const rp = (room.players || []).find((p) => p.id === playerId);
    if (!rp || rp.isEliminated || rp.isForfeit || rp.isFoldedInRound) return;

    rp.isFoldedInRound = true;
    rp.hand = [];

    const gpIdx = (gs.players || []).findIndex((p) => p.id === playerId);
    if (gpIdx !== -1) {
      const gp = gs.players[gpIdx];
      gp.isFoldedInRound = true;
      gp.hand = [];
    }

    const remainingActiveInPartie = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound);

    // If only 1 active player remains (e.g. 1v1 or all opponents folded)
    if (remainingActiveInPartie.length <= 1) {
      const soleWinner = remainingActiveInPartie[0] || (gs.players || []).find((p) => !p.isEliminated && !p.isForfeit) || gs.players[0];
      const winnerIndex = (gs.players || []).findIndex((p) => p.id === soleWinner.id);

      // Evaluate anti-Kora evasion multipliers
      let partieWinType: PartieWinType = 'STANDARD';
      let multiplier = 1;

      const previousTricksCount = gs.currentTrickNumber - 1;
      const soleWinnerWonAllPrevious = previousTricksCount > 0 && (soleWinner.tricksWonInRound || 0) === previousTricksCount;

      if (soleWinnerWonAllPrevious) {
        const trick4 = gs.tricksHistory[3];
        const isTrick4WonWithThree = Boolean(
          trick4 &&
          trick4.winnerIndex === winnerIndex &&
          trick4.winningCard?.value === 3
        );
        if (isTrick4WonWithThree && room.enableDoubleKora) {
          partieWinType = 'DOUBLE_KORA';
          multiplier = 4;
        } else {
          partieWinType = 'KORA';
          multiplier = 2;
        }
      }

      // Collect penalties from folded losers to prevent tactical fold evasion
      const extraCostPerLoser = (multiplier - 1) * gs.baseBet;
      let totalExtraCollected = 0;

      (gs.players || []).forEach((p, idx) => {
        if (p.isEliminated || idx === winnerIndex) return;
        const actualPenalty = Math.min(p.capital, extraCostPerLoser);
        totalExtraCollected += actualPenalty;
        p.capital = Math.max(0, p.capital - actualPenalty);
        p.score = p.capital;
      });

      const cfg = this.getConfig(activeRoomState);
      const rawPotWon = gs.pot + totalExtraCollected;
      const rakeAmount = 0; // cfg.globalRakePct > 0 ? Math.floor((rawPotWon * cfg.globalRakePct) / 100) : 0; (Désactivé en mode virtuel)
      const potWon = rawPotWon - rakeAmount;
      soleWinner.capital += potWon;
      soleWinner.score = soleWinner.capital;
      gs.pot = 0;

      // Check eliminations
      let nonEliminatedCount = 0;
      let lastStandingPlayer: Player | null = null;
      (gs.players || []).forEach((p) => {
        if (p.capital < gs.baseBet) {
          p.isEliminated = true;
        } else {
          nonEliminatedCount++;
          lastStandingPlayer = p;
        }
        p.score = p.capital;
      });

      const isMancheOver = nonEliminatedCount <= 1;
      gs.phase = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      room.status = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      gs.partieWinnerIndex = winnerIndex;
      gs.partieWinnerName = soleWinner.name;
      gs.partieWinType = partieWinType;
      gs.roundWinnerIndex = winnerIndex;
      gs.roundWinnerName = soleWinner.name;

      if (isMancheOver && lastStandingPlayer) {
        gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
        gs.mancheWinnerName = (lastStandingPlayer as Player).name;
      }

      room.players = (room.players || []).map((p) => {
        const g = (gs.players || []).find((gp) => gp.id === p.id);
        return g
          ? {
              ...p,
              capital: g.capital,
              score: g.capital,
              isEliminated: g.isEliminated,
              isForfeit: g.isForfeit,
              isFoldedInRound: g.isFoldedInRound,
              readyForNextPartie: false,
            }
          : p;
      });

      room.previousPartieSummary = {
        partieCount: gs.partieCount,
        winnerName: soleWinner.name,
        winType: partieWinType,
        potWon,
        playersSummary: (gs.players || []).map((p) => ({
          id: p.id,
          name: p.name,
          deltaCapital: p.id === soleWinner.id ? potWon - gs.baseBet : -(gs.baseBet + (multiplier > 1 ? extraCostPerLoser : 0)),
          finalCapital: p.capital,
        })),
      };

      this.clearAllTimers(activeRoomState);
      const transitionDelay = cfg.transitionDelayMs;
      room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
      room.updatedAt = Date.now();
      onStateChange(room);

      activeRoomState.nextPartieTimer = setTimeout(() => {
        this.advanceToNextPartie(room, onStateChange, activeRoomState);
      }, transitionDelay);
      return;
    }

    // 2 or more players still active in the round
    const neededPlays = remainingActiveInPartie.length;
    if (gs.currentTrick.plays.length >= neededPlays && gs.currentTrick.plays.length > 0) {
      this.clearAllTimers(activeRoomState);
      gs.phase = 'TRICK_RESOLVED';
      const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, gs.currentTrick.leadSuit);
      const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
      const winner = gs.players[winnerIndex];

      gs.currentTrick.winnerIndex = winnerIndex;
      gs.currentTrick.winnerName = winner.name;
      gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
      gs.currentTrick.isComplete = true;

      winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
      const roomWinner = (room.players || []).find((p) => p.id === winner.id);
      if (roomWinner) {
        roomWinner.tricksWonInRound = winner.tricksWonInRound;
      }

      room.updatedAt = Date.now();
      onStateChange(room);

      const cfg = this.getConfig(activeRoomState);
      activeRoomState.trickResolutionTimer = setTimeout(() => {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }, cfg.trickResolutionTimeMs || 1600);
      return;
    }

    // If it was the folding player's turn to play: pass turn immediately to next active player
    if (gs.currentTurnIndex === gpIdx) {
      let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isForfeit || gs.players[nextIndex].isFoldedInRound) {
        nextIndex = (nextIndex + 1) % (gs.players || []).length;
      }
      gs.currentTurnIndex = nextIndex;
      gs.turnStartedAt = Date.now();
      room.updatedAt = Date.now();
      onStateChange(room);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
      return;
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  private static executeBotMove(
    room: MultiplayerRoom,
    player: Player,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') return;

    if (gs.players[gs.currentTurnIndex].id !== player.id) return;

    const activeCount = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound).length;

    // Evaluate bot folding in 3-4p games on trick 1 with catastrophic hand
    if (
      gs.currentTrickNumber === 1 &&
      activeCount >= 3 &&
      shouldBotFoldRound(player.hand, 1, activeCount, player.aiStrategy || 'CONSERVATIVE', 'EXPERT')
    ) {
      const reaction = getBotFoldReaction();
      const emoteMsg: EmoteMessage = {
        id: `emote_fold_${Date.now()}_${player.id}`,
        playerId: player.id,
        playerName: player.name,
        text: reaction.text,
        emoji: reaction.emoji,
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emoteMsg];
      this.handleFoldRound(room, player.id, onStateChange, activeRoomState);
      return;
    }

    const playableCards = getPlayableCards(player.hand, gs.currentTrick.leadSuit);
    if (playableCards.length === 0) {
      console.warn(`[executeBotMove] Player ${player.name} has 0 playable cards. Advancing turn.`);
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
      return;
    }

    // Distinguish bot types:
    // 1. Full bot (fill with bots / solo bot) plays to win optimally
    // 2. Relay bot (absent human player) plays the most neutral, non-competitive move possible
    const isRelayBot = Boolean(
      player.isAiRelay ||
      (!(room.players || []).find((p) => p.id === player.id)?.connected && player.isHuman)
    );

    let cardToPlay: Card;
    if (isRelayBot) {
      cardToPlay = chooseRelayAICard(player.hand, gs.currentTrick.leadSuit);
      const rp = (room.players || []).find((p) => p.id === player.id);
      if (rp) {
        rp.aiRelayPlaysCount = (rp.aiRelayPlaysCount || 0) + 1;
      }
      player.aiRelayPlaysCount = (player.aiRelayPlaysCount || 0) + 1;
    } else {
      // Use smart AI engine to pick optimal card
      cardToPlay = chooseAICard(
        player.hand,
        gs.currentTrick.leadSuit,
        gs.currentTrick.plays,
        gs.currentTrickNumber,
        player.aiStrategy || 'CONSERVATIVE',
        gs.tricksHistory,
        activeCount,
        'EXPERT',
        gs.players,
        gs.currentTurnIndex
      );
    }

    this.handlePlayCard(room, player.id, cardToPlay.id, onStateChange, activeRoomState, isRelayBot);
  }

  public static claimForfeitVictory(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): boolean {
    const gs = room.gameState;
    if (!gs) return false;

    // Check that player is an active human in room
    const playerIndex = (gs.players || []).findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return false;
    const claimingPlayer = gs.players[playerIndex];
    if (claimingPlayer.isEliminated || claimingPlayer.isForfeit) return false;

    // Verify there are no OTHER active human players
    const otherActiveHumans = (room.players || []).filter(
      (p) => p.isHuman && p.id !== playerId && !p.isEliminated && !p.isForfeit && p.connected
    );
    if (otherActiveHumans.length > 0) {
      return false; // Cannot claim forfeit victory if other humans are still playing
    }

    this.clearAllTimers(activeRoomState);

    // Award human share of pot to claiming player, returning bots' share to bots
    const activeBots = (gs.players || []).filter((p) => !p.isHuman && !p.isEliminated);
    const activeHumansInPot = (gs.players || []).filter((p) => p.isHuman);

    // Calculate bots share in the current pot
    // If pot is formed by baseBet per active player in the partie
    const totalContributedPlayers = (gs.players || []).filter((p) => !p.isEliminated || p.id === playerId).length;
    let botShareTotal = 0;
    if (activeBots.length > 0 && gs.pot > 0) {
      // Each active bot's contribution in current pot
      const perPlayerContribution = Math.floor(gs.pot / Math.max(1, totalContributedPlayers)) || gs.baseBet;
      activeBots.forEach((bot) => {
        const refund = Math.min(gs.pot - botShareTotal, perPlayerContribution);
        bot.capital += refund;
        bot.score = bot.capital;
        botShareTotal += refund;
      });
    }

    const humanPotShare = Math.max(0, gs.pot - botShareTotal);
    claimingPlayer.capital += humanPotShare;
    claimingPlayer.score = claimingPlayer.capital;
    gs.pot = 0;

    // Set Manche Over & Partie Over with FORFEIT win type
    gs.phase = 'MANCHE_OVER';
    room.status = 'MANCHE_OVER';
    gs.partieWinnerIndex = playerIndex;
    gs.partieWinnerName = claimingPlayer.name;
    gs.partieWinType = 'FORFEIT';
    gs.roundWinnerIndex = playerIndex;
    gs.roundWinnerName = claimingPlayer.name;
    gs.mancheWinnerIndex = playerIndex;
    gs.mancheWinnerName = claimingPlayer.name;

    room.players = (room.players || []).map((p) => {
      const g = (gs.players || []).find((gp) => gp.id === p.id);
      return g
        ? {
            ...p,
            capital: g.capital,
            score: g.capital,
            isEliminated: g.isEliminated,
            isForfeit: g.isForfeit,
            readyForNextPartie: false,
          }
        : p;
    });

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🏆 ${claimingPlayer.name} a réclamé sa part du pot (${humanPotShare} jetons) et remporte la manche par forfait !`,
      emoji: '🏆',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    room.previousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: claimingPlayer.name,
      winType: 'FORFEIT',
      potWon: humanPotShare,
      playersSummary: (gs.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        deltaCapital: p.id === claimingPlayer.id ? humanPotShare : 0,
        finalCapital: p.capital,
      })),
    };

    room.updatedAt = Date.now();
    onStateChange(room);
    return true;
  }

  public static resolveEarlyClose(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    // Share pot amongst active non-eliminated players according to tricks won in round
    const activePlayers = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit);
    if (activePlayers.length > 0 && gs.pot > 0) {
      const totalTricksWon = activePlayers.reduce((sum, p) => sum + (p.tricksWonInRound || 0), 0);
      if (totalTricksWon > 0) {
        let potDistributed = 0;
        activePlayers.forEach((p, idx) => {
          if (idx === activePlayers.length - 1) {
            const share = gs.pot - potDistributed;
            p.capital += share;
            p.score = p.capital;
          } else {
            const share = Math.floor((gs.pot * (p.tricksWonInRound || 0)) / totalTricksWon);
            p.capital += share;
            p.score = p.capital;
            potDistributed += share;
          }
        });
      } else {
        // Equal split if no tricks won yet
        const share = Math.floor(gs.pot / activePlayers.length);
        activePlayers.forEach((p) => {
          p.capital += share;
          p.score = p.capital;
        });
      }
    }
    gs.pot = 0;

    // Determine leading player as nominal round winner
    const sorted = [...activePlayers].sort((a, b) => (b.tricksWonInRound || 0) - (a.tricksWonInRound || 0) || b.capital - a.capital);
    const topPlayer = sorted[0] || gs.players[0];
    const topPlayerIndex = (gs.players || []).findIndex((p) => p.id === topPlayer.id);

    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';
    gs.partieWinnerIndex = topPlayerIndex >= 0 ? topPlayerIndex : 0;
    gs.partieWinnerName = topPlayer.name;
    gs.partieWinType = 'STANDARD';
    room.earlyCloseProposal = null;

    room.players = (room.players || []).map((p) => {
      const g = (gs.players || []).find((gp) => gp.id === p.id);
      return g
        ? {
            ...p,
            capital: g.capital,
            score: g.capital,
            isEliminated: g.isEliminated,
            isForfeit: g.isForfeit,
            readyForNextPartie: false,
          }
        : p;
    });

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🤝 Partie clôturée d'un commun accord ! Le pot a été partagé équitablement.`,
      emoji: '🤝',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    room.previousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: topPlayer.name,
      winType: 'STANDARD',
      potWon: 0,
      playersSummary: (gs.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        deltaCapital: 0,
        finalCapital: p.capital,
      })),
    };

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static clearAllTimers(activeRoomState: ActiveRoomState): void {
    if (activeRoomState.turnTimeoutTimer) {
      clearTimeout(activeRoomState.turnTimeoutTimer);
      activeRoomState.turnTimeoutTimer = null;
    }
    if (activeRoomState.trickResolutionTimer) {
      clearTimeout(activeRoomState.trickResolutionTimer);
      activeRoomState.trickResolutionTimer = null;
    }
    if (activeRoomState.nextPartieTimer) {
      clearTimeout(activeRoomState.nextPartieTimer);
      activeRoomState.nextPartieTimer = null;
    }
    if (activeRoomState.instantWinTimer) {
      clearTimeout(activeRoomState.instantWinTimer);
      activeRoomState.instantWinTimer = null;
    }
    if (activeRoomState.botMoveTimer) {
      clearTimeout(activeRoomState.botMoveTimer);
      activeRoomState.botMoveTimer = null;
    }
    if (activeRoomState.disconnectTimers) {
      activeRoomState.disconnectTimers.forEach((timer) => clearTimeout(timer));
      activeRoomState.disconnectTimers.clear();
    }
    if (activeRoomState.aiRelayTimers) {
      activeRoomState.aiRelayTimers.forEach((timer) => clearTimeout(timer));
      activeRoomState.aiRelayTimers.clear();
    }
    if (activeRoomState.emergencyTrickPlayed) {
      activeRoomState.emergencyTrickPlayed.clear();
    }
  }
}
