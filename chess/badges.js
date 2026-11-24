// Move classifications shared by the board badge, move list and Game Review.
export const CLASSES = {
  brilliant: { label: 'Brilliant', sym: '!!', color: '#1bada6', text: 'a brilliant move' },
  great: { label: 'Great', sym: '!', color: '#5c8bb0', text: 'a great move' },
  best: { label: 'Best', sym: '★', color: '#81b64c', text: 'the best move' },
  excellent: { label: 'Excellent', sym: '👍', color: '#96bc4b', text: 'an excellent move' },
  good: { label: 'Good', sym: '✓', color: '#96af8b', text: 'a good move' },
  book: { label: 'Book', sym: '📖', color: '#a88865', text: 'a book move' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: '#f0c15c', text: 'an inaccuracy' },
  mistake: { label: 'Mistake', sym: '?', color: '#e6912c', text: 'a mistake' },
  miss: { label: 'Miss', sym: '✕', color: '#ee6b55', text: 'a missed chance' },
  blunder: { label: 'Blunder', sym: '??', color: '#ca3431', text: 'a blunder' },
};
export const ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

// Round icon with the class symbol (inline SVG, no external files).
export function badgeSvg(cls, size = 22) {
  const c = CLASSES[cls];
  if (!c) return '';
  const glyph = {
    best: '<path d="M12 5.2l1.9 4 4.3.5-3.2 2.9.9 4.3L12 14.7l-3.9 2.2.9-4.3-3.2-2.9 4.3-.5z" fill="#fff"/>',
    excellent: '<path d="M8 11h2.2v6H8zM11.2 17h4.3c.7 0 1.2-.4 1.4-1l1-3.6c.2-.8-.4-1.6-1.2-1.6h-2.9l.4-2.2c.1-.6-.2-1.1-.7-1.3l-.4-.1-2 3.4z" fill="#fff"/>',
    good: '<path d="M7.5 12.3l3 3 6-6.3" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    book: '<path d="M6.5 7.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6z" fill="#fff"/><path d="M12 8.1v9" stroke="#a88865" stroke-width="1"/>',
    miss: '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  }[cls];
  const text = glyph || `<text x="12" y="16.2" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${c.sym.length > 1 ? 9.5 : 12}" fill="#fff">${c.sym}</text>`;
  return `<svg class="badge-ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${c.label}" role="img"><circle cx="12" cy="12" r="11" fill="${c.color}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>${text}</svg>`;
}
