/**
 * Wordle board for 1v1 race — same jamo scoring / tile layout as index.html practice mode.
 */
(function (global) {
  'use strict';

  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const CONSONANT_ALL = CHO;
  const VOWEL_ALL = ['ㅏ','ㅐ','ㅑ','ㅓ','ㅔ','ㅕ','ㅗ','ㅘ','ㅚ','ㅛ','ㅜ','ㅝ','ㅟ','ㅠ','ㅡ','ㅣ'];
  const REVEAL_STAGGER = 95;
  const TRACKER_RANK = { absent: 0, present: 1, correct: 2 };
  const STACK_VOWELS = new Set(['ㅗ','ㅛ','ㅜ','ㅠ','ㅡ']);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function wt(key, vars) {
    return global.I18n?.t('wordle.game.' + key, vars) ?? '';
  }

  function rt(key, vars) {
    return global.I18n?.t('race.' + key, vars) ?? '';
  }

  function decompose(syllable) {
    const code = syllable.codePointAt(0) - 0xAC00;
    const choIdx = Math.floor(code / (21 * 28));
    const jungIdx = Math.floor((code % (21 * 28)) / 28);
    const jongIdx = code % 28;
    return { cho: CHO[choIdx], jung: JUNG[jungIdx], jong: JONG[jongIdx] };
  }

  function isHangulSyllable(ch) {
    const c = ch.codePointAt(0);
    return c >= 0xAC00 && c <= 0xD7A3;
  }

  function wordToSlots(word) {
    const cho = []; const jung = []; const jong = [];
    for (const ch of word) {
      const d = decompose(ch);
      cho.push(d.cho); jung.push(d.jung); jong.push(d.jong);
    }
    return { cho, jung, jong };
  }

  function vowelLayout(jung) {
    return STACK_VOWELS.has(jung) ? 'stack' : 'side';
  }

  function scoreCategory(guessArr, targetArr) {
    const result = new Array(guessArr.length).fill('absent');
    const targetUsed = new Array(targetArr.length).fill(false);
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] !== '' && guessArr[i] === targetArr[i]) {
        result[i] = 'correct';
        targetUsed[i] = true;
      }
    }
    for (let i = 0; i < guessArr.length; i++) {
      if (result[i] === 'correct') continue;
      if (guessArr[i] === '') {
        result[i] = (targetArr[i] === '') ? 'correct' : 'absent';
        continue;
      }
      for (let j = 0; j < targetArr.length; j++) {
        if (!targetUsed[j] && targetArr[j] === guessArr[i]) {
          result[i] = 'present';
          targetUsed[j] = true;
          break;
        }
      }
    }
    return result;
  }

  function buildConsonantSequences(guessSlots, targetSlots, targetLayout, wordLength) {
    const guess = [];
    const target = [];
    for (let s = 0; s < wordLength; s++) {
      guess.push(guessSlots.cho[s]);
      target.push(targetSlots.cho[s]);
      if (targetLayout[s].hasJong) {
        guess.push(guessSlots.jong[s]);
        target.push(targetSlots.jong[s]);
      }
    }
    return { guess, target };
  }

  function scoreWordGuess(guessSlots, targetSlots, targetLayout, wordLength) {
    const { guess: guessConsonants, target: targetConsonants } = buildConsonantSequences(
      guessSlots, targetSlots, targetLayout, wordLength
    );
    const consonantScores = scoreCategory(guessConsonants, targetConsonants);
    const vowelScores = scoreCategory(guessSlots.jung, targetSlots.jung);

    const choScore = [];
    const jungScore = vowelScores.slice();
    const jongScore = [];
    let ci = 0;
    for (let s = 0; s < wordLength; s++) {
      choScore[s] = consonantScores[ci++];
      jongScore[s] = targetLayout[s].hasJong ? consonantScores[ci++] : '';
    }
    return { choScore, jungScore, jongScore };
  }

  class RaceWordleGame {
    constructor(rootEl, options = {}) {
      this.root = rootEl;
      this.target = options.target || '';
      this.wordLength = options.wordLength || 3;
      this.maxGuesses = options.maxGuesses || 6;
      this.onGuessComplete = options.onGuessComplete || (() => {});
      this.onFinished = options.onFinished || (() => {});
      this.enabled = false;

      this.guesses = [];
      this.over = false;
      this.won = false;
      this.animating = false;
      this.pendingRow = null;
      this.tracker = {};

      this.targetSlots = wordToSlots(this.target);
      this.targetLayout = this.targetSlots.cho.map((_, s) => ({
        hasJong: this.targetSlots.jong[s] !== '',
        vowelType: vowelLayout(this.targetSlots.jung[s]),
      }));

      this.els = {};
      this._localeOff = null;
    }

    applyStaticLabels() {
      if (!this.els.input) return;
      this.els.input.placeholder = rt('inputPlaceholder');
      if (this.els.submit) this.els.submit.textContent = wt('submit');
      const labels = this.root.querySelectorAll('.tracker-label');
      if (labels[0]) labels[0].textContent = wt('consonants');
      if (labels[1]) labels[1].textContent = wt('vowels');
    }

    mount() {
      this.root.innerHTML = `
        <div id="race-input-row">
          <input id="race-guess-input" maxlength="${this.wordLength}" autocomplete="off" />
          <button type="button" id="race-submit-btn"></button>
        </div>
        <div id="race-message"></div>
        <div id="race-board"></div>
        <div id="race-tracker">
          <div class="tracker-label"></div>
          <div class="tracker-row" id="race-consonant-row"></div>
          <div class="tracker-label"></div>
          <div class="tracker-row" id="race-vowel-row"></div>
        </div>
      `;

      this.els = {
        input: this.root.querySelector('#race-guess-input'),
        submit: this.root.querySelector('#race-submit-btn'),
        message: this.root.querySelector('#race-message'),
        board: this.root.querySelector('#race-board'),
        consonantRow: this.root.querySelector('#race-consonant-row'),
        vowelRow: this.root.querySelector('#race-vowel-row'),
        inputRow: this.root.querySelector('#race-input-row'),
      };

      this.applyStaticLabels();
      this._localeOff = global.I18n?.onChange?.(() => this.applyStaticLabels());

      this.els.submit.addEventListener('click', () => this.submitGuess());
      this.els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submitGuess();
      });

      this.renderBoard();
      this.renderTracker();
      this.setEnabled(false);
    }

    setEnabled(on) {
      this.enabled = !!on;
      if (this.els.input) this.els.input.disabled = !on || this.over || this.animating;
      if (this.els.submit) this.els.submit.disabled = !on || this.over || this.animating;
    }

    setMessage(text, type) {
      const el = this.els.message;
      if (!el) return;
      el.textContent = text || '';
      el.className = type ? type : '';
      if (text) el.classList.add('show');
      else el.classList.remove('show');
    }

    shakeInput() {
      const row = this.els.inputRow;
      if (!row) return;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      setTimeout(() => row.classList.remove('shake'), 500);
    }

    getDisplayParts(guess, syl) {
      const parts = ['cho', 'jung'];
      if (this.targetLayout[syl].hasJong) parts.push('jong');
      return parts;
    }

    makeJamoCell(row, syl, part) {
      const cell = document.createElement('div');
      cell.className = 'jamo';
      cell.dataset.row = row;
      cell.dataset.syl = syl;
      cell.dataset.part = part;
      return cell;
    }

    buildSyllableTile(row, syl, guess, isPending) {
      const { hasJong, vowelType } = this.targetLayout[syl];
      const sylDiv = document.createElement('div');
      sylDiv.className = 'syl' + (hasJong ? ' syl-triple' : ' syl-dual');

      const choCell = this.makeJamoCell(row, syl, 'cho');
      const jungCell = this.makeJamoCell(row, syl, 'jung');

      if (guess) {
        choCell.textContent = guess.cho[syl];
        jungCell.textContent = guess.jung[syl];
        this.applyJamoCellState(choCell, guess.choScore[syl], isPending);
        this.applyJamoCellState(jungCell, guess.jungScore[syl], isPending);
      }

      if (vowelType === 'stack') {
        const choRow = document.createElement('div');
        choRow.className = 'syl-row';
        choRow.appendChild(choCell);
        const jungRow = document.createElement('div');
        jungRow.className = 'syl-row';
        jungRow.appendChild(jungCell);
        sylDiv.appendChild(choRow);
        sylDiv.appendChild(jungRow);
      } else {
        const topRow = document.createElement('div');
        topRow.className = 'syl-row';
        topRow.appendChild(choCell);
        topRow.appendChild(jungCell);
        sylDiv.appendChild(topRow);
      }

      if (hasJong) {
        const jongCell = this.makeJamoCell(row, syl, 'jong');
        if (guess) jongCell.textContent = guess.jong[syl];
        this.applyJamoCellState(jongCell, guess ? guess.jongScore[syl] : null, isPending);
        const jongRow = document.createElement('div');
        jongRow.className = 'syl-row syl-row-jong';
        jongRow.appendChild(jongCell);
        sylDiv.appendChild(jongRow);
      }

      return sylDiv;
    }

    applyJamoCellState(cell, score, isPending) {
      if (isPending) cell.classList.add('pending');
      else if (score) cell.classList.add(score);
    }

    renderBoard() {
      const board = this.els.board;
      if (!board) return;
      board.innerHTML = '';
      for (let r = 0; r < this.maxGuesses; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        if (r < this.guesses.length) rowDiv.dataset.guess = String(r);
        const guess = this.guesses[r];
        const isPending = this.pendingRow === r;
        for (let s = 0; s < this.wordLength; s++) {
          rowDiv.appendChild(this.buildSyllableTile(r, s, guess, isPending));
        }
        board.appendChild(rowDiv);
      }
    }

    getJamoCell(row, syl, part) {
      return this.root.querySelector(`.jamo[data-row="${row}"][data-syl="${syl}"][data-part="${part}"]`);
    }

    async revealRow(rowIdx, guess) {
      for (let s = 0; s < this.wordLength; s++) {
        for (const part of this.getDisplayParts(guess, s)) {
          const cell = this.getJamoCell(rowIdx, s, part);
          if (!cell) continue;
          const scoreKey = part + 'Score';
          const score = guess[scoreKey][s];
          cell.classList.remove('pending');
          cell.classList.add('reveal-' + rowIdx, score);
          if (score === 'correct' || score === 'present') cell.classList.add('spark');
          await sleep(REVEAL_STAGGER);
        }
      }
      await sleep(350);
    }

    isJamoInTargetCategory(cat, jamo) {
      if (cat === 'consonant') {
        const set = new Set();
        for (let s = 0; s < this.wordLength; s++) {
          set.add(this.targetSlots.cho[s]);
          if (this.targetSlots.jong[s]) set.add(this.targetSlots.jong[s]);
        }
        return set.has(jamo);
      }
      if (cat === 'vowel') return this.targetSlots.jung.includes(jamo);
      return true;
    }

    renderTracker(updatedKeys) {
      const consonantRow = this.els.consonantRow;
      const vowelRow = this.els.vowelRow;
      if (!consonantRow || !vowelRow) return;
      consonantRow.innerHTML = '';
      vowelRow.innerHTML = '';

      const addKey = (container, cat, jamo) => {
        const el = document.createElement('div');
        el.className = 'tkey';
        const key = cat + ':' + jamo;
        const st = this.tracker[key];
        if (st) el.classList.add(st);
        if (!this.isJamoInTargetCategory(cat, jamo)) el.classList.add('unused');
        if (updatedKeys && updatedKeys.has(key)) el.classList.add('updated');
        el.textContent = jamo;
        container.appendChild(el);
      };

      CONSONANT_ALL.forEach((j) => addKey(consonantRow, 'consonant', j));
      VOWEL_ALL.forEach((j) => addKey(vowelRow, 'vowel', j));
    }

    updateTracker(cat, arr, scores) {
      const updated = new Set();
      arr.forEach((jamo, i) => {
        if (jamo === '') return;
        const key = cat + ':' + jamo;
        const newScore = scores[i];
        const old = this.tracker[key];
        if (!old || TRACKER_RANK[newScore] > TRACKER_RANK[old]) {
          this.tracker[key] = newScore;
          updated.add(key);
        }
      });
      return updated;
    }

    updateTrackerFromWordScores(guessSlots, scores) {
      const updated = new Set();
      const { guess: guessConsonants } = buildConsonantSequences(
        guessSlots, this.targetSlots, this.targetLayout, this.wordLength
      );
      const consonantScores = [];
      for (let s = 0; s < this.wordLength; s++) {
        consonantScores.push(scores.choScore[s]);
        if (this.targetLayout[s].hasJong) consonantScores.push(scores.jongScore[s]);
      }
      this.updateTracker('consonant', guessConsonants, consonantScores).forEach((k) => updated.add(k));
      this.updateTracker('vowel', guessSlots.jung, scores.jungScore).forEach((k) => updated.add(k));
      return updated;
    }

    async submitGuess() {
      if (!this.enabled || this.over || this.animating) return;

      const raw = this.els.input.value.trim();
      const n = this.wordLength;
      const example = n === 2 ? rt('example2') : rt('example3');
      if (raw.length !== n || ![...raw].every(isHangulSyllable)) {
        this.setMessage(rt('invalidInput', { n, example }), 'error');
        this.shakeInput();
        return;
      }

      this.animating = true;
      this.els.submit.classList.add('submitting');
      this.els.input.disabled = true;
      this.els.submit.disabled = true;

      const slots = wordToSlots(raw);
      const scores = scoreWordGuess(slots, this.targetSlots, this.targetLayout, this.wordLength);
      const guessData = {
        word: raw,
        cho: slots.cho, jung: slots.jung, jong: slots.jong,
        ...scores,
      };

      const rowIdx = this.guesses.length;
      this.guesses.push(guessData);
      this.pendingRow = rowIdx;
      this.renderBoard();

      const rowEl = this.els.board.children[rowIdx];
      if (rowEl) rowEl.classList.add('row-enter');

      this.els.input.value = '';
      this.setMessage('');

      await this.revealRow(rowIdx, guessData);

      this.pendingRow = null;
      this.renderBoard();

      const updatedKeys = this.updateTrackerFromWordScores(slots, scores);
      this.renderTracker(updatedKeys);

      this.animating = false;
      this.els.submit.classList.remove('submitting');

      const won = raw === this.target;
      const guessCount = this.guesses.length;

      await this.onGuessComplete({ guessCount, won, elapsedMs: null });

      if (won) {
        this.over = true;
        this.won = true;
        this.setEnabled(false);
        this.onFinished({ won: true, guessCount });
        return;
      }

      if (this.guesses.length >= this.maxGuesses) {
        this.over = true;
        this.won = false;
        this.setEnabled(false);
        this.onFinished({ won: false, guessCount });
        return;
      }

      if (this.enabled) {
        this.els.input.disabled = false;
        this.els.submit.disabled = false;
        this.els.input.focus();
      }
    }

    destroy() {
      if (this._localeOff) {
        this._localeOff();
        this._localeOff = null;
      }
      this.root.innerHTML = '';
    }
  }

  global.RaceWordleGame = RaceWordleGame;
})(typeof window !== 'undefined' ? window : globalThis);
