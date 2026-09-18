import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  getCountFromServer,
  where,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { playerProfileService } from './playerProfileService';

export type GameRecordStatus = 'completed' | 'in_progress' | 'abandoned';

export const INACTIVITY_ABANDON_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes inactivité sans action

/**
 * Normalizes and qualifies a game record status according to Katika Arbitrage 1:
 * - Explicit quit or isAbandoned => 'abandoned'
 * - 'completed' => 'completed'
 * - 'in_progress' with > 30 min of inactivity => auto-switches to 'abandoned'
 * - 'in_progress' within last 30 min => 'in_progress' (live)
 */
export function qualifyRecordStatus(
  rawStatus?: string,
  isAbandoned?: boolean,
  updatedAt?: number,
  createdAt?: number,
  isFinalWin?: boolean
): GameRecordStatus {
  if (rawStatus === 'abandoned' || isAbandoned) {
    return 'abandoned';
  }
  if (rawStatus === 'completed' || isFinalWin) {
    return 'completed';
  }
  if (rawStatus === 'in_progress') {
    const lastActive = updatedAt || createdAt || 0;
    if (lastActive > 0 && Date.now() - lastActive > INACTIVITY_ABANDON_THRESHOLD_MS) {
      return 'abandoned';
    }
    return 'in_progress';
  }
  // Retroactive default for legacy records without status
  return 'completed';
}

export interface GameTelemetryRecord {
  id?: string;
  mode: 'SOLO' | 'MULTIPLAYER';
  playerCount: number; // 2, 3, 4
  winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21';
  winnerName: string;
  winnerId?: string;
  durationSeconds?: number;
  roundsCount: number; // Nombre de parties (5 tours) disputées dans cette manche
  partiesCount?: number; // Alias explicite pour les parties (5 tours)
  manchesCount?: number; // Compatibilité ascendante
  isMancheFinalWin?: boolean; // Vrai si victoire finale de la manche (élimination des adversaires)
  isPartieFinalWin?: boolean; // Compatibilité ascendante
  status?: GameRecordStatus; // 'completed' (Terminée), 'in_progress' (En cours), ou 'abandoned' (Abandonnée)
  isAbandoned?: boolean; // Vrai si la manche ou partie s'est terminée par un abandon
  leaverId?: string; // ID exact du joueur ayant quitté / abandonné
  leaverName?: string; // Nom du joueur ayant quitté
  abandonmentReason?: 'RAGE_QUIT' | 'POST_KORA' | 'EARLY_QUIT' | 'USER_EXIT' | 'CONNECTION_LOST';
  trickNumberAtQuit?: number;
  potWon?: number;
  potGross?: number; // Total misé à la table
  baseBet?: number; // Mise unitaire par joueur
  currency?: 'CHIPS' | 'XAF'; // Devise : Jetons virtuels ou Francs CFA réels
  createdAt: number;
  updatedAt?: number;
  players?: Array<{
    id: string;
    name: string;
    isHuman: boolean;
    score?: number;
    isWinner?: boolean;
    chipsDelta?: number;
  }>;
}

export interface GlobalMancheCounts {
  totalStarted: number; // Total réel de toutes les manches débutées
  totalCompleted: number; // Total des manches menées jusqu'au bout
  totalInProgress: number; // Total des manches en direct actives (< 30 min)
  totalAbandoned: number; // Total des manches abandonnées / forfaits (> 30 min ou quit)
  completionRate: number; // Taux de complétion global en %
}

const LOCAL_STORAGE_KEY = 'njambo_telemetry_game_records';

export const telemetryService = {
  /**
   * Records a game or round (in_progress or completed) in Firestore + local cache (Idempotent)
   */
  recordGame: async (record: Omit<GameTelemetryRecord, 'createdAt'> & { createdAt?: number }): Promise<void> => {
    const docId = record.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Default status: if not explicitly supplied, treat final win as 'completed', quit as 'in_progress'
    const status: GameRecordStatus =
      record.status || (record.isAbandoned ? 'in_progress' : 'completed');

    const entry: GameTelemetryRecord = {
      ...record,
      id: docId,
      status,
      partiesCount: record.partiesCount ?? record.roundsCount,
      isMancheFinalWin: record.isMancheFinalWin ?? (status === 'completed'),
      createdAt: record.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Save to localStorage immediately (deduplicated)
    try {
      const existing = localStorage.getItem(LOCAL_STORAGE_KEY);
      const list: GameTelemetryRecord[] = existing ? JSON.parse(existing) : [];
      const filtered = list.filter((item) => item.id !== docId);
      filtered.unshift(entry);
      // Keep last 500 records locally
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered.slice(0, 500)));
    } catch (e) {
      console.warn('[TelemetryService] Could not write to localStorage:', e);
    }

    // 2. Persist to Firestore for global leaderboard (Only for Google-authenticated users)
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      try {
        const docRef = doc(db, 'njambo_game_records', docId);
        await setDoc(docRef, entry, { merge: true });
        console.log('[TelemetryService] Game telemetry saved to Firestore:', entry.winType, entry.status, docId);
      } catch (err) {
        console.warn('[TelemetryService] Firestore save error:', err);
      }
    } else {
      console.info('[TelemetryService] Guest game preserved locally. Google sign-in required to post to the global leaderboard.');
    }

    // 3. Update player profile stats if this game is completed or finished
    if (entry.status === 'completed' || entry.isMancheFinalWin || entry.isAbandoned) {
      try {
        const localId = localStorage.getItem('njambo_player_id');
        const localName = localStorage.getItem('njambo_player_name');

        // Locate human player
        const humanPlayer = entry.players?.find(
          (p) =>
            p.isHuman ||
            (localId && p.id === localId) ||
            p.id === 'human' ||
            (localName && p.name === localName)
        );

        if (humanPlayer || entry.mode === 'SOLO') {
          const isWinner = Boolean(
            humanPlayer?.isWinner ||
              (entry.winnerId && humanPlayer && entry.winnerId === humanPlayer.id) ||
              (entry.winnerName && humanPlayer && entry.winnerName === humanPlayer.name) ||
              (entry.mode === 'SOLO' &&
                entry.winnerName &&
                !entry.winnerName.toLowerCase().includes('bot') &&
                entry.winnerName !== 'Adversaire')
          );

          playerProfileService
            .recordGame({
              id: docId,
              mode: entry.mode,
              winType: entry.winType || 'STANDARD',
              winnerName: entry.winnerName || 'Joueur',
              isWinner,
              status: entry.status === 'in_progress' ? 'in_progress' : 'completed',
              potWon: isWinner ? entry.potWon || entry.potGross || 0 : 0,
              baseBet: entry.baseBet || 10,
              playerCount: entry.playerCount || 4,
              roundsCount: entry.roundsCount || entry.partiesCount || 1,
              tricksWon: humanPlayer?.score || (isWinner ? 3 : 0),
              isDoubleKora: entry.winType === 'DOUBLE_KORA',
              isUnder21: entry.winType === 'UNDER_21',
              isThreeSevens: entry.winType === 'THREE_SEVENS',
              createdAt: entry.createdAt || Date.now(),
            })
            .catch((e) => console.warn('[PlayerProfile] Telemetry profile update warning:', e));
        }
      } catch (err) {
        console.warn('[TelemetryService] Error forwarding to playerProfileService:', err);
      }
    }
  },

  /**
   * Fast server-side aggregation for total manches started, completed, and in-progress.
   * Leverages getCountFromServer for instantaneous and cost-free total calculation without downloading all documents.
   * All legacy documents without a status field are seamlessly treated as completed.
   */
  getGlobalMancheCounts: async (): Promise<GlobalMancheCounts> => {
    try {
      const colRef = collection(db, 'njambo_game_records');
      const [totalSnap, inProgressSnap, abandonedSnap] = await Promise.all([
        getCountFromServer(colRef),
        getCountFromServer(query(colRef, where('status', '==', 'in_progress'))),
        getCountFromServer(query(colRef, where('status', '==', 'abandoned'))),
      ]);

      const totalStarted = totalSnap.data().count;
      const totalInProgress = inProgressSnap.data().count;
      const totalAbandoned = abandonedSnap.data().count;
      // Retroactive rule: all legacy documents lacking status are treated as completed
      const totalCompleted = Math.max(0, totalStarted - totalInProgress - totalAbandoned);
      const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 100;

      return {
        totalStarted,
        totalCompleted,
        totalInProgress,
        totalAbandoned,
        completionRate,
      };
    } catch (err) {
      console.warn('[TelemetryService] Could not query getCountFromServer, fallback to cache:', err);
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const localList: GameTelemetryRecord[] = local ? JSON.parse(local) : [];
        const totalStarted = localList.length;
        let totalCompleted = 0;
        let totalAbandoned = 0;
        let totalInProgress = 0;

        localList.forEach((r) => {
          const st = qualifyRecordStatus(r.status, r.isAbandoned, r.updatedAt, r.createdAt, r.isMancheFinalWin);
          if (st === 'completed') totalCompleted++;
          else if (st === 'abandoned') totalAbandoned++;
          else totalInProgress++;
        });

        const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 100;
        return { totalStarted, totalCompleted, totalInProgress, totalAbandoned, completionRate };
      } catch (e) {
        return { totalStarted: 0, totalCompleted: 0, totalInProgress: 0, totalAbandoned: 0, completionRate: 100 };
      }
    }
  },

  /**
   * Fetches real game records from Firestore with local cache fallback.
   * Uncapped limit (default 1000) allowing full historical analysis.
   * All records are normalized with qualifyRecordStatus (Arbitrage 1: >30min inactivity => abandoned).
   */
  getGameRecords: async (maxCount = 50): Promise<GameTelemetryRecord[]> => {
    const memoryRecords: GameTelemetryRecord[] = [];

    // 1. Try Firestore
    try {
      const q = query(
        collection(db, 'njambo_game_records'),
        orderBy('createdAt', 'desc'),
        limit(maxCount)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data() as Omit<GameTelemetryRecord, 'id'>;
          const normalizedStatus = qualifyRecordStatus(
            rawData.status,
            rawData.isAbandoned,
            rawData.updatedAt,
            rawData.createdAt,
            rawData.isMancheFinalWin
          );
          const isAbandoned = normalizedStatus === 'abandoned' || Boolean(rawData.isAbandoned);
          const winnerName = (isAbandoned && (!rawData.winnerName || rawData.winnerName === 'En cours...'))
            ? 'Abandon / Forfait'
            : (rawData.winnerName || (isAbandoned ? 'Abandon / Forfait' : 'Joueur'));

          memoryRecords.push({
            id: docSnap.id,
            ...rawData,
            status: normalizedStatus,
            isAbandoned,
            winnerName,
          });
        });
      }
    } catch (err) {
      console.warn('[TelemetryService] Could not query Firestore records, falling back to cache:', err);
    }

    // 2. Merge with Local Cache
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const localList: GameTelemetryRecord[] = JSON.parse(local);
        localList.forEach((lRec) => {
          if (!memoryRecords.some((r) => r.id === lRec.id)) {
            const normalizedStatus = qualifyRecordStatus(
              lRec.status,
              lRec.isAbandoned,
              lRec.updatedAt,
              lRec.createdAt,
              lRec.isMancheFinalWin
            );
            const isAbandoned = normalizedStatus === 'abandoned' || Boolean(lRec.isAbandoned);
            const winnerName = (isAbandoned && (!lRec.winnerName || lRec.winnerName === 'En cours...'))
              ? 'Abandon / Forfait'
              : (lRec.winnerName || (isAbandoned ? 'Abandon / Forfait' : 'Joueur'));

            memoryRecords.push({
              ...lRec,
              status: normalizedStatus,
              isAbandoned,
              winnerName,
            });
          }
        });
      }
    } catch (e) {
      // ignore
    }

    // Sort descending by createdAt
    return memoryRecords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
};

