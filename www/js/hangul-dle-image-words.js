/**
 * Hangul-dle image mode word pool.
 *
 * Solo Word Chain no longer uses themed chains — it is an endless "image chain":
 * each round shows a Pixabay vector of the target object (the image is the clue)
 * and the player assembles the Korean word from the tile dock.
 *
 * Words are drawn from the Hangul-dle pool (the WORDS_2 / WORDS_3 lists used by
 * the main Korean Wordle), filtered to concrete, illustratable nouns and mapped
 * to an English gloss for the vector search. Un-illustratable words (days of the
 * week, abstract emotions, time words, broken tokens) are intentionally dropped.
 */
(function (global) {
  'use strict';

  // Korean answer → English gloss (imageable terms only).
  const POOL = {
    // WORDS_2 (2-syllable)
    학교: 'school',
    친구: 'friends',
    가족: 'family',
    나무: 'tree',
    사랑: 'heart',
    하늘: 'sky',
    바다: 'sea',
    커피: 'coffee',
    우유: 'milk',
    동물: 'animal',
    여름: 'summer',
    겨울: 'winter',
    사과: 'apple',
    포도: 'grape',
    수박: 'watermelon',
    노래: 'singing microphone',
    영화: 'movie film',
    사진: 'photo camera',
    그림: 'painting',
    편지: 'letter envelope',
    전화: 'telephone',
    시계: 'clock',
    지도: 'map',
    우산: 'umbrella',
    안경: 'eyeglasses',
    모자: 'hat',
    신발: 'shoes',
    가방: 'bag',
    연필: 'pencil',
    공책: 'notebook',
    책상: 'desk',
    의자: 'chair',
    침대: 'bed',
    창문: 'window',
    지갑: 'wallet',
    열쇠: 'key',
    시장: 'market',
    병원: 'hospital',
    약국: 'pharmacy',
    은행: 'bank',
    공원: 'park',
    운동: 'exercise',
    수영: 'swimming',
    등산: 'hiking',
    여행: 'travel suitcase',
    피자: 'pizza',
    라면: 'ramen noodles',
    김밥: 'gimbap',
    빵집: 'bakery',
    과일: 'fruit',
    야채: 'vegetables',
    달빛: 'moon',
    별빛: 'star',
    꽃길: 'flowers',
    산책: 'walking',
    독서: 'reading book',
    요리: 'cooking',
    청소: 'cleaning',
    주방: 'kitchen',
    빨래: 'laundry',
    세탁: 'washing machine',
    나방: 'moth',
    사자: 'lion',
    우표: 'postage stamp',
    번개: 'lightning',
    현관: 'front door',
    교실: 'classroom',
    교복: 'school uniform',

    // WORDS_3 (3-syllable)
    자전거: 'bicycle',
    컴퓨터: 'computer',
    운동화: 'sneakers',
    비행기: 'airplane',
    자동차: 'car',
    냉장고: 'refrigerator',
    세탁기: 'washing machine',
    도서관: 'library',
    음악회: 'concert',
    미용실: 'hair salon',
    편의점: 'convenience store',
    놀이터: 'playground',
    떡볶이: 'tteokbokki',
    삼겹살: 'grilled pork belly',
    비빔밥: 'bibimbap',
    무지개: 'rainbow',
    거북이: 'turtle',
    고양이: 'cat',
    강아지: 'puppy',
    호랑이: 'tiger',
    코끼리: 'elephant',
    원숭이: 'monkey',
    너구리: 'raccoon',
    다람쥐: 'squirrel',
    미나리: 'parsley',
    라면집: 'ramen restaurant',
    사진관: 'photo studio',
    미술관: 'art gallery',
    박물관: 'museum',
    수영장: 'swimming pool',
    운동장: 'sports field',
    정류장: 'bus stop',
    주차장: 'parking lot',
    지하철: 'subway train',
    신호등: 'traffic light',
    가로등: 'street lamp',
    우체국: 'post office',
    은행원: 'bank teller',
    회사원: 'office worker',
    선생님: 'teacher',
    도시락: 'lunch box',
    보름달: 'full moon',
    눈사람: 'snowman',
    무궁화: 'hibiscus flower',
    한라산: 'mountain',
    태극기: 'korean flag',
    떡갈비: 'grilled meat patty',
    불고기: 'bulgogi',
    된장국: 'miso soup',
    김치전: 'kimchi pancake',
    서울역: 'train station',
    경찰관: 'police officer',
    소방관: 'firefighter',
  };

  const POOL_KO = Object.keys(POOL);

  // Register glosses so the shared image-search pipeline (WordChainEnglish.getEnglish)
  // resolves the correct English term for each answer.
  if (global.WordChainEnglish && global.WordChainEnglish.WORDS) {
    Object.keys(POOL).forEach((ko) => {
      if (!global.WordChainEnglish.WORDS[ko]) {
        global.WordChainEnglish.WORDS[ko] = POOL[ko];
      }
    });
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Deterministic per-lap shuffle: index N always maps to the same word (so
  // progress/resume stays stable) while each full pass reshuffles for variety.
  const orderCache = new Map();
  function orderForLap(lap) {
    if (orderCache.has(lap)) return orderCache.get(lap);
    const arr = POOL_KO.slice();
    let state = hashSeed(`hangul-image:${lap}`) || 1;
    const rng = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    orderCache.set(lap, arr);
    return arr;
  }

  function fallbackDock(answer, index) {
    const syls = [...answer];
    const generic = ['가', '나', '다', '라', '마', '바', '사', '아', '자'];
    const dock = [...syls];
    let gi = 0;
    while (dock.length < 9) {
      dock.push(generic[gi % generic.length]);
      gi += 1;
    }
    return dock.slice(0, 9).map((char, tileIndex) => ({
      id: `image-${index}-${tileIndex}`,
      char,
      used: false,
      slotIndex: null,
    }));
  }

  function getPuzzleByIndex(index) {
    const len = POOL_KO.length;
    if (!len) return null;
    const i = Math.max(0, Math.floor(Number(index) || 0));
    const lap = Math.floor(i / len);
    const order = orderForLap(lap);
    const answer = order[i % len];
    const english = POOL[answer] || '';
    const chains = global.RelatedWordsChains;
    const dockTiles = (chains && typeof chains.buildImageDock === 'function')
      ? chains.buildImageDock(answer, POOL_KO, i)
      : fallbackDock(answer, i);
    return {
      chainId: 'image',
      chainTitleKey: null,
      linkIndex: i,
      linkCount: len,
      clue: '',
      answer,
      answerSyllables: [...answer],
      dockTiles,
      recentClues: [],
      imageMode: true,
      englishHint: english,
    };
  }

  global.HangulDleImageWords = { POOL, POOL_KO };
  global.RelatedWordsImageMode = {
    count: () => POOL_KO.length,
    getPuzzleByIndex,
    getEnglish: (word) => POOL[String(word || '').trim()] || '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
