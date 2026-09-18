import express from 'express';
import http from 'http';
import path from 'path';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager } from './server/rooms/roomManager';
import { handleAdminChatMessage, streamAdminChatMessage } from './server/aiAdminChat';
import { pushService } from './server/pushService';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { db } from './src/lib/firebase';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);

  // Initialize Room Cleanup Interval (2h public / 24h private / 15m bots)
  RoomManager.initRoomCleanupInterval();
  RoomManager.initFirestoreSync();

  // WebSocket Server Setup
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      console.error('[WS] Upgrade error:', e);
    }
  });

  // Native Transport-Level Keep-Alive Heartbeat (RFC 6455 ws.ping/pong)
  // Keeps sockets active across Cloud Run ingress and 4G/5G mobile operators without killing sleeping clients
  const wsHeartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as any;
      if (ws.isAlive === false) {
        console.log(`[WS Heartbeat] Terminating inactive socket without pong response`);
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (err) {
        // ignore socket errors during ping
      }
    });
  }, 20000);

  wss.on('close', () => {
    clearInterval(wsHeartbeatInterval);
  });

  wss.on('connection', (ws: any, req) => {
    // Initial alive state
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Parse reconnect token, playerId, and sessionId from URL query if provided
    let reconnectToken: string | undefined;
    let requestedPlayerId: string | undefined;
    let sessionId: string | undefined;
    try {
      if (req.url) {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        reconnectToken = url.searchParams.get('token') || undefined;
        requestedPlayerId = url.searchParams.get('playerId') || undefined;
        sessionId = url.searchParams.get('sessionId') || undefined;
      }
    } catch (e) {
      // ignore
    }

    const client = RoomManager.registerClient(ws, reconnectToken, requestedPlayerId, sessionId);
    console.log(`[WS] Client connected: ${client.playerId} (token: ${client.reconnectToken.slice(0, 8)}...)`);

    ws.on('message', (data: any) => {
      ws.isAlive = true;
      RoomManager.handleMessage(client, data.toString());
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${client.playerId}`);
      RoomManager.handleDisconnect(client.playerId, ws);
    });

    ws.on('error', (err: any) => {
      console.error(`[WS] Client error: ${client.playerId}`, err);
    });
  });

  // REST API Routes
  // Version metadata endpoint with strict no-cache headers for instant client update detection
  app.get('/version.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const versionPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'version.json')
      : path.join(process.cwd(), 'public', 'version.json');
    res.sendFile(versionPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'public', 'version.json'));
      }
    });
  });

  // Service Worker endpoint with strict no-cache headers to guarantee prompt updates
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const swPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'sw.js')
      : path.join(process.cwd(), 'public', 'sw.js');
    res.sendFile(swPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
      }
    });
  });

  // Push Notifications API
  app.get('/api/push/public-key', (req, res) => {
    res.json({
      status: 'ok',
      publicKey: pushService.getPublicKey(),
      subscribersCount: pushService.getSubscribersCount(),
    });
  });

  app.post('/api/push/subscribe', express.json(), (req, res) => {
    const { userId, userName, subscription, userAgent } = req.body || {};
    if (!userId || !subscription) {
      return res.status(400).json({ success: false, error: 'Champs userId ou subscription manquants' });
    }
    const registered = pushService.registerSubscription(userId, userName, subscription, userAgent);
    res.json({ success: registered, subscribersCount: pushService.getSubscribersCount() });
  });

  app.post('/api/push/unsubscribe', express.json(), (req, res) => {
    const { userId, endpoint } = req.body || {};
    if (!userId || !endpoint) {
      return res.status(400).json({ success: false, error: 'Champs userId ou endpoint manquants' });
    }
    const removed = pushService.removeSubscription(userId, endpoint);
    res.json({ success: removed });
  });

  app.post('/api/push/send-test', express.json(), async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis pour le test' });
    }
    const result = await pushService.sendNotificationToUser(userId, {
      title: '🃏 Njambo Kora Push Test',
      body: 'Félicitations ! Les notifications push mobiles et hors-ligne sont parfaitement actives sur votre appareil !',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: {
        type: 'SYSTEM',
        url: '/',
      },
    });
    res.json({ success: result.success > 0, ...result });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeRooms: RoomManager.getActiveRoomsCount(),
      timestamp: Date.now(),
    });
  });

  // Leaderboard Server Cache (60s cache to respect Firestore Quotas while keeping leaderboard fresh)
  let cachedLeaderboardUsers: any[] = [];
  let leaderboardCacheTimestamp = 0;
  const LEADERBOARD_CACHE_TTL = 60 * 1000;

  function calculateMasteryScore(stats: any): number {
    const mpManches = stats?.multiplayerManchesWon || 0;
    const soloHardManches = stats?.soloManchesWonHard || 0;
    const soloNormalManches = stats?.soloManchesWonNormal || 0;
    const soloEasyManches = stats?.soloManchesWonEasy || 0;

    const totalDetailedSolo = soloHardManches + soloNormalManches + soloEasyManches;
    const totalSoloManches = stats?.soloManchesWon || 0;
    const untrackedSoloManches = Math.max(0, totalSoloManches - totalDetailedSolo);
    const untrackedSoloPoints = untrackedSoloManches * 3; // default normal

    const partiesWon = stats?.partiesWon || stats?.gamesWon || 0;

    const doubleKoras = stats?.doubleKoraCount || 0;
    const totalKoras = stats?.koraCount || 0;
    const simpleKoras = Math.max(0, totalKoras - doubleKoras);

    const total =
      (mpManches * 10) +
      (soloHardManches * 6) +
      (soloNormalManches * 3) +
      (soloEasyManches * 1) +
      untrackedSoloPoints +
      (partiesWon * 1) +
      (simpleKoras * 5) +
      (doubleKoras * 20);

    return Math.max(0, Math.round(total));
  }

  function normalizePlayerName(name: string): string {
    return (name || '')
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|⚡|✨|🔥|👑|🃏|⭐/gu, '')
      .trim()
      .toLowerCase();
  }

  const KNOWN_BOT_NAMES = new Set([
    "thom's kora", "don wizeman", "kora boy malo", "zing efoulan",
    "black bozar", "systemtchakap", "zing mignon", "vie2poulet",
    "kora malox", "robam hokuto", "oumar", "fatou", "amadou",
    "cheikh", "idrissa", "mamadou", "adversaire", "ordinateur", "bot",
    "joueur (vous)", "vous", "joueur"
  ]);

  app.get('/api/leaderboard/cached', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const timeframe = (req.query.timeframe as string) || 'ALL'; // 'ALL' | 'WEEK' | 'MONTH'

      if (force || Date.now() - leaderboardCacheTimestamp > LEADERBOARD_CACHE_TTL || cachedLeaderboardUsers.length === 0) {
        if (db) {
          try {
            const [usersSnap, recordsSnap] = await Promise.all([
              getDocs(query(collection(db, 'users'), limit(50))),
              getDocs(query(collection(db, 'njambo_game_records'), orderBy('createdAt', 'desc'), limit(50))),
            ]);

            const usersMap = new Map<string, any>();

            // 1. Load authenticated Google users from Firestore (Règle d'or: Google Auth exclusivement)
            usersSnap.docs.forEach((doc) => {
              const data = doc.data();
              const uid = doc.id;
              // Filter out guests or anonymous accounts: only official authenticated accounts
              if (data.isGuest) return;

              usersMap.set(uid, {
                uid,
                displayName: data.displayName || 'Joueur',
                photoURL: data.photoURL || null,
                avatarId: data.avatarId || 'lion',
                isGuest: false,
                chips: data.chips ?? 1000,
                stats: { ...(data.stats || {}) },
                fairPlay: data.fairPlay || { activeSanction: null },
              });
            });

            // 2. Aggregate human player stats from game records (with full detail for new mastery scale)
            const gameStatsByPlayer = new Map<string, any>();
            const now = Date.now();
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
            const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

            recordsSnap.docs.forEach((d) => {
              const g = d.data();
              const gameTime = g.createdAt || g.timestamp || 0;

              const players = g.players || [];
              players.forEach((p: any) => {
                const pid = p.id;
                const pname = p.name;
                if (!pid && !pname) return;
                if (pid && pid.startsWith('bot_')) return;
                const lowerName = (pname || '').toLowerCase().trim();
                if (KNOWN_BOT_NAMES.has(lowerName)) return;

                const key = pid || pname;
                const cur = gameStatsByPlayer.get(key) || {
                  id: pid,
                  name: pname,
                  gamesPlayed: 0,
                  gamesWon: 0,
                  koraCount: 0,
                  doubleKoraCount: 0,
                  potWon: 0,
                  multiplayerManchesWon: 0,
                  soloManchesWonHard: 0,
                  soloManchesWonNormal: 0,
                  soloManchesWonEasy: 0,
                  soloManchesWon: 0,
                  manchesWon: 0,
                  // Timeframe specific buckets
                  week: { gamesPlayed: 0, gamesWon: 0, koraCount: 0, doubleKoraCount: 0, multiplayerManchesWon: 0, soloManchesWonHard: 0, soloManchesWonNormal: 0, soloManchesWonEasy: 0 },
                  month: { gamesPlayed: 0, gamesWon: 0, koraCount: 0, doubleKoraCount: 0, multiplayerManchesWon: 0, soloManchesWonHard: 0, soloManchesWonNormal: 0, soloManchesWonEasy: 0 },
                };

                cur.gamesPlayed++;
                if (gameTime >= oneWeekAgo) cur.week.gamesPlayed++;
                if (gameTime >= oneMonthAgo) cur.month.gamesPlayed++;

                const isWinner = g.winnerId === pid || g.winnerName === pname;
                if (isWinner) {
                  cur.gamesWon++;
                  if (gameTime >= oneWeekAgo) cur.week.gamesWon++;
                  if (gameTime >= oneMonthAgo) cur.month.gamesWon++;

                  if (g.winType === 'KORA') {
                    cur.koraCount++;
                    if (gameTime >= oneWeekAgo) cur.week.koraCount++;
                    if (gameTime >= oneMonthAgo) cur.month.koraCount++;
                  }
                  if (g.winType === 'DOUBLE_KORA') {
                    cur.doubleKoraCount++;
                    if (gameTime >= oneWeekAgo) cur.week.doubleKoraCount++;
                    if (gameTime >= oneMonthAgo) cur.month.doubleKoraCount++;
                  }
                  if (g.potWon) cur.potWon += g.potWon;

                  if (g.isMancheFinalWin) {
                    cur.manchesWon++;
                    if (g.mode === 'MULTIPLAYER') {
                      cur.multiplayerManchesWon++;
                      if (gameTime >= oneWeekAgo) cur.week.multiplayerManchesWon++;
                      if (gameTime >= oneMonthAgo) cur.month.multiplayerManchesWon++;
                    } else {
                      cur.soloManchesWon++;
                      const diff = (g.aiDifficulty || 'NORMAL').toUpperCase();
                      if (diff === 'HARD' || diff === 'EXPERT' || diff === 'GRAND_MASTER') {
                        cur.soloManchesWonHard++;
                        if (gameTime >= oneWeekAgo) cur.week.soloManchesWonHard++;
                        if (gameTime >= oneMonthAgo) cur.month.soloManchesWonHard++;
                      } else if (diff === 'EASY') {
                        cur.soloManchesWonEasy++;
                        if (gameTime >= oneWeekAgo) cur.week.soloManchesWonEasy++;
                        if (gameTime >= oneMonthAgo) cur.month.soloManchesWonEasy++;
                      } else {
                        cur.soloManchesWonNormal++;
                        if (gameTime >= oneWeekAgo) cur.week.soloManchesWonNormal++;
                        if (gameTime >= oneMonthAgo) cur.month.soloManchesWonNormal++;
                      }
                    }
                  }
                }
                gameStatsByPlayer.set(key, cur);
              });
            });

            // 3. Enrich registered Google users with recorded match activity & guest transition
            for (const [uid, u] of usersMap.entries()) {
              const stats = { ...u.stats };
              const normName = normalizePlayerName(u.displayName || '');

              let matchedRec: any = null;
              for (const [key, gRec] of gameStatsByPlayer.entries()) {
                if (key === uid || (gRec.name && normalizePlayerName(gRec.name) === normName)) {
                  matchedRec = gRec;
                  break;
                }
              }

              const gamesPlayed = Math.max(stats.partiesPlayed || stats.gamesPlayed || 0, matchedRec?.gamesPlayed || 0);
              const gamesWon = Math.max(stats.partiesWon || stats.gamesWon || 0, matchedRec?.gamesWon || 0);
              const koraCount = Math.max(stats.koraCount || 0, matchedRec?.koraCount || 0);
              const doubleKoraCount = Math.max(stats.doubleKoraCount || 0, matchedRec?.doubleKoraCount || 0);
              const biggestPotWon = Math.max(stats.biggestPotWon || 0, matchedRec?.potWon || 0);
              const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

              const mpManchesWon = Math.max(stats.multiplayerManchesWon || 0, matchedRec?.multiplayerManchesWon || 0);
              const soloHardManchesWon = Math.max(stats.soloManchesWonHard || 0, matchedRec?.soloManchesWonHard || 0);
              const soloNormalManchesWon = Math.max(stats.soloManchesWonNormal || 0, matchedRec?.soloManchesWonNormal || 0);
              const soloEasyManchesWon = Math.max(stats.soloManchesWonEasy || 0, matchedRec?.soloManchesWonEasy || 0);
              const soloManchesWon = Math.max(stats.soloManchesWon || 0, matchedRec?.soloManchesWon || 0);
              const manchesWon = Math.max(stats.manchesWon || 0, matchedRec?.manchesWon || 0);

              stats.gamesPlayed = gamesPlayed;
              stats.partiesPlayed = gamesPlayed;
              stats.gamesWon = gamesWon;
              stats.partiesWon = gamesWon;
              stats.koraCount = koraCount;
              stats.doubleKoraCount = doubleKoraCount;
              stats.biggestPotWon = biggestPotWon;
              stats.winRate = winRate;
              stats.multiplayerManchesWon = mpManchesWon;
              stats.soloManchesWonHard = soloHardManchesWon;
              stats.soloManchesWonNormal = soloNormalManchesWon;
              stats.soloManchesWonEasy = soloEasyManchesWon;
              stats.soloManchesWon = soloManchesWon;
              stats.manchesWon = manchesWon;

              stats.masteryScore = calculateMasteryScore(stats);

              // Temporal stats
              u.stats = stats;
              u.temporalStats = {
                week: {
                  gamesPlayed: matchedRec?.week?.gamesPlayed || 0,
                  gamesWon: matchedRec?.week?.gamesWon || 0,
                  koraCount: matchedRec?.week?.koraCount || 0,
                  doubleKoraCount: matchedRec?.week?.doubleKoraCount || 0,
                  multiplayerManchesWon: matchedRec?.week?.multiplayerManchesWon || 0,
                  soloManchesWonHard: matchedRec?.week?.soloManchesWonHard || 0,
                  soloManchesWonNormal: matchedRec?.week?.soloManchesWonNormal || 0,
                  soloManchesWonEasy: matchedRec?.week?.soloManchesWonEasy || 0,
                  masteryScore: calculateMasteryScore(matchedRec?.week || {}),
                },
                month: {
                  gamesPlayed: matchedRec?.month?.gamesPlayed || 0,
                  gamesWon: matchedRec?.month?.gamesWon || 0,
                  koraCount: matchedRec?.month?.koraCount || 0,
                  doubleKoraCount: matchedRec?.month?.doubleKoraCount || 0,
                  multiplayerManchesWon: matchedRec?.month?.multiplayerManchesWon || 0,
                  soloManchesWonHard: matchedRec?.month?.soloManchesWonHard || 0,
                  soloManchesWonNormal: matchedRec?.month?.soloManchesWonNormal || 0,
                  soloManchesWonEasy: matchedRec?.month?.soloManchesWonEasy || 0,
                  masteryScore: calculateMasteryScore(matchedRec?.month || {}),
                }
              };
            }

            cachedLeaderboardUsers = Array.from(usersMap.values()).sort(
              (a, b) => (b.stats?.masteryScore || 0) - (a.stats?.masteryScore || 0)
            );
            leaderboardCacheTimestamp = Date.now();
            console.log(`[Server] Leaderboard cache refreshed with ${cachedLeaderboardUsers.length} players.`);
          } catch (dbErr: any) {
            console.warn('[Leaderboard Server] Firestore query soft warning (e.g. quota limit reached):', dbErr?.message || dbErr);
          }
        }
      }

      // Filter by timeframe if requested
      let resultUsers = [...cachedLeaderboardUsers];
      if (timeframe === 'WEEK' || timeframe === 'MONTH') {
        const key = timeframe === 'WEEK' ? 'week' : 'month';
        resultUsers = resultUsers.map((u) => {
          const tStats = u.temporalStats?.[key] || {};
          return {
            ...u,
            stats: {
              ...u.stats,
              ...tStats,
              partiesPlayed: tStats.gamesPlayed || u.stats?.partiesPlayed || 0,
              partiesWon: tStats.gamesWon || u.stats?.partiesWon || 0,
              winRate: tStats.gamesPlayed > 0 ? Math.round(((tStats.gamesWon || 0) / tStats.gamesPlayed) * 100) : (u.stats?.winRate || 0),
            }
          };
        });
      }

      res.json({ success: true, users: resultUsers, timestamp: leaderboardCacheTimestamp, timeframe });
    } catch (err: any) {
      console.warn('[Leaderboard Cache API] Error:', err.message);
      res.json({ success: true, users: cachedLeaderboardUsers, timestamp: leaderboardCacheTimestamp || Date.now() });
    }
  });

  // Katika Admin Auth Protection Middleware
  const KATIKA_SECRET = process.env.KATIKA_ADMIN_SECRET || 'katika_master_secret_key_2026';
  app.use('/api/katika', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const tokenHeader = req.headers['x-katika-admin-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);
    const providedToken = tokenHeader || req.query.adminToken || (req.body && req.body.adminToken);

    if (providedToken === KATIKA_SECRET) {
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Accès administrateur Katika Master non autorisé. Jeton administrateur requis.',
    });
  });

  app.get('/api/katika/live-metrics', (req, res) => {
    const telemetry = RoomManager.getLiveTelemetry();
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      telemetry,
      timestamp: Date.now(),
    });
  });

  app.get('/api/katika/game-history', (req, res) => {
    res.json({
      status: 'ok',
      records: RoomManager.getMatchHistory(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/matches', express.json(), (req, res) => {
    const { record } = req.body || {};
    if (record && record.id) {
      RoomManager.recordFinishedMatch(record);
    }
    res.json({ success: true });
  });

  // Audit Logs API
  app.get('/api/katika/audit-logs', (req, res) => {
    res.json({
      status: 'ok',
      logs: RoomManager.getAuditLogs(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/audit-logs', express.json(), (req, res) => {
    const { log } = req.body || {};
    if (log && log.summary) {
      RoomManager.addAuditLog(log);
    }
    res.json({ success: true });
  });

  // Player Sanctions & Overrides API
  app.get('/api/katika/player-overrides', (req, res) => {
    res.json({
      status: 'ok',
      sanctions: RoomManager.getPlayerSanctions(),
      chipOverrides: RoomManager.getPlayerChipOverrides(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/ban-player', express.json(), (req, res) => {
    const { playerId, reason, banType, expiresAt } = req.body || {};
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId manquant' });
    }
    RoomManager.banPlayer(playerId, reason || 'Sanction administrative', banType || 'PERMANENT', expiresAt);
    res.json({ success: true, playerId });
  });

  app.post('/api/katika/player-chips', express.json(), (req, res) => {
    const { playerId, newBalance, reason } = req.body || {};
    if (!playerId || newBalance === undefined) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    RoomManager.updatePlayerChips(playerId, newBalance, reason || 'Ajustement Katika Master');
    res.json({ success: true, playerId, newBalance });
  });

  // Master Admin Action: Kick player
  app.post('/api/katika/rooms/:roomCode/kick', express.json(), (req, res) => {
    const { roomCode } = req.params;
    const { playerId } = req.body || {};
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId manquant' });
    }
    const success = RoomManager.adminKickPlayer(roomCode, playerId);
    res.json({ success, roomCode, playerId });
  });

  // Master Admin Action: Close room
  app.post('/api/katika/rooms/:roomCode/close', (req, res) => {
    const { roomCode } = req.params;
    const success = RoomManager.adminCloseRoom(roomCode);
    res.json({ success, roomCode });
  });

  // Master Admin Action: Reset round
  app.post('/api/katika/rooms/:roomCode/reset-round', (req, res) => {
    const { roomCode } = req.params;
    const success = RoomManager.adminResetRound(roomCode);
    res.json({ success, roomCode });
  });

  // Master Admin Action: Send admin message to room or a specific player
  app.post('/api/katika/rooms/:roomCode/message', express.json(), (req, res) => {
    const { roomCode } = req.params;
    const { playerId, message } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message manquant' });
    }
    const success = RoomManager.adminSendMessage(roomCode, playerId, message);
    res.json({ success, roomCode, playerId });
  });

  // Katika Engine Hot Config
  app.get('/api/katika/engine-config', (req, res) => {
    res.json(RoomManager.getEngineConfig());
  });

  app.post('/api/katika/engine-config', express.json(), (req, res) => {
    const updated = RoomManager.updateEngineConfig(req.body || {});
    res.json(updated);
  });

  function buildServerMetricsSnapshot(): any {
    const telemetry = RoomManager.getLiveTelemetry();
    const matchHistory = RoomManager.getMatchHistory();
    const auditLogs = RoomManager.getAuditLogs();
    const config = RoomManager.getEngineConfig();

    let koraCount = 0;
    let doubleKoraCount = 0;
    let simpleVictoryCount = 0;
    let totalPotWon = 0;
    let highestPot = 0;
    let twoPCount = 0;
    let threePCount = 0;
    let fourPCount = 0;

    for (const m of matchHistory) {
      if (m.winType === 'DOUBLE_KORA') doubleKoraCount++;
      else if (m.winType === 'KORA') koraCount++;
      else simpleVictoryCount++;

      if (m.potWon) {
        totalPotWon += m.potWon;
        if (m.potWon > highestPot) highestPot = m.potWon;
      }

      if (m.playerCount === 2) twoPCount++;
      else if (m.playerCount === 3) threePCount++;
      else if (m.playerCount === 4) fourPCount++;
    }

    const totalMatches = matchHistory.length;
    const koraRate = totalMatches > 0 ? Math.round(((koraCount + doubleKoraCount) / totalMatches) * 100) : 0;
    const avgPot = totalMatches > 0 ? Math.round(totalPotWon / totalMatches) : 0;

    const sanctions = RoomManager.getPlayerSanctions();
    const chipOverrides = RoomManager.getPlayerChipOverrides();

    // Reconstruct tracked players from sanctions, chip overrides, and match history
    const playerMap: Record<string, any> = {};
    matchHistory.forEach((m) => {
      const pId = m.winnerId || m.winnerName || 'Joueur';
      if (!playerMap[pId]) {
        playerMap[pId] = {
          id: pId,
          name: m.winnerName || pId,
          isHuman: true,
          chips: 5000,
          totalGames: 0,
          victories: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          status: 'ACTIVE',
          warningsCount: 0,
          abandonRate: 0,
        };
      }
      playerMap[pId].totalGames++;
      playerMap[pId].victories++;
      if (m.winType === 'KORA') playerMap[pId].koraCount++;
      if (m.winType === 'DOUBLE_KORA') {
        playerMap[pId].koraCount++;
        playerMap[pId].doubleKoraCount++;
      }
    });

    Object.keys(sanctions).forEach((pId) => {
      if (!playerMap[pId]) {
        playerMap[pId] = {
          id: pId,
          name: pId,
          isHuman: true,
          chips: 5000,
          totalGames: 0,
          victories: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          status: 'ACTIVE',
          warningsCount: 0,
          abandonRate: 0,
        };
      }
      Object.assign(playerMap[pId], sanctions[pId]);
    });

    Object.keys(chipOverrides).forEach((pId) => {
      if (playerMap[pId]) {
        playerMap[pId].chips = chipOverrides[pId];
      }
    });

    const playersList = Object.values(playerMap);

    const matchesHistoryEntries = matchHistory.slice(0, 50).map((m: any) => ({
      id: m.id || `m_${m.createdAt || Date.now()}`,
      date: new Date(m.createdAt || Date.now()).toLocaleString('fr-FR'),
      timestamp: m.createdAt || Date.now(),
      mode: m.mode || 'MULTIPLAYER',
      playerCount: m.playerCount || 4,
      winnerName: m.winnerName || 'Joueur',
      winnerId: m.winnerId,
      winType: m.winType || 'STANDARD',
      roundsCount: m.roundsCount || 1,
      partiesCount: m.roundsCount || 1,
      potWon: m.potWon || 0,
      durationSeconds: m.durationSeconds,
      status: 'completed',
      isAbandoned: false,
    }));

    return {
      timestamp: Date.now(),
      summary: {
        connectedPlayers: telemetry.connectedSockets,
        activeRooms: telemetry.activeRooms,
        liveBetProposalsActive: telemetry.liveBetProposalsActive || 0,
        liveCapacityVotesActive: telemetry.liveCapacityVotesActive || 0,
        liveKoraHunterAlertsActive: telemetry.liveKoraHunterAlertsActive || 0,
        totalParties: totalMatches,
        totalManches: totalMatches,
        completionRatePct: 100,
        healthStatus: 'OPÉRATIONNEL',
      },
      kpis: {
        allTime: {
          totalGamesPlayed: totalMatches,
          totalPartiesDisputed: totalMatches,
          totalManchesPlayed: totalMatches,
          koraCount,
          doubleKoraCount,
          simpleVictoryCount,
          twoPlayersCount: twoPCount,
          threePlayersCount: threePCount,
          fourPlayersCount: fourPCount,
          totalChipsWon: totalPotWon,
          avgPotPerGame: avgPot,
          highestPotWon: highestPot,
          soloGamesCount: 0,
          multiplayerGamesCount: totalMatches,
          playerBehavior: {
            audacityBarometer: {
              koraRate,
              doubleKoraRate: totalMatches > 0 ? Math.round((doubleKoraCount / totalMatches) * 100) : 0,
            },
          },
        },
      },
      liveRooms: {
        count: telemetry.activeRooms,
        rooms: (telemetry.roomsList || []).map((r) => ({
          roomName: `Table ${r.id} (${r.hostName || 'Hôte'})`,
          code: r.id,
          status: r.status,
          currentPlayersCount: r.playerCount,
          maxPlayers: r.maxPlayers,
          turnRemainingSeconds: r.turnRemainingSeconds,
          pot: r.pot,
          currentRound: r.currentRound,
          currentTrickNumber: r.currentTrickNumber,
          activePlayerName: r.activePlayerName,
          leadSuit: r.leadSuit,
          isPublic: r.isPublic,
          betIncreaseProposal: r.betIncreaseProposal,
          capacityExtensionProposal: r.capacityExtensionProposal,
          integrationProposal: r.integrationProposal,
          showKoraHunterAlert: r.showKoraHunterAlert,
          hunterPlayerName: r.hunterPlayerName,
          players: r.players,
        })),
      },
      playersOverview: {
        totalTracked: playersList.length,
        activeCount: playersList.filter((p) => p.status === 'ACTIVE').length,
        warnedCount: playersList.filter((p) => p.status === 'WARNED').length,
        bannedCount: playersList.filter((p) => p.status === 'BANNED').length,
        flaggedAntiFraudCount: 0,
        playersList,
        topPlayers: playersList.slice(0, 10),
      },
      auditLogsRecent: {
        count: auditLogs.length,
        criticalOrWarningCount: auditLogs.filter((l) => l.severity === 'CRITICAL' || l.severity === 'WARNING').length,
        recentEntries: auditLogs.slice(0, 50).map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          date: new Date(l.timestamp).toLocaleString('fr-FR'),
          type: l.type,
          severity: l.severity,
          summary: l.summary,
          actor: l.actor,
          details: l.details,
        })),
      },
      matchesHistory: {
        count: matchesHistoryEntries.length,
        entries: matchesHistoryEntries,
      },
      activeEngineConfig: config,
      detectedAnomalies: [],
    };
  }

  // AI Assistant Chat Route (Read-only advisor, text + multimodal screenshot support)
  app.post('/api/katika/ai-chat', async (req, res) => {
    try {
      const { message, image, history, config, metricsSnapshot } = req.body || {};
      if (!message && !image) {
        return res.status(400).json({ success: false, error: 'Message ou image requis.' });
      }
      const effectiveSnapshot = metricsSnapshot && metricsSnapshot.summary
        ? metricsSnapshot
        : buildServerMetricsSnapshot();

      const reply = await handleAdminChatMessage({ message, image, history, config, metricsSnapshot: effectiveSnapshot });
      res.json({ success: true, reply });
    } catch (err: unknown) {
      console.error('[Katika AI Chat API] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne du service IA.';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // AI Assistant Chat Route (Streaming via Server-Sent Events)
  app.post('/api/katika/ai-chat-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    try {
      const { message, image, history, config, metricsSnapshot } = req.body || {};
      if (!message && !image) {
        res.write(`data: ${JSON.stringify({ error: 'Message ou image requis.' })}\n\n`);
        return res.end();
      }

      const effectiveSnapshot = metricsSnapshot && metricsSnapshot.summary
        ? metricsSnapshot
        : buildServerMetricsSnapshot();

      await streamAdminChatMessage(
        { message, image, history, config, metricsSnapshot: effectiveSnapshot },
        (chunkText) => {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      );

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: unknown) {
      console.error('[Katika AI Chat Stream] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne du service IA.';
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Immutable caching for hashed assets (JS/CSS bundles in dist/assets)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Cache control for root assets (disable cache for version.json, sw.js, html)
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('version.json') || filePath.endsWith('sw.js') || filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Njambo Kora Server-Authoritative running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
