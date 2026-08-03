/**
 * @deprecated Use chest-room-ui.js — kept as a thin alias for older script tags.
 */
(function (global) {
  'use strict';
  if (global.ChestRoomUI) {
    global.WheelUI = global.ChestRoomUI;
    return;
  }
  console.warn('[WheelUI] Load chest-room-ui.js instead of wheel-ui.js');
})(typeof window !== 'undefined' ? window : globalThis);
