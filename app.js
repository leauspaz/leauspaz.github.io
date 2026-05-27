'use strict';

/* ── State ─────────────────────────────────────────────────── */
const S = {
  allRows:        [],
  filtered:       [],
  current:        null,   // single card row
  languages:      [],
  categories:     [],
  lang:           'All',
  level:          'All',
  categories_sel: ['All'],
  muted:          false,
  streamerMode:   false,
  creatorFlip:    false,  // false = EN→Target, true = Target→EN
  revealed:       false,
  presMode:       false,
  presPool:       [],
  presIndex:      0,
  presRevealed:   false,
  theme:          'terminal',
  fontSize:       18,     // px number
  keyReveal:      'r',
  keyNext:        ' ',
  keyTTS:         't',
};

/* ── DOM ────────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Scramble ───────────────────────────────────────────────── */
const CHARS = 'αβγδεζηθλμνξπρστυφχψωΔΣΩ'.split('');
function scrambleTick(el, target, frame, total, cb) {
  if (frame >= total) { el.textContent = target; cb && cb(); return; }
  el.textContent = target.split('').map((ch, i) =>
    i < Math.floor((frame / total) * target.length)
      ? ch
      : ch === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('');
  requestAnimationFrame(() => scrambleTick(el, target, frame + 1, total, cb));
}
function scramble(el, text, ms = 380, cb) {
  el.classList.add('scrambling');
  scrambleTick(el, text, 0, Math.round(ms / 16), () => {
    el.classList.remove('scrambling');
    cb && cb();
  });
}

/* ── CSV ────────────────────────────────────────────────────── */
function splitCSV(line) {
  const r = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; }
    else if (ch === ',' && !q) { r.push(cur); cur = ''; }
    else cur += ch;
  }
  r.push(cur);
  return r;
}
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const hdr   = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(l => {
    const cols = splitCSV(l);
    const row  = {};
    hdr.forEach((h, i) => row[h] = (cols[i] || '').trim().replace(/^"|"$/g, '').trim());
    return row;
  }).filter(r => r.language && r.level && r.english && r.translation && r.category);
}

/* ── Load default CSV ──────────────────────────────────────── */
async function loadDefaultCSV() {
  try {
    const res  = await fetch('data/sentences.csv');
    const text = await res.text();
    S.allRows  = parseCSV(text);
    init();
  } catch (e) {
    $('empty-state').textContent = 'Could not load data/sentences.csv';
    $('empty-state').classList.add('active');
  }
}

/* ── Init ───────────────────────────────────────────────────── */
function init() {
  buildLangOptions();
  buildCategoryChips();
  applyFilters();
  nextCard();
  loadSettings();
  attachEvents();
}

function buildLangOptions() {
  S.languages = ['All', ...new Set(S.allRows.map(r => r.language))];
  const sel = $('lang-sel');
  sel.innerHTML = S.languages.map(l => `<option value="${l}">${l}</option>`).join('');
  sel.value = S.lang;
}

function buildCategoryChips() {
  S.categories = [...new Set(S.allRows.map(r => r.category))].filter(Boolean).sort();
  const bar = $('cat-chips');
  bar.innerHTML = `<button class="chip active" data-cat="All">All</button>`;
  S.categories.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.cat = cat; b.textContent = cat;
    bar.appendChild(b);
  });
  bar.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    const cat = b.dataset.cat;
    if (cat === 'All') { S.categories_sel = ['All']; }
    else {
      S.categories_sel = S.categories_sel.filter(c => c !== 'All');
      if (S.categories_sel.includes(cat))
        S.categories_sel = S.categories_sel.filter(c => c !== cat);
      else S.categories_sel.push(cat);
      if (!S.categories_sel.length) S.categories_sel = ['All'];
    }
    syncChips();
    applyFilters();
    nextCard();
  }));
}

function syncChips() {
  $$('#cat-chips .chip').forEach(b =>
    b.classList.toggle('active',
      S.categories_sel.includes('All') ? b.dataset.cat === 'All' : S.categories_sel.includes(b.dataset.cat)
    )
  );
}

function applyFilters() {
  let r = S.allRows;
  if (S.lang  !== 'All') r = r.filter(x => x.language === S.lang);
  if (S.level !== 'All') r = r.filter(x => x.level    === S.level);
  if (!S.categories_sel.includes('All'))
    r = r.filter(x => S.categories_sel.includes(x.category));
  S.filtered = r;
  updateStats();
}

function updateStats() {
  $('stats-text').innerHTML =
    `<span>${S.filtered.length}</span> sentences &nbsp;·&nbsp; <span>${new Set(S.filtered.map(r => r.category)).size}</span> categories`;
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/* ── Card ───────────────────────────────────────────────────── */
function nextCard() {
  if (!S.filtered.length) {
    $('cards-grid').innerHTML = '';
    $('empty-state').classList.add('active');
    return;
  }
  $('empty-state').classList.remove('active');
  S.current  = S.filtered[Math.floor(Math.random() * S.filtered.length)];
  S.revealed = false;
  renderCard();
}

function renderCard() {
  const row  = S.current;
  const grid = $('cards-grid');

  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;

  // font size class
  const knownSizes = [14,16,18,20,24,28,32];
  const fsClass    = knownSizes.includes(S.fontSize)
    ? `fs-${S.fontSize}`
    : 'fs-custom';
  const fsStyle    = fsClass === 'fs-custom'
    ? `style="--custom-fs:${S.fontSize}px"`
    : '';

  grid.innerHTML = `
    <div class="card ${fsClass}" ${fsStyle} id="main-card">
      <div class="card-meta">
        <span class="card-level">${row.level}</span>
        <span class="card-cat">${row.category}</span>
        <span class="card-lang">${row.language}</span>
      </div>
      <div class="card-primary" id="card-primary">${escHtml(primary)}</div>
      <div class="card-secondary hidden" id="card-secondary">&nbsp;</div>
      <div class="card-hint" id="card-hint">${S.streamerMode ? 'click · or press key to reveal' : ''}</div>
      <button class="card-tts" id="card-tts-btn" title="Speak translation">
        <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      </button>
    </div>`;

  // In normal (non-streamer) mode: show translation immediately, scrambled in
  if (!S.streamerMode) {
    const sec = $('card-secondary');
    sec.classList.remove('hidden');
    scramble(sec, secondary, 380);
  }

  $('main-card').addEventListener('click', e => {
    if (e.target.closest('#card-tts-btn')) return;
    if (S.streamerMode) revealCard();
  });

  $('card-tts-btn').addEventListener('click', e => {
    e.stopPropagation();
    speakCurrent();
  });
}

function revealCard() {
  if (S.revealed) return;
  S.revealed = true;
  const row       = S.current;
  const secondary = S.creatorFlip ? row.english : row.translation;
  const sec       = $('card-secondary');
  const hint      = $('card-hint');
  const card      = $('main-card');
  sec.classList.remove('hidden');
  scramble(sec, secondary, 380, () => {
    if (!S.muted) speak(secondary, row.language);
  });
  card.classList.add('revealed');
  hint.textContent = '';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── TTS ────────────────────────────────────────────────────── */
const LANG_MAP = { German:'de-DE', French:'fr-FR', Polish:'pl-PL', Spanish:'es-ES', Italian:'it-IT', Japanese:'ja-JP' };
function speak(text, lang) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = LANG_MAP[lang] || 'de-DE';
  speechSynthesis.speak(u);
}
function speakCurrent() {
  if (S.muted || !S.current) return;
  const row  = S.current;
  const text = S.creatorFlip ? row.english : row.translation;
  speak(text, row.language);
}

/* ── Streamer mode ──────────────────────────────────────────── */
function setStreamerMode(on) {
  S.streamerMode = on;
  $('streamer-btn').classList.toggle('active', on);
  // hide/show topbar non-essential items
  const hideInStreamer = ['lang-sel','level-sel','filter-bar','stats-bar'];
  hideInStreamer.forEach(id => {
    const el = $(id); if (el) el.classList.toggle('streamer-hidden', on);
  });
  // hide bar-labels too
  $$('.bar-label').forEach(el => el.classList.toggle('streamer-hidden', on));
  // show/hide controls row
  $('controls-row').style.display = on ? 'flex' : 'none';
  // re-render card with/without auto-reveal
  S.revealed = false;
  renderCard();
}

/* ── Presentation mode ──────────────────────────────────────── */
function enterPres() {
  S.presPool    = shuffle(S.filtered);
  S.presIndex   = 0;
  S.presRevealed = false;
  S.presMode    = true;
  $('presentation-mode').classList.add('active');
  renderPresCard();
}
function exitPres() {
  S.presMode = false;
  $('presentation-mode').classList.remove('active');
}
function renderPresCard() {
  if (!S.presPool.length) return;
  const row       = S.presPool[S.presIndex % S.presPool.length];
  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;
  const pPrim = $('pres-primary'), pSec = $('pres-secondary');
  $('pres-meta').innerHTML = `<span class="pres-level">${row.level}</span><span>${row.category}</span><span>${row.language}</span>`;
  scramble(pPrim, primary, 400);
  pSec.classList.add('hidden');
  pSec.textContent = secondary;
  S.presRevealed = false;
  $('pres-progress-bar').style.width = ((S.presIndex + 1) / S.presPool.length * 100) + '%';
  const mirrored = $('mirror-btn').classList.contains('active');
  pPrim.classList.toggle('pres-mirrored', mirrored);
  pSec.classList.toggle('pres-mirrored', mirrored);
}
function presReveal() {
  if (S.presRevealed) return;
  S.presRevealed = true;
  const row       = S.presPool[S.presIndex % S.presPool.length];
  const secondary = S.creatorFlip ? row.english : row.translation;
  const pSec      = $('pres-secondary');
  pSec.classList.remove('hidden');
  scramble(pSec, secondary, 380, () => {
    if (!S.muted) speak(secondary, row.language);
  });
}
function presNext() {
  S.presIndex = (S.presIndex + 1) % S.presPool.length;
  S.presRevealed = false;
  renderPresCard();
}

/* ── Settings persist ───────────────────────────────────────── */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('tl_v2') || '{}');
    if (s.theme)     applyTheme(s.theme);
    if (s.fontSize)  applyFontSize(s.fontSize);
    if (s.keyReveal) S.keyReveal = s.keyReveal;
    if (s.keyNext)   S.keyNext   = s.keyNext;
    if (s.keyTTS)    S.keyTTS    = s.keyTTS;
    syncSettingsUI();
  } catch(e) {}
}
function saveSettings() {
  localStorage.setItem('tl_v2', JSON.stringify({
    theme: S.theme, fontSize: S.fontSize,
    keyReveal: S.keyReveal, keyNext: S.keyNext, keyTTS: S.keyTTS
  }));
}

function applyTheme(name) {
  S.theme = name;
  const el = document.documentElement;
  if (name === 'terminal') delete el.dataset.theme;
  else el.dataset.theme = name;
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === name));
  saveSettings();
}

function applyFontSize(px) {
  S.fontSize = parseInt(px) || 18;
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs) === S.fontSize));
  const ci = $('fs-custom-input');
  const known = [14,16,18,20,24,28,32];
  if (!known.includes(S.fontSize)) ci.value = S.fontSize;
  else ci.value = '';
  if (S.current) renderCard();
  saveSettings();
}

function syncSettingsUI() {
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === S.theme));
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs) === S.fontSize));
  const ki = $('key-reveal-input'); if (ki) ki.value = S.keyReveal === ' ' ? 'Space' : S.keyReveal.toUpperCase();
  const kn = $('key-next-input');   if (kn) kn.value = S.keyNext   === ' ' ? 'Space' : S.keyNext.toUpperCase();
  const kt = $('key-tts-input');    if (kt) kt.value = S.keyTTS    === ' ' ? 'Space' : S.keyTTS.toUpperCase();
  updateRevealLabel();
  updateKeyHints();
}

function updateRevealLabel() {
  const el = $('reveal-shortcut-label');
  if (el) el.textContent = S.keyReveal === ' ' ? 'Space' : S.keyReveal.toUpperCase();
}
function updateKeyHints() {
  const r = $('hint-reveal-key'); if (r) r.textContent = S.keyReveal === ' ' ? 'Space' : S.keyReveal.toUpperCase();
  const n = $('hint-next-key');   if (n) n.textContent = S.keyNext   === ' ' ? 'Space' : S.keyNext.toUpperCase();
  const t = $('hint-tts-key');    if (t) t.textContent = S.keyTTS    === ' ' ? 'Space' : S.keyTTS.toUpperCase();
}

/* ── Upload ─────────────────────────────────────────────────── */
function handleUpload(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (!rows.length) throw new Error('No valid rows. Check column headers.');
      S.allRows = rows;
      buildLangOptions();
      buildCategoryChips();
      applyFilters();
      nextCard();
      $('upload-status').className = 'upload-status ok';
      $('upload-status').textContent = `✓ Loaded ${rows.length} sentences from ${file.name}`;
      setTimeout(() => $('upload-overlay').classList.remove('active'), 1600);
    } catch(err) {
      $('upload-status').className = 'upload-status err';
      $('upload-status').textContent = '✗ ' + err.message;
    }
  };
  reader.readAsText(file);
}

/* ── Mute icon swap ─────────────────────────────────────────── */
const ICON_SOUND = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
const ICON_MUTED = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
function syncMuteIcon() {
  const ic = $('mute-icon'); if (!ic) return;
  ic.innerHTML = S.muted ? ICON_MUTED : ICON_SOUND;
  $('mute-btn').classList.toggle('active', S.muted);
}

/* ── Keyboard ───────────────────────────────────────────────── */
function handleKey(e) {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  const key = e.key === ' ' ? ' ' : e.key.toLowerCase();

  if (S.presMode) {
    if (key === S.keyReveal || e.key === 'Enter') { e.preventDefault(); presReveal(); return; }
    if (key === S.keyNext   || e.key === 'ArrowRight') { e.preventDefault(); presNext(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); S.presIndex = Math.max(0, S.presIndex - 1); renderPresCard(); return; }
    if (e.key === 'Escape') { exitPres(); return; }
    return;
  }
  if (e.key === 'Escape') {
    $('settings-overlay').classList.remove('active');
    $('upload-overlay').classList.remove('active');
    return;
  }
  if (key === S.keyReveal && S.streamerMode) { e.preventDefault(); revealCard(); return; }
  if (key === S.keyNext)                     { e.preventDefault(); nextCard();   return; }
  if (key === S.keyTTS)                      { e.preventDefault(); speakCurrent(); return; }
}

/* ── Attach events ──────────────────────────────────────────── */
function attachEvents() {
  $('lang-sel').addEventListener('change', e => { S.lang  = e.target.value; applyFilters(); nextCard(); });
  $('level-sel').addEventListener('change',e => { S.level = e.target.value; applyFilters(); nextCard(); });

  $('mute-btn').addEventListener('click', () => { S.muted = !S.muted; syncMuteIcon(); });

  $('streamer-btn').addEventListener('click', () => setStreamerMode(!S.streamerMode));

  $('settings-btn').addEventListener('click', () => $('settings-overlay').classList.add('active'));
  $('settings-close').addEventListener('click', () => $('settings-overlay').classList.remove('active'));
  $('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('active'); });

  $('upload-btn').addEventListener('click', () => $('upload-overlay').classList.add('active'));
  $('upload-close').addEventListener('click', () => $('upload-overlay').classList.remove('active'));
  $('upload-overlay').addEventListener('click', e => { if (e.target === $('upload-overlay')) $('upload-overlay').classList.remove('active'); });
  $('upload-file-input').addEventListener('change', e => { if (e.target.files[0]) handleUpload(e.target.files[0]); });
  const drop = $('upload-drop');
  drop.addEventListener('click', () => $('upload-file-input').click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); });

  // Theme dots
  $$('.theme-dot').forEach(d => d.addEventListener('click', () => applyTheme(d.dataset.theme)));

  // Font size buttons
  $$('.fs-btn').forEach(b => b.addEventListener('click', () => applyFontSize(b.dataset.fs)));
  $('fs-custom-input').addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (v >= 8 && v <= 72) { $$('.fs-btn').forEach(b => b.classList.remove('active')); applyFontSize(v); }
  });

  // Key remap
  function remapKey(inputId, stateKey, hintId, extraCb) {
    $(inputId).addEventListener('keydown', e => {
      e.preventDefault();
      S[stateKey] = e.key === ' ' ? ' ' : e.key.toLowerCase();
      e.target.value = e.key === ' ' ? 'Space' : e.key.toUpperCase();
      const h = $(hintId); if (h) h.textContent = e.target.value;
      if (extraCb) extraCb();
      saveSettings();
    });
  }
  remapKey('key-reveal-input', 'keyReveal', 'hint-reveal-key', updateRevealLabel);
  remapKey('key-next-input',   'keyNext',   'hint-next-key');
  remapKey('key-tts-input',    'keyTTS',    'hint-tts-key');

  // Controls
  $('next-btn').addEventListener('click', nextCard);
  $('reveal-btn').addEventListener('click', () => { if (S.streamerMode) revealCard(); });
  $('flip-btn').addEventListener('click', () => {
    S.creatorFlip = !S.creatorFlip;
    $('flip-label').textContent = S.creatorFlip ? 'Target → EN' : 'EN → Target';
    S.revealed = false;
    renderCard();
  });
  $('pres-enter-btn').addEventListener('click', enterPres);

  // Presentation
  $('pres-reveal-btn').addEventListener('click', presReveal);
  $('pres-next-btn').addEventListener('click', presNext);
  $('pres-prev-btn').addEventListener('click', () => { S.presIndex = Math.max(0, S.presIndex - 1); S.presRevealed = false; renderPresCard(); });
  $('pres-exit-btn').addEventListener('click', exitPres);
  $('mirror-btn').addEventListener('click', () => { $('mirror-btn').classList.toggle('active'); renderPresCard(); });

  document.addEventListener('keydown', handleKey);

  syncMuteIcon();
  syncSettingsUI();
}

/* ── Boot ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadDefaultCSV);
