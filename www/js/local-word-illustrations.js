/**
 * Offline illustration service for Word Chain image mode.
 *
 * Produces a stable, word-specific SVG flashcard locally. No image-search API,
 * remote request, photographer attribution, or variable third-party result is
 * involved in the game path.
 */
(function (global) {
  'use strict';

  const ICON_RULES = [
    [/apple|grape|watermelon|fruit|vegetable|eggplant|potato|carrot|pepper|lemon|garlic|cucumber|onion|pumpkin|corn|cabbage|lettuce|spinach|bean sprouts|parsley|seaweed/, '🍎'],
    [/coffee|tea|milk/, '☕'],
    [/pizza|ramen|noodle|gimbap|tteokbokki|bibimbap|bulgogi|pork|tofu|soup|pancake|korean food|lunch box|bakery/, '🍜'],
    [/cat|puppy|dog|lion|tiger|elephant|monkey|raccoon|squirrel|turtle|moth|dragonfly|squid|shrimp|shellfish|animal|zoo/, '🐱'],
    [/tree|flower|forsythia|azalea|hibiscus|park|valley|mountain|lake|sea|wave|cloud|sky|rainbow|fog|wind|autumn|summer|winter|rainy season|drought|flood|lightning|thunder|typhoon|earthquake/, '🌳'],
    [/sun|moon|star|space|planet|solar eclipse/, '🌞'],
    [/airplane|airport|train|subway|bicycle|car|bus stop|parking lot|highway|travel|station/, '✈️'],
    [/school|classroom|library|bookstore|museum|art gallery|movie theater|concert|performance|theater|gymnasium|playground|sports field/, '🏫'],
    [/hospital|pharmacy|injection|surgery|heart|head|knee|shoulder|wrist|ankle/, '🏥'],
    [/house|home|living room|kitchen|bed|pillow|blanket|sofa|door|hallway|warehouse|stairs|window|drawer|desk|chair/, '🏠'],
    [/bag|wallet|passport|key|umbrella|glasses|hat|shoes|sneakers|socks|gloves|pajamas|underwear|skirt|pants|suit|school uniform|hanbok/, '👜'],
    [/phone|camera|computer|television|video|clock|calendar|map|letter|stamp|notebook|pencil|diary|document|book|numbers/, '📱'],
    [/basketball|baseball|soccer|swimming|hiking|exercise|taekwondo/, '⚽'],
    [/police|firefighter|teacher|bank teller|office worker/, '👩‍🚒'],
    [/traffic light|street lamp|electric fan|washing machine|vacuum cleaner|refrigerator/, '💡'],
    [/market|bank|store|convenience store|department store|port|post office/, '🏪'],
    [/wedding|birthday|festival|gift|graduation/, '🎁'],
    [/korean flag|arrow|cash|money|recyclables/, '🏳️'],
  ];

  const FALLBACK_ICON = '✨';
  const PALETTES = [
    ['#fff4dc', '#ff8a6b', '#17324d'],
    ['#e8f7f5', '#32a6a0', '#163d54'],
    ['#eef1ff', '#7176dc', '#283260'],
    ['#fff0f5', '#e26088', '#522044'],
  ];

  function iconFor(english) {
    const text = String(english || '').toLowerCase();
    const match = ICON_RULES.find(([rule]) => rule.test(text));
    return match ? match[1] : FALLBACK_ICON;
  }

  function paletteFor(word) {
    let hash = 0;
    for (const char of String(word || '')) hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return PALETTES[Math.abs(hash) % PALETTES.length];
  }

  function svgFor(word, english, variant = 0) {
    const [bg, accent, ink] = paletteFor(`${word}:${variant}`);
    const icon = iconFor(english);
    const iconSizes = [284, 252, 316, 268];
    const iconOffsets = [[0, 0], [-38, 12], [36, -8], [0, 20]];
    const [iconX, iconY] = iconOffsets[variant % iconOffsets.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720" role="img" aria-label="">
      <rect width="960" height="720" rx="48" fill="${bg}"/>
      <circle cx="132" cy="132" r="90" fill="${accent}" opacity=".16"/>
      <circle cx="828" cy="588" r="126" fill="${accent}" opacity=".13"/>
      <path d="M180 550c120-72 222-72 300 0s180 72 300 0" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round" opacity=".24"/>
      <rect x="196" y="120" width="568" height="480" rx="72" fill="#fff" stroke="${ink}" stroke-opacity=".13" stroke-width="12"/>
      <text x="${480 + iconX}" y="${454 + iconY}" text-anchor="middle" font-size="${iconSizes[variant % iconSizes.length]}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${icon}</text>
      <circle cx="262" cy="520" r="14" fill="${accent}"/><circle cx="698" cy="520" r="14" fill="${accent}"/>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function looksLikeEnglish(text) {
    return /[a-z]/i.test(String(text || ''));
  }

  function toSearchQuery(koreanWord, englishHint) {
    return String(englishHint || global.RelatedWordsImageMode?.getEnglish?.(koreanWord) || '').trim();
  }

  async function photoForWord(koreanWord, englishHint) {
    const word = String(koreanWord || '').trim();
    const english = toSearchQuery(word, englishHint);
    if (!word) return null;
    const imageSet = ['photo', 'illustration', 'illustration', 'vector'].map((type, index) => ({
      type,
      requestedType: type,
      url: svgFor(word, english, index),
    }));
    return {
      provider: 'local-illustration',
      local: true,
      imageUrl: imageSet[0].url,
      imageSet,
      sourceName: 'Jamodeul illustration',
    };
  }

  global.LocalWordIllustrations = {
    provider: 'local-illustration',
    looksLikeEnglish,
    toSearchQuery,
    photoForWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
