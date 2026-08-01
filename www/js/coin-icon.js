/**
 * Shared gold "가" coin icon for currency UI.
 */
(function (global) {
  'use strict';

  const SRC = 'assets/coin.png';
  const EMOJI = '🪙';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function html(cls = 'coin-icon') {
    const safeCls = String(cls || 'coin-icon').replace(/[^a-zA-Z0-9 _-]/g, '') || 'coin-icon';
    return `<img class="${safeCls}" src="${SRC}" alt="" width="20" height="20" decoding="async" draggable="false">`;
  }

  /** Escape text and swap 🪙 for the coin image. */
  function format(str, cls = 'coin-icon') {
    return String(str ?? '').split(EMOJI).map(escapeHtml).join(html(cls));
  }

  function resolve(icon, cls = 'coin-icon') {
    if (icon === EMOJI) return html(cls);
    return escapeHtml(icon ?? '');
  }

  global.CoinIcon = {
    SRC,
    EMOJI,
    html,
    format,
    resolve,
  };
})(typeof window !== 'undefined' ? window : globalThis);
