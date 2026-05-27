/* ============================================================
   TERMINAL LINGO — app.js
   ============================================================ */

'use strict';

// ---------- State ----------
const S = {
  allRows:       [],
  filtered:      [],
  deck:          [],
  deckIndex:     0,
  languages:     [],
  categories:    [],
  lang:          'All',
  level:         'All',
  count:         1,
  categories_sel: ['All'],
  muted:         false,
  creatorMode:   false,
  creatorFlip:   false,   // false = EN→Target, true = Target→EN
  presMode:      false,
  presIndex:     0,
  presRevealed:  false,
  theme:         'terminal',
  fontSizePrimary:     'default',
  fontSizeSecondary:   'default',
  keyReveal:     'r',
  keyNext:       ' ',
  revealedCards: new Set(),
};

// ---------- DOM refs ----------
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ---------- Scramble chars ----------
const SCRAMBLE = 'αβγδεζηθλμνξπρστυφχψωΔΣΩ '.split('');
function scrambleTick(el, target, frame, total, cb) {
  if (frame >= total) { el.textContent = target; if (cb) cb(); return; }
  el.textContent = target.split('').map((ch, i) => {
    if (i < Math.floor((frame / total) * target.length)) return ch;
    return ch === ' ' ? ' ' : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
  }).join('');
  requestAnimationFrame(() => scrambleTick(el, target, frame + 1, total, cb));
}
function scramble(el, target, duration = 400, cb) {
  const frames = Math.round(duration / 16);
  el.classList.add('scrambling');
  scrambleTick(el, target, 0, frames, () => {
    el.classList.remove('scrambling');
    if (cb) cb();
  });
}

// ---------- CSV Parser ----------
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 5) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] || '').trim().replace(/^"|"$/g, '').trim(); });
    if (row.language && row.level && row.english && row.translation && row.category) {
      rows.push(row);
    }
  }
  return rows;
}
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ---------- Load default CSV ----------
async function loadDefaultCSV() {
  try {
    const res = await fetch('data/sentences.csv');
    const text = await res.text();
    S.allRows = parseCSV(text);
    init();
  } catch (e) {
    $('empty-state').textContent = 'Could not load sentences.csv — check the data/ folder.';
    $('empty-state').classList.add('active');
  }
}

// ---------- Init ----------
function init() {
  buildLanguageOptions();
  buildCategoryChips();
  applyFilters();
  renderDeck();
  attachEvents();
  loadSettings();
}

function buildLanguageOptions() {
  S.languages = ['All', ...new Set(S.allRows.map(r => r.language))].filter(Boolean);
  const sel = $('lang-sel');
  sel.innerHTML = S.languages.map(l => `<option value="${l}">${l}</option>`).join('');
  sel.value = S.lang;
}

function buildCategoryChips() {
  S.categories = [...new Set(S.allRows.map(r => r.category))].filter(Boolean).sort();
  const bar = $('cat-chips');
  bar.innerHTML = `<button class="chip active" data-cat="All">All</button>`;
  S.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    bar.appendChild(btn);
  });
  bar.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (cat === 'All') {
        S.categories_sel = ['All'];
      } else {
        S.categories_sel = S.categories_sel.filter(c => c !== 'All');
        if (S.categories_sel.includes(cat)) {
          S.categories_sel = S.categories_sel.filter(c => c !== cat);
          if (S.categories_sel.length === 0) S.categories_sel = ['All'];
        } else {
          S.categories_sel.push(cat);
        }
      }
      syncCategoryChips();
      applyFilters();
      renderDeck();
    });
  });
}

function syncCategoryChips() {
  $$('#cat-chips .chip').forEach(btn => {
    btn.classList.toggle('active',
      S.categories_sel.includes('All') ? btn.dataset.cat === 'All' : S.categories_sel.includes(btn.dataset.cat)
    );
  });
}

function applyFilters() {
  let rows = S.allRows;
  if (S.lang !== 'All') rows = rows.filter(r => r.language === S.lang);
  if (S.level !== 'All') rows = rows.filter(r => r.level === S.level);
  if (!S.categories_sel.includes('All')) {
    rows = rows.filter(r => S.categories_sel.includes(r.category));
  }
  S.filtered = rows;
  updateStats();
}

function updateStats() {
  const el = $('stats-text');
  if (el) el.innerHTML = `<span>${S.filtered.length}</span> sentences &nbsp;·&nbsp; <span>${new Set(S.filtered.map(r => r.category)).size}</span> categories`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderDeck() {
  S.revealedCards.clear();
  if (S.filtered.length === 0) {
    $('cards-grid').innerHTML = '';
    $('empty-state').classList.add('active');
    return;
  }
  $('empty-state').classList.remove('active');
  const pool = shuffle(S.filtered);
  S.deck = pool.slice(0, S.count);
  buildCards();

  if (S.presMode) {
    S.presIndex = 0;
    S.presRevealed = false;
    renderPresCard();
  }
}

function buildCards() {
  const grid = $('cards-grid');
  grid.innerHTML = '';
  S.deck.forEach((row, idx) => {
    const card = makeCard(row, idx);
    grid.appendChild(card);
  });
}

function makeCard(row, idx) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.idx = idx;

  const primaryText = S.creatorFlip ? row.translation : row.english;
  const secondaryText = S.creatorFlip ? row.english : row.translation;

  card.innerHTML = `
    <div class="card-meta">
      <span class="card-level">${row.level}</span>
      <span class="card-cat">${row.category}</span>
      <span class="card-lang">${row.language}</span>
    </div>
    <div class="card-primary font-${S.fontSizePrimary}">${primaryText}</div>
    <div class="card-secondary font-${S.fontSizeSecondary} hidden">&nbsp;</div>
    <div class="card-hint">${S.creatorMode ? 'click to reveal' : ''}</div>
    <button class="card-tts" title="Speak translation" data-text="${secondaryText.replace(/"/g, '&quot;')}" data-lang="${row.language}">
      <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>
  `;

  if (!S.creatorMode) {
    // In browse mode, show translation immediately (scrambled in)
    const secEl = card.querySelector('.card-secondary');
    secEl.classList.remove('hidden');
    scramble(secEl, secondaryText, 350);
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-tts')) return;
    if (S.creatorMode) toggleReveal(card, idx, secondaryText);
  });

  card.querySelector('.card-tts').addEventListener('click', (e) => {
    e.stopPropagation();
    speak(secondaryText, row.language);
  });

  return card;
}

function toggleReveal(card, idx, secondaryText) {
  const sec = card.querySelector('.card-secondary');
  const hint = card.querySelector('.card-hint');
  if (S.revealedCards.has(idx)) {
    // hide
    S.revealedCards.delete(idx);
    card.classList.remove('revealed');
    sec.classList.add('hidden');
    sec.textContent = '\u00a0';
    hint.textContent = 'click to reveal';
  } else {
    // reveal
    S.revealedCards.add(idx);
    card.classList.add('revealed');
    sec.classList.remove('hidden');
    scramble(sec, secondaryText, 380);
    hint.textContent = '';
  }
}

function revealAll() {
  S.deck.forEach((row, idx) => {
    const card = document.querySelector(`.card[data-idx="${idx}"]`);
    if (!card) return;
    const secondaryText = S.creatorFlip ? row.english : row.translation;
    const sec = card.querySelector('.card-secondary');
    const hint = card.querySelector('.card-hint');
    if (!S.revealedCards.has(idx)) {
      S.revealedCards.add(idx);
      card.classList.add('revealed');
      sec.classList.remove('hidden');
      scramble(sec, secondaryText, 380);
      hint.textContent = '';
    }
  });
}

// ---------- TTS ----------
function speak(text, lang) {
  if (S.muted) return;
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  // Map language to BCP-47
  const langMap = { German: 'de-DE', French: 'fr-FR', Polish: 'pl-PL', Spanish: 'es-ES', Italian: 'it-IT', Japanese: 'ja-JP' };
  utt.lang = langMap[lang] || 'de-DE';
  speechSynthesis.speak(utt);
}

// ---------- Presentation Mode ----------
function enterPresMode() {
  S.presMode = true;
  S.presIndex = 0;
  S.presRevealed = false;
  $('presentation-mode').classList.add('active');
  renderPresCard();
  $('creator-btn').classList.add('active');
}
function exitPresMode() {
  S.presMode = false;
  $('presentation-mode').classList.remove('active');
  $('creator-btn').classList.remove('active');
}
function renderPresCard() {
  if (S.deck.length === 0) return;
  const row = S.deck[S.presIndex % S.deck.length];
  const primaryText = S.creatorFlip ? row.translation : row.english;
  const secondaryText = S.creatorFlip ? row.english : row.translation;

  const pPrim = $('pres-primary');
  const pSec  = $('pres-secondary');
  const pMeta = $('pres-meta');
  const pProg = $('pres-progress-bar');

  pMeta.innerHTML = `<span class="pres-level">${row.level}</span><span>${row.category}</span><span>${row.language}</span>`;
  scramble(pPrim, primaryText, 400);
  pSec.classList.add('hidden');
  pSec.textContent = secondaryText;
  S.presRevealed = false;

  const pct = ((S.presIndex + 1) / S.deck.length) * 100;
  pProg.style.width = pct + '%';

  // font sizes
  pPrim.className = 'pres-primary';
  if (S.fontSizePrimary !== 'default') pPrim.classList.add('font-' + S.fontSizePrimary);
  pSec.className = 'pres-secondary hidden';
  if (S.fontSizeSecondary !== 'default') pSec.classList.add('font-' + S.fontSizeSecondary);
  if ($('mirror-btn').classList.contains('active')) {
    pPrim.classList.add('pres-mirrored');
    pSec.classList.add('pres-mirrored');
  }
}
function presReveal() {
  if (S.presRevealed) return;
  const pSec = $('pres-secondary');
  pSec.classList.remove('hidden');
  S.presRevealed = true;
  const row = S.deck[S.presIndex % S.deck.length];
  const secondaryText = S.creatorFlip ? row.english : row.translation;
  scramble(pSec, secondaryText, 380);
  if (!S.muted) speak(secondaryText, row.language);
}
function presNext() {
  S.presIndex = (S.presIndex + 1) % S.deck.length;
  S.presRevealed = false;
  renderPresCard();
}

// ---------- Settings ----------
function openSettings() { $('settings-overlay').classList.add('active'); }
function closeSettings() { $('settings-overlay').classList.remove('active'); }

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('tl_settings') || '{}');
    if (saved.theme) setTheme(saved.theme);
    if (saved.fontSizePrimary) setFontSize('primary', saved.fontSizePrimary);
    if (saved.fontSizeSecondary) setFontSize('secondary', saved.fontSizeSecondary);
    if (saved.keyReveal) S.keyReveal = saved.keyReveal;
    if (saved.keyNext !== undefined) S.keyNext = saved.keyNext;
    if (saved.count) { S.count = saved.count; syncCountSelect(); }
    syncSettingsUI();
  } catch(e) {}
}

function saveSettings() {
  localStorage.setItem('tl_settings', JSON.stringify({
    theme: S.theme,
    fontSizePrimary: S.fontSizePrimary,
    fontSizeSecondary: S.fontSizeSecondary,
    keyReveal: S.keyReveal,
    keyNext: S.keyNext,
    count: S.count,
  }));
}

function setTheme(name) {
  S.theme = name;
  document.documentElement.dataset.theme = name === 'terminal' ? '' : name;
  if (name === 'terminal') delete document.documentElement.dataset.theme;
  $$('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === name));
  saveSettings();
}

function setFontSize(which, size) {
  if (which === 'primary') {
    S.fontSizePrimary = size;
    $$('#font-size-primary .size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
  } else {
    S.fontSizeSecondary = size;
    $$('#font-size-secondary .size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
  }
  // rerender cards with new font sizes
  $$('.card-primary').forEach(el => {
    el.className = 'card-primary' + (size !== 'default' && which === 'primary' ? ' font-' + size : el.className.replace('card-primary','').trim());
  });
  buildCards();
  saveSettings();
}

function syncSettingsUI() {
  $$('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === S.theme));
  $$('#font-size-primary .size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === S.fontSizePrimary));
  $$('#font-size-secondary .size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === S.fontSizeSecondary));
  const kr = $('key-reveal-input'); if (kr) kr.value = S.keyReveal === ' ' ? 'Space' : S.keyReveal.toUpperCase();
  const kn = $('key-next-input');   if (kn) kn.value = S.keyNext  === ' ' ? 'Space' : S.keyNext.toUpperCase();
  syncCategoryChips();
  syncCountSelect();
}

function syncCountSelect() {
  const sel = $('count-sel');
  if (sel) sel.value = S.count;
}

// ---------- Upload ----------
function openUpload() { $('upload-overlay').classList.add('active'); }
function closeUpload() { $('upload-overlay').classList.remove('active'); }

function handleUploadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (rows.length === 0) throw new Error('No valid rows found. Check column headers.');
      S.allRows = rows;
      buildLanguageOptions();
      buildCategoryChips();
      applyFilters();
      renderDeck();
      $('upload-status').className = 'upload-status ok';
      $('upload-status').textContent = `✓ Loaded ${rows.length} sentences from ${file.name}`;
      setTimeout(closeUpload, 1500);
    } catch(err) {
      $('upload-status').className = 'upload-status err';
      $('upload-status').textContent = '✗ ' + err.message;
    }
  };
  reader.readAsText(file);
}

// ---------- Keyboard ----------
function handleKey(e) {
  // Ignore when typing in inputs
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;

  const key = e.key === ' ' ? ' ' : e.key.toLowerCase();

  if (S.presMode) {
    if (key === S.keyReveal) { e.preventDefault(); presReveal(); return; }
    if (key === S.keyNext || e.key === 'ArrowRight') { e.preventDefault(); presNext(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); S.presIndex = Math.max(0, S.presIndex - 1); renderPresCard(); return; }
    if (e.key === 'Escape') { exitPresMode(); return; }
    return;
  }

  if (e.key === 'Escape') {
    closeSettings(); closeUpload(); return;
  }
  if (key === S.keyReveal && S.creatorMode) { e.preventDefault(); revealAll(); return; }
  if (key === S.keyNext) { e.preventDefault(); renderDeck(); return; }
}

// ---------- Attach Events ----------
function attachEvents() {
  // Language
  $('lang-sel').addEventListener('change', e => {
    S.lang = e.target.value;
    applyFilters();
    renderDeck();
  });

  // Level
  $('level-sel').addEventListener('change', e => {
    S.level = e.target.value;
    applyFilters();
    renderDeck();
  });

  // Count
  $('count-sel').addEventListener('change', e => {
    S.count = parseInt(e.target.value);
    saveSettings();
    renderDeck();
  });

  // Mute
  $('mute-btn').addEventListener('click', () => {
    S.muted = !S.muted;
    $('mute-btn').classList.toggle('active', S.muted);
    $('mute-btn').title = S.muted ? 'Unmute' : 'Mute';
  });

  // Creator mode toggle
  $('creator-btn').addEventListener('click', () => {
    if (S.presMode) { exitPresMode(); S.creatorMode = false; }
    else { S.creatorMode = !S.creatorMode; enterOrExitCreator(); }
  });

  // Settings
  $('settings-btn').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  $('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) closeSettings(); });

  // Upload
  $('upload-btn').addEventListener('click', openUpload);
  $('upload-close').addEventListener('click', closeUpload);
  $('upload-overlay').addEventListener('click', e => { if (e.target === $('upload-overlay')) closeUpload(); });
  $('upload-file-input').addEventListener('change', e => {
    if (e.target.files[0]) handleUploadFile(e.target.files[0]);
  });
  const drop = $('upload-drop');
  drop.addEventListener('click', () => $('upload-file-input').click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleUploadFile(e.dataTransfer.files[0]);
  });

  // Theme swatches
  $$('.theme-swatch').forEach(s => {
    s.addEventListener('click', () => setTheme(s.dataset.theme));
  });

  // Font size buttons
  $$('#font-size-primary .size-btn').forEach(b => {
    b.addEventListener('click', () => setFontSize('primary', b.dataset.size));
  });
  $$('#font-size-secondary .size-btn').forEach(b => {
    b.addEventListener('click', () => setFontSize('secondary', b.dataset.size));
  });

  // Key remap
  $('key-reveal-input').addEventListener('keydown', e => {
    e.preventDefault();
    S.keyReveal = e.key === ' ' ? ' ' : e.key.toLowerCase();
    e.target.value = e.key === ' ' ? 'Space' : e.key.toUpperCase();
    saveSettings();
  });
  $('key-next-input').addEventListener('keydown', e => {
    e.preventDefault();
    S.keyNext = e.key === ' ' ? ' ' : e.key.toLowerCase();
    e.target.value = e.key === ' ' ? 'Space' : e.key.toUpperCase();
    saveSettings();
    updateKeyHints();
  });

  // Controls row
  $('next-btn').addEventListener('click', renderDeck);
  $('reveal-btn').addEventListener('click', revealAll);
  $('flip-btn').addEventListener('click', () => {
    S.creatorFlip = !S.creatorFlip;
    $('flip-btn').querySelector('.flip-label').textContent = S.creatorFlip ? 'Target → EN' : 'EN → Target';
    buildCards();
  });

  // Presentation controls
  $('pres-reveal-btn').addEventListener('click', presReveal);
  $('pres-next-btn').addEventListener('click', presNext);
  $('pres-prev-btn').addEventListener('click', () => { S.presIndex = Math.max(0, S.presIndex - 1); renderPresCard(); });
  $('pres-exit-btn').addEventListener('click', exitPresMode);
  $('mirror-btn').addEventListener('click', () => {
    $('mirror-btn').classList.toggle('active');
    renderPresCard();
  });

  // Pres enter from controls
  const peb2 = document.getElementById("pres-enter-btn2");
  if (peb2) peb2.addEventListener("click", () => { S.creatorMode = true; enterOrExitCreator(); enterPresMode(); });

  // Keyboard
  document.addEventListener('keydown', handleKey);

  updateKeyHints();
}

function enterOrExitCreator() {
  $('creator-btn').classList.toggle('active', S.creatorMode);
  const ctrlRow = $('controls-row');
  if (S.creatorMode) {
    ctrlRow.style.display = 'flex';
    if (S.presMode) exitPresMode();
    document.getElementById('pres-enter-btn2').style.display = 'flex';
  } else {
    document.getElementById('pres-enter-btn2').style.display = 'none';
    S.presMode = false;
    $('presentation-mode').classList.remove('active');
  }
  buildCards();
}

function updateKeyHints() {
  const r = $('hint-reveal-key'); if (r) r.textContent = S.keyReveal === ' ' ? 'Space' : S.keyReveal.toUpperCase();
  const n = $('hint-next-key');   if (n) n.textContent = S.keyNext   === ' ' ? 'Space' : S.keyNext.toUpperCase();
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  loadDefaultCSV();
});
