'use strict';

const {
  normalizeSearchItem,
  pickBestMatch,
  pickExactEntry,
  hasExactDictionaryMatch,
} = require('../lib/korean-dictionary');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed += 1;
  else { failed += 1; console.error('FAIL:', msg); }
}

const sampleItem = {
  target_code: '12345',
  word: '고양이',
  sup_no: '0',
  pronunciation: 'go-yang-i',
  word_grade: '초급',
  pos: '명사',
  link: 'https://krdict.korean.go.kr/dicSearch/SearchView?ParaWordNo=12345',
  sense: [{
    sense_order: 1,
    definition: '개과의 포유류.',
    translation: {
      trans_lang: '영어',
      trans_word: 'cat',
      trans_dfn: 'A small domesticated carnivorous mammal.',
    },
  }],
};

const normalized = normalizeSearchItem(sampleItem);
assert(normalized.word === '고양이', 'word');
assert(normalized.partOfSpeech === '명사', 'pos');
assert(normalized.definition.includes('carnivorous'), 'english definition');
assert(normalized.entryId === '12345', 'entryId');

const items = [
  { word: '물', entryId: '1' },
  { word: '물고기', entryId: '2' },
];
assert(pickBestMatch(items, '물').word === '물', 'exact pick');
assert(hasExactDictionaryMatch(items, '물'), 'exact match 물');
assert(!hasExactDictionaryMatch(items, '물고'), 'no partial match');
assert(pickExactEntry(items, '물고기').word === '물고기', 'pick exact entry');

const chineseOnlyItem = {
  target_code: '99999',
  word: '교복',
  pos: '명사',
  sense: [{
    sense_order: 1,
    definition: '학교에서 입는 옷.',
    translation: {
      trans_lang: '중국어',
      trans_word: '校服',
      trans_dfn: '校服',
    },
  }],
};

const chineseOnly = normalizeSearchItem(chineseOnlyItem);
assert(chineseOnly.definition === '', 'no Chinese fallback in definition');
assert(chineseOnly.englishWord === '', 'no Chinese fallback in englishWord');
assert(chineseOnly.rawDefinitionKo.includes('학교'), 'Korean definition kept separately');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
