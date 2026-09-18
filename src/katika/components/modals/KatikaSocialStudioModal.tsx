import React, { useState } from 'react';
import {
  X,
  Sparkles,
  BarChart3,
  Quote,
  Layers,
  HelpCircle,
  Trophy,
  MessageSquare,
  UserPlus,
  Send,
  Download,
  Copy,
  Check,
  Smartphone,
  Square,
  Flame,
  Award,
  BookOpen,
  ArrowRight,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import {
  SocialVisualTheme,
  SocialVisualFormat,
  SocialVisualCardData,
  SOCIAL_THEMES_CONFIG,
  STAR_VISUAL_CATEGORIES,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
  createRealisticNjamboPuzzleScenario,
  createRealisticPodiumScenario,
  RealisticRiskScenarioType,
  isKnownBotName,
} from '../../types/socialVisuals';
import { KatikaSocialCardPreview } from '../social/KatikaSocialCardPreview';

interface KatikaSocialStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToAi: (prompt: string) => void;
  metricsSnapshot?: any;
  initialTheme?: SocialVisualTheme;
}

export const KatikaSocialStudioModal: React.FC<KatikaSocialStudioModalProps> = ({
  isOpen,
  onClose,
  onSendToAi,
  metricsSnapshot,
  initialTheme = 'TACTICAL_PUZZLE',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTheme, setSelectedTheme] = useState<SocialVisualTheme>(initialTheme);
  const [previewCard, setPreviewCard] = useState<SocialVisualCardData | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<RealisticRiskScenarioType>('ANTI_KORA_ESCAPE');

  if (!isOpen) return null;

  const totalManches = metricsSnapshot?.summary?.totalManches ?? 142;
  const koraCount = metricsSnapshot?.kpis?.allTime?.koraCount ?? 38;
  const connectedPlayers = metricsSnapshot?.summary?.connectedPlayers ?? 12;

  // Generates instant template data for a given theme with real metrics and authentic Njambo cards
  const getInstantTemplate = (theme: SocialVisualTheme, scenarioType: RealisticRiskScenarioType = selectedScenario): SocialVisualCardData => {
    switch (theme) {
      case 'TACTICAL_PUZZLE':
        return createRealisticNjamboPuzzleScenario(scenarioType);

      case 'LEADERBOARD_PODIUM': {
        const topPlayers = (metricsSnapshot?.playersOverview?.topPlayers || [])
          .filter((p: any) => p.isHuman !== false && !isKnownBotName(p.name))
          .slice(0, 3)
          .map((p: any, idx: number) => {
            const winCount = p.victories ?? 0;
            const kCount = (p.koraCount ?? 0) + (p.doubleKoraCount ?? 0);
            const totalG = p.totalGames ?? 0;
            const winRate = totalG > 0 ? Math.round((winCount / totalG) * 100) : 0;
            return {
              rank: (idx + 1) as 1 | 2 | 3,
              name: p.name,
              scoreOrTitle: `${p.masteryScore || 0} pts • ${winCount} Victoires`,
              koraCount: kCount,
              badge: idx === 0 ? '👑 GRAND CHAMPION' : idx === 1 ? '🥈 VICE-CHAMPION' : '🥉 3E DU PODIUM',
            };
          });

        return createRealisticPodiumScenario(topPlayers.length > 0 ? topPlayers : undefined);
      }

      case 'STAT_OF_THE_WEEK':
        return {
          theme: 'STAT_OF_THE_WEEK',
          badge: 'CHIFFRE DE LA SEMAINE 🃏',
          headline: `${totalManches} manches disputées cette semaine !`,
          mainText: `Les Maîtres du Kora ont fait trembler l'arène avec ${koraCount} Kora spectaculaires validés sur Katika.`,
          highlightMetric: {
            value: String(totalManches),
            label: 'Parties disputées',
            sublabel: `avec ${koraCount} Kora décisifs enregistrés`,
          },
          heroCard: {
            rank: '10',
            suit: '♥',
            label: '10 KOUBI',
            badge: 'MAÎTRE DU 5e TOUR',
          },
          ctaText: 'Rejoins les Maîtres du Kora • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nC'est le grand bilan de l'arène : cette semaine, pas moins de ${totalManches} manches ont été disputées par nos joueurs !\n\nAu total, ${koraCount} Kora ont retourné des donnes in extremis au 5e tour. Bravo aux stratèges qui ont osé poser l'As au bon moment !\n\n👉 Vous étiez de la partie ? Combien de Kora avez-vous validés cette semaine ? Dites-le-nous en commentaire !\n\n🎮 Lien du jeu 100% gratuit (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\n*${totalManches} manches* jouées et *${koraCount} Kora* spectaculaires validés cette semaine !\n\n👉 *Joue gratuitement en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe officiel des joueurs :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#ChiffreDeLaSemaine', '#MaitresDuKora', '#CamerounGaming', '#JeuxAfricains'],
        };

      case 'TESTIMONIAL':
        return {
          theme: 'TESTIMONIAL',
          badge: 'PAROLE DE MAÎTRE 🎙️',
          headline: '« Quand tu places le Double Kora, la table se tait. »',
          mainText: 'Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. Katika restitue exactement cette adrénaline des soirées au quartier !',
          author: {
            name: 'Maître Serge_237',
            role: 'Joueur régulier • Douala',
          },
          heroCard: {
            rank: '10',
            suit: '♥',
            label: 'DOUBLE KORA',
          },
          ctaText: 'Viens tester ton niveau • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Communauté WhatsApp`,
          postCaption: `🎙️ PAROLE DE TESTEUR — LA PASSION DU NJAMBO !\n\n« Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. Katika restitue exactement cette adrénaline des soirées au quartier ! » — Maître Serge_237.\n\nMerci à tous nos testeurs pour leurs retours passionnés. Le Njambo en ligne continue de grandir avec vous !\n\nToi aussi, rejoins l'aventure et fais-nous part de tes impressions 👇\n🎮 Jeu gratuit : ${NJAMBO_APP_URL}\n💬 Groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🎙️ *PAROLE DE TESTEUR NJAMBO !* 🇨🇲\n\n« Quand tu places le Double Kora au 5e tour... la table entière se tait ! »\n\nViens défier les maîtres en direct :\n👉 ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp de la communauté :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Temoignage', '#NjamboKora', '#CommunauteNjambo', '#Cameroun', '#KoraHunter'],
        };

      case 'TIP_OR_RULE':
        return {
          theme: 'TIP_OR_RULE',
          badge: 'ASTUCE STRATÉGIQUE 💡',
          headline: 'La règle d’or : surveillez la défausse !',
          mainText: 'Ne jetez jamais votre carte maîtresse au premier tour si vous visez le Kora. Observez la défausse adverse et conservez votre 10 Koubi pour le 5e tour décisif.',
          palette: 'ROYAL_SAPPHIRE',
          decorativeCards: [
            { rank: '9', suit: '♠', label: 'BLACK' },
            { rank: '10', suit: '♥', label: 'KOUBI' },
          ],
          ctaText: 'Mets la stratégie en pratique • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins le groupe`,
          postCaption: `💡 L'ASTUCE DU MAÎTRE : RÉUSSIR SON KORA 🃏\n\nBeaucoup de joueurs débutants se précipitent pour remporter les premiers tours avec leurs plus fortes cartes. Erreur fatale !\n\n👉 La clé du Njambo Kora réside dans la patience : gardez le contrôle, comptez les cartes déjà défaussées et frappez au 5e tour lorsque l'adversaire n'a plus de réponse.\n\nQuelle est votre tactique préférée ? Attaque directe ou embuscade au dernier tour ? 💬 Répondez ci-dessous !\n\n🎮 Joue au jeu : ${NJAMBO_APP_URL}\n💬 Débats et conseils sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `💡 *L'ASTUCE DU MAÎTRE : RÉUSSIR SON KORA !* 🇨🇲\n\nCompte toujours les atouts défaussés et prépare ton coup pour le 5e tour !\n\n👉 *Pratique tes coups en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#AstuceDuJour', '#StrategieNjambo', '#ReglesDuJeu', '#DoubleKora', '#NjamboMaster'],
        };

      case 'MEME_OR_PUNCHLINE':
        return {
          theme: 'MEME_OR_PUNCHLINE',
          badge: 'HUMOUR NJAMBO 😂',
          headline: '« Je n’ai pas d’atout, je joue au hasard... »',
          mainText: 'Le gars qui te jure sur ses ancêtres qu’il n’a rien dans la main, mais qui sort le 10 Koubi au 5e tour avec un grand sourire.',
          palette: 'SUNSET_TERRACOTTA',
          heroCard: {
            rank: '10',
            suit: '♥',
            label: 'LE KORA ! 💥',
          },
          ctaText: 'Identifie ce menteur en commentaire 🤣',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `😂 LA VÉRITÉ SUR LES JOUEURS DE NJAMBO AU QUARTIER !\n\nOn a tous cet ami à la table qui répète à chaque tour :\n« Hé gars, ma donne est gâtée, je n'ai rien reçu, je jette n'importe quoi... »\n\nEt dès que tu t'avances confiant au 5e tour... BAM ! Double Kora sec, il ramasse tous tes jetons et commence à danser !\n\nTague cet ami en commentaire sans rien dire 🤣👇\n\n🎮 Joue au Njambo gratuitement en ligne : ${NJAMBO_APP_URL}\n💬 Ambiance garantie sur notre groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `😂 *LA LOI DU NJAMBO AU MBOA !* 🇨🇲\n\n« Je n’ai pas d’atout, je jette n'importe quoi... »\nEt au 5e tour : BAM ! Double Kora sec ! 🃏🤣\n\nQui est ce joueur dans le groupe ? Démasquez-vous sur la table :\n👉 ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#HumourCameroun', '#NjamboMeme', '#LaLoiDuKora', '#AmbianceQuartier', '#DoubleKora'],
        };

      case 'TOURNAMENT_ANNOUNCEMENT':
        return {
          theme: 'TOURNAMENT_ANNOUNCEMENT',
          badge: 'GRAND TOURNOI NJAMBO 🏆',
          headline: 'Le Grand Clash du Samedi Soir',
          mainText: 'Affrontez les meilleurs maîtres de la région dans une arène sans pitié ! Inscriptions gratuites et retransmission en direct.',
          palette: 'EBONY_GOLD',
          eventDetails: {
            date: 'Ce Samedi • 21h00 UTC+1',
            prizePool: '100 000 Jetons & Badge VIP',
            mode: 'Table à 4 • Élimination directe',
            spotsRemaining: '32 Places • Entrée Gratuite',
          },
          ctaText: 'Inscris-toi au Tournoi • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🏆 GRAND TOURNOI NJAMBO DU WEEK-END ! 🇨🇲\n\nPréparez vos cartes et affûtez vos tactiques : ce samedi à 21h00, l'arène Katika ouvre ses portes pour le Clash des Maîtres !\n\n💰 Cagnotte : 100 000 jetons virtuels + Titre de Maître du Kora\n⚔️ Format : Table à 4 joueurs, élimination directe\n🎟️ Inscription : 100% Gratuite, 32 places max !\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Inscription & canal officiel WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *GRAND TOURNOI NJAMBO CE SAMEDI 21H !* 🇨🇲\n\nCagnotte : *100 000 jetons virtuels* + Titre officiel de Maître du Kora !\nFormat : Tables à 4 joueurs • Élimination directe\nPlaces : 32 joueurs max.\n\n👉 *Rejoins la table et joue gratuitement :* ${NJAMBO_APP_URL}\n💬 *Inscris-toi sur le groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}\n\nTransférez ce message à vos adversaires préférés ! 🃏`,
          hashtags: ['#TournoiNjambo', '#CashPrize', '#EsportCameroun', '#DoubleKora', '#GamingAfrica'],
        };

      case 'CAROUSEL_SLIDE':
        return {
          theme: 'CAROUSEL_SLIDE',
          badge: 'GUIDE TACTIQUE 📚 (1/3)',
          headline: 'Ne Subis Plus Jamais de Kora',
          mainText: 'Règle #1 : La mémorisation des 5 tours. Au Njambo, chaque tour compte. Ne regarde pas seulement ta main, compte les atouts sortis pour piéger ton rival au dernier tour.',
          palette: 'EMERALD_GOLD',
          carouselStep: {
            current: 1,
            total: 3,
            stepTitle: 'La Mémorisation',
          },
          ctaText: 'Fais glisser pour l’astuce 2 ➔',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `📚 MINI-GUIDE : 3 RÈGLES D'OR POUR DEVENIR IMBATTABLE AU NJAMBO (Partie 1/3) !\n\nTu perds souvent au 5e tour ? C'est parce que tu te concentres uniquement sur tes propres cartes.\n\nDans ce carrousel, nous te dévoilons les 3 secrets des grands Maîtres du Kora pour anticiper les coups adverses.\n\n👉 Fais glisser pour découvrir la règle #2 et enregistre ce post pour tes prochaines parties !\n\n🎮 Entraîne-toi dès maintenant : ${NJAMBO_APP_URL}\n💬 Rejoins la communauté WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `📚 *ASTUCE DU JOUR : COMMENT ÉVITER LE KORA !* 🇨🇲\n\nSecret #1 : Compte toujours les atouts tombés aux 3 premiers tours avant de lancer ta carte maîtresse.\n\n👉 *Viens t'entraîner gratuitement en ligne :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#GuideNjambo', '#ApprendreLesCartes', '#StrategieKora', '#CamerounGaming'],
        };

      case 'COMMUNITY_QUESTION':
        return {
          theme: 'COMMUNITY_QUESTION',
          badge: 'À VOUS LA PAROLE 🗣️',
          headline: 'Vous jouez plutôt en duel ou à 4 joueurs ?',
          mainText: 'Le tête-à-tête ultra tactique ou la grande table animée entre amis ? Dites-nous votre format préféré !',
          options: ['Option A : Le Duel intense (1 vs 1)', 'Option B : La Table à 4 conviviale'],
          ctaText: 'Donne ton avis en commentaire 👇',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins le débat`,
          postCaption: `🗣️ QUESTION À LA COMMUNAUTÉ NJAMBO !\n\nDans Katika, chaque format a son ambiance :\n\n⚔️ Option A : Le duel 1 vs 1 (rapide, sans pitié, ultra stratégique)\n👥 Option B : La table à 4 (bluffs croisés, convivialité et rebondissements)\n\nVous êtes plutôt team Duel ou team Table à 4 ? Votez en commentaire avec un A ou un B ! 🃏👇\n\n🎮 Lance ta table : ${NJAMBO_APP_URL}\n💬 Participe au débat sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🗣️ *DEBAT NJAMBO DU JOUR !* 🇨🇲\n\nDuel 1 vs 1 ultra tactique ⚔️ ou Table à 4 conviviale 👥 ?\n\n👉 *Viens jouer ton format préféré :* ${NJAMBO_APP_URL}\n💬 *Vote sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Sondage', '#DebatNjambo', '#Communaute', '#VotreAvis', '#JeuxDeCartes'],
        };

      default:
        return {
          theme,
          badge: SOCIAL_THEMES_CONFIG[theme]?.badge || 'NJAMBO KORA 🃏',
          headline: SOCIAL_THEMES_CONFIG[theme]?.defaultHeadline || 'Prêt pour le Kora ?',
          mainText: 'Rejoignez la table de cartes la plus palpitante du Cameroun en ligne.',
          ctaText: 'Joue gratuitement • Lien en bio',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🃏 NJAMBO KORA — Le jeu de cartes du Mboa !\n\nVenez tester vos réflexes et vos tactiques en direct sur PC et mobile.\n\n🎮 ${NJAMBO_APP_URL}\n💬 ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🃏 *NJAMBO KORA EN LIGNE !* 🇨🇲\n\n👉 ${NJAMBO_APP_URL}`,
          hashtags: ['#NjamboKora', '#CamerounGaming'],
        };
    }
  };

  const getThemeIcon = (theme: SocialVisualTheme) => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return <BarChart3 className="w-4 h-4 text-emerald-400" />;
      case 'TESTIMONIAL':
        return <Quote className="w-4 h-4 text-amber-400" />;
      case 'TIP_OR_RULE':
        return <HelpCircle className="w-4 h-4 text-cyan-400" />;
      case 'MEME_OR_PUNCHLINE':
        return <Sparkles className="w-4 h-4 text-orange-400" />;
      case 'TOURNAMENT_ANNOUNCEMENT':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'LEADERBOARD_PODIUM':
        return <Trophy className="w-4 h-4 text-yellow-400" />;
      case 'TACTICAL_PUZZLE':
        return <HelpCircle className="w-4 h-4 text-blue-400" />;
      case 'CAROUSEL_SLIDE':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'COMMUNITY_QUESTION':
        return <MessageSquare className="w-4 h-4 text-pink-400" />;
      case 'BEFORE_AFTER':
        return <Layers className="w-4 h-4 text-indigo-400" />;
      case 'JOIN_INVITATION':
        return <UserPlus className="w-4 h-4 text-blue-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  const handleSelectTheme = (t: SocialVisualTheme) => {
    setSelectedTheme(t);
    setPreviewCard(getInstantTemplate(t));
  };

  const handleAskAiForTheme = (t: SocialVisualTheme) => {
    const cfg = SOCIAL_THEMES_CONFIG[t] || SOCIAL_THEMES_CONFIG.STAT_OF_THE_WEEK;
    let prompt = `📱 **GÉNÉRATION VISUEL RÉSEAUX SOCIAUX — ${cfg.label.toUpperCase()}** :\n`;
    prompt += `${cfg.promptExample}\n\n`;
    prompt += `Consignes :\n`;
    prompt += `1. Rédige une courte accroche d'introduction.\n`;
    prompt += `2. Inclus le bloc JSON complet dans un bloc \`\`\`json { ... } \`\`\` avec le thème "${t}", le badge, le headline, mainText, le texte du post (postCaption) avec émojis et hashtags pertinents.`;

    if (t === 'STAT_OF_THE_WEEK' && metricsSnapshot) {
      prompt += `\n3. Appuie-toi sur les chiffres réels de l'instantané (Total manches : ${totalManches}, Kora : ${koraCount}, Joueurs : ${connectedPlayers}).`;
    }

    onSendToAi(prompt);
    onClose();
  };

  const activeCardData = previewCard || getInstantTemplate(selectedTheme);

  // Filter themes based on active category filter
  const allThemesList = Object.keys(SOCIAL_THEMES_CONFIG) as SocialVisualTheme[];
  const displayedThemes = selectedCategory === 'ALL'
    ? allThemesList
    : selectedCategory === 'STARS'
    ? STAR_VISUAL_CATEGORIES.map((c) => c.theme)
    : allThemesList.filter((t) => {
        const star = STAR_VISUAL_CATEGORIES.find((c) => c.id === selectedCategory);
        return star ? star.theme === t : true;
      });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Studio de Visuels Réseaux Sociaux</h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Génération Instantanée 1-Clic
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Créez, personnalisez et téléchargez vos affiches HD 1080p prêtes à publier pour WhatsApp, Instagram et Facebook
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Fermer le studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Segmented Category Control (Frictionless 1-Click Filter) */}
        <div className="px-5 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <span>Types :</span>
          </span>

          {STAR_VISUAL_CATEGORIES.map((cat) => {
            const isActive = selectedTheme === cat.theme;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectTheme(cat.theme)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL' && !STAR_VISUAL_CATEGORIES.some((c) => c.theme === selectedTheme)
                ? 'bg-slate-800 text-white border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>+ Autres ({allThemesList.length - STAR_VISUAL_CATEGORIES.length})</span>
          </button>
        </div>

        {/* Modal Content: Left Theme Cards Picker + Right Live Studio */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
          {/* Left Column: Quick Theme Cards with Direct 1-Click Triggers */}
          <div className="lg:col-span-5 flex flex-col space-y-2.5 max-h-[600px] overflow-hidden">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between shrink-0 px-1">
              <span>Choisir le style d'affiche</span>
              <span className="text-[10px] text-amber-400 font-mono">1 clic = aperçu instantané</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {displayedThemes.map((themeKey) => {
                const cfg = SOCIAL_THEMES_CONFIG[themeKey] || {
                  label: themeKey,
                  badge: 'NJAMBO',
                  promptExample: 'Visuel Njambo Kora',
                };
                const isSelected = selectedTheme === themeKey;

                return (
                  <div
                    key={themeKey}
                    onClick={() => handleSelectTheme(themeKey)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 select-none ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/70 shadow-lg ring-1 ring-amber-500/40'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {getThemeIcon(themeKey)}
                        </div>
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300 font-extrabold' : 'text-slate-200'}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-slate-400 shrink-0">
                        {cfg.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                      {cfg.promptExample}
                    </p>

                    {/* Quick AI Trigger */}
                    <div className="pt-1 flex items-center justify-between text-[10px]">
                      <span className={`flex items-center gap-1 font-medium ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                        {isSelected ? <CheckCircle2 className="w-3 h-3 text-amber-400" /> : <Flame className="w-3 h-3 text-slate-500" />}
                        <span>{isSelected ? 'Prêt à l’écran' : 'Cliquer pour charger'}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAskAiForTheme(themeKey);
                        }}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1 transition cursor-pointer"
                        title="Demander à Gemini d'adapter ce thème avec vos instructions"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Créer avec Gemini</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Interactive Preview & Instant 1-Click Operations */}
          <div className="lg:col-span-7 flex flex-col space-y-2 max-h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between shrink-0 px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Aperçu HD du visuel</span>
              </span>
              <button
                type="button"
                onClick={() => handleAskAiForTheme(selectedTheme)}
                className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Personnaliser avec Gemini</span>
              </button>
            </div>

            {/* Live Interactive Canvas Card */}
            {selectedTheme === 'TACTICAL_PUZZLE' && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Situations Réalistes à Risques (1v1 & 3 Joueurs) :</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Table épurée</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {[
                    { id: 'ANTI_KORA_ESCAPE' as RealisticRiskScenarioType, label: '⚡ Alerte Kora (4-0)' },
                    { id: 'CLASH_FINAL_2_2' as RealisticRiskScenarioType, label: '🔥 Tour 5 Décisif (2-2)' },
                    { id: 'OVERTRUMP_TRAP' as RealisticRiskScenarioType, label: '🧠 Piège du 4e Tour' },
                    { id: 'DISCARD_DILEMMA' as RealisticRiskScenarioType, label: '⚠️ Défausse Critique' },
                    { id: 'THREE_PLAYERS_SANDWICH' as RealisticRiskScenarioType, label: '⚔️ Table 3 Joueurs' },
                  ].map((sc) => {
                    const isSelected = selectedScenario === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          setSelectedScenario(sc.id);
                          setPreviewCard(createRealisticNjamboPuzzleScenario(sc.id));
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm font-extrabold ring-1 ring-amber-400'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex-1">
              <KatikaSocialCardPreview
                data={activeCardData}
                onRegenerate={() => setPreviewCard(getInstantTemplate(selectedTheme, selectedScenario))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
