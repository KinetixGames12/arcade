// Runs the checkers AI off the main thread so the board stays smooth.
import { bestMove } from './engine.js?v=1';
self.onmessage = (e) => {
  const { id, board, turn, level } = e.data;
  self.postMessage({ id, move: bestMove(board, turn, level) });
};
