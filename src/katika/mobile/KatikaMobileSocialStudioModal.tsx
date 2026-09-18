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
  Share2,
  Copy,
  Check,
  Flame,
} from 'lucide-react';
import {
  SocialVisualTheme,
  SocialVisualCardData,
  SOCIAL_THEMES_CONFIG,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
} from '../types/socialVisuals';
import { KatikaSocialCardPreview } from '../components/social/KatikaSocialCardPreview';

interface KatikaMobileSocialStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToAi: (prompt: string) => void;
  metricsSnapshot?: any;
}

export const KatikaMobileSocialStudioModal: React.FC<KatikaMobileSocialStudioModalProps> = ({
  isOpen,
  onClose,
  onSendToAi,
  metricsSnapshot,
}) => {
  const [selectedTheme, setSelectedTheme] = useState<SocialVisualTheme>('STAT_OF_THE_WEEK');
  const [previewCard, setPreviewCard] = useState<SocialVisualCardData | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);

  if (!isOpen) return null;

  const totalManches = metricsSnapshot?.summary?.totalManches ?? 142;
  const koraCount = metricsSnapshot?.kpis?.allTime?.koraCount ?? 38;

  // Instant template data generator with real metrics
  const getInstantTemplate = (theme: SocialVisualTheme): SocialVisualCardData => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return {
          theme: 'STAT_OF_THE_WEEK',
          badge: 'CHIFFRE DE LA SEMAINE 🃏',
          headline: `${totalManches} manches disputées cette semaine !`,
          mainText: `Les Maîtres du Kora ont fait trembler la table avec ${koraCount} Kora spectaculaires validés sur Katika.`,
          highlightMetric: {
            value: String(totalManches),
            label: 'Parties disputées',
            sublabel: `avec ${koraCount} Kora décisifs enregistrés`,
          },
          ctaText: 'Rejoins les Maîtres du Kora • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nC'est le grand bilan de l'arène : cette semaine, pas moins de ${totalManches} manches ont été disputées par nos joueurs !\n\nAu total, ${koraCount} Kora ont retourné des donnes in extremis au 5e tour. Bravo aux stratèges qui ont osé poser l'As au bon moment !\n\n👉 Vous étiez de la partie ? Combien de Kora avez-vous validés cette semaine ? Dites-le-nous en commentaire !\n\n🎮 Lien du jeu 100% gratuit (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\n*${totalManches} manches* jouées et *${koraCount} Kora* spectaculaires !\n\n👉 *Joue gratuitement en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
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
          ctaText: 'Viens tester ton niveau • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `🎙️ LA PAROLE DU JOUEUR DU JOUR !\n\n« Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. » — Maître Serge_237.\n\nC'est cette tension, ce bluff et ce respect du jeu qui font la légende du Njambo Kora.\n\n🎮 Viens défier les maîtres : ${NJAMBO_APP_URL}\n💬 Rejoins notre communauté WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🎙️ *PAROLE DE MAÎTRE AU NJAMBO !* 🇨🇲\n\n« Quand tu places le Double Kora au 5e tour, la table entière se tait. »\n\n👉 *Joue maintenant :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#CitationJoueur', '#DoubleKora', '#JeuxTraditionnels'],
        };

      case 'BEFORE_AFTER':
        return {
          theme: 'BEFORE_AFTER',
          badge: 'ÉVOLUTION DU JEU ⚡',
          headline: 'Une fluidité de donne inédite',
          mainText: 'Avant vs Maintenant : des donnes plus rapides, une détection Kora instantanée et des effets de jetons animés.',
          comparison: {
            beforeTitle: 'Avant',
            beforeText: 'Temps de réflexion figé, sans retour visuel dynamique sur les tours.',
            afterTitle: 'Maintenant dans Katika ⚡',
            afterText: 'Timer adaptatif, distribution streamée et alerte Kora Hunter en direct.',
          },
          ctaText: 'Découvre la nouvelle version • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins la bêta`,
          postCaption: `⚡ COULISSES & AMÉLIORATIONS NJAMBO KORA !\n\nGrâce aux retours des joueurs, le moteur de jeu vient de franchir un cap :\n\n✅ Donnes ultra-fluides avec animations soignées\n✅ Détection instantanée du Kora et du Double Kora\n✅ Sons immersifs de la table et des jetons\n\nVenez tester dès maintenant sur votre téléphone ou PC ! 👇\n🎮 ${NJAMBO_APP_URL}\n💬 Donne tes impressions sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `⚡ *NOUVELLE MISE À JOUR NJAMBO KORA !* 🇨🇲\n\nPlus fluide, plus rapide, animations et sons immersifs !\n\n👉 *Teste en direct :* ${NJAMBO_APP_URL}\n💬 *Rejoins la bêta sur WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Coulisses', '#MiseAJour', '#GameDesign', '#NjamboKora', '#GamingAfrica'],
        };

      case 'TIP_OR_RULE':
        return {
          theme: 'TIP_OR_RULE',
          badge: 'ASTUCE STRATÉGIQUE 💡',
          headline: 'Le secret du Kora au 5e tour',
          mainText: 'Ne brûle jamais ton As dès le 2e tour si tu soupçonnes un Double Kora adverse. Garde le contrôle de la couleur demandée jusqu’au bout !',
          ctaText: 'Pratique ton bluff dès maintenant',
          linkUrl: `${NJAMBO_DOMAIN} • Astuces`,
          postCaption: `💡 ASTUCE DE MAÎTRE : Le piège du 5e tour !\n\nBeaucoup de débutants se précipitent et gaspillent leurs cartes maîtresses dès l'entame. Erreur fatale ! Au Njambo Kora, remporter le 5e tour nécessite de compter les atouts et d'anticiper la couleur menée.\n\n🎮 Joue gratuitement en ligne : ${NJAMBO_APP_URL}\n💬 Échange tes tactiques sur notre groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `💡 *ASTUCE NJAMBO DU JOUR !* 🇨🇲\n\nNe brûle jamais ton As trop tôt ! Prépare le 5e tour décisif.\n\n👉 *Lien du jeu :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#AstuceKora', '#StrategieCartes', '#GamingAfrique'],
        };

      case 'CULTURE_NJAMBO':
        return {
          theme: 'CULTURE_NJAMBO',
          badge: 'CULTURE & TRADITION 🇨🇲',
          headline: 'Le Njambo : Bien plus qu’un jeu de cartes',
          mainText: 'Né au cœur des quartiers de Yaoundé et Douala, le Njambo Kora est une véritable joute d’esprit, de bravoure et de convivialité intergénérationnelle.',
          ctaText: 'Fais vivre la tradition en ligne',
          linkUrl: `${NJAMBO_DOMAIN} • Tradition 237`,
          postCaption: `🇨🇲 LE NJAMBO KORA : UN PATRIMOINE VIVANT !\n\nAutour d'une table en bois, sous une véranda ou lors des grandes veillées, le Njambo a toujours rassemblé les passionnés de cartes. Aujourd'hui, Katika numérise fidèlement chaque subtilité de ce trésor camerounais !\n\n🎮 Joue au Njambo en ligne : ${NJAMBO_APP_URL}\n💬 Communauté WhatsApp officielle : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🇨🇲 *LE NJAMBO KORA, FIERTÉ DU MBOA !* 🃏\n\nRetrouve les sensations authentiques de nos tables de quartier !\n\n👉 *Joue gratuitement :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#CultureCamerounaise', '#PatrimoineAfricain', '#Fierte237'],
        };

      case 'HIGHLIGHT_MOMENT':
        return {
          theme: 'HIGHLIGHT_MOMENT',
          badge: 'ACTION DE LÉGENDE 🏆',
          headline: 'Le Double Kora qui a retourné la table !',
          mainText: 'Mené au score, ce joueur n\'a rien lâché et a verrouillé la donne avec un Double Kora magistral au 5e tour !',
          ctaText: 'Toi aussi tente le coup parfait • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Moment fort`,
          postCaption: `🏆 COUP DE MAÎTRE DANS L'ARÈNE !\n\nCertains tours restent gravés dans les mémoires : mené au score, ce joueur n'a rien lâché et a verrouillé la donne avec un Double Kora magistral !\n\n🎮 Tente le coup parfait en ligne : ${NJAMBO_APP_URL}\n💬 Partage tes plus beaux tours sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *COUP DE MAÎTRE DANS L'ARÈNE !* 🇨🇲\n\nMené au score, il claque un Double Kora au 5e tour et rafle la mise !\n\n👉 *Viens défier la table :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#MomentFort', '#DoubleKora', '#Remontada', '#NjamboKora', '#Victoire'],
        };

      case 'COMMUNITY_QUESTION':
        return {
          theme: 'COMMUNITY_QUESTION',
          badge: 'À VOUS LA PAROLE 🗣️',
          headline: 'Vous jouez plutôt en duel ou à 4 joueurs ?',
          mainText: 'Le tête-à-tête ultra tactique ou la grande table animée entre amis ? Dites-nous votre format préféré !',
          options: ['En duel 1v1 ultra tactique', 'À 4 joueurs sur table animée'],
          ctaText: 'Donne ton avis en commentaire',
          linkUrl: `${NJAMBO_DOMAIN} • Sondage`,
          postCaption: `🗣️ QUESTION À LA COMMUNAUTÉ NJAMBO !\n\nAu Njambo Kora, chaque format a ses adeptes :\n\n1️⃣ Le duel 1v1 : où chaque tour est une guerre psychologique directe.\n2️⃣ La table à 4 : ambiance surchauffée, feintes et chambrages bon enfant.\n\nVous êtes plutôt quelle école ? Votez en commentaire ! 💬\n\n🎮 Joue ton format préféré : ${NJAMBO_APP_URL}\n💬 Participe au sondage sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🗣️ *QUESTION À LA COMMUNAUTÉ !* 🇨🇲\n\nPlutôt duel 1v1 intense ou table à 4 surchauffée ?\n\n👉 *Lance une partie :* ${NJAMBO_APP_URL}\n💬 *Donne ton avis sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#DebatNjambo', '#CommunauteGaming', '#Sondage', '#Cameroun'],
        };

      case 'JOIN_INVITATION':
        return {
          theme: 'JOIN_INVITATION',
          badge: 'NJAMBO KORA LIVE 🔥',
          headline: 'Arène de cartes 100% en direct !',
          mainText: 'Rejoignez la table multijoueur dès aujourd’hui et défiez les maîtres du pays en temps réel.',
          ctaText: 'Jouer gratuitement en ligne',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins-nous`,
          postCaption: `🔥 Rejoins les tables de Njambo Kora en ligne ! Défie tes amis en direct sur mobile ou ordinateur :\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🔥 *REJOINS LES TABLES DE NJAMBO KORA EN LIGNE !* 🇨🇲\n\nJoue directement sur ton téléphone ou PC, sans installation !\n\n👉 *Lien du jeu :* ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#JeuEnLigne', '#Kora', '#AfriqueGaming'],
        };

      case 'TOURNAMENT_ANNOUNCEMENT':
        return {
          theme: 'TOURNAMENT_ANNOUNCEMENT',
          badge: 'GRAND TOURNOI NJAMBO 🏆',
          headline: 'Le Grand Clash du Samedi Soir',
          mainText: 'Affrontez les meilleurs maîtres dans une arène sans pitié ! 100 000 jetons de cagnotte.',
          palette: 'EBONY_GOLD',
          eventDetails: {
            date: 'Samedi • 21h00',
            prizePool: '100 000 Jetons',
            mode: 'Table à 4 • Élimination',
            spotsRemaining: '32 Places',
          },
          ctaText: 'Inscris-toi • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🏆 GRAND TOURNOI NJAMBO DU WEEK-END ! 🇨🇲\n\nCagnotte de 100 000 jetons virtuels. 32 places max !\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Inscriptions sur le groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *TOURNOI NJAMBO SAMEDI 21H !* 🇨🇲\n\n100 000 jetons en jeu ! Rejoins la table :\n👉 ${NJAMBO_APP_URL}\n💬 *Inscriptions sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Cinematic 8k photography of a card game trophy tournament table, Ndop gold details, volumetric dramatic lighting.`,
          hashtags: ['#TournoiNjambo', '#CashPrize', '#DoubleKora'],
        };

      case 'TACTICAL_PUZZLE':
        return {
          theme: 'TACTICAL_PUZZLE',
          badge: 'CASSE-TÊTE DU JOUR 🧩',
          headline: 'Tour 4 : Quel coup sauve la donne ?',
          mainText: 'L’adversaire abat le 8♥. Quelle carte joues-tu pour bloquer son Kora ?',
          palette: 'ROYAL_SAPPHIRE',
          puzzleCards: [
            { rank: 'V', suit: '♠', label: 'OPTION A' },
            { rank: '7', suit: '♣', label: 'OPTION B', isBestMove: true },
            { rank: 'A', suit: '♦', label: 'OPTION C' },
          ],
          ctaText: 'Donne ton choix en commentaire 👇',
          linkUrl: `${NJAMBO_DOMAIN} • Défi Tactique`,
          postCaption: `🧩 CASSE-TÊTE DU JOUR : Quel coup joues-tu au 4e tour ? Vote A, B ou C ! 👇\n\n🎮 Teste la situation en direct : ${NJAMBO_APP_URL}\n💬 Débats avec nous sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🧩 *DÉFI TACTIQUE NJAMBO !* 🇨🇲\n\nQuelle carte abats-tu au 4e tour ? Teste en direct :\n👉 ${NJAMBO_APP_URL}\n💬 *Débats la solution sur WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Close-up shot of three vintage playing cards on blue felt table with golden dramatic rim lighting.`,
          hashtags: ['#CasseTeteNjambo', '#TactiqueDuJour'],
        };

      case 'MEME_OR_PUNCHLINE':
        return {
          theme: 'MEME_OR_PUNCHLINE',
          badge: 'HUMOUR NJAMBO 😂',
          headline: '« Je n’ai pas d’atout, je joue au hasard... »',
          mainText: 'Le gars qui te dit qu’il n’a rien, et qui te claque un Double Kora sec au 5e tour !',
          palette: 'SUNSET_TERRACOTTA',
          ctaText: 'Identifie ce menteur 🤣',
          linkUrl: `${NJAMBO_DOMAIN} • Humour 237`,
          postCaption: `😂 On a tous ce joueur à la table ! Tague ton pote en commentaire ! 🃏👇\n\n🎮 Joue gratuitement au Njambo : ${NJAMBO_APP_URL}\n💬 Rejoins les délires sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `😂 « Je n’ai pas d'atout... » et BAM Double Kora sec au 5e tour ! 🃏🤣\n\n👉 *Viens jouer :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Funny candid high contrast portrait of smiling African man revealing a winning card under wooden table, evening lights.`,
          hashtags: ['#NjamboMeme', '#HumourCameroun'],
        };

      case 'CAROUSEL_SLIDE':
      default:
        return {
          theme: 'CAROUSEL_SLIDE',
          badge: 'GUIDE TACTIQUE 📚 (1/3)',
          headline: 'Ne Subis Plus Jamais de Kora',
          mainText: 'Règle #1 : La mémorisation des tours. Compte toujours les atouts tombés.',
          palette: 'EMERALD_GOLD',
          carouselStep: {
            current: 1,
            total: 3,
            stepTitle: 'La Mémorisation',
          },
          ctaText: 'Glisse pour la suite ➔',
          linkUrl: `${NJAMBO_DOMAIN} • Guide`,
          postCaption: `📚 Guide express pour maîtriser le Njambo Kora ! Glisse pour lire la suite ! 🃏\n\n🎮 Entraîne-toi dès maintenant : ${NJAMBO_APP_URL}\n💬 Astuces sur le groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `📚 *ASTUCE NJAMBO :* Compte toujours les atouts tombés aux 3 premiers tours !\n\n👉 *Viens t'entraîner gratuitement :* ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Modern minimalist African graphic card poster, geometric Ndop border, golden accents.`,
          hashtags: ['#GuideNjambo', '#CamerounGaming'],
        };
    }
  };

  const activeCardData = previewCard || getInstantTemplate(selectedTheme);

  const getThemeIcon = (theme: SocialVisualTheme) => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return <BarChart3 className="w-3.5 h-3.5" />;
      case 'TESTIMONIAL':
        return <Quote className="w-3.5 h-3.5" />;
      case 'BEFORE_AFTER':
        return <Layers className="w-3.5 h-3.5" />;
      case 'TIP_OR_RULE':
        return <HelpCircle className="w-3.5 h-3.5" />;
      case 'CULTURE_NJAMBO':
        return <Flame className="w-3.5 h-3.5" />;
      case 'HIGHLIGHT_MOMENT':
        return <Trophy className="w-3.5 h-3.5" />;
      case 'COMMUNITY_QUESTION':
        return <MessageSquare className="w-3.5 h-3.5" />;
      case 'JOIN_INVITATION':
        return <UserPlus className="w-3.5 h-3.5" />;
      case 'TOURNAMENT_ANNOUNCEMENT':
        return <Trophy className="w-3.5 h-3.5 text-amber-400" />;
      case 'TACTICAL_PUZZLE':
        return <HelpCircle className="w-3.5 h-3.5 text-blue-400" />;
      case 'MEME_OR_PUNCHLINE':
        return <Sparkles className="w-3.5 h-3.5 text-orange-400" />;
      case 'CAROUSEL_SLIDE':
        return <Layers className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  const handleSelectTheme = (theme: SocialVisualTheme) => {
    setSelectedTheme(theme);
    setPreviewCard(getInstantTemplate(theme));
  };

  const handleAskAiForTheme = (theme: SocialVisualTheme) => {
    const cfg = SOCIAL_THEMES_CONFIG[theme];
    const prompt = `Génère un visuel pour réseaux sociaux sur le thème '${cfg.label}' (${cfg.badge}). Utilise les statistiques actuelles de la plateforme. Retourne UNIQUEMENT le JSON de la carte visuelle.`;
    onSendToAi(prompt);
    onClose();
  };

  const handleCopyCaption = () => {
    if (!activeCardData.postCaption) return;
    const fullText = `${activeCardData.postCaption}\n\n${(activeCardData.hashtags || []).join(' ')}`;
    navigator.clipboard.writeText(fullText).catch(() => {});
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/95 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Studio Visuels Réseaux</h2>
              <p className="text-[10px] text-slate-400">Créez & exportez vos posts officiels</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Theme Horizontal Selector */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Choisir un thème de post
            </span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {(Object.keys(SOCIAL_THEMES_CONFIG) as SocialVisualTheme[]).map((themeKey) => {
                const cfg = SOCIAL_THEMES_CONFIG[themeKey];
                const isSelected = selectedTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => handleSelectTheme(themeKey)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    {getThemeIcon(themeKey)}
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Customization Button */}
          <button
            type="button"
            onClick={() => handleAskAiForTheme(selectedTheme)}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Personnaliser ce post avec Gemini IA</span>
          </button>

          {/* Interactive Card Canvas Preview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-2 overflow-hidden">
            <KatikaSocialCardPreview
              data={activeCardData}
              onRegenerate={() => setPreviewCard(getInstantTemplate(selectedTheme))}
            />
          </div>

          {/* Caption & Copy section */}
          {activeCardData.postCaption && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">Texte prêt à publier</span>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCaption ? 'Copié !' : 'Copier'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 whitespace-pre-line line-clamp-4 font-sans leading-relaxed">
                {activeCardData.postCaption}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
