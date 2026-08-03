/**
 * @deprecated Use chest-room-service.js — kept as a thin alias for older script tags / tests.
 */
(function (global) {
  'use strict';
  // If chest-room-service already loaded, nothing to do.
  if (global.ChestRoomService) {
    global.WheelService = global.ChestRoomService;
    return;
  }
  // Fallback: load behavior is defined in chest-room-service.js; keep minimal stub.
  console.warn('[WheelService] Load chest-room-service.js instead of wheel-service.js');
})(typeof window !== 'undefined' ? window : globalThis);
