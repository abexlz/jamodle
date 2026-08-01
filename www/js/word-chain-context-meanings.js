/**
 * Pick the English gloss that fits the current Word Chain theme.
 * Homonyms (e.g. 연기 = acting / smoke / delay) are scored against chain context.
 */
(function (global) {
  'use strict';

  /**
   * Curated senses for Korean homonyms that appear in Word Chain.
   * `keywords` are chain sibling words, labels, and English theme tokens.
   */
  const HOMONYM_SENSES = {
    연기: [
      {
        meaning: 'acting',
        keywords: [
          '연극', '오페라', '발레', '대본', '무대', '막', '커튼', '조명', '소품',
          '의상', '배우', '주연', '조연', '단역', '공연', 'acting', 'theater',
          'theatre', 'stage', 'actor', 'play', 'drama', 'ballet', 'opera',
        ],
      },
      {
        meaning: 'smoke',
        keywords: [
          '장작', '불씨', '잿불', '구이', '모닥불', '캠프파이어', '침낭', '취사',
          '캠핑', '텐트', '불', 'smoke', 'camp', 'fire', 'ash', 'ember',
        ],
      },
      {
        meaning: 'delay',
        keywords: [
          '일정', '지연', '미루', '연기하다', 'delay', 'postpone', 'defer', 'schedule',
        ],
      },
    ],
    눈: [
      {
        meaning: 'snow',
        keywords: [
          '얼음', '눈사람', '스키', '썰매', '겨울', '비', '바람', '구름', '안개',
          'snow', 'winter', 'ice', 'weather', 'sky', 'seasons',
        ],
      },
      {
        meaning: 'eye',
        keywords: [
          '머리', '얼굴', '코', '입', '몸', '건강', '귀', '손', '발',
          'eye', 'face', 'body', 'health',
        ],
      },
    ],
    배: [
      {
        meaning: 'pear',
        keywords: [
          '사과', '감', '밤', '대추', '과일', '복숭아', '귤', '오렌지', '체리',
          'pear', 'fruit', 'apple',
        ],
      },
      {
        meaning: 'boat',
        keywords: [
          '돛', '닻', '키', '갑판', '선실', '항구', '부두', '선장', '선원', '항해',
          'boat', 'ship', 'sail', 'harbor', 'harbour', 'yacht',
        ],
      },
      {
        meaning: 'stomach',
        keywords: ['몸', '배고프', '소화', 'stomach', 'belly', 'abdomen'],
      },
    ],
    말: [
      {
        meaning: 'horse',
        keywords: [
          '조랑말', '당나귀', '얼룩말', '노새', '낙타', '라마', '황소', '소',
          '송아지', '돼지', '양', '염소', 'horse', 'pony', 'farm', 'animal',
        ],
      },
      {
        meaning: 'speech',
        keywords: ['언어', '대화', '말씀', '글', 'speech', 'word', 'talk', 'language'],
      },
    ],
    차: [
      {
        meaning: 'tea',
        keywords: [
          '녹차', '홍차', '우롱차', '보이차', '허브차', '보리차', '유자차', '우유',
          '주스', '음료', 'tea', 'drink', 'beverage',
        ],
      },
      {
        meaning: 'car',
        keywords: [
          '자동차', '버스', '지하철', '기차', '전기차', '주차장', '충전',
          'car', 'vehicle', 'transport', 'bus', 'train',
        ],
      },
    ],
    밤: [
      {
        meaning: 'chestnut',
        keywords: [
          '사과', '배', '감', '대추', '과일', '복숭아', 'chestnut', 'fruit',
        ],
      },
      {
        meaning: 'night',
        keywords: [
          '달', '별', '은하', '위성', '우주', '행성', 'night', 'moon', 'star', 'space',
        ],
      },
    ],
    굴: [
      {
        meaning: 'oyster',
        keywords: [
          '문어', '오징어', '낙지', '새우', '게', '랍스터', '전복', '홍합', '성게',
          '해삼', '멍게', '해산물', '조개', 'oyster', 'seafood', 'shellfish',
        ],
      },
      {
        meaning: 'cave',
        keywords: [
          '산', '동굴', '바위', '계곡', '등산', 'cave', 'mountain', 'rock',
        ],
      },
    ],
    커튼: [
      {
        meaning: 'curtain',
        keywords: [
          '연극', '오페라', '발레', '연기', '무대', '배우', '대본',
          'theater', 'theatre', 'stage', 'acting', 'play',
        ],
      },
      {
        meaning: 'curtain',
        keywords: [
          '침대', '소파', '책상', '의자', '옷장', '가구', '러그', '조명',
          'furniture', 'home', 'bedroom', 'living',
        ],
      },
    ],
    코트: [
      {
        meaning: 'coat',
        keywords: [
          '눈', '겨울', '옷', '장갑', '모자', '스키', 'coat', 'clothes', 'winter', 'wear',
        ],
      },
      {
        meaning: 'court',
        keywords: [
          '테니스', '라켓', '서브', '포핸드', '백핸드', '코트',
          'court', 'tennis', 'racket', 'racquet',
        ],
      },
    ],
  };

  function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9가-힣+]+/i)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function buildContextTokenSet(context = {}) {
    const tokens = new Set();
    const add = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return;
      tokens.add(normalizeToken(raw));
      tokenize(raw).forEach((t) => tokens.add(t));
    };

    (context.chainWords || []).forEach(add);
    (context.neighborMeanings || []).forEach(add);
    (context.extraTokens || []).forEach(add);
    add(context.chainLabel);
    add(context.chainTitle);
    add(context.chainId);
    return tokens;
  }

  function scoreKeywords(keywords, tokens) {
    let score = 0;
    for (const keyword of keywords || []) {
      const key = normalizeToken(keyword);
      if (!key) continue;
      if (tokens.has(key)) {
        score += 3;
        continue;
      }
      for (const token of tokens) {
        if (!token || token === key) continue;
        if (token.length >= 2 && key.length >= 2 && (token.includes(key) || key.includes(token))) {
          score += 1;
          break;
        }
      }
    }
    return score;
  }

  function scoreSense(sense, tokens) {
    if (!sense) return -1;
    return scoreKeywords(sense.keywords, tokens)
      + scoreKeywords(tokenize(sense.meaning), tokens);
  }

  function pickCuratedSense(word, context) {
    const senses = HOMONYM_SENSES[String(word || '').trim()];
    if (!Array.isArray(senses) || !senses.length) return null;

    const tokens = buildContextTokenSet(context);
    let best = null;
    let bestScore = 0;
    for (const sense of senses) {
      const score = scoreSense(sense, tokens);
      if (score > bestScore) {
        bestScore = score;
        best = sense;
      }
    }
    return bestScore > 0 ? best.meaning : null;
  }

  function candidateText(candidate) {
    if (!candidate) return '';
    if (typeof candidate === 'string') return candidate;
    return [
      candidate.meaning,
      candidate.englishWord,
      candidate.definition,
      candidate.rawDefinitionKo,
    ].filter(Boolean).join(' ');
  }

  function normalizeCandidate(candidate) {
    if (!candidate) return null;
    if (typeof candidate === 'string') {
      const meaning = candidate.trim();
      return meaning ? { meaning } : null;
    }
    const meaning = String(
      candidate.meaning
      || candidate.englishWord
      || candidate.definition
      || ''
    ).trim();
    if (!meaning) return null;
    return {
      meaning,
      englishWord: candidate.englishWord || '',
      definition: candidate.definition || '',
      rawDefinitionKo: candidate.rawDefinitionKo || '',
    };
  }

  function pickBestCandidate(candidates, context) {
    const list = (candidates || []).map(normalizeCandidate).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0].meaning;

    const tokens = buildContextTokenSet(context);
    let best = list[0];
    let bestScore = -1;
    for (const candidate of list) {
      const score = scoreKeywords(tokenize(candidateText(candidate)), tokens);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best.meaning;
  }

  function resolve(word, context, candidates) {
    const curated = pickCuratedSense(word, context);
    if (curated) return curated;
    return pickBestCandidate(candidates, context);
  }

  const api = {
    HOMONYM_SENSES,
    buildContextTokenSet,
    pickCuratedSense,
    pickBestCandidate,
    resolve,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.WordChainContextMeanings = api;
})(typeof window !== 'undefined' ? window : globalThis);
