import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Copy,
  Check,
  Share2,
  Square,
  Smartphone,
  Sparkles,
  Edit3,
  RefreshCw,
  Image as ImageIcon,
  MessageSquare,
  Package,
  ChevronDown,
  ChevronUp,
  Monitor,
  Palette,
  ExternalLink,
  SlidersHorizontal,
  Plus,
  Trash2,
  Layout,
  HelpCircle,
  Layers,
  Dices,
  Globe,
  Share,
} from 'lucide-react';
import {
  SocialVisualCardData,
  SocialVisualFormat,
  SocialVisualPalette,
  SocialPlatform,
  TacticalLayout,
  SOCIAL_THEMES_CONFIG,
  SOCIAL_PLATFORMS_CONFIG,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
  NJAMBO_SUITS_INFO,
  VALID_NJAMBO_RANKS,
  NjamboRank,
  NjamboSuit,
  sanitizeNjamboCard,
  generateRandomNjamboCards,
  getFormattedCaptionForPlatform,
} from '../../types/socialVisuals';
import {
  renderSocialVisualToCanvas,
  downloadSocialVisualPng,
} from '../../utils/socialVisualCanvasRenderer';
import { CopilotSettingsService } from '../../services/copilotSettingsService';

interface KatikaSocialCardPreviewProps {
  data: SocialVisualCardData;
  onRegenerate?: () => void;
}

export const KatikaSocialCardPreview: React.FC<KatikaSocialCardPreviewProps> = ({
  data: initialData,
  onRegenerate,
}) => {
  const [copilotSettings, setCopilotSettings] = useState(() =>
    CopilotSettingsService.getSettings()
  );

  const activeAppUrl = copilotSettings.socialLinks?.appUrl || NJAMBO_APP_URL;
  const activeWhatsAppUrl = copilotSettings.socialLinks?.whatsappUrl || NJAMBO_WHATSAPP_GROUP_URL;
  const activeDomain = activeAppUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Determine initial inclusion based on theme or configured strategy
  const getInitialInclusion = (type: 'app' | 'whatsapp'): boolean => {
    if (type === 'app' && typeof initialData.includeAppUrl === 'boolean') {
      return initialData.includeAppUrl;
    }
    if (type === 'whatsapp' && typeof initialData.includeWhatsAppUrl === 'boolean') {
      return initialData.includeWhatsAppUrl;
    }
    const strategy = copilotSettings.defaultLinkStrategy || 'AUTO';
    if (strategy === 'APP_ONLY') return type === 'app';
    if (strategy === 'WHATSAPP_ONLY') return type === 'whatsapp';
    if (strategy === 'BOTH') return true;
    // AUTO strategy
    if (type === 'app') return true;
    return ['TOURNAMENT_ANNOUNCEMENT', 'COMMUNITY_QUESTION', 'MEME_OR_PUNCHLINE', 'JOIN_INVITATION'].includes(
      initialData.theme
    );
  };

  const [includeApp, setIncludeApp] = useState<boolean>(() => getInitialInclusion('app'));
  const [includeWhatsApp, setIncludeWhatsApp] = useState<boolean>(() => getInitialInclusion('whatsapp'));

  const [data, setData] = useState<SocialVisualCardData>(() => ({
    ...initialData,
    tacticalLayout: initialData.tacticalLayout || 'DILEMMA_3',
    puzzleCards: (initialData.puzzleCards && initialData.puzzleCards.length > 0)
      ? initialData.puzzleCards.map((c) => ({ ...c, ...sanitizeNjamboCard(c.rank, c.suit) }))
      : [
          { rank: '10', suit: '♥', label: 'OPTION A', isBestMove: false },
          { rank: '7', suit: '♣', label: 'OPTION B', isBestMove: true },
          { rank: '9', suit: '♠', label: 'OPTION C', isBestMove: false },
        ],
    customAppUrl: activeAppUrl,
    customWhatsAppUrl: activeWhatsAppUrl,
    includeAppUrl: getInitialInclusion('app'),
    includeWhatsAppUrl: getInitialInclusion('whatsapp'),
  }));

  useEffect(() => {
    const unsub = CopilotSettingsService.subscribe((newSettings) => {
      setCopilotSettings(newSettings);
    });
    return unsub;
  }, []);

  const [format, setFormat] = useState<SocialVisualFormat>(initialData.format || 'SQUARE');
  const [palette, setPalette] = useState<SocialVisualPalette>(
    initialData.palette ||
      (initialData.theme === 'TOURNAMENT_ANNOUNCEMENT'
        ? 'EBONY_GOLD'
        : initialData.theme === 'CULTURE_NJAMBO' || initialData.theme === 'MEME_OR_PUNCHLINE'
        ? 'SUNSET_TERRACOTTA'
        : initialData.theme === 'TACTICAL_PUZZLE'
        ? 'ROYAL_SAPPHIRE'
        : 'EMERALD_GOLD')
  );
  const [tacticalLayout, setTacticalLayout] = useState<TacticalLayout>(
    initialData.tacticalLayout || 'DILEMMA_3'
  );
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform>('WHATSAPP');
  const [copiedPlatform, setCopiedPlatform] = useState<SocialPlatform | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPromptDrawer, setShowPromptDrawer] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [downloadingPack, setDownloadingPack] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getActiveCaptionForPlatform = (platform: SocialPlatform): string => {
    return getFormattedCaptionForPlatform(
      {
        ...data,
        customAppUrl: activeAppUrl,
        customWhatsAppUrl: activeWhatsAppUrl,
        includeAppUrl: includeApp,
        includeWhatsAppUrl: includeWhatsApp,
      },
      platform
    );
  };

  const handleCopyForPlatform = (platform: SocialPlatform) => {
    try {
      const text = getActiveCaptionForPlatform(platform);
      navigator.clipboard.writeText(text.trim());
      setCopiedPlatform(platform);
      setTimeout(() => setCopiedPlatform(null), 2200);
    } catch (e) {
      console.warn('Failed to copy text for platform:', platform, e);
    }
  };

  useEffect(() => {
    setData((prev) => ({
      ...initialData,
      tacticalLayout: initialData.tacticalLayout || prev.tacticalLayout || tacticalLayout,
      puzzleCards: (initialData.puzzleCards && initialData.puzzleCards.length > 0)
        ? initialData.puzzleCards.map((c) => ({ ...c, ...sanitizeNjamboCard(c.rank, c.suit) }))
        : prev.puzzleCards,
      customAppUrl: activeAppUrl,
      customWhatsAppUrl: activeWhatsAppUrl,
      includeAppUrl: includeApp,
      includeWhatsAppUrl: includeWhatsApp,
    }));
    if (initialData.format) setFormat(initialData.format);
  }, [initialData, activeAppUrl, activeWhatsAppUrl]);

  // Re-render canvas whenever data, format, palette or link toggles change
  useEffect(() => {
    if (canvasRef.current) {
      renderSocialVisualToCanvas(
        canvasRef.current,
        {
          ...data,
          palette,
          tacticalLayout,
          customAppUrl: activeAppUrl,
          customWhatsAppUrl: activeWhatsAppUrl,
          includeAppUrl: includeApp,
          includeWhatsAppUrl: includeWhatsApp,
        },
        format
      );
    }
  }, [data, format, palette, tacticalLayout, includeApp, includeWhatsApp, activeAppUrl, activeWhatsAppUrl]);

  // Helper to build links block based on selected toggles
  const buildLinksText = (type: 'post' | 'whatsapp') => {
    const lines: string[] = [];
    if (includeApp) {
      if (type === 'whatsapp') {
        lines.push(`👉 *Joue au Njambo en ligne :* ${activeAppUrl}`);
      } else {
        lines.push(`🎮 Jouer en ligne : ${activeAppUrl}`);
      }
    }
    if (includeWhatsApp) {
      if (type === 'whatsapp') {
        lines.push(`💬 *Rejoins la communauté WhatsApp :* ${activeWhatsAppUrl}`);
      } else {
        lines.push(`💬 Groupe WhatsApp officiel : ${activeWhatsAppUrl}`);
      }
    }
    return lines.join('\n');
  };

  const handleCopyCaption = () => {
    try {
      const linksBlock = buildLinksText('post');
      const cleanBase = data.postCaption
        .replace(/https?:\/\/njambo-kora\.ai\.studio[^\s]*/g, '')
        .replace(/https?:\/\/chat\.whatsapp\.com[^\s]*/g, '')
        .trim();

      const fullText = [cleanBase, linksBlock, (data.hashtags || []).join(' ')]
        .filter(Boolean)
        .join('\n\n');

      navigator.clipboard.writeText(fullText.trim());
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2200);
    } catch (e) {
      console.warn('Failed to copy caption:', e);
    }
  };

  const handleCopyWhatsApp = () => {
    try {
      const linksBlock = buildLinksText('whatsapp');
      let baseText = data.whatsAppMessage;
      if (baseText) {
        baseText = baseText
          .replace(/👉 \*Joue au Njambo en ligne :\* [^\n]*/g, '')
          .replace(/💬 \*Rejoins notre groupe WhatsApp officiel :\* [^\n]*/g, '')
          .replace(/💬 \*Rejoins la communauté WhatsApp :\* [^\n]*/g, '')
          .replace(/https?:\/\/njambo-kora\.ai\.studio[^\s]*/g, '')
          .replace(/https?:\/\/chat\.whatsapp\.com[^\s]*/g, '')
          .trim();
      } else {
        baseText = `🃏 *${data.headline.toUpperCase()}* 🇨🇲\n\n${data.mainText}\n\n_Njambo Kora • Le jeu de cartes du Mboa_`;
      }

      const whatsAppText = [baseText, linksBlock].filter(Boolean).join('\n\n');

      navigator.clipboard.writeText(whatsAppText.trim());
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2200);
    } catch (e) {
      console.warn('Failed to copy WhatsApp message:', e);
    }
  };

  const handleCopyPrompt = () => {
    try {
      const promptText =
        data.aiImagePrompt ||
        `Cinematic high-end commercial poster for Njambo card game. Traditional Cameroonian card table in rich ebony wood and emerald felt, glowing golden playing cards floating with intricate African Ndop patterns, warm volumetric lighting, photorealistic, 8k, Unreal Engine 5 render.`;

      navigator.clipboard.writeText(promptText.trim());
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2200);
    } catch (e) {
      console.warn('Failed to copy prompt:', e);
    }
  };

  const handleDownload = () => {
    downloadSocialVisualPng(
      {
        ...data,
        palette,
        customAppUrl: activeAppUrl,
        customWhatsAppUrl: activeWhatsAppUrl,
        includeAppUrl: includeApp,
        includeWhatsAppUrl: includeWhatsApp,
      },
      format
    );
  };

  const handleDownloadMarketingPack = async () => {
    setDownloadingPack(true);
    try {
      // 1. Download Square
      downloadSocialVisualPng(
        {
          ...data,
          palette,
          customAppUrl: activeAppUrl,
          customWhatsAppUrl: activeWhatsAppUrl,
          includeAppUrl: includeApp,
          includeWhatsAppUrl: includeWhatsApp,
        },
        'SQUARE',
        `katika_pack_carre_${data.theme.toLowerCase()}.png`
      );

      // 2. Download Story with small delay to avoid browser blocking multiple downloads
      setTimeout(() => {
        downloadSocialVisualPng(
          {
            ...data,
            palette,
            customAppUrl: activeAppUrl,
            customWhatsAppUrl: activeWhatsAppUrl,
            includeAppUrl: includeApp,
            includeWhatsAppUrl: includeWhatsApp,
          },
          'STORY',
          `katika_pack_story_${data.theme.toLowerCase()}.png`
        );
        setDownloadingPack(false);
      }, 500);
    } catch {
      setDownloadingPack(false);
    }
  };

  const handleShare = async () => {
    if (!canvasRef.current) return;
    try {
      const linksBlock = buildLinksText('post');
      const cleanBase = data.postCaption
        .replace(/https?:\/\/njambo-kora\.ai\.studio[^\s]*/g, '')
        .replace(/https?:\/\/chat\.whatsapp\.com[^\s]*/g, '')
        .trim();

      const fullText = [data.headline, cleanBase, linksBlock, (data.hashtags || []).join(' ')]
        .filter(Boolean)
        .join('\n\n');

      if (navigator.share) {
        canvasRef.current.toBlob(async (blob) => {
          if (!blob) {
            handleDownload();
            return;
          }
          const file = new File([blob], `katika_${data.theme}.png`, { type: 'image/png' });
          const shareDataWithFile = {
            title: data.headline,
            text: fullText,
            files: [file],
          };

          if (navigator.canShare && navigator.canShare(shareDataWithFile)) {
            try {
              await navigator.share(shareDataWithFile);
              setShareSuccess(true);
              setTimeout(() => setShareSuccess(false), 2000);
              return;
            } catch (err: any) {
              if (err?.name === 'AbortError') return;
            }
          }

          try {
            await navigator.share({
              title: data.headline,
              text: fullText,
              url: NJAMBO_APP_URL,
            });
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 2000);
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
            handleDownload();
          }
        });
      } else {
        handleDownload();
        handleCopyCaption();
      }
    } catch {
      handleDownload();
    }
  };

  const themeConfig = SOCIAL_THEMES_CONFIG[data.theme] || SOCIAL_THEMES_CONFIG.STAT_OF_THE_WEEK;

  return (
    <div className="my-4 rounded-2xl border border-amber-500/40 bg-slate-950/95 shadow-2xl overflow-hidden text-slate-200 select-none">
      {/* Top Card Header: Clean & Informative */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-transparent border-b border-amber-500/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5 truncate">
              <span>{themeConfig.label}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                • {format === 'SQUARE' ? '1:1 Carré' : format === 'STORY' ? '9:16 Story' : '16:9 Bannière'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">{data.headline}</div>
          </div>
        </div>

        {/* Toggle Advanced Options / Customization */}
        <button
          type="button"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
          title="Modifier le format, l'ambiance ou les liens"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">{showAdvancedOptions ? 'Fermer options' : 'Options & Styles'}</span>
          {showAdvancedOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Main Visual Display & Direct 1-Click Actions */}
      <div className="p-4 flex flex-col items-center">
        {/* Quick Inline Format Switcher (Instant 1-Click) */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 max-w-md w-full">
          <span className="text-[10px] text-slate-400 font-semibold px-2 uppercase tracking-wider">Format :</span>
          <button
            type="button"
            onClick={() => setFormat('SQUARE')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              format === 'SQUARE'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Square className="w-3 h-3" />
            <span>1:1 Carré</span>
          </button>
          <button
            type="button"
            onClick={() => setFormat('STORY')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              format === 'STORY'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3 h-3" />
            <span>9:16 Story</span>
          </button>
          <button
            type="button"
            onClick={() => setFormat('BANNER')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              format === 'BANNER'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3 h-3" />
            <span>16:9 Bannière</span>
          </button>
        </div>

        {/* Tactical Quick Layout Bar (When theme is TACTICAL_PUZZLE) */}
        {data.theme === 'TACTICAL_PUZZLE' && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-blue-500/30 max-w-md w-full">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-blue-400 font-bold px-1.5">Vue :</span>
              <button
                type="button"
                onClick={() => setTacticalLayout('DILEMMA_3')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  tacticalLayout === 'DILEMMA_3' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3 Choix
              </button>
              <button
                type="button"
                onClick={() => setTacticalLayout('TABLE_FELT_LIVE')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  tacticalLayout === 'TABLE_FELT_LIVE' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tapis 4 Tours
              </button>
              <button
                type="button"
                onClick={() => setTacticalLayout('PLAYER_HAND_5')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  tacticalLayout === 'PLAYER_HAND_5' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Main de 5
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const count = tacticalLayout === 'PLAYER_HAND_5' ? 5 : tacticalLayout === 'TABLE_FELT_LIVE' ? 4 : 3;
                const newCards = generateRandomNjamboCards(count);
                setData((prev) => ({
                  ...prev,
                  puzzleCards: newCards,
                }));
              }}
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1 transition cursor-pointer"
              title="Générer de nouvelles cartes de Njambo aléatoires et valides"
            >
              <Dices className="w-3 h-3 text-amber-400" />
              <span>Mélanger</span>
            </button>
          </div>
        )}

        {/* Visual Preview (Canvas) */}
        <div
          className={`w-full rounded-xl overflow-hidden border border-amber-500/30 shadow-2xl bg-black/60 transition-all ${
            format === 'STORY'
              ? 'max-w-xs aspect-[9/16] max-h-[460px]'
              : format === 'BANNER'
              ? 'max-w-xl aspect-[16/9] max-h-[280px]'
              : 'max-w-sm aspect-square max-h-[360px]'
          } flex items-center justify-center relative group`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain cursor-pointer"
            onClick={handleDownload}
            title="Cliquer pour télécharger le visuel en HD"
          />
          {/* Hover overlay hint */}
          <div
            onClick={handleDownload}
            className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 cursor-pointer backdrop-blur-[2px]"
          >
            <Download className="w-8 h-8 text-amber-400 animate-bounce" />
            <span className="text-xs font-bold text-white bg-slate-900/90 px-3 py-1.5 rounded-full border border-amber-500/40">
              Télécharger PNG HD
            </span>
          </div>
        </div>

        {/* Primary Essential Actions (1-Click) */}
        <div className="w-full max-w-md mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger PNG HD</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopyForPlatform(selectedPlatform)}
            className={`flex-1 min-w-[170px] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 shadow-md ${
              copiedPlatform === selectedPlatform
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold'
                : selectedPlatform === 'WHATSAPP'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                : selectedPlatform === 'INSTAGRAM'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white border-pink-400'
                : selectedPlatform === 'FACEBOOK'
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400'
                : selectedPlatform === 'TWITTER'
                ? 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-400'
                : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400'
            }`}
            title={`Copier le texte prêt à publier pour ${SOCIAL_PLATFORMS_CONFIG[selectedPlatform].label}`}
          >
            {copiedPlatform === selectedPlatform ? (
              <>
                <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                <span>Copié pour {SOCIAL_PLATFORMS_CONFIG[selectedPlatform].shortLabel} !</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copier pour {SOCIAL_PLATFORMS_CONFIG[selectedPlatform].shortLabel}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            title="Partager directement le visuel et texte sur mobile"
          >
            <Share2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">{shareSuccess ? 'Partagé !' : 'Partager'}</span>
          </button>
        </div>

        {/* Social Media Target Platform Selector */}
        <div className="w-full max-w-md mt-4 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>Texte adapté par réseau :</span>
            </span>
            <span className="text-[10px] text-slate-400">
              {SOCIAL_PLATFORMS_CONFIG[selectedPlatform].badge}
            </span>
          </div>

          {/* Platform Pills */}
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800/80">
            {(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TWITTER', 'TIKTOK'] as SocialPlatform[]).map((pKey) => {
              const pConfig = SOCIAL_PLATFORMS_CONFIG[pKey];
              const isSelected = selectedPlatform === pKey;
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => setSelectedPlatform(pKey)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer truncate ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                  title={pConfig.description}
                >
                  <span>{pConfig.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Active Platform Text Preview & One-Click Copy */}
          {(() => {
            const currentCaption = getActiveCaptionForPlatform(selectedPlatform);
            const currentConfig = SOCIAL_PLATFORMS_CONFIG[selectedPlatform];
            const charCount = currentCaption.length;
            const isNearTwitterLimit = selectedPlatform === 'TWITTER' && charCount > 280;

            return (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate pr-2">{currentConfig.instructions}</span>
                  <span className={`font-mono shrink-0 ${isNearTwitterLimit ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                    {charCount} {currentConfig.charLimit ? `/ ${currentConfig.charLimit} car.` : 'car.'}
                  </span>
                </div>

                <div className="relative group">
                  <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text font-sans">
                    {currentCaption}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyForPlatform(selectedPlatform)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/90 hover:bg-amber-500 hover:text-slate-950 text-slate-300 border border-slate-700/60 transition cursor-pointer shadow-md"
                    title={`Copier le texte pour ${currentConfig.label}`}
                  >
                    {copiedPlatform === selectedPlatform ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Advanced Options Drawer (Collapsible, Zero Clutter by default) */}
      {showAdvancedOptions && (
        <div className="border-t border-slate-800/90 bg-slate-950/90 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/70">
            {/* Format Selector Pills (Carré, Story, Bannière) */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 px-2 font-medium">Format :</span>
              <button
                type="button"
                onClick={() => setFormat('SQUARE')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                  format === 'SQUARE'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Square className="w-3 h-3" />
                <span>1:1 Carré</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('STORY')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                  format === 'STORY'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>9:16 Story</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('BANNER')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                  format === 'BANNER'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span>16:9 Bannière</span>
              </button>
            </div>

            {/* Quick Duo Pack Download */}
            <button
              type="button"
              onClick={handleDownloadMarketingPack}
              disabled={downloadingPack}
              className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Télécharge automatiquement le format Carré + Story"
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>{downloadingPack ? 'Génération...' : 'Télécharger Pack Carré + Story'}</span>
            </button>
          </div>

          {/* Layout Selector for Tactical Puzzles */}
          {data.theme === 'TACTICAL_PUZZLE' && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] p-2 rounded-xl bg-slate-900/80 border border-amber-500/20">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <Layout className="w-3.5 h-3.5 text-amber-400" />
                <span>Disposition tactique :</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'DILEMMA_3' as const, label: '3 Choix (A/B/C)', icon: '🃏' },
                  { id: 'TABLE_FELT_LIVE' as const, label: 'Tapis Direct (Tour)', icon: '🟢' },
                  { id: 'PLAYER_HAND_5' as const, label: 'Main de 5 cartes', icon: '🖐️' },
                  { id: 'DUEL_1V1' as const, label: 'Duel 1v1', icon: '⚔️' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setTacticalLayout(l.id);
                      setData((prev) => ({ ...prev, tacticalLayout: l.id }));
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                      tacticalLayout === l.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Palette Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Palette className="w-3 h-3 text-amber-400" />
              <span>Ambiance couleur :</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPalette('EMERALD_GOLD')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition ${
                  palette === 'EMERALD_GOLD'
                    ? 'bg-emerald-950 border-emerald-400 text-emerald-300 font-bold shadow-sm'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🌲 Émeraude & Or
              </button>
              <button
                type="button"
                onClick={() => setPalette('EBONY_GOLD')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition ${
                  palette === 'EBONY_GOLD'
                    ? 'bg-amber-950/60 border-amber-400 text-amber-300 font-bold shadow-sm'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                👑 Nuit d'Ébène
              </button>
              <button
                type="button"
                onClick={() => setPalette('SUNSET_TERRACOTTA')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition ${
                  palette === 'SUNSET_TERRACOTTA'
                    ? 'bg-orange-950/60 border-orange-400 text-orange-300 font-bold shadow-sm'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🌅 Coucher de Soleil
              </button>
              <button
                type="button"
                onClick={() => setPalette('ROYAL_SAPPHIRE')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition ${
                  palette === 'ROYAL_SAPPHIRE'
                    ? 'bg-blue-950/60 border-blue-400 text-blue-300 font-bold shadow-sm'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                💎 Saphir Royal
              </button>
            </div>
          </div>

          {/* Links Toggles & Edit Text Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Liens affichés :</span>
              <button
                type="button"
                onClick={() => {
                  const next = !includeApp;
                  setIncludeApp(next);
                  setData((prev) => ({ ...prev, includeAppUrl: next }));
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                  includeApp
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                }`}
              >
                <span>🎮 Jeu</span>
                {includeApp && <Check className="w-2.5 h-2.5 text-amber-400" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !includeWhatsApp;
                  setIncludeWhatsApp(next);
                  setData((prev) => ({ ...prev, includeWhatsAppUrl: next }));
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                  includeWhatsApp
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                }`}
              >
                <span>💬 WhatsApp</span>
                {includeWhatsApp && <Check className="w-2.5 h-2.5 text-emerald-400" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-semibold"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEditing ? 'Masquer l’éditeur' : 'Modifier les cartes & textes'}</span>
            </button>
          </div>

          {/* Text & Cards Editor Drawer if open */}
          {isEditing && (
            <div className="p-3.5 rounded-xl bg-slate-900/95 border border-amber-500/30 space-y-3 text-xs shadow-xl animate-fadeIn">
              {/* Podium Winners Editor */}
              {(data.theme === 'LEADERBOARD_PODIUM' || (data.podiumWinners && data.podiumWinners.length > 0)) && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Les 3 Champions du Podium (Pseudos propres uniquement) :</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((r) => {
                      const currentWinners = data.podiumWinners || [
                        { rank: 1, name: 'The killer', scoreOrTitle: '20 pts • 18 Victoires' },
                        { rank: 2, name: 'Maître Kora', scoreOrTitle: '15 pts • 14 Victoires' },
                        { rank: 3, name: 'Lion du Tapis', scoreOrTitle: '11 pts • 11 Victoires' },
                      ];
                      const winner = currentWinners.find((w) => w.rank === r) || {
                        rank: r,
                        name: r === 1 ? 'The killer' : r === 2 ? 'Maître Kora' : 'Lion du Tapis',
                        scoreOrTitle: '',
                      };
                      const medal = r === 1 ? '🥇 1er' : r === 2 ? '🥈 2e' : '🥉 3e';

                      return (
                        <div key={r} className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold text-amber-400">{medal}</span>
                          <input
                            type="text"
                            value={winner.name}
                            placeholder="Pseudo du joueur"
                            onChange={(e) => {
                              const updatedWinners = currentWinners.map((w) =>
                                w.rank === r ? { ...w, name: e.target.value } : w
                              );
                              setData({ ...data, podiumWinners: updatedWinners });
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-white outline-none"
                          />
                          <input
                            type="text"
                            value={winner.scoreOrTitle || ''}
                            placeholder="ex: 20 pts • 18 Victoires"
                            onChange={(e) => {
                              const updatedWinners = currentWinners.map((w) =>
                                w.rank === r ? { ...w, scoreOrTitle: e.target.value } : w
                              );
                              setData({ ...data, podiumWinners: updatedWinners });
                            }}
                            className="w-full px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-[10px] text-slate-300 outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tactical Cards 1-Click Editor */}
              {data.theme === 'TACTICAL_PUZZLE' && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cartes du visuel (Règles Njambo - 31 cartes) :</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentCards = data.puzzleCards || [];
                        if (currentCards.length < 5) {
                          const newCard = { rank: '8' as const, suit: '♥' as const, label: `CARTE ${currentCards.length + 1}` };
                          setData((prev) => ({
                            ...prev,
                            puzzleCards: [...(prev.puzzleCards || []), newCard],
                          }));
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:bg-emerald-900"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Ajouter une carte</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(data.puzzleCards || []).map((card, idx) => {
                      const isBlack = card.suit === '♠';
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-slate-300"
                        >
                          <span className="font-bold text-amber-400 text-[11px] w-6">#{idx + 1}</span>

                          {/* Suit Selector with Njambo Names */}
                          <select
                            value={card.suit}
                            onChange={(e) => {
                              const newSuit = e.target.value as NjamboSuit;
                              // If changing to Black and rank is 10, cap it to 9
                              let newRank = card.rank;
                              if (newSuit === '♠' && newRank === '10') {
                                newRank = '9';
                              }
                              const updated = [...(data.puzzleCards || [])];
                              updated[idx] = { ...updated[idx], suit: newSuit, rank: newRank };
                              setData({ ...data, puzzleCards: updated });
                            }}
                            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] font-bold text-white outline-none cursor-pointer"
                          >
                            <option value="♥">♥ Koubi (Cœur)</option>
                            <option value="♦">♦ Zing (Carreau)</option>
                            <option value="♣">♣ Tchaka (Trèfle)</option>
                            <option value="♠">♠ Black (Pique)</option>
                          </select>

                          {/* Rank Selector (3 to 10, strictly capped at 9 for Black) */}
                          <select
                            value={card.rank}
                            onChange={(e) => {
                              const updated = [...(data.puzzleCards || [])];
                              updated[idx] = { ...updated[idx], rank: e.target.value as NjamboRank };
                              setData({ ...data, puzzleCards: updated });
                            }}
                            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] font-bold text-white outline-none cursor-pointer"
                          >
                            {VALID_NJAMBO_RANKS.map((r) => {
                              if (isBlack && r === '10') return null; // Le 10 Black n'existe pas !
                              return (
                                <option key={r} value={r}>
                                  Rang {r}
                                </option>
                              );
                            })}
                          </select>

                          {/* Label input */}
                          <input
                            type="text"
                            value={card.label || ''}
                            placeholder="Libellé (ex: OPTION A)"
                            onChange={(e) => {
                              const updated = [...(data.puzzleCards || [])];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setData({ ...data, puzzleCards: updated });
                            }}
                            className="flex-1 min-w-[100px] px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-white outline-none"
                          />

                          {/* Best Move Checkbox */}
                          <label className="flex items-center gap-1 text-[10px] text-amber-300 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!card.isBestMove}
                              onChange={(e) => {
                                const updated = (data.puzzleCards || []).map((c, i) => ({
                                  ...c,
                                  isBestMove: i === idx ? e.target.checked : false,
                                }));
                                setData({ ...data, puzzleCards: updated });
                              }}
                              className="rounded border-slate-700 text-amber-500"
                            />
                            <span>★ Clé</span>
                          </label>

                          {/* Remove button */}
                          {(data.puzzleCards || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (data.puzzleCards || []).filter((_, i) => i !== idx);
                                setData({ ...data, puzzleCards: updated });
                              }}
                              className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                              title="Supprimer la carte"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 font-medium">Titre du visuel :</label>
                <input
                  type="text"
                  value={data.headline}
                  onChange={(e) => setData({ ...data, headline: e.target.value })}
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Texte du visuel :</label>
                <textarea
                  rows={2}
                  value={data.mainText}
                  onChange={(e) => setData({ ...data, mainText: e.target.value })}
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-none focus:border-amber-400 resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Légende du post :</label>
                <textarea
                  rows={3}
                  value={data.postCaption}
                  onChange={(e) => setData({ ...data, postCaption: e.target.value })}
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-none focus:border-amber-400 resize-none"
                />
              </div>
            </div>
          )}

          {/* Regeneration option if callback provided */}
          {onRegenerate && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onRegenerate}
                className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Régénérer une variation</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
