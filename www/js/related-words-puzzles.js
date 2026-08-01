/**
 * Related Words — chain mode facade (delegates to RelatedWordsChains).
 */
(function (global) {
  'use strict';

  const RC = () => global.RelatedWordsChains;

  function getPuzzle(chainId, linkIndex, opts = {}) {
    const race = opts?.race === true;
    if (chainId == null && Number.isFinite(linkIndex)) {
      const resolved = RC()?.resolveRoundPuzzle?.(linkIndex);
      if (resolved) {
        return race
          ? RC()?.getRaceLink?.(resolved.chainId, resolved.linkIndex)
          : RC()?.getLink(resolved.chainId, resolved.linkIndex);
      }
    }
    return race
      ? RC()?.getRaceLink?.(chainId, linkIndex)
      : RC()?.getLink(chainId, linkIndex);
  }

  function getPuzzleCount(chainId, opts = {}) {
    if (opts?.race === true) {
      return RC()?.getRaceLinkCount?.(chainId) ?? RC()?.getLinkCount(chainId) ?? 0;
    }
    return RC()?.getLinkCount(chainId) ?? 0;
  }

  function splitSyllables(word) {
    return RC()?.splitSyllables(word) ?? [...word];
  }

  global.RelatedWordsPuzzles = {
    getPuzzle,
    getPuzzleCount,
    isLinkInRange: (chainId, linkIndex, opts = {}) => (
      opts?.race === true
        ? RC()?.isRaceLinkInRange?.(chainId, linkIndex) === true
        : RC()?.isLinkInRange?.(chainId, linkIndex) === true
    ),
    splitSyllables,
    pickChain: (...args) => RC()?.pickChain(...args),
    getAllChains: () => RC()?.getAllChains() ?? [],
    getChain: (id, opts = {}) => (
      opts?.race === true
        ? (RC()?.getRaceChain?.(id) || RC()?.getChain(id))
        : RC()?.getChain(id)
    ),
  };
})(typeof window !== 'undefined' ? window : globalThis);
