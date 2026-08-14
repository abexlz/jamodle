/**
 * Unified meaning lookup: curated glossary + learned dictionary cache.
 * English preferred; callers may fall back to hanzi / Korean definitions.
 */
(function (global) {
  'use strict';

  const LS_KEY = 'jamodeul-meaning-glossary-v1';
  const MAX_LEARNED = 2500;

  /**
   * Spreadsheet etymology tags: &독Arbeit, &프cafe, &일ramen, &중…, &이…
   * These are source-language markers, not learner-facing definitions.
   */
  const ETYMOLOGY_GLOSS_RE = /^&\s*[가-힣]{1,4}\s*.+/u;

  function isHanziGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(s);
  }

  function isEtymologyGloss(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return ETYMOLOGY_GLOSS_RE.test(s);
  }

  /**
   * Strip a leading &독 / &프-style tag. Returns '' when nothing useful remains
   * (foreign headword alone is not treated as an English gloss).
   */
  function stripEtymologyTag(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    if (!isEtymologyGloss(s)) return s;
    return '';
  }

  /** Prefer strings that look usable as an English / Latin gloss. */
  function looksLikeEnglishGloss(text) {
    const s = String(text || '').trim();
    if (!s || isHanziGloss(s) || isEtymologyGloss(s)) return false;
    return /[A-Za-z]/.test(s);
  }

  /** True when text is safe to show as a meaning (not etymology junk). */
  function isDisplayableMeaning(text) {
    const s = String(text || '').trim();
    if (!s || isEtymologyGloss(s)) return false;
    return true;
  }

  function readLearned() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  function writeLearned(map) {
    try {
      const keys = Object.keys(map);
      if (keys.length > MAX_LEARNED) {
        const trimmed = {};
        keys.slice(keys.length - MAX_LEARNED).forEach((k) => {
          trimmed[k] = map[k];
        });
        map = trimmed;
      }
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
      /* ignore quota */
    }
  }

  function headword(word) {
    return String(word || '').trim().normalize('NFC');
  }

  function firstEnglishGloss(...candidates) {
    for (const raw of candidates) {
      const text = String(raw || '').trim();
      if (text && looksLikeEnglishGloss(text)) return text;
    }
    return '';
  }

  function getEnglish(word) {
    const q = headword(word);
    if (!q) return '';
    const curated = global.MatchWordMeanings?.[q];
    const chain = global.WordChainEnglish?.getEnglish?.(q);
    const learned = readLearned()[q];
    const english = firstEnglishGloss(curated, chain, learned);
    if (english) return english;
    if (curated && isDisplayableMeaning(curated) && !isHanziGloss(curated)) {
      return String(curated).trim();
    }
    return '';
  }

  function getAnyLocal(word) {
    const q = headword(word);
    if (!q) return '';
    const english = getEnglish(q);
    if (english) return english;
    const curated = global.MatchWordMeanings?.[q];
    if (curated && isDisplayableMeaning(curated)) return String(curated).trim();
    const learned = readLearned()[q];
    if (learned && isDisplayableMeaning(learned)) return String(learned).trim();
    return '';
  }

  function remember(word, meaning) {
    const q = headword(word);
    const text = String(meaning || '').trim();
    if (!q || !text || !looksLikeEnglishGloss(text)) return false;
    if (global.MatchWordMeanings?.[q]) return false;
    const map = readLearned();
    if (map[q] === text) return true;
    map[q] = text;
    writeLearned(map);
    return true;
  }

  /**
   * Direct English source forms for Korean loanwords — too revealing as a MEANING hint.
   * Keys are Korean headwords; values are normalized English spellings to treat as "giveaways".
   */
  const LOANWORD_DIRECT_FORMS = {
    '피자': ['pizza'],
    '카페': ['cafe', 'café', 'coffee'],
    '라면': ['ramen'],
    '레스토랑': ['restaurant'],
    '발레': ['ballet'],
    '장르': ['genre'],
    '마요네즈': ['mayonnaise', 'mayo'],
    '피망': ['piment', 'pimiento', 'pimento'],
    '자장면': ['zhajiangmian', 'jajangmyeon', 'jjajangmyeon'],
    '이데올로기': ['ideologie', 'ideology'],
    '아르바이트': ['arbeit'],
    '버스': ['bus'],
    '택시': ['taxi'],
    '호텔': ['hotel'],
    '커피': ['coffee'],
    '컴퓨터': ['computer'],
    '인터넷': ['internet'],
    '텔레비전': ['television', 'tv'],
    '라디오': ['radio'],
    '카메라': ['camera'],
    '피아노': ['piano'],
    '기타': ['guitar'],
    '오렌지': ['orange'],
    '바나나': ['banana'],
    '샌드위치': ['sandwich'],
    '햄버거': ['hamburger', 'burger'],
    '초콜릿': ['chocolate'],
    '아이스크림': ['icecream', 'ice cream'],
    '주스': ['juice'],
    '샐러드': ['salad'],
    '파스타': ['pasta'],
    '스테이크': ['steak'],
    '슈퍼마켓': ['supermarket'],
    '마트': ['mart'],
    '쇼핑': ['shopping'],
    '뉴스': ['news'],
    '스포츠': ['sports', 'sport'],
    '게임': ['game'],
    '클럽': ['club'],
    '파티': ['party'],
    '쇼': ['show'],
    '드라마': ['drama'],
    '콘서트': ['concert'],
    '티켓': ['ticket'],
    '카드': ['card'],
    '지하철': ['subway', 'metro'],
    '엘리베이터': ['elevator', 'lift'],
    '아파트': ['apartment', 'apart'],
    '빌딩': ['building'],
    '에어컨': ['airconditioner', 'aircon', 'air conditioning'],
    '리모컨': ['remote', 'remotecontrol'],
    '스마트폰': ['smartphone', 'smart phone'],
    '앱': ['app', 'application'],
    '이메일': ['email', 'e-mail'],
    '비밀번호': ['password'],
    '로그인': ['login', 'log in'],
    '바이러스': ['virus'],
    '비타민': ['vitamin'],
    '에너지': ['energy'],
    '스트레스': ['stress'],
    '인터뷰': ['interview'],
    '프로젝트': ['project'],
    '프로그램': ['program', 'programme'],
    '시스템': ['system'],
    '서비스': ['service'],
    '메뉴': ['menu'],
    '테이블': ['table'],
    '포크': ['fork'],
    '나이프': ['knife'],
    '스푼': ['spoon'],
    '컵': ['cup'],
    '잔': ['glass'],
  };

  /** Similar-but-not-identical MEANING hint paraphrases for loanwords. */
  const LOANWORD_HINT_PARAPHRASE = {
    '피자': 'Italian oven-baked dish with toppings',
    '카페': 'small place that serves coffee and snacks',
    '라면': 'noodles cooked quickly in hot broth',
    '레스토랑': 'place where people pay to eat cooked meals',
    '발레': 'graceful dance performed on stage',
    '장르': 'category or style of art or music',
    '마요네즈': 'creamy white sauce for salads and sandwiches',
    '피망': 'mild colorful vegetable used in cooking',
    '자장면': 'noodles topped with a dark bean sauce',
    '이데올로기': 'set of political or social ideas',
    '아르바이트': 'paid work done alongside study',
    '버스': 'large vehicle that carries many passengers',
    '택시': 'car you hire to take you somewhere',
    '호텔': 'building where travelers pay to sleep',
    '커피': 'hot dark drink made from roasted beans',
    '컴퓨터': 'electronic machine for storing and using data',
    '인터넷': 'worldwide network that connects computers',
    '텔레비전': 'screen device for watching broadcast shows',
    '라디오': 'device that plays spoken programs and music',
    '카메라': 'device used to take photographs',
    '피아노': 'large keyboard instrument with black and white keys',
    '기타': 'string instrument often played with the hands',
    '오렌지': 'round citrus fruit with a bright peel',
    '바나나': 'long curved yellow fruit',
    '샌드위치': 'food made with fillings between slices of bread',
    '햄버거': 'cooked patty served in a split bun',
    '초콜릿': 'sweet brown treat made from cacao',
    '아이스크림': 'frozen sweet dessert',
    '주스': 'drink made by squeezing fruit',
    '샐러드': 'cold dish of mixed raw vegetables',
    '파스타': 'Italian food made from dough formed into shapes',
    '스테이크': 'thick slice of meat cooked by grilling',
    '슈퍼마켓': 'large self-service food store',
    '마트': 'store that sells everyday groceries',
    '쇼핑': 'activity of buying things in stores',
    '뉴스': 'reports about recent events',
    '스포츠': 'physical games and athletic contests',
    '게임': 'activity played for fun or competition',
    '클럽': 'group or venue where people gather socially',
    '파티': 'social gathering for celebration',
    '쇼': 'performance put on for an audience',
    '드라마': 'story acted out in episodes',
    '콘서트': 'live music performance for an audience',
    '티켓': 'pass that lets you enter an event',
    '카드': 'small flat piece used for payment or ID',
    '지하철': 'train system that runs underground',
    '엘리베이터': 'box that moves people between building floors',
    '아파트': 'home on one floor of a larger residential building',
    '빌딩': 'tall structure with many rooms or offices',
    '에어컨': 'machine that cools the air indoors',
    '리모컨': 'hand-held device that controls electronics from afar',
    '스마트폰': 'pocket computer that also makes calls',
    '앱': 'small program that runs on a phone',
    '이메일': 'message sent electronically between accounts',
    '비밀번호': 'secret code that unlocks an account',
    '로그인': 'action of signing into an account',
    '바이러스': 'tiny agent that can make people or computers sick',
    '비타민': 'nutrient the body needs in small amounts',
    '에너지': 'power that makes activity or machines possible',
    '스트레스': 'mental or physical tension from pressure',
    '인터뷰': 'formal conversation to ask questions',
    '프로젝트': 'planned piece of work with a goal',
    '프로그램': 'planned set of instructions or a broadcast show',
    '시스템': 'organized set of parts that work together',
    '서비스': 'help or work provided to customers',
    '메뉴': 'list of food and drink choices',
    '테이블': 'furniture with a flat top for eating or working',
    '포크': 'utensil with prongs used for eating',
    '나이프': 'utensil with a blade used for cutting food',
    '스푼': 'utensil used for scooping food or liquid',
    '컵': 'small open container for drinking',
  };

  function normalizeGlossKey(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function primaryGlossToken(text) {
    const first = String(text || '').split(/[/,;|–—]/)[0].trim();
    return normalizeGlossKey(first);
  }

  function isDirectLoanwordHint(word, meaning) {
    const q = String(word || '').trim();
    const text = String(meaning || '').trim();
    if (!q || !text) return false;
    const forms = LOANWORD_DIRECT_FORMS[q];
    if (!forms || !forms.length) return false;
    const key = primaryGlossToken(text);
    const full = normalizeGlossKey(text);
    return forms.some((form) => {
      const nf = normalizeGlossKey(form);
      if (!nf) return false;
      return key === nf
        || full === nf
        || key.startsWith(`${nf} `)
        || full.startsWith(`${nf} `)
        || full === nf;
    });
  }

  /**
   * MEANING-hint display text: if the gloss is basically the loanword's source
   * English, replace with a similar but less direct paraphrase.
   */
  function toHintMeaning(word, meaning) {
    const q = String(word || '').trim();
    const text = String(meaning || '').trim();
    if (!q || !text) return text;
    const paraphrase = LOANWORD_HINT_PARAPHRASE[q];
    if (paraphrase && isDirectLoanwordHint(q, text)) return paraphrase;
    // Prefer paraphrase whenever we have one and the resolved gloss is a short
    // single-token giveaway even if forms list matched partially.
    if (paraphrase) {
      const token = primaryGlossToken(text);
      if (token && !token.includes(' ') && token.length <= 14
        && LOANWORD_DIRECT_FORMS[q]?.some((f) => normalizeGlossKey(f) === token)) {
        return paraphrase;
      }
    }
    return text;
  }

  global.MeaningGlossary = {
    isHanziGloss,
    isEtymologyGloss,
    stripEtymologyTag,
    isDisplayableMeaning,
    looksLikeEnglishGloss,
    getEnglish,
    getAnyLocal,
    remember,
    isDirectLoanwordHint,
    toHintMeaning,
  };
})(typeof window !== 'undefined' ? window : globalThis);
