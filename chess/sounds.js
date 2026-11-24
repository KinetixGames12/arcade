// Board sounds, synthesised with Web Audio (no audio files to license or load).
let ctx = null;
let noise = null;
let enabled = true;
export function setSound(on) { enabled = on; }

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// A wooden "tock": filtered noise burst plus a short body tone.
function knock(t, { freq = 900, q = 6, gain = 0.6, tone = 180, len = 0.09 } = {}) {
  const a = ac();
  const src = a.createBufferSource(); src.buffer = noise;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(bp).connect(g).connect(a.destination); src.start(t); src.stop(t + len + 0.02);
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(tone, t); o.frequency.exponentialRampToValueAtTime(tone * 0.6, t + len);
  const og = a.createGain(); og.gain.setValueAtTime(gain * 0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(og).connect(a.destination); o.start(t); o.stop(t + len + 0.02);
}
function tone(t, f, len = 0.18, gain = 0.12, type = 'sine') {
  const a = ac();
  const o = a.createOscillator(); o.type = type; o.frequency.value = f;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.02);
}

export function play(kind) {
  if (!enabled) return;
  try {
    const t = ac().currentTime + 0.005;
    switch (kind) {
      case 'move': knock(t); break;
      case 'capture': knock(t, { freq: 1500, q: 3, gain: 0.9, tone: 140, len: 0.12 }); knock(t + 0.035, { freq: 700, gain: 0.4 }); break;
      case 'castle': knock(t); knock(t + 0.09, { freq: 1100 }); break;
      case 'check': knock(t, { freq: 1200, gain: 0.7 }); tone(t + 0.02, 880, 0.22, 0.09, 'triangle'); break;
      case 'promote': [523, 659, 784].forEach((f, i) => tone(t + i * 0.07, f, 0.2, 0.1, 'triangle')); break;
      case 'premove': knock(t, { freq: 2000, gain: 0.25, len: 0.05 }); break;
      case 'illegal': tone(t, 140, 0.15, 0.12, 'square'); break;
      case 'notify': tone(t, 784, 0.15, 0.1); tone(t + 0.12, 1047, 0.25, 0.1); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 0.35, 0.1, 'triangle')); break;
      case 'lose': [392, 349, 294].forEach((f, i) => tone(t + i * 0.12, f, 0.35, 0.09, 'triangle')); break;
      case 'end': [440, 554, 659].forEach((f) => tone(t, f, 0.5, 0.07, 'triangle')); break;
      case 'correct': tone(t, 880, 0.12, 0.1); tone(t + 0.09, 1175, 0.2, 0.1); break;
      default: break;
    }
  } catch { /* audio unavailable */ }
}

// Picks the sound for a move from chess.js move flags / SAN.
export function moveSound(m) {
  if (!m) return 'move';
  if (m.san?.includes('+') || m.san?.includes('#')) return 'check';
  if (m.promotion) return 'promote';
  if (m.san?.startsWith('O-O')) return 'castle';
  if (m.captured) return 'capture';
  return 'move';
}
