export interface KatikaEngineConfig {
  turnTimerSeconds: number;
  reconnectGracePeriodSeconds: number;
  reconnectTimeoutSeconds?: number;
  lobbyDisconnectGraceSeconds?: number;
  hostLobbyGraceSeconds?: number;
  guestLobbyGraceSeconds?: number;
  koraMultiplier: number;
  doubleKoraMultiplier: number;
  threeSevensMultiplier: number;
  under21BonusPoints: number;
  isMaintenanceMode: boolean;
  bettingEconomyEnabled: boolean;
  maintenanceNotice: string;
  versionPolicy: 'PERMISSIVE' | 'MODERATE' | 'STRICT';
  transitionDelayMs: number;
  botThinkTimeMs: number;
  trickResolutionTimeMs: number;
  instantWinAnimationTimeMs: number;
  foldForfeitDelayMs?: number;
  defaultTableMaxPlayers?: 2 | 4;
  defaultFillWithBots?: boolean;
  allowJoinInProgress?: boolean;
  allowNewRooms?: boolean;
  minTableBet?: number;
  defaultInitialCapital?: number;
  hokutoSpawnRatePct: number;
  globalRakePct: number;
  allowAutoAdvance: boolean;
  emptyRoomTimeoutMinutes?: number;
  enableAutoBetEscalation?: boolean;
  autoBetEscalationInterval?: number;
  autoBetEscalationRatePct?: number;
  maxAutoBetMultiplier?: number;
}

export const DEFAULT_ENGINE_CONFIG: KatikaEngineConfig = {
  emptyRoomTimeoutMinutes: 5,
  turnTimerSeconds: 15,
  reconnectGracePeriodSeconds: 180,
  reconnectTimeoutSeconds: 180,
  lobbyDisconnectGraceSeconds: 180,
  hostLobbyGraceSeconds: 180,
  guestLobbyGraceSeconds: 60,
  koraMultiplier: 2,
  doubleKoraMultiplier: 4,
  threeSevensMultiplier: 3,
  under21BonusPoints: 10,
  isMaintenanceMode: false,
  bettingEconomyEnabled: false,
  maintenanceNotice: 'Serveur de jeu en maintenance administrative.',
  versionPolicy: 'MODERATE',
  transitionDelayMs: 18000,
  botThinkTimeMs: 800,
  trickResolutionTimeMs: 1600,
  instantWinAnimationTimeMs: 3500,
  foldForfeitDelayMs: 2000,
  defaultTableMaxPlayers: 2,
  defaultFillWithBots: false,
  allowJoinInProgress: true,
  allowNewRooms: true,
  minTableBet: 10,
  defaultInitialCapital: 100,
  hokutoSpawnRatePct: 75,
  globalRakePct: 0,
  allowAutoAdvance: false,
  enableAutoBetEscalation: true,
  autoBetEscalationInterval: 5,
  autoBetEscalationRatePct: 50,
  maxAutoBetMultiplier: 4,
};

let activeEngineConfig: KatikaEngineConfig = { ...DEFAULT_ENGINE_CONFIG };

export function getEngineConfig(): KatikaEngineConfig {
  return { ...activeEngineConfig };
}

export function updateEngineConfig(patch: Partial<KatikaEngineConfig>): KatikaEngineConfig {
  activeEngineConfig = { ...activeEngineConfig, ...patch };
  return { ...activeEngineConfig };
}
