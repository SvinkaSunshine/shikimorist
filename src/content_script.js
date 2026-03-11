'use strict';

// ── Parsers ───────────────────────────────────────────────────────────────────

const PARSERS = [
  {
    id: 'animego',
    test: (h) => /^animego\.(org|me)$/.test(h),
    path: /^\/anime\//,
    parse(doc) {
      const syns = doc.querySelectorAll('.entity__title-synonyms li');
      if (syns.length) return syns[0].textContent.trim();
      const h1 = doc.querySelector('.entity__title h1');
      return h1 ? h1.textContent.trim() : null;
    }
  },
  {
    id: 'yummyanime',
    test: (h) => /^yummyanime\.(tv|org)$/.test(h),
    path: /^\/\d+/,
    parse(doc) {
      if (doc.location.host.endsWith('.tv')) {
        const a = doc.querySelector('[itemprop="alternativeHeadline"]');
        if (a && a.textContent.trim()) return a.textContent.trim();
        const n = doc.querySelector('[itemprop="name"]');
        return n ? n.textContent.trim() : null;
      }
      const a = doc.querySelector('.pmovie__original-title');
      if (a && a.textContent.trim()) return a.textContent.trim();
      const n = doc.querySelector('.anime__title > h1');
      return n ? n.textContent.trim() : null;
    }
  },
  {
    id: 'animestars',
    test: (h) => h === 'animestars.org' || h === 'animesss.com',
    path: /^\/aniserials\/video\/.+\/.+/,
    parse(doc) {
      const alt = doc.querySelector('.pmovie__original-title');
      if (alt && alt.textContent.trim()) {
        const p = alt.textContent.split('/');
        const n = (p[0] || p[1] || '').trim();
        if (n) return n;
      }
      const n = doc.querySelector('[itemprop="name"]');
      return n ? n.textContent.replace(/ аниме$/i, '').replace(/ - .+$/, '').trim() : null;
    }
  },
  {
    id: 'animebest',
    test: (h) => /\.animebesst\.org$/.test(h),
    path: /^\/anime/,
    parse(doc) {
      const m = doc.querySelector('finfo-text1');
      if (!m) return null;
      const [ru, en] = (m.getAttribute('content') || '').split(' / ');
      return en ? en.trim() : ru ? ru.trim() : null;
    }
  },
  {
    id: 'animedia',
    test: (h) => h === 'online.animedia.tv',
    path: /^\/anime\//,
    parse(doc) {
      const el = doc.querySelector('.media__post__original-title');
      return el ? el.textContent.trim() : null;
    }
  },
  {
    id: 'animevost',
    test: (h) => h === 'animevost.org' || h === 'v2.vost.pw',
    path: /^\/tip\/tv\//,
    parse(doc) {
      const m = doc.querySelector('meta[property="og:title"]');
      if (!m) return null;
      const c = (m.getAttribute('content') || '').replace(/\[[^\]]+\]$/, '');
      const [ru, en] = c.split('/').map(s => s.trim());
      return en || ru || null;
    }
  },
  {
    id: 'anilibria_life',
    test: (h) => h === 'anilibria.life',
    path: /^\/online\//,
    parse(doc) {
      const li = doc.querySelector('#content ul.kino-lines li');
      if (li && li.childNodes[1] && li.childNodes[1].nodeType === Node.TEXT_NODE)
        return li.childNodes[1].textContent.trim();
      return null;
    }
  },
  {
    id: 'anilibria',
    test: (h) => h.endsWith('anilibria.tv'),
    path: /^\/release\//,
    parse(doc) {
      const m = doc.querySelector('meta[property="og:title"]');
      if (!m) return null;
      const p = (m.getAttribute('content') || '').split('/');
      return p[1] ? p[1].trim() : null;
    }
  },
  // {
  //   id: 'akari',
  //   test: (h) => h === 'akari-anime.com',
  //   path: /^\/movie\//,
  //   parse(doc) {
  //     const m = doc.querySelector('meta[property="og:title"]');
  //     if (!m) return null;
  //     const p = (m.getAttribute('content') || '').split('/');
  //     return p[1] ? p[1].trim() : null;
  //   }
  // },
  {
    id: 'anidub',
    test: (h) => h === 'anidub.life' || h === 'v4.anidub.shop',
    path: /^\/\d+-/,
    parse(doc) {
      const h3 = doc.querySelector('.fright h3');
      if (h3 && h3.textContent.trim()) return h3.textContent.trim();
      return null;
    }
  },
  // {
  //   id: 'wikianime',
  //   test: (h) => h.endsWith('wikianime.tv'),
  //   path: /^\/anime\//,
  //   parse(doc) {
  //     const clr = s => s.replace(/season|сезон/gi, '').trim();
  //     const d = doc.querySelector('meta[property="og:description"]');
  //     if (d) {
  //       const m = (d.getAttribute('content') || '').match(/\(([^,]+),([^)]+)\)/);
  //       if (m) {
  //         const lat = [m[1], m[2]].find(s => s && /[a-z]/i.test(s));
  //         return clr(lat || m[1] || m[2]);
  //       }
  //     }
  //     const t = doc.querySelector('meta[property="og:title"]');
  //     if (t) {
  //       const p = (t.getAttribute('content') || '').split('|');
  //       if (p[1]) return clr(p[1]);
  //     }
  //     return null;
  //   }
  // },
  {
    id: 'rezka',
    test: (h) => h === 'rezka.ag',
    path: /\/animation\//,
    parse(doc) {
      const el = doc.querySelector('.b-post__origtitle');
      if (el && el.textContent) return el.textContent.split(' / ')[0].trim();
      return null;
    }
  },
  {
    id: 'kinopoisk',
    test: (h) => /^(www|hd)\.kinopoisk\.ru$/.test(h),
    path: /^\/(film|series)\//,
    parse(doc) {
      if (doc.location.host.startsWith('www')) {
        const el = doc.querySelector('[class^=styles_originalTitle]');
        return el ? el.textContent.trim() : null;
      }
      const el = doc.querySelector('[class^=OverviewTitle_text]');
      return el ? el.textContent.trim() : null;
    }
  }
];

function detect(doc) {
  const host = doc.location.hostname;
  const path = doc.location.pathname;
  for (const p of PARSERS) {
    if (p.test(host) && p.path.test(path)) return p.parse(doc);
  }
  return null;
}

// ── Page key (strip protocol) ─────────────────────────────────────────────────

function pageKey() {
  return location.href.replace(/^https?:\/\//, '');
}

// ── Message listener ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {

  if (msg.type === 'page_data') {
    const key = pageKey();

    chrome.runtime.sendMessage({ type: 'cache_get', url: key }, cached => {
      if (chrome.runtime.lastError) { respond({ found: false }); return; }
      if (cached && cached.anime) { respond({ type: 'cached', anime: cached.anime }); return; }

      const tryParse = () => {
        const name = detect(document);
        if (name) respond({ type: 'name', name });
        else respond({ found: false });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryParse, { once: true });
      } else {
        tryParse();
      }
    });

    return true;
  }

  if (msg.type === 'cache_set') {
    const key = pageKey();
    chrome.runtime.sendMessage({ type: 'cache_set', url: key, anime: msg.anime }, () => respond({ ok: true }));
    return true;
  }
});
