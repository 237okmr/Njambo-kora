import {
  doc,
  setDoc as firestoreSetDoc,
  getDoc,
  updateDoc as firestoreUpdateDoc,
  onSnapshot,
  deleteDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Helper to recursively remove undefined fields for Firestore compatibility
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as any;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        newObj[key] = cleanUndefined(val);
      }
    }
    return newObj;
  }
  return obj;
}

function updateDoc(ref: any, data: any) {
  return firestoreUpdateDoc(ref, cleanUndefined(data));
}

function setDoc(ref: any, data: any) {
  return firestoreSetDoc(ref, cleanUndefined(data));
}
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
} from '../types';
import { build31Deck, dealCards, determineTrickWinner, shuffleDeck } from '../utils/deck';
import {
  chooseAICard,
  evaluateAndShiftBotStrategy,
  hasKoraPotential,
  shouldBotTriggerKoraAlert,
  getRandomBotProfiles,
  getRandomBotStrategy,
} from '../utils/ai';

export function getLocalPlayerId(): string {
  let id = localStorage.getItem('njambo_player_id');
  if (!id) {
    id = 'usr_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('njambo_player_id', id);
  }
  return id;
}

export function getLocalPlayerName(): string {
  const name = localStorage.getItem('njambo_player_name');
  if (name && name.trim().toLowerCase() !== 'katika') {
    return name.trim();
  }
  const defaultName = 'Joueur ' + Math.floor(100 + Math.random() * 900);
  localStorage.setItem('njambo_player_name', defaultName);
  return defaultName;
}

export function setLocalPlayerName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'katika') return;
  localStorage.setItem('njambo_player_name', trimmed);
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function updatePlayerHeartbeat(
  roomCode: string,
  playerId: string,
  isAway: boolean = false
): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', roomCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    let modified = false;
    const updatedPlayers = room.players.map((p) => {
      if (p.id === playerId) {
        modified = true;
        return {
          ...p,
          connected: true,
          isAway: isAway,
          lastSeen: Date.now(),
        };
      }
      return p;
    });
    if (modified) {
      await updateDoc(roomRef, { players: updatedPlayers, updatedAt: Date.now() });
    }
  } catch (err) {
    console.error('Error updating player heartbeat:', err);
  }
}

export async function setPlayerAwayStatus(
  roomCode: string,
  playerId: string,
  isAway: boolean
): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', roomCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    const updatedPlayers = room.players.map((p) => {
      if (p.id === playerId) {
        return { ...p, isAway, lastSeen: Date.now() };
      }
      return p;
    });
    await updateDoc(roomRef, { players: updatedPlayers, updatedAt: Date.now() });
  } catch (err) {
    console.error('Error setting away status:', err);
  }
}

export async function createMultiplayerRoom(
  hostName: string,
  settings: {
    fillWithBots: boolean;
    baseBet: number;
    initialCapital: number;
    enableDoubleKora: boolean;
    enableUnder21: boolean;
    turnTimerSeconds?: number;
    afkAction?: 'auto_play' | 'replace_bot';
  },
  avatarSeed?: string
): Promise<MultiplayerRoom> {
  const hostId = getLocalPlayerId();
  const roomCode = generateRoomCode();
  const roomRef = doc(db, 'rooms', roomCode);

  const hostPlayer: RoomPlayer = {
    id: hostId,
    name: hostName,
    isHost: true,
    isHuman: true,
    avatarSeed: avatarSeed || 'host',
    score: settings.initialCapital,
    capital: settings.initialCapital,
    isEliminated: false,
    hand: [],
    tricksWonInRound: 0,
    isReady: true,
    connected: true,
    lastSeen: Date.now(),
  };

  const newRoom: MultiplayerRoom = {
    id: roomCode,
    hostId: hostId,
    hostName: hostName,
    status: 'LOBBY',
    fillWithBots: settings.fillWithBots,
    maxPlayers: 4,
    baseBet: settings.baseBet,
    initialCapital: settings.initialCapital,
    enableDoubleKora: settings.enableDoubleKora,
    enableUnder21: settings.enableUnder21,
    turnTimerSeconds: settings.turnTimerSeconds ?? 20,
    afkAction: settings.afkAction ?? 'auto_play',
    players: [hostPlayer],
    playerIds: [hostId],
    gameState: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await setDoc(roomRef, newRoom);
  return newRoom;
}

export async function joinMultiplayerRoom(
  roomCode: string,
  playerName: string,
  avatarSeed?: string
): Promise<{ success: boolean; error?: string; room?: MultiplayerRoom }> {
  const formattedCode = roomCode.trim().toUpperCase();
  const roomRef = doc(db, 'rooms', formattedCode);
  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    return { success: false, error: 'Ce salon n’existe pas ou a expiré.' };
  }

  const room = snap.data() as MultiplayerRoom;
  const playerId = getLocalPlayerId();

  // 1. Check if player with same ID exists
  const existingIdx = room.players.findIndex((p) => p.id === playerId);
  if (existingIdx >= 0) {
    const updatedPlayers = [...room.players];
    updatedPlayers[existingIdx] = {
      ...updatedPlayers[existingIdx],
      name: playerName || updatedPlayers[existingIdx].name,
      connected: true,
      lastSeen: Date.now(),
    };
    await updateDoc(roomRef, {
      players: updatedPlayers,
      updatedAt: Date.now(),
    });
    return { success: true, room: { ...room, players: updatedPlayers } };
  }

  // 2. Reclaim seat if same player name exists (e.g. after refresh/reconnection)
  const sameNameIdx = room.players.findIndex(
    (p) => p.isHuman && p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
  );
  if (sameNameIdx >= 0) {
    const updatedPlayers = [...room.players];
    updatedPlayers[sameNameIdx] = {
      ...updatedPlayers[sameNameIdx],
      id: playerId, // Assign new local ID
      connected: true,
      lastSeen: Date.now(),
    };
    await updateDoc(roomRef, {
      players: updatedPlayers,
      updatedAt: Date.now(),
    });
    return { success: true, room: { ...room, players: updatedPlayers } };
  }

  if (room.status !== 'LOBBY') {
    return { success: false, error: 'Cette partie est déjà en cours.' };
  }

  if (room.players.length >= room.maxPlayers) {
    return { success: false, error: 'Ce salon est complet (4 joueurs max).' };
  }

  const newPlayer: RoomPlayer = {
    id: playerId,
    name: playerName,
    isHost: false,
    isHuman: true,
    avatarSeed: avatarSeed || 'player_' + Math.random().toString(36).substring(2, 6),
    score: room.initialCapital,
    capital: room.initialCapital,
    isEliminated: false,
    hand: [],
    tricksWonInRound: 0,
    isReady: true,
    connected: true,
    lastSeen: Date.now(),
  };

  const updatedPlayers = [...room.players, newPlayer];
  const updatedPlayerIds = Array.from(new Set([...(room.playerIds || room.players.map((p) => p.id)), playerId]));
  await updateDoc(roomRef, {
    players: updatedPlayers,
    playerIds: updatedPlayerIds,
    updatedAt: Date.now(),
  });

  return { success: true, room: { ...room, players: updatedPlayers, playerIds: updatedPlayerIds } };
}

export function subscribeToMultiplayerRoom(
  roomCode: string,
  callback: (room: MultiplayerRoom | null) => void,
  onError?: (err: Error) => void
): () => void {
  const formattedCode = roomCode.trim().toUpperCase();
  const roomRef = doc(db, 'rooms', formattedCode);

  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as MultiplayerRoom);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Room subscription error:', error);
      if (onError) onError(error);
    }
  );
}

export async function updateMultiplayerRoomSettings(
  roomCode: string,
  settings: Partial<MultiplayerRoom>
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    ...settings,
    updatedAt: Date.now(),
  });
}

export async function leaveMultiplayerRoom(roomCode: string, playerId: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const remainingPlayers = room.players.filter((p) => p.id !== playerId);

  if (remainingPlayers.length === 0 || (room.hostId === playerId && remainingPlayers.length === 0)) {
    await deleteDoc(roomRef);
  } else {
    let nextHostId = room.hostId;
    let nextHostName = room.hostName;
    if (room.hostId === playerId && remainingPlayers.length > 0) {
      remainingPlayers[0].isHost = true;
      nextHostId = remainingPlayers[0].id;
      nextHostName = remainingPlayers[0].name;
    }
    await updateDoc(roomRef, {
      hostId: nextHostId,
      hostName: nextHostName,
      players: remainingPlayers,
      updatedAt: Date.now(),
    });
  }
}

export async function forfeitAndLeaveMultiplayerGame(roomCode: string, playerId: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const gs = room.gameState;

  // If room is in lobby or has no game running, use standard leave
  if (room.status !== 'PLAYING' || !gs) {
    await leaveMultiplayerRoom(roomCode, playerId);
    return;
  }

  const quitterIdx = gs.players.findIndex((p) => p.id === playerId);
  if (quitterIdx === -1) {
    await leaveMultiplayerRoom(roomCode, playerId);
    return;
  }

  // Mark player as eliminated with 0 capital and empty hand
  const updatedRoomPlayers = room.players.map((p) => {
    if (p.id === playerId) {
      return {
        ...p,
        capital: 0,
        score: 0,
        isEliminated: true,
        connected: false,
        hand: [],
      };
    }
    return p;
  });

  const updatedPlayers = gs.players.map((p, idx) => {
    if (idx === quitterIdx) {
      return {
        ...p,
        capital: 0,
        score: 0,
        isEliminated: true,
        hand: [],
      };
    }
    return p;
  });

  const remainingActive = updatedPlayers.filter((p) => !p.isEliminated);

  // Host transfer if quitter was host
  let nextHostId = room.hostId;
  let nextHostName = room.hostName;
  if (room.hostId === playerId) {
    const nextHostPlayer =
      updatedRoomPlayers.find((p) => p.id !== playerId && !p.isEliminated) ||
      updatedRoomPlayers.find((p) => p.id !== playerId);
    if (nextHostPlayer) {
      nextHostId = nextHostPlayer.id;
      nextHostName = nextHostPlayer.name;
      updatedRoomPlayers.forEach((p) => {
        p.isHost = p.id === nextHostId;
      });
    }
  }

  // If 0 or 1 active player remains, end the manche
  if (remainingActive.length <= 1) {
    const winnerPlayer = remainingActive[0] || updatedPlayers[0];
    const winnerIdx = updatedPlayers.findIndex((p) => p.id === winnerPlayer.id);

    const finalGameState: GameState = {
      ...gs,
      phase: 'MANCHE_OVER',
      players: updatedPlayers,
      mancheWinnerIndex: winnerIdx !== -1 ? winnerIdx : 0,
      mancheWinnerName: winnerPlayer ? winnerPlayer.name : 'Gagnant',
      isThinkingAI: false,
      aiThinkingPlayerName: null,
    };

    await updateDoc(roomRef, {
      status: 'MANCHE_OVER',
      hostId: nextHostId,
      hostName: nextHostName,
      players: updatedRoomPlayers,
      gameState: finalGameState,
      updatedAt: Date.now(),
    });
    return;
  }

  // Game continues with remaining active players!
  let nextTurnIndex = gs.currentTurnIndex;
  if (gs.currentTurnIndex === quitterIdx) {
    nextTurnIndex = (gs.currentTurnIndex + 1) % gs.players.length;
    let attempts = 0;
    while (updatedPlayers[nextTurnIndex].isEliminated && attempts < gs.players.length) {
      nextTurnIndex = (nextTurnIndex + 1) % gs.players.length;
      attempts++;
    }
  }

  const nextIsAI = !updatedPlayers[nextTurnIndex].isHuman;

  const nextGameState: GameState = {
    ...gs,
    players: updatedPlayers,
    currentTurnIndex: nextTurnIndex,
    isThinkingAI: nextIsAI,
    aiThinkingPlayerName: nextIsAI ? updatedPlayers[nextTurnIndex].name : null,
  };

  await updateDoc(roomRef, {
    hostId: nextHostId,
    hostName: nextHostName,
    players: updatedRoomPlayers,
    gameState: nextGameState,
    updatedAt: Date.now(),
  });
}

// Convert RoomPlayer list to Player list for GameState
export function roomPlayersToPlayers(rPlayers: RoomPlayer[]): Player[] {
  return rPlayers.map((rp) => ({
    id: rp.id,
    name: rp.name,
    score: rp.capital,
    capital: rp.capital,
    isEliminated: rp.isEliminated,
    isForfeit: rp.isForfeit,
    connected: rp.connected,
    disconnectGraceExpiresAt: rp.disconnectGraceExpiresAt,
    hand: rp.hand || [],
    isHuman: rp.isHuman,
    avatarSeed: rp.avatarSeed,
    tricksWonInRound: rp.tricksWonInRound,
    aiStrategy: rp.aiStrategy,
  }));
}

export function checkInstantWinsInMultiplayer(
  players: Player[],
  enableUnder21: boolean
): InstantWinReveal | null {
  // Check A: Trois 7 (777)
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const player = players[pIdx];
    if (!player.isEliminated && player.hand.length > 0) {
      const sevens = player.hand.filter((c) => c.value === 7);
      if (sevens.length >= 3) {
        return {
          winnerIndex: pIdx,
          winnerName: player.name,
          winType: 'THREE_SEVENS',
          hand: player.hand,
          scoreOrCount: 3,
        };
      }
    }
  }

  // Check B: Moins de 21
  if (enableUnder21) {
    let bestWinnerIdx: number | null = null;
    let lowestSum = 999;
    players.forEach((player, pIdx) => {
      if (!player.isEliminated && player.hand.length === 5) {
        const sum = player.hand.reduce((acc, c) => acc + c.value, 0);
        if (sum <= 21 && sum < lowestSum) {
          lowestSum = sum;
          bestWinnerIdx = pIdx;
        }
      }
    });

    if (bestWinnerIdx !== null) {
      const winner = players[bestWinnerIdx];
      return {
        winnerIndex: bestWinnerIdx,
        winnerName: winner.name,
        winType: 'UNDER_21',
        hand: winner.hand,
        scoreOrCount: lowestSum,
      };
    }
  }

  return null;
}

export async function startMultiplayerGame(room: MultiplayerRoom): Promise<void> {
  const roomRef = doc(db, 'rooms', room.id);

  // 1. Determine final player list (if fillWithBots is enabled, add bots up to 4)
  let finalPlayers: RoomPlayer[] = [...room.players];
  if (room.fillWithBots && finalPlayers.length < 4) {
    const botsToAdd = 4 - finalPlayers.length;
    const selectedBotProfiles = getRandomBotProfiles(botsToAdd);
    for (let i = 0; i < botsToAdd; i++) {
      const botTemplate = selectedBotProfiles[i] || { name: `Bot ${i + 1}`, avatarSeed: `bot_${i}` };
      const isRobam = botTemplate.name === 'Robam Hokuto';
      const botStrat = isRobam ? 'HOKUTO_ADAPTIVE' : getRandomBotStrategy();
      const botId = `bot_${i + 1}_${Date.now()}`;
      finalPlayers.push({
        id: botId,
        name: `${botTemplate.name} (IA)`,
        isHost: false,
        isHuman: false,
        avatarSeed: botTemplate.avatarSeed,
        score: room.initialCapital,
        capital: room.initialCapital,
        isEliminated: false,
        hand: [],
        tricksWonInRound: 0,
        aiStrategy: botStrat,
        isReady: true,
        connected: true,
        lastSeen: Date.now(),
      });
    }
  }

  // 2. Deduct baseBet from all active players
  const activeCount = finalPlayers.length;
  const pot = room.baseBet * activeCount;

  // 3. Deal cards
  const fullDeck = build31Deck();
  const shuffled = shuffleDeck(fullDeck);
  const { hands } = dealCards(shuffled, activeCount);

  finalPlayers = finalPlayers.map((p, idx) => ({
    ...p,
    capital: p.capital - room.baseBet,
    score: p.capital - room.baseBet,
    tricksWonInRound: 0,
    hand: hands[idx] || [],
  }));

  const dealerIdx = 0;
  const leadIdx = (dealerIdx + 1) % activeCount;
  const leadIsAI = !finalPlayers[leadIdx].isHuman;

  const initialTrick: Trick = {
    trickNumber: 1,
    leadSuit: null,
    leadPlayerIndex: leadIdx,
    leadPlayerName: finalPlayers[leadIdx].name,
    plays: [],
    winnerIndex: null,
    winnerName: null,
    winningCard: null,
    isComplete: false,
  };

  const initialPlayersList = roomPlayersToPlayers(finalPlayers);
  const instantWin = checkInstantWinsInMultiplayer(initialPlayersList, room.enableUnder21);

  if (instantWin) {
    const winnerIdx = instantWin.winnerIndex;
    const winnerName = instantWin.winnerName;

    const playersAfterInstantWin = initialPlayersList.map((p, idx) => {
      if (idx === winnerIdx) {
        const newCap = p.capital + pot;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    const roomPlayersAfterInstantWin = finalPlayers.map((p, idx) => {
      if (idx === winnerIdx) {
        const newCap = p.capital + pot;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    const evaluatedPlayers = playersAfterInstantWin.map((p) => ({
      ...p,
      isEliminated: p.capital < room.baseBet,
    }));

    const roomEvaluatedPlayers = roomPlayersAfterInstantWin.map((p) => ({
      ...p,
      isEliminated: p.capital < room.baseBet,
    }));

    const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);
    const isMancheOver = remainingActive.length <= 1;

    const instantGameState: GameState = {
      phase: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: evaluatedPlayers,
      pot: pot,
      baseBet: room.baseBet,
      initialCapital: room.initialCapital,
      enableDoubleKora: room.enableDoubleKora,
      enableUnder21: room.enableUnder21,
      showBotPersonalityIcons: true,
      enableKoraHunterAlerts: true,
      showKoraHunterAlert: false,
      koraHunterAlertShown: false,
      dealerIndex: dealerIdx,
      leadIndex: leadIdx,
      currentTurnIndex: leadIdx,
      currentTrickNumber: 1,
      currentTrick: initialTrick,
      tricksHistory: [],
      partieWinnerIndex: winnerIdx,
      partieWinnerName: winnerName,
      partieWinType: instantWin.winType,
      consecutiveThreesCountByPlayer: {},
      doubleKoraAchievedByPlayer: {},
      mancheWinnerIndex: isMancheOver ? evaluatedPlayers.findIndex((p) => p.id === (remainingActive[0] || evaluatedPlayers[0]).id) : null,
      mancheWinnerName: isMancheOver ? (remainingActive[0] || evaluatedPlayers[0]).name : null,
      roundWinnerIndex: null,
      roundWinnerName: null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      humanSelectedCardId: null,
      partieCount: 1,
      roundCount: 1,
    };

    const playersSummary = evaluatedPlayers.map((p, idx) => ({
      id: p.id,
      name: p.name,
      deltaCapital: idx === winnerIdx ? pot - room.baseBet : -room.baseBet,
      finalCapital: p.capital,
    }));

    const previousPartieSummary: PreviousPartieSummary = {
      partieCount: 1,
      winnerName: winnerName,
      winType: instantWin.winType,
      potWon: pot,
      playersSummary,
    };

    const roomEvaluatedPlayersResetReady = roomEvaluatedPlayers.map((p) => ({
      ...p,
      readyForNextPartie: false,
    }));

    await updateDoc(roomRef, {
      status: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: roomEvaluatedPlayersResetReady,
      gameState: instantGameState,
      roundEndAutoAdvanceAt: isMancheOver ? null : Date.now() + 25000,
      previousPartieSummary,
      updatedAt: Date.now(),
    });
    return;
  }

  const hasBotKoraAlert = initialPlayersList.some(
    (p) => shouldBotTriggerKoraAlert(p, p.aiStrategy || 'CONSERVATIVE')
  );

  const initialGameState: GameState = {
    phase: 'PLAYING',
    players: initialPlayersList,
    pot: pot,
    baseBet: room.baseBet,
    initialCapital: room.initialCapital,
    enableDoubleKora: room.enableDoubleKora,
    enableUnder21: room.enableUnder21,
    showBotPersonalityIcons: true,
    enableKoraHunterAlerts: true,
    showKoraHunterAlert: hasBotKoraAlert,
    koraHunterAlertShown: hasBotKoraAlert,
    dealerIndex: dealerIdx,
    leadIndex: leadIdx,
    currentTurnIndex: leadIdx,
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
    isThinkingAI: leadIsAI,
    aiThinkingPlayerName: leadIsAI ? finalPlayers[leadIdx].name : null,
    humanSelectedCardId: null,
    turnStartedAt: Date.now(),
    partieCount: 1,
    roundCount: 1,
  };

  await updateDoc(roomRef, {
    status: 'PLAYING',
    players: finalPlayers,
    gameState: initialGameState,
    updatedAt: Date.now(),
  });
}

export async function playCardInRoom(
  room: MultiplayerRoom,
  playerIndex: number,
  card: Card
): Promise<void> {
  const roomRef = doc(db, 'rooms', room.id);
  const gs = room.gameState;
  if (!gs || gs.phase !== 'PLAYING') return;

  // Validate that it is actually this player's turn
  if (gs.currentTurnIndex !== playerIndex) {
    console.warn(`playCardInRoom rejected: turn is ${gs.currentTurnIndex}, got ${playerIndex}`);
    return;
  }

  const currentTrick = { ...gs.currentTrick };
  const leadSuit = currentTrick.plays.length === 0 ? card.suit : currentTrick.leadSuit;
  const activePlayers = gs.players.filter((p) => !p.isEliminated);
  const isMatching = currentTrick.plays.length === 0 || card.suit === leadSuit;

  const playedCard: PlayedCard = {
    card,
    playerIndex,
    playerName: gs.players[playerIndex].name,
    isLeadCard: currentTrick.plays.length === 0,
    isMatchingSuit: isMatching,
    isWinningSoFar: false,
    playedOrder: currentTrick.plays.length + 1,
  };

  const updatedPlays = [...currentTrick.plays, playedCard];

  // Update winningSoFar indicator
  const tempWinner = determineTrickWinner(updatedPlays, leadSuit!);
  const finalPlays = updatedPlays.map((p) => ({
    ...p,
    isWinningSoFar: tempWinner.winnerPlay ? p.card.id === tempWinner.winnerPlay.card.id : false,
  }));

  currentTrick.plays = finalPlays;
  currentTrick.leadSuit = leadSuit;

  // Remove card from player hand in room.players & gs.players
  const updatedPlayers = gs.players.map((p, idx) => {
    if (idx === playerIndex) {
      return {
        ...p,
        hand: p.hand.filter((c) => c.id !== card.id),
      };
    }
    return p;
  });

  const updatedRoomPlayers = room.players.map((p, idx) => {
    if (idx === playerIndex) {
      return {
        ...p,
        hand: p.hand.filter((c) => c.id !== card.id),
      };
    }
    return p;
  });

  const isTrickComplete = finalPlays.length === activePlayers.length;

  if (!isTrickComplete) {
    // Advance to next active player
    let nextIdx = (gs.currentTurnIndex + 1) % gs.players.length;
    let attempts = 0;
    while (gs.players[nextIdx].isEliminated && attempts < gs.players.length) {
      nextIdx = (nextIdx + 1) % gs.players.length;
      attempts++;
    }

    const nextIsAI = !updatedPlayers[nextIdx].isHuman;

    let shouldShowBotKoraAlert = gs.showKoraHunterAlert;
    let koraAlertAlreadyShown = gs.koraHunterAlertShown;

    if (gs.enableKoraHunterAlerts !== false && !koraAlertAlreadyShown) {
      const anyBotHunter = updatedPlayers.some((p) => {
        if (p.isHuman) return false;
        const strat = evaluateAndShiftBotStrategy(p, gs.currentTrickNumber, updatedPlayers, gs.tricksHistory, currentTrick.plays);
        return shouldBotTriggerKoraAlert(p, strat, true);
      });
      if (anyBotHunter) {
        shouldShowBotKoraAlert = true;
        koraAlertAlreadyShown = true;
      }
    }

    const nextGameState: GameState = {
      ...gs,
      players: updatedPlayers,
      currentTrick,
      currentTurnIndex: nextIdx,
      turnStartedAt: Date.now(),
      isThinkingAI: nextIsAI,
      aiThinkingPlayerName: nextIsAI ? updatedPlayers[nextIdx].name : null,
      showKoraHunterAlert: shouldShowBotKoraAlert,
      koraHunterAlertShown: koraAlertAlreadyShown,
    };

    await updateDoc(roomRef, {
      players: updatedRoomPlayers,
      gameState: nextGameState,
      updatedAt: Date.now(),
    });
    return;
  }

  // Trick is complete! Resolve trick winner
  const winningPlay = determineTrickWinner(finalPlays, leadSuit!);
  const trickWinnerIdx = winningPlay.winnerPlay ? winningPlay.winnerPlay.playerIndex : playerIndex;
  const trickWinnerName = gs.players[trickWinnerIdx].name;

  const completedTrick: Trick = {
    ...currentTrick,
    isComplete: true,
    winnerIndex: trickWinnerIdx,
    winnerName: trickWinnerName,
    winningCard: winningPlay.winnerPlay ? winningPlay.winnerPlay.card : card,
  };

  // Increment trick count for winner
  const playersWithTrick = updatedPlayers.map((p, idx) => {
    if (idx === trickWinnerIdx) {
      return { ...p, tricksWonInRound: p.tricksWonInRound + 1 };
    }
    return p;
  });

  const roomPlayersWithTrick = updatedRoomPlayers.map((p, idx) => {
    if (idx === trickWinnerIdx) {
      return { ...p, tricksWonInRound: p.tricksWonInRound + 1 };
    }
    return p;
  });

  const updatedTricksHistory = [...gs.tricksHistory, completedTrick];

  // Check if this was the final trick of the partie (Trick 5)
  if (gs.currentTrickNumber >= 5) {
    // PARTIE OVER! The winner of trick 5 wins the Partie!
    const partieWinnerIndex = trickWinnerIdx;
    const partieWinner = playersWithTrick[partieWinnerIndex];

    // Determine special win types (Kora, Double Kora, Standard) and calculate exact financial penalties
    let winType: PartieWinType = 'STANDARD';
    let multiplier = 1;
    const currentConsecutive = gs.consecutiveThreesCountByPlayer || {};
    const currentDoubleKoraAchieved = gs.doubleKoraAchievedByPlayer || {};
    const newConsecutiveThrees = { ...currentConsecutive };
    const newDoubleKoraAchieved = { ...currentDoubleKoraAchieved };

    if (completedTrick.winningCard && completedTrick.winningCard.value === 3) {
      const trick4FromHistory = updatedTricksHistory[3] || gs.tricksHistory[3];
      const isTrick4WonByWinnerWithThree = Boolean(
        trick4FromHistory &&
        trick4FromHistory.winnerIndex === partieWinnerIndex &&
        trick4FromHistory.winningCard?.value === 3
      );
      const prevThrees = currentConsecutive[partieWinnerIndex] || 0;
      if ((isTrick4WonByWinnerWithThree || prevThrees >= 1) && gs.enableDoubleKora) {
        winType = 'DOUBLE_KORA';
        multiplier = 4;
        newDoubleKoraAchieved[partieWinnerIndex] = true;
        newConsecutiveThrees[partieWinnerIndex] = prevThrees + 1;
      } else {
        winType = 'KORA';
        multiplier = 2;
        newConsecutiveThrees[partieWinnerIndex] = prevThrees + 1;
      }
    } else {
      newConsecutiveThrees[partieWinnerIndex] = 0;
    }

    const extraCostPerLoser = gs.baseBet * (multiplier - 1);
    let totalExtraCollected = 0;

    const playersAfterPenalty = playersWithTrick.map((p, idx) => {
      if (p.isEliminated || idx === partieWinnerIndex) return p;
      const actualPenalty = Math.min(p.capital, extraCostPerLoser);
      totalExtraCollected += actualPenalty;
      const newCap = p.capital - actualPenalty;
      return { ...p, capital: newCap, score: newCap };
    });

    const roomPlayersAfterPenalty = roomPlayersWithTrick.map((p, idx) => {
      if (p.isEliminated || idx === partieWinnerIndex) return p;
      const actualPenalty = Math.min(p.capital, extraCostPerLoser);
      const newCap = p.capital - actualPenalty;
      return { ...p, capital: newCap, score: newCap };
    });

    const playersWithWinnings = playersAfterPenalty.map((p, idx) => {
      if (idx === partieWinnerIndex) {
        const newCap = p.capital + gs.pot + totalExtraCollected;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    const roomPlayersWithWinnings = roomPlayersAfterPenalty.map((p, idx) => {
      if (idx === partieWinnerIndex) {
        const newCap = p.capital + gs.pot + totalExtraCollected;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    // Check elimination
    const playersAfterElimination = playersWithWinnings.map((p) => ({
      ...p,
      isEliminated: p.capital < gs.baseBet,
    }));

    const roomPlayersAfterElimination = roomPlayersWithWinnings.map((p) => ({
      ...p,
      isEliminated: p.capital < gs.baseBet,
    }));

    const remainingActive = playersAfterElimination.filter((p) => !p.isEliminated);
    const isMancheOver = remainingActive.length <= 1;

    const mancheWinnerIdx = isMancheOver
      ? playersAfterElimination.findIndex((p) => p.id === (remainingActive[0] || playersAfterElimination[0]).id)
      : null;

    const finalGameState: GameState = {
      ...gs,
      phase: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: playersAfterElimination,
      pot: gs.pot + totalExtraCollected,
      currentTrick: completedTrick,
      tricksHistory: updatedTricksHistory,
      partieWinnerIndex: partieWinnerIndex,
      partieWinnerName: partieWinner.name,
      partieWinType: winType,
      consecutiveThreesCountByPlayer: newConsecutiveThrees,
      doubleKoraAchievedByPlayer: newDoubleKoraAchieved,
      mancheWinnerIndex: mancheWinnerIdx,
      mancheWinnerName: mancheWinnerIdx !== null ? playersAfterElimination[mancheWinnerIdx].name : null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      showKoraHunterAlert: false,
    };

    const playersSummary = playersAfterElimination.map((p, idx) => {
      const startCapital = gs.players[idx]?.capital ?? p.capital;
      return {
        id: p.id,
        name: p.name,
        deltaCapital: p.capital - startCapital,
        finalCapital: p.capital,
      };
    });

    const previousPartieSummary: PreviousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: partieWinner.name,
      winType: winType,
      potWon: gs.pot + totalExtraCollected,
      winningCard: completedTrick.winningCard || undefined,
      playersSummary,
    };

    const roomPlayersResetReady = roomPlayersAfterElimination.map((p) => ({
      ...p,
      readyForNextPartie: false,
    }));

    await updateDoc(roomRef, {
      status: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: roomPlayersResetReady,
      gameState: finalGameState,
      roundEndAutoAdvanceAt: isMancheOver ? null : Date.now() + 25000,
      previousPartieSummary,
      updatedAt: Date.now(),
    });
    return;
  }

  // Not the final trick, advance to next trick (trick 2, 3, 4, or 5)
  const isWinningCardThree = completedTrick.winningCard?.value === 3;
  const currentConsecutive = gs.consecutiveThreesCountByPlayer || {};
  const prevConsecutive = currentConsecutive[trickWinnerIdx] || 0;
  const newConsecutiveThrees = {
    ...currentConsecutive,
    [trickWinnerIdx]: isWinningCardThree ? prevConsecutive + 1 : 0,
  };
  Object.keys(newConsecutiveThrees).forEach((key) => {
    const idx = Number(key);
    if (idx !== trickWinnerIdx) {
      newConsecutiveThrees[idx] = 0;
    }
  });

  const nextTrickNumber = gs.currentTrickNumber + 1;
  const nextTrick: Trick = {
    trickNumber: nextTrickNumber,
    leadSuit: null,
    leadPlayerIndex: trickWinnerIdx,
    leadPlayerName: trickWinnerName,
    plays: [],
    winnerIndex: null,
    winnerName: null,
    winningCard: null,
    isComplete: false,
  };

  const nextIsAI = !playersWithTrick[trickWinnerIdx].isHuman;

  const nextGameState: GameState = {
    ...gs,
    players: playersWithTrick,
    currentTrick: nextTrick,
    tricksHistory: updatedTricksHistory,
    currentTrickNumber: nextTrickNumber,
    consecutiveThreesCountByPlayer: newConsecutiveThrees,
    leadIndex: trickWinnerIdx,
    currentTurnIndex: trickWinnerIdx,
    turnStartedAt: Date.now(),
    isThinkingAI: nextIsAI,
    aiThinkingPlayerName: nextIsAI ? playersWithTrick[trickWinnerIdx].name : null,
  };

  await updateDoc(roomRef, {
    players: roomPlayersWithTrick,
    gameState: nextGameState,
    updatedAt: Date.now(),
  });
}

export async function nextPartieMultiplayer(room: MultiplayerRoom): Promise<void> {
  const roomRef = doc(db, 'rooms', room.id);
  const gs = room.gameState;
  if (!gs) return;

  const currentPlayers = gs.players;
  const activePlayers = currentPlayers.filter((p) => !p.isEliminated && p.capital >= gs.baseBet);

  if (activePlayers.length <= 1) {
    // Manche over
    const survivor = activePlayers[0] || currentPlayers[0];
    const survivorIdx = currentPlayers.findIndex((p) => p.id === survivor.id);
    await updateDoc(roomRef, {
      status: 'MANCHE_OVER',
      gameState: {
        ...gs,
        phase: 'MANCHE_OVER',
        mancheWinnerIndex: survivorIdx,
        mancheWinnerName: survivor.name,
      },
      updatedAt: Date.now(),
    });
    return;
  }

  const pot = gs.baseBet * activePlayers.length;
  const fullDeck = build31Deck();
  const shuffled = shuffleDeck(fullDeck);
  const { hands } = dealCards(shuffled, activePlayers.length);

  let handIdx = 0;
  const updatedPlayers = currentPlayers.map((p) => {
    if (!p.isEliminated && p.capital >= gs.baseBet) {
      const newCap = p.capital - gs.baseBet;
      const hand = hands[handIdx++] || [];
      return {
        ...p,
        capital: newCap,
        score: newCap,
        hand,
        tricksWonInRound: 0,
      };
    }
    return { ...p, hand: [], tricksWonInRound: 0 };
  });

  const updatedRoomPlayers = room.players.map((rp, idx) => {
    const match = updatedPlayers[idx];
    return match ? { ...rp, capital: match.capital, score: match.capital, hand: match.hand, tricksWonInRound: 0 } : rp;
  });

  // Check Instant Wins (Trois 7 / Moins de 21) for the new partie!
  const instantWin = checkInstantWinsInMultiplayer(updatedPlayers, gs.enableUnder21);
  if (instantWin) {
    const winnerIdx = instantWin.winnerIndex;
    const winnerName = instantWin.winnerName;

    const playersAfterInstantWin = updatedPlayers.map((p, idx) => {
      if (idx === winnerIdx) {
        const newCap = p.capital + pot;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    const roomPlayersAfterInstantWin = updatedRoomPlayers.map((p, idx) => {
      if (idx === winnerIdx) {
        const newCap = p.capital + pot;
        return { ...p, capital: newCap, score: newCap };
      }
      return p;
    });

    const evaluatedPlayers = playersAfterInstantWin.map((p) => ({
      ...p,
      isEliminated: p.capital < gs.baseBet,
    }));

    const roomEvaluatedPlayers = roomPlayersAfterInstantWin.map((p) => ({
      ...p,
      isEliminated: p.capital < gs.baseBet,
    }));

    const remainingActive = evaluatedPlayers.filter((p) => !p.isEliminated);
    const isMancheOver = remainingActive.length <= 1;

    const instantGameState: GameState = {
      ...gs,
      phase: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: evaluatedPlayers,
      pot,
      tricksHistory: [],
      currentTrickNumber: 1,
      partieWinnerIndex: winnerIdx,
      partieWinnerName: winnerName,
      partieWinType: instantWin.winType,
      mancheWinnerIndex: isMancheOver ? evaluatedPlayers.findIndex((p) => p.id === (remainingActive[0] || evaluatedPlayers[0]).id) : null,
      mancheWinnerName: isMancheOver ? (remainingActive[0] || evaluatedPlayers[0]).name : null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      partieCount: gs.partieCount + 1,
    };

    await updateDoc(roomRef, {
      status: isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER',
      players: roomEvaluatedPlayers,
      gameState: instantGameState,
      roundEndAutoAdvanceAt: isMancheOver ? null : Date.now() + 25000,
      updatedAt: Date.now(),
    });
    return;
  }

  let nextDealer = (gs.dealerIndex + 1) % currentPlayers.length;
  while (currentPlayers[nextDealer].isEliminated) {
    nextDealer = (nextDealer + 1) % currentPlayers.length;
  }

  let nextLead = (nextDealer + 1) % currentPlayers.length;
  while (currentPlayers[nextLead].isEliminated) {
    nextLead = (nextLead + 1) % currentPlayers.length;
  }

  const nextTrick: Trick = {
    trickNumber: 1,
    leadSuit: null,
    leadPlayerIndex: nextLead,
    leadPlayerName: updatedPlayers[nextLead].name,
    plays: [],
    winnerIndex: null,
    winnerName: null,
    winningCard: null,
    isComplete: false,
  };

  const nextIsAI = !updatedPlayers[nextLead].isHuman;

  const nextGameState: GameState = {
    ...gs,
    phase: 'PLAYING',
    players: updatedPlayers,
    pot,
    dealerIndex: nextDealer,
    leadIndex: nextLead,
    currentTurnIndex: nextLead,
    turnStartedAt: Date.now(),
    currentTrickNumber: 1,
    currentTrick: nextTrick,
    tricksHistory: [],
    partieWinnerIndex: null,
    partieWinnerName: null,
    partieWinType: null,
    partieCount: gs.partieCount + 1,
    isThinkingAI: nextIsAI,
    aiThinkingPlayerName: nextIsAI ? updatedPlayers[nextLead].name : null,
    showKoraHunterAlert: false,
    koraHunterAlertShown: false,
  };

  // Reset ready state for all players for the new round
  const freshRoomPlayers = updatedRoomPlayers.map((p) => ({
    ...p,
    readyForNextPartie: false,
  }));

  await updateDoc(roomRef, {
    status: 'PLAYING',
    players: freshRoomPlayers,
    gameState: nextGameState,
    roundEndAutoAdvanceAt: null,
    updatedAt: Date.now(),
  });
}

// Atomically and safely advances to next partie, avoiding duplicate executions
export async function advanceToNextPartieSafely(
  roomCode: string,
  _callerId?: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    // Guard against race condition: only advance if room is currently in PARTIE_OVER
    if (room.status !== 'PARTIE_OVER') {
      return;
    }
    await nextPartieMultiplayer(room);
  } catch (err) {
    console.error('Error advancing to next partie safely:', err);
  }
}

// Player toggles their ready status in EndRoundModal. If all connected humans are ready, advances automatically!
export async function togglePlayerReadyForNext(
  roomCode: string,
  playerId: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    if (room.status !== 'PARTIE_OVER') return;

    let targetIsReady = true;
    const updatedPlayers = room.players.map((p) => {
      if (p.id === playerId) {
        targetIsReady = !p.readyForNextPartie;
        return { ...p, readyForNextPartie: targetIsReady, lastSeen: Date.now() };
      }
      return p;
    });

    await updateDoc(roomRef, {
      players: updatedPlayers,
      updatedAt: Date.now(),
    });

    // Check if all connected active human players are ready
    const now = Date.now();
    const activeConnectedHumans = updatedPlayers.filter(
      (p) => p.isHuman && !p.isEliminated && !p.isSpectator && (now - (p.lastSeen || 0) < 15000 || p.id === playerId)
    );

    const allReady =
      activeConnectedHumans.length > 0 &&
      activeConnectedHumans.every((p) => p.readyForNextPartie);

    if (allReady) {
      await nextPartieMultiplayer({ ...room, players: updatedPlayers });
    }
  } catch (err) {
    console.error('Error toggling ready status:', err);
  }
}

// Watchdog: If 4 cards are played on table and trick isn't completed after 2.5s, active coordinator resolves it
export async function resolveTrickWatchdog(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    const gs = room.gameState;
    if (room.status !== 'PLAYING' || !gs || gs.phase !== 'PLAYING') return;

    const activePlayers = gs.players.filter((p) => !p.isEliminated);
    const plays = gs.currentTrick?.plays || [];

    // Only resolve if all required cards are played but trick is not complete yet
    if (plays.length >= activePlayers.length && !gs.currentTrick.isComplete) {
      console.warn('Watchdog: force resolving completed trick on room', roomCode);
      const lastPlay = plays[plays.length - 1];
      if (lastPlay) {
        await playCardInRoom(room, lastPlay.playerIndex, lastPlay.card);
      }
    }
  } catch (err) {
    console.error('Error in resolveTrickWatchdog:', err);
  }
}

// Guests can vote to fill with bots and start in lobby if host is slow
export async function voteStartWithBotsInLobby(
  roomCode: string,
  playerId: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as MultiplayerRoom;
    if (room.status !== 'LOBBY') return;

    const currentVotes = room.botVotes || [];
    const newVotes = currentVotes.includes(playerId)
      ? currentVotes
      : [...currentVotes, playerId];

    const humanPlayers = room.players.filter((p) => p.isHuman);
    const majority = Math.ceil(humanPlayers.length / 2);

    if (newVotes.length >= majority) {
      // Majority reached: auto-enable bots and start game
      const updatedRoom: MultiplayerRoom = {
        ...room,
        fillWithBots: true,
        botVotes: newVotes,
      };
      await startMultiplayerGame(updatedRoom);
    } else {
      await updateDoc(roomRef, {
        botVotes: newVotes,
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.error('Error voting to start with bots in lobby:', err);
  }
}

// Reclaims host role if the current host is inactive (> 8s without heartbeat)
export async function claimHostIfHostInactive(
  roomCode: string,
  claimerId: string
): Promise<boolean> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return false;
    const room = snap.data() as MultiplayerRoom;

    const currentHost = room.players.find((p) => p.id === room.hostId);
    const now = Date.now();
    const isHostOffline = !currentHost || (now - (currentHost.lastSeen || 0) > 8000) || currentHost.isAway;

    if (isHostOffline && room.hostId !== claimerId) {
      const claimer = room.players.find((p) => p.id === claimerId);
      if (!claimer) return false;

      const updatedPlayers = room.players.map((p) => ({
        ...p,
        isHost: p.id === claimerId,
      }));

      await updateDoc(roomRef, {
        hostId: claimerId,
        hostName: claimer.name,
        players: updatedPlayers,
        updatedAt: Date.now(),
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error claiming host:', err);
    return false;
  }
}

export async function playAutoMoveForPlayerInRoom(
  room: MultiplayerRoom,
  playerIndex: number
): Promise<void> {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'PLAYING') return;
  if (gs.currentTurnIndex !== playerIndex) return;

  const player = gs.players[playerIndex];
  if (!player || player.isEliminated || player.hand.length === 0) return;

  const currentTrick = gs.currentTrick;
  const leadSuit = currentTrick?.leadSuit;
  let playableCards = player.hand;

  if (leadSuit && currentTrick.plays.length > 0) {
    const matching = player.hand.filter((c) => c.suit === leadSuit);
    if (matching.length > 0) {
      playableCards = matching;
    }
  }

  // Play the lowest value legal card
  const sorted = [...playableCards].sort((a, b) => a.value - b.value);
  const chosenCard = sorted[0];
  if (chosenCard) {
    await playCardInRoom(room, playerIndex, chosenCard);
  }
}

export async function sendEmoteInMultiplayerRoom(
  roomCode: string,
  emote: EmoteMessage
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  const now = Date.now();
  const existing = (room.activeEmotes || []).filter((e) => now - e.timestamp < 5000);

  await updateDoc(roomRef, {
    activeEmotes: [...existing, emote],
    updatedAt: now,
  });
}

export async function resetMancheMultiplayer(room: MultiplayerRoom): Promise<void> {
  const roomRef = doc(db, 'rooms', room.id);
  const resetRoomPlayers = room.players.map((p) => ({
    ...p,
    capital: room.initialCapital,
    score: room.initialCapital,
    isEliminated: false,
    hand: [],
    tricksWonInRound: 0,
    isReady: true,
  }));

  await updateDoc(roomRef, {
    status: 'LOBBY',
    players: resetRoomPlayers,
    gameState: null,
    updatedAt: Date.now(),
  });
}

export async function triggerKoraHunterAlertInRoom(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  if (!room.gameState) return;

  await updateDoc(roomRef, {
    'gameState.showKoraHunterAlert': true,
    'gameState.koraHunterAlertShown': true,
    updatedAt: Date.now(),
  });
}

export async function dismissKoraHunterAlertInRoom(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as MultiplayerRoom;
  if (!room.gameState) return;

  await updateDoc(roomRef, {
    'gameState.showKoraHunterAlert': false,
    updatedAt: Date.now(),
  });
}

