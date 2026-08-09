/**
 * Hangul-dle image mode word pool.
 *
 * Solo Word Chain is an endless "image chain": each round shows a Pixabay vector
 * of the target object (the image is the clue) and the player assembles the
 * Korean word from the tile dock.
 *
 * The pool is built from the Korean-learning noun list (the ~2,600-word set that
 * powers Learn Hangul / Korean Match) plus the original Hangul-dle words,
 * filtered down to concrete, visually distinctive nouns and mapped to an English
 * gloss for the vector search. Abstract concepts (time, finance, admin), generic
 * people/kinship terms (which all render as an anonymous person), and ambiguous
 * clusters (school levels, hospital departments) are intentionally excluded so
 * every round has a clear, guessable illustration.
 */
(function (global) {
  'use strict';

  // Korean answer → English gloss (imageable terms only).
  const POOL = {
    // 2-syllable
    가뭄: 'drought',
    가방: 'bag',
    가을: 'autumn',
    가족: 'family',
    가지: 'eggplant',
    감자: 'potato',
    거실: 'living room',
    거울: 'mirror',
    겨울: 'winter',
    계곡: 'valley',
    계단: 'stairs',
    고추: 'pepper',
    골목: 'alley',
    공사: 'construction',
    공원: 'park',
    공책: 'notebook',
    공항: 'airport',
    과일: 'fruit',
    교복: 'school uniform',
    교실: 'classroom',
    구두: 'leather dress shoes',
    구름: 'cloud',
    그림: 'painting',
    기차: 'train',
    김밥: 'gimbap',
    꽃길: 'flowers',
    나무: 'tree',
    나방: 'moth',
    날씨: 'weather',
    냉면: 'cold noodles',
    노래: 'singing microphone',
    녹차: 'green tea',
    농구: 'basketball',
    다리: 'bridge',
    달력: 'calendar',
    달빛: 'moon',
    당근: 'carrot',
    독서: 'reading book',
    동물: 'animal',
    두부: 'tofu',
    등산: 'hiking',
    라면: 'ramen noodles',
    레몬: 'lemon',
    마늘: 'garlic',
    머리: 'head',
    모자: 'hat',
    무릎: 'knee',
    문서: 'document',
    미역: 'seaweed',
    바다: 'sea',
    바람: 'wind',
    바위: 'rock',
    바지: 'pants',
    반지: 'ring',
    발목: 'ankle',
    배달: 'delivery',
    배추: 'cabbage',
    번개: 'lightning',
    베개: 'pillow',
    별빛: 'star',
    병원: 'hospital',
    복도: 'hallway',
    빨래: 'laundry',
    빵집: 'bakery',
    사과: 'apple',
    사랑: 'heart',
    사자: 'lion',
    사진: 'photo camera',
    산책: 'walking',
    상추: 'lettuce',
    새우: 'shrimp',
    생일: 'birthday',
    서랍: 'drawer',
    서점: 'bookstore',
    선물: 'gift',
    소설: 'novel',
    소파: 'sofa',
    속옷: 'underwear',
    손목: 'wrist',
    수건: 'towel',
    수박: 'watermelon',
    수술: 'surgery',
    수영: 'swimming',
    숫자: 'numbers',
    시계: 'clock',
    시장: 'market',
    신발: 'shoes',
    심장: 'heart organ',
    안개: 'fog',
    안경: 'eyeglasses',
    야구: 'baseball',
    야채: 'vegetables',
    약국: 'pharmacy',
    양말: 'socks',
    양파: 'onion',
    어깨: 'shoulder',
    여권: 'passport',
    여름: 'summer',
    여행: 'travel suitcase',
    연필: 'pencil',
    열쇠: 'key',
    영화: 'movie film',
    오이: 'cucumber',
    요리: 'cooking',
    우산: 'umbrella',
    우유: 'milk',
    우주: 'space',
    우표: 'postage stamp',
    운동: 'exercise',
    은행: 'bank',
    음악: 'music',
    의자: 'chair',
    이불: 'blanket',
    일기: 'diary',
    일식: 'solar eclipse',
    잠옷: 'pajamas',
    장갑: 'gloves',
    장마: 'rainy season',
    전화: 'telephone',
    정장: 'suit',
    조개: 'shellfish',
    졸업: 'graduation',
    주방: 'kitchen',
    주사: 'injection',
    주택: 'house',
    지갑: 'wallet',
    지구: 'planet earth',
    지도: 'map',
    지진: 'earthquake',
    창고: 'warehouse',
    창문: 'window',
    책상: 'desk',
    천둥: 'thunder',
    청소: 'cleaning',
    축구: 'soccer',
    축제: 'festival',
    치마: 'skirt',
    친구: 'friends',
    침대: 'bed',
    커피: 'coffee',
    태양: 'sun',
    태풍: 'typhoon',
    파도: 'wave',
    편지: 'letter envelope',
    포도: 'grape',
    피자: 'pizza',
    하늘: 'sky',
    학교: 'school',
    한복: 'hanbok',
    한식: 'korean food',
    항구: 'port',
    현관: 'front door',
    현금: 'cash money',
    호박: 'pumpkin',
    호수: 'lake',
    홍수: 'flood',
    홍차: 'black tea',
    화살: 'arrow',

    // 3-syllable
    가로등: 'street lamp',
    강아지: 'puppy',
    개나리: 'forsythia',
    거북이: 'turtle',
    결혼식: 'wedding',
    경찰관: 'police officer',
    경찰서: 'police station',
    고구마: 'sweet potato',
    고양이: 'cat',
    공연장: 'performance hall',
    김치전: 'kimchi pancake',
    냉장고: 'refrigerator',
    너구리: 'raccoon',
    놀이터: 'playground',
    눈사람: 'snowman',
    다람쥐: 'squirrel',
    도서관: 'library',
    도시락: 'lunch box',
    동물원: 'zoo',
    된장국: 'miso soup',
    등산로: 'hiking trail',
    떡갈비: 'grilled meat patty',
    떡볶이: 'tteokbokki',
    라면집: 'ramen restaurant',
    무궁화: 'hibiscus flower',
    무지개: 'rainbow',
    미술관: 'art gallery',
    미용실: 'hair salon',
    박물관: 'museum',
    방송국: 'broadcasting station',
    백화점: 'department store',
    보름달: 'full moon',
    불고기: 'bulgogi',
    비빔밥: 'bibimbap',
    비행기: 'airplane',
    사진관: 'photo studio',
    삼겹살: 'grilled pork belly',
    서울역: 'train station',
    선생님: 'teacher',
    선풍기: 'electric fan',
    세탁기: 'washing machine',
    소방관: 'firefighter',
    손수건: 'handkerchief',
    수영장: 'swimming pool',
    신호등: 'traffic light',
    영화관: 'movie theater',
    오징어: 'squid',
    옥수수: 'corn',
    우체국: 'post office',
    운동장: 'sports field',
    운동화: 'sneakers',
    원숭이: 'monkey',
    은행원: 'bank teller',
    음악회: 'concert',
    자동차: 'car',
    자전거: 'bicycle',
    잠자리: 'dragonfly',
    정류장: 'bus stop',
    주차장: 'parking lot',
    지하철: 'subway train',
    진달래: 'azalea',
    책가방: 'school bag',
    청소기: 'vacuum cleaner',
    체육관: 'gymnasium',
    칼국수: 'knife-cut noodles',
    컴퓨터: 'computer',
    코끼리: 'elephant',
    콩나물: 'bean sprouts',
    태권도: 'taekwondo',
    태극기: 'korean flag',
    편의점: 'convenience store',
    한라산: 'mountain',
    호랑이: 'tiger',
    회사원: 'office worker',

    // 4-syllable
    고속도로: 'highway',
    재활용품: 'recyclables',

    // ── 국립국어원 학습용 어휘 확장 (National Institute of Korean Language) ──
    // 1-syllable
    귤: 'tangerine',
    김: 'dried seaweed',
    논: 'rice field',
    닭: 'chicken',
    면: 'noodles',
    벼: 'rice plant',
    섬: 'island',
    성: 'castle',
    숲: 'forest',
    양: 'sheep',
    이: 'tooth',
    자: 'ruler',
    춤: 'dancing',
    칸: 'train car',
    콩: 'soybean',
    팔: 'arm',
    형: 'older brother',
    // 2-syllable
    가게: 'shop',
    강당: 'auditorium',
    강변: 'riverside',
    개미: 'ant',
    건축: 'architecture',
    고속: 'express train',
    공연: 'performance',
    과자: 'snack',
    광장: 'plaza',
    교사: 'teacher',
    국수: 'noodles',
    기름: 'cooking oil',
    기타: 'guitar',
    김치: 'kimchi',
    까치: 'magpie',
    나비: 'butterfly',
    농부: 'farmer',
    농장: 'farm',
    늑대: 'wolf',
    단지: 'apartment complex',
    담요: 'blanket',
    대륙: 'continent',
    도마: 'cutting board',
    동전: 'coin',
    동화: 'fairy tale',
    돼지: 'pig',
    된장: 'soybean paste',
    딸기: 'strawberry',
    모래: 'sand',
    무대: 'stage',
    바퀴: 'wheel',
    밥솥: 'rice cooker',
    배구: 'volleyball',
    배우: 'actor',
    보도: 'sidewalk',
    보리: 'barley',
    볶음: 'stir fry',
    봉투: 'envelope',
    분필: 'chalk',
    사슴: 'deer',
    사탕: 'candy',
    산길: 'mountain trail',
    서류: 'documents',
    선원: 'sailor',
    선장: 'ship captain',
    설날: 'korean new year',
    설탕: 'sugar',
    소금: 'salt',
    소풍: 'picnic',
    수표: 'check',
    시집: 'poetry book',
    식빵: 'bread loaf',
    식탁: 'dining table',
    신랑: 'groom',
    신부: 'bride',
    씨름: 'korean wrestling',
    아기: 'baby',
    아빠: 'dad',
    양식: 'fish farming',
    얼굴: 'face',
    얼음: 'ice',
    엄마: 'mom',
    여우: 'fox',
    연극: 'theater play',
    연기: 'smoke',
    엽서: 'postcard',
    오리: 'duck',
    욕실: 'bathroom',
    우편: 'mail',
    이슬: 'dew',
    인형: 'doll',
    자녀: 'children',
    잔디: 'lawn',
    장미: 'rose',
    장식: 'decoration',
    저울: 'scale',
    전구: 'light bulb',
    정상: 'summit',
    정원: 'garden',
    제비: 'swallow bird',
    조각: 'sculpture',
    조명: 'stage lighting',
    지폐: 'banknote',
    지하: 'subway',
    진료: 'medical exam',
    찌개: 'stew',
    참새: 'sparrow',
    참외: 'korean melon',
    촛불: 'candle',
    추석: 'chuseok harvest festival',
    치아: 'teeth',
    치약: 'toothpaste',
    칠판: 'blackboard',
    침실: 'bedroom',
    탁구: 'table tennis',
    토끼: 'rabbit',
    통장: 'bankbook',
    튀김: 'fried food',
    필통: 'pencil case',
    하천: 'river',
    한문: 'chinese characters',
    항공: 'airplane travel',
    햇빛: 'sunlight',
    화분: 'flower pot',
    // 3-syllable
    게시판: 'bulletin board',
    계산기: 'calculator',
    고추장: 'red chili paste',
    달리기: 'running',
    도자기: 'pottery',
    바구니: 'basket',
    병아리: 'chick',
    복숭아: 'peach',
    볶음밥: 'fried rice',
    비둘기: 'pigeon',
    소나무: 'pine tree',
    송아지: 'calf',
    양배추: 'cabbage',
    어린이: 'child',
    요리사: 'chef',
    잠수함: 'submarine',
    전시회: 'exhibition',
    주머니: 'pocket',
    주전자: 'kettle',
    지우개: 'eraser',
    지하도: 'underpass',
    // 4-syllable
    고춧가루: 'chili powder',
    김치찌개: 'kimchi stew',
    된장찌개: 'soybean paste stew',
    은행나무: 'ginkgo tree',

    // ── TOPIK 상용 어휘 (imageable concrete nouns) ──
    // 1-syllable
    강: 'river',
    개: 'dog',
    공: 'ball',
    귀: 'ear',
    길: 'road',
    꽃: 'flower',
    뇌: 'brain',
    눈: 'snow',
    달: 'moon',
    돌: 'stone',
    떡: 'rice cake',
    말: 'horse',
    목: 'neck',
    문: 'door',
    발: 'foot',
    방: 'room',
    벽: 'wall',
    별: 'star',
    불: 'fire',
    비: 'rain',
    빵: 'bread',
    뼈: 'bone',
    산: 'mountain',
    새: 'bird',
    소: 'cow',
    손: 'hand',
    술: 'alcohol',
    약: 'medicine',
    역: 'train station',
    옷: 'clothes',
    입: 'mouth',
    잎: 'leaf',
    절: 'buddhist temple',
    집: 'house',
    차: 'tea',
    책: 'book',
    칼: 'knife',
    컵: 'cup',
    코: 'nose',
    풀: 'grass',
    해: 'sun',
    흙: 'soil',
    // 2-syllable
    가슴: 'chest',
    건물: 'building',
    경찰: 'police officer',
    고기: 'meat',
    공장: 'factory',
    교회: 'church',
    군인: 'soldier',
    그릇: 'bowl',
    극장: 'theater',
    근육: 'muscle',
    도시: 'city',
    만화: 'comics',
    버스: 'bus',
    부엌: 'kitchen',
    사전: 'dictionary',
    생선: 'fish',
    식당: 'restaurant',
    식물: 'plant',
    신문: 'newspaper',
    음식: 'food',
    의사: 'doctor',
    잡지: 'magazine',
    점심: 'lunch',
    종이: 'paper',
    지붕: 'roof',
    카드: 'card',
    카페: 'cafe',
    허리: 'waist',
    호텔: 'hotel',
    // 3-syllable
    교과서: 'textbook',
    사무실: 'office',
    쓰레기: 'trash',
    아파트: 'apartment',
    카메라: 'camera',
    화장실: 'bathroom',
    // 4-syllable
    텔레비전: 'television',
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

  /**
   * Battle puzzle for round `roundIndex`, offset by a per-match seed so every
   * match starts at a different slice of the pool (otherwise every battle would
   * replay pool positions 0..raceTarget in lap-0 order — the same words each
   * time). Both racers pass the shared matchId, so they stay in lock-step, while
   * the returned `linkIndex` stays the round number to keep scoring/sync intact.
   */
  function getPuzzleForMatch(matchSeed, roundIndex) {
    const len = POOL_KO.length;
    if (!len) return null;
    const round = Math.max(0, Math.floor(Number(roundIndex) || 0));
    const offset = hashSeed(String(matchSeed || '')) % len;
    const pos = offset + round;
    const lap = Math.floor(pos / len);
    const order = orderForLap(lap);
    const answer = order[pos % len];
    const english = POOL[answer] || '';
    const chains = global.RelatedWordsChains;
    const dockTiles = (chains && typeof chains.buildImageDock === 'function')
      ? chains.buildImageDock(answer, POOL_KO, pos)
      : fallbackDock(answer, pos);
    return {
      chainId: 'image',
      chainTitleKey: null,
      linkIndex: round,
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
    getPuzzleForMatch,
    getEnglish: (word) => POOL[String(word || '').trim()] || '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
