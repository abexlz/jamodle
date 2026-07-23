/**
 * Jamo Game turn-based 1v1 vs Bot — local match with adjustable win rate.
 * Dev-only. No Firestore; turn state is simulated in-memory.
 */
(function (global) {
  'use strict';

  const RS = () => global.RaceService;
  const RC = () => global.RaceCountdown;
  const CF = () => global.RaceCoinFlip;
  const HUD = () => global.RaceBattleHudUI;
  const HC = () => global.HangulCompose;
  const MY_UID = 'player';
  const BOT_UID = 'bot';
  const COUNTDOWN_SEC = 3;

  const SPEED_PROFILES = {
    slow: {
      stepMin: 1400,
      readMin: 3500,
      readMax: 6500,
      sylPauseMin: 1200,
      sylPauseMax: 2800,
      selectMin: 800,
      selectMax: 1800,
      placeMin: 1600,
      placeMax: 3400,
      rotateMin: 1000,
      rotateMax: 2000,
      rotatePauseMin: 800,
      rotatePauseMax: 1600,
      mergeStepMin: 1400,
      mergeStepMax: 2800,
      longPauseMin: 3200,
      longPauseMax: 6000,
      rethinkMin: 1600,
      rethinkMax: 3200,
      mistakeHoldMin: 2200,
      mistakeHoldMax: 4200,
      betweenMin: 900,
      betweenMax: 2000,
      preCheckMin: 3500,
      preCheckMax: 7000,
      postCheckMin: 4000,
      postCheckMax: 6500,
    },
    medium: {
      stepMin: 1000,
      readMin: 2200,
      readMax: 4500,
      sylPauseMin: 800,
      sylPauseMax: 1800,
      selectMin: 550,
      selectMax: 1300,
      placeMin: 1100,
      placeMax: 2400,
      rotateMin: 700,
      rotateMax: 1400,
      rotatePauseMin: 550,
      rotatePauseMax: 1100,
      mergeStepMin: 900,
      mergeStepMax: 1900,
      longPauseMin: 2000,
      longPauseMax: 3800,
      rethinkMin: 1000,
      rethinkMax: 2200,
      mistakeHoldMin: 1500,
      mistakeHoldMax: 3000,
      betweenMin: 600,
      betweenMax: 1400,
      preCheckMin: 2500,
      preCheckMax: 5000,
      postCheckMin: 3000,
      postCheckMax: 5000,
    },
    fast: {
      stepMin: 650,
      readMin: 1400,
      readMax: 2800,
      sylPauseMin: 500,
      sylPauseMax: 1100,
      selectMin: 380,
      selectMax: 850,
      placeMin: 750,
      placeMax: 1600,
      rotateMin: 500,
      rotateMax: 1000,
      rotatePauseMin: 380,
      rotatePauseMax: 750,
      mergeStepMin: 600,
      mergeStepMax: 1200,
      longPauseMin: 1200,
      longPauseMax: 2400,
      rethinkMin: 650,
      rethinkMax: 1400,
      mistakeHoldMin: 900,
      mistakeHoldMax: 1700,
      betweenMin: 400,
      betweenMax: 900,
      preCheckMin: 1600,
      preCheckMax: 3200,
      postCheckMin: 2200,
      postCheckMax: 3800,
    },
  };

  const WRONG_JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ';

  function rt(key, vars) {
    const t = global.I18n?.t;
    if (!t) return '';
    const turn = t('matchTurn.' + key, vars);
    if (turn) return turn;
    const matchRace = t('matchRace.' + key, vars);
    if (matchRace) return matchRace;
    return t('race.' + key, vars) || '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function placementKey(p) {
    return `${p.syl}:${p.zone}:${p.subIndex ?? 0}`;
  }

  function mergeSharedLocked(existing, payload) {
    const map = new Map();
    (existing || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    const add = (p) => {
      if (!p?.correct || p?.char == null) return;
      const key = placementKey(p);
      const prev = map.get(key);
      map.set(key, {
        syl: p.syl,
        zone: p.zone,
        subIndex: p.subIndex ?? 0,
        char: p.char,
        tileId: p.tileId || prev?.tileId || null,
      });
    };
    (payload?.locked || []).forEach((p) => {
      if (p?.char != null) map.set(placementKey(p), p);
    });
    (payload?.placements || []).forEach(add);
    return [...map.values()];
  }

  function buildTurnHistoryEntry(data, uid, payload, turnNumber) {
    const isP1 = data.player1Uid === uid;
    return {
      turnNumber: turnNumber || data.turnNumber || 1,
      byUid: uid,
      byName: isP1 ? data.player1Name : data.player2Name,
      timedOut: false,
      placements: payload.placements || [],
      correctCount: payload.correctCount || 0,
      totalPlaced: payload.totalPlaced || 0,
      syllableCorrect: payload.syllableCorrect || [],
      syllableCorrectCount: payload.syllableCorrectCount ?? 0,
      syllableTotal: payload.syllableTotal ?? 0,
      locked: payload.locked || [],
    };
  }

  function pickTarget(wordLength, excludeWord) {
    const len = global.MatchWords?.normalizeWordLength?.(wordLength) ?? 4;
    const pool = (global.MatchWords?.getWordsForLength?.(len) || [])
      .filter((w) => !excludeWord || w !== excludeWord);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    const fallback = {
      1: '책', 2: '사과', 3: '고양이', 4: '대학교', 5: '김치찌개', 6: '대한민국',
    };
    return fallback[len] || fallback[4];
  }

  function iterTargetZones(target) {
    const syllables = HC().decomposeWordForMatch(target);
    const zones = [];
    syllables.forEach((sylData, si) => {
      if (sylData.cho) {
        zones.push({ syl: si, zone: 'cho', subIndex: 0, expected: sylData.cho });
      }
      (sylData.vowelSlots || []).forEach((vs) => {
        if (vs.expected) {
          zones.push({
            syl: si,
            zone: vs.zoneType,
            subIndex: vs.subIndex ?? 0,
            expected: vs.expected,
          });
        }
      });
      if (sylData.jong) {
        zones.push({ syl: si, zone: 'jong', subIndex: 0, expected: sylData.jong });
      }
    });
    return zones;
  }

  function pickWrongChar(correct) {
    const options = [...WRONG_JAMO].filter((c) => c !== correct);
    return options[Math.floor(Math.random() * options.length)] || 'ㄱ';
  }

  function buildPlacements(target, locked, { wrong = false, partial = false } = {}) {
    const lockedKeys = new Set((locked || []).map((p) => placementKey(p)));
    const zones = iterTargetZones(target).filter((z) => !lockedKeys.has(placementKey(z)));
    if (!zones.length) return [];

    let activeZones = zones;
    if (partial) {
      const syls = [...new Set(zones.map((z) => z.syl))];
      const syl = syls[Math.floor(Math.random() * syls.length)];
      activeZones = zones.filter((z) => z.syl === syl);
    }

    const placements = activeZones.map((z) => {
      const char = wrong ? pickWrongChar(z.expected) : z.expected;
      const correct = char === z.expected;
      return {
        syl: z.syl,
        zone: z.zone,
        subIndex: z.subIndex,
        char,
        correct,
        locked: false,
        tileId: null,
      };
    });

    if (wrong) {
      const idx = Math.floor(Math.random() * placements.length);
      placements[idx].char = pickWrongChar(placements[idx].expected || activeZones[idx].expected);
      placements[idx].correct = false;
    }

    return placements;
  }

  function computeSyllableMask(placements, target) {
    const syllableTotal = [...target].filter((c) => HC().isHangulSyllable(c)).length;
    const bySyl = new Map();
    placements.forEach((p) => {
      if (!p.correct) return;
      if (!bySyl.has(p.syl)) bySyl.set(p.syl, []);
      bySyl.get(p.syl).push(p);
    });
    const mask = Array(syllableTotal).fill(false);
    bySyl.forEach((items, si) => {
      const expected = iterTargetZones(target).filter((z) => z.syl === si);
      if (!expected.length) return;
      const placed = new Set(items.map((p) => placementKey(p)));
      if (expected.every((z) => placed.has(placementKey(z)))) mask[si] = true;
    });
    return mask;
  }

  function finalizePayload(placements, target, won = false) {
    const correctCount = placements.filter((p) => p.correct).length;
    const syllableCorrect = computeSyllableMask(placements, target);
    return {
      locked: [],
      placements,
      correctCount,
      totalPlaced: placements.length,
      syllableCorrect,
      syllableCorrectCount: syllableCorrect.filter(Boolean).length,
      syllableTotal: syllableCorrect.length,
      won,
      solvedWord: won ? target : undefined,
    };
  }

  function isWinningSubmission(placements, locked, target) {
    const map = new Map();
    (locked || []).forEach((p) => map.set(placementKey(p), p.char));
    placements.forEach((p) => map.set(placementKey(p), p.char));
    return iterTargetZones(target).every((z) => map.get(placementKey(z)) === z.expected);
  }

  /** Full opponent dock at turn start — not serializeBankLiveState (empty in watch mode). */
  function snapshotOpponentBank(game) {
    const inUse = new Set();
    game?.blocks?.forEach((block) => {
      block.getAllZones().forEach((zone) => {
        if (zone.placedTileId) inUse.add(zone.placedTileId);
      });
    });
    const merge = game?.mergeDock?.serializeLiveChars?.();
    (merge?.slotIds || []).forEach((id) => { if (id) inUse.add(id); });
    if (merge?.resultId) inUse.add(merge.resultId);

    return Object.values(game?.tileMap || {})
      .filter((t) => t && !t.locked && !inUse.has(t.id))
      .map((t) => ({ id: t.id, char: t.char }));
  }

  /** Tracks bot dock/board state for realistic live-turn broadcasts. */
  class BotTurnSimulator {
    constructor(game) {
      this.placements = [];
      this.merge = { slots: [null, null], slotIds: [null, null], result: null, resultId: null };
      this.bank = snapshotOpponentBank(game);
      this.onBoard = new Set();
      this.removed = [];
      this.selected = null;
    }

    visibleBank() {
      const inMerge = new Set(this.merge.slotIds.filter(Boolean));
      if (this.merge.resultId) inMerge.add(this.merge.resultId);
      return this.bank.filter((b) => (
        !this.onBoard.has(b.id)
        && !inMerge.has(b.id)
        && !this.removed.includes(b.id)
      ));
    }

    liveState(action = null) {
      return {
        placements: this.placements.map((p) => ({ ...p })),
        merge: {
          slots: [...this.merge.slots],
          slotIds: [...this.merge.slotIds],
          result: this.merge.result,
          resultId: this.merge.resultId,
        },
        bank: this.visibleBank().map((b) => ({ ...b })),
        selected: this.selected ? { ...this.selected } : null,
        removed: [...this.removed],
        action: action ? { ...action } : null,
      };
    }

    findBankTile(char) {
      return this.visibleBank().find((b) => b.char === char)
        || this.bank.find((b) => (
          b.char === char
          && !this.onBoard.has(b.id)
          && !this.removed.includes(b.id)
        ));
    }

    updateBankChar(tileId, char) {
      const entry = this.bank.find((b) => b.id === tileId);
      if (entry) entry.char = char;
    }

    selectBank(tileId) {
      this.selected = { type: 'bank', tileId };
    }

    selectMergeSlot(index) {
      this.selected = { type: 'merge-slot', index };
    }

    selectMergeResult() {
      this.selected = { type: 'merge-result' };
    }

    useTile(tileId) {
      this.onBoard.add(tileId);
    }

    placeZone(syl, zone, subIndex, char) {
      const key = placementKey({ syl, zone, subIndex });
      this.placements = this.placements.filter((p) => placementKey(p) !== key);
      this.placements.push({ syl, zone, subIndex: subIndex ?? 0, char });
      this.selected = null;
    }

    clearZone(syl, zone, subIndex) {
      const key = placementKey({ syl, zone, subIndex });
      this.placements = this.placements.filter((p) => placementKey(p) !== key);
      this.selected = null;
    }

    setMergeSlot(index, tileId, char) {
      this.merge.slots[index] = char;
      this.merge.slotIds[index] = tileId;
      this.onBoard.add(tileId);
      this.selected = null;
    }

    commitMerge(resultChar, resultId, ingredientIds) {
      ingredientIds.forEach((id) => {
        if (!id) return;
        this.removed.push(id);
        this.onBoard.delete(id);
      });
      this.merge.slots = [null, null];
      this.merge.slotIds = [null, null];
      this.merge.result = resultChar;
      this.merge.resultId = resultId;
      if (!this.bank.find((b) => b.id === resultId)) {
        this.bank.push({ id: resultId, char: resultChar });
      } else {
        this.updateBankChar(resultId, resultChar);
      }
      this.selected = null;
    }

    pickWrongZone(zones, correctZone) {
      const sameSyl = zones.filter((z) => (
        z.syl === correctZone.syl
        && placementKey(z) !== placementKey(correctZone)
      ));
      if (sameSyl.length) {
        return sameSyl[Math.floor(Math.random() * sameSyl.length)];
      }
      const others = zones.filter((z) => placementKey(z) !== placementKey(correctZone));
      return others[Math.floor(Math.random() * others.length)] || correctZone;
    }
  }

  function buildHumanBotTurnScript(game, target, locked, winRate, speed) {
    const profile = SPEED_PROFILES[speed] || SPEED_PROFILES.medium;
    const sim = new BotTurnSimulator(game);
    const script = [];
    let t = 0;
    let actionSeq = 0;

    const push = (delay, mutate, actionKind, actionDetail = {}) => {
      t += Math.max(delay, profile.stepMin || 800);
      if (mutate) mutate();
      const action = actionKind
        ? { seq: ++actionSeq, kind: actionKind, ...actionDetail }
        : null;
      script.push({ at: t, live: sim.liveState(action) });
    };

    // Show the opponent's full dock before they start moving.
    script.push({ at: 0, live: sim.liveState() });

    t += randRange(profile.readMin, profile.readMax);

    const lockedKeys = new Set((locked || []).map((p) => placementKey(p)));
    const allZones = iterTargetZones(target);
    const zones = allZones.filter((z) => !lockedKeys.has(placementKey(z)));
    if (!zones.length) {
      return { script, payload: finalizePayload([], target, false), totalMs: t };
    }

    const wrongChance = lerp(0.5, 0.1, winRate);
    const solveChance = lerp(0.15, 0.7, winRate);
    const stumbleChance = lerp(0.3, 0.06, winRate);
    const makesWrongFinal = Math.random() < wrongChance;
    const triesSolve = !makesWrongFinal && Math.random() < solveChance;

    let finalPlacements;
    let won = false;
    if (triesSolve) {
      finalPlacements = buildPlacements(target, locked, { wrong: false, partial: false });
      won = isWinningSubmission(finalPlacements, locked, target);
      if (!won) finalPlacements = buildPlacements(target, locked, { wrong: false, partial: true });
    } else if (makesWrongFinal) {
      finalPlacements = buildPlacements(target, locked, { wrong: true, partial: false });
    } else {
      finalPlacements = buildPlacements(target, locked, { wrong: false, partial: true });
    }

    const finalMap = new Map(finalPlacements.map((p) => [placementKey(p), p]));
    const bySyl = new Map();
    zones.forEach((z) => {
      if (!bySyl.has(z.syl)) bySyl.set(z.syl, []);
      bySyl.get(z.syl).push(z);
    });

    const syllables = HC().decomposeWordForMatch(target);

    const scheduleRotateToChar = (tile, goalChar) => {
      if (!tile) return;
      if (!HC().canRotateJamo?.(tile.char)) {
        push(randRange(profile.selectMin, profile.selectMax), () => {
          sim.selectBank(tile.id);
        }, 'select', { selected: { type: 'bank', tileId: tile.id } });
        return;
      }
      const wrongRot = tile.char !== goalChar && Math.random() < lerp(0.4, 0.1, winRate);
      if (!wrongRot) {
        push(randRange(profile.selectMin, profile.selectMax), () => {
          sim.selectBank(tile.id);
        }, 'select', { selected: { type: 'bank', tileId: tile.id } });
        return;
      }
      const wrongChar = HC().rotateJamo(tile.char) || pickWrongChar(goalChar);
      push(randRange(profile.selectMin, profile.selectMax), () => {
        sim.selectBank(tile.id);
      }, 'select', { selected: { type: 'bank', tileId: tile.id } });
      push(randRange(profile.rotateMin, profile.rotateMax), () => {
        sim.updateBankChar(tile.id, wrongChar);
      }, 'rotate', { tileId: tile.id, at: { type: 'bank', tileId: tile.id } });
      t += randRange(profile.rotatePauseMin, profile.rotatePauseMax);
      if (wrongChar !== goalChar) {
        push(randRange(profile.rotateMin, profile.rotateMax), () => {
          sim.updateBankChar(tile.id, goalChar);
        }, 'rotate', { tileId: tile.id, at: { type: 'bank', tileId: tile.id } });
      }
      push(randRange(profile.selectMin, profile.selectMax), () => {
        sim.selectBank(tile.id);
      }, 'select', { selected: { type: 'bank', tileId: tile.id } });
    };

    const schedulePlaceChar = (zone, char, tileId) => {
      push(randRange(profile.placeMin, profile.placeMax), () => {
        if (tileId) sim.useTile(tileId);
        sim.placeZone(zone.syl, zone.zone, zone.subIndex, char);
      }, 'move');
    };

    const scheduleMergeAndPlace = (zone, goalChar, sylData) => {
      const components = (HC().getMedialComponents?.(sylData.jung) || [])
        .filter((c) => HC().PLACEABLE_VERTICAL_VOWELS?.has(c));
      if (components.length < 2) {
        const tile = sim.findBankTile(goalChar);
        if (tile) scheduleRotateToChar(tile, goalChar);
        schedulePlaceChar(zone, goalChar, tile?.id);
        return;
      }

      const [left, right] = components;
      const leftTile = sim.findBankTile(left);
      const rightTile = sim.findBankTile(right);
      if (!leftTile || !rightTile) {
        schedulePlaceChar(zone, goalChar, null);
        return;
      }

      push(randRange(profile.selectMin, profile.selectMax), () => {
        sim.selectBank(leftTile.id);
      }, 'select', { selected: { type: 'bank', tileId: leftTile.id } });
      push(randRange(profile.mergeStepMin, profile.mergeStepMax), () => {
        sim.setMergeSlot(0, leftTile.id, left);
      }, 'move');

      push(randRange(profile.selectMin, profile.selectMax), () => {
        sim.selectBank(rightTile.id);
      }, 'select', { selected: { type: 'bank', tileId: rightTile.id } });
      push(randRange(profile.mergeStepMin, profile.mergeStepMax), () => {
        sim.setMergeSlot(1, rightTile.id, right);
      }, 'move');

      t += randRange(profile.rotatePauseMin, profile.rotatePauseMax);
      const resultId = `bot-merge-${leftTile.id}-${rightTile.id}`;
      push(randRange(profile.mergeStepMin, profile.mergeStepMax), () => {
        sim.commitMerge(goalChar, resultId, [leftTile.id, rightTile.id]);
      }, 'merge', { ingredientIds: [leftTile.id, rightTile.id] });

      push(randRange(profile.selectMin, profile.selectMax), () => {
        sim.selectMergeResult();
      }, 'select', { selected: { type: 'merge-result' } });
      schedulePlaceChar(zone, goalChar, resultId);
    };

    [...bySyl.entries()].forEach(([, sylZones]) => {
      const planned = sylZones.filter((z) => finalMap.has(placementKey(z)));
      if (!planned.length) return;

      t += randRange(profile.sylPauseMin, profile.sylPauseMax);
      if (Math.random() < stumbleChance) {
        t += randRange(profile.longPauseMin, profile.longPauseMax);
      }

      const mistakeRate = lerp(0.42, 0.1, winRate);
      if (Math.random() < mistakeRate) {
        const correctZone = planned[0];
        const wrongZone = sim.pickWrongZone(allZones, correctZone);
        const wrongChar = pickWrongChar(correctZone.expected);
        const wrongTile = sim.findBankTile(wrongChar) || sim.findBankTile(pickWrongChar(wrongChar));
        if (wrongTile) {
          push(randRange(profile.selectMin, profile.selectMax), () => {
            sim.selectBank(wrongTile.id);
          }, 'select', { selected: { type: 'bank', tileId: wrongTile.id } });
        }
        push(randRange(profile.placeMin, profile.placeMax), () => {
          if (wrongTile) sim.useTile(wrongTile.id);
          sim.placeZone(wrongZone.syl, wrongZone.zone, wrongZone.subIndex, wrongChar);
        }, 'move');
        t += randRange(profile.mistakeHoldMin, profile.mistakeHoldMax);
        push(randRange(profile.placeMin, profile.placeMax), () => {
          sim.clearZone(wrongZone.syl, wrongZone.zone, wrongZone.subIndex);
          if (wrongTile) sim.onBoard.delete(wrongTile.id);
        }, 'move');
        t += randRange(profile.rethinkMin, profile.rethinkMax);
      }

      planned.forEach((zone) => {
        const fin = finalMap.get(placementKey(zone));
        if (!fin) return;
        const sylData = syllables[zone.syl];
        const needsMerge = zone.zone === 'jungV'
          && sylData
          && HC().isVerticalMergeMedial?.(sylData.jung);

        if (needsMerge) {
          scheduleMergeAndPlace(zone, fin.char, sylData);
        } else {
          const tile = sim.findBankTile(fin.char);
          if (tile) scheduleRotateToChar(tile, fin.char);
          schedulePlaceChar(zone, fin.char, tile?.id);
        }

        t += randRange(profile.betweenMin, profile.betweenMax);
      });
    });

    t += randRange(profile.preCheckMin, profile.preCheckMax);
    push(0, () => {
      sim.placements = finalPlacements.map((p) => ({
        syl: p.syl,
        zone: p.zone,
        subIndex: p.subIndex ?? 0,
        char: p.char,
      }));
      sim.selected = null;
      sim.merge = { slots: [null, null], slotIds: [null, null], result: null, resultId: null };
    }, 'checking');

    return {
      script,
      payload: finalizePayload(finalPlacements, target, won),
      totalMs: t + randRange(profile.postCheckMin, profile.postCheckMax),
    };
  }

  function parseBotProfileFromParams(params) {
    const name = String(params.get('name') || '').trim();
    if (!name) return null;
    const BS = () => global.BadgeService;
    const avatarId = String(params.get('avatarId') || 'default');
    const frameId = String(params.get('frameId') || 'none');
    const level = Number(params.get('level'));
    return {
      name,
      avatarId,
      avatarIcon: BS()?.getAvatarDef?.(avatarId)?.icon || '🌸',
      frameId,
      level: Number.isFinite(level) && level > 0 ? level : 5,
      xpInLevel: 20 + Math.floor(Math.random() * 60),
      xpToNext: 100,
      totalXp: (Number.isFinite(level) ? level : 5) * 120,
    };
  }

  class MatchTurnBotApp {
    constructor(rootEl) {
      this.root = rootEl;
      const params = new URLSearchParams(global.location.search);
      this.source = String(params.get('source') || '');
      this.isMatchmakingBot = this.source === 'matchmaking';
      this.botProfile = parseBotProfileFromParams(params);
      const wr = Number(params.get('winrate'));
      this.winRate = Number.isFinite(wr) ? Math.min(100, Math.max(0, wr)) / 100 : 0.5;
      const speedParam = String(params.get('speed') || 'medium').toLowerCase();
      this.speed = SPEED_PROFILES[speedParam] ? speedParam : 'medium';
      const wl = Number(params.get('wordLength'));
      this.wordLength = global.MatchWords?.normalizeWordLength?.(wl) ?? 4;
      this.matchId = `bot-${Date.now()}`;

      this.game = null;
      this.els = null;
      this.matchData = null;
      this.countdownDone = false;
      this.gameStarted = false;
      this.preparedTurnNumber = null;
      this.pendingTurnSubmit = false;
      this._playedRevealKey = null;
      this._prevTurnBoundaryKey = null;
      this._turnSwapTimer = null;
      this._lastUrgencySec = null;
      this._turnLocalKey = null;
      this._turnLocalStartMs = null;
      this._observedAnyTurn = false;
      this._resultsRendered = false;
      this.turnTimer = null;
      this.countdownTimer = null;
      this._botTimers = [];
      this._botTurnRunning = false;
      this._botScheduledTurnKey = null;
      this._localeOff = null;
      this._lastRoundKey = null;
      this._roundBreakTimer = null;
    }

    myUid() {
      return MY_UID;
    }

    botName() {
      if (this.botProfile?.name) return this.botProfile.name;
      const speedLabel = this.speed.charAt(0).toUpperCase() + this.speed.slice(1);
      return `🤖 Bot ${Math.round(this.winRate * 100)}% · ${speedLabel}`;
    }

    botSummary() {
      if (!this.botProfile) {
        return {
          name: this.botName(),
          displayName: this.botName(),
          avatarId: 'default',
          avatarIcon: '🤖',
          frameId: 'none',
          level: 1,
          xpInLevel: 0,
          xpToNext: 100,
          totalXp: 0,
        };
      }
      return {
        name: this.botProfile.name,
        displayName: this.botProfile.name,
        avatarId: this.botProfile.avatarId,
        avatarIcon: this.botProfile.avatarIcon,
        frameId: this.botProfile.frameId,
        level: this.botProfile.level,
        xpInLevel: this.botProfile.xpInLevel,
        xpToNext: this.botProfile.xpToNext,
        totalXp: this.botProfile.totalXp,
      };
    }

    renderBotOpponentCard() {
      if (!this.els?.oppCard) return;
      const summary = this.botSummary();
      global.MatchEmotes?.renderOpponentBattleCard?.(this.els.oppCard, summary);
      if (this.els.oppName) this.els.oppName.textContent = summary.name;
      this.els.oppCard.dataset.loadedUid = BOT_UID;
    }

    speedProfile() {
      return SPEED_PROFILES[this.speed] || SPEED_PROFILES.medium;
    }

    async init() {
      this._localeOff = global.I18n?.onChange?.(() => this.onLocaleChange());
      document.title = rt('pageTitle');
      this.renderShell();

      if (global.DevBuild && !global.DevBuild.isDevModeActive() && !this.isMatchmakingBot) {
        this.renderMain(`
          <div class="race-panel">
            <p class="race-panel-msg">Bot fight is only available in dev mode.</p>
            <a class="race-btn" href="index.html">← Home</a>
          </div>
        `);
        return;
      }

      const target = pickTarget(this.wordLength);
      const roundStarter = RS().flipCoinStarter(MY_UID, BOT_UID, this.matchId, 1);
      this.matchData = {
        gameType: RS().GAME_TYPES.koreanMatch,
        playMode: RS().PLAY_MODES.turn,
        status: 'active',
        target,
        wordLength: this.wordLength,
        player1Uid: MY_UID,
        player2Uid: BOT_UID,
        player1Name: rt('me'),
        player2Name: this.botName(),
        currentTurnUid: roundStarter,
        coinFlipStarterUid: roundStarter,
        turnNumber: 1,
        turnDurationMs: RS().turnDurationForLength(this.wordLength),
        turnPhase: RS().TURN_PHASES.playing,
        sharedState: RS().defaultSharedState(),
        turnHistory: [],
        lastTurnReveal: null,
        turnLive: null,
        seriesTarget: RS().KOREAN_TURN_SERIES_TARGET,
        seriesScore: RS().defaultSeriesScore(),
        roundNumber: 1,
      };

      this.renderMain(`<div class="race-panel race-countdown-panel"><p class="race-panel-title">${escapeHtml(rt('startingSoon'))}</p></div>`);
      this.beginRoundSequence(this.matchData, () => {
        const raceStartMs = Date.now() + (RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? 4000);
        RC()?.runCountdown?.(this, {
          el: this.els.countdown,
          raceStartMs,
          countdownSec: COUNTDOWN_SEC,
          onDone: () => this.startGame(true),
          goLabel: rt('go'),
        });
      });
    }

    destroy() {
      this.clearBotTimers();
      this._botTurnRunning = false;
      this._botScheduledTurnKey = null;
      this._localeOff?.();
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      if (this._roundBreakTimer) clearTimeout(this._roundBreakTimer);
      CF()?.clearCoinFlipTimers?.(this);
      global.KoreanMatchDrag?.end?.();
      this.game?.destroy();
    }

    onLocaleChange() {
      document.title = rt('pageTitle');
      if (this.matchData?.status === 'done') this._resultsRendered = false;
      if (this.matchData) this.onMatchUpdate(this.matchData);
    }

    renderShell() {
      const hud = HUD()?.shellMarkup?.({ showScores: false, emoteSlot: false }) || '';
      this.root.innerHTML = `
        <header class="race-header">
          <a class="race-back" href="index.html">${escapeHtml(rt('backHome'))}</a>
          <h1>${escapeHtml(rt('title'))} · BOT</h1>
          <a class="race-settings-link" href="settings.html" aria-label="Settings">⚙️</a>
        </header>
        ${hud}
        <div id="race-turn-urgency" class="race-turn-urgency hidden" aria-hidden="true"></div>
        <div id="race-turn-swap" class="race-turn-swap hidden" aria-live="assertive"></div>
        <div id="race-main" class="race-main"></div>
        <div id="race-coin-flip" class="race-coin-flip hidden" aria-live="polite"></div>
        <div id="race-countdown" class="race-countdown hidden" aria-live="assertive"></div>
      `;
      this.els = {
        ...HUD()?.bindEls?.(this.root, { showScores: false }) || {},
        main: this.root.querySelector('#race-main'),
        coinFlip: this.root.querySelector('#race-coin-flip'),
        countdown: this.root.querySelector('#race-countdown'),
        turnUrgency: this.root.querySelector('#race-turn-urgency'),
        turnSwap: this.root.querySelector('#race-turn-swap'),
        turnBar: null,
      };
    }

    renderMain(html) {
      if (this.els?.main) this.els.main.innerHTML = html;
    }

    turnModeLabel(data) {
      const n = global.MatchWords?.normalizeWordLength?.(data?.wordLength) ?? this.wordLength;
      return global.I18n?.t('match.modes.letterCount', { n }) || `${n} letters`;
    }

    startGame(anchorTimerNow = false) {
      if (this.gameStarted || !this.matchData) return;
      this.gameStarted = true;
      this.els.countdown?.classList.add('hidden');
      this.renderMain(`
        <section class="race-turn-mine" aria-label="${escapeHtml(rt('mineSection'))}">
          <div id="match-app" class="match-race-game"></div>
        </section>
      `);
      const data = this.matchData;
      this.game = new global.KoreanMatchGame(this.root.querySelector('#match-app'), {
        versus: true,
        turnBased: true,
        raceControlled: true,
        wordLength: data.wordLength,
        mode: data.wordLength,
        fixedWord: data.target,
        sharedSeed: this.matchId,
        onTurnSubmit: async (payload) => {
          const applied = this.applyPlayerTurn(payload);
          if (!applied) throw new Error('turn-not-applied');
        },
        onTurnLiveChange: () => {},
      });
      this.game.mount();
      requestAnimationFrame(() => {
        this.game?.syncDockTileSize?.();
        requestAnimationFrame(() => this.game?.syncDockTileSize?.());
      });
      this.ensureTurnBar();
      this.mountTurnBarToDock();
      if (anchorTimerNow) this.anchorTurnTimerNow(data);
      this.syncTurnState(data);
      this.renderBattleHud(data);
    }

    renderBattleHud(data) {
      HUD()?.updateBattleHud?.(data, {
        els: this.els,
        myUid: MY_UID,
        matchId: this.matchId,
        onOpp: () => {
          if (this.els.centerTitle) this.els.centerTitle.textContent = this.turnModeLabel(data);
          if (this.els.centerSub) {
            const roundNum = data.roundNumber || 1;
            const turnNum = data.turnNumber || 1;
            this.els.centerSub.textContent = rt('roundTurn', { round: roundNum, turn: turnNum })
              || `Round ${roundNum} · Turn ${turnNum}`;
          }
          this.renderBotOpponentCard();
        },
      });
      this.renderBotOpponentCard();
    }

    applyPlayerTurn(payload) {
      const data = this.matchData;
      if (!data || data.status !== 'active') return false;
      if (data.currentTurnUid !== MY_UID) return false;

      const turnNum = data.turnNumber || 1;
      const historyEntry = buildTurnHistoryEntry(data, MY_UID, payload, turnNum);
      const shared = {
        guessCount: (data.sharedState?.guessCount || 0) + 1,
        locked: mergeSharedLocked(data.sharedState?.locked, payload),
        over: !!payload.won,
        winnerUid: payload.won ? MY_UID : null,
        ...(payload.solvedWord ? { solvedWord: payload.solvedWord } : {}),
      };

      if (payload.won) {
        const patch = RS().buildKoreanTurnWinState(
          data, MY_UID, shared, historyEntry, this.matchId, { useServerTime: false }
        );
        this.matchData = {
          ...data,
          ...patch,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      } else {
        this.matchData = {
          ...data,
          sharedState: shared,
          currentTurnUid: BOT_UID,
          turnNumber: turnNum + 1,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      }
      this.preparedTurnNumber = null;
      this.onMatchUpdate(this.matchData);
      return true;
    }

    applyBotTurn(payload) {
      const data = this.matchData;
      if (!data || data.status !== 'active') return false;
      if (data.currentTurnUid !== BOT_UID) return false;

      const turnNum = data.turnNumber || 1;
      const historyEntry = buildTurnHistoryEntry(data, BOT_UID, payload, turnNum);
      const shared = {
        guessCount: (data.sharedState?.guessCount || 0) + 1,
        locked: mergeSharedLocked(data.sharedState?.locked, payload),
        over: !!payload.won,
        winnerUid: payload.won ? BOT_UID : null,
        ...(payload.won ? { solvedWord: payload.solvedWord || data.target } : {}),
      };

      if (payload.won) {
        const patch = RS().buildKoreanTurnWinState(
          data, BOT_UID, shared, historyEntry, this.matchId, { useServerTime: false }
        );
        this.matchData = {
          ...data,
          ...patch,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      } else {
        this.matchData = {
          ...data,
          sharedState: shared,
          currentTurnUid: MY_UID,
          turnNumber: turnNum + 1,
          lastTurnReveal: historyEntry,
          turnHistory: [...(data.turnHistory || []), historyEntry],
          turnLive: null,
        };
      }
      this.preparedTurnNumber = null;
      this._botTurnRunning = false;
      this.onMatchUpdate(this.matchData);
      return true;
    }

    onMatchUpdate(data) {
      if (!data) return;
      if (data.status === 'done') {
        this.handleDone(data);
        return;
      }
      if (data.status === 'round_break') {
        this.renderBattleHud(data);
        return this.handleRoundBreak(data);
      }
      if (data.status === 'active') {
        const roundKey = `${data.roundNumber || 1}:${data.target}`;
        if (this._lastRoundKey && this._lastRoundKey !== roundKey && this.gameStarted) {
          this.resetForNewRound(data);
          return;
        }
        this._lastRoundKey = roundKey;
        if (this.gameStarted) {
          this.syncTurnState(data);
          this.renderBattleHud(data);
        }
      }
    }

    beginRoundSequence(data, onDone) {
      const roundKey = `${data.roundNumber || 1}:${data.target}`;
      const starterUid = data.coinFlipStarterUid || data.currentTurnUid;
      CF()?.runCoinFlip?.(this, {
        el: this.els.coinFlip,
        roundKey,
        starterUid,
        matchData: data,
        myUid: MY_UID,
        onDone: () => onDone?.(),
      }) || onDone?.();
    }

    resetForNewRound(data) {
      this.clearBotTimers();
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      this.hideTurnUrgencyOverlay();
      this.game?.destroy();
      this.game = null;
      this.gameStarted = false;
      this.countdownDone = false;
      this._turnLocalKey = null;
      this._turnLocalStartMs = null;
      this._observedAnyTurn = false;
      this._playedRevealKey = null;
      this.preparedTurnNumber = null;
      this._botTurnRunning = false;
      this._botScheduledTurnKey = null;
      this._lastRoundKey = null;
      CF()?.clearCoinFlipTimers?.(this);

      this.beginRoundSequence(data, () => {
        const raceStartMs = Date.now() + (RC()?.countdownTotalMs?.(COUNTDOWN_SEC) ?? 4000);
        RC()?.runCountdown?.(this, {
          el: this.els.countdown,
          raceStartMs,
          countdownSec: COUNTDOWN_SEC,
          onDone: () => this.startGame(true),
          goLabel: rt('go'),
        });
      });
    }

    handleRoundBreak(data) {
      this.clearBotTimers();
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.game?.setMyTurn(false);
      this.hideTurnUrgencyOverlay();
      this.els.turnBar?.classList.add('hidden');
      this.game?.destroy();
      this.game = null;
      this.gameStarted = false;

      const iWon = data.roundWinnerUid === MY_UID;
      const score = RS().getSeriesScoreForPlayer(data, MY_UID, BOT_UID);
      const word = data.sharedState?.solvedWord || data.lastRoundTarget || data.target;
      const line = iWon ? rt('roundWin') : rt('roundLoss');
      const scoreLine = rt('seriesScore', { my: score.myWins, opp: score.oppWins });
      const firstTo = rt('firstTo', { n: data.seriesTarget || RS().KOREAN_TURN_SERIES_TARGET || 2 });

      this.renderMain(`
        <div class="race-panel race-round-break">
          <p class="race-panel-title">${escapeHtml(line)}</p>
          <p class="race-panel-sub">${escapeHtml(scoreLine)} · ${escapeHtml(firstTo)}</p>
          <p class="race-panel-sub">${escapeHtml(rt('answerLabel'))}: <strong>${escapeHtml(word)}</strong></p>
          <p class="race-panel-sub">${escapeHtml(rt('nextRoundSoon'))}</p>
        </div>
      `);

      this.scheduleRoundBreakAdvance(data);
    }

    scheduleRoundBreakAdvance(data) {
      if (this._roundBreakTimer) clearTimeout(this._roundBreakTimer);
      const remaining = RS().roundBreakRemainingMs(data);
      const delay = remaining > 0 ? remaining + 80 : 80;
      this._roundBreakTimer = setTimeout(() => {
        this._roundBreakTimer = null;
        const live = this.matchData;
        if (!live || live.status !== 'round_break') return;
        this.advanceBotRound(live);
      }, delay);
    }

    advanceBotRound(data) {
      const nextRoundNum = data.nextRoundNumber || ((data.roundNumber || 1) + 1);
      const starter = data.nextRoundStarterUid
        || RS().flipCoinStarter(MY_UID, BOT_UID, this.matchId, nextRoundNum);
      const exclude = data.lastRoundTarget || data.target;
      const newTarget = pickTarget(this.wordLength, exclude);

      this.matchData = {
        ...data,
        status: 'active',
        target: newTarget,
        roundNumber: nextRoundNum,
        currentTurnUid: starter,
        coinFlipStarterUid: starter,
        turnNumber: 1,
        turnPhase: RS().TURN_PHASES.playing,
        sharedState: RS().defaultSharedState(),
        turnHistory: [],
        lastTurnReveal: null,
        turnLive: null,
        winnerUid: null,
        roundWinnerUid: null,
        lastRoundTarget: null,
        nextRoundNumber: null,
        nextRoundStarterUid: null,
        roundBreakStartedAt: null,
        roundBreakMs: null,
      };
      this.resetForNewRound(this.matchData);
    }

    currentTurnKey(data) {
      return `${data?.currentTurnUid || ''}:${data?.turnNumber || 0}:${data?.turnPhase || ''}`;
    }

    updateTurnLocalStart(data) {
      const key = this.currentTurnKey(data);
      if (this._turnLocalKey === key) return;
      this._turnLocalKey = key;
      this._turnLocalStartMs = Date.now();
      this._observedAnyTurn = true;
    }

    anchorTurnTimerNow(data) {
      this._turnLocalKey = this.currentTurnKey(data);
      this._turnLocalStartMs = Date.now();
      this._observedAnyTurn = true;
    }

    getTurnElapsedMs(data) {
      if (!data) return 0;
      this.updateTurnLocalStart(data);
      if (!this._turnLocalStartMs) return 0;
      return Date.now() - this._turnLocalStartMs;
    }

    getTurnRemainingMs(data) {
      const duration = data?.turnDurationMs || RS().turnDurationForLength(this.wordLength);
      if (!duration) return 0;
      return Math.max(0, duration - this.getTurnElapsedMs(data));
    }

    ensureTurnBar() {
      if (this.els.turnBar) return;
      const bar = document.createElement('div');
      bar.id = 'race-turn-bar';
      bar.className = 'race-turn-bar hidden';
      bar.setAttribute('aria-live', 'polite');
      this.els.turnBar = bar;
    }

    mountTurnBarToDock() {
      const mount = this.root.querySelector('#race-turn-bar-mount');
      if (!mount || !this.els.turnBar) return;
      if (this.els.turnBar.parentElement !== mount) mount.appendChild(this.els.turnBar);
    }

    renderTurnBar(data, mode) {
      this.ensureTurnBar();
      const bar = this.els.turnBar;
      if (!bar) return;
      const oppName = data.player2Name || this.botName();
      let label = rt('yourTurn');
      let pct = 100;
      let myTurnStyle = false;
      let timerHtml = '';
      const duration = data.turnDurationMs || 1;
      const localPct = Math.round((this.getTurnRemainingMs(data) / duration) * 100);

      if (mode === 'waiting') {
        label = rt('oppTurn', { name: oppName });
        pct = localPct;
      } else if (mode === 'mine') {
        label = rt('yourTurn');
        pct = localPct;
        myTurnStyle = true;
      }

      if (data.currentTurnUid) {
        const sec = Math.ceil(this.getTurnRemainingMs(data) / 1000);
        timerHtml = `<span class="race-turn-timer">${sec}</span>`;
      }

      bar.classList.remove('hidden');
      bar.classList.toggle('is-my-turn', myTurnStyle);
      this.mountTurnBarToDock();
      bar.innerHTML = `
        <div class="race-turn-bar-top">
          <span class="race-turn-label">${escapeHtml(label)}</span>
          <span class="race-turn-bar-meta">
            ${timerHtml}
            <span class="race-turn-round">${escapeHtml(rt('turnNumber', { n: data.turnNumber || 1 }))}</span>
          </span>
        </div>
        <div class="race-turn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="race-turn-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
      this.game?.syncDockTileSize?.();
    }

    updateTurnUrgencyOverlay(data) {
      const el = this.els.turnUrgency;
      if (!el || !this.gameStarted || data.status !== 'active') {
        this.hideTurnUrgencyOverlay();
        return;
      }
      if (data.currentTurnUid !== MY_UID) {
        this.hideTurnUrgencyOverlay();
        return;
      }
      const remainingMs = this.getTurnRemainingMs(data);
      const sec = Math.ceil(remainingMs / 1000);
      if (remainingMs <= 0 || sec > 5) {
        this.hideTurnUrgencyOverlay();
        return;
      }
      if (this._lastUrgencySec === sec) return;
      this._lastUrgencySec = sec;
      el.textContent = String(sec);
      el.classList.remove('hidden');
    }

    hideTurnUrgencyOverlay() {
      this._lastUrgencySec = null;
      const el = this.els.turnUrgency;
      if (!el) return;
      el.classList.add('hidden');
      el.textContent = '';
    }

    maybeShowTurnSwapOverlay(data) {
      if (!this.gameStarted) return;
      const key = `${data.currentTurnUid || ''}:${data.turnNumber || 0}`;
      if (this._prevTurnBoundaryKey == null) {
        this._prevTurnBoundaryKey = key;
        return;
      }
      if (this._prevTurnBoundaryKey === key) return;
      this._prevTurnBoundaryKey = key;
      const el = this.els.turnSwap;
      if (!el) return;
      if (this._turnSwapTimer) clearTimeout(this._turnSwapTimer);
      el.textContent = rt('turnSwap');
      el.classList.remove('hidden');
      this._turnSwapTimer = setTimeout(() => {
        el.classList.add('hidden');
        this._turnSwapTimer = null;
      }, 700);
    }

    async maybePlayOpponentReveal(data) {
      const reveal = data?.lastTurnReveal;
      if (!this.game || !reveal || reveal.byUid === MY_UID) return;
      const key = `${reveal.byUid}:${reveal.turnNumber ?? ''}`;
      if (!key || key === this._playedRevealKey) return;
      if (key === this.game._watchRevealPlayedKey) {
        this._playedRevealKey = key;
        return;
      }

      const sharedLocked = data.sharedState?.locked || [];
      const revealCorrectKeys = new Set(
        (reveal.placements || [])
          .filter((p) => p.correct)
          .map((p) => `${p.syl}:${p.zone}:${p.subIndex ?? 0}`)
      );
      const lockedBeforeReveal = sharedLocked.filter(
        (lock) => !revealCorrectKeys.has(`${lock.syl}:${lock.zone}:${lock.subIndex ?? 0}`)
      );

      const wasWatching = this.game.watchMode;
      const hasBoardPlacements = this.game.hasWatchBoardPlacements?.();
      if (!wasWatching || !hasBoardPlacements) {
        this.game.prepareForNewTurn(lockedBeforeReveal, data.turnHistory, MY_UID);
        this.game.setWatchMode(true);
        this.game.renderTurnGuessOnZones(this.game.blocks, reveal, { neutral: true });
      }

      this._playedRevealKey = key;
      await this.game.playWatchTurnReveal(reveal, { name: reveal.byName || this.botName() });
      if (!wasWatching) this.game.setWatchMode(false);
    }

    watchOpponentTurn(data) {
      const watchKey = `watch-${data.turnNumber || 1}`;
      if (this.preparedTurnNumber !== watchKey) {
        this.game.prepareForNewTurn?.(data.sharedState?.locked || []);
        this.preparedTurnNumber = watchKey;
        this._botScheduledTurnKey = null;
      }
      this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
      this.game.setWatchMode(true);
      this.game.setBoardHidden(false);
      const live = data.turnLive;
      if (live?.byUid === BOT_UID && live?.turnNumber === data.turnNumber) {
        this.game.applyTurnLiveState(live);
      }

      const scheduleKey = `bot-${data.turnNumber || 1}`;
      if (this._botScheduledTurnKey !== scheduleKey) {
        this._botScheduledTurnKey = scheduleKey;
        this.scheduleBotTurn(data);
      }
    }

    async syncTurnState(data) {
      if (!data || !this.game) return;
      this.maybeShowTurnSwapOverlay(data);
      const myTurn = data.currentTurnUid === MY_UID;

      if (myTurn) {
        await this.maybePlayOpponentReveal(data);
        await this.game.waitForWatchReveal?.();
        this.renderTurnBar(data, 'mine');
        if (this.preparedTurnNumber !== data.turnNumber) {
          this.game.prepareForNewTurn?.(
            data.sharedState?.locked || [],
            data.turnHistory,
            MY_UID
          );
          this.preparedTurnNumber = data.turnNumber;
        }
        this.game.syncSharedState(data.sharedState || RS().defaultSharedState());
        this.game.setBoardHidden(false);
        this.game.setMyTurn(true);
      } else {
        this.renderTurnBar(data, 'waiting');
        this.watchOpponentTurn(data);
      }

      this.startTurnTimer(data);
      this.updateTurnUrgencyOverlay(data);
    }

    startTurnTimer(data) {
      if (this.turnTimer) clearInterval(this.turnTimer);
      if (data.status !== 'active') return;
      const tick = async () => {
        if (!this.matchData || this.matchData.status !== 'active') {
          clearInterval(this.turnTimer);
          return;
        }
        const live = this.matchData;
        const myTurn = live.currentTurnUid === MY_UID;
        this.renderTurnBar(live, myTurn ? 'mine' : 'waiting');
        this.updateTurnUrgencyOverlay(live);

        if (
          myTurn
          && this.getTurnRemainingMs(live) <= 0
          && !this.pendingTurnSubmit
          && this.game
          && !this.game.checking
          && !this.game.turnSubmitting
          && !this.game.checkedComplete
        ) {
          this.pendingTurnSubmit = true;
          try {
            await this.game.expireMyTurn?.();
          } catch (_) {}
          finally {
            this.pendingTurnSubmit = false;
          }
        }
      };
      tick();
      this.turnTimer = setInterval(tick, 250);
    }

    botDelay(fn, ms) {
      const id = global.setTimeout(() => {
        this._botTimers = this._botTimers.filter((t) => t !== id);
        fn();
      }, Math.max(0, ms));
      this._botTimers.push(id);
      return id;
    }

    clearBotTimers() {
      this._botTimers.forEach((id) => clearTimeout(id));
      this._botTimers = [];
    }

    scheduleBotTurn(data) {
      if (this._botTurnRunning || data.currentTurnUid !== BOT_UID || data.status !== 'active') return;
      if (!this.game) return;
      this.clearBotTimers();
      this._botTurnRunning = true;

      const locked = data.sharedState?.locked || [];
      const target = data.target;
      const { script, payload, totalMs } = buildHumanBotTurnScript(
        this.game,
        target,
        locked,
        this.winRate,
        this.speed
      );

      script.forEach((step) => {
        this.botDelay(() => {
          if (!this.game || this.matchData?.currentTurnUid !== BOT_UID) return;
          this.matchData.turnLive = {
            byUid: BOT_UID,
            turnNumber: this.matchData.turnNumber,
            ...step.live,
          };
          this.game.applyTurnLiveState(this.matchData.turnLive);
        }, step.at);
      });

      this.botDelay(() => {
        if (!this.matchData || this.matchData.currentTurnUid !== BOT_UID) return;
        this.applyBotTurn(payload);
      }, totalMs);
    }

    handleDone(data) {
      if (this._resultsRendered) return;
      this._resultsRendered = true;
      this.clearBotTimers();
      if (this.turnTimer) clearInterval(this.turnTimer);
      this.hideTurnUrgencyOverlay();
      this.els.turnBar?.classList.add('hidden');
      this.els.battleHud?.classList.add('hidden');
      this.game?.setMyTurn(false);

      const shared = data.sharedState || {};
      const RUI = global.RaceResultsUI;
      let resultLine = rt('draw');
      if (data.winnerUid === MY_UID) resultLine = rt('win');
      else if (data.winnerUid) resultLine = rt('loss');
      const displayWord = shared.solvedWord || data.target;

      this.renderMain(RUI.renderResultsPanel({
        resultLine,
        resultKind: data.winnerUid === MY_UID ? 'win' : data.winnerUid ? 'loss' : 'draw',
        winnerUid: data.winnerUid,
        battleXpMode: data.winnerUid === MY_UID ? 'koreanMatch' : '',
        battleMatchId: this.matchId,
        battleQuestMode: 'turn',
        players: [
          { uid: MY_UID, name: rt('me'), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
          { uid: BOT_UID, name: this.botName(), statHtml: `${shared.guessCount || 0} ${escapeHtml(rt('turns'))}` },
        ],
        answerTilesHtml: RUI.buildMatchWinTiles(displayWord),
        answerLabel: rt('answerLabel'),
        rematchLabel: rt('rematch'),
        profileLabel: rt('profileLink'),
        profileHref: 'index.html',
      }));

      RUI.afterResultsMount(this.els.main);
      void RUI.fillAnswerMeaning(this.els.main, displayWord, { autoplay: false });
      this.els.main.querySelector('#race-rematch')?.addEventListener('click', () => {
        global.location.reload();
      });
    }
  }

  global.MatchTurnBotApp = MatchTurnBotApp;

  global.addEventListener('pagehide', () => {
    if (global.__matchTurnBotAppInstance) global.__matchTurnBotAppInstance.destroy();
  });
})(typeof window !== 'undefined' ? window : globalThis);
