'use strict';

const HOST = 'https://shikimori.one';
const CLIENT_ID = 'd1Xgj-FYGKjj6EnnbCe4y9kTvL64jY_9Pwct5PaWymM';
const CLIENT_SECRET = 'xBHDmmAJUjfpG7hFmtKF4X4PaGwsZwSxEmwsdJPlfMk';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const UA = 'shikimorist';

// ── Storage helpers ──────────────────────────────────────────────────────────

function store_get(keys) {
  return new Promise(res => chrome.storage.local.get(keys, res));
}
function store_set(data) {
  return new Promise(res => chrome.storage.local.set(data, res));
}
function store_remove(keys) {
  return new Promise(res => chrome.storage.local.remove(keys, res));
}
function sync_get(keys) {
  return new Promise(res => chrome.storage.sync.get(keys, res));
}
function sync_set(data) {
  return new Promise(res => chrome.storage.sync.set(data, res));
}
function sync_remove(keys) {
  return new Promise(res => chrome.storage.sync.remove(keys, res));
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function auth_get() {
  const r = await store_get('auth');
  return r.auth || null;
}
async function auth_set(data) { await store_set({ auth: data }); }

let authTabId = null;
let authResolve = null;
let authReject  = null;

function auth_build_url() {
  return `${HOST}/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=`;
}

async function auth_exchange(code) {
  const resp = await fetch(`${HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      code, redirect_uri: REDIRECT_URI
    })
  });
  if (!resp.ok) throw new Error('exchange failed ' + resp.status);
  return resp.json();
}

async function auth_refresh() {
  const auth = await auth_get();
  if (!auth) throw new Error('no auth');
  const resp = await fetch(`${HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: auth.refresh_token,
      redirect_uri: REDIRECT_URI
    })
  });
  if (!resp.ok) throw new Error('refresh failed ' + resp.status);
  const data = await resp.json();
  await auth_set(data);
  return data;
}

function auth_expired(auth) {
  return (auth.created_at * 1000) + (auth.expires_in * 1000) < Date.now() - 60000;
}

function tab_on_update(tabId, info) {
  if (tabId !== authTabId || !info.url) return;
  const m = info.url.match(/\/oauth\/authorize\/([^\/]+?)\/?$/);
  if (!m) return;

  const code = m[1];
  const tid = authTabId;
  authTabId = null;
  chrome.tabs.onUpdated.removeListener(tab_on_update);
  chrome.tabs.onRemoved.removeListener(tab_on_remove);
  chrome.tabs.remove(tid, () => {});

  auth_exchange(code).then(async data => {
    await auth_set(data);
    const r = authResolve;
    authResolve = authReject = null;
    if (r) r({ ok: true });
    broadcast({ event: 'auth_changed', authorized: true });
  }).catch(err => {
    const r = authReject;
    authResolve = authReject = null;
    if (r) r(err);
  });
}

function tab_on_remove(tabId) {
  if (tabId !== authTabId) return;
  authTabId = null;
  chrome.tabs.onUpdated.removeListener(tab_on_update);
  chrome.tabs.onRemoved.removeListener(tab_on_remove);
  const r = authReject;
  authResolve = authReject = null;
  if (r) r(new Error('tab closed'));
}

function sign_in() {
  return new Promise((resolve, reject) => {
    authResolve = resolve;
    authReject  = reject;
    chrome.tabs.create({ active: true, url: auth_build_url() }, tab => {
      authTabId = tab.id;
      chrome.tabs.onUpdated.addListener(tab_on_update);
      chrome.tabs.onRemoved.addListener(tab_on_remove);
    });
  });
}

async function sign_out() {
  await auth_set(null);
  broadcast({ event: 'auth_changed', authorized: false });
}

// ── API ───────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  let auth = await auth_get();
  if (auth && auth_expired(auth)) {
    auth = await auth_refresh();
  }

  const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = 'Bearer ' + auth.access_token;

  const resp = await fetch(HOST + path, { ...opts, headers });

  if (resp.status === 401) {
    await auth_set(null);
    broadcast({ event: 'auth_changed', authorized: false });
    throw new Error('Unauthorized');
  }
  if (!resp.ok) throw new Error(`API ${resp.status} ${path}`);
  if (resp.status === 204) return null;
  return resp.json();
}

// ── URL→anime cache ───────────────────────────────────────────────────────────

async function cache_get(url) {
  try { const r = await sync_get(url); if (r[url]) return r[url]; } catch(_) {}
  try { const r = await store_get(url); if (r[url]) return r[url]; } catch(_) {}
  return null;
}

async function cache_set(url, anime) {
  if (!anime) {
    await Promise.allSettled([sync_remove(url), store_remove(url)]);
    return;
  }
  try { await sync_set({ [url]: anime }); }
  catch(_) { await store_set({ [url]: anime }); }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── User-Agent spoofing ───────────────────────────────────────────────────────

chrome.webRequest.onBeforeSendHeaders.addListener(
  details => {
    const headers = details.requestHeaders || [];
    const i = headers.findIndex(h => h.name.toLowerCase() === 'user-agent');
    if (i >= 0) headers[i].value = UA; else headers.push({ name: 'User-Agent', value: UA });
    return { requestHeaders: headers };
  },
  { urls: ['*://shikimori.one/*'] },
  ['blocking', 'requestHeaders']
);

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  (async () => {
    switch (msg.type) {

      case 'auth_check': {
        const auth = await auth_get();
        return { authorized: !!auth };
      }

      case 'sign_in': {
        return sign_in();
      }

      case 'sign_out': {
        await sign_out();
        return { ok: true };
      }

      case 'api': {
        const data = await api(msg.path, msg.opts || {});
        return { data };
      }

      case 'cache_get': {
        const anime = await cache_get(msg.url);
        return { anime };
      }

      case 'cache_set': {
        await cache_set(msg.url, msg.anime);
        return { ok: true };
      }

      default: return null;
    }
  })().then(respond).catch(err => respond({ error: err.message }));

  return true;
});
