import {
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  PlayerProfile,
  PlayerStats,
  DEFAULT_PLAYER_STATS,
  PlayerFairPlay,
  DEFAULT_PLAYER_FAIR_PLAY,
  FairPlaySanction,
  PlayerOpponentSummary,
  PlayerGameHistoryItem,
  AvatarOptionId,
  HONORIFIC_TITLES,
  HonorificTitle,
} from '../types/playerProfile';
import { getPersistentItem, setPersistentItem } from '../utils/storageUtils';
import { RivalryService } from './rivalryService';

export { DEFAULT_PLAYER_STATS, DEFAULT_PLAYER_FAIR_PLAY };

const PROFILE_KEY = 'njambo_player_profile_v1';
const HISTORY_KEY = 'njambo_player_history_v1';
const GUEST_BACKUP_KEY = 'njambo_guest_profile_backup';
export const OFFLINE_QUEUE_KEY = 'njambo_offline_sync_queue_v1';

export interface PendingOfflineSyncItem {
  id: string;
  type: 'PROFILE' | 'PARTIE' | 'GAME' | 'SANCTION';
  userId: string;
  docPath: string;
  payload: any;
  queuedAt: number;
  retryCount: number;
}

function generateGuestId(): string {
  const existing = getPersistentItem('njambo_player_id');
  if (existing && existing.startsWith('usr_')) return existing;
  const newId = 'usr_' + Math.random().toString(36).substring(2, 9);
  setPersistentItem('njambo_player_id', newId);
  return newId;
}

function getInitialDisplayName(): string {
  const existing = getPersistentItem('njambo_player_name');
  if (existing && existing.trim().toLowerCase() !== 'katika') {
    return existing.trim();
  }
  const defaultName = 'Joueur ' + Math.floor(100 + Math.random() * 900);
  setPersistentItem('njambo_player_name', defaultName);
  return defaultName;
}

export function sanitizeDisplayName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.toLowerCase() === 'katika' || cleaned.toLowerCase().includes('katika admin')) {
    return 'Joueur ' + Math.floor(100 + Math.random() * 900);
  }
  return cleaned.slice(0, 24);
}

export function applyStatsFallback(stats: PlayerStats | any): PlayerStats {
  const finalStats = { ...stats } as any;

  // 0. Legacy property mapping
  if (finalStats.korasCount !== undefined && finalStats.koraCount === undefined) {
    finalStats.koraCount = finalStats.korasCount;
  }
  if (finalStats.doubleKorasCount !== undefined && finalStats.doubleKoraCount === undefined) {
    finalStats.doubleKoraCount = finalStats.doubleKorasCount;
  }
  if (finalStats.wins !== undefined && finalStats.gamesWon === undefined) {
    finalStats.gamesWon = finalStats.wins;
  }
  if (finalStats.victories !== undefined && finalStats.gamesWon === undefined) {
    finalStats.gamesWon = finalStats.victories;
  }

  // 1. Fallback for Parties Won
  const legacyDetailedWins = (finalStats.soloGamesWon || 0) + (finalStats.multiplayerGamesWon || 0);
  let gamesWon = finalStats.partiesWon || finalStats.gamesWon || legacyDetailedWins || 0;
  
  // Ensure the root fields are correctly set
  finalStats.gamesWon = gamesWon;
  finalStats.partiesWon = gamesWon;

  const soloGamesWon = finalStats.soloGamesWon || 0;
  const multiplayerGamesWon = finalStats.multiplayerGamesWon || 0;
  const totalDetailedWins = soloGamesWon + multiplayerGamesWon;

  const soloPlayed = finalStats.soloGamesPlayed || 0;
  const multiPlayed = finalStats.multiplayerGamesPlayed || 0;
  const totalPlayed = soloPlayed + multiPlayed;
  const soloRatio = totalPlayed > 0 ? soloPlayed / totalPlayed : 1.0;

  if (totalDetailedWins < gamesWon) {
    const missingWins = gamesWon - totalDetailedWins;
    if (totalPlayed > 0) {
      const estimatedSoloWins = Math.min(soloPlayed, Math.round(missingWins * soloRatio));
      const estimatedMultiWins = missingWins - estimatedSoloWins;
      finalStats.soloGamesWon = soloGamesWon + estimatedSoloWins;
      finalStats.multiplayerGamesWon = multiplayerGamesWon + estimatedMultiWins;
    } else {
      finalStats.soloGamesWon = soloGamesWon + missingWins;
    }
  }

  // 2. Fallback for Manches Won (distribute generic manches into solo/multi)
  const legacyDetailedManches = (finalStats.soloManchesWon || 0) + (finalStats.multiplayerManchesWon || 0);
  let manchesWon = finalStats.manchesWon || legacyDetailedManches || 0;
  finalStats.manchesWon = manchesWon;

  const soloManchesWon = finalStats.soloManchesWon || 0;
  const multiplayerManchesWon = finalStats.multiplayerManchesWon || 0;
  const totalDetailedManchesCount = soloManchesWon + multiplayerManchesWon;

  if (totalDetailedManchesCount < manchesWon) {
    const missingManches = manchesWon - totalDetailedManchesCount;
    // Default unclassified manches to solo
    finalStats.soloManchesWon = soloManchesWon + missingManches;
  }

  // 2. Fallback for Koras Count
  const totalKoras = finalStats.koraCount || 0;
  const soloKoras = finalStats.soloKoraCount || 0;
  const multiKoras = finalStats.multiplayerKoraCount || 0;
  const totalDetailedKoras = soloKoras + multiKoras;

  if (totalDetailedKoras < totalKoras) {
    const missingKoras = totalKoras - totalDetailedKoras;
    const estimatedSoloKoras = Math.round(missingKoras * soloRatio);
    const estimatedMultiKoras = missingKoras - estimatedSoloKoras;
    finalStats.soloKoraCount = soloKoras + estimatedSoloKoras;
    finalStats.multiplayerKoraCount = multiKoras + estimatedMultiKoras;
  }

  // 3. Fallback for Double Koras Count
  const totalDoubleKoras = finalStats.doubleKoraCount || 0;
  const soloDoubleKoras = finalStats.soloDoubleKoraCount || 0;
  const multiDoubleKoras = finalStats.multiplayerDoubleKoraCount || 0;
  const totalDetailedDoubleKoras = soloDoubleKoras + multiDoubleKoras;

  if (totalDetailedDoubleKoras < totalDoubleKoras) {
    const missingDoubleKoras = totalDoubleKoras - totalDetailedDoubleKoras;
    const estimatedSoloDoubleKoras = Math.round(missingDoubleKoras * soloRatio);
    const estimatedMultiDoubleKoras = missingDoubleKoras - estimatedSoloDoubleKoras;
    finalStats.soloDoubleKoraCount = soloDoubleKoras + estimatedSoloDoubleKoras;
    finalStats.multiplayerDoubleKoraCount = multiDoubleKoras + estimatedMultiDoubleKoras;
  }

  // 4. Fallback for Fortune, Gains and Pertes
  if (finalStats.fortune > 0 && finalStats.multiplayerGains === 0) {
    finalStats.multiplayerGains = finalStats.fortune;
    finalStats.multiplayerPertes = 0;
  }

  // 5. Calculer les ratios de victoire
  finalStats.soloWinRate = finalStats.soloGamesPlayed > 0
    ? Math.round((finalStats.soloGamesWon / finalStats.soloGamesPlayed) * 100)
    : 0;
  finalStats.multiplayerWinRate = finalStats.multiplayerGamesPlayed > 0
    ? Math.round((finalStats.multiplayerGamesWon / finalStats.multiplayerGamesPlayed) * 100)
    : 0;

  // 6. Calculer le Score de Maîtrise consolidé
  finalStats.masteryScore = computeMasteryScore(finalStats);

  return finalStats;
}

/**
 * Barème officiel du Score de Maîtrise (1 à 20 pts par accomplissement) :
 * - Manche Multijoueur : +10 pts
 * - Manche Solo Difficile (EXPERT / GRAND_MASTER) : +6 pts
 * - Manche Solo Moyen (NORMAL) : +3 pts
 * - Manche Solo Facile (EASY) : +1 pt
 * - Partie individuelle (donne) gagnée : +1 pt
 * - Exploit Kora Simple : +5 pts
 * - Exploit Suprême Double Kora : +20 pts
 */
export const MASTERY_POINTS_CONFIG = {
  MANCHE_MULTIPLAYER: 10,
  MANCHE_SOLO_HARD: 6,
  MANCHE_SOLO_NORMAL: 3,
  MANCHE_SOLO_EASY: 1,
  PARTIE_WIN: 1,
  KORA_SIMPLE: 5,
  DOUBLE_KORA: 20,
} as const;

/**
 * Calcule dynamiquement le Score de Maîtrise (1-20 pts) à partir des statistiques du joueur.
 */
export function computeMasteryScore(rawStats?: Partial<PlayerStats> | null): number {
  if (!rawStats) return 0;
  const s = rawStats;

  const mpManches = s.multiplayerManchesWon || 0;
  const soloHardManches = s.soloManchesWonHard || 0;
  const soloNormalManches = s.soloManchesWonNormal || 0;
  const soloEasyManches = s.soloManchesWonEasy || 0;

  const totalDetailedSolo = soloHardManches + soloNormalManches + soloEasyManches;
  const totalSoloManches = s.soloManchesWon || 0;
  const untrackedSoloManches = Math.max(0, totalSoloManches - totalDetailedSolo);
  // Default unclassified solo manches as normal (+3 pts)
  const untrackedSoloPoints = untrackedSoloManches * MASTERY_POINTS_CONFIG.MANCHE_SOLO_NORMAL;

  const partiesWon = s.partiesWon || s.gamesWon || 0;

  const doubleKoras = s.doubleKoraCount || 0;
  const totalKoras = s.koraCount || 0;
  // Enregistrement : un double kora incrémente doubleKoraCount et koraCount. Les koras simples sont koraCount - doubleKoraCount.
  const simpleKoras = Math.max(0, totalKoras - doubleKoras);

  const total =
    (mpManches * MASTERY_POINTS_CONFIG.MANCHE_MULTIPLAYER) +
    (soloHardManches * MASTERY_POINTS_CONFIG.MANCHE_SOLO_HARD) +
    (soloNormalManches * MASTERY_POINTS_CONFIG.MANCHE_SOLO_NORMAL) +
    (soloEasyManches * MASTERY_POINTS_CONFIG.MANCHE_SOLO_EASY) +
    untrackedSoloPoints +
    (partiesWon * MASTERY_POINTS_CONFIG.PARTIE_WIN) +
    (simpleKoras * MASTERY_POINTS_CONFIG.KORA_SIMPLE) +
    (doubleKoras * MASTERY_POINTS_CONFIG.DOUBLE_KORA);

  return Math.max(0, Math.round(total));
}

/**
 * Calcule le détail et le total des points de Maîtrise gagnés lors d'une fin de partie ou de manche.
 */
export function computeEarnedPoints(params: {
  isMancheOver: boolean;
  isWinner: boolean;
  mode: 'SOLO' | 'MULTIPLAYER';
  winType: string;
  difficulty?: string;
}): {
  total: number;
  breakdown: Array<{ label: string; points: number }>;
} {
  const breakdown: Array<{ label: string; points: number }> = [];
  if (!params.isWinner) {
    return { total: 0, breakdown };
  }

  if (params.isMancheOver) {
    if (params.mode === 'MULTIPLAYER') {
      breakdown.push({ label: 'Victoire Manche Multijoueur', points: MASTERY_POINTS_CONFIG.MANCHE_MULTIPLAYER });
    } else {
      const diff = params.difficulty || 'NORMAL';
      if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
        breakdown.push({ label: 'Victoire Manche Solo Difficile', points: MASTERY_POINTS_CONFIG.MANCHE_SOLO_HARD });
      } else if (diff === 'EASY') {
        breakdown.push({ label: 'Victoire Manche Solo Facile', points: MASTERY_POINTS_CONFIG.MANCHE_SOLO_EASY });
      } else {
        breakdown.push({ label: 'Victoire Manche Solo Normale', points: MASTERY_POINTS_CONFIG.MANCHE_SOLO_NORMAL });
      }
    }
  } else {
    // Single Partie
    breakdown.push({ label: 'Donne remportée', points: MASTERY_POINTS_CONFIG.PARTIE_WIN });

    if (params.winType === 'DOUBLE_KORA') {
      breakdown.push({ label: 'Exploit Suprême Double Kora', points: MASTERY_POINTS_CONFIG.DOUBLE_KORA });
    } else if (params.winType === 'KORA') {
      breakdown.push({ label: 'Exploit Kora', points: MASTERY_POINTS_CONFIG.KORA_SIMPLE });
    }
  }

  const total = breakdown.reduce((acc, b) => acc + b.points, 0);
  return { total, breakdown };
}

export function computeHonorificTitle(rawStats?: Partial<PlayerStats> | null): {
  currentTitle: HonorificTitle;
  nextTitle: HonorificTitle | null;
  progressPercent: number;
} {
  const stats: PlayerStats = {
    ...DEFAULT_PLAYER_STATS,
    ...(rawStats || {}),
  };

  // Sanitize all numeric fields against NaN/undefined
  (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
    if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
      stats[key] = 0;
    }
  });

  // Titles are in ascending difficulty: APPRENTI -> CONFIRME -> CHASSEUR_KORA -> MAITRE_POSITION -> MAITRE_NJAMBO -> LEGENDE_KORA
  let currentTitle = HONORIFIC_TITLES[0];
  let nextTitle: HonorificTitle | null = HONORIFIC_TITLES[1];

  const qualifies = (t: HonorificTitle): boolean => {
    const req = t.requirements;
    if (req.minGames && (stats.gamesPlayed || 0) < req.minGames) return false;
    if (req.minWins && (stats.gamesWon || 0) < req.minWins) return false;
    if (req.minKoras && (stats.koraCount || 0) < req.minKoras) return false;
    if (req.minDoubleKoras && (stats.doubleKoraCount || 0) < req.minDoubleKoras) return false;
    if (req.minPotWon && (stats.biggestPotWon || 0) < req.minPotWon) return false;
    return true;
  };

  for (let i = HONORIFIC_TITLES.length - 1; i >= 0; i--) {
    if (qualifies(HONORIFIC_TITLES[i])) {
      currentTitle = HONORIFIC_TITLES[i];
      nextTitle = i < HONORIFIC_TITLES.length - 1 ? HONORIFIC_TITLES[i + 1] : null;
      break;
    }
  }

  // Calculate progress towards next title
  let progressPercent = 100;
  if (nextTitle) {
    const req = nextTitle.requirements;
    const fractions: number[] = [];
    if (req.minGames) fractions.push(Math.min(1, (stats.gamesPlayed || 0) / req.minGames));
    if (req.minWins) fractions.push(Math.min(1, (stats.gamesWon || 0) / req.minWins));
    if (req.minKoras) fractions.push(Math.min(1, (stats.koraCount || 0) / req.minKoras));
    if (req.minPotWon) fractions.push(Math.min(1, (stats.biggestPotWon || 0) / req.minPotWon));

    if (fractions.length > 0) {
      const avg = fractions.reduce((a, b) => a + b, 0) / fractions.length;
      progressPercent = Math.min(100, Math.max(0, Math.round(avg * 100)));
    }
  }

  return { currentTitle, nextTitle, progressPercent: isNaN(progressPercent) ? 0 : progressPercent };
}

export const playerProfileService = {
  /**
   * Initializes or loads the current player profile from localStorage with full schema guarantees.
   */
  getLocalProfile(): PlayerProfile {
    const guestId = generateGuestId();
    const guestName = getInitialDisplayName();

    const defaultProfile: PlayerProfile = {
      uid: guestId,
      displayName: guestName,
      email: null,
      photoURL: null,
      avatarId: 'lion',
      isGuest: true,
      chips: 1000,
      stats: { ...DEFAULT_PLAYER_STATS },
      fairPlay: { ...DEFAULT_PLAYER_FAIR_PLAY },
      honorificTitleId: 'APPRENTI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      const storedChips = localStorage.getItem('njambo_player_chips');
      let fallbackChips = 1000;
      if (storedChips) {
        const parsedChips = parseInt(storedChips, 10);
        if (!isNaN(parsedChips)) fallbackChips = parsedChips;
      }

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PlayerProfile>;
        if (parsed && typeof parsed === 'object') {
          // Merge stats safely with default zero-values
          const mergedStats: PlayerStats = {
            ...DEFAULT_PLAYER_STATS,
            ...(parsed.stats || {}),
          };

          (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
            if (typeof mergedStats[key] !== 'number' || isNaN(mergedStats[key])) {
              mergedStats[key] = 0;
            }
          });

          // Calculate win rate & lost games if not explicitly set
          if (mergedStats.gamesPlayed > 0 && mergedStats.winRate === 0 && mergedStats.gamesWon > 0) {
            mergedStats.winRate = Math.round((mergedStats.gamesWon / mergedStats.gamesPlayed) * 100);
          }
          mergedStats.gamesLost = Math.max(0, mergedStats.gamesPlayed - mergedStats.gamesWon);

          // Apply fallback rule for older users who have victories but no detail set
          const finalStats = applyStatsFallback(mergedStats);

          // Fair play defaults
          const mergedFairPlay: PlayerFairPlay = {
            ...DEFAULT_PLAYER_FAIR_PLAY,
            ...(parsed.fairPlay || {}),
          };

          // Check if active sanction has expired
          if (
            mergedFairPlay.activeSanction &&
            typeof mergedFairPlay.activeSanction === 'object' &&
            mergedFairPlay.activeSanction.expiresAt
          ) {
            if (Date.now() > mergedFairPlay.activeSanction.expiresAt) {
              try {
                mergedFairPlay.activeSanction.active = false;
                mergedFairPlay.activeSanction = null;
              } catch (_) {}
            }
          }

          const completeProfile: PlayerProfile = {
            uid: parsed.uid || guestId,
            displayName: sanitizeDisplayName(parsed.displayName || guestName),
            email: parsed.email || null,
            photoURL: parsed.photoURL || null,
            avatarId: (parsed.avatarId as AvatarOptionId) || 'lion',
            isGuest: parsed.isGuest !== false,
            chips: typeof parsed.chips === 'number' && !isNaN(parsed.chips) ? parsed.chips : fallbackChips,
            stats: finalStats,
            fairPlay: mergedFairPlay,
            honorificTitleId: parsed.honorificTitleId || 'APPRENTI',
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          };

          return completeProfile;
        }
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed reading local profile:', e);
    }

    this.saveLocalProfile(defaultProfile);
    return defaultProfile;
  },

  /**
   * Saves profile locally and syncs legacy keys for engine compatibility.
   */
  saveLocalProfile(profile: PlayerProfile): void {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setPersistentItem('njambo_player_id', profile.uid);
      setPersistentItem('njambo_player_name', profile.displayName);
      localStorage.setItem('njambo_player_chips', (profile.chips ?? 1000).toString());
      if (profile.stats) {
        localStorage.setItem('njambo_player_stats', JSON.stringify(profile.stats));
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed writing local profile:', e);
    }
  },

  /**
   * Retrieves player game history items (up to 100).
   */
  getLocalHistory(): PlayerGameHistoryItem[] {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored) as PlayerGameHistoryItem[];
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed reading local history:', e);
    }
    return [];
  },

  /**
   * Saves game history locally.
   */
  saveLocalHistory(history: PlayerGameHistoryItem[]): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch (e) {
      console.warn('[PlayerProfileService] Failed writing local history:', e);
    }
  },

  /**
   * Retrieves pending offline sync queue (Lot 3 - B).
   */
  getPendingOfflineQueue(): PendingOfflineSyncItem[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Persists pending offline sync queue to localStorage (Lot 3 - B).
   */
  savePendingOfflineQueue(queue: PendingOfflineSyncItem[]): void {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(0, 150)));
    } catch (e) {
      console.warn('[PlayerProfileService] Failed to persist offline queue:', e);
    }
  },

  /**
   * Enqueues an operation for asynchronous background sync to Firestore (Lot 3 - B).
   */
  enqueueOfflineSync(item: Omit<PendingOfflineSyncItem, 'queuedAt' | 'retryCount'>): void {
    const queue = this.getPendingOfflineQueue();
    const filtered = queue.filter((q) => q.id !== item.id);
    filtered.push({
      ...item,
      queuedAt: Date.now(),
      retryCount: 0,
    });
    this.savePendingOfflineQueue(filtered);
    console.log(`[PlayerProfileService] Enqueued offline item: ${item.type} (${item.id})`);
  },

  /**
   * Flushes all pending offline sync items to Firestore (Lot 3 - B).
   */
  async flushOfflineSyncQueue(): Promise<{ syncedCount: number; remainingCount: number }> {
    const queue = this.getPendingOfflineQueue();
    if (queue.length === 0) return { syncedCount: 0, remainingCount: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedCount: 0, remainingCount: queue.length };
    }
    if (!auth.currentUser) {
      return { syncedCount: 0, remainingCount: queue.length };
    }

    let syncedCount = 0;
    const remaining: PendingOfflineSyncItem[] = [];

    for (const item of queue) {
      try {
        const docRef = doc(db, item.docPath);
        await setDoc(docRef, item.payload, { merge: true });
        syncedCount++;
      } catch (err) {
        console.warn(`[PlayerProfileService] Retry failed for offline item ${item.id}:`, err);
        const nextRetry = (item.retryCount || 0) + 1;
        if (nextRetry < 10) {
          remaining.push({ ...item, retryCount: nextRetry });
        }
      }
    }

    this.savePendingOfflineQueue(remaining);
    if (syncedCount > 0) {
      console.log(`[PlayerProfileService] Successfully flushed ${syncedCount} offline sync items to Firestore.`);
    }
    return { syncedCount, remainingCount: remaining.length };
  },

  /**
   * Records the result of an individual Partie (Lot 3 - A & B).
   * Calculates actual pot, credits winner, debits losers, applies Kora/Double Kora multipliers,
   * updates persistent chips balance, updates statistics, and saves to Firestore.
   */
  async recordPartieResult(params: {
    id?: string;
    mode: 'SOLO' | 'MULTIPLAYER';
    partieNumber: number;
    playerCount: number;
    winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21' | 'FORFEIT';
    isWinner: boolean;
    winnerName: string;
    winnerId?: string;
    potWon: number;
    netChipsDelta: number;
    baseBet: number;
    durationSeconds?: number;
    opponents?: PlayerOpponentSummary[];
    tricksWon?: number;
    roomId?: string;
  }): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const history = this.getLocalHistory();

    const partieId = params.id || `partie_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const historyItem: PlayerGameHistoryItem = {
      id: partieId,
      recordType: 'PARTIE',
      mode: params.mode,
      partieNumber: params.partieNumber,
      playerCount: params.playerCount,
      winType: params.winType,
      isWinner: params.isWinner,
      winnerName: params.winnerName,
      winnerId: params.winnerId,
      potWon: params.potWon,
      netChipsDelta: params.netChipsDelta,
      baseBet: params.baseBet,
      roundsCount: params.partieNumber,
      durationSeconds: params.durationSeconds || 30,
      opponents: params.opponents || [],
      tricksWon: params.tricksWon || 0,
      status: 'completed',
      createdAt: Date.now(),
      isDoubleKora: params.winType === 'DOUBLE_KORA',
      isUnder21: params.winType === 'UNDER_21',
      isThreeSevens: params.winType === 'THREE_SEVENS',
      roomId: params.roomId,
    };

    // Keep up to 100 items
    const updatedHistory = [historyItem, ...history.filter((h) => h.id !== partieId)].slice(0, 100);
    this.saveLocalHistory(updatedHistory);

    // Record direct rivalry matches against human opponents
    if (params.opponents && params.opponents.length > 0) {
      try {
        params.opponents.forEach((opp) => {
          if (opp.name && opp.name.toLowerCase() !== 'katika' && !opp.id?.startsWith('bot_')) {
            RivalryService.recordDirectMatch(
              {
                id: partieId,
                createdAt: Date.now(),
                isPlayerWinner: params.isWinner,
                winnerName: params.winnerName,
                winnerId: params.winnerId,
                winType: params.winType,
                baseBet: params.baseBet,
                potWon: params.potWon,
                netDelta: params.netChipsDelta,
                playerTricks: params.tricksWon || 0,
                opponentTricks: (opp as any).tricksWon || 0,
                mode: params.mode,
                recordType: 'PARTIE',
              },
              opp.id,
              opp.name
            );
          }
        });
      } catch (rErr) {
        console.warn('[PlayerProfileService] Failed to record direct rivalry match:', rErr);
      }
    }

    // Update persistent chips balance
    const currentChips = typeof profile.chips === 'number' && !isNaN(profile.chips) ? profile.chips : 1000;
    const newChips = Math.max(0, currentChips + params.netChipsDelta);

    // Update stats safely
    const stats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...(profile.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
      if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
        stats[key] = 0;
      }
    });

    stats.partiesPlayed += 1;
    if (params.isWinner) {
      stats.partiesWon += 1;
      if (params.mode === 'SOLO') {
        stats.soloGamesWon = (stats.soloGamesWon || 0) + 1;
      } else {
        stats.multiplayerGamesWon = (stats.multiplayerGamesWon || 0) + 1;
      }

      if (params.winType === 'KORA') {
        stats.koraCount += 1;
        if (params.mode === 'SOLO') {
          stats.soloKoraCount = (stats.soloKoraCount || 0) + 1;
        } else {
          stats.multiplayerKoraCount = (stats.multiplayerKoraCount || 0) + 1;
        }
      } else if (params.winType === 'DOUBLE_KORA') {
        stats.koraCount += 1;
        stats.doubleKoraCount += 1;
        if (params.mode === 'SOLO') {
          stats.soloKoraCount = (stats.soloKoraCount || 0) + 1;
          stats.soloDoubleKoraCount = (stats.soloDoubleKoraCount || 0) + 1;
        } else {
          stats.multiplayerKoraCount = (stats.multiplayerKoraCount || 0) + 1;
          stats.multiplayerDoubleKoraCount = (stats.multiplayerDoubleKoraCount || 0) + 1;
        }
      } else if (params.winType === 'UNDER_21') {
        stats.under21Count += 1;
      } else if (params.winType === 'THREE_SEVENS') {
        stats.threeSevensCount += 1;
      }
    }

    if (params.mode === 'SOLO') {
      stats.soloGamesPlayed = (stats.soloGamesPlayed || 0) + 1;
      const gain = params.isWinner ? params.potWon : 0;
      const loss = params.isWinner ? params.baseBet : Math.abs(params.netChipsDelta);
      stats.soloGains = (stats.soloGains || 0) + gain;
      stats.soloPertes = (stats.soloPertes || 0) + loss;
      stats.soloFortune = stats.soloGains - stats.soloPertes;
    } else {
      stats.multiplayerGamesPlayed = (stats.multiplayerGamesPlayed || 0) + 1;
      const gain = params.isWinner ? params.potWon : 0;
      const loss = params.isWinner ? params.baseBet : Math.abs(params.netChipsDelta);
      stats.multiplayerGains = (stats.multiplayerGains || 0) + gain;
      stats.multiplayerPertes = (stats.multiplayerPertes || 0) + loss;
      stats.fortune = stats.multiplayerGains - stats.multiplayerPertes;
    }

    // Calculer les ratios de victoire
    stats.soloWinRate = stats.soloGamesPlayed > 0 
      ? Math.round(((stats.soloGamesWon || 0) / stats.soloGamesPlayed) * 100) 
      : 0;
    stats.multiplayerWinRate = stats.multiplayerGamesPlayed > 0 
      ? Math.round(((stats.multiplayerGamesWon || 0) / stats.multiplayerGamesPlayed) * 100) 
      : 0;

    stats.gamesPlayed = (stats.soloGamesPlayed || 0) + (stats.multiplayerGamesPlayed || 0);
    stats.gamesWon = (stats.soloGamesWon || 0) + (stats.multiplayerGamesWon || 0);
    stats.gamesLost = Math.max(0, stats.gamesPlayed - stats.gamesWon);
    stats.winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

    if (params.isWinner && params.potWon > stats.biggestPotWon) {
      stats.biggestPotWon = params.potWon;
    }

    if (typeof params.tricksWon === 'number') {
      stats.totalTricksWon += params.tricksWon;
    }
    if (stats.partiesPlayed > 0) {
      stats.averageTricksPerGame = parseFloat((stats.totalTricksWon / stats.partiesPlayed).toFixed(1));
    }

    // Consolidated Score de Maîtrise (Barème 1-20 pts)
    stats.masteryScore = computeMasteryScore(stats);

    const { currentTitle } = computeHonorificTitle(stats);

    // Clean completion of a partie resets consecutive forfeits
    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };
    if (params.winType !== 'FORFEIT') {
      fairPlay.consecutiveForfeits = 0;
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      chips: newChips,
      stats,
      fairPlay,
      honorificTitleId: currentTitle.id,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(updatedProfile);

    // Invalidate local leaderboard cache to force fresh fetch on next open
    try {
      localStorage.removeItem('njambo_leaderboard_cache_v2');
    } catch {}

    // Firestore persistence for authenticated users (with offline queue tolerance - Lot 3 - B)
    if (!profile.isGuest && auth.currentUser) {
      const uid = auth.currentUser.uid;
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, updatedProfile, { merge: true });
      } catch (err) {
        console.warn('[PlayerProfileService] Firestore user profile sync failed, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${Date.now()}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: updatedProfile,
        });
      }

      try {
        const historyRef = doc(db, 'users', uid, 'history', partieId);
        await setDoc(historyRef, historyItem, { merge: true });
        // Trigger asynchronous flush of any previously queued offline operations
        this.flushOfflineSyncQueue().catch(() => {});
      } catch (histErr) {
        console.warn('[PlayerProfileService] Firestore partie history sync failed, enqueuing to offline sync queue:', histErr);
        this.enqueueOfflineSync({
          id: `history_${partieId}`,
          type: 'PARTIE',
          userId: uid,
          docPath: `users/${uid}/history/${partieId}`,
          payload: historyItem,
        });
      }
    }

    return updatedProfile;
  },

  /**
   * Records a completed or abandoned Manche into player history and updates aggregated stats.
   * If skipStatsIncrement is true or recordType is 'MANCHE', only history and fair-play state are updated,
   * preventing double-counting of games/wins already recorded by recordPartieResult.
   */
  async recordGame(
    item: Omit<PlayerGameHistoryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
    options?: { skipStatsIncrement?: boolean }
  ): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const history = this.getLocalHistory();

    const gameId = item.id || `game_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const historyItem: PlayerGameHistoryItem = {
      ...item,
      id: gameId,
      recordType: item.recordType || 'MANCHE',
      createdAt: item.createdAt || Date.now(),
    };

    // Deduplicate
    const updatedHistory = [historyItem, ...history.filter((h) => h.id !== gameId)].slice(0, 100);
    this.saveLocalHistory(updatedHistory);

    // Update stats safely
    const stats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...(profile.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
      if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
        stats[key] = 0;
      }
    });

    const shouldIncrementStats = !options?.skipStatsIncrement && item.recordType !== 'MANCHE';

    if (shouldIncrementStats) {
      stats.gamesPlayed += 1;
      if (item.isWinner) {
        stats.gamesWon += 1;
        if (item.winType === 'KORA') {
          stats.koraCount += 1;
        } else if (item.winType === 'DOUBLE_KORA') {
          stats.doubleKoraCount += 1;
        } else if (item.winType === 'UNDER_21') {
          stats.under21Count += 1;
        } else if (item.winType === 'THREE_SEVENS') {
          stats.threeSevensCount += 1;
        }
      }
      stats.gamesLost = Math.max(0, stats.gamesPlayed - stats.gamesWon);
      stats.winRate = Math.round((stats.gamesWon / Math.max(1, stats.gamesPlayed)) * 100);

      if (item.mode === 'SOLO') {
        stats.soloGamesPlayed += 1;
      } else {
        stats.multiplayerGamesPlayed += 1;
      }
    }

    // Record Manche stats
    if (item.recordType === 'MANCHE' || !item.recordType) {
      stats.manchesPlayed = (stats.manchesPlayed || 0) + 1;
      if (item.isWinner) {
        stats.manchesWon = (stats.manchesWon || 0) + 1;
        if (item.mode === 'MULTIPLAYER') {
          stats.multiplayerManchesWon = (stats.multiplayerManchesWon || 0) + 1;
        } else {
          stats.soloManchesWon = (stats.soloManchesWon || 0) + 1;
          const diff = (item.difficulty || '').toUpperCase();
          if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
            stats.soloManchesWonHard = (stats.soloManchesWonHard || 0) + 1;
          } else if (diff === 'EASY') {
            stats.soloManchesWonEasy = (stats.soloManchesWonEasy || 0) + 1;
          } else {
            stats.soloManchesWonNormal = (stats.soloManchesWonNormal || 0) + 1;
          }
        }
      }
    }

    if (item.isWinner && item.potWon > stats.biggestPotWon) {
      stats.biggestPotWon = item.potWon;
    }

    // Consolidated Score de Maîtrise (Barème 1-20 pts)
    stats.masteryScore = computeMasteryScore(stats);

    const { currentTitle } = computeHonorificTitle(stats);

    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };
    if (item.status === 'completed' && item.winType !== 'FORFEIT') {
      fairPlay.consecutiveForfeits = 0;
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      stats,
      fairPlay,
      honorificTitleId: currentTitle.id,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(updatedProfile);

    // Invalidate local leaderboard cache to force fresh fetch on next open
    try {
      localStorage.removeItem('njambo_leaderboard_cache_v2');
    } catch {}

    // If authenticated in Firestore, persist there asynchronously (with offline queue tolerance - Lot 3 - B)
    if (!profile.isGuest && auth.currentUser) {
      const uid = auth.currentUser.uid;
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, updatedProfile, { merge: true });
      } catch (err) {
        console.warn('[PlayerProfileService] Firestore game user profile sync failed, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${Date.now()}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: updatedProfile,
        });
      }

      try {
        const historyRef = doc(db, 'users', uid, 'history', gameId);
        await setDoc(historyRef, historyItem, { merge: true });
        this.flushOfflineSyncQueue().catch(() => {});
      } catch (histErr) {
        console.warn('[PlayerProfileService] Firestore game history sync failed, enqueuing to offline sync queue:', histErr);
        this.enqueueOfflineSync({
          id: `history_${gameId}`,
          type: 'GAME',
          userId: uid,
          docPath: `users/${uid}/history/${gameId}`,
          payload: historyItem,
        });
      }
    }

    return updatedProfile;
  },

  /**
   * Registers a forfeit, Fold Round, or prolonged disconnect and applies graduated fair-play sanctions.
   * Lot 3 - C: Détection des abandons & sanctions graduées.
   */
  async registerFairPlayIncident(params: {
    type: 'FORFEIT' | 'FOLD_ROUND' | 'PROLONGED_DISCONNECT';
    roomId?: string;
    gameId?: string;
  }): Promise<{ profile: PlayerProfile; sanction: FairPlaySanction | null; message: string }> {
    const profile = this.getLocalProfile();
    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };

    fairPlay.consecutiveForfeits += 1;
    if (params.type === 'FORFEIT') fairPlay.totalForfeits += 1;
    if (params.type === 'FOLD_ROUND') fairPlay.totalFoldRounds += 1;
    if (params.type === 'PROLONGED_DISCONNECT') fairPlay.prolongedDisconnects += 1;

    const totalGames = (profile.stats.gamesPlayed || 0) + 1;
    const totalIncidents = fairPlay.totalForfeits + fairPlay.prolongedDisconnects;
    fairPlay.disconnectRate = parseFloat((totalIncidents / Math.max(1, totalGames)).toFixed(2));

    const now = Date.now();
    let newSanction: FairPlaySanction | null = null;
    let message = '';

    // Graduated sanctions:
    // 1st: Friendly warning notification
    // 2nd: Formal WARNING
    // 3rd: RESTRICT_CREATE_ROOM (15 minutes)
    // 4th: RESTRICT_JOIN_PRIVATE (30 minutes)
    // 5th+ or disconnectRate >= 40%: TEMP_BAN (1 hour)
    if (fairPlay.consecutiveForfeits >= 5 || (totalGames >= 10 && fairPlay.disconnectRate >= 0.4)) {
      newSanction = {
        type: 'TEMP_BAN',
        reason: 'Abandons excessifs ou déconnexions prolongées répétées',
        issuedAt: now,
        expiresAt: now + 60 * 60 * 1000, // 1 heure
        active: true,
      };
      message = '🚫 Sanction Fair-Play : Suspension temporaire du multijoueur pendant 1 heure.';
    } else if (fairPlay.consecutiveForfeits === 4) {
      newSanction = {
        type: 'RESTRICT_JOIN_PRIVATE',
        reason: '4 abandons consécutifs',
        issuedAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes
        active: true,
      };
      message = '⚠️ Sanction Fair-Play : Restriction de rejoindre des tables privées pendant 30 minutes.';
    } else if (fairPlay.consecutiveForfeits === 3) {
      newSanction = {
        type: 'RESTRICT_CREATE_ROOM',
        reason: '3 abandons consécutifs',
        issuedAt: now,
        expiresAt: now + 15 * 60 * 1000, // 15 minutes
        active: true,
      };
      message = '⚠️ Sanction Fair-Play : Création de salon suspendue pendant 15 minutes.';
    } else if (fairPlay.consecutiveForfeits === 2) {
      newSanction = {
        type: 'WARNING',
        reason: '2 abandons consécutifs détectés',
        issuedAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000,
        active: true,
      };
      message = '⚠️ Avertissement Fair-Play : 2 abandons consécutifs. Le prochain entraînera une suspension de création de salon (15 min).';
    } else {
      message = 'ℹ️ Rappel Fair-Play : Quitter une partie pénalise les autres joueurs et affecte votre réputation.';
    }

    if (newSanction) {
      fairPlay.activeSanction = newSanction;
      fairPlay.sanctionsHistory = [newSanction, ...(fairPlay.sanctionsHistory || [])].slice(0, 20);
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      fairPlay,
      updatedAt: now,
    };

    this.saveLocalProfile(updatedProfile);

    // Sync to Firestore & log to Katika fair-play audit (with offline queue tolerance - Lot 3 - B)
    if (!profile.isGuest && auth.currentUser) {
      const uid = auth.currentUser.uid;
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, updatedProfile, { merge: true });

        if (newSanction) {
          const sanctionRef = doc(db, 'fairplay_sanctions', `sanction_${uid}_${now}`);
          await setDoc(sanctionRef, {
            id: `sanction_${uid}_${now}`,
            userId: uid,
            userName: profile.displayName,
            sanction: newSanction,
            incidentType: params.type,
            roomId: params.roomId || null,
            createdAt: now,
          });
        }
      } catch (err) {
        console.warn('[PlayerProfileService] Fair play sync warning, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${now}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: updatedProfile,
        });
        if (newSanction) {
          this.enqueueOfflineSync({
            id: `sanction_${uid}_${now}`,
            type: 'SANCTION',
            userId: uid,
            docPath: `fairplay_sanctions/sanction_${uid}_${now}`,
            payload: {
              id: `sanction_${uid}_${now}`,
              userId: uid,
              userName: profile.displayName,
              sanction: newSanction,
              incidentType: params.type,
              roomId: params.roomId || null,
              createdAt: now,
            },
          });
        }
      }
    }

    return { profile: updatedProfile, sanction: newSanction, message };
  },

  /**
   * Checks if the player currently has an active, unexpired sanction.
   */
  getActiveSanction(profile?: PlayerProfile): FairPlaySanction | null {
    const p = profile || this.getLocalProfile();
    const sanction = p.fairPlay?.activeSanction;
    if (!sanction || typeof sanction !== 'object' || !sanction.active) return null;
    if (sanction.expiresAt && Date.now() > sanction.expiresAt) {
      // Expired!
      try {
        sanction.active = false;
        if (p.fairPlay) p.fairPlay.activeSanction = null;
        this.saveLocalProfile(p);
      } catch (e) {
        console.error('Error auto-expiring sanction:', e);
      }
      return null;
    }
    return sanction;
  },

  /**
   * Real-time consolidation of player stats from Firestore /users/{uid} and /users/{uid}/history.
   * Caches result locally for offline tolerance and resilience (Lot 3 - B).
   */
  async fetchConsolidatedStats(userId: string): Promise<{
    stats: PlayerStats;
    history: PlayerGameHistoryItem[];
    chips: number;
  } | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;

      const profileData = snap.data() as PlayerProfile;
      const histQuery = query(
        collection(db, 'users', userId, 'history'),
        orderBy('createdAt', 'desc'),
        limit(15)
      );
      const histSnap = await getDocs(histQuery);
      const historyItems: PlayerGameHistoryItem[] = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);

      // Consolidate real-time stats from the 15 game records
      const consolidatedStats: PlayerStats = {
        ...DEFAULT_PLAYER_STATS,
        ...(profileData.stats || {}),
      };

      const parties = historyItems.filter((h) => h.recordType === 'PARTIE');
      const manches = historyItems.filter((h) => h.recordType === 'MANCHE' || !h.recordType);

      consolidatedStats.partiesPlayed = parties.length > 0 ? parties.length : consolidatedStats.partiesPlayed;
      consolidatedStats.partiesWon = parties.filter((p) => p.isWinner).length;
      consolidatedStats.soloGamesWon = parties.filter((p) => p.isWinner && p.mode === 'SOLO').length;
      consolidatedStats.multiplayerGamesWon = parties.filter((p) => p.isWinner && p.mode === 'MULTIPLAYER').length;

      // Extract details from history if available
      const soloParties = parties.filter((p) => p.mode === 'SOLO');
      const multiParties = parties.filter((p) => p.mode === 'MULTIPLAYER');

      consolidatedStats.soloGamesPlayed = soloParties.length;
      consolidatedStats.multiplayerGamesPlayed = multiParties.length;

      consolidatedStats.soloKoraCount = soloParties.filter((p) => p.winType === 'KORA' || p.winType === 'DOUBLE_KORA').length;
      consolidatedStats.multiplayerKoraCount = multiParties.filter((p) => p.winType === 'KORA' || p.winType === 'DOUBLE_KORA').length;
      consolidatedStats.soloDoubleKoraCount = soloParties.filter((p) => p.winType === 'DOUBLE_KORA').length;
      consolidatedStats.multiplayerDoubleKoraCount = multiParties.filter((p) => p.winType === 'DOUBLE_KORA').length;

      let soloGains = 0;
      let soloPertes = 0;
      soloParties.forEach((p) => {
        const gain = p.isWinner ? (p.potWon || 0) : 0;
        const loss = p.isWinner ? (p.baseBet || 0) : Math.abs(p.netChipsDelta || 0);
        soloGains += gain;
        soloPertes += loss;
      });
      consolidatedStats.soloGains = soloGains;
      consolidatedStats.soloPertes = soloPertes;
      consolidatedStats.soloFortune = soloGains - soloPertes;

      let multiGains = 0;
      let multiPertes = 0;
      multiParties.forEach((p) => {
        const gain = p.isWinner ? (p.potWon || 0) : 0;
        const loss = p.isWinner ? (p.baseBet || 0) : Math.abs(p.netChipsDelta || 0);
        multiGains += gain;
        multiPertes += loss;
      });
      consolidatedStats.multiplayerGains = multiGains;
      consolidatedStats.multiplayerPertes = multiPertes;
      consolidatedStats.fortune = multiGains - multiPertes;

      consolidatedStats.gamesPlayed = manches.length > 0 ? manches.length : consolidatedStats.gamesPlayed;
      consolidatedStats.gamesWon = manches.filter((m) => m.isWinner).length;
      consolidatedStats.gamesLost = Math.max(0, consolidatedStats.gamesPlayed - consolidatedStats.gamesWon);
      consolidatedStats.winRate =
        consolidatedStats.gamesPlayed > 0
          ? Math.round((consolidatedStats.gamesWon / consolidatedStats.gamesPlayed) * 100)
          : 0;

      // Apply fallback rule for older users who have victories but no detail set
      const finalConsolidatedStats = applyStatsFallback(consolidatedStats);

      // Reconcile chips: protect against browser cache wipe by prioritizing cloud balance
      const localProfile = this.getLocalProfile();
      const serverChips = typeof profileData.chips === 'number' && !isNaN(profileData.chips) ? profileData.chips : 1000;
      const localChips = typeof localProfile.chips === 'number' && !isNaN(localProfile.chips) ? localProfile.chips : 1000;
      const resolvedChips = Math.max(serverChips, localChips);

      // Update local cache
      if (historyItems.length > 0) {
        this.saveLocalHistory(historyItems);
      }
      const updatedProfile: PlayerProfile = {
        ...profileData,
        chips: resolvedChips,
        stats: finalConsolidatedStats,
      };
      this.saveLocalProfile(updatedProfile);

      // Save consolidated stats back to Firestore for authenticated users to ensure permanent server-side correctness
      if (profileData.isGuest === false) {
        try {
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { chips: resolvedChips, stats: finalConsolidatedStats, updatedAt: Date.now() }, { merge: true });
          console.log('[PlayerProfileService] Successfully consolidated and synced stats & chips to Firestore in background.');
          await this.flushOfflineSyncQueue();
        } catch (err) {
          console.warn('[PlayerProfileService] Failed syncing consolidated stats to Firestore:', err);
        }
      }

      return {
        stats: finalConsolidatedStats,
        history: historyItems,
        chips: resolvedChips,
      };
    } catch (e) {
      console.warn('[PlayerProfileService] Offline / error fetching consolidated stats:', e);
      return null;
    }
  },

  /**
   * Merges guest data into a Google account seamlessly without data loss.
   */
  async loginWithGoogle(): Promise<{ profile: PlayerProfile; history: PlayerGameHistoryItem[] }> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    const user: User = credential.user;

    const guestProfile = this.getLocalProfile();
    const guestHistory = this.getLocalHistory();

    // Make local emergency backup of guest data
    try {
      localStorage.setItem(
        GUEST_BACKUP_KEY,
        JSON.stringify({ profile: guestProfile, history: guestHistory, backedUpAt: Date.now() })
      );
    } catch (e) {
      console.warn('Backup error:', e);
    }

    // Try fetching existing cloud profile
    let cloudProfile: PlayerProfile | null = null;
    let cloudHistory: PlayerGameHistoryItem[] = [];

    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        cloudProfile = snap.data() as PlayerProfile;
      }

      const histQuery = query(
        collection(db, 'users', user.uid, 'history'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const histSnap = await getDocs(histQuery);
      cloudHistory = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);
    } catch (err) {
      console.warn('[PlayerProfileService] Could not fetch remote profile:', err);
    }

    // Deduplicate and merge history (cloud + guest)
    const historyMap = new Map<string, PlayerGameHistoryItem>();
    cloudHistory.forEach((item) => historyMap.set(item.id, item));
    guestHistory.forEach((item) => {
      if (!historyMap.has(item.id)) {
        historyMap.set(item.id, item);
      }
    });

    const mergedHistory = Array.from(historyMap.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);

    // Merge statistics non-destructively
    const cloudStats = cloudProfile?.stats || { ...DEFAULT_PLAYER_STATS };
    const guestStats = guestProfile.isGuest ? guestProfile.stats : { ...DEFAULT_PLAYER_STATS };

    const partiesCount = Math.max(
      mergedHistory.filter((h) => h.recordType === 'PARTIE').length,
      (cloudStats.partiesPlayed || 0) + (guestStats.partiesPlayed || 0)
    );
    const partiesWonCount = Math.max(
      mergedHistory.filter((h) => h.recordType === 'PARTIE' && h.isWinner).length,
      (cloudStats.partiesWon || 0) + (guestStats.partiesWon || 0)
    );
    const gamesPlayedCount = Math.max(
      mergedHistory.filter((h) => h.recordType === 'MANCHE' || !h.recordType).length,
      (cloudStats.gamesPlayed || 0) + (guestStats.gamesPlayed || 0)
    );
    const gamesWonCount = Math.max(
      mergedHistory.filter((h) => (h.recordType === 'MANCHE' || !h.recordType) && h.isWinner).length,
      (cloudStats.gamesWon || 0) + (guestStats.gamesWon || 0)
    );
    const gamesLostCount = Math.max(0, gamesPlayedCount - gamesWonCount);
    const winRate = gamesPlayedCount > 0 ? Math.round((gamesWonCount / gamesPlayedCount) * 100) : 0;
    const totalTricks = (cloudStats.totalTricksWon || 0) + (guestStats.totalTricksWon || 0);

    const mergedStats: PlayerStats = {
      gamesPlayed: gamesPlayedCount,
      gamesWon: gamesWonCount,
      gamesLost: gamesLostCount,
      winRate,
      partiesPlayed: partiesCount,
      partiesWon: partiesWonCount,
      manchesWon: (cloudStats.manchesWon || 0) + (guestStats.manchesWon || 0),
      soloManchesWon: (cloudStats.soloManchesWon || 0) + (guestStats.soloManchesWon || 0),
      multiplayerManchesWon: (cloudStats.multiplayerManchesWon || 0) + (guestStats.multiplayerManchesWon || 0),
      soloManchesWonHard: (cloudStats.soloManchesWonHard || 0) + (guestStats.soloManchesWonHard || 0),
      soloManchesWonNormal: (cloudStats.soloManchesWonNormal || 0) + (guestStats.soloManchesWonNormal || 0),
      soloManchesWonEasy: (cloudStats.soloManchesWonEasy || 0) + (guestStats.soloManchesWonEasy || 0),
      koraCount: (cloudStats.koraCount || 0) + (guestStats.koraCount || 0),
      doubleKoraCount: (cloudStats.doubleKoraCount || 0) + (guestStats.doubleKoraCount || 0),
      under21Count: (cloudStats.under21Count || 0) + (guestStats.under21Count || 0),
      threeSevensCount: (cloudStats.threeSevensCount || 0) + (guestStats.threeSevensCount || 0),
      biggestPotWon: Math.max(cloudStats.biggestPotWon || 0, guestStats.biggestPotWon || 0),
      totalTricksWon: totalTricks,
      averageTricksPerGame: partiesCount > 0 ? parseFloat((totalTricks / partiesCount).toFixed(1)) : 0,
      soloGamesPlayed: (cloudStats.soloGamesPlayed || 0) + (guestStats.soloGamesPlayed || 0),
      multiplayerGamesPlayed: (cloudStats.multiplayerGamesPlayed || 0) + (guestStats.multiplayerGamesPlayed || 0),
      soloGamesWon: (cloudStats.soloGamesWon || 0) + (guestStats.soloGamesWon || 0),
      multiplayerGamesWon: (cloudStats.multiplayerGamesWon || 0) + (guestStats.multiplayerGamesWon || 0),
      forfeitCount: (cloudStats.forfeitCount || 0) + (guestStats.forfeitCount || 0),
      foldCount: (cloudStats.foldCount || 0) + (guestStats.foldCount || 0),
      fortune: (cloudStats.fortune || 0) + (guestStats.fortune || 0),
      multiplayerGains: (cloudStats.multiplayerGains || 0) + (guestStats.multiplayerGains || 0),
      multiplayerPertes: (cloudStats.multiplayerPertes || 0) + (guestStats.multiplayerPertes || 0),
      soloKoraCount: (cloudStats.soloKoraCount || 0) + (guestStats.soloKoraCount || 0),
      multiplayerKoraCount: (cloudStats.multiplayerKoraCount || 0) + (guestStats.multiplayerKoraCount || 0),
      soloDoubleKoraCount: (cloudStats.soloDoubleKoraCount || 0) + (guestStats.soloDoubleKoraCount || 0),
      multiplayerDoubleKoraCount: (cloudStats.multiplayerDoubleKoraCount || 0) + (guestStats.multiplayerDoubleKoraCount || 0),
      soloGains: (cloudStats.soloGains || 0) + (guestStats.soloGains || 0),
      soloPertes: (cloudStats.soloPertes || 0) + (guestStats.soloPertes || 0),
      soloFortune: (cloudStats.soloFortune || 0) + (guestStats.soloFortune || 0),
      soloWinRate: 0,
      multiplayerWinRate: 0,
    };

    // Non-destructive chips fusion: preserve earned chips (highest balance or additive delta)
    const cloudChips = typeof cloudProfile?.chips === 'number' && !isNaN(cloudProfile.chips) ? cloudProfile.chips : 1000;
    const guestChips = typeof guestProfile?.chips === 'number' && !isNaN(guestProfile.chips) ? guestProfile.chips : 1000;
    const mergedChips = Math.max(cloudChips, guestChips);

    // Fair play fusion
    const mergedFairPlay: PlayerFairPlay = {
      consecutiveForfeits: 0,
      totalForfeits: (cloudProfile?.fairPlay?.totalForfeits || 0) + (guestProfile?.fairPlay?.totalForfeits || 0),
      totalFoldRounds: (cloudProfile?.fairPlay?.totalFoldRounds || 0) + (guestProfile?.fairPlay?.totalFoldRounds || 0),
      prolongedDisconnects: (cloudProfile?.fairPlay?.prolongedDisconnects || 0) + (guestProfile?.fairPlay?.prolongedDisconnects || 0),
      totalGamesStarted: (cloudProfile?.fairPlay?.totalGamesStarted || 0) + (guestProfile?.fairPlay?.totalGamesStarted || 0),
      disconnectRate: 0,
      activeSanction: cloudProfile?.fairPlay?.activeSanction || null,
      sanctionsHistory: [...(cloudProfile?.fairPlay?.sanctionsHistory || []), ...(guestProfile?.fairPlay?.sanctionsHistory || [])].slice(0, 20),
    };
    mergedFairPlay.disconnectRate = parseFloat(
      ((mergedFairPlay.totalForfeits + mergedFairPlay.prolongedDisconnects) / Math.max(1, gamesPlayedCount + 1)).toFixed(2)
    );

    const finalMergedStats = applyStatsFallback(mergedStats);
    finalMergedStats.masteryScore = computeMasteryScore(finalMergedStats);
    const { currentTitle } = computeHonorificTitle(finalMergedStats);

    // Resolve display name: keep existing custom name if meaningful, else Google name
    let chosenName = cloudProfile?.displayName || guestProfile.displayName;
    if (chosenName.startsWith('Joueur ') && user.displayName) {
      chosenName = user.displayName;
    }
    chosenName = sanitizeDisplayName(chosenName);

    const mergedProfile: PlayerProfile = {
      uid: user.uid,
      displayName: chosenName,
      email: user.email || null,
      photoURL: user.photoURL || null,
      avatarId: cloudProfile?.avatarId || (user.photoURL ? 'google' : guestProfile.avatarId),
      isGuest: false,
      chips: mergedChips,
      stats: finalMergedStats,
      fairPlay: mergedFairPlay,
      honorificTitleId: currentTitle.id,
      createdAt: cloudProfile?.createdAt || guestProfile.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Save locally
    this.saveLocalProfile(mergedProfile);
    this.saveLocalHistory(mergedHistory);

    // Sync to Firestore
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, mergedProfile, { merge: true });

      // Write merged history items to subcollection
      for (const item of mergedHistory.slice(0, 30)) {
        const itemRef = doc(db, 'users', user.uid, 'history', item.id);
        await setDoc(itemRef, item, { merge: true });
      }
    } catch (err) {
      console.warn('[PlayerProfileService] Error saving merged profile to Firestore:', err);
    }

    return { profile: mergedProfile, history: mergedHistory };
  },

  /**
   * Signs out to guest mode while preserving local history and stats safely.
   */
  async logout(): Promise<PlayerProfile> {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Logout error:', e);
    }

    const current = this.getLocalProfile();
    const guestProfile: PlayerProfile = {
      ...current,
      uid: generateGuestId(),
      email: null,
      photoURL: null,
      avatarId: current.avatarId === 'google' ? 'lion' : current.avatarId,
      isGuest: true,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(guestProfile);
    return guestProfile;
  },

  /**
   * Updates player's display name.
   */
  async updateDisplayName(newName: string): Promise<PlayerProfile> {
    const sanitized = sanitizeDisplayName(newName);
    const profile = this.getLocalProfile();
    const updated: PlayerProfile = {
      ...profile,
      displayName: sanitized,
      updatedAt: Date.now(),
    };
    this.saveLocalProfile(updated);

    if (!updated.isGuest && auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userRef, { displayName: sanitized, updatedAt: Date.now() }, { merge: true });
      } catch (err) {
        console.warn('Firestore update name error:', err);
      }
    }

    return updated;
  },

  /**
   * Updates avatar choice.
   */
  async updateAvatar(avatarId: AvatarOptionId): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const updated: PlayerProfile = {
      ...profile,
      avatarId,
      updatedAt: Date.now(),
    };
    this.saveLocalProfile(updated);

    if (!updated.isGuest && auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userRef, { avatarId, updatedAt: Date.now() }, { merge: true });
      } catch (err) {
        console.warn('Firestore update avatar error:', err);
      }
    }

    return updated;
  },
};

export const PlayerProfileService = playerProfileService;
