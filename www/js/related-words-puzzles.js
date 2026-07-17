/**
 * Related Words — chain mode facade (delegates to RelatedWordsChains).
 */
(function (global) {
  'use strict';

  const RC = () => global.RelatedWordsChains;

  function getPuzzle(chainId, linkIndex) {
    if (chainId == null && Number.isFinite(linkIndex)) {
      const resolved = RC()?.resolveRoundPuzzle?.(linkIndex);
      if (resolved) return RC()?.getLink(resolved.chainId, resolved.linkIndex);
    }
    return RC()?.getLink(chainId, linkIndex);
  }

  function getPuzzleCount(chainId) {
    return RC()?.getLinkCount(chainId) ?? 0;
  }

  function splitSyllables(word) {
    return RC()?.splitSyllables(word) ?? [...word];
  }

  global.RelatedWordsPuzzles = {
    getPuzzle,
    getPuzzleCount,
    isLinkInRange: (chainId, linkIndex) => RC()?.isLinkInRange?.(chainId, linkIndex) === true,
    splitSyllables,
    pickChain: (...args) => RC()?.pickChain(...args),
    getAllChains: () => RC()?.getAllChains() ?? [],
    getChain: (id) => RC()?.getChain(id),
  };
})(typeof window !== 'undefined' ? window : globalThis);
