(function () {
  'use strict';

  var PANEL_ID = 'bili-subtitle-panel';

  function isVideoPage() {
    return location.pathname.startsWith('/video') || location.pathname.startsWith('/list');
  }

  function getBvid() {
    var params = new URLSearchParams(location.search);
    var fromParams = params.get('bvid');
    if (fromParams) return fromParams;
    var path = location.pathname;
    if (path.endsWith('/')) path = path.slice(0, -1);
    var parts = path.split('/');
    return parts[parts.length - 1] || null;
  }

  function fmt(sec) {
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  async function fetchJSON(url, credentials) {
    var res = await fetch(url, credentials ? { credentials: 'include' } : undefined);
    var json = await res.json();
    if (json.code !== 0) throw new Error('Bilibili API error: ' + json.message);
    return json.data;
  }

  function fetchVideoInfo(bvid) {
    return fetchJSON('https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid), true);
  }

  function fetchSubtitleTracks(aid, cid) {
    return fetchJSON('https://api.bilibili.com/x/player/wbi/v2?aid=' + aid + '&cid=' + cid, true)
      .then(function (data) {
        return (data.subtitle.subtitles || []).filter(function (s) { return s.subtitle_url; });
      });
  }

  async function fetchSubtitleContent(subtitleUrl) {
    var url = subtitleUrl;
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('http://')) url = url.replace('http://', 'https://');
    var res = await fetch(url);
    var json = await res.json();
    return (json.body || []).map(function (item, idx) {
      return { from: item.from, to: item.to, content: item.content, idx: idx };
    });
  }

  function getCid(pages) {
    if (!pages || pages.length === 0) return null;
    var params = new URLSearchParams(location.search);
    var p = parseInt(params.get('p')) || 1;
    var page = pages.find(function (pg) { return pg.page === p; });
    return (page || pages[0]).cid;
  }

  function isDarkMode() {
    return document.documentElement.classList.contains('dark')
      || window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      showCopied(btn);
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopied(btn);
    });
  }

  function showCopied(btn) {
    var orig = btn.textContent;
    btn.textContent = '已复制';
    btn.classList.add('bili-subtitle-copied');
    setTimeout(function () {
      btn.textContent = orig;
      btn.classList.remove('bili-subtitle-copied');
    }, 1200);
  }

  // ─── SVG icon helpers (static strings from Bilibili UI, safe) ──
  var svgParser = new DOMParser();
  function svgNode(svgString) {
    return svgParser.parseFromString(svgString.trim(), 'image/svg+xml').documentElement;
  }

  var DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 14" width="4" height="14"><path fill="currentColor" fill-rule="evenodd" d="M.5 2C.5 1.15 1.15.5 2 .5s1.5.65 1.5 1.5S2.85 3.5 2 3.5.5 2.85.5 2Zm0 5c0-.85.65-1.5 1.5-1.5s1.5.65 1.5 1.5S2.85 8.5 2 8.5.5 7.85.5 7Zm0 5c0-.85.65-1.5 1.5-1.5s1.5.65 1.5 1.5-.65 1.5-1.5 1.5S.5 12.85.5 12Z"></path></svg>';

  var ARROW_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="m9.188 7.999-3.359 3.359a.75.75 0 1 0 1.061 1.061l3.889-3.889a.75.75 0 0 0 0-1.061L6.89 3.58a.75.75 0 1 0-1.061 1.061l3.359 3.358z"></path></svg>';

  var ARROW_LEFT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="m6.812 8.001 3.359-3.359a.75.75 0 1 0-1.061-1.061L5.22 7.41a.75.75 0 0 0 0 1.061l3.889 3.889a.75.75 0 1 0 1.061-1.061z"></path></svg>';

  function setSVG(el, svgString) {
    el.replaceChildren(svgNode(svgString));
  }

  // Create a simple status/empty message element (textContent, safe)
  function messageEl(className, text) {
    return Object.assign(document.createElement('div'), {
      className: className,
      textContent: text
    });
  }

  // ─── Create Panel ──────────────────────────────────────────────
  function createPanel() {
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;

    // --- Header ---
    var header = document.createElement('div');
    header.className = 'bili-subtitle-header';

    var title = document.createElement('span');
    title.className = 'bili-subtitle-title';
    title.textContent = '字幕列表';

    var right = document.createElement('div');
    right.className = 'bili-subtitle-header-right';

    // Track selector
    var trackSelect = document.createElement('select');
    trackSelect.className = 'bili-subtitle-track-select';
    trackSelect.id = 'bili-subtitle-tracks';
    trackSelect.style.display = 'none';
    trackSelect.addEventListener('click', function (e) { e.stopPropagation(); });

    // Three dots wrap
    var moreWrap = document.createElement('div');
    moreWrap.className = 'bili-subtitle-more-wrap';

    var moreBtn = document.createElement('button');
    moreBtn.className = 'bili-subtitle-more';
    moreBtn.appendChild(svgNode(DOT_SVG));

    // Menu
    var menu = document.createElement('div');
    menu.className = 'bili-subtitle-menu';
    menu.id = 'bili-subtitle-menu';

    // -- with time checkbox --
    var withTimeLabel = document.createElement('label');
    withTimeLabel.className = 'bili-subtitle-menu-item';
    var withTimeCb = document.createElement('input');
    withTimeCb.type = 'checkbox';
    withTimeCb.id = 'bili-subtitle-with-time';
    if (localStorage.getItem('bili-subtitle-with-time') === 'true') withTimeCb.checked = true;
    withTimeCb.addEventListener('change', function (e) {
      e.stopPropagation();
      localStorage.setItem('bili-subtitle-with-time', e.target.checked);
      if (window.__biliSubtitle) window.__biliSubtitle.withTime = e.target.checked;
    });
    if (window.__biliSubtitle) window.__biliSubtitle.withTime = withTimeCb.checked;
    withTimeLabel.appendChild(withTimeCb);
    withTimeLabel.appendChild(document.createTextNode(' 带时间复制'));

    // -- default expand checkbox --
    var expandLabel = document.createElement('label');
    expandLabel.className = 'bili-subtitle-menu-item';
    var expandCb = document.createElement('input');
    expandCb.type = 'checkbox';
    expandCb.id = 'bili-subtitle-default-expand';
    if (localStorage.getItem('bili-subtitle-default-expand') === 'true') expandCb.checked = true;
    expandCb.addEventListener('change', function (e) {
      e.stopPropagation();
      localStorage.setItem('bili-subtitle-default-expand', e.target.checked);
    });
    expandLabel.appendChild(expandCb);
    expandLabel.appendChild(document.createTextNode(' 默认展开'));

    // -- divider --
    var divider = document.createElement('div');
    divider.className = 'bili-subtitle-menu-divider';

    // -- copy all button --
    var copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'bili-subtitle-menu-item';
    copyAllBtn.id = 'bili-subtitle-copy-all';
    copyAllBtn.textContent = '复制全部';
    copyAllBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var body = window.__biliSubtitle && window.__biliSubtitle.body;
      if (!body || body.length === 0) return;
      var withTime = window.__biliSubtitle.withTime;
      var text = withTime
        ? body.map(function (item) { return fmt(item.from) + ' - ' + item.content; }).join('\n')
        : body.map(function (item) { return item.content; }).join('\n');
      copyToClipboard(text, e.target);
      menu.classList.remove('bili-subtitle-menu-open');
    });

    menu.appendChild(withTimeLabel);
    menu.appendChild(expandLabel);
    menu.appendChild(divider);
    menu.appendChild(copyAllBtn);
    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(menu);

    // Arrow toggle
    var arrow = document.createElement('span');
    arrow.className = 'bili-subtitle-toggle';
    arrow.appendChild(svgNode(ARROW_DOWN));

    // Left group: title + three dots
    var titleWrap = document.createElement('div');
    titleWrap.className = 'bili-subtitle-title-wrap';
    titleWrap.appendChild(title);
    titleWrap.appendChild(moreWrap);

    // Right group: track selector + arrow
    right.appendChild(trackSelect);
    right.appendChild(arrow);
    header.appendChild(titleWrap);
    header.appendChild(right);

    // --- Body ---
    var body = document.createElement('div');
    body.id = 'bili-subtitle-body';
    body.appendChild(messageEl('bili-subtitle-loading', '加载中...'));

    panel.appendChild(header);
    panel.appendChild(body);

    // ─── Events ──────────────────────────────────────────────
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.contains('bili-subtitle-menu-open');
      if (isOpen) {
        menu.classList.remove('bili-subtitle-menu-open');
      } else {
        // position menu using fixed coords so it's not clipped by overflow:hidden
        var rect = moreBtn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.right = (window.innerWidth - rect.right - 40) + 'px';
        menu.classList.add('bili-subtitle-menu-open');
      }
    });

    document.addEventListener('click', function () {
      if (menu) menu.classList.remove('bili-subtitle-menu-open');
    });

    header.addEventListener('click', function () {
      body.classList.toggle('bili-subtitle-collapsed');
      if (body.classList.contains('bili-subtitle-collapsed')) {
        setSVG(arrow, ARROW_LEFT);
      } else {
        setSVG(arrow, ARROW_DOWN);
      }
    });

    trackSelect.addEventListener('change', function (e) {
      var idx = parseInt(e.target.value);
      if (!isNaN(idx) && window.__biliSubtitle && window.__biliSubtitle.tracks[idx]) {
        window.__biliSubtitle.selectTrack(idx);
      }
    });

    // Apply saved default expand state
    if (!expandCb.checked) {
      body.classList.add('bili-subtitle-collapsed');
      setSVG(arrow, ARROW_LEFT);
    }

    return panel;
  }

  // ─── Render subtitle items ─────────────────────────────────────
  function renderSubtitles(body, container) {
    container.replaceChildren();
    if (!body || body.length === 0) {
      container.appendChild(messageEl('bili-subtitle-empty', '无字幕数据'));
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < body.length; i++) {
      (function (item) {
        var row = document.createElement('div');
        row.className = 'bili-subtitle-item';
        row.dataset.idx = item.idx;

        var timeSpan = document.createElement('span');
        timeSpan.className = 'bili-subtitle-time';
        timeSpan.textContent = fmt(item.from);

        var textSpan = document.createElement('span');
        textSpan.className = 'bili-subtitle-text';
        textSpan.textContent = item.content;

        var copyBtn = document.createElement('button');
        copyBtn.className = 'bili-subtitle-copy-btn';
        copyBtn.textContent = '复制';
        copyBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var withTime = window.__biliSubtitle && window.__biliSubtitle.withTime;
          var text = withTime ? fmt(item.from) + ' - ' + item.content : item.content;
          copyToClipboard(text, e.target);
        });

        row.appendChild(timeSpan);
        row.appendChild(textSpan);
        row.appendChild(copyBtn);

        row.addEventListener('click', function () {
          var video = document.querySelector('video');
          if (video) {
            video.currentTime = item.from;
            if (video.paused) video.play();
          }
        });

        frag.appendChild(row);
      })(body[i]);
    }
    container.appendChild(frag);
  }

  // ─── Highlight current subtitle ────────────────────────────────
  var lastActiveIdx = -1;
  function highlightCurrent(currentTime) {
    if (!window.__biliSubtitle || !window.__biliSubtitle.body) return;
    var body = window.__biliSubtitle.body;
    var container = window.__biliSubtitle.bodyEl;
    if (!container) return;
    if (container.classList.contains('bili-subtitle-collapsed')) return;

    var activeIdx = -1;
    for (var i = 0; i < body.length; i++) {
      if (currentTime >= body[i].from && currentTime <= body[i].to) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx === lastActiveIdx) return;
    lastActiveIdx = activeIdx;

    var prev = container.querySelector('.bili-subtitle-active');
    if (prev) prev.classList.remove('bili-subtitle-active');

    if (activeIdx >= 0) {
      var el = container.querySelector('[data-idx="' + activeIdx + '"]');
      if (el) {
        el.classList.add('bili-subtitle-active');
        // 只滚动字幕列表容器内部，避免影响整个页面的滚动位置
        var elTop = el.offsetTop;
        var containerHeight = container.clientHeight;
        var targetScroll = elTop - containerHeight / 2 + el.offsetHeight / 2;
        if (targetScroll < 0) targetScroll = 0;
        container.scrollTop = targetScroll;
      }
    }
  }

  // ─── Load a track ──────────────────────────────────────────────
  async function loadTrack(idx) {
    var tracks = window.__biliSubtitle.tracks;
    if (!tracks[idx]) return;
    lastActiveIdx = -1;

    var body = window.__biliSubtitle.bodyEl;
    if (!body) return;
    body.replaceChildren(messageEl('bili-subtitle-loading', '加载字幕中...'));

    try {
      var data = await fetchSubtitleContent(tracks[idx].subtitle_url);
      window.__biliSubtitle.body = data;
      renderSubtitles(data, body);
    } catch (err) {
      console.error('[BiliSubtitle] loadTrack error:', err);
      body.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'bili-subtitle-empty',
        textContent: '字幕加载失败: ' + (err && err.message ? err.message : '未知错误')
      }));
    }
  }

  // ─── Wait for element ──────────────────────────────────────────
  function waitForElement(id, timeoutMs) {
    return new Promise(function (resolve) {
      var existing = document.getElementById(id);
      if (existing) return resolve(existing);
      var timer = setInterval(function () {
        var el = document.getElementById(id);
        if (el) { clearInterval(timer); resolve(el); }
      }, 1000);
      setTimeout(function () { clearInterval(timer); resolve(null); }, timeoutMs);
    });
  }

  // ─── Main ──────────────────────────────────────────────────────
  async function main() {
    if (!isVideoPage()) return;
    if (window.__biliSubtitle) return;
    window.__biliSubtitle = { tracks: [], body: [], selectTrack: null };

    var bvid = getBvid();
    if (!bvid) return;

    var danmukuBox = await waitForElement('danmukuBox', 15000);
    if (!danmukuBox) return;

    var panel = createPanel();
    danmukuBox.insertBefore(panel, danmukuBox.firstChild);
    window.__biliSubtitle.bodyEl = document.getElementById('bili-subtitle-body');

    if (isDarkMode()) panel.classList.add('bili-subtitle-dark');
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', function () {
      panel.classList.toggle('bili-subtitle-dark', mq.matches);
    });

    try {
      var videoInfo = await fetchVideoInfo(bvid);
      var aid = videoInfo.aid;
      var cid = getCid(videoInfo.pages || [videoInfo]);
      var tracks = await fetchSubtitleTracks(aid, cid);
      window.__biliSubtitle.tracks = tracks;

      if (tracks.length === 0) {
        window.__biliSubtitle.bodyEl.replaceChildren(
          messageEl('bili-subtitle-empty', '该视频无可用字幕'));
        return;
      }

      if (tracks.length > 1) {
        var select = document.getElementById('bili-subtitle-tracks');
        select.style.display = 'inline-block';
        tracks.forEach(function (t, i) {
          var opt = document.createElement('option');
          opt.value = i;
          opt.textContent = t.lan_doc || t.lan;
          select.appendChild(opt);
        });
      }

      await loadTrack(0);
      window.__biliSubtitle.selectTrack = loadTrack;
    } catch (err) {
      console.error('[BiliSubtitle]', err);
      window.__biliSubtitle.bodyEl.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'bili-subtitle-empty',
        textContent: '加载失败: ' + (err && err.message ? err.message : '未知错误')
      }));
    }

    window.__biliSubtitle.highlightTimer = setInterval(function () {
      var video = document.querySelector('video');
      if (video) highlightCurrent(video.currentTime);
    }, 300);
  }

  // ─── SPA navigation listener ───────────────────────────────────
  var lastPath = location.pathname;
  var observer = new MutationObserver(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      var old = document.getElementById(PANEL_ID);
      if (old) old.remove();
      if (window.__biliSubtitle && window.__biliSubtitle.highlightTimer) {
        clearInterval(window.__biliSubtitle.highlightTimer);
      }
      window.__biliSubtitle = null;
      lastActiveIdx = -1;
      setTimeout(main, 300);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(main, 3000);
})();
