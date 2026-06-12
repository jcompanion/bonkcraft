// ---------- touch controls: floating joystick + action buttons ----------
// Loaded everywhere; activates only when the device has a coarse pointer.
// TOUCH_INPUT is read by updatePlayer (movement) and the pointerdown
// handler (dismantle mode) in main.js.

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TOUCH_INPUT = { x: 0, y: 0, active: false, dismantle: false };

// dismantle mode is a modal toggle — anything that enters placement turns it off
function touchDismantleOff() {
  if (!TOUCH_INPUT.dismantle) return;
  TOUCH_INPUT.dismantle = false;
  const b = $('tb-dig');
  if (b) b.classList.remove('on');
}

function initTouchControls() {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');

  // iOS keeps WebAudio suspended until a user gesture — wake it on first touch
  document.addEventListener('touchstart', () => SFX.unlock(), { once: true, passive: true });

  // ---- floating joystick: base appears wherever the thumb lands ----
  const zone = $('touch-stick-zone'), base = $('stick-base'), nub = $('stick-nub');
  const RADIUS = 48, DEAD = 10;
  let stickId = null, ox = 0, oy = 0;

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const capped = Math.min(len, RADIUS);
    nub.style.left = ox + Math.cos(a) * capped + 'px';
    nub.style.top = oy + Math.sin(a) * capped + 'px';
    const t = len < DEAD ? 0 : Math.min(1, (len - DEAD) / (RADIUS - DEAD));
    TOUCH_INPUT.x = Math.cos(a) * t;
    TOUCH_INPUT.y = Math.sin(a) * t;
  }

  function endStick() {
    stickId = null;
    TOUCH_INPUT.x = TOUCH_INPUT.y = 0;
    TOUCH_INPUT.active = false;
    base.style.display = nub.style.display = 'none';
  }

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier;
    ox = t.clientX; oy = t.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px';
    base.style.display = nub.style.display = 'block';
    TOUCH_INPUT.active = true;
    setStick(0, 0);
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) setStick(t.clientX - ox, t.clientY - oy);
    }
  }, { passive: false });

  for (const ev of ['touchend', 'touchcancel']) {
    zone.addEventListener(ev, e => {
      for (const t of e.changedTouches) if (t.identifier === stickId) endStick();
    });
  }

  // ---- action buttons (the hotbar itself is already tappable) ----
  const S = () => window.gameScene;
  // ⏸ doubles as a universal back button — mirrors the ESC key
  $('tb-pause').onclick = () => {
    const s = S();
    if (!s || !s.state) return;
    if (s.state.gameOver || $('modal-levelup').classList.contains('open') ||
        $('modal-start').classList.contains('open')) return;
    if ($('modal-craft').classList.contains('open')) { toggleCraft(s); return; }
    if ($('modal-settings').classList.contains('open')) { closeSettings(s); return; }
    if ($('modal-box').classList.contains('open')) { toggleBoxModal(s); return; }
    if (s.state.placing) { cancelPlacement(s); return; }
    s.togglePause();
  };
  $('tb-craft').onclick = () => {
    const s = S();
    if (s && s.state && !s.state.gameOver &&
        !$('modal-levelup').classList.contains('open') &&
        !$('modal-pause').classList.contains('open')) toggleCraft(s);
  };
  $('tb-pets').onclick = () => { const s = S(); if (s && s.state && !s.state.gameOver) toggleBoxModal(s); };
  $('tb-sleep').onclick = () => { const s = S(); if (s && s.state) trySleep(s); };
  $('tb-dig').onclick = () => {
    const s = S();
    TOUCH_INPUT.dismantle = !TOUCH_INPUT.dismantle;
    $('tb-dig').classList.toggle('on', TOUCH_INPUT.dismantle);
    if (s && s.state && s.state.placing) cancelPlacement(s);
    showBanner(TOUCH_INPUT.dismantle ? '🔨 dismantle — tap a wall or turret' : '🔨 dismantle off', '');
  };
}

// ---- tap the dark backdrop to close a modal (helps mouse users too) ----
function initModalBackdrops() {
  const close = {
    'modal-craft': s => toggleCraft(s),
    'modal-box': s => toggleBoxModal(s),
    'modal-settings': s => closeSettings(s),
    'modal-pause': s => s.togglePause(),
  };
  for (const [id, fn] of Object.entries(close)) {
    $(id).addEventListener('click', e => {
      if (e.target !== e.currentTarget) return;
      const s = window.gameScene;
      if (s && s.state) fn(s);
    });
  }
}

initTouchControls();
initModalBackdrops();
