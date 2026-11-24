// Coach lessons. Each step shows a position; `solve` steps ask for a move
// (any UCI listed in `moves` — prefix match, so promotions accept any piece,
// or any move that gives `mate: true`). Text is original.
export const LESSONS = [
  { id: 'rook', group: 'The pieces', title: 'The rook', icon: '♜', steps: [
    { text: 'The rook moves in straight lines: up, down, left or right, as far as it likes until something blocks it.', fen: '7k/8/8/8/8/8/8/R3K3 w - - 0 1' },
    { text: 'Capture the black pawn with your rook.', fen: '7k/8/8/3p4/8/8/3R4/4K3 w - - 0 1', moves: ['d2d5'], hint: 'Slide straight up the d-file.' },
    { text: 'Rooks are strongest on open files. Take the pawn on h7, going sideways first is not needed: find the straight path.', fen: '6k1/7p/8/8/8/8/8/K6R w - - 0 1', moves: ['h1h7'], hint: 'Up the h-file.' },
  ] },
  { id: 'bishop', group: 'The pieces', title: 'The bishop', icon: '♝', steps: [
    { text: 'The bishop moves diagonally and always stays on squares of one colour.', fen: '7k/8/8/8/8/8/2B5/K7 w - - 0 1' },
    { text: 'Capture the pawn on f5.', fen: '7k/8/8/5p2/8/8/2B5/K7 w - - 0 1', moves: ['c2f5'], hint: 'Follow the diagonal c2–d3–e4–f5.' },
  ] },
  { id: 'queen', group: 'The pieces', title: 'The queen', icon: '♛', steps: [
    { text: 'The queen moves like a rook and a bishop combined. She is your most powerful piece (worth about 9 pawns).', fen: '7k/8/8/8/8/8/8/K2Q4 w - - 0 1' },
    { text: 'Capture the pawn on g4.', fen: '7k/8/8/8/6p1/8/8/K2Q4 w - - 0 1', moves: ['d1g4'], hint: 'Diagonally: d1–e2–f3–g4.' },
  ] },
  { id: 'knight', group: 'The pieces', title: 'The knight', icon: '♞', steps: [
    { text: 'The knight jumps in an L shape: two squares one way, then one square to the side. It is the only piece that can jump over others.', fen: '7k/8/8/8/8/4N3/8/K7 w - - 0 1' },
    { text: 'Capture the pawn on d5 with the knight.', fen: '7k/8/8/3p4/8/4N3/8/K7 w - - 0 1', moves: ['e3d5'], hint: 'Two up, one left.' },
    { text: 'Knights jump over pieces. Take the pawn on f3, right over your own pawns.', fen: '7k/8/8/8/8/5p2/3PPP2/4N2K w - - 0 1', moves: ['e1f3'], hint: 'From e1: two up and one right lands on f3.' },
  ] },
  { id: 'pawn', group: 'The pieces', title: 'The pawn', icon: '♟', steps: [
    { text: 'Pawns move straight forward one square (two on their first move) but capture diagonally.', fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1' },
    { text: 'Capture the knight with your pawn.', fen: '7k/8/8/8/8/3n4/4P3/K7 w - - 0 1', moves: ['e2d3'], hint: 'Pawns capture one square diagonally forward.' },
    { text: 'A pawn that reaches the last rank promotes: it becomes a queen (or another piece). Promote!', fen: '7k/3P4/8/8/8/8/8/K7 w - - 0 1', moves: ['d7d8'], hint: 'Push to d8.' },
  ] },
  { id: 'king', group: 'The pieces', title: 'The king', icon: '♚', steps: [
    { text: 'The king moves one square in any direction. It can never move into check. Protecting it is the whole game.', fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1' },
    { text: 'Your king can capture too. Take the undefended pawn.', fen: '7k/8/8/8/3Kp3/8/8/8 w - - 0 1', moves: ['d4e4'], hint: 'One step right.' },
  ] },
  { id: 'special', group: 'Special moves', title: 'Castling & en passant', icon: '♖', steps: [
    { text: 'Castling moves your king two squares toward a rook, and the rook jumps over. It tucks the king away and wakes up the rook. Castle kingside now.', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', moves: ['e1g1'], hint: 'Move the king two squares to g1.' },
    { text: 'You can’t castle out of, through or into check, or after the king or that rook has moved. Here, castle queenside instead.', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w Qkq - 0 1', moves: ['e1c1'], hint: 'King two squares to c1.' },
    { text: 'En passant: black just pushed e7–e5, jumping past your pawn. On the very next move you may capture it as if it moved one square. Do it!', fen: '7k/8/8/3Pp3/8/8/8/K7 w - e6 0 1', moves: ['d5e6'], hint: 'Capture diagonally onto e6.' },
  ] },
  { id: 'mate', group: 'Checkmate', title: 'Check and checkmate', icon: '♔', steps: [
    { text: 'Check means the king is attacked. Checkmate means it is attacked and has no escape: that wins the game. Deliver mate in one.', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', mate: true, hint: 'The black king is trapped by its own pawns. Use the back rank.' },
    { text: 'Queen and king together can mate. Find the checkmate.', fen: 'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1', mate: true, hint: 'Check along the 8th rank; your king covers the escape squares.' },
    { text: 'One more: the rooks work as a team. Mate in one.', fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', mate: true, hint: 'One rook already cuts off the 7th rank; the other delivers mate on the 8th.' },
  ] },
  { id: 'fork', group: 'Tactics', title: 'Forks', icon: '⑂', steps: [
    { text: 'A fork attacks two things at once. Knights are fork experts. Find the move that checks the king and attacks the queen.', fen: 'q3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', moves: ['b5c7'], hint: 'Jump to c7.' },
    { text: 'Pawns fork too. Attack both black pieces with one push.', fen: '6k1/8/8/2n1b3/8/3P4/8/6K1 w - - 0 1', moves: ['d3d4'], hint: 'A pawn on d4 hits c5 and e5.' },
  ] },
  { id: 'pin', group: 'Tactics', title: 'Pins', icon: '📌', steps: [
    { text: 'A pin attacks a piece that can’t move without exposing something more valuable behind it. Pin the knight to the king.', fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', moves: ['f1b5'], hint: 'The knight on c6 sits on the diagonal between b5 and the king.' },
    { text: 'A pinned piece can’t run away, so attack it again. The knight on c6 is pinned to the king. Hit it with a pawn and win it.', fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', moves: ['d4d5'], hint: 'Push the d-pawn: it attacks c6, and the knight may not move.' },
  ] },
  { id: 'principles', group: 'Strategy', title: 'Opening principles', icon: '♙', steps: [
    { text: 'Three rules for the opening: control the centre, develop your knights and bishops, and castle early. Start by taking the centre.', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4', 'd2d4'], hint: 'Push a centre pawn two squares.' },
    { text: 'Develop a piece toward the centre. Knights before bishops is a good habit.', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', moves: ['g1f3', 'b1c3'], hint: 'A knight to f3 also attacks e5.' },
    { text: 'Your bishop and knight are out. Castle to keep your king safe.', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', moves: ['e1g1'], hint: 'King to g1.' },
    { text: 'Avoid moving the same piece twice or bringing the queen out early: every move should add a new piece to the game.', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5' },
  ] },
  { id: 'endgame', group: 'Endgames', title: 'Winning endgames', icon: '♔', steps: [
    { text: 'In the endgame, the king becomes a fighter. March it forward to support your pawn.', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', moves: ['e3d4', 'e3f4'], hint: 'Step diagonally forward, beside your pawn’s path.' },
    { text: 'With king and rook against a king, push the enemy king to the edge and mate it. Mate in one.', fen: '4k3/8/4K3/8/8/8/8/7R w - - 0 1', mate: true, hint: 'The kings face each other: check on the back rank.' },
  ] },
];
