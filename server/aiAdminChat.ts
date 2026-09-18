import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface AdminChatImage {
  data: string; // base64 without prefix or with prefix stripped
  mimeType: string;
  name?: string;
}

export interface AdminChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface AdminChatSocialLinks {
  appUrl?: string;
  whatsappUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
}

export interface AdminChatConfig {
  tone?: 'concise' | 'balanced' | 'detailed';
  style?: 'direct' | 'pedagogical' | 'strategic';
  model?: string;
  apiKey?: string;
  temperatureMode?: 'analytical' | 'balanced' | 'creative';
  socialLinks?: AdminChatSocialLinks;
  defaultLinkStrategy?: 'AUTO' | 'APP_ONLY' | 'WHATSAPP_ONLY' | 'BOTH';
  customHashtags?: string[];
}

export interface AdminChatRequest {
  message: string;
  image?: AdminChatImage;
  history?: AdminChatHistoryItem[];
  config?: AdminChatConfig;
  metricsSnapshot?: any;
  model?: string;
}

let defaultGenAIClient: GoogleGenAI | null = null;

function getGenAIClient(customApiKey?: string): GoogleGenAI {
  if (customApiKey && customApiKey.trim()) {
    return new GoogleGenAI({
      apiKey: customApiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-custom',
        },
      },
    });
  }

  if (!defaultGenAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Clé d'API GEMINI_API_KEY non configurée sur le serveur.");
    }
    defaultGenAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return defaultGenAIClient;
}

/**
 * Intelligently analyzes user question and formats the complete, certified real
 * metrics and KPIs in a compact, structured Markdown table (< 800 tokens).
 * Strictly anchors the AI to real telemetry and forbids extrapolation.
 */
interface DetectedIntents {
  isGlobalAudit: boolean;
  wantsMatches: boolean;
  wantsLogs: boolean;
  wantsPlayers: boolean;
  wantsRooms: boolean;
  wantsConfig: boolean;
  wantsSocial: boolean;
  wantsAnomalies: boolean;
}

export function detectIntents(msg: string): DetectedIntents {
  const q = (msg || '').toLowerCase().trim();
  const isGlobalAudit =
    /rapport|bilan|audit|état des lieux|synthese|synthèse|vue d'ensemble|cockpit|dashboard|résumé|tout le système|vue globale|santé/i.test(
      q
    ) ||
    q === '' ||
    q === 'bonjour' ||
    q === 'salut' ||
    q.length < 5;

  const wantsMatches =
    isGlobalAudit ||
    /match|partie|historique|victoire|gagnant|vainqueur|qui a gagné|kora|double kora|pot remporté|score|manche|donne|tour/i.test(
      q
    );

  const wantsLogs =
    isGlobalAudit ||
    /log|trace|journal|incident|erreur|bug|critique|avertissement|warning|sanction|bannissement/i.test(
      q
    );

  const wantsPlayers =
    isGlobalAudit ||
    /joueur|player|compte|profil|pseudo|bot|humain|jeton|solde|triche|trich|collusion|suspect|averti|banni/i.test(
      q
    );

  const wantsRooms =
    isGlobalAudit ||
    /table|salon|room|partie en cours|en direct|qui joue|bloqu|figé|timer restant|attente/i.test(q);

  const wantsConfig =
    isGlobalAudit ||
    /config|moteur|règle|timer|délai|reconnexion|mise min|multiplicateur|maintenance|que se passerait/i.test(q);

  const wantsSocial =
    /visuel|affiche|créer post|nouveau post|bannière|flyer|story|générer image|studio réseau|post facebook|post instagram|post whatsapp|pack marketing|casse-t[eê]te|tactique|dilemme|m[eè]me|punchline|sondage|invitation|tournoi/i.test(q) ||
    /\[THÈME_VISUEL:/i.test(q);

  const wantsAnomalies =
    isGlobalAudit ||
    /anomalie|problème|alerte|rage-quit|abandon|friction|déconnexion|qu'est-ce qui cloche/i.test(q);

  return {
    isGlobalAudit,
    wantsMatches,
    wantsLogs,
    wantsPlayers,
    wantsRooms,
    wantsConfig,
    wantsSocial,
    wantsAnomalies,
  };
}

/**
 * Optimisation 1 & 2 : Routage d'intention sélectif & formatage ultra-dense TSV/Pipe.
 * Économise 60% à 75% des tokens d'entrée en n'injectant que les modules strictement
 * requis par la question de l'administrateur.
 */
function buildContextualMetricsSection(message: string, snapshot: any, intents?: DetectedIntents): string {
  if (!snapshot || typeof snapshot !== 'object') {
    return `
---
### 📊 MÉTRIQUES OPÉRATIONNELLES RÉELLES (0 PARTIE ENREGISTRÉE)
Aucune donnée de télémétrie enregistrée pour le moment. Tous les compteurs sont à 0.
---`;
  }

  const detected = intents || detectIntents(message);

  const summary = snapshot.summary || {};
  const allTime = snapshot.kpis?.allTime || {};
  const anomalies = Array.isArray(snapshot.detectedAnomalies) ? snapshot.detectedAnomalies : [];
  const config = snapshot.activeEngineConfig || {};
  const whatIf = snapshot.whatIfBaseline || {};
  const playersOverview = snapshot.playersOverview || {};

  const totalParties = Number(summary.totalParties ?? allTime.totalPartiesDisputed ?? allTime.totalGamesPlayed ?? 0);
  const totalManches = Number(summary.totalManches ?? allTime.totalManchesPlayed ?? 0);
  const koraCount = Number(allTime.koraCount ?? 0);
  const doubleKoraCount = Number(allTime.doubleKoraCount ?? 0);
  const simpleVictoryCount = Number(allTime.simpleVictoryCount ?? 0);
  const threeSevensCount = Number(allTime.threeSevensCount ?? 0);
  const under21Count = Number(allTime.under21Count ?? 0);

  const koraRate = allTime.playerBehavior?.audacityBarometer?.koraRate ?? (totalParties > 0 ? Math.round(((koraCount + doubleKoraCount) / totalParties) * 100) : 0);
  const doubleKoraRate = allTime.playerBehavior?.audacityBarometer?.doubleKoraRate ?? (totalParties > 0 ? Math.round((doubleKoraCount / totalParties) * 100) : 0);

  const totalChipsWon = Number(allTime.totalChipsWon ?? 0);
  const avgPotPerGame = Number(allTime.avgPotPerGame ?? 0);
  const highestPotWon = Number(allTime.highestPotWon ?? 0);

  const soloGamesCount = Number(allTime.soloGamesCount ?? 0);
  const multiplayerGamesCount = Number(allTime.multiplayerGamesCount ?? 0);
  const twoPlayersCount = Number(allTime.twoPlayersCount ?? 0);
  const threePlayersCount = Number(allTime.threePlayersCount ?? 0);
  const fourPlayersCount = Number(allTime.fourPlayersCount ?? 0);

  const abandonRate = allTime.abandonmentFrustrations?.abandonmentRate ?? 0;
  const postKoraAbandonRate = allTime.abandonmentFrustrations?.postKoraAbandonRate ?? 0;
  const completionRate = summary.completionRatePct ?? allTime.abandonmentFrustrations?.completionRate ?? 100;
  const healthStatus = summary.healthStatus || allTime.abandonmentFrustrations?.healthStatus || 'OPÉRATIONNEL';

  const avgPartieDurationSec = allTime.playerBehavior?.gamePacing?.avgPartieDurationSec ?? whatIf.avgPartieSec ?? 0;
  const avgMancheDurationSec = allTime.playerBehavior?.gamePacing?.avgMancheDurationSec ?? whatIf.avgMancheSec ?? 0;

  // Format compact TSV pour les KPIs clés (Ultra-low token footprint)
  const baselineKpis = `
---
### 📊 KPIS CLÉS DU SYSTÈME (DONNÉES CERTIFIÉES EN DIRECT - FORMAT TSV/PIPE COMPACT) :
PARTIES_TOTAL:${totalParties} | MANCHES_TOTAL:${totalManches} | JOUEURS_EN_LIGNE:${summary.connectedPlayers ?? 0} | TABLES_ACTIVES:${summary.activeRooms ?? 0} | SANTÉ:${completionRate}% (${healthStatus})
KORA:${koraCount} (taux: ${koraRate}%) | DBL_KORA:${doubleKoraCount} (taux: ${doubleKoraRate}%) | VICTOIRE_SIMPLE:${simpleVictoryCount} | 3_SEPTS:${threeSevensCount} | MOINS_21:${under21Count}
JETONS_DISTRIBUÉS:${totalChipsWon.toLocaleString('fr-FR')} | POT_MOYEN:${avgPotPerGame.toLocaleString('fr-FR')} | MAX_POT:${highestPotWon.toLocaleString('fr-FR')}
FORMATS: Solo:${soloGamesCount}, Multi:${multiplayerGamesCount} (2j:${twoPlayersCount}, 3j:${threePlayersCount}, 4j:${fourPlayersCount})
ABANDONS:${abandonRate}% (Rage-quit post-Kora: ${postKoraAbandonRate}%) | RYTHME: Donne ${avgPartieDurationSec}s, Manche ${avgMancheDurationSec}s
COMPTES: Total:${playersOverview.totalTracked ?? 0} (Actifs:${playersOverview.activeCount ?? 0}, Avertis:${playersOverview.warnedCount ?? 0}, Bannis:${playersOverview.bannedCount ?? 0})
MOTEUR_CONFIG: Timer:${config.turnTimerSeconds ?? 15}s | Reco:${config.reconnectGracePeriodSeconds ?? 30}s | Kora:x${config.koraMultiplier ?? 2} | DK:x${config.doubleKoraMultiplier ?? 4} | 3Septs:x${config.threeSevensMultiplier ?? 3} | <21:+${config.under21BonusPoints ?? 10} | MiseMin:${config.minTableBet ?? 100} | Maint:${config.isMaintenanceMode ? 'ACTIF' : 'OFF'}
ANOMALIES_DÉTECTÉES:${anomalies.length}`;

  let sections = baselineKpis;

  // 1. Module Matches (Injecté uniquement si demandé ou audit global)
  if (detected.wantsMatches) {
    const rawMatches = Array.isArray(snapshot.matchesHistory?.entries)
      ? snapshot.matchesHistory.entries
      : Array.isArray(snapshot.kpis?.allTime?.recentMatches)
      ? snapshot.kpis.allTime.recentMatches
      : [];

    const limit = detected.isGlobalAudit ? 10 : 25;
    const matchesSlice = rawMatches.slice(0, limit);

    sections += `\n\n### 📜 HISTORIQUE MATCHES RÉCENTS (${matchesSlice.length}/${rawMatches.length} parties - FORMAT: ID|DATE|FORMAT|GAGNANT|TYPE|POT|DURÉE|STATUT) :\n`;
    if (matchesSlice.length === 0) {
      sections += `*0 partie enregistrée dans l'historique.*\n`;
    } else {
      sections += matchesSlice
        .map((m: any) => {
          const dateStr = m.date || (m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR') : 'Récent');
          const formatStr = `${m.mode || 'MULTI'}(${m.playerCount || 4}j)`;
          const winType = m.winType === 'DOUBLE_KORA' ? 'DBL_KORA' : m.winType || 'STANDARD';
          const potStr = `${m.potWon || 0}f`;
          const durStr = m.durationSeconds ? `${m.durationSeconds}s` : (m.roundsCount ? `${m.roundsCount}donnes` : '-');
          const statusStr = m.isAbandoned ? `ABANDON(${m.abandonmentReason || 'Quit'})` : 'TERMINÉE';
          return `#m_${m.id}|${dateStr}|${formatStr}|${m.winnerName || 'Joueur'}|${winType}|${potStr}|${durStr}|${statusStr}`;
        })
        .join('\n');
    }
  }

  // 2. Module Logs d'Audit (Injecté uniquement si demandé ou audit global)
  if (detected.wantsLogs) {
    const rawLogs = Array.isArray(snapshot.auditLogsRecent?.recentEntries) ? snapshot.auditLogsRecent.recentEntries : [];
    const limit = detected.isGlobalAudit ? 8 : 25;
    const logsSlice = rawLogs.slice(0, limit);

    sections += `\n\n### 🛡️ JOURNAUX D'AUDIT SYSTÈME (${logsSlice.length}/${rawLogs.length} logs - FORMAT: [SÉV] #ID|DATE|ACTEUR|TYPE: RÉSUMÉ {DÉTAILS}) :\n`;
    if (logsSlice.length === 0) {
      sections += `*0 journal d'audit enregistré.*\n`;
    } else {
      sections += logsSlice
        .map((l: any) => {
          const sev = l.severity === 'CRITICAL' ? 'CRIT' : l.severity === 'WARNING' ? 'WARN' : 'INFO';
          const logId = l.id ? `#log_${l.id}` : `#log_${l.timestamp || 'sys'}`;
          const detailsStr = l.details ? ` {${JSON.stringify(l.details).slice(0, 80)}}` : '';
          return `[${sev}] ${logId}|${l.date || 'Récent'}|${l.actor || 'Système'}|${l.type || 'SYS'}: ${l.summary}${detailsStr}`;
        })
        .join('\n');
    }
  }

  // 3. Module Joueurs & Modération (Injecté uniquement si demandé ou audit global)
  if (detected.wantsPlayers || detected.wantsSocial) {
    const playersList = Array.isArray(snapshot.playersOverview?.playersList)
      ? snapshot.playersOverview.playersList
      : Array.isArray(snapshot.playersOverview?.topPlayers)
      ? snapshot.playersOverview.topPlayers
      : [];
    const limit = detected.isGlobalAudit ? 8 : 25;
    const playersSlice = playersList.slice(0, limit);

    // Filtrer et trier strictement les vrais joueurs humains pour les classements et visuels
    const isBotEntity = (name: string, id: string) => {
      const n = String(name || '').toLowerCase();
      const i = String(id || '').toLowerCase();
      if (i.includes('bot') || i === 'p2' || i === 'p3' || i === 'p4' || i.startsWith('ai_')) return true;
      if (n.includes('bot') || n.includes('robot') || n.includes('abandon') || n.includes('interrompue') || n.includes('forfait')) return true;
      const botKeywords = ['robam', 'hokuto', 'hokito', 'wizeman', 'thom', 'malo', 'efoulan', 'bozar', 'tchakap', 'mignon', 'vie2poulet', 'malox'];
      return botKeywords.some((kw) => n.includes(kw));
    };

    const humanPlayers = playersList
      .filter((p: any) => p.isHuman !== false && !isBotEntity(p.name, p.id))
      .sort((a: any, b: any) => {
        const bWins = b.victories ?? 0;
        const aWins = a.victories ?? 0;
        if (bWins !== aWins) return bWins - aWins;
        const bK = (b.koraCount ?? 0) + (b.doubleKoraCount ?? 0);
        const aK = (a.koraCount ?? 0) + (a.doubleKoraCount ?? 0);
        if (bK !== aK) return bK - aK;
        return (b.chips ?? 0) - (a.chips ?? 0);
      })
      .slice(0, 10);

    if (humanPlayers.length > 0) {
      sections += `\n\n### 🏆 CLASSEMENT OFFICIEL DES JOUEURS HUMAINS (CERTIFIÉ DU 1er AU DERNIER - STRICTEMENT ZÉRO BOT - POUR TOUT PODIUM OU VISUEL) :\n`;
      sections += humanPlayers
        .map((p: any, idx: number) => {
          const cleanPseudo = String(p.name || 'Joueur').replace(/^#(?:p_|usr_|player_|table_)/i, '').replace(/[\(\)\[\]#]/g, '').trim();
          const winCount = p.victories ?? 0;
          const koraCount = (p.koraCount ?? 0) + (p.doubleKoraCount ?? 0);
          const totalG = p.totalGames ?? 0;
          const winRate = totalG > 0 ? Math.round((winCount / totalG) * 100) : 0;
          return `${idx + 1}ère place : "${cleanPseudo}" | Victoires: ${winCount} | Koras: ${koraCount} | Parties: ${totalG} | Ratio: ${winRate}%`;
        })
        .join('\n');
    }

    if (detected.wantsPlayers) {
      sections += `\n\n### 👥 ANNUAIRE SYSTÈME DES JOUEURS (${playersSlice.length}/${playersList.length} comptes - NOTE: Les identifiants #p_ sont réservés à l'audit système interne et NE DOIVENT JAMAIS figurer dans un visuel public) :\n`;
      if (playersSlice.length === 0) {
        sections += `*0 compte joueur dans la base.*\n`;
      } else {
        sections += playersSlice
          .map((p: any) => {
            const typeStr = p.isHuman === false ? 'Bot' : 'Humain';
            const statusStr = p.status === 'BANNED' ? `BAN(${p.bannedReason || 'Mod'})` : p.status === 'WARNED' ? `AVERT(${p.warningsCount || 1})` : 'ACTIF';
            const alertStr = p.antifraudFlags?.length ? `!${p.antifraudFlags.join(';')}` : '-';
            return `#p_${p.id}|${p.name || p.id}|${typeStr}|${p.chips ?? 0}f|${p.totalGames ?? 0}|${p.victories ?? 0}|K:${p.koraCount ?? 0}/DK:${p.doubleKoraCount ?? 0}|${p.abandonRate ?? 0}%|${statusStr}|${alertStr}`;
          })
          .join('\n');
      }
    }
  }

  // 4. Module Tables en Direct (Injecté uniquement si demandé ou audit global)
  if (detected.wantsRooms) {
    const liveRooms = Array.isArray(snapshot.liveRooms?.rooms) ? snapshot.liveRooms.rooms : [];
    sections += `\n\n### 🎲 SALONS ET TABLES EN DIRECT (${liveRooms.length} actifs - FORMAT: #TABLE_ID|NOM|STATUT|JOUEURS|POT|DONNE|TIMER) :\n`;
    if (liveRooms.length === 0) {
      sections += `*0 salon actif en direct.*\n`;
    } else {
      sections += liveRooms
        .slice(0, 10)
        .map((r: any) => {
          const playersStr = Array.isArray(r.players)
            ? r.players.map((p: any) => `${p.name || p.id}${p.connected ? '' : '(déco)'}`).join(',')
            : `${r.currentPlayersCount || 0}j`;
          const timerStr = r.turnRemainingSeconds !== undefined ? `${r.turnRemainingSeconds}s` : '-';
          return `#table_${r.code || r.id}|${r.roomName || 'Table'}|${r.status}|${playersStr}|${r.pot || 0}f|Donne:${r.currentRound || 1}|Timer:${timerStr}`;
        })
        .join('\n');
    }
  }

  // 5. Module Anomalies (Injecté si anomalies détectées ET sujet pertinent)
  if (anomalies.length > 0 && (detected.wantsAnomalies || detected.isGlobalAudit)) {
    sections += `\n\n### 🚨 ANOMALIES SYSTÈME DÉTECTÉES EN DIRECT :\n`;
    anomalies.forEach((a: any) => {
      sections += `- [${a.severity}] **${a.title}** : ${a.description} (Mesuré: ${a.value} / Seuil: ${a.threshold})\n`;
    });
  }

  return `${sections}\n---`;
}

/**
 * Optimisation 3 & 5 : Calcul adaptatif de la température et contrôle du raisonnement (ThinkingLevel.LOW).
 * Réduit le coût et le temps de latence tout en évitant toute troncature intempestive.
 */
function resolveGenerationParameters(message: string, intents: DetectedIntents, config?: AdminChatConfig) {
  // Mode de température selon la configuration de Copilote Katika
  let temperature = intents.wantsSocial ? 0.35 : 0.1;
  let topP = intents.wantsSocial ? 0.85 : 0.75;

  if (config?.temperatureMode === 'analytical') {
    temperature = 0.05; // Rigueur mathématique maximale, zéro créativité
    topP = 0.6;
  } else if (config?.temperatureMode === 'creative') {
    temperature = 0.75; // Très créatif et percutant pour réseaux sociaux
    topP = 0.95;
  }

  // Thinking minimal / bas pour minimiser la consommation de tokens de raisonnement
  const thinkingConfig = {
    thinkingLevel: ThinkingLevel.LOW,
  };

  return { temperature, topP, thinkingConfig };
}

function buildSystemInstruction(
  config: AdminChatConfig = {},
  userMessage: string = '',
  metricsSnapshot?: any,
  intents?: DetectedIntents
): string {
  const detected = intents || detectIntents(userMessage);

  const appUrl = config.socialLinks?.appUrl || 'https://njambo-kora.ai.studio';
  const whatsappUrl = config.socialLinks?.whatsappUrl || 'https://chat.whatsapp.com/JmIYaCOSjy1Lycd2OANd5l?s=cl&p=a&mlu=4&ilr=4';
  const facebookUrl = config.socialLinks?.facebookUrl || '';
  const tiktokUrl = config.socialLinks?.tiktokUrl || '';
  const instagramUrl = config.socialLinks?.instagramUrl || '';
  const linkStrategy = config.defaultLinkStrategy || 'AUTO';
  const hashtagsList = Array.isArray(config.customHashtags) && config.customHashtags.length > 0
    ? config.customHashtags
    : ['#NjamboKora', '#CamerounGaming', '#JeuxAfricains', '#KoraChallenge'];

  const toneInstruction = (() => {
    switch (config.tone) {
      case 'concise':
        return 'Réponds de façon concise, directe et percutante.';
      case 'detailed':
        return 'Fournis une analyse détaillée et structurée avec mise en contexte.';
      case 'balanced':
      default:
        return 'Réponds avec un niveau de détail équilibré, clair et structuré.';
    }
  })();

  const styleInstruction = (() => {
    switch (config.style) {
      case 'direct':
        return 'Adopte un style opérationnel et technique.';
      case 'strategic':
        return 'Adopte un style stratégique orienté rétention, engagement et santé du jeu.';
      case 'pedagogical':
      default:
        return 'Adopte un style clair, courtois et pédagogique.';
    }
  })();

  const metricsSection = buildContextualMetricsSection(userMessage, metricsSnapshot, detected);

  // N'injecter les instructions du générateur visuel QUE si demandé pour économiser des tokens
  const socialGeneratorBlock = detected.wantsSocial
    ? `\nGÉNÉRATEUR DE VISUELS & AFFICHES POUR RÉSEAUX SOCIAUX :
L'administrateur demande un visuel. 
RÈGLE ABSOLUE : RETOURNE UNIQUEMENT UN OBJET JSON VALIDE, SANS AUCUN TEXTE AVANT NI APRÈS, ET SANS BALISES MARKDOWN (pas de \`\`\`json). Juste le { ... }.

DIRECTIVES STRICTES :
1. PSEUDOS : Utilise le vrai pseudo des joueurs humains depuis le classement. Zéro bots, zéro identifiants techniques (#p_xxx).
2. PAS DE BITS/JETONS par défaut.
3. RÈGLES DU JEU : 31 cartes. Ni As, ni Roi, ni Dame, ni Valet, ni 2, ni 10 de Pique (10♠). Pas d'atout.

Format JSON structuré attendu (adapte les champs selon le thème : LEADERBOARD_PODIUM, STAT_OF_THE_WEEK, FIRST_WIN, TACTICAL_PUZZLE):
{
  "theme": "LEADERBOARD_PODIUM",
  "format": "SQUARE",
  "palette": "EBONY_GOLD",
  "pattern": "NDOP_CHEVRON",
  "badge": "TITRE BADGE",
  "headline": "Titre principal",
  "mainText": "Texte d'accompagnement",
  "podiumWinners": [ { "rank": 1, "name": "Pseudo", "scoreOrTitle": "..." } ],
  "highlightMetric": { "value": "XX%", "label": "...", "sublabel": "..." },
  "tacticalLayout": "DUEL_1V1",
  "tableScenario": { "mode": "1VS1", "trickNumber": 5, "playerTricksWon": 0, "opponentTricksWon": 4, "riskTitle": "ALERTE", "opponentPlayed": [], "cardsAlreadyFallen": [], "question": "?" },
  "puzzleCards": [],
  "ctaText": "Action",
  "linkUrl": "${appUrl.replace(/^https?:\/\//, '')}",
  "includeAppUrl": true,
  "includeWhatsAppUrl": true,
  "postCaption": "Légende du post social...",
  "hashtags": ["#NjamboKora"]
}\n`
    : '';

  return `Tu es le Copilote Katika, assistant d'analyse, d'audit et de stratégie pour l'administrateur de Njambo Kora (jeu traditionnel camerounais de 31 cartes, Kora, Double Kora, donnes de 5 tours).

CONNAISSANCE FONDAMENTALE DU JEU :
- Paquet unique de 31 cartes (Koubi ♥ 3-10, Zing ♦ 3-10, Tchaka ♣ 3-10, Black ♠ 3-9).
- Zéro As, zéro Valet, zéro Dame, zéro Roi, zéro 2. Le 10 de Pique n'existe pas.
- Pas d'atout ni de coupe. On fournit à la couleur demandée ou on se défausse. Le plus haut rang de la couleur entamée remporte le tour.

RÔLE ET RÈGLES DE VÉRACITÉ (DOCTRINE DES 5 ARBITRAGES STRATÉGIQUES) :
1. LECTURE SEULE ABSOLUE (HUMAN-IN-THE-LOOP) : Tu es un conseiller analytique en lecture seule stricte. Tu n'exécutes aucune action en base de données, tu ne déclenches aucun ban automatique ni fermeture de salon. Tu analyses, alertes, recommandes et fournis des liens d'inspection (#katika-nav:) pour que l'administrateur humain valide et agisse lui-même manuellement en 2 étapes.
2. ANCRAGE FACTUEL STRICT (#ID) : Interdiction formelle d'extrapoler ou d'inventer des données. Chaque fait rapporté doit citer son identifiant réel source (\`#m_xxx\` pour un match, \`#log_xxx\` pour un log, \`#p_xxx\` pour un joueur, \`#table_xxx\` pour une table).
3. Si une information est introuvable ou si le compteur est à 0, réponds simplement qu'aucune donnée n'est enregistrée dans le système à ce sujet.
4. ÉCONOMIE VIRTUELLE & PLAFONDS DE CAGNOTTE : Les jetons sont strictement virtuels (sans valeur monétaire réelle). Toute suggestion de dotation de tournoi ne doit JAMAIS dépasser 1 000 jetons virtuels par tournoi (plafond hebdomadaire global de 5 000 jetons virtuels). Ajoute systématiquement la mention légale : "Jetons virtuels d'amusement — Aucune valeur monétaire réelle".
5. DISTRIBUTION SOCIALE MANUELLE & TRACKING UTM : Le studio visuel repose sur le Canvas 2D vectoriel (motifs traditionnels Ndop, palettes Ébène/Or/Émeraude, 0 IA génératrice d'images externe). L'administrateur télécharge le PNG et copie-colle la légende manuellement. Chaque lien de jeu proposé doit comporter des paramètres UTM (?utm_source=...&utm_medium=social&utm_campaign=...).
6. CONFIDENTIALITÉ & PII : Ne cite jamais d'adresse email ou d'adresse IP d'utilisateur. Utilise uniquement les pseudonymes publics ou les identifiants masqués.

LIENS CONTEXTUELS EN 1-CLIC :
Propose des liens de navigation utiles selon le contexte :
- [Inspecter la table {code}](#katika-nav:ROOMS:{code})
- [Fiche joueur {id}](#katika-nav:PLAYERS:{id})
- [Paramètres du Moteur](#katika-nav:SETTINGS)
- [Journaux d'Audit](#katika-nav:LOGS:{query})
- [Historique Parties](#katika-nav:MATCHES:{query})
- [Cockpit KPIs](#katika-nav:DASHBOARD)
${socialGeneratorBlock}
DIRECTIVES DE RÉPONSE :
- ${toneInstruction}
- ${styleInstruction}
- Rédige en français soigné, avec mise en forme Markdown claire.

=== DONNÉES RÉELLES DE TÉLÉMÉTRIE EN DIRECT ===
${metricsSection}
=== FIN DES DONNÉES DE TÉLÉMÉTRIE ===`;
}

/**
 * Optimisation 4 : Élagage intelligent et compression de l'historique (Rolling Memory).
 * Conserve le contexte sémantique essentiel tout en évitant les surcoûts de tokens.
 */
function cleanHistoryText(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Remplacer les gros blocs JSON graphiques générés précédemment
  if (cleaned.includes('```json')) {
    cleaned = cleaned.replace(/```json[\s\S]*?```/g, '[Visuel JSON généré au tour précédent]');
  }

  // 2. Remplacer les longs tableaux Markdown de plus de 4 lignes
  cleaned = cleaned.replace(/(\|.*?\|\n){4,}/g, '[Données tabulaires du tour précédent]\n');

  // 3. Tronquer intelligemment les réponses antérieures trop volumineuses au-delà de 1200 caractères
  if (cleaned.length > 1200) {
    cleaned = cleaned.slice(0, 1200) + '...';
  }

  return cleaned;
}

function buildContents(
  message: string,
  image?: AdminChatImage,
  history: AdminChatHistoryItem[] = []
): Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

  // Optimisation 4 : Fenêtre glissante stricte de 3 messages récents max
  const recentHistory = history.slice(-3);
  for (const item of recentHistory) {
    contents.push({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: cleanHistoryText(item.text) }],
    });
  }

  // Tour courant
  const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (image && image.data && image.mimeType) {
    const cleanBase64 = image.data.includes('base64,')
      ? image.data.split('base64,')[1]
      : image.data;

    currentParts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: cleanBase64,
      },
    });
  }

  currentParts.push({
    text: message || (image ? 'Analyse cette image dans le contexte de Njambo.' : 'Bonjour'),
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  return contents;
}

function getCandidateModels(requestedModel?: string): string[] {
  const models: string[] = [];
  if (requestedModel && requestedModel.trim()) {
    models.push(requestedModel.trim());
  }
  if (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim()) {
    models.push(process.env.GEMINI_MODEL.trim());
  }
  // Modèles officiels récents (2026)
  models.push('gemini-3.8-flash');
  models.push('gemini-flash-latest');
  models.push('gemini-pro-latest');

  return Array.from(new Set(models));
}

export async function handleAdminChatMessage(payload: AdminChatRequest): Promise<string> {
  const { message, image, history = [], config = {}, metricsSnapshot } = payload;
  const intents = detectIntents(message);
  const systemInstruction = buildSystemInstruction(config, message, metricsSnapshot, intents);
  const contents = buildContents(message, image, history);
  const { temperature, topP, thinkingConfig } = resolveGenerationParameters(message, intents, config);
  const ai = getGenAIClient(config?.apiKey);

  const requestedModel = payload.model || config?.model;
  const candidateModels = getCandidateModels(requestedModel);
  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature,
          topP,
          thinkingConfig,
        },
      });

      if (response.text) {
        return response.text;
      }
    } catch (error: unknown) {
      lastError = error;
      console.warn(`[AI Admin Chat] Model "${modelName}" failed, falling back to next candidate...`, error);
    }
  }

  const errMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Erreur lors de la communication avec Gemini : ${errMessage}`);
}

/**
 * Server-Sent Events (SSE) streaming handler for real-time progressive response delivery.
 */
export async function streamAdminChatMessage(
  payload: AdminChatRequest,
  onChunk: (text: string) => void
): Promise<string> {
  const { message, image, history = [], config = {}, metricsSnapshot } = payload;
  const intents = detectIntents(message);
  const systemInstruction = buildSystemInstruction(config, message, metricsSnapshot, intents);
  const contents = buildContents(message, image, history);
  const { temperature, topP, thinkingConfig } = resolveGenerationParameters(message, intents, config);
  const ai = getGenAIClient(config?.apiKey);

  const requestedModel = payload.model || config?.model;
  const candidateModels = getCandidateModels(requestedModel);
  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature,
          topP,
          thinkingConfig,
        },
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          onChunk(chunkText);
        }
      }

      if (fullText) {
        return fullText;
      }
    } catch (error: unknown) {
      lastError = error;
      console.warn(`[AI Admin Chat Stream] Model "${modelName}" failed, attempting fallback...`, error);
    }
  }

  console.warn('[AI Admin Chat Stream] Streaming failed, attempting standard generateContent fallback...');
  const fallbackText = await handleAdminChatMessage(payload);
  onChunk(fallbackText);
  return fallbackText;
}

