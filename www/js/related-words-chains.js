/**
 * Related Words chains — thematic word groups (same category/theme per chain).
 * Each chain has exactly 15 words; each step is one word (link 0 = first word, then clue → answer).
 */
(function (global) {
  'use strict';

  const CHAIN_LENGTH = 15;

  /** Minimum words for race/solo play (all chains use CHAIN_LENGTH). */
  const RACE_CHAIN_WORDS = CHAIN_LENGTH;

  const CHAINS = [
    {
      id: 'food-animals', titleKey: 'relatedWords.chains.foodAnimals',
      words: [
        '사과', '바나나', '포도', '딸기', '수박',
        '복숭아', '배', '귤', '오렌지', '체리',
        '키위', '망고', '파인애플', '레몬', '자두',
      ],
    },
    {
      id: 'sky-seasons', titleKey: 'relatedWords.chains.skySeasons',
      words: [
        '해', '달', '별', '행성', '은하',
        '우주', '혜성', '위성', '우주선', '발사',
        '하늘', '구름', '비', '눈', '바람',
      ],
    },
    {
      id: 'school-home', titleKey: 'relatedWords.chains.schoolHome',
      words: [
        '학교', '교실', '강당', '운동장', '도서관',
        '과학', '음악', '미술', '식당', '복도',
        '선생님', '학생', '입학', '졸업', '교복',
      ],
    },
    {
      id: 'people-colors', titleKey: 'relatedWords.chains.peopleColors',
      words: [
        '가족', '부모', '자녀', '형제', '자매',
        '이웃', '손자', '손녀', '사촌', '친척',
        '엄마', '아빠', '할머니', '할아버지', '형',
      ],
    },
    {
      id: 'transport-city', titleKey: 'relatedWords.chains.transportCity',
      words: [
        '자동차', '버스', '지하철', '기차', '비행기',
        '공항', '자전거', '오토바이', '트럭', '택시',
        '요금', '정류장', '주차장', '전기차', '충전',
      ],
    },
    {
      id: 'sports-fun', titleKey: 'relatedWords.chains.sportsFun',
      words: [
        '축구', '야구', '농구', '배구', '테니스',
        '올림픽', '탁구', '볼링', '월드컵', '수영',
        '달리기', '마라톤', '씨름', '유도', '태권도',
      ],
    },
    {
      id: 'kitchen-food', titleKey: 'relatedWords.chains.kitchenFood',
      words: [
        '부엌', '냄비', '프라이팬', '기름', '주전자',
        '젓가락', '숟가락', '국자', '밥솥', '주걱',
        '칼', '도마', '가위', '요리사', '믹서',
      ],
    },
    {
      id: 'clothes-seasons', titleKey: 'relatedWords.chains.clothesSeasons',
      words: [
        '옷', '셔츠', '바지', '치마', '원피스',
        '코트', '구두', '스웨터', '후드', '티셔츠',
        '신발', '조끼', '정장', '양복', '드레스',
      ],
    },
    {
      id: 'animals-nature', titleKey: 'relatedWords.chains.animalsNature',
      words: [
        '곰', '사슴', '다람쥐', '토끼', '여우',
        '늑대', '너구리', '오소리', '족제비', '수달',
        '사자', '호랑이', '표범', '치타', '재규어',
      ],
    },
    {
      id: 'school-study', titleKey: 'relatedWords.chains.schoolStudy',
      words: [
        '국어', '수학', '영어', '과학', '사회',
        '역사', '지리', '음악', '미술', '체육',
        '도덕', '기술', '가정', '한문', '컴퓨터',
      ],
    },
    {
      id: 'music-art', titleKey: 'relatedWords.chains.musicArt',
      words: [
        '음악', '노래', '가사', '멜로디', '화음',
        '리듬', '박자', '악보', '작곡', '작사',
        '피아노', '기타', '바이올린', '드럼', '플루트',
      ],
    },
    {
      id: 'farm-countryside', titleKey: 'relatedWords.chains.farmCountryside',
      words: [
        '소', '돼지', '닭', '오리', '양',
        '염소', '말', '토끼', '개', '고양이',
        '강아지', '송아지', '새끼돼지', '병아리', '새끼양',
      ],
    },
    {
      id: 'rw-morning-school', label: '사과 · 과일',
      words: [
        '사과', '배', '감', '밤', '대추',
        '복숭아', '자두', '포도', '딸기', '수박',
        '참외', '유자', '모과', '석류', '앵두',
      ],
    },
    {
      id: 'rw-night-sleep', label: '침대 · 침실',
      words: [
        '침대', '이불', '베개', '담요', '매트리스',
        '옷장', '서랍', '거울', '스탠드', '알람',
        '커튼', '방', '토퍼', '패드', '커버',
      ],
    },
    {
      id: 'rw-winter-snow', label: '눈 · 겨울',
      words: [
        '눈', '얼음', '눈사람', '스키', '썰매',
        '핫초코', '난로', '목도리', '장갑', '코트',
        '부츠', '귀마개', '스노보드', '빙상', '컬링',
      ],
    },
    {
      id: 'rw-rain-umbrella', label: '비 · 날씨',
      words: [
        '비', '눈', '바람', '구름', '안개',
        '무지개', '번개', '우박', '이슬', '서리',
        '태풍', '황사', '적운', '층운', '권운',
      ],
    },
    {
      id: 'rw-storm-river', label: '해 · 하늘',
      words: [
        '해', '달', '별', '행성', '은하',
        '우주', '혜성', '유성', '위성', '로켓',
        '우주선', '천체', '태양', '햇빛', '일출',
      ],
    },
    {
      id: 'rw-hospital-health', label: '병원 · 병원',
      words: [
        '병원', '의사', '간호사', '약', '주사',
        '반창고', '붕대', '체온계', '청진기', '수술',
        '진료', '처방', '검사', '치료', '재활',
      ],
    },
    {
      id: 'rw-glasses-dream', label: '책 · 책',
      words: [
        '책', '소설', '시집', '동화', '만화',
        '잡지', '신문', '사전', '백과', '교과서',
        '참고서', '자서전', '도서관', '책장', '서가',
      ],
    },
    {
      id: 'rw-classroom-towel', label: '교실 · 교실',
      words: [
        '교실', '칠판', '책상', '의자', '교탁',
        '필통', '지우개', '자', '컴퍼스', '분필',
        '게시판', '시계', '연필', '볼펜', '샤프',
      ],
    },
    {
      id: 'rw-music-heart', label: '피아노 · 악기',
      words: [
        '피아노', '기타', '바이올린', '드럼', '플루트',
        '색소폰', '첼로', '하모니카', '트럼펫', '클라리넷',
        '오르간', '우쿨렐레', '가야금', '거문고', '장구',
      ],
    },
    {
      id: 'rw-art-sweet', label: '그림 · 미술',
      words: [
        '그림', '물감', '붓', '캔버스', '팔레트',
        '스케치', '크레용', '파스텔', '조소', '도자기',
        '판화', '디자인', '회화', '건축', '공예',
      ],
    },
    {
      id: 'rw-cook-meal', label: '밥 · 요리',
      words: [
        '밥', '국', '찌개', '볶음', '구이',
        '튀김', '면', '떡', '김밥', '비빔밥',
        '죽', '볶음밥', '주먹밥', '덮밥', '카레',
      ],
    },
    {
      id: 'rw-cafe-wish', label: '녹차 · 음료',
      words: [
        '차', '녹차', '홍차', '우유', '주스',
        '우롱차', '보이차', '허브차', '캐모마일', '페퍼민트',
        '루이보스', '국화차', '보리차', '옥수수차', '유자차',
      ],
    },
    {
      id: 'rw-zoo-cool', label: '사자 · 동물원',
      words: [
        '사자', '호랑이', '표범', '곰', '늑대',
        '여우', '기린', '코끼리', '하마', '코뿔소',
        '얼룩말', '치타', '영양', '타조', '원숭이',
      ],
    },
    {
      id: 'rw-game-soap', label: '게임 · 게임',
      words: [
        '게임', '퍼즐', '카드', '보드', '체스',
        '바둑', '장기', '인형', '블록', '퀴즈',
        '미로', '오목', '포커', '브리지', '마작',
      ],
    },
    {
      id: 'rw-pc-post', label: '컴퓨터 · 전자기기',
      words: [
        '시계', '계산기', '컴퓨터', '노트북', '태블릿',
        '키보드', '마우스', '모니터', '프린터', '스피커',
        '카메라', '이어폰', '블루투스', '충전기', '스마트폰',
      ],
    },
    {
      id: 'rw-train-wait', label: '기차 · 기차',
      words: [
        '기차', '역', '승강장', '표', '좌석',
        '칸', '기관차', '화물', '고속', '지하',
        '경전철', '모노레일', '지하철', '환승', '노선',
      ],
    },
    {
      id: 'rw-boat-patience', label: '배 · 배',
      words: [
        '돛', '닻', '키', '갑판', '선실',
        '항구', '부두', '선장', '선원', '돛단',
        '마스트', '항해', '정박', '요트클럽', '크루',
      ],
    },
    {
      id: 'rw-camp-morning', label: '텐트 · 캠핑',
      words: [
        '침낭', '모닥불', '취사', '칼', '도마',
        '배낭', '등산', '나이프', '로프', '캠프파이어',
        '장작', '불씨', '연기', '잿불', '구이',
      ],
    },
    {
      id: 'rw-bee-brain', label: '벌 · 곤충',
      words: [
        '벌', '나비', '잠자리', '매미', '귀뚜라미',
        '사슴벌레', '무당벌레', '개미', '메뚜기', '방울벌레',
        '노린재', '호떡벌레', '거미', '지네', '지렁이',
      ],
    },
    {
      id: 'rw-ant-trust', label: '참새 · 새',
      words: [
        '참새', '비둘기', '까치', '제비', '독수리',
        '부엉이', '펭귄', '공작', '앵무새', '백조',
        '오리', '닭', '철새', '원앙', '기러기',
      ],
    },
    {
      id: 'rw-spider-treasure', label: '조개 · 바닷가',
      words: [
        '조개', '홍합', '전복', '굴', '소라',
        '고둥', '게', '새우', '문어', '오징어',
        '미역', '김', '꽃게', '대게', '킹크랩',
      ],
    },
    {
      id: 'rw-horse-self', label: '말 · 말',
      words: [
        '말', '조랑말', '당나귀', '얼룩말', '노새',
        '낙타', '라마', '버팔로', '황소', '소',
        '송아지', '암소', '돼지', '양', '염소',
      ],
    },
    {
      id: 'rw-pig-bird', label: '돼지 · 농장동물',
      words: [
        '돼지', '소', '닭', '오리', '양',
        '염소', '말', '토끼', '개', '고양이',
        '쥐', '참새', '수탉', '암탉', '병아리',
      ],
    },
    {
      id: 'rw-octopus-emotion', label: '문어 · 해산물',
      words: [
        '문어', '오징어', '낙지', '새우', '게',
        '랍스터', '전복', '굴', '홍합', '성게',
        '해삼', '멍게', '튀김', '새우튀김', '고추튀김',
      ],
    },
    {
      id: 'rw-space-rain', label: '우주 · 우주',
      words: [
        '우주', '은하', '성운', '블랙홀', '중성자별',
        '초신성', '행성', '위성', '소행성', '혜성',
        '유성', '궤도', '우주탐사', '로버', '착륙',
      ],
    },
    {
      id: 'rw-vacuum-towel', label: '욕실 · 욕실',
      words: [
        '욕실', '샤워', '욕조', '수건', '비누',
        '샴푸', '린스', '바디', '치약', '칫솔',
        '면도', '거울', '세면대', '변기', '샤워부스',
      ],
    },
    {
      id: 'rw-bro-music', label: '가요 · 대중음악',
      words: [
        '가요', '팝', '록', '재즈', '힙합',
        '발라드', '트로트', '인디', '댄스', '일렉',
        '어쿠스틱', '클래식', '노래', '가사', '멜로디',
      ],
    },
    {
      id: 'rw-actor-joy', label: '연극 · 연극',
      words: [
        '연극', '오페라', '발레', '연기', '대본',
        '무대', '막', '커튼', '조명', '소품',
        '의상', '배우', '주연', '조연', '단역',
      ],
    },
    {
      id: 'rw-swim-treasure', label: '수영 · 수영',
      words: [
        '수영', '자유형', '배영', '평영', '접영',
        '다이빙', '수영장', '레인', '바다', '해변',
        '수영복', '고글', '서핑', '카누', '카약',
      ],
    },
    {
      id: 'rw-tennis-emotion', label: '테니스 · 테니스',
      words: [
        '서브', '포핸드', '백핸드', '발리', '에이스',
        '듀스', '세트', '코트', '라켓', '그립',
        '스매시', '티', '페어웨이', '그린', '홀',
      ],
    },
    {
      id: 'rw-lego-joy', label: '인형 · 장난감',
      words: [
        '블록', '인형', '자동차', '기차', '비행기',
        '공', '공룡', '동물', '봉제', '곰인형',
        '인형극', '옷', '액세서리', '집', '침대',
      ],
    },
    {
      id: 'rw-chopper-shoe', label: '헬리콥터 · 헬기',
      words: [
        '헬리콥터', '회전익', '로터', '테일로터', '이착륙',
        '공중', '수송', '구조', '소방', '관측',
        '전투', '민수', '잠수함', '잠수', '해저',
      ],
    },
    {
      id: 'rw-attic-gift', label: '거실 · 방',
      words: [
        '거실', '침실', '부엌', '욕실', '화장실',
        '베란다', '다락', '지하', '현관', '복도',
        '서재', '다용도', '소파', '테이블', '리모컨',
      ],
    },
    {
      id: 'rw-bath-wind', label: '건강 · 건강',
      words: [
        '건강', '영양', '수면', '운동', '스트레칭',
        '건강검진', '예방', '면역', '체중', '혈압',
        '혈당', '콜레스테롤', '근육', '체력', '식단',
      ],
    },
    {
      id: 'rw-yoga-path', label: '요가 · 요가',
      words: [
        '명상', '스트레칭', '호흡', '자세', '밸런스',
        '마음챙김', '평온', '요가', '필라테스', '웰니스',
        '힐링', '릴렉스', '휴식', '안정', '균형',
      ],
    },
    {
      id: 'rw-robot-hand', label: '로봇 · 로봇',
      words: [
        '학습', '로봇', '드론', '자동화', '인공지능',
        '센서', '모터', '액추에이터', '프로그램', '코딩',
        '알고리즘', '데이터', '머신', '머신러닝', '딥러닝',
      ],
    },
    {
      id: 'rw-bus-market', label: '버스 · 버스',
      words: [
        '시내버스', '마을버스', '광역버스', '고속버스', '셔틀',
        '전세', '관광버스', '학교버스', '정류장', '배차',
        '노선', '미터', '요금', '팁', '기사',
      ],
    },
    {
      id: 'rw-spring-garden', label: '자연 · 계절풍경',
      words: [
        '벚꽃', '개나리', '진달래', '튤립', '장미',
        '해바라기', '백합', '코스모스', '국화', '수선화',
        '민들레', '제비꽃', '바다', '해변', '모래',
      ],
    },
    {
      id: 'rw-pharmacy-exercise', label: '몸 · 건강',
      words: [
        '머리', '얼굴', '눈', '코', '입',
        '귀', '손', '발', '팔', '다리',
        '등', '이', '치아', '잇몸', '칫솔',
      ],
    },
    {
      id: 'rw-homework-knowledge', label: '학교 · 교과체육',
      words: [
        '국어', '수학', '영어', '과학', '사회',
        '역사', '지리', '음악', '미술', '체육',
        '도덕', '기술', '축구', '야구', '농구',
      ],
    },
    {
      id: 'rw-market-rainbow', label: '쇼핑 · 색깔가게',
      words: [
        '빨강', '주황', '노랑', '초록', '파랑',
        '남색', '보라', '분홍', '하양', '검정',
        '회색', '갈색', '백화점', '시장', '가게',
      ],
    },
    {
      id: 'rw-bank-safe', label: '돈 · 사무',
      words: [
        '돈', '동전', '지폐', '지갑', '통장',
        '카드', '수표', '저금', '예금', '이자',
        '환전', '코인', '사무실', '책상', '의자',
      ],
    },
    {
      id: 'rw-park-museum', label: '공원 · 정원',
      words: [
        '공원', '벤치', '분수', '놀이터', '그네',
        '미끄럼틀', '시소', '산책로', '정원', '화단',
        '잔디', '나무', '화분', '울타리', '물주기',
      ],
    },
    {
      id: 'rw-park-tree', label: '나무 · 숲',
      words: [
        '소나무', '참나무', '버드나무', '벚나무', '은행나무',
        '단풍나무', '대나무', '야자수', '올리브', '느티',
        '자작', '포플러', '숲', '정글', '사막',
      ],
    },
    {
      id: 'rw-movie-farm', label: '영화 · 여가',
      words: [
        '영화', '공포', '파티', '생일', '축하',
        '촛불', '선물', '풍선', '장식', '음악',
        '춤', '게임', '사진', '드라마', '애니',
      ],
    },
    {
      id: 'rw-travel-office', label: '여행 · 탈것',
      words: [
        '여행', '관광', '휴가', '숙소', '게스트하우스',
        '캠핑', '배낭', '지도', '여권', '비자',
        '항공', '비행기', '헬리콥터', '기차', '지하철',
      ],
    },
    {
      id: 'rw-bike-health', label: '자전거 · 이륜차',
      words: [
        '자전거', '바퀴', '안장', '핸들', '브레이크',
        '체인', '헬멧', '라이트', '물통', '벨',
        '페달', '프레임', '배기', '엔진', '연료',
      ],
    },
    {
      id: 'rw-hotel-day', label: '숙소 · 농장',
      words: [
        '복도', '객실', '조식', '수영장', '사우나',
        '피트니스', '농장', '밭', '논', '축사',
        '헛간', '트랙터', '괭이', '호미', '물뿌리개',
      ],
    },
    {
      id: 'rw-giraffe-cheer', label: '초원 · 야행동물',
      words: [
        '기린', '얼룩말', '사슴', '영양', '토끼',
        '다람쥐', '청설모', '너구리', '수달', '비버',
        '라마', '양', '부엉이', '올빼미', '박쥐',
      ],
    },
    {
      id: 'rw-rabbit-evening', label: '작은동물 · 민물고기',
      words: [
        '토끼', '다람쥐', '청설모', '쥐', '고슴도치',
        '미니피그', '잉어', '붕어', '메기', '송어',
        '가재', '민물고기', '연어', '은어', '쏘가리',
      ],
    },
    {
      id: 'rw-veg-hungry', label: '채소 · 한식',
      words: [
        '상추', '시금치', '케일', '브로콜리', '양배추',
        '배추', '무', '당근', '감자', '고구마',
        '양파', '마늘', '김치', '된장', '고추장',
      ],
    },
    {
      id: 'rw-bread-shower', label: '빵 · 디저트',
      words: [
        '빵', '식빵', '바게트', '크로와상', '베이글',
        '머핀', '도넛', '쿠키', '파이', '타르트',
        '브리오슈', '사탕', '과자', '초코', '케이크',
      ],
    },
    {
      id: 'rw-noodle-suit', label: '면 · 국물요리',
      words: [
        '라면', '국수', '우동', '소바', '냉면',
        '칼국수', '짜장면', '짬뽕', '쫄면', '비빔면',
        '된장국', '미역국', '김치찌개', '된장찌개', '순두부',
      ],
    },
    {
      id: 'rw-choco-run', label: '주방 · 양념',
      words: [
        '소금', '설탕', '후추', '고춧가루', '마늘',
        '생강', '계피', '바질', '로즈마리', '타임',
        '파슬리', '커민', '냄비', '프라이팬', '주전자',
      ],
    },
    {
      id: 'rw-fire-hike', label: '산 · 바람',
      words: [
        '산', '봉우리', '정상', '등산', '트레킹',
        '백패킹', '암벽', '계곡', '폭포', '숲',
        '산길', '쉼터', '바람', '미풍', '강풍',
      ],
    },
    {
      id: 'rw-rainbow-art', label: '보석 · 암석',
      words: [
        '다이아', '루비', '에메랄드', '사파이어', '진주',
        '호박', '수정', '토파즈', '자수정', '가넷',
        '오팔', '금', '화강암', '대리석', '석회암',
      ],
    },
    {
      id: 'rw-volcano-summer', label: '화산 · 사막',
      words: [
        '화산', '용암', '마그마', '분화', '화산재',
        '온천', '지열', '간헐천', '핫스프링', '뜸',
        '증기', '황', '사막', '모래', '사구',
      ],
    },
    {
      id: 'rw-moon-park', label: '달 · 지구별',
      words: [
        '달', '초승달', '보름달', '그믐달', '월식',
        '위상', '크레이터', '위성', '조석', '밤',
        '별', '은하', '지구', '대륙', '바다',
      ],
    },
    {
      id: 'rw-river-light', label: '강 · 폭포동굴',
      words: [
        '강', '개울', '하천', '유역', '상류',
        '중류', '하류', '강변', '둔치', '섬',
        '교량', '보', '폭포', '낙수', '계곡',
      ],
    },
    {
      id: 'rw-island-seed', label: '섬 · 항구',
      words: [
        '섬', '군도', '반도', '해변', '항구',
        '어촌', '등대', '부두', '선착장', '갯벌',
        '모래사장', '암초', '크레인', '화물', '선박',
      ],
    },
    {
      id: 'rw-bridge-rain', label: '다리 · 터널',
      words: [
        '다리', '현수교', '아치교', '트러스', '교각',
        '교대', '난간', '보도', '차도', '철교',
        '목교', '육교', '터널', '지하도', '지하철',
      ],
    },
    {
      id: 'rw-palace-morning', label: '궁궐 · 전통역사',
      words: [
        '궁궐', '왕궁', '전각', '누각', '정전',
        '사랑채', '행궁', '경복궁', '창덕궁', '덕수궁',
        '경희궁', '창경궁', '성', '성벽', '성곽',
      ],
    },
    {
      id: 'rw-clock-bed', label: '시계 · 시간',
      words: [
        '시계', '초', '분', '시', '날',
        '주', '월', '년', '달력', '일정',
        '알람', '타이머', '손목', '시침', '분침',
      ],
    },
    {
      id: 'rw-letter-laugh', label: '편지 · 통신',
      words: [
        '편지', '엽서', '우편', '우표', '봉투',
        '소포', '택배', '등기', '특급', '우체국',
        '우체부', '배달', '전화', '문자', '이메일',
      ],
    },
    {
      id: 'rw-camera-color', label: '사진 · 방송',
      words: [
        '사진', '렌즈', '필름', '셔터', '조리개',
        '삼각대', '플래시', '액자', '앨범', '셀카',
        '포토', '뉴스', '보도', '예능', '시사',
      ],
    },
    {
      id: 'rw-fridge-sun', label: '가전 · 집안일',
      words: [
        '냉장고', '세탁기', '건조기', '청소기', '가습기',
        '제습기', '정수기', '오븐', '토스터', '믹서',
        '청소', '걸레', '빗자루', '쓰레받기', '진공',
      ],
    },
    {
      id: 'rw-scissors-hand', label: '문구 · 측정',
      words: [
        '가위', '풀', '테이프', '스테이플러', '클립',
        '포스트', '메모', '노트', '파일', '바인더',
        '펜', '마커', '자', '줄자', '저울',
      ],
    },
    {
      id: 'rw-bag-water', label: '가방 · 우산',
      words: [
        '가방', '백팩', '핸드백', '바구니', '주머니',
        '서류', '필통', '지갑', '돈', '은행',
        '카드', '지폐', '결제', '계좌', '쇼핑',
      ],
    },
    {
      id: 'rw-shoe-towel', label: '신발 · 양말',
      words: [
        '운동화', '구두', '샌들', '장화', '부츠',
        '헬멧', '야구모자', '실내화', '군화', '등산화',
        '축구화', '실내화', '양말', '모자', '장갑',
      ],
    },
    {
      id: 'rw-ring-self', label: '가족 · 친구',
      words: [
        '가족', '부모', '자녀', '형제', '자매',
        '조부모', '손자', '손녀', '사촌', '친척',
        '가문', '혈연', '친구', '동료', '이웃',
      ],
    },
    {
      id: 'rw-watch-water', label: '직업 · 감정',
      words: [
        '의사', '간호사', '교사', '경찰', '소방관',
        '요리사', '농부', '어부', '기사', '변호사',
        '회계사', '디자이너', '기쁨', '슬픔', '분노',
      ],
    },
    {
      id: 'rw-family-happy', label: '명절 · 학교행사',
      words: [
        '설날', '추석', '단오', '한식', '크리스마스',
        '생일', '기념일', '축하', '선물', '음식',
        '차례', '세배', '운동회', '축제', '소풍',
      ],
    },
    {
      id: 'rw-neighbor-spring', label: '계절 · 성장',
      words: [
        '봄', '여름', '가을', '겨울', '초봄',
        '늦봄', '초여름', '한여름', '초가을', '늦가을',
        '초겨울', '한겨울', '아기', '유아', '어린이',
      ],
    },
    {
      id: 'rw-teacher-health', label: '사회 · 공공기관',
      words: [
        '교육', '학습', '수업', '강의', '튜터',
        '과외', '학원', '독학', '복습', '예습',
        '시험', '성적', '법', '헌법', '민법',
      ],
    },
    {
      id: 'rw-farmer-color', label: '농사 · 어업',
      words: [
        '벼', '보리', '밀', '옥수수', '콩',
        '팥', '깨', '참깨', '들깨', '고구마',
        '감자', '고추', '어업', '양식', '어장',
      ],
    },
    {
      id: 'rw-scientist-eye', label: '과학 · 문학',
      words: [
        '물리', '화학', '생물', '지구', '천문',
        '수학', '실험', '가설', '이론', '법칙',
        '원소', '분자', '시', '소설', '수필',
      ],
    },
    {
      id: 'rw-festival-rice', label: '축하 · 행사',
      words: [
        '축제', '전시회', '박람회', '자원봉사', '박물관',
        '불꽃놀이', '장터', '공연', '체험', '천막',
        '먹거리', '행사', '결혼', '신랑', '신부',
      ],
    },
    {
      id: 'rw-sports-sand', label: '올림픽 · 소풍',
      words: [
        '올림픽', '메달', '금메달', '은메달', '동메달',
        '기록', '세계', '국가', '개막', '폐막',
        '성화', '경기', '소풍', '도시락', '돗자리',
      ],
    },
    {
      id: 'rw-basement-joy', label: '건물 · 도시시골',
      words: [
        '건물', '아파트', '빌라', '주택', '상가',
        '오피스', '빌딩', '타워', '복합', '단지',
        '동', '호', '도시', '거리', '광장',
      ],
    },
    {
      id: 'rw-basement-eye', label: '가구 · 생활용품',
      words: [
        '소파', '침대', '책상', '의자', '식탁',
        '옷장', '서랍', '선반', '거울', '램프',
        '커튼', '러그', '조명', '전구', '형광등',
      ],
    },
  ];

  function chainLabel(chain) {
    if (!chain) return '';
    if (chain.titleKey) {
      const translated = global.I18n?.t?.(chain.titleKey);
      if (translated && translated !== chain.titleKey) return translated;
    }
    if (chain.label) return chain.label;
    const words = chain.words || [];
    if (words.length >= 2) return `${words[0]} · ${words[words.length - 1]}`;
    return chain.id || '';
  }

  function normalizeChain(chain) {
    const words = (chain.words || []).filter(Boolean).slice(0, CHAIN_LENGTH);
    while (words.length < CHAIN_LENGTH) words.push(words[words.length - 1] || '단어');
    return { ...chain, words };
  }

  const NORMALIZED_CHAINS = CHAINS.map(normalizeChain);

  function splitSyllables(word) {
    return [...word];
  }

  /** 1v1 score for a correct answer: 1–3 pts by syllable length (4+ capped at 3). */
  function relatedWordsRoundPoints(word) {
    const n = splitSyllables(String(word || '').trim()).length;
    if (n <= 0) return 1;
    return Math.min(3, n);
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seedStr) {
    let state = hashSeed(seedStr) || 1;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  function syllableCounts(syllables) {
    const counts = {};
    syllables.forEach((s) => {
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }

  const DOCK_SIZE = 9;

  const GENERIC_DOCK_SYLLABLES = [
    '가', '나', '다', '라', '마', '바', '사', '아', '자', '차',
    '카', '타', '파', '하', '고', '노', '도', '로', '모', '보',
  ];

  function canSpellFromDock(word, dockCounts) {
    const need = syllableCounts(splitSyllables(word));
    return Object.keys(need).every((s) => (dockCounts[s] || 0) >= need[s]);
  }

  /** True when a same-length chain word (not the answer) can be spelled from dock tiles. */
  function dockAllowsAlternateChainWord(dockChars, chainWords, answer) {
    const dockCounts = syllableCounts(dockChars);
    const answerLen = splitSyllables(answer).length;
    for (let i = 0; i < chainWords.length; i++) {
      const word = chainWords[i];
      if (word === answer) continue;
      if (splitSyllables(word).length !== answerLen) continue;
      if (canSpellFromDock(word, dockCounts)) return true;
    }
    return false;
  }

  function shuffleWithRng(items, rng) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDistractorPool(chainWords) {
    const chainSyllables = [];
    chainWords.forEach((w) => {
      splitSyllables(w).forEach((s) => chainSyllables.push(s));
    });
    return chainSyllables;
  }

  function pickSafeDistractor(dock, candidates, chainWords, answer, allowUnsafe) {
    for (let i = 0; i < candidates.length; i++) {
      const pick = candidates[i];
      if (dock.includes(pick)) continue;
      if (allowUnsafe || !dockAllowsAlternateChainWord([...dock, pick], chainWords, answer)) {
        return pick;
      }
    }
    return null;
  }

  function fillDockDistractors(dock, chainWords, answer, chainId, linkIndex) {
    const rng = seededRandom(`${chainId}:${linkIndex}:dock`);
    const chainPool = buildDistractorPool(chainWords);
    const candidateOrder = [
      ...shuffleWithRng(GENERIC_DOCK_SYLLABLES, rng),
      ...shuffleWithRng(chainPool, rng),
    ];

    let guard = 0;
    while (dock.length < DOCK_SIZE && guard < 400) {
      guard += 1;
      const pick = pickSafeDistractor(dock, candidateOrder, chainWords, answer, false);
      if (pick) {
        dock.push(pick);
        continue;
      }
      const fallback = pickSafeDistractor(dock, shuffleWithRng(GENERIC_DOCK_SYLLABLES, rng), chainWords, answer, true);
      if (fallback) {
        dock.push(fallback);
        continue;
      }
      dock.push(GENERIC_DOCK_SYLLABLES[dock.length % GENERIC_DOCK_SYLLABLES.length]);
    }

    for (let i = dock.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dock[i], dock[j]] = [dock[j], dock[i]];
    }

    return dock.slice(0, DOCK_SIZE);
  }

  function buildDock(answer, chainWords, chainId, linkIndex) {
    const answerSyls = splitSyllables(answer);
    const need = syllableCounts(answerSyls);
    const dock = [...answerSyls];

    const have = syllableCounts(dock);
    Object.keys(need).forEach((s) => {
      while ((have[s] || 0) < need[s] && dock.length < DOCK_SIZE) {
        dock.push(s);
        have[s] = (have[s] || 0) + 1;
      }
    });

    const finalDock = fillDockDistractors(dock, chainWords, answer, chainId, linkIndex);
    const finalHave = syllableCounts(finalDock);
    let valid = true;
    Object.keys(need).forEach((s) => {
      if ((finalHave[s] || 0) < need[s]) valid = false;
    });
    if (!valid) {
      const rebuilt = [...answerSyls];
      let poolIndex = 0;
      const fallbackPool = [...GENERIC_DOCK_SYLLABLES, ...buildDistractorPool(chainWords)];
      let guard = 0;
      while (rebuilt.length < DOCK_SIZE && guard < 200) {
        guard += 1;
        const pick = fallbackPool[poolIndex % fallbackPool.length];
        poolIndex += 1;
        if (!rebuilt.includes(pick)) rebuilt.push(pick);
      }
      while (rebuilt.length < DOCK_SIZE) {
        rebuilt.push(GENERIC_DOCK_SYLLABLES[rebuilt.length % GENERIC_DOCK_SYLLABLES.length]);
      }
      return rebuilt.slice(0, DOCK_SIZE).map((char, tileIndex) => ({
        id: `${chainId}-${linkIndex}-${tileIndex}`,
        char,
        used: false,
        slotIndex: null,
      }));
    }

    return finalDock.map((char, tileIndex) => ({
      id: `${chainId}-${linkIndex}-${tileIndex}`,
      char,
      used: false,
      slotIndex: null,
    }));
  }

  function getChain(chainId) {
    return NORMALIZED_CHAINS.find((c) => c.id === chainId) || NORMALIZED_CHAINS[0];
  }

  function getLinkCount(chainId) {
    const chain = getChain(chainId);
    return chain.words.length;
  }

  function getLink(chainId, linkIndex) {
    const chain = getChain(chainId);
    const maxLink = chain.words.length - 1;
    if (linkIndex < 0 || linkIndex > maxLink) return null;
    const answer = chain.words[linkIndex];
    const clue = linkIndex === 0 ? '' : chain.words[linkIndex - 1];
    return {
      chainId: chain.id,
      chainTitleKey: chain.titleKey,
      linkIndex,
      linkCount: getLinkCount(chain.id),
      clue,
      answer,
      answerSyllables: splitSyllables(answer),
      dockTiles: buildDock(answer, chain.words, chain.id, linkIndex),
      recentClues: linkIndex === 0
        ? []
        : chain.words.slice(Math.max(0, linkIndex - 2), linkIndex),
    };
  }

  function isLinkInRange(chainId, linkIndex) {
    const chain = getChain(chainId);
    const idx = Number(linkIndex);
    return Number.isFinite(idx) && idx >= 0 && idx < chain.words.length;
  }

  function getAllChains() {
    return NORMALIZED_CHAINS;
  }

  function resolveRoundPuzzle(globalLinkIndex) {
    const chains = NORMALIZED_CHAINS;
    if (!chains.length) {
      return { chainId: 'food-animals', linkIndex: 0 };
    }
    const idx = Math.max(0, Number(globalLinkIndex) || 0);
    const chain = chains[idx % chains.length];
    const lap = Math.floor(idx / chains.length);
    const linkCount = Math.max(1, getLinkCount(chain.id));
    return {
      chainId: chain.id,
      linkIndex: lap % linkCount,
      globalLinkIndex: idx,
    };
  }

  function pickChain(progress) {
    const completed = Array.isArray(progress.completedChainIds) ? progress.completedChainIds : [];
    const lastId = progress.chainId || '';
    const incomplete = NORMALIZED_CHAINS.filter((c) => !completed.includes(c.id));
    let pool = incomplete.length ? incomplete : NORMALIZED_CHAINS;

    if (pool.length > 1 && lastId) {
      const withoutLast = pool.filter((c) => c.id !== lastId);
      if (withoutLast.length) pool = withoutLast;
    }

    const idx = hashSeed(`${progress.cycles || 0}:${completed.join(',')}:${lastId}`) % pool.length;
    return pool[idx];
  }

  function pickRandomChain(seed) {
    const chains = NORMALIZED_CHAINS;
    if (!chains.length) return 'food-animals';
    if (seed != null && String(seed).length) {
      return chains[hashSeed(String(seed)) % chains.length].id;
    }
    return chains[Math.floor(Math.random() * chains.length)].id;
  }

  global.RelatedWordsChains = {
    CHAINS: NORMALIZED_CHAINS,
    CHAIN_LENGTH,
    RACE_CHAIN_WORDS,
    DOCK_SIZE,
    chainLabel,
    getChain,
    getLink,
    getLinkCount,
    isLinkInRange,
    getAllChains,
    resolveRoundPuzzle,
    pickChain,
    pickRandomChain,
    splitSyllables,
    relatedWordsRoundPoints,
  };
})(typeof window !== 'undefined' ? window : globalThis);