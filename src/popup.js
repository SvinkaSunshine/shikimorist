'use strict';

const HOST = 'https://shikimori.io';

const SITES = [
  { name: 'AnimeGo',       url: 'https://animego.org' },
  { name: 'Yummyanime',    url: 'https://yummyanime.tv' },
  { name: 'Animestars',    url: 'https://animestars.org' },
  { name: 'AnimeBest',     url: 'https://anime1.animebesst.org' },
  { name: 'Animedia',      url: 'https://online.animedia.tv' },
  { name: 'Animevost',     url: 'https://animevost.org', vpn: true },
  { name: 'Vost.pw',       url: 'https://v2.vost.pw' },
  { name: 'AniLibria',     url: 'https://www.anilibria.tv', vpn: true },
  { name: 'Anidub',        url: 'https://anidub.life' },
  { name: 'Rezka.ag',      url: 'https://rezka.ag', vpn: true },
  { name: 'Kinopoisk',     url: 'https://www.kinopoisk.ru' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function bg(type, extra = {}) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage({ type, ...extra }, r => {
      if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
      if (r && r.error) return rej(new Error(r.error));
      res(r);
    });
  });
}

function api(path, opts) { return bg('api', { path, opts }).then(r => r.data); }

let toastTimer;
function toast(msg, cls = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (cls ? ' ' + cls : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const d = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
  return d[m][n];
}

function bestMatch(query, list) {
  if (list.length === 1) return list[0];
  const isRu = /[а-яё]/i.test(query);
  return list.reduce((best, a) => {
    const name = isRu ? (a.russian || a.name || '') : (a.name || '');
    return lev(query, name) < lev(query, isRu ? (best.russian || best.name || '') : (best.name || '')) ? a : best;
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let ST = {
  screen: 'load',
  prev: null,
  userId: null,
  anime: null,
  rate: null,
  attached: false,
};

function show(name) {
  ST.prev = ST.screen;
  ST.screen = name;
  document.querySelectorAll('.scr').forEach(el => el.classList.remove('show'));
  const el = document.getElementById('s-' + name);
  if (el) el.classList.add('show');
}

  // Custom select
  const STATUS_ICONS = {
    watching:   `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    planned:    `<svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    completed:  `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    on_hold:    `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    dropped:    `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
    rewatching: `<svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.1"/></svg>`,
  };

  function csSetValue(val, label) {
    $('cs-icon').innerHTML = STATUS_ICONS[val] || '';
    $('cs-label').textContent = label;
    document.querySelectorAll('.cs-opt').forEach(o =>
      o.classList.toggle('active', o.dataset.v === val)
    );
  }

// ── Render anime ──────────────────────────────────────────────────────────────

function renderAnime() {
  const { anime, rate, attached } = ST;
  if (!anime) return;

  $('a-poster').src = anime.image ? HOST + anime.image.preview : '';
  $('a-name').textContent = anime.name || '';
  $('a-ru').textContent = anime.russian || '';

  const chips = $('a-chips');
  chips.innerHTML = '';
  if (anime.score > 0) chips.innerHTML += `<span class="chip gold">★ ${parseFloat(anime.score).toFixed(1)}</span>`;
  const ep = anime.episodes || anime.episodes_aired;
  if (ep) chips.innerHTML += `<span class="chip">${ep} эп.</span>`;

  $('a-attach').className = 'tog' + (attached ? ' on' : '');

  if (rate) {
    $('in-list').style.display = '';
    $('no-list').style.display = 'none';

    const statusLabels = {
      watching: 'Смотрю', planned: 'Запланировано', completed: 'Просмотрено',
      on_hold: 'Отложено', dropped: 'Брошено', rewatching: 'Пересматриваю'
    };
    const st = rate.status || 'watching';
    csSetValue(st, statusLabels[st] || st);
    $('ep-v').textContent = rate.episodes || 0;
    $('ep-of').textContent = ep ? `/${ep}` : '/—';
    $('rw-v').textContent = rate.rewatches || 0;

    const stars = $('stars');
    stars.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const b = document.createElement('button');
      b.className = 'star' + (i <= (rate.score || 0) ? ' on' : '');
      b.textContent = '★';
      b.dataset.n = i;
      b.addEventListener('click', () => rateUpdate({ score: +b.dataset.n }));
      b.addEventListener('mouseenter', () => previewStars(i));
      stars.appendChild(b);
    }
    stars.addEventListener('mouseleave', () => previewStars(rate.score || 0));
  } else {
    $('in-list').style.display = 'none';
    $('no-list').style.display = '';
  }
}

function previewStars(n) {
  document.querySelectorAll('#stars .star').forEach(el => {
    el.classList.toggle('on', +el.dataset.n <= n);
  });
}

// ── Rate API ──────────────────────────────────────────────────────────────────

async function fetchRate() {
  if (!ST.userId || !ST.anime) return null;
  try {
    const r = await api(`/api/v2/user_rates?user_id=${ST.userId}&target_id=${ST.anime.id}&target_type=Anime`);
    return r[0] || null;
  } catch { return null; }
}

async function rateCreate(status) {
  try {
    ST.rate = await api('/api/v2/user_rates', {
      method: 'POST',
      body: JSON.stringify({ user_rate: {
        user_id: ST.userId, target_id: ST.anime.id,
        target_type: 'Anime', status, score: 0, episodes: 0, rewatches: 0
      }})
    });
    renderAnime();
    toast('Добавлено в список', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function rateUpdate(changes) {
  if (!ST.rate) return;
  try {
    ST.rate = await api(`/api/v2/user_rates/${ST.rate.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ user_rate: changes })
    });
    renderAnime();
  } catch (e) { toast(e.message, 'err'); }
}

async function rateDelete() {
  if (!ST.rate) return;
  try {
    await api(`/api/v2/user_rates/${ST.rate.id}`, { method: 'DELETE' });
    ST.rate = null;
    renderAnime();
    toast('Удалено из списка');
  } catch (e) { toast(e.message, 'err'); }
}

// ── Search ────────────────────────────────────────────────────────────────────

let qTimer;
async function doSearch(q) {
  if (!q.trim()) { $('q-list').innerHTML = '<div class="srch-msg">Начните вводить название</div>'; return; }
  $('q-list').innerHTML = '<div class="srch-msg">Поиск…</div>';
  try {
    const r = await api(`/api/animes?search=${encodeURIComponent(q)}&limit=10&page=1`);
    if (!r.length) { $('q-list').innerHTML = '<div class="srch-msg">Ничего не найдено</div>'; return; }
    $('q-list').innerHTML = '';
    r.forEach(a => {
      const el = document.createElement('div');
      el.className = 'srch-item';
      el.innerHTML = `<img class="srch-thumb" src="${a.image ? HOST + a.image.preview : ''}" alt=""/><div style="flex:1;min-width:0"><div class="srch-name">${a.name||''}</div><div class="srch-sub">${a.russian||''}</div></div>`;
      el.addEventListener('click', () => pickAnime(a));
      $('q-list').appendChild(el);
    });
  } catch { $('q-list').innerHTML = '<div class="srch-msg">Ошибка поиска</div>'; }
}

async function pickAnime(anime) {
  ST.anime = anime;
  ST.rate = await fetchRate();
  ST.attached = false;
  renderAnime();
  show('anime');
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  show('load');

  // Check auth
  let authOk;
  try { authOk = (await bg('auth_check')).authorized; } catch { authOk = false; }
  if (!authOk) { show('auth'); return; }

  // Whoami
  try {
    const me = await api('/api/users/whoami');
    ST.userId = me.id;
  } catch { show('auth'); return; }

  // Active tab
  const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  const tab = tabs[0];
  if (!tab) { show('empty'); return; }

  // Ask content script for page data
  let pd = null;
  try {
    pd = await new Promise((res) => {
      chrome.tabs.sendMessage(tab.id, { type: 'page_data' }, r => {
        if (chrome.runtime.lastError) res(null);
        else res(r);
      });
    });
  } catch { pd = null; }

  if (!pd) {
    $('empty-icon-svg').innerHTML = `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`;
    $('empty-ttl').textContent = 'Сайт не поддерживается';
    $('empty-sub').textContent = 'Откройте поддерживаемый сайт с аниме или найдите вручную.';
    show('empty');
    return;
  }
  if (pd.found === false) {
    $('empty-ttl').textContent = 'Аниме не обнаружено';
    $('empty-icon-svg').innerHTML = `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.4-4.4"/>`;
    $('empty-sub').textContent = 'Перейдите на страницу с аниме или найдите его вручную.';
    show('empty');
    return;
  }

  if (pd.type === 'cached') {
    try {
      ST.anime = await api('/api/animes/' + pd.anime.id);
      ST.attached = true;
      ST.rate = await fetchRate();
      renderAnime();
      show('anime');
    } catch { show('empty'); }
    return;
  }

  if (pd.type === 'name') {
    try {
      const r = await api(`/api/animes?search=${encodeURIComponent(pd.name)}&limit=10&page=1`);
      if (!r.length) { show('empty'); return; }
      ST.anime = bestMatch(pd.name, r);
      ST.attached = false;
      ST.rate = await fetchRate();
      renderAnime();
      show('anime');
    } catch { show('empty'); }
  }
}

// ── Attach ────────────────────────────────────────────────────────────────────

async function toggleAttach() {
  ST.attached = !ST.attached;
  $('a-attach').className = 'tog' + (ST.attached ? ' on' : '');

  const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  const tab = tabs[0];
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, {
    type: 'cache_set',
    anime: ST.attached ? { id: ST.anime.id } : null
  }, () => {});

  toast(ST.attached ? 'Страница привязана' : 'Привязка удалена');
}

// ── Events ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Auth
  $('btn-signin').addEventListener('click', async () => {
    $('btn-signin').disabled = true;
    $('btn-signin').textContent = 'Открываю окно…';
    try { await bg('sign_in'); await init(); }
    catch { $('btn-signin').disabled = false; $('btn-signin').textContent = 'Войти через Shikimori'; toast('Ошибка входа', 'err'); }
  });

  // Logout
  ['a-logout', 'e-logout'].forEach(id => {
    $(id).addEventListener('click', async () => { await bg('sign_out'); show('auth'); });
  });

  // Search open
  ['a-search', 'e-search', 'e-search2'].forEach(id => {
    $(id).addEventListener('click', () => { show('search'); $('q-input').focus(); });
  });

  // Search back
  $('q-back').addEventListener('click', () => {
    if (ST.anime) show('anime');
    else show('empty');
  });

  // Search input
  $('q-input').addEventListener('input', e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => doSearch(e.target.value), 380);
  });

  // Attach toggle
  $('a-attach').addEventListener('click', toggleAttach);
  
  // Episodes
  $('ep-dec').addEventListener('click', () => {
    const v = +$('ep-v').textContent;
    if (v > 0) rateUpdate({ episodes: v - 1 });
  });
  $('ep-inc').addEventListener('click', () => {
    const v = +$('ep-v').textContent;
    const max = ST.anime ? (ST.anime.episodes || 99999) : 99999;
    if (v < max) rateUpdate({ episodes: v + 1 });
  });

  // Rewatches
  $('rw-dec').addEventListener('click', () => { const v = +$('rw-v').textContent; if (v > 0) rateUpdate({ rewatches: v - 1 }); });
  $('rw-inc').addEventListener('click', () => rateUpdate({ rewatches: +$('rw-v').textContent + 1 }));

  // Add to list
  document.querySelectorAll('.add-btn').forEach(b => {
    b.addEventListener('click', () => rateCreate(b.dataset.s));
  });

  // Status select
  $('cs-trigger').addEventListener('click', () => {
    $('r-status').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!$('r-status').contains(e.target)) $('r-status').classList.remove('open');
  });
  document.querySelectorAll('.cs-opt').forEach(o => {
    o.addEventListener('click', () => {
      $('r-status').classList.remove('open');
      csSetValue(o.dataset.v, o.textContent.trim());
      rateUpdate({ status: o.dataset.v });
    });
  });

  // Delete rate
  $('r-del').addEventListener('click', rateDelete);

  // Supported sites
  $('e-sites').addEventListener('click', e => {
    e.preventDefault();
    const list = $('sites-list');
    list.innerHTML = SITES.map(s =>
      `<div class="site-item"><a class="site-a" href="${s.url}" target="_blank">${s.name}</a>${s.vpn ? '<span class="site-vpn">VPN</span>' : ''}</div>`
    ).join('');
    show('sites');
  });

  $('st-back').addEventListener('click', () => show(ST.prev || 'empty'));

  
  // Background auth updates
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.event === 'auth_changed') {
      if (msg.authorized) init();
      else show('auth');
    }
  });

  init();
});