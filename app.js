'use strict';

/* ── State ──────────────────────────────────────────────── */
const S = {
  allRows:       [],
  filtered:      [],
  pool:          [],   // ordered/shuffled pool for stepping through
  poolIndex:     0,
  languages:     [],
  categories:    [],
  lang:          'All',
  level:         'All',
  categories_sel:['All'],
  autoPlay:      true,   // mute button = auto-play on reveal toggle
  presMode:      false,
  presRevealed:  false,
  creatorFlip:   false,
  revealed:      false,
  mirrored:      false,
  randomize:     true,
  theme:         'terminal',
  fontSize:      22,
  keyReveal:     ' ',
  keyNext:       'ArrowRight',
  keyPrev:       'ArrowLeft',
  keyTTS:        's',
};

/* ── DOM ─────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Scramble ────────────────────────────────────────────── */
const CHARS = 'αβγδεζηθλμνξπρστυφχψωΔΣΩ'.split('');
function scrambleTick(el, target, frame, total, cb) {
  if (frame >= total) { el.textContent = target; cb && cb(); return; }
  el.textContent = target.split('').map((ch, i) =>
    i < Math.floor(frame / total * target.length)
      ? ch : ch === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('');
  requestAnimationFrame(() => scrambleTick(el, target, frame + 1, total, cb));
}
function scramble(el, text, ms, cb) {
  el.classList.add('scrambling');
  scrambleTick(el, text, 0, Math.round((ms || 360) / 16), () => {
    el.classList.remove('scrambling');
    cb && cb();
  });
}

/* ── CSV ─────────────────────────────────────────────────── */
function splitCSV(line) {
  const r = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { r.push(cur); cur = ''; }
    else cur += ch;
  }
  r.push(cur);
  return r;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const hdr   = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^\uFEFF/,''));
  return lines.slice(1).map(l => {
    const cols = splitCSV(l), row = {};
    hdr.forEach((h, i) => row[h] = (cols[i]||'').trim().replace(/^"|"$/g,'').trim());
    return row;
  }).filter(r => r.language && r.level && r.english && r.translation && r.category);
}

/* ── Load CSV ────────────────────────────────────────────── */
async function loadDefaultCSV() {
  try {
    // try relative path (works for file:// and http/https served)
    const res  = await fetch('./data/sentences.csv');
    if (!res.ok) throw new Error('not ok');
    const text = await res.text();
    S.allRows  = parseCSV(text);
    if (!S.allRows.length) throw new Error('empty');
    init();
  } catch (e) {
    $('empty-state').textContent = 'Could not load data/sentences.csv — upload a CSV or serve via a local server.';
    $('empty-state').classList.add('active');
    // still init UI so controls work for upload
    init();
  }
}

/* ── Init ────────────────────────────────────────────────── */
function init() {
  loadSettings();
  buildLangOptions();
  buildCategoryChips();
  applyFilters();
  buildPool();
  renderCard();
  attachEvents();
}

/* ── Filters ─────────────────────────────────────────────── */
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
    buildPool();
    renderCard();
  }));
}

function syncChips() {
  $$('#cat-chips .chip').forEach(b =>
    b.classList.toggle('active',
      S.categories_sel.includes('All') ? b.dataset.cat === 'All' : S.categories_sel.includes(b.dataset.cat))
  );
}

function applyFilters() {
  let r = S.allRows;
  if (S.lang  !== 'All') r = r.filter(x => x.language === S.lang);
  if (S.level !== 'All') r = r.filter(x => x.level    === S.level);
  if (!S.categories_sel.includes('All'))
    r = r.filter(x => S.categories_sel.includes(x.category));
  S.filtered = r;
  $('stats-text').innerHTML = S.filtered.length
    ? `<span>${S.filtered.length}</span> sentences &nbsp;·&nbsp; <span>${new Set(S.filtered.map(r=>r.category)).size}</span> categories`
    : '';
}

/* ── Pool (ordered or shuffled) ──────────────────────────── */
function shuffle(a) {
  const b = [...a];
  for (let i = b.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [b[i],b[j]] = [b[j],b[i]];
  }
  return b;
}
function buildPool() {
  S.pool = S.randomize ? shuffle(S.filtered) : [...S.filtered];
  S.poolIndex = 0;
}
function currentRow() { return S.pool[S.poolIndex] || null; }

/* ── Card render ─────────────────────────────────────────── */
function renderCard() {
  const row  = currentRow();
  const grid = $('cards-grid');
  S.revealed = false;

  if (!row) {
    grid.innerHTML = '';
    $('empty-state').classList.add('active');
    return;
  }
  $('empty-state').classList.remove('active');

  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;

  grid.innerHTML = `
    <div class="card" id="main-card" style="--card-fs:${S.fontSize}px" data-fs="1">
      <div class="card-meta">
        <span class="card-level">${row.level}</span>
        <span>${row.category}</span>
        <span>${row.language}</span>
      </div>
      <div class="card-primary" id="card-primary">${esc(primary)}</div>
      <div class="card-secondary hidden" id="card-secondary">&nbsp;</div>
      <div class="card-hint" id="card-hint">press Space or click to reveal</div>
      <button class="card-tts" id="card-tts-btn" title="Speak (${keyLabel(S.keyTTS)})">
        <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      </button>
    </div>`;

  $('main-card').addEventListener('click', e => {
    if (e.target.closest('#card-tts-btn')) return;
    revealCard();
  });
  $('card-tts-btn').addEventListener('click', e => { e.stopPropagation(); speakCurrent(); });

  // update present mode if open
  if (S.presMode) renderPresCard();
}

function revealCard() {
  if (S.revealed) return;
  S.revealed = true;
  const row       = currentRow(); if (!row) return;
  const secondary = S.creatorFlip ? row.english : row.translation;
  const sec       = $('card-secondary');
  const hint      = $('card-hint');
  sec.classList.remove('hidden');
  scramble(sec, secondary, 360, () => {
    if (S.autoPlay) speak(secondary, row.language);
  });
  $('main-card').classList.add('revealed');
  hint.textContent = '';
}

function goNext() {
  if (!S.pool.length) return;
  S.poolIndex = (S.poolIndex + 1) % S.pool.length;
  renderCard();
}
function goPrev() {
  if (!S.pool.length) return;
  S.poolIndex = (S.poolIndex - 1 + S.pool.length) % S.pool.length;
  renderCard();
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── TTS ─────────────────────────────────────────────────── */
const LANG_MAP = {German:'de-DE',French:'fr-FR',Polish:'pl-PL',Spanish:'es-ES',Italian:'it-IT',Japanese:'ja-JP'};
function speak(text, lang) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = LANG_MAP[lang] || 'de-DE';
  speechSynthesis.speak(u);
}
function speakCurrent() {
  const row = currentRow(); if (!row) return;
  speak(S.creatorFlip ? row.english : row.translation, row.language);
}

/* ── Present mode ────────────────────────────────────────── */
function enterPres() {
  S.presMode    = true;
  S.presRevealed = false;
  $('presentation-mode').classList.add('active');
  $('streamer-btn').classList.add('active');
  renderPresCard();
}
function exitPres() {
  S.presMode = false;
  $('presentation-mode').classList.remove('active');
  $('streamer-btn').classList.remove('active');
}
function renderPresCard() {
  const row = currentRow(); if (!row) return;
  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;
  const pPrim = $('pres-primary'), pSec = $('pres-secondary');

  $('pres-meta').innerHTML = `<span class="pres-level">${row.level}</span><span>${row.category}</span><span>${row.language}</span>`;
  scramble(pPrim, primary, 400);
  pSec.classList.add('hidden');
  pSec.textContent = secondary;
  S.presRevealed = false;

  // Apply font size
  pPrim.style.fontSize = S.fontSize + 'px';
  pSec.style.fontSize  = S.fontSize + 'px';

  // Mirror
  pPrim.classList.toggle('pres-mirrored', S.mirrored);
  pSec.classList.toggle('pres-mirrored',  S.mirrored);

  // Progress
  $('pres-progress-bar').style.width = ((S.poolIndex+1) / S.pool.length * 100) + '%';
}
function presReveal() {
  if (S.presRevealed) return;
  S.presRevealed = true;
  const row = currentRow(); if (!row) return;
  const secondary = S.creatorFlip ? row.english : row.translation;
  const pSec = $('pres-secondary');
  pSec.classList.remove('hidden');
  scramble(pSec, secondary, 360, () => {
    if (S.autoPlay) speak(secondary, row.language);
  });
}
function presNext() { goNext(); S.presRevealed = false; renderPresCard(); }
function presPrev() { goPrev(); S.presRevealed = false; renderPresCard(); }

/* ── Mute (auto-play) toggle ─────────────────────────────── */
const ICON_ON  = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
const ICON_OFF = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
function syncMuteBtn() {
  $('mute-icon').innerHTML = S.autoPlay ? ICON_ON : ICON_OFF;
  $('mute-btn').classList.toggle('active', !S.autoPlay);
  $('mute-btn').title = S.autoPlay ? 'Auto-play on: click to disable' : 'Auto-play off: click to enable';
}

/* ── Theme / Font ────────────────────────────────────────── */
function applyTheme(name) {
  S.theme = name;
  const el = document.documentElement;
  if (name === 'terminal') delete el.dataset.theme;
  else el.dataset.theme = name;
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === name));
  saveSettings();
}

function applyFontSize(px) {
  S.fontSize = Math.max(8, Math.min(72, parseInt(px) || 22));
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs) === S.fontSize));
  const known = [14,16,18,22,26,30,36];
  $('fs-custom-input').value = known.includes(S.fontSize) ? '' : S.fontSize;
  renderCard();
  saveSettings();
}

/* ── Settings persist ────────────────────────────────────── */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ll_v1') || '{}');
    if (s.theme)      applyTheme(s.theme);
    if (s.fontSize)   { S.fontSize   = s.fontSize; }
    if (s.keyReveal !== undefined) S.keyReveal = s.keyReveal;
    if (s.keyNext   !== undefined) S.keyNext   = s.keyNext;
    if (s.keyPrev   !== undefined) S.keyPrev   = s.keyPrev;
    if (s.keyTTS    !== undefined) S.keyTTS    = s.keyTTS;
    if (s.randomize !== undefined) S.randomize = s.randomize;
    if (s.autoPlay  !== undefined) S.autoPlay  = s.autoPlay;
  } catch(e) {}
}
function saveSettings() {
  localStorage.setItem('ll_v1', JSON.stringify({
    theme: S.theme, fontSize: S.fontSize,
    keyReveal: S.keyReveal, keyNext: S.keyNext, keyPrev: S.keyPrev, keyTTS: S.keyTTS,
    randomize: S.randomize, autoPlay: S.autoPlay,
  }));
}

function syncSettingsUI() {
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === S.theme));
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs) === S.fontSize));
  syncToggle('toggle-random', S.randomize);
  syncMuteBtn();
  const keys = {
    'key-reveal-input': S.keyReveal,
    'key-next-input':   S.keyNext,
    'key-prev-input':   S.keyPrev,
    'key-tts-input':    S.keyTTS,
  };
  Object.entries(keys).forEach(([id, val]) => {
    const el = $(id); if (el) el.value = keyLabel(val);
  });
  updateShortcutLabels();
  updateKeyHints();
}

function syncToggle(id, val) {
  const el = $(id); if (el) el.classList.toggle('on', val);
}

function keyLabel(k) {
  if (k === ' ')           return 'Space';
  if (k === 'ArrowRight')  return '→';
  if (k === 'ArrowLeft')   return '←';
  if (k === 'ArrowUp')     return '↑';
  if (k === 'ArrowDown')   return '↓';
  return k.toUpperCase();
}

function updateShortcutLabels() {
  const r = $('reveal-shortcut-label');  if (r) r.textContent = keyLabel(S.keyReveal);
  const pr = $('pres-reveal-shortcut');  if (pr) pr.textContent = keyLabel(S.keyReveal);
  const pt = $('pres-tts-shortcut');     if (pt) pt.textContent = keyLabel(S.keyTTS);
}
function updateKeyHints() {
  const m = {
    'hint-reveal-key': S.keyReveal,
    'hint-next-key':   S.keyNext,
    'hint-prev-key':   S.keyPrev,
    'hint-tts-key':    S.keyTTS,
  };
  Object.entries(m).forEach(([id, val]) => { const el=$(id); if(el) el.textContent = keyLabel(val); });
}

/* ── Keyboard ────────────────────────────────────────────── */
function matchKey(e, k) {
  if (k === ' ')          return e.key === ' ';
  if (k === 'ArrowRight') return e.key === 'ArrowRight';
  if (k === 'ArrowLeft')  return e.key === 'ArrowLeft';
  if (k === 'ArrowUp')    return e.key === 'ArrowUp';
  if (k === 'ArrowDown')  return e.key === 'ArrowDown';
  return e.key.toLowerCase() === k.toLowerCase();
}

function handleKey(e) {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;

  if (S.presMode) {
    if (e.key === 'Escape')            { exitPres(); return; }
    if (matchKey(e, S.keyReveal))      { e.preventDefault(); presReveal(); return; }
    if (matchKey(e, S.keyNext))        { e.preventDefault(); presNext();   return; }
    if (matchKey(e, S.keyPrev))        { e.preventDefault(); presPrev();   return; }
    if (matchKey(e, S.keyTTS))         { e.preventDefault(); speakCurrent(); return; }
    return;
  }

  if (e.key === 'Escape') {
    $('settings-overlay').classList.remove('active');
    $('upload-overlay').classList.remove('active');
    return;
  }
  if (matchKey(e, S.keyReveal)) { e.preventDefault(); revealCard();   return; }
  if (matchKey(e, S.keyNext))   { e.preventDefault(); goNext();       return; }
  if (matchKey(e, S.keyPrev))   { e.preventDefault(); goPrev();       return; }
  if (matchKey(e, S.keyTTS))    { e.preventDefault(); speakCurrent(); return; }
}

/* ── Upload ──────────────────────────────────────────────── */
function handleUpload(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (!rows.length) throw new Error('No valid rows found. Check column headers.');
      S.allRows = rows;
      buildLangOptions();
      buildCategoryChips();
      applyFilters();
      buildPool();
      renderCard();
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

/* ── Attach events ───────────────────────────────────────── */
function attachEvents() {
  $('lang-sel').addEventListener('change', e  => { S.lang  = e.target.value; applyFilters(); buildPool(); renderCard(); });
  $('level-sel').addEventListener('change', e => { S.level = e.target.value; applyFilters(); buildPool(); renderCard(); });

  $('mute-btn').addEventListener('click', () => { S.autoPlay = !S.autoPlay; syncMuteBtn(); saveSettings(); });
  $('streamer-btn').addEventListener('click', () => S.presMode ? exitPres() : enterPres());

  $('settings-btn').addEventListener('click',  () => $('settings-overlay').classList.add('active'));
  $('settings-close').addEventListener('click', () => $('settings-overlay').classList.remove('active'));
  $('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('active'); });

  $('upload-btn').addEventListener('click',  () => $('upload-overlay').classList.add('active'));
  $('upload-close').addEventListener('click', () => $('upload-overlay').classList.remove('active'));
  $('upload-overlay').addEventListener('click', e => { if (e.target === $('upload-overlay')) $('upload-overlay').classList.remove('active'); });
  $('upload-file-input').addEventListener('change', e => { if (e.target.files[0]) handleUpload(e.target.files[0]); });
  const drop = $('upload-drop');
  drop.addEventListener('click', () => $('upload-file-input').click());
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); });

  $$('.theme-dot').forEach(d => d.addEventListener('click', () => applyTheme(d.dataset.theme)));

  $$('.fs-btn').forEach(b => b.addEventListener('click', () => applyFontSize(b.dataset.fs)));
  $('fs-custom-input').addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (v >= 8 && v <= 72) { $$('.fs-btn').forEach(b => b.classList.remove('active')); applyFontSize(v); }
  });

  // Randomize toggle
  $('toggle-random').addEventListener('click', () => {
    S.randomize = !S.randomize;
    syncToggle('toggle-random', S.randomize);
    buildPool();
    renderCard();
    saveSettings();
  });

  // Key remap
  function remapKey(inputId, stateKey) {
    $(inputId).addEventListener('keydown', e => {
      e.preventDefault();
      S[stateKey] = e.key;
      e.target.value = keyLabel(e.key);
      updateShortcutLabels();
      updateKeyHints();
      saveSettings();
    });
  }
  remapKey('key-reveal-input', 'keyReveal');
  remapKey('key-next-input',   'keyNext');
  remapKey('key-prev-input',   'keyPrev');
  remapKey('key-tts-input',    'keyTTS');

  // Controls row
  $('prev-btn').addEventListener('click',   goPrev);
  $('next-btn').addEventListener('click',   goNext);
  $('reveal-btn').addEventListener('click', revealCard);
  $('flip-btn').addEventListener('click', () => {
    S.creatorFlip = !S.creatorFlip;
    $('flip-label').textContent = S.creatorFlip ? 'Target → EN' : 'EN → Target';
    renderCard();
  });
  $('mirror-btn').addEventListener('click', () => {
    S.mirrored = !S.mirrored;
    $('mirror-btn').classList.toggle('active', S.mirrored);
    if (S.presMode) renderPresCard();
  });

  // Present controls
  $('pres-reveal-btn').addEventListener('click', presReveal);
  $('pres-next-btn').addEventListener('click',   presNext);
  $('pres-prev-btn').addEventListener('click',   presPrev);
  $('pres-tts-btn').addEventListener('click',    speakCurrent);
  $('pres-mirror-btn').addEventListener('click', () => {
    S.mirrored = !S.mirrored;
    $('pres-mirror-btn').classList.toggle('active', S.mirrored);
    $('mirror-btn').classList.toggle('active', S.mirrored);
    renderPresCard();
  });
  $('pres-exit-btn').addEventListener('click', exitPres);

  document.addEventListener('keydown', handleKey);

  syncSettingsUI();

  // Show controls row always (they're the nav even outside pres mode)
  $('controls-row').style.display = 'flex';
}

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadDefaultCSV);
