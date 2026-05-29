'use strict';

/* ── CSV source ─────────────────────────────────────────── */
const GDRIVE_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRfCI2jZaiIncwd9H8Edmgov8VWTKaMAd27my9FgecSF_UuAJAp-vVmM8JZJygpdXUJEV-uK2wdwmL/pub?output=csv';

/* ── State ──────────────────────────────────────────────── */
const S = {
  allRows:[], filtered:[], pool:[], poolIndex:0,
  languages:[], categories:[],
  lang:'All', level:'All', categories_sel:['All'],
  autoPlay:true, presMode:false, presRevealed:false,
  creatorFlip:false, revealed:false, randomize:true,
  theme:'latte', fontSize:22,
  keyReveal:' ', keyNext:'ArrowRight', keyPrev:'ArrowLeft', keyTTS:'s',
  customVars:{}, ttsVoice:'',
};

const COLOR_VARS = [
  {key:'--bg',label:'Background'},
  {key:'--bg2',label:'Background 2'},
  {key:'--bg3',label:'Background 3'},
  {key:'--border',label:'Border'},
  {key:'--text',label:'Text'},
  {key:'--text-dim',label:'Text Dim'},
  {key:'--head',label:'Heading'},
  {key:'--accent',label:'Accent'},
  {key:'--card-bg',label:'Card BG'},
  {key:'--card-border',label:'Card Border'},
];

/* ── DOM ─────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── Cursor (GSAP) ──────────────────────────────────────── */
function initCursor() {
  const cur = $('cursor');
  if (!cur || !window.gsap) return;
  const onMove = e => gsap.to(cur, { x:e.clientX, y:e.clientY, duration:0.25, ease:'power2.out' });
  const onOver = e => { if (e.target.closest('a,button,.customcursor')) cur.classList.add('cursor--hover'); };
  const onOut  = e => { if (e.target.closest('a,button,.customcursor')) cur.classList.remove('cursor--hover'); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('pointerover', onOver);
  window.addEventListener('pointerout', onOut);
}

/* ── Settings scrollbar auto-hide ───────────────────────── */
function initSettingsScroll() {
  const panel = $('settings-panel'); if (!panel) return;
  let timer;
  panel.addEventListener('scroll', () => {
    panel.classList.add('scrolling');
    clearTimeout(timer);
    timer = setTimeout(() => panel.classList.remove('scrolling'), 800);
  });
}

/* ── Custom dropdowns ───────────────────────────────────── */
function makeDropdown(containerId, options, current, onChange) {
  const wrap = $(containerId);
  wrap.innerHTML = '';

  const btn = document.createElement('div');
  btn.className = 'custom-select-btn';
  btn.innerHTML = `<span class="csd-label">${current}</span><span class="custom-select-arrow">▾</span>`;

  const list = document.createElement('div');
  list.className = 'custom-select-list';

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'custom-select-option' + (opt === current ? ' selected' : '');
    item.textContent = opt;
    item.addEventListener('click', e => {
      e.stopPropagation();
      list.querySelectorAll('.custom-select-option').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      btn.querySelector('.csd-label').textContent = opt;
      list.classList.remove('open');
      btn.classList.remove('open');
      onChange(opt);
    });
    list.appendChild(item);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = list.classList.contains('open');
    // close all open dropdowns first
    $$('.custom-select-list.open').forEach(l => l.classList.remove('open'));
    $$('.custom-select-btn.open').forEach(b => b.classList.remove('open'));
    if (!isOpen) { list.classList.add('open'); btn.classList.add('open'); }
  });

  wrap.appendChild(btn);
  wrap.appendChild(list);
}

// close dropdowns when clicking outside
document.addEventListener('click', () => {
  $$('.custom-select-list.open').forEach(l => l.classList.remove('open'));
  $$('.custom-select-btn.open').forEach(b => b.classList.remove('open'));
});

/* ── Scramble ────────────────────────────────────────────── */
const CHARS = 'αβγδεζηθλμνξπρστυφχψωΔΣΩ'.split('');
function scrambleTick(el, target, frame, total, cb) {
  if (frame >= total) { el.textContent = target; cb && cb(); return; }
  el.textContent = target.split('').map((ch,i) =>
    i < Math.floor(frame/total*target.length)
      ? ch : ch===' ' ? ' ' : CHARS[Math.floor(Math.random()*CHARS.length)]
  ).join('');
  requestAnimationFrame(() => scrambleTick(el, target, frame+1, total, cb));
}
function scramble(el, text, ms, cb) {
  el.classList.add('scrambling');
  scrambleTick(el, text, 0, Math.round((ms||360)/16), () => {
    el.classList.remove('scrambling'); cb && cb();
  });
}

/* ── CSV ─────────────────────────────────────────────────── */
function splitCSV(line) {
  const r=[]; let cur='', q=false;
  for (const ch of line) {
    if (ch==='"') q=!q;
    else if (ch===',' && !q) { r.push(cur); cur=''; }
    else cur+=ch;
  }
  r.push(cur); return r;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const hdr   = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/^\uFEFF/,''));
  return lines.slice(1).map(l => {
    const cols=splitCSV(l), row={};
    hdr.forEach((h,i) => row[h]=(cols[i]||'').trim().replace(/^"|"$/g,'').trim());
    return row;
  }).filter(r => r.language && r.level && r.english && r.translation && r.category);
}

/* ── Load CSV ────────────────────────────────────────────── */
async function loadDefaultCSV() {
  try {
    const res = await fetch(GDRIVE_CSV);
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    if (text.trim().startsWith('<')) throw new Error('got HTML, not CSV');
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('no rows');
    S.allRows = rows;
    afterLoad();
    return;
  } catch(e) { console.warn('GDrive CSV failed:', e.message); }

  try {
    const res = await fetch('./data/sentences.csv');
    if (!res.ok) throw new Error('local not found');
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('empty');
    S.allRows = rows;
    afterLoad();
    return;
  } catch(e) { console.warn('Local CSV failed:', e.message); }

  $('empty-state').textContent = 'No sentences loaded — upload a CSV using the CSV button.';
  $('empty-state').classList.add('active');
  afterLoad();
}

function afterLoad() {
  buildLangDropdown();
  buildLevelDropdown();
  buildCategoryChips();
  applyFilters();
  buildPool();
  renderCard();
}

/* ── Filters ─────────────────────────────────────────────── */
function buildLangDropdown() {
  S.languages = ['All', ...new Set(S.allRows.map(r=>r.language))];
  makeDropdown('lang-dropdown', S.languages, S.lang, val => {
    S.lang = val; applyFilters(); buildPool(); renderCard();
  });
}

function buildLevelDropdown() {
  const levels = ['All','A1','A2','B1','B2','C1','C2'];
  makeDropdown('level-dropdown', levels, S.level, val => {
    S.level = val; applyFilters(); buildPool(); renderCard();
  });
}

function buildCategoryChips() {
  S.categories = [...new Set(S.allRows.map(r=>r.category))].filter(Boolean).sort();
  const bar = $('cat-chips');
  bar.innerHTML = `<button class="chip active" data-cat="All">All</button>`;
  S.categories.forEach(cat => {
    const b = document.createElement('button');
    b.className='chip'; b.dataset.cat=cat; b.textContent=cat;
    bar.appendChild(b);
  });
  bar.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    const cat = b.dataset.cat;
    if (cat==='All') { S.categories_sel=['All']; }
    else {
      S.categories_sel = S.categories_sel.filter(c=>c!=='All');
      if (S.categories_sel.includes(cat))
        S.categories_sel = S.categories_sel.filter(c=>c!==cat);
      else S.categories_sel.push(cat);
      if (!S.categories_sel.length) S.categories_sel=['All'];
    }
    syncChips(); applyFilters(); buildPool(); renderCard();
  }));
}

function syncChips() {
  $$('#cat-chips .chip').forEach(b =>
    b.classList.toggle('active',
      S.categories_sel.includes('All') ? b.dataset.cat==='All' : S.categories_sel.includes(b.dataset.cat))
  );
}

function applyFilters() {
  let r = S.allRows;
  if (S.lang !=='All') r=r.filter(x=>x.language===S.lang);
  if (S.level!=='All') r=r.filter(x=>x.level===S.level);
  if (!S.categories_sel.includes('All'))
    r=r.filter(x=>S.categories_sel.includes(x.category));
  S.filtered = r;
  $('stats-text').innerHTML = S.filtered.length
    ? `<span>${S.filtered.length}</span> sentences &nbsp;·&nbsp; <span>${new Set(S.filtered.map(r=>r.category)).size}</span> categories`
    : '';
}

/* ── Pool ────────────────────────────────────────────────── */
function shuffle(a) {
  const b=[...a];
  for (let i=b.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; }
  return b;
}
function buildPool() {
  S.pool = S.randomize ? shuffle(S.filtered) : [...S.filtered];
  S.poolIndex = 0;
}
function currentRow() { return S.pool[S.poolIndex]||null; }

/* ── Card ────────────────────────────────────────────────── */
function renderCard() {
  const row=currentRow(), grid=$('cards-grid');
  S.revealed = false;
  if (!row) { grid.innerHTML=''; $('empty-state').classList.add('active'); return; }
  $('empty-state').classList.remove('active');
  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;
  grid.innerHTML = `
    <div class="card" id="main-card">
      <div class="card-meta">
        <span class="card-level">${row.level}</span>
        <span>${row.category}</span>
        <span>${row.language}</span>
      </div>
      <div class="card-primary" id="card-primary" style="font-size:${S.fontSize}px">${esc(primary)}</div>
      <div class="card-secondary hidden" id="card-secondary" style="font-size:${S.fontSize}px">&nbsp;</div>
      <div class="card-hint" id="card-hint">Click to reveal</div>
      <button class="card-tts" id="card-tts-btn" title="Speak">
        <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      </button>
    </div>`;
  $('main-card').addEventListener('click', e => { if (!e.target.closest('#card-tts-btn')) revealCard(); });
  $('card-tts-btn').addEventListener('click', e => { e.stopPropagation(); speakCurrent(); });
  if (S.presMode) renderPresCard();
}

function revealCard() {
  if (S.revealed) return;
  S.revealed = true;
  const row = currentRow(); if (!row) return;
  const secondary = S.creatorFlip ? row.english : row.translation;
  const sec=$('card-secondary');
  sec.classList.remove('hidden');
  scramble(sec, secondary, 360, () => { if (S.autoPlay) speak(secondary, row.language); });
  $('main-card').classList.add('revealed');
  $('card-hint').textContent = '';
}

function goNext() {
  if (!S.pool.length) return;
  S.poolIndex = (S.poolIndex+1) % S.pool.length;
  renderCard();
}
function goPrev() {
  if (!S.pool.length) return;
  S.poolIndex = (S.poolIndex-1+S.pool.length) % S.pool.length;
  renderCard();
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── TTS ─────────────────────────────────────────────────── */
const LANG_MAP = {German:'de',French:'fr',Polish:'pl',Spanish:'es',Italian:'it',Japanese:'ja'};
let allVoices = [];

function loadVoices() {
  allVoices = speechSynthesis.getVoices();
  populateVoiceSelect();
}
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

function populateVoiceSelect() {
  const sel = $('tts-voice-select'); if (!sel) return;
  const row = currentRow();
  const langCode = row ? (LANG_MAP[row.language]||'') : '';
  const relevant = allVoices.filter(v => !langCode || v.lang.toLowerCase().startsWith(langCode));
  const pool = relevant.length ? relevant : allVoices;
  sel.innerHTML = '<option value="">Default</option>';
  pool.forEach((v,i) => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.name === S.ttsVoice) opt.selected = true;
    sel.appendChild(opt);
  });
}

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (S.ttsVoice) {
    const v = allVoices.find(v => v.name === S.ttsVoice);
    if (v) u.voice = v;
  }
  const code = LANG_MAP[lang]||'de';
  u.lang = allVoices.find(v=>v.name===S.ttsVoice)?.lang || code+'-'+code.toUpperCase();
  speechSynthesis.speak(u);
}
function speakCurrent() {
  const row=currentRow(); if (!row) return;
  speak(S.creatorFlip ? row.english : row.translation, row.language);
}

/* ── Present mode ────────────────────────────────────────── */
function enterPres() {
  S.presMode=true; S.presRevealed=false;
  $('presentation-mode').classList.add('active');
  $('streamer-btn').classList.add('active');
  renderPresCard();
}
function exitPres() {
  S.presMode=false;
  $('presentation-mode').classList.remove('active');
  $('streamer-btn').classList.remove('active');
}
function renderPresCard() {
  const row=currentRow(); if (!row) return;
  const primary   = S.creatorFlip ? row.translation : row.english;
  const secondary = S.creatorFlip ? row.english      : row.translation;
  const pPrim=$('pres-primary'), pSec=$('pres-secondary');
  $('pres-meta').innerHTML=`<span class="pres-level">${row.level}</span><span>${row.category}</span><span>${row.language}</span>`;
  scramble(pPrim, primary, 400);
  pSec.classList.add('hidden');
  pSec.textContent = secondary;
  S.presRevealed = false;
  pPrim.style.fontSize = S.fontSize+'px';
  pSec.style.fontSize  = S.fontSize+'px';
  $('pres-progress-bar').style.width = ((S.poolIndex+1)/S.pool.length*100)+'%';
}
function presReveal() {
  if (S.presRevealed) return;
  S.presRevealed = true;
  const row=currentRow(); if (!row) return;
  const secondary = S.creatorFlip ? row.english : row.translation;
  const pSec=$('pres-secondary');
  pSec.classList.remove('hidden');
  scramble(pSec, secondary, 360, () => { if (S.autoPlay) speak(secondary, row.language); });
}
function presNext() { goNext(); S.presRevealed=false; renderPresCard(); }
function presPrev() { goPrev(); S.presRevealed=false; renderPresCard(); }

/* ── Mute toggle ─────────────────────────────────────────── */
const ICON_ON  = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
const ICON_OFF = `<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
function syncMuteBtn() {
  $('mute-icon').innerHTML = S.autoPlay ? ICON_ON : ICON_OFF;
  $('mute-btn').classList.toggle('active', !S.autoPlay);
  $('mute-btn').title = S.autoPlay ? 'Auto-play ON' : 'Auto-play OFF';
}

/* ── Theme ───────────────────────────────────────────────── */
function applyTheme(name) {
  S.theme = name;
  const root = document.documentElement;
  if (name==='terminal') delete root.dataset.theme;
  else root.dataset.theme = name;
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme===name));
  syncColorPickers();
  saveSettings();
}

/* ── Font size ───────────────────────────────────────────── */
function applyFontSize(px) {
  S.fontSize = Math.max(8, Math.min(72, parseInt(px)||22));
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs)===S.fontSize));
  const known=[14,18,22,26,30];
  const ci=$('fs-custom-input');
  if (known.includes(S.fontSize)) ci.value='';
  else ci.value=S.fontSize;
  renderCard();
  saveSettings();
}

/* ── Color pickers ───────────────────────────────────────── */
function buildColorPickers() {
  const grid=$('color-grid'); if (!grid) return;
  grid.innerHTML='';
  COLOR_VARS.forEach(({key,label}) => {
    const row=document.createElement('div');
    row.className='color-row';
    const swatchId='sw'+key.replace(/--/g,'').replace(/-/g,'_');
    row.innerHTML=`
      <span class="color-label">${label}</span>
      <div class="color-swatch" id="${swatchId}">
        <input type="color" data-var="${key}"/>
      </div>
      <input type="text" class="color-hex" data-var="${key}" maxlength="7" placeholder="#000000"/>`;
    grid.appendChild(row);
    const picker=row.querySelector('input[type=color]');
    const hexEl =row.querySelector('.color-hex');
    const swatch=row.querySelector('.color-swatch');
    picker.addEventListener('input', () => {
      hexEl.value=picker.value.toUpperCase();
      swatch.style.background=picker.value;
      setCustomVar(key, picker.value);
    });
    hexEl.addEventListener('change', () => {
      const v=normalizeHex(hexEl.value); if (!v) return;
      hexEl.value=v.toUpperCase(); picker.value=v;
      swatch.style.background=v; setCustomVar(key,v);
    });
  });
}

function syncColorPickers() {
  const computed=getComputedStyle(document.documentElement);
  COLOR_VARS.forEach(({key}) => {
    const raw=computed.getPropertyValue(key).trim();
    const hex=cssToHex(raw)||'#000000';
    const swatchId='sw'+key.replace(/--/g,'').replace(/-/g,'_');
    const sw=$(swatchId); if (!sw) return;
    sw.style.background=S.customVars[key]||hex;
    const picker=sw.querySelector('input[type=color]');
    const hexEl =sw.parentElement.querySelector('.color-hex');
    const finalHex=S.customVars[key]||hex;
    if (picker) picker.value=finalHex;
    if (hexEl)  hexEl.value =finalHex.toUpperCase();
  });
}

function setCustomVar(key, value, save=true) {
  document.documentElement.style.setProperty(key, value);
  S.customVars[key]=value;
  if (save) saveSettings();
}
function resetCustomVars() {
  COLOR_VARS.forEach(({key}) => document.documentElement.style.removeProperty(key));
  S.customVars={};
  syncColorPickers();
  saveSettings();
}
function normalizeHex(val) {
  val=val.trim().replace(/^#/,'');
  if (val.length===3) val=val.split('').map(c=>c+c).join('');
  if (val.length!==6||!/^[0-9a-fA-F]{6}$/.test(val)) return null;
  return '#'+val;
}
function cssToHex(color) {
  if (!color) return null;
  color=color.trim();
  if (color.startsWith('#')) return normalizeHex(color);
  const m=color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return '#'+[m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return null;
}

/* ── Settings persist ────────────────────────────────────── */
function loadSettings() {
  try {
    const s=JSON.parse(localStorage.getItem('ll_v3')||'{}');
    if (s.theme)      applyTheme(s.theme);     else applyTheme('latte');
    if (s.fontSize)   S.fontSize=s.fontSize;
    if (s.keyReveal!==undefined) S.keyReveal=s.keyReveal;
    if (s.keyNext!==undefined)   S.keyNext=s.keyNext;
    if (s.keyPrev!==undefined)   S.keyPrev=s.keyPrev;
    if (s.keyTTS!==undefined)    S.keyTTS=s.keyTTS;
    if (s.randomize!==undefined) S.randomize=s.randomize;
    if (s.autoPlay!==undefined)  S.autoPlay=s.autoPlay;
    if (s.ttsVoice!==undefined)  S.ttsVoice=s.ttsVoice;
    if (s.customVars) {
      S.customVars=s.customVars;
      Object.entries(S.customVars).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
    }
  } catch(e) { applyTheme('latte'); }
}
function saveSettings() {
  localStorage.setItem('ll_v3', JSON.stringify({
    theme:S.theme, fontSize:S.fontSize,
    keyReveal:S.keyReveal, keyNext:S.keyNext, keyPrev:S.keyPrev, keyTTS:S.keyTTS,
    randomize:S.randomize, autoPlay:S.autoPlay, ttsVoice:S.ttsVoice, customVars:S.customVars,
  }));
}

function syncSettingsUI() {
  $$('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme===S.theme));
  $$('.fs-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fs)===S.fontSize));
  const known=[14,18,22,26,30];
  if (!known.includes(S.fontSize)) $('fs-custom-input').value=S.fontSize;
  syncToggle('toggle-random', S.randomize);
  syncMuteBtn();
  const km={'key-reveal-input':S.keyReveal,'key-next-input':S.keyNext,'key-prev-input':S.keyPrev,'key-tts-input':S.keyTTS};
  Object.entries(km).forEach(([id,val])=>{ const el=$(id); if(el) el.value=keyLabel(val); });
  updateKeyHints();
}
function syncToggle(id,val){ const el=$(id); if(el) el.classList.toggle('on',val); }

/* ── Key helpers ─────────────────────────────────────────── */
function keyLabel(k) {
  if (!k||k===' ') return 'Space';
  if (k==='ArrowRight') return '→';
  if (k==='ArrowLeft')  return '←';
  if (k==='ArrowUp')    return '↑';
  if (k==='ArrowDown')  return '↓';
  return k.length===1 ? k.toUpperCase() : k;
}
function matchKey(e,k) { return e.key===k||(k.length===1&&e.key.toLowerCase()===k.toLowerCase()); }
function updateKeyHints() {
  const m={'hint-reveal-key':S.keyReveal,'hint-next-key':S.keyNext,'hint-prev-key':S.keyPrev,'hint-tts-key':S.keyTTS};
  Object.entries(m).forEach(([id,val])=>{ const el=$(id); if(el) el.textContent=keyLabel(val); });
}

/* ── Keyboard ────────────────────────────────────────────── */
function handleKey(e) {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (S.presMode) {
    if (e.key==='Escape')          { exitPres(); return; }
    if (matchKey(e,S.keyReveal))   { e.preventDefault(); presReveal();    return; }
    if (matchKey(e,S.keyNext))     { e.preventDefault(); presNext();      return; }
    if (matchKey(e,S.keyPrev))     { e.preventDefault(); presPrev();      return; }
    if (matchKey(e,S.keyTTS))      { e.preventDefault(); speakCurrent();  return; }
    return;
  }
  if (e.key==='Escape') {
    $('settings-overlay').classList.remove('active');
    $('upload-overlay').classList.remove('active');
    return;
  }
  if (matchKey(e,S.keyReveal)) { e.preventDefault(); revealCard();   return; }
  if (matchKey(e,S.keyNext))   { e.preventDefault(); goNext();       return; }
  if (matchKey(e,S.keyPrev))   { e.preventDefault(); goPrev();       return; }
  if (matchKey(e,S.keyTTS))    { e.preventDefault(); speakCurrent(); return; }
}

/* ── Upload ──────────────────────────────────────────────── */
function handleUpload(file) {
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const rows=parseCSV(e.target.result);
      if (!rows.length) throw new Error('No valid rows found. Check column headers.');
      S.allRows=rows;
      buildLangDropdown(); buildLevelDropdown();
      buildCategoryChips(); applyFilters(); buildPool(); renderCard();
      $('upload-status').className='upload-status ok';
      $('upload-status').textContent=`✓ Loaded ${rows.length} sentences from ${file.name}`;
      setTimeout(()=>$('upload-overlay').classList.remove('active'),1600);
    } catch(err) {
      $('upload-status').className='upload-status err';
      $('upload-status').textContent='✗ '+err.message;
    }
  };
  reader.readAsText(file);
}

/* ── Attach events ───────────────────────────────────────── */
function attachEvents() {
  $('mute-btn').addEventListener('click', ()=>{ S.autoPlay=!S.autoPlay; syncMuteBtn(); saveSettings(); });
  $('streamer-btn').addEventListener('click', ()=> S.presMode ? exitPres() : enterPres());

  $('settings-btn').addEventListener('click', ()=>{
    $('settings-overlay').classList.add('active');
    populateVoiceSelect();
    syncColorPickers();
  });
  $('settings-close').addEventListener('click', ()=>$('settings-overlay').classList.remove('active'));
  $('settings-overlay').addEventListener('click', e=>{ if(e.target===$('settings-overlay')) $('settings-overlay').classList.remove('active'); });

  $('upload-btn').addEventListener('click',  ()=>$('upload-overlay').classList.add('active'));
  $('upload-close').addEventListener('click',()=>$('upload-overlay').classList.remove('active'));
  $('upload-overlay').addEventListener('click',e=>{ if(e.target===$('upload-overlay')) $('upload-overlay').classList.remove('active'); });
  $('upload-file-input').addEventListener('change',e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); });
  const drop=$('upload-drop');
  drop.addEventListener('click',   ()=>$('upload-file-input').click());
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
  drop.addEventListener('drop',    e=>{ e.preventDefault(); drop.classList.remove('dragover'); if(e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); });

  $$('.theme-dot').forEach(d=>d.addEventListener('click',()=>applyTheme(d.dataset.theme)));

  $$('.fs-btn').forEach(b=>b.addEventListener('click',()=>applyFontSize(b.dataset.fs)));
  $('fs-custom-input').addEventListener('keydown', e=>{
    if (e.key==='Enter') {
      const v=parseInt(e.target.value);
      if (v>=8&&v<=72) { $$('.fs-btn').forEach(b=>b.classList.remove('active')); applyFontSize(v); }
    }
  });
  $('fs-custom-input').addEventListener('blur', e=>{
    const v=parseInt(e.target.value);
    if (v>=8&&v<=72) { $$('.fs-btn').forEach(b=>b.classList.remove('active')); applyFontSize(v); }
  });

  $('tts-voice-select').addEventListener('change', e=>{ S.ttsVoice=e.target.value; saveSettings(); });

  $('toggle-random').addEventListener('click',()=>{
    S.randomize=!S.randomize; syncToggle('toggle-random',S.randomize);
    buildPool(); renderCard(); saveSettings();
  });

  $('custom-reset').addEventListener('click', resetCustomVars);

  function remapKey(inputId, stateKey) {
    $(inputId).addEventListener('keydown', e=>{
      e.preventDefault();
      S[stateKey]=e.key;
      e.target.value=keyLabel(e.key);
      updateKeyHints(); saveSettings();
    });
  }
  remapKey('key-reveal-input','keyReveal');
  remapKey('key-next-input',  'keyNext');
  remapKey('key-prev-input',  'keyPrev');
  remapKey('key-tts-input',   'keyTTS');

  $('prev-btn').addEventListener('click',   goPrev);
  $('next-btn').addEventListener('click',   goNext);
  $('reveal-btn').addEventListener('click', revealCard);
  $('flip-btn').addEventListener('click',()=>{
    S.creatorFlip=!S.creatorFlip;
    $('flip-label').textContent=S.creatorFlip ? 'Target → EN' : 'EN → Target';
    renderCard();
  });

  $('pres-reveal-btn').addEventListener('click', presReveal);
  $('pres-next-btn').addEventListener('click',   presNext);
  $('pres-prev-btn').addEventListener('click',   presPrev);
  $('pres-tts-btn').addEventListener('click',    speakCurrent);
  $('pres-exit-btn').addEventListener('click',   exitPres);

  document.addEventListener('keydown', handleKey);

  buildColorPickers();
  syncSettingsUI();
  $('controls-row').style.display='flex';
}

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', ()=>{
  loadSettings();
  initCursor();
  initSettingsScroll();
  attachEvents();
  loadDefaultCSV();
});
