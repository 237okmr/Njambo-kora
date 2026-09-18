import {
  SocialVisualCardData,
  SocialVisualFormat,
  SocialVisualPalette,
  SocialVisualPattern,
  TacticalLayout,
  PodiumWinnerItem,
  cleanPlayerDisplayName,
  NJAMBO_DOMAIN,
  NJAMBO_SUITS_INFO,
  sanitizeNjamboCard,
  NjamboSuit,
  NjamboRank,
} from '../types/socialVisuals';

/**
 * Text wrapping utility for HTML5 Canvas with line height calculation
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function truncateWords(text: string, maxWords: number): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Draws a glowing circular avatar placeholder or initials
 * If avatarUrl is provided and preloaded, it draws the image.
 */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  initials: string,
  baseColor: string,
  glowColor: string,
  avatarImage?: HTMLImageElement // Optional loaded image
) {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  
  // Outer glowing ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  
  ctx.shadowBlur = 0;
  
  if (avatarImage) {
    // Draw real image
    ctx.clip(); // Clip to the circle
    // Calculate aspect ratio preserving dimensions
    const imgAspect = avatarImage.width / avatarImage.height;
    let drawWidth = radius * 2;
    let drawHeight = radius * 2;
    if (imgAspect > 1) {
       drawWidth = drawHeight * imgAspect;
    } else {
       drawHeight = drawWidth / imgAspect;
    }
    
    ctx.drawImage(
      avatarImage, 
      cx - drawWidth / 2, 
      cy - drawHeight / 2, 
      drawWidth, 
      drawHeight
    );
  } else {
    // Inner text (Initials)
    ctx.font = `bold ${Math.floor(radius * 0.8)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials.substring(0, 2).toUpperCase(), cx, cy);
  }
  
  ctx.restore();
}

/**
 * Draws rounded rectangle

 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill = true,
  stroke = false
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y + w, x, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * Color palettes configuration
 */
interface PaletteStyle {
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  goldAccent: string;
  goldBorder: string;
  goldSoft: string;
  cardBoxBg: string;
  highlightColor: string;
}

function getPaletteStyle(palette: SocialVisualPalette = 'EMERALD_GOLD'): PaletteStyle {
  switch (palette) {
    case 'EBONY_GOLD':
      return {
        bgStart: '#252119',
        bgMid: '#0e0e12',
        bgEnd: '#040405',
        goldAccent: '#ffd700',
        goldBorder: '#d4af37',
        goldSoft: 'rgba(255, 215, 0, 0.28)',
        cardBoxBg: 'rgba(18, 18, 24, 0.88)',
        highlightColor: '#facc15',
      };
    case 'SUNSET_TERRACOTTA':
      return {
        bgStart: '#4a1d15',
        bgMid: '#250f0b',
        bgEnd: '#0d0403',
        goldAccent: '#fb923c',
        goldBorder: '#ea580c',
        goldSoft: 'rgba(251, 146, 60, 0.28)',
        cardBoxBg: 'rgba(26, 13, 11, 0.88)',
        highlightColor: '#f97316',
      };
    case 'ROYAL_SAPPHIRE':
      return {
        bgStart: '#142954',
        bgMid: '#0a1633',
        bgEnd: '#0d0714', // Slightly warmer dark end to blend the orange
        goldAccent: '#fbbf24', // Enhanced gold accent instead of blue
        goldBorder: '#0284c7',
        goldSoft: 'rgba(251, 191, 36, 0.28)', // Gold soft glow
        cardBoxBg: 'rgba(11, 20, 44, 0.88)',
        highlightColor: '#38bdf8',
      };
    case 'EMERALD_GOLD':
    default:
      return {
        bgStart: '#134e35',
        bgMid: '#08281c',
        bgEnd: '#030f0a',
        goldAccent: '#fbbf24',
        goldBorder: '#cda34f',
        goldSoft: 'rgba(251, 191, 36, 0.25)',
        cardBoxBg: 'rgba(15, 27, 46, 0.86)',
        highlightColor: '#34d399',
      };
  }
}

/**
 * Draws cultural Ndop geometric chevron / diamond background filigree
 */
function drawCulturalPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: SocialVisualPattern = 'NDOP_CHEVRON'
) {
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#ffffff';

  if (pattern === 'NDOP_CHEVRON') {
    const step = 64;
    for (let x = 32; x < width; x += step) {
      for (let y = 32; y < height; y += step) {
        ctx.beginPath();
        // Stylized chevron triangle & diamond
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x + 9, y);
        ctx.lineTo(x, y + 9);
        ctx.lineTo(x - 9, y);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'DIAMONDS') {
    for (let px = 24; px < width; px += 48) {
      for (let py = 24; py < height; py += 48) {
        ctx.beginPath();
        ctx.moveTo(px, py - 5);
        ctx.lineTo(px + 5, py);
        ctx.lineTo(px, py + 5);
        ctx.lineTo(px - 5, py);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * Dessine une carte de jeu authentique du Njambo Kora (Paquet de 31 cartes)
 */
export function drawPlayingCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rawRank: string,
  rawSuit: '♥' | '♦' | '♠' | '♣' | string,
  topLabel?: string,
  isBestMove?: boolean,
  badgeText?: string,
  isLead?: boolean,
  glowColor?: string
) {
  const { rank, suit } = sanitizeNjamboCard(rawRank, rawSuit);
  const suitInfo = NJAMBO_SUITS_INFO[suit];
  const suitColor = suitInfo?.color || (suit === '♥' || suit === '♦' ? '#ef4444' : '#0f172a');
  const suitName = suitInfo?.name || '';

  ctx.save();
  // Card Shadow & Glow
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 4;
  } else {
    ctx.shadowColor = isBestMove
      ? 'rgba(234, 179, 8, 0.5)'
      : isLead
      ? 'rgba(56, 189, 248, 0.45)'
      : 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = isBestMove || isLead ? 22 : 16;
    ctx.shadowOffsetY = 8;
  }

  // Card Body (Ivory White with subtle warm sheen)
  const cardGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  cardGrad.addColorStop(0, '#ffffff');
  cardGrad.addColorStop(1, '#f1f5f9');
  ctx.fillStyle = cardGrad;
  ctx.strokeStyle = isBestMove ? '#eab308' : isLead ? '#38bdf8' : '#cbd5e1';
  ctx.lineWidth = isBestMove ? 3.5 : isLead ? 3 : 1.5;
  roundRect(ctx, x, y, w, h, Math.min(14, Math.floor(w * 0.1)), true, true);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Option / Player Pill above card (e.g. "OPTION A", "ENTAME", "TOI")
  if (topLabel) {
    const pillH = Math.max(26, Math.floor(h * 0.13));
    const pillY = y - pillH - 8;
    ctx.fillStyle = isBestMove ? '#ca8a04' : isLead ? '#0369a1' : '#1e293b';
    ctx.strokeStyle = isBestMove ? '#facc15' : isLead ? '#38bdf8' : '#475569';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 2, pillY, w - 4, pillH, 11, true, true);

    const pillFontSize = Math.max(12, Math.floor(pillH * 0.52));
    ctx.font = `bold ${pillFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = isBestMove || isLead ? '#ffffff' : '#f8fafc';
    ctx.textAlign = 'center';

    // Raccourcir le label s'il contient des détails longs (ex: "OPTION A : 4 ZING" -> "OPTION A")
    let displayLabel = topLabel;
    if (topLabel.includes(':')) {
      displayLabel = topLabel.split(':')[0].trim();
    }
    ctx.fillText(displayLabel, x + w / 2, pillY + pillH * 0.68);
  }

  // Card Top-Left Rank & Suit & Cameroonian Name
  ctx.textAlign = 'left';
  ctx.fillStyle = suitColor;
  const fontSize = Math.max(20, Math.floor(w * 0.20));
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(rank, x + Math.floor(w * 0.09), y + Math.floor(h * 0.16));

  ctx.font = `bold ${Math.floor(fontSize * 0.95)}px sans-serif`;
  ctx.fillText(suit, x + Math.floor(w * 0.09), y + Math.floor(h * 0.26));

  // Small suit name in Cameroon dialect (Koubi, Zing, Tchaka, Black)
  if (w >= 85) {
    ctx.font = `bold ${Math.max(11, Math.floor(fontSize * 0.46))}px system-ui, sans-serif`;
    ctx.fillStyle = suitColor === '#0f172a' ? '#334155' : 'rgba(15, 23, 42, 0.80)';
    ctx.fillText(suitName.toUpperCase(), x + Math.floor(w * 0.09), y + Math.floor(h * 0.35));
  }

  // Card Center Big Suit Icon
  ctx.textAlign = 'center';
  ctx.font = `${Math.floor(w * 0.42)}px sans-serif`;
  ctx.fillStyle = suitColor;
  ctx.fillText(suit, x + w / 2, y + h / 2 + Math.floor(fontSize * 0.35));

  // Bottom-Right Inverted Rank
  ctx.textAlign = 'right';
  ctx.fillStyle = suitColor;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(rank, x + w - Math.floor(w * 0.09), y + h - Math.floor(h * 0.08));

  // Best Move / Special Badge (Pillule stylée à fort contraste)
  if (isBestMove || badgeText || isLead) {
    const bText = isBestMove ? (badgeText || '★ CLÉ') : isLead ? 'ENTAME' : badgeText;
    if (bText) {
      const badgeH = Math.max(20, Math.floor(h * 0.11));
      const badgeW = Math.min(w - 12, Math.floor(w * 0.78));
      const badgeX = x + (w - badgeW) / 2;
      const badgeY = y + h - badgeH - Math.floor(h * 0.04);

      ctx.fillStyle = isBestMove ? '#ca8a04' : isLead ? '#0284c7' : '#1e293b';
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6, true, false);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(11, Math.floor(badgeH * 0.60))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(bText, x + w / 2, badgeY + badgeH * 0.70);
    }
  }

  ctx.restore();
}

/**
 * Dessine le dos d'une carte Njambo Kora ornée de motifs Ndop
 */
export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  baseColor = '#831843',
  accentGold = '#f59e0b'
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  // Outer border & fill
  ctx.fillStyle = baseColor;
  ctx.strokeStyle = accentGold;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, Math.min(14, Math.floor(w * 0.1)), true, true);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Inner margin frame
  const pad = Math.floor(w * 0.08);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 8, false, true);

  // Center Ndop sun medallion
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = Math.floor(w * 0.22);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accentGold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Diamond rays inside medallion
  ctx.fillStyle = accentGold;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.8);
  ctx.lineTo(cx + radius * 0.8, cy);
  ctx.lineTo(cx, cy + radius * 0.8);
  ctx.lineTo(cx - radius * 0.8, cy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Dessine une carte inclinée à un angle précis
 */
export function drawRotatedPlayingCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angleDeg: number,
  rawRank: string,
  rawSuit: '♥' | '♦' | '♠' | '♣' | string,
  topLabel?: string,
  isBestMove?: boolean,
  badgeText?: string,
  isLead?: boolean,
  glowColor?: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);
  drawPlayingCard(
    ctx,
    -w / 2,
    -h / 2,
    w,
    h,
    rawRank,
    rawSuit,
    topLabel,
    isBestMove,
    badgeText,
    isLead,
    glowColor
  );
  ctx.restore();
}

/**
 * Dessine le dos d'une carte inclinée
 */
export function drawRotatedCardBack(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angleDeg: number,
  baseColor?: string,
  accentGold?: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);
  drawCardBack(ctx, -w / 2, -h / 2, w, h, baseColor, accentGold);
  ctx.restore();
}

/**
 * Dessine des symboles de cartes flottants et lumineux (Particules ♥ ♦ ♣ ♠)
 */
function drawSuitParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  suit: NjamboSuit,
  alpha = 0.25,
  glow = true
) {
  const suitInfo = NJAMBO_SUITS_INFO[suit];
  const color = suitInfo?.color || '#ffffff';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.8;
  }

  ctx.fillStyle = color;
  ctx.font = `${size}px sans-serif`;
  ctx.fillText(suit, x, y);
  ctx.restore();
}

/**
 * Dessine des cartes fantômes et symboles flottants en arrière-plan
 * pour donner une ambiance vibrante et immédiatement identifiable à chaque visuel
 */
function drawFloatingBackgroundArtwork(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: PaletteStyle,
  isStory: boolean
) {
  ctx.save();

  // 1. Ghost floating cards in backdrop (Subtil filigrane à 5% d'opacité pour ne jamais gêner la lecture)
  ctx.globalAlpha = 0.05;
  const bgCardW = isStory ? 180 : 150;
  const bgCardH = Math.floor(bgCardW * 1.45);

  // Top-Left Ghost: 10♥ Koubi (repoussé dans le coin)
  drawRotatedPlayingCard(
    ctx,
    width * 0.04,
    isStory ? height * 0.22 : height * 0.26,
    bgCardW,
    bgCardH,
    -20,
    '10',
    '♥',
    undefined,
    false,
    undefined,
    false,
    'rgba(239, 68, 68, 0.25)'
  );

  // Top-Right Ghost: 9♠ Black (repoussé dans le coin)
  drawRotatedPlayingCard(
    ctx,
    width * 0.96,
    isStory ? height * 0.25 : height * 0.29,
    bgCardW,
    bgCardH,
    22,
    '9',
    '♠',
    undefined,
    false,
    undefined,
    false,
    'rgba(56, 189, 248, 0.25)'
  );

  // Mid-Bottom-Left Ghost: 10♦ Zing
  drawRotatedPlayingCard(
    ctx,
    width * 0.03,
    isStory ? height * 0.76 : height * 0.72,
    bgCardW * 0.9,
    bgCardH * 0.9,
    16,
    '10',
    '♦',
    undefined,
    false,
    undefined,
    false,
    'rgba(249, 115, 22, 0.25)'
  );

  // Mid-Bottom-Right Ghost: 10♣ Tchaka
  drawRotatedPlayingCard(
    ctx,
    width * 0.97,
    isStory ? height * 0.74 : height * 0.70,
    bgCardW * 0.9,
    bgCardH * 0.9,
    -16,
    '10',
    '♣',
    undefined,
    false,
    undefined,
    false,
    'rgba(16, 185, 129, 0.25)'
  );

  ctx.restore();

  // 2. Dispersed glowing suit particles (♥, ♦, ♣, ♠)
  const particles: Array<{ x: number; y: number; size: number; suit: NjamboSuit; alpha: number }> = [
    { x: width * 0.22, y: isStory ? height * 0.12 : height * 0.14, size: 28, suit: '♥', alpha: 0.3 },
    { x: width * 0.78, y: isStory ? height * 0.14 : height * 0.16, size: 24, suit: '♦', alpha: 0.25 },
    { x: width * 0.06, y: isStory ? height * 0.45 : height * 0.48, size: 32, suit: '♣', alpha: 0.22 },
    { x: width * 0.94, y: isStory ? height * 0.44 : height * 0.46, size: 30, suit: '♠', alpha: 0.28 },
    { x: width * 0.18, y: isStory ? height * 0.86 : height * 0.84, size: 26, suit: '♥', alpha: 0.24 },
    { x: width * 0.82, y: isStory ? height * 0.84 : height * 0.82, size: 28, suit: '♣', alpha: 0.25 },
    { x: width * 0.5, y: isStory ? height * 0.06 : height * 0.08, size: 22, suit: '♦', alpha: 0.2 },
  ];

  particles.forEach((p) => {
    drawSuitParticle(ctx, p.x, p.y, p.size, p.suit, p.alpha, true);
  });
}

/**
 * Dessine les 4 coins identitaires ornés des 4 enseignes de Njambo Kora
 */
function drawCornerSuitsBadges(
  ctx: CanvasRenderingContext2D,
  innerMargin: number,
  width: number,
  height: number,
  style: PaletteStyle
) {
  const cornerData: Array<{
    x: number;
    y: number;
    suit: NjamboSuit;
    rank: string;
    label: string;
    color: string;
  }> = [
    { x: innerMargin + 16, y: innerMargin + 16, suit: '♥', rank: '10', label: 'KOUBI', color: '#ef4444' },
    { x: width - innerMargin - 16, y: innerMargin + 16, suit: '♦', rank: '10', label: 'ZING', color: '#f97316' },
    { x: innerMargin + 16, y: height - innerMargin - 16, suit: '♣', rank: '10', label: 'TCHAKA', color: '#10b981' },
    { x: width - innerMargin - 16, y: height - innerMargin - 16, suit: '♠', rank: '9', label: 'BLACK', color: '#38bdf8' },
  ];

  cornerData.forEach((c) => {
    ctx.save();
    // Glowing circular badge
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = c.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.suit, c.x, c.y);
    ctx.restore();
  });
}

/**
 * Dessine un éventail prestigieux des 4 cartes maîtresses du Njambo Kora (10♥, 10♦, 10♣, 9♠)
 */
export function drawMasterCardsFan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cardW = 110,
  cardH = 160
) {
  const fanCards: Array<{ rank: string; suit: NjamboSuit; angle: number; label: string }> = [
    { rank: '10', suit: '♥', angle: -20, label: 'KOUBI' },
    { rank: '10', suit: '♦', angle: -7, label: 'ZING' },
    { rank: '10', suit: '♣', angle: 7, label: 'TCHAKA' },
    { rank: '9', suit: '♠', angle: 20, label: 'BLACK' },
  ];

  fanCards.forEach((c) => {
    drawRotatedPlayingCard(
      ctx,
      cx + c.angle * 2.5,
      cy + Math.abs(c.angle) * 0.8,
      cardW,
      cardH,
      c.angle,
      c.rank,
      c.suit,
      c.label,
      false,
      '★',
      false,
      'rgba(251, 191, 36, 0.35)'
    );
  });
}

/**
 * Renders high-resolution social visual directly to Canvas
 */
export async function renderSocialVisualToCanvas(
  canvas: HTMLCanvasElement,
  data: SocialVisualCardData,
  format: SocialVisualFormat = 'SQUARE'
): Promise<void> {
  const isStory = format === 'STORY';
  const isBanner = format === 'BANNER';

  // Dimension setup
  let width = 1080;
  let height = 1080;
  if (isStory) {
    width = 1080;
    height = 1920;
  } else if (isBanner) {
    width = 1920;
    height = 1080;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Preload avatars if available
  const loadedAvatars: Record<string, HTMLImageElement> = {};
  if (data.theme === 'LEADERBOARD_PODIUM' && data.podiumWinners) {
    const loadPromises = data.podiumWinners.map(async (winner) => {
      if (winner.avatarUrl) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous'; // Important for external images on canvas
          img.src = winner.avatarUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          loadedAvatars[winner.name] = img;
        } catch (e) {
          console.warn('Failed to load avatar for', winner.name);
        }
      }
    });
    await Promise.all(loadPromises);
  }

  // Determine Palette & Cultural Pattern
  let selectedPalette: SocialVisualPalette = data.palette || 'EMERALD_GOLD';
  if (!data.palette) {
    if (data.theme === 'TOURNAMENT_ANNOUNCEMENT') selectedPalette = 'EBONY_GOLD';
    else if (data.theme === 'CULTURE_NJAMBO' || data.theme === 'MEME_OR_PUNCHLINE') selectedPalette = 'SUNSET_TERRACOTTA';
    else if (data.theme === 'TACTICAL_PUZZLE') selectedPalette = 'ROYAL_SAPPHIRE';
  }
  const style = getPaletteStyle(selectedPalette);
  const patternType = data.pattern || 'NDOP_CHEVRON';

  // 1. Ambient Background Gradient
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    isStory ? height * 0.35 : height * 0.45,
    80,
    width / 2,
    height / 2,
    height * 0.85
  );
  bgGrad.addColorStop(0, style.bgStart);
  bgGrad.addColorStop(0.55, style.bgMid);
  bgGrad.addColorStop(1, style.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Warm touch for ROYAL_SAPPHIRE
  if (selectedPalette === 'ROYAL_SAPPHIRE') {
    ctx.save();
    ctx.fillStyle = 'rgba(234, 88, 12, 0.05)'; // #ea580c at 5% opacity
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Cultural Background Texture
  drawCulturalPattern(ctx, width, height, patternType);

  // 🌟 Dynamic Floating Ghost Cards & Luminous Suit Particles
  drawFloatingBackgroundArtwork(ctx, width, height, style, isStory);

  // 2. Dual Gold Framing Border
  const margin = isBanner ? 55 : 45;
  const innerMargin = margin + 14;

  ctx.save();
  ctx.strokeStyle = style.goldBorder;
  ctx.lineWidth = 3;
  ctx.shadowColor = style.goldSoft;
  ctx.shadowBlur = 16;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 28, false, true);

  // Inner hairline gold frame
  ctx.strokeStyle = style.goldSoft;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  roundRect(
    ctx,
    innerMargin,
    innerMargin,
    width - innerMargin * 2,
    height - innerMargin * 2,
    20,
    false,
    true
  );
  ctx.restore();

  // 🌟 4 Authentic Corner Suits Badges (Koubi, Zing, Tchaka, Black)
  drawCornerSuitsBadges(ctx, innerMargin, width, height, style);

  // 3. Top Header: Brand Name + Card Suits
  const topY = isStory ? 280 : isBanner ? 110 : 120;
  ctx.save();
  ctx.textAlign = 'center';

  // Card suits emblem with authentic colored icons
  ctx.font = 'bold 24px sans-serif';
  const suitSpacing = 36;
  const suitsStartX = width / 2 - suitSpacing * 1.5;
  const suitsList: Array<{ s: NjamboSuit; c: string }> = [
    { s: '♥', c: '#ef4444' },
    { s: '♦', c: '#f97316' },
    { s: '♣', c: '#10b981' },
    { s: '♠', c: '#38bdf8' },
  ];
  suitsList.forEach((st, idx) => {
    ctx.fillStyle = st.c;
    ctx.shadowColor = st.c;
    ctx.shadowBlur = 10;
    ctx.fillText(st.s, suitsStartX + idx * suitSpacing, topY - 24);
  });
  ctx.shadowBlur = 0;

  // Official brand title
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('NJAMBO KORA  •  KATIKA', width / 2, topY + 8);

  // Theme Badge Pill
  const badgeText = (data.badge || 'KATIKA EXCLUSIF').toUpperCase();
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  const badgeWidth = ctx.measureText(badgeText).width + 50;
  const badgeY = topY + 44;

  ctx.fillStyle = style.goldSoft;
  ctx.strokeStyle = style.goldAccent;
  ctx.lineWidth = 1.5;
  roundRect(ctx, (width - badgeWidth) / 2, badgeY, badgeWidth, 38, 19, true, true);

  ctx.fillStyle = style.goldAccent;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, width / 2, badgeY + 25);
  ctx.restore();

  // 4. Content Area Layout
  const contentStartY = isStory ? 430 : isBanner ? 220 : 250;
  const contentWidth = isBanner ? width - 360 : width - 180;
  const contentX = (width - contentWidth) / 2;

  // ==========================================
  // RENDER BY THEME SPECIALIZATION
  // ==========================================
  if (data.theme === 'TOURNAMENT_ANNOUNCEMENT') {
    // --- THEME: TOURNAMENT ANNOUNCEMENT ---
    const startY = isStory ? contentStartY + 60 : contentStartY + 20;

    // Headline
    const displayHeadline = truncateWords(data.headline || 'Tournoi du Njambo Kora', 7);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 20;
    const hLines = wrapText(ctx, displayHeadline, contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 54);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + hLines.length * 54 + (isStory ? 45 : 20);
    const boxH = isStory ? 580 : isBanner ? 400 : 400;

    // Tournament Card Box
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // Prize Pool Centerpiece
    const prize = data.eventDetails?.prizePool || '50 000 jetons VIRTUELS';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('🏆 CAGNOTTE & RÉCOMPENSES EN JEU', width / 2, boxY + 45);

    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
    ctx.shadowBlur = 18;
    ctx.fillText(prize, width / 2, boxY + 105);
    ctx.shadowBlur = 0;

    // Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(contentX + 50, boxY + 130);
    ctx.lineTo(contentX + contentWidth - 50, boxY + 130);
    ctx.stroke();

    // Event Info Grid (Date, Mode, Spots)
    const dateText = data.eventDetails?.date || 'Samedi 21h00';
    const modeText = data.eventDetails?.mode || 'Table 4 Joueurs • Élimination';
    const spotsText = data.eventDetails?.spotsRemaining || '16 Places • Inscriptions Ouvertes';

    ctx.font = 'bold 23px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`📅 ${dateText}`, width / 2, boxY + 175);

    ctx.font = '21px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`⚔️ ${modeText}`, width / 2, boxY + 215);

    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText(`🔥 ${spotsText}`, width / 2, boxY + 255);

    // 🌟 Master Cards Fan representation below info
    const fanCenterY = boxY + 340;
    drawMasterCardsFan(ctx, width / 2, fanCenterY, 80, 115);

    ctx.restore();
  } else if (data.theme === 'LEADERBOARD_PODIUM' || (data.podiumWinners && data.podiumWinners.length > 0)) {
    // --- THEME: LEADERBOARD / PODIUM DES CHAMPIONS (COHÉRENCE TOTALE SANS BITS NI QUESTIONS TACTIQUES) ---
    const startY = isStory ? contentStartY + 40 : isBanner ? contentStartY + 5 : contentStartY + 10;

    ctx.save();
    ctx.textAlign = 'center';

    // 1. Headline (Titre d'honneur)
    const displayHeadline = truncateWords(data.headline || 'Le Podium des Maîtres du Njambo', 7);
    ctx.font = 'bold 40px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 18;
    const hLines = wrapText(ctx, displayHeadline, contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 48);
    });
    ctx.shadowBlur = 0;

    const headlineBottomY = startY + hLines.length * 48;

    // 2. Sous-texte d'éloge
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const subText = truncateWords(data.mainText || 'Honneur aux champions du tapis vert pour leurs victoires et leurs Koras d’exception !', 15);
    const sLines = wrapText(ctx, subText, contentWidth - 40);
    sLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, headlineBottomY + 10 + idx * 28);
    });

    const podiumTopY = headlineBottomY + 10 + sLines.length * 28 + (isStory ? 50 : 25);

    // Extraction & Nettoyage strict des 3 vainqueurs
    const rawWinners = data.podiumWinners || [];
    const w1Raw = rawWinners.find(w => w.rank === 1) || { rank: 1 as const, name: 'The killer', scoreOrTitle: '20 pts • 18 Victoires' };
    const w2Raw = rawWinners.find(w => w.rank === 2) || { rank: 2 as const, name: 'Maître Kora', scoreOrTitle: '15 pts • 14 Victoires' };
    const w3Raw = rawWinners.find(w => w.rank === 3) || { rank: 3 as const, name: 'Lion du Tapis', scoreOrTitle: '11 pts • 11 Victoires' };

    const winners: PodiumWinnerItem[] = [
      { ...w2Raw, rank: 2, name: cleanPlayerDisplayName(w2Raw.name, 'Maître Kora') },
      { ...w1Raw, rank: 1, name: cleanPlayerDisplayName(w1Raw.name, 'The killer') },
      { ...w3Raw, rank: 3, name: cleanPlayerDisplayName(w3Raw.name, 'Lion du Tapis') },
    ];

    // Calcul de la disposition des 3 colonnes du podium (2e à gauche, 1er au centre surélevé, 3e à droite)
    const colWidth = isStory ? 280 : isBanner ? 260 : 260;
    const colGap = isStory ? 24 : 20;
    const totalPodiumWidth = colWidth * 3 + colGap * 2;
    const podiumStartX = (width - totalPodiumWidth) / 2;

    const colHeights = [
      isStory ? 430 : 310, // 2e Place (Argent)
      isStory ? 490 : 360, // 1ère Place (Or - Surélevé)
      isStory ? 390 : 280, // 3e Place (Bronze)
    ];

    winners.forEach((winner, idx) => {
      const colX = podiumStartX + idx * (colWidth + colGap);
      const isFirst = winner.rank === 1;
      const isSecond = winner.rank === 2;
      const colH = colHeights[idx];
      const colY = isFirst ? podiumTopY : podiumTopY + (colHeights[1] - colH);

      // Couleurs et Thèmes de rang
      let medal = '🥇';
      let rankTitle = '1ÈRE PLACE';
      let borderGradStart = '#ffd700';
      let borderGradEnd = '#d4af37';
      let glowColor = 'rgba(255, 215, 0, 0.35)';
      let colBg = 'rgba(30, 27, 20, 0.88)';
      let nameColor = '#fbbf24';

      if (isSecond) {
        medal = '🥈';
        rankTitle = '2ÈME PLACE';
        borderGradStart = '#e2e8f0';
        borderGradEnd = '#94a3b8';
        glowColor = 'rgba(226, 232, 240, 0.25)';
        colBg = 'rgba(20, 24, 32, 0.85)';
        nameColor = '#f1f5f9';
      } else if (!isFirst) {
        medal = '🥉';
        rankTitle = '3ÈME PLACE';
        borderGradStart = '#f97316';
        borderGradEnd = '#b45309';
        glowColor = 'rgba(249, 115, 22, 0.25)';
        colBg = 'rgba(28, 20, 16, 0.85)';
        nameColor = '#fed7aa';
      }

      // 1. Boîte de pilier de podium
      ctx.save();
      ctx.fillStyle = colBg;
      ctx.strokeStyle = borderGradStart;
      ctx.lineWidth = isFirst ? 2.5 : 1.5;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isFirst ? 20 : 10;
      roundRect(ctx, colX, colY, colWidth, colH, 20, true, true);
      ctx.shadowBlur = 0;

      // 2. Avatar de joueur (Minimum 80px)
      const avatarCy = colY + (isFirst ? 80 : 75);
      drawAvatar(
        ctx,
        colX + colWidth / 2,
        avatarCy,
        40,
        winner.name,
        'rgba(0,0,0,0.4)',
        glowColor,
        loadedAvatars[winner.name]
      );

      // 3. Médaille chevauchant l'avatar (en bas à droite ou centrée haut)
      ctx.font = isFirst ? '36px sans-serif' : '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(medal, colX + colWidth / 2 + 28, avatarCy + 28);

      // 4. Badge de rang (1ÈRE PLACE / 2ÈME PLACE / 3ÈME PLACE)
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = borderGradStart;
      ctx.letterSpacing = '2px';
      ctx.fillText(rankTitle, colX + colWidth / 2, avatarCy + 60);
      ctx.letterSpacing = '0px';

      // 5. Pseudo du joueur (Propre, nettoyé, jamais d'ID technique)
      ctx.font = isFirst ? 'bold 24px system-ui, -apple-system, sans-serif' : 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = nameColor;
      const cleanName = winner.name.length > 16 ? winner.name.substring(0, 15) + '…' : winner.name;
      ctx.fillText(cleanName, colX + colWidth / 2, avatarCy + 95);

      // 6. Ligne de séparation subtile
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(colX + 30, avatarCy + 115);
      ctx.lineTo(colX + colWidth - 30, avatarCy + 115);
      ctx.stroke();

      // 7. Score ou Titre honorifique (ex: 18 Victoires • 52% Ratio)
      if (winner.scoreOrTitle) {
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        const scoreParts = winner.scoreOrTitle.split('•');
        ctx.fillText(scoreParts[0].trim(), colX + colWidth / 2, avatarCy + 145);
        if (scoreParts[1]) {
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(scoreParts[1].trim(), colX + colWidth / 2, colY + (isFirst ? 206 : 190));
        }
      }

      // 7. Badge honorifique de bas de pilier
      const bottomBadgeText = winner.badge || (isFirst ? '👑 GRAND CHAMPION' : isSecond ? '🥈 MAÎTRE KORA' : '🥉 ROI DU TAPIS');
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = isFirst ? '#facc15' : '#e2e8f0';
      ctx.fillText(bottomBadgeText, colX + colWidth / 2, colY + colH - 24);

      ctx.restore();
    });

    ctx.restore();
  } else if (data.theme === 'TACTICAL_PUZZLE') {
    // --- THEME: TACTICAL PUZZLE (STRUCTURE EN 5 ZONES, SANS REDONDANCE) ---
    const layout: TacticalLayout = data.tacticalLayout || 'DUEL_1V1';
    const tableScenario = data.tableScenario;
    // Base scale based on format
    const mainCardW = isStory ? 140 : 100;
    const mainCardH = Math.floor(mainCardW * 1.45);
    const optCardW = isStory ? 120 : 100; // Increased since TA MAIN is gone
    const optCardH = Math.floor(optCardW * 1.45);

    ctx.save();
    ctx.textAlign = 'center';

    // ZONE 1 - Titre, Contexte narratif et Question (Haut, 15%)
    const startY = isStory ? contentStartY + 10 : contentStartY - 30;
    
    // Titre (Sans troncature)
    const displayHeadline = data.headline || 'Tour 5 : Le choix décisif';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 18;
    const hLines = wrapText(ctx, displayHeadline, contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0; // reset shadow

    let currentY = startY + (hLines.length - 1) * 52 + 30;

    // Contexte narratif (CORRECTION 2)
    const narrativeText = data.mainText;
    if (narrativeText) {
      const nLines = wrapText(ctx, narrativeText, contentWidth - 80);
      const narrH = nLines.length * 32 + 30;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      roundRect(ctx, width / 2 - (contentWidth - 60) / 2, currentY, contentWidth - 60, narrH, 16, true, false);
      
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      nLines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, currentY + 30 + idx * 32);
      });
      currentY += narrH + (isStory ? 30 : 20);
    } else {
      currentY += (isStory ? 15 : 10);
    }

    // Question
    ctx.font = '500 34px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    const questionText = tableScenario?.question || 'Que joues-tu ?';
    const qLines = wrapText(ctx, questionText, contentWidth - 40);
    qLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, currentY + idx * 44);
    });
    
    currentY += (qLines.length - 1) * 44 + (isStory ? 40 : 25);

    // ZONE 2 - Cimetière (Cartes déjà tombées, 10%) (CORRECTION 3)
    const fallenCards = tableScenario?.cardsAlreadyFallen || [];
    const trickNum = tableScenario?.trickNumber || 5;

    if (fallenCards.length > 0) {
      const fallenBadgeH = isStory ? 90 : 76;
      const fallenBadgeW = Math.min(contentWidth - 40, 560);
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      roundRect(ctx, width / 2 - fallenBadgeW / 2, currentY, fallenBadgeW, fallenBadgeH, 14, true, true);

      // Bandeau titre
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      const maxTrick = Math.max(1, trickNum - 1);
      ctx.fillText(`TOURS 1 À ${maxTrick} · CARTES TOMBÉES`, width / 2 - fallenBadgeW / 2 + 16, currentY + (fallenBadgeH / 2) + 4);

      // Cartes miniatures
      const miniW = isStory ? 40 : 34;
      const miniH = Math.floor(miniW * 1.45);
      const miniSpacing = 16; // Wider for labels
      
      // On groupe et on trie, ou on affiche directement avec label
      const cardsTotalW = fallenCards.length * miniW + (fallenCards.length - 1) * miniSpacing;
      const cardsStartX = width / 2 + fallenBadgeW / 2 - cardsTotalW - 20;
      
      ctx.textAlign = 'center';
      fallenCards.forEach((c, idx) => {
        const cx = cardsStartX + idx * (miniW + miniSpacing);
        const cy = currentY + (fallenBadgeH - miniH) / 2 - 8;
        drawPlayingCard(ctx, cx, cy, miniW, miniH, c.rank, c.suit);
        // Label J1, J2 (pseudo-assignation pour visuel si non fourni)
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`J${(idx % 4) + 1}`, cx + miniW / 2, cy + miniH + 14);
      });
      currentY += fallenBadgeH + (isStory ? 40 : 25);
    }

    // ZONE 3 - Scène du tour en cours (40%)
    const opponentCards = tableScenario?.opponentPlayed && tableScenario.opponentPlayed.length > 0
      ? tableScenario.opponentPlayed.map(c => sanitizeNjamboCard(c.rank, c.suit))
      : [
          { rank: '7' as const, suit: '♣' as const },
          ...(layout === 'TABLE_3P' ? [{ rank: '9' as const, suit: '♣' as const }] : []),
        ];

    // Haut : Cartes adverses
    const oppCardsCount = opponentCards.length;
    const oppSpacing = 24;
    const oppTotalW = oppCardsCount * mainCardW + (oppCardsCount - 1) * oppSpacing;
    const oppStartX = width / 2 - oppTotalW / 2;
    
    const oppBadgeW = 160;
    const oppBadgeH = 26;
    ctx.fillStyle = '#ef4444';
    roundRect(ctx, width / 2 - oppBadgeW / 2, currentY, oppBadgeW, oppBadgeH, 13, true, false);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('COUP ADVERSE', width / 2, currentY + 18);

    const oppCardY = currentY + oppBadgeH + (isStory ? 15 : 10);
    opponentCards.forEach((c, idx) => {
        const cx = oppStartX + idx * (mainCardW + oppSpacing);
        drawPlayingCard(ctx, cx, oppCardY, mainCardW, mainCardH, c.rank, c.suit);
    });

    // ZONE 4 - Options de réponse (20%) (CORRECTION 1: Suppression redondance TA MAIN)
    const validCards = data.puzzleCards && data.puzzleCards.length > 0
      ? data.puzzleCards.map((c) => ({ ...c, ...sanitizeNjamboCard(c.rank, c.suit) }))
      : [
          { rank: '9' as const, suit: '♣' as const, isBestMove: true },
          { rank: '10' as const, suit: '♥' as const, isBestMove: false },
        ];

    // Espace du tapis (vide central)
    const emptySpace = isStory ? 80 : 30;
    currentY = oppCardY + mainCardH + emptySpace;

    const optSpacing = isStory ? 35 : 25;
    const optTotalW = validCards.length * optCardW + (validCards.length - 1) * optSpacing;
    const optStartX = width / 2 - optTotalW / 2;
    const optBadgeH = 26;
    const optBadgeW = optCardW + 10;
    
    validCards.forEach((c, idx) => {
        const cx = optStartX + idx * (optCardW + optSpacing);
        const letter = String.fromCharCode(65 + idx);
        
        ctx.fillStyle = '#fbbf24';
        roundRect(ctx, cx + optCardW/2 - optBadgeW/2, currentY, optBadgeW, optBadgeH, 13, true, false);
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText(`OPTION ${letter}`, cx + optCardW/2, currentY + 18);
        
        const highlightGlow = c.isBestMove ? 'rgba(251, 191, 36, 0.6)' : undefined;
        // On dessine l'option (sans label texte additionnel en dessous/dessus, le badge suffit)
        drawPlayingCard(ctx, cx, currentY + optBadgeH + 10, optCardW, optCardH, c.rank, c.suit, undefined, c.isBestMove, undefined, false, highlightGlow);
    });

    // ZONE 5 - Appel à l'action unique (15%) (CORRECTION 5)
    // On s'assure de l'ancrer en bas
    const ctaY = height - (isStory ? 200 : 120);
    const ctaH = isStory ? 80 : 70;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, ctaY, width, ctaH);
    
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('Donne ta réponse en commentaire 💬', width / 2, ctaY + (ctaH / 2) + 8);

    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('njambo-kora.ai.studio ♥ ♦ ♣ ♠', width / 2, ctaY + ctaH + 35);

    ctx.restore();
  } else if (data.theme === 'MEME_OR_PUNCHLINE') {
    // --- THEME: MEME & PUNCHLINE WITH ACTION CARDS ---
    const startY = isStory ? contentStartY + 100 : contentStartY + 35;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.headline, width / 2, startY);

    const boxY = startY + 50;
    const boxH = isStory ? 540 : 360;

    // Big Punchline Speech Bubble Card
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldAccent;
    ctx.lineWidth = 2.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 28, true, true);

    // 🌟 Slanted Action Cards inside meme (e.g. 10 Koubi slamming 8 Black)
    const cardW = isStory ? 105 : 95;
    const cardH = Math.floor(cardW * 1.45);
    const cardY = boxY + 30;

    // Card 1 : Beaten card (8 Black)
    drawRotatedPlayingCard(
      ctx,
      width / 2 - 60,
      cardY + cardH / 2,
      cardW,
      cardH,
      -14,
      '8',
      '♠',
      'TOUR 5',
      false,
      undefined,
      false,
      'rgba(15, 23, 42, 0.5)'
    );

    // Card 2 : Victorious 10 Koubi slamming
    drawRotatedPlayingCard(
      ctx,
      width / 2 + 50,
      cardY + cardH / 2 - 10,
      cardW,
      cardH,
      16,
      '10',
      '♥',
      'LE KORA !',
      true,
      '💥 BOOM',
      false,
      'rgba(239, 68, 68, 0.6)'
    );

    // Punchline Body Text
    ctx.font = 'italic bold 30px Georgia, serif';
    ctx.fillStyle = '#fef08a';
    const quoteLines = wrapText(ctx, `« ${data.mainText} »`, contentWidth - 100);
    const quoteStartY = cardY + cardH + 35;
    quoteLines.slice(0, isStory ? 6 : 3).forEach((line, idx) => {
      ctx.fillText(line, width / 2, quoteStartY + idx * 46);
    });
    ctx.restore();
  } else if (data.theme === 'STAT_OF_THE_WEEK' && data.highlightMetric) {
    // --- THEME: STAT OF THE WEEK WITH HERO CARD ---
    const metricY = isStory ? contentStartY + 100 : isBanner ? contentStartY + 20 : contentStartY + 30;
    const boxH = isStory ? 480 : 360;

    ctx.save();
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, metricY, contentWidth, boxH, 24, true, true);

    // Left Area: Big Stat Metric
    const statAreaWidth = contentWidth * 0.62;
    const statCenterX = contentX + statAreaWidth / 2;

    ctx.textAlign = 'center';
    ctx.font = 'bold 110px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 25;
    ctx.fillText(data.highlightMetric.value, statCenterX, metricY + 130);

    ctx.shadowBlur = 0;
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.highlightMetric.label.toUpperCase(), statCenterX, metricY + 195);

    if (data.highlightMetric.sublabel) {
      ctx.font = '20px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`♠ ♥ ${data.highlightMetric.sublabel} ♦ ♣`, statCenterX, metricY + 235);
    }

    // 🌟 Right Area: Glowing Hero Card (10♥ Koubi or 9♠ Black)
    const heroCardX = contentX + contentWidth - 150;
    const heroCardY = metricY + (boxH - 220) / 2 + 10;
    const heroRank = data.heroCard?.rank || '10';
    const heroSuit = data.heroCard?.suit || '♥';
    const heroBadge = data.heroCard?.badge || '★ MAÎTRE';

    drawRotatedPlayingCard(
      ctx,
      heroCardX,
      heroCardY + 110,
      140,
      200,
      8,
      heroRank,
      heroSuit,
      'CARTE CLEF',
      true,
      heroBadge,
      false,
      'rgba(251, 191, 36, 0.45)'
    );

    // Narrative under box
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const narrativeY = metricY + boxH + 40;
    const lines = wrapText(ctx, data.mainText, contentWidth - 40);
    lines.forEach((l, idx) => {
      ctx.fillText(l, width / 2, narrativeY + idx * 38);
    });
    ctx.restore();
  } else if (data.theme === 'TESTIMONIAL') {
    // --- THEME: TESTIMONIAL WITH CARD SEAL ---
    const quoteY = isStory ? contentStartY + 100 : contentStartY + 40;
    const boxH = isStory ? 600 : 400;

    ctx.save();
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldSoft;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, quoteY, contentWidth, boxH, 24, true, true);

    // 🌟 Master Card Seal at top right of quote
    drawRotatedPlayingCard(
      ctx,
      contentX + contentWidth - 80,
      quoteY + 70,
      75,
      110,
      12,
      '10',
      '♥',
      undefined,
      false,
      '5★',
      false,
      'rgba(239, 68, 68, 0.35)'
    );

    // Golden Stars
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'left';
    ctx.fillText('⭐⭐⭐⭐⭐', contentX + 45, quoteY + 60);

    // Quote Text
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillStyle = '#f8fafc';
    const quoteLines = wrapText(ctx, `« ${data.mainText} »`, contentWidth - 180);
    quoteLines.slice(0, 6).forEach((line, idx) => {
      ctx.fillText(line, contentX + 45, quoteY + 120 + idx * 44);
    });

    if (data.author) {
      const authorY = quoteY + boxH - 70;
      ctx.fillStyle = style.goldAccent;
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      const cleanAuthor = cleanPlayerDisplayName(data.author.name, 'Joueur de Njambo');
      ctx.fillText(`— ${cleanAuthor}  🃏`, contentX + 45, authorY);

      if (data.author.role) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillText(data.author.role, contentX + 45, authorY + 30);
      }
    }
    ctx.restore();
  } else if (data.theme === 'COMMUNITY_QUESTION' && data.options && data.options.length >= 2) {
    // --- THEME: COMMUNITY QUESTION WITH MINI CARDS ---
    const startQ = isStory ? contentStartY + 80 : contentStartY + 25;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    const qLines = wrapText(ctx, data.headline, contentWidth);
    qLines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, startQ + idx * 48);
    });

    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(data.mainText, width / 2, startQ + qLines.length * 48 + 25);
    ctx.restore();

    const cardsY = isStory ? startQ + 240 : startQ + 145;
    const cardH = isStory ? 200 : 135;

    // Option A Box with Mini Card 10♥
    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    roundRect(ctx, contentX, cardsY, contentWidth, cardH, 20, true, true);

    drawPlayingCard(
      ctx,
      contentX + 25,
      cardsY + (cardH - 100) / 2,
      70,
      100,
      '10',
      '♥',
      undefined,
      false,
      'A'
    );

    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'left';
    ctx.fillText('OPTION A', contentX + 115, cardsY + 45);

    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.options[0], contentX + 115, cardsY + (isStory ? 100 : 85));

    // Option B Box with Mini Card 9♠
    const cardBY = cardsY + cardH + 25;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    roundRect(ctx, contentX, cardBY, contentWidth, cardH, 20, true, true);

    drawPlayingCard(
      ctx,
      contentX + 25,
      cardBY + (cardH - 100) / 2,
      70,
      100,
      '9',
      '♠',
      undefined,
      false,
      'B'
    );

    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('OPTION B', contentX + 115, cardBY + 45);

    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.options[1], contentX + 115, cardBY + (isStory ? 100 : 85));
    ctx.restore();
  } else if (data.theme === 'BEFORE_AFTER' && data.comparison) {
    // --- THEME: BEFORE / AFTER WITH COMPARATIVE CARDS ---
    const startY = isStory ? contentStartY + 100 : contentStartY + 30;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.headline, width / 2, startY);
    ctx.restore();

    const boxH = isStory ? 240 : 160;
    const boxY1 = isStory ? startY + 70 : startY + 45;

    // Box 1: Before with greyed card
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY1, contentWidth, boxH, 20, true, true);

    drawPlayingCard(
      ctx,
      contentX + contentWidth - 105,
      boxY1 + (boxH - 120) / 2,
      80,
      120,
      '4',
      '♣',
      undefined,
      false,
      'AVANT'
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((data.comparison.beforeTitle || 'AVANT').toUpperCase(), contentX + 35, boxY1 + 45);

    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    const beforeLines = wrapText(ctx, data.comparison.beforeText, contentWidth - 160);
    beforeLines.slice(0, 3).forEach((line, idx) => {
      ctx.fillText(line, contentX + 35, boxY1 + 90 + idx * 36);
    });

    // Box 2: After with shining 10 Koubi
    const boxY2 = boxY1 + boxH + 25;
    ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    roundRect(ctx, contentX, boxY2, contentWidth, boxH, 20, true, true);

    drawPlayingCard(
      ctx,
      contentX + contentWidth - 105,
      boxY2 + (boxH - 120) / 2,
      80,
      120,
      '10',
      '♥',
      undefined,
      true,
      'KORA ⚡'
    );

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      (data.comparison.afterTitle || 'MAINTENANT DANS KATIKA ⚡').toUpperCase(),
      contentX + 35,
      boxY2 + 45
    );

    ctx.font = 'bold 25px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    const afterLines = wrapText(ctx, data.comparison.afterText, contentWidth - 160);
    afterLines.slice(0, 3).forEach((line, idx) => {
      ctx.fillText(line, contentX + 35, boxY2 + 90 + idx * 36);
    });
    ctx.restore();
  } else if (data.theme === 'CAROUSEL_SLIDE') {
    // --- THEME: CAROUSEL SLIDE WITH PROGRESS CARDS ---
    const startY = isStory ? contentStartY + 60 : contentStartY + 25;

    const currentStep = data.carouselStep?.current || 1;
    const totalSteps = data.carouselStep?.total || 3;

    ctx.save();
    ctx.textAlign = 'center';
    const dotSpacing = 32;
    const dotsWidth = totalSteps * 18 + (totalSteps - 1) * dotSpacing;
    const dotsStartX = (width - dotsWidth) / 2;

    for (let s = 1; s <= totalSteps; s++) {
      const dx = dotsStartX + (s - 1) * (18 + dotSpacing);
      ctx.fillStyle = s === currentStep ? style.goldAccent : 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(dx + 9, startY, s === currentStep ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`DIAPOSITIVE ${currentStep} / ${totalSteps}`, width / 2, startY + 36);

    // Main Slide Headline
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    const hLines = wrapText(ctx, data.headline, contentWidth);
    hLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + 90 + idx * 52);
    });

    const boxY = startY + 90 + hLines.length * 52 + 20;
    const boxH = isStory ? 540 : 340;

    // Takeaway card box
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // 🌟 Mini decorative card in takeaway box
    drawPlayingCard(
      ctx,
      contentX + contentWidth - 110,
      boxY + 30,
      80,
      120,
      '10',
      '♦',
      `PAS ${currentStep}`,
      false,
      'CONSEIL'
    );

    ctx.textAlign = 'left';
    ctx.font = '26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 160);
    bodyLines.slice(0, isStory ? 10 : 5).forEach((line, idx) => {
      ctx.fillText(line, contentX + 40, boxY + 60 + idx * 44);
    });

    // Next Slide indicator
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.fillText(
      currentStep < totalSteps ? 'Fais glisser pour la suite ➔' : 'Enregistre ce conseil 📌',
      contentX + contentWidth - 40,
      boxY + boxH - 30
    );
    ctx.restore();
  } else if (data.theme === 'TIP_OR_RULE') {
    // --- THEME: TIP OR RULE (PÉDAGOGIQUE & ÉPURÉ) ---
    const startY = isStory ? contentStartY + 60 : isBanner ? contentStartY + 15 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 15;
    const headLines = wrapText(ctx, data.headline || 'Le Conseil Stratégique du Maître', contentWidth);
    headLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + headLines.length * 52 + (isStory ? 45 : 20);
    const boxH = isStory ? 540 : isBanner ? 360 : 360;

    // Content container box
    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // Conseil text
    ctx.textAlign = 'left';
    ctx.font = '25px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 80);
    bodyLines.slice(0, isStory ? 6 : 4).forEach((line, idx) => {
      ctx.fillText(line, contentX + 40, boxY + 55 + idx * 40);
    });

    // 2 Illustrative Master Cards centered below advice
    const illustrY = boxY + boxH - (isStory ? 200 : 155);
    const illustrCardW = isStory ? 95 : 85;
    const illustrCardH = Math.floor(illustrCardW * 1.45);

    drawRotatedPlayingCard(
      ctx,
      width / 2 - 55,
      illustrY + illustrCardH / 2,
      illustrCardW,
      illustrCardH,
      -8,
      '10',
      '♥',
      'LE KOUBI',
      true,
      '10♥',
      false,
      'rgba(239, 68, 68, 0.4)'
    );

    drawRotatedPlayingCard(
      ctx,
      width / 2 + 55,
      illustrY + illustrCardH / 2,
      illustrCardW,
      illustrCardH,
      8,
      '9',
      '♠',
      'LE BLACK',
      true,
      '9♠',
      false,
      'rgba(56, 189, 248, 0.4)'
    );

    ctx.restore();
  } else if (data.theme === 'CULTURE_NJAMBO') {
    // --- THEME: CULTURE DU NJAMBO (PATRIMOINE CAMEROUNAIS) ---
    const startY = isStory ? contentStartY + 60 : isBanner ? contentStartY + 15 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 18;
    const headLines = wrapText(ctx, data.headline || 'Le Lexique et l’Histoire du Njambo', contentWidth);
    headLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + headLines.length * 52 + (isStory ? 45 : 20);
    const boxH = isStory ? 540 : 360;

    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // Text on Left / Master Card on Right
    ctx.textAlign = 'left';
    ctx.font = '25px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 220);
    bodyLines.slice(0, isStory ? 8 : 5).forEach((line, idx) => {
      ctx.fillText(line, contentX + 40, boxY + 65 + idx * 42);
    });

    // Emblematic Card on right
    const culCardW = isStory ? 120 : 110;
    const culCardH = Math.floor(culCardW * 1.45);
    drawRotatedPlayingCard(
      ctx,
      contentX + contentWidth - 110,
      boxY + boxH / 2,
      culCardW,
      culCardH,
      10,
      '10',
      '♦',
      'ZING !',
      true,
      '10♦',
      false,
      'rgba(249, 115, 22, 0.45)'
    );

    ctx.restore();
  } else if (data.theme === 'JOIN_INVITATION') {
    // --- THEME: JOIN INVITATION (ACCUEIL & COMMUNAUTÉ) ---
    const startY = isStory ? contentStartY + 45 : isBanner ? contentStartY + 10 : contentStartY + 15;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 18;
    const headLines = wrapText(ctx, data.headline || 'Les Tables de Njambo sont Ouvertes !', contentWidth);
    headLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + headLines.length * 52 + (isStory ? 35 : 15);
    const boxH = isStory ? 540 : 360;

    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // Eventail des 4 As au centre haut du box
    const fanCenterY = boxY + (isStory ? 160 : 130);
    drawMasterCardsFan(ctx, width / 2, fanCenterY, 85, 125);

    // Message d'invitation sous l'éventail
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const textY = fanCenterY + 115;
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 80);
    bodyLines.slice(0, isStory ? 5 : 3).forEach((line, idx) => {
      ctx.fillText(line, width / 2, textY + idx * 38);
    });

    ctx.restore();
  } else if (data.theme === 'HIGHLIGHT_MOMENT') {
    // --- THEME: HIGHLIGHT MOMENT (ACTION D'ANTHOLOGIE) ---
    const startY = isStory ? contentStartY + 60 : isBanner ? contentStartY + 15 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 18;
    const headLines = wrapText(ctx, data.headline || 'Action d’Anthologie au Tour 5', contentWidth);
    headLines.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + headLines.length * 52 + (isStory ? 45 : 20);
    const boxH = isStory ? 540 : 360;

    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    // Double Carte Choc (Battue vs Victorieuse)
    const cardW = isStory ? 95 : 85;
    const cardH = Math.floor(cardW * 1.45);
    const cardY = boxY + 40;

    drawRotatedPlayingCard(
      ctx,
      width / 2 - 50,
      cardY + cardH / 2,
      cardW,
      cardH,
      -14,
      '8',
      '♠',
      'BATTU',
      false,
      '8♠',
      false,
      'rgba(15, 23, 42, 0.5)'
    );

    drawRotatedPlayingCard(
      ctx,
      width / 2 + 50,
      cardY + cardH / 2 - 10,
      cardW,
      cardH,
      14,
      '10',
      '♥',
      'LE KORA !',
      true,
      '10♥',
      false,
      'rgba(239, 68, 68, 0.55)'
    );

    // Récit de l'action
    ctx.textAlign = 'center';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const textStartY = cardY + cardH + 45;
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 80);
    bodyLines.slice(0, isStory ? 5 : 3).forEach((line, idx) => {
      ctx.fillText(line, width / 2, textStartY + idx * 38);
    });

    ctx.restore();
  } else if (data.theme === 'WELCOME_NEWBIE') {
    const startY = isStory ? contentStartY + 60 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 18;
    const hLines = wrapText(ctx, data.headline || 'Bienvenue au Njambo Kora !', contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 52);
    });
    ctx.shadowBlur = 0;

    const subText = data.mainText || 'Ta première table t\'attend.';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(subText, width / 2, startY + hLines.length * 52 + 20);

    const fanCenterY = startY + hLines.length * 52 + (isStory ? 220 : 150);
    drawMasterCardsFan(ctx, width / 2, fanCenterY, 110, 160);
    ctx.restore();
  } else if (data.theme === 'FIRST_WIN') {
    const startY = isStory ? contentStartY + 60 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 50px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 25;
    const hLines = wrapText(ctx, data.headline || 'Première victoire !', contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 56);
    });
    ctx.shadowBlur = 0;

    const subText = data.mainText || 'Tu entres dans la légende.';
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillStyle = '#f8fafc';
    const subLines = wrapText(ctx, subText, contentWidth - 40);
    subLines.slice(0, 3).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + hLines.length * 56 + 35 + (idx * 36));
    });

    const cardY = startY + hLines.length * 56 + (isStory ? 180 : 130) + (subLines.length * 20);
    drawRotatedPlayingCard(ctx, width / 2 - 80, cardY, 90, 130, -15, '10', '♦', 'ZING');
    drawRotatedPlayingCard(ctx, width / 2 + 80, cardY, 90, 130, 15, '10', '♣', 'TCHAKA');
    drawRotatedPlayingCard(ctx, width / 2, cardY - 20, 100, 145, 0, '10', '♥', 'KOUBI', true, '🏆', true, 'rgba(239,68,68,0.5)');

    ctx.restore();
  } else if (data.theme === 'LIVE_MOMENT' || data.theme === 'TOURNAMENT_LIVE' || data.theme === 'PARTNERSHIP') {
    // New Priority 2 themes, using a generic bold highlight layout
    const startY = isStory ? contentStartY + 60 : contentStartY + 20;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 20;
    const displayHeadline = truncateWords(data.headline || (data.theme === 'LIVE_MOMENT' ? 'Kora en direct !' : 'Tournoi en direct'), 7);
    const hLines = wrapText(ctx, displayHeadline, contentWidth);
    hLines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, width / 2, startY + idx * 54);
    });
    ctx.shadowBlur = 0;

    const boxY = startY + hLines.length * 54 + (isStory ? 35 : 15);
    const boxH = isStory ? 540 : 360;

    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, boxY, contentWidth, boxH, 24, true, true);

    ctx.font = '26px system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 80);
    bodyLines.slice(0, 5).forEach((line, idx) => {
      ctx.fillText(line, width / 2, boxY + 60 + idx * 40);
    });
    ctx.restore();
  } else {
    // --- DEFAULT THEMES (FALLBACK ÉPURÉ) ---
    const startY = isStory ? contentStartY + 90 : contentStartY + 25;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.shadowColor = style.goldSoft;
    ctx.shadowBlur = 15;
    const headLines = wrapText(ctx, data.headline, contentWidth);
    headLines.slice(0, 3).forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * 54);
    });
    ctx.shadowBlur = 0;

    const cardY = startY + headLines.length * 54 + (isStory ? 45 : 20);
    const cardH = isStory ? 560 : 360;

    ctx.fillStyle = style.cardBoxBg;
    ctx.strokeStyle = style.goldBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, contentX, cardY, contentWidth, cardH, 24, true, true);

    ctx.textAlign = 'left';
    ctx.font = '26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const bodyLines = wrapText(ctx, data.mainText, contentWidth - 80);
    bodyLines.slice(0, isStory ? 10 : 6).forEach((line, idx) => {
      ctx.fillText(line, contentX + 40, cardY + 65 + idx * 44);
    });

    ctx.restore();
  }

  // 5. Call To Action Banner (Bottom)
  const ctaY = isStory ? height - 300 : height - 190;
  ctx.save();
  const ctaText = data.ctaText || 'Joue au Njambo Kora en ligne • Gratuit';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  const ctaWidth = Math.min(ctx.measureText(ctaText).width + 80, contentWidth);
  const ctaX = (width - ctaWidth) / 2;

  // CTA button gradient with glowing shadow
  const ctaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaWidth, ctaY + 56);
  ctaGrad.addColorStop(0, style.goldAccent);
  ctaGrad.addColorStop(1, style.goldBorder);
  ctx.fillStyle = ctaGrad;
  ctx.shadowColor = style.goldSoft;
  ctx.shadowBlur = 18;
  roundRect(ctx, ctaX, ctaY, ctaWidth, 54, 27, true, false);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#020617';
  ctx.textAlign = 'center';
  ctx.fillText(ctaText, width / 2, ctaY + 35);
  ctx.restore();

  // 6. Watermark Footer Link with Authentic Card Suits
  const footerY = isStory ? height - 120 : height - 75;
  const appDomain = (data.customAppUrl || NJAMBO_DOMAIN)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  let computedLinkWatermark = data.linkUrl;
  if (!computedLinkWatermark) {
    if (data.includeAppUrl !== false && data.includeWhatsAppUrl) {
      computedLinkWatermark = `${appDomain} • WhatsApp`;
    } else if (data.includeAppUrl !== false) {
      computedLinkWatermark = appDomain;
    } else if (data.includeWhatsAppUrl) {
      computedLinkWatermark = 'Groupe WhatsApp Officiel';
    } else {
      computedLinkWatermark = appDomain;
    }
  }

  if (computedLinkWatermark) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`♠ ♥  ${computedLinkWatermark}  ♦ ♣`, width / 2, footerY);
    ctx.restore();
  }
}

/**
 * Generates PNG data URL directly from SocialVisualCardData
 */
export function renderSocialVisualDataUrl(
  data: SocialVisualCardData,
  format: SocialVisualFormat = 'SQUARE'
): string {
  const canvas = document.createElement('canvas');
  renderSocialVisualToCanvas(canvas, data, format);
  return canvas.toDataURL('image/png');
}

/**
 * Triggers instant browser download of the visual as a PNG file
 */
export function downloadSocialVisualPng(
  data: SocialVisualCardData,
  format: SocialVisualFormat = 'SQUARE',
  filename?: string
): void {
  const dataUrl = renderSocialVisualDataUrl(data, format);
  const a = document.createElement('a');
  const safeTitle = (data.headline || data.theme).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  a.download = filename || `katika_visuel_${safeTitle}_${format.toLowerCase()}.png`;
  a.href = dataUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
