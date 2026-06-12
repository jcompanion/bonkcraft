// player settings — persisted separately from saves
const SETTINGS = Object.assign(
  { volume: 1, muted: false, shake: true, floatText: true, minimap: true, log: true },
  JSON.parse(localStorage.getItem('blockbonk_settings') || '{}'));
// avatar merged separately so saved settings from older versions pick up new fields
SETTINGS.avatar = Object.assign(
  { name: '', hair: '#5d3a1e', skin: '#e8b08a', shirt: '#2bb5a8', pants: '#3a3f8c' },
  SETTINGS.avatar || {});
function saveSettings() {
  try { localStorage.setItem('blockbonk_settings', JSON.stringify(SETTINGS)); } catch (e) {}
}

// Tiny WebAudio synth — no audio files needed.
const SFX = (() => {
  let ctx = null;
  let muted = !!SETTINGS.muted;

  // voice limiter: dense fights can request dozens of sounds per frame —
  // cap concurrent synth voices per 100ms window so audio stays cheap
  let windowStart = 0;
  let voices = 0;
  function allow() {
    const now = performance.now();
    if (now - windowStart > 100) { windowStart = now; voices = 0; }
    return ++voices <= 10;
  }

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One enveloped oscillator blip.
  function blip(type, freq, endFreq, dur, vol = 0.15, delay = 0) {
    if (muted || !allow()) return;
    try {
      const a = ac();
      const t0 = a.currentTime + delay;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
      g.gain.setValueAtTime(vol * (SETTINGS.volume ?? 1), t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* audio blocked until first user gesture — fine */ }
  }

  function noise(dur, vol = 0.12, delay = 0) {
    if (muted || !allow()) return;
    try {
      const a = ac();
      const t0 = a.currentTime + delay;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const g = a.createGain();
      g.gain.setValueAtTime(vol * (SETTINGS.volume ?? 1), t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(g).connect(a.destination);
      src.start(t0);
    } catch (e) {}
  }

  return {
    unlock() { try { ac(); } catch (e) {} }, // call from a user gesture — iOS gate
    toggleMute() { muted = !muted; SETTINGS.muted = muted; saveSettings(); return muted; },
    setMuted(m) { muted = !!m; SETTINGS.muted = muted; saveSettings(); },
    get muted() { return muted; },
    hit()      { blip('square', 320, 120, 0.08, 0.08); },
    swing()    { blip('sawtooth', 220, 600, 0.09, 0.05); },
    shoot()    { blip('square', 700, 300, 0.07, 0.05); },
    mine()     { blip('square', 150, 90, 0.06, 0.07); },
    breakBlk() { noise(0.18, 0.14); blip('square', 200, 60, 0.15, 0.1); },
    pickup()   { blip('sine', 880, 1320, 0.08, 0.07); },
    gem()      { blip('sine', 1040, 1560, 0.07, 0.06); },
    craft()    { blip('square', 440, 660, 0.1, 0.09); blip('square', 660, 880, 0.1, 0.09, 0.1); },
    place()    { blip('square', 180, 140, 0.1, 0.1); },
    levelup()  { [523, 659, 784, 1046].forEach((f, i) => blip('square', f, f, 0.12, 0.09, i * 0.09)); },
    hurt()     { blip('sawtooth', 200, 70, 0.18, 0.14); },
    explode()  { noise(0.4, 0.22); blip('sine', 120, 40, 0.35, 0.2); },
    zap()      { blip('sawtooth', 1400, 200, 0.12, 0.08); },
    night()    { [330, 262, 196].forEach((f, i) => blip('triangle', f, f, 0.25, 0.1, i * 0.18)); },
    dawn()     { [392, 523, 659].forEach((f, i) => blip('triangle', f, f, 0.22, 0.09, i * 0.15)); },
    death()    { [400, 300, 200, 100].forEach((f, i) => blip('sawtooth', f, f * 0.6, 0.3, 0.12, i * 0.2)); },
    boss()     { [110, 110, 87].forEach((f, i) => blip('sawtooth', f, f, 0.4, 0.16, i * 0.3)); },
  };
})();
