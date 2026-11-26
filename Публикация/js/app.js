/* =========================================================================
   Дашеньке — с днём рождения
   app.js — рендер альбома и все интеракции
   ========================================================================= */
/* global ALBUM_DATA, Music */
(function () {
  'use strict';

  /* --------------------------------------------------------------------
     НАСТРОЙКИ — то, что чаще всего хочется поменять.
     Правьте только значения в кавычках/цифры, синтаксис не трогайте.
     -------------------------------------------------------------------- */
  var CONFIG = {
    /* подпись в письме: на экране будет «— твой Белоус» */
    sender: 'твой Белоус',

    /* ↓ блок «Цифры нашего альбома»: 4-я плитка и подписи дат под ним ↓
       albumDays — сколько дней показывать (просто число);
       albumFrom / albumTo — подписи начала и конца в строке «с … по …».
       Если поставить albumDays: 0 (или null), число посчитается по датам фото. */
    albumDays: 77,
    albumFrom: '26 сентября',
    albumTo: '12 декабря'
  };

  var DATA = window.ALBUM_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var conn = navigator.connection || {};
  var saveData = !!conn.saveData;
  var slowNet = saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
  var hasIO = 'IntersectionObserver' in window;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function hash01(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 1000) / 1000;
  }

  if (!DATA || !DATA.chapters || !DATA.chapters.length) {
    if (window.console) console.error('[album] Нет данных альбома (js/media-data.js)');
    return;
  }

  var stats = DATA.stats;

  /* --------------------------------------------------------------------
     Числа и даты, которые берутся из CONFIG (с запасным вариантом из данных)
     -------------------------------------------------------------------- */
  function albumDaysCount() {
    var n = parseInt(CONFIG.albumDays, 10);
    return (isFinite(n) && n > 0) ? n : stats.days;
  }
  function albumFromLabel() {
    return CONFIG.albumFrom || stats.firstLabel || '';
  }
  function albumToLabel() {
    return CONFIG.albumTo || stats.lastLabel || '';
  }

  /* --------------------------------------------------------------------
     Плоский список фотографий (порядок альбома = порядок лайтбокса)
     -------------------------------------------------------------------- */
  var photos = [];
  var chapterStart = [];
  DATA.chapters.forEach(function (ch, ci) {
    chapterStart[ci] = photos.length;
    ch.photos.forEach(function (p, pi) {
      var copy = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copy[k] = p[k];
      copy.index = photos.length;
      copy.chapterTitle = ch.title;
      copy.chapterNum = ch.num;
      copy.chapterDate = ch.date;
      copy.indexWithin = pi;
      copy.chapterSize = ch.photos.length;
      photos.push(copy);
    });
  });

  function altFor(p) {
    return 'Даша. ' + (p.caption || p.chapterTitle) + ', ' + p.dateLabel;
  }

  /* ====================================================================
     ОБЛОЖКА
     ==================================================================== */
  function initHero() {
    var totalDays = albumDaysCount();
    var sub = $('#heroSubtitle');
    if (sub) {
      sub.textContent =
        stats.photos + ' ' + plural(stats.photos, 'кадр', 'кадра', 'кадров') + ', ' +
        stats.live + ' ' + plural(stats.live, 'живое мгновение', 'живых мгновения', 'живых мгновений') +
        ' — и ' + totalDays + ' ' + plural(totalDays, 'день', 'дня', 'дней') +
        ', каждый из которых я запомню навсегда.';
    }

    /* подсказки формулируем под устройство: телефон — главный сценарий */
    if (!hoverFine) {
      var liveNote = $('#liveNote');
      if (liveNote) liveNote.textContent = 'листай в сторону — и нажимай на кадр, чтобы услышать';
    }

    var wrap = $('#heroPolaroids');
    if (wrap) {
      var html = '';
      (DATA.hero || []).forEach(function (p, i) {
        html += '<div class="polaroid polaroid--' + (i + 1) + '">' +
          '<img src="' + esc(p.thumb) + '" alt="" width="' + p.w + '" height="' + p.h + '" loading="eager" decoding="async">' +
          '</div>';
      });
      wrap.innerHTML = html;
    }

    var first = $('#statsFirst'), last = $('#statsLast');
    if (first) first.textContent = albumFromLabel();
    if (last) last.textContent = albumToLabel();

    /* цифры в блоке статистики: фото/мгновения/главы — автоматически, дни — из CONFIG */
    var counts = [stats.photos, stats.live, stats.chapters, totalDays];
    $$('[data-count]').forEach(function (el, i) {
      if (typeof counts[i] === 'number') el.setAttribute('data-count', counts[i]);
    });
    var daysLabel = $('#statDaysLabel');
    if (daysLabel) daysLabel.textContent = plural(totalDays, 'день', 'дня', 'дней') + ' в альбоме';

    var sign = $('#letterSign');
    if (sign && CONFIG.sender) sign.textContent = '— ' + CONFIG.sender;

    var year = $('#footerYear');
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ====================================================================
     РЕНДЕР АЛЬБОМА
     ==================================================================== */
  function liveBadge() { return '<span class="lead__badge">живой кадр</span>'; }

  function leadHTML(p) {
    var cap = p.caption || p.chapterTitle;
    var portrait = p.ar < 1.15;
    return '<button class="lead' + (portrait ? ' lead--square' : '') + '" type="button" data-open="' + p.index + '" aria-label="Открыть кадр: ' + esc(cap) + ', ' + esc(p.dateLabel) + '">' +
      '<img src="' + esc(p.thumb) + '" alt="' + esc(altFor(p)) + '" width="' + p.w + '" height="' + p.h + '" loading="lazy" style="background:' + esc(p.color) + '">' +
      (p.live ? '<video class="lead__video" data-src="' + esc(p.live.src) + '" loop muted playsinline preload="none" disablepictureinpicture></video>' : '') +
      '<span class="lead__shade"></span>' +
      (p.live ? liveBadge() : '') +
      '<span class="lead__caption"><span class="lead__date">' + esc(p.dateLabel) + '</span>' +
      '<span class="lead__cap">' + esc(cap) + '</span></span>' +
      '</button>';
  }

  function cardHTML(p) {
    var rot = (hash01(p.id) * 4.2 - 2.1).toFixed(2);
    var cap = p.caption
      ? '<span class="card__capText">' + esc(p.caption) + '</span>'
      : '';
    var date = '<span class="card__date">' + esc(p.dateLabel) + '</span>';
    return '<figure class="card' + (p.live ? ' card--live' : '') + '" style="--rot:' + rot + 'deg;--bg:' + esc(p.color) + '">' +
      '<button class="card__btn" type="button" data-open="' + p.index + '" aria-label="Открыть фотографию: ' + esc(altFor(p)) + '">' +
      '<img class="card__img" src="' + esc(p.thumb) + '" alt="' + esc(altFor(p)) + '" width="' + p.w + '" height="' + p.h + '" loading="lazy">' +
      (p.live ? '<video class="card__video" data-src="' + esc(p.live.src) + '" loop muted playsinline preload="none" disablepictureinpicture></video>' : '') +
      (p.live ? '<span class="card__live">живой кадр</span>' : '') +
      '</button>' +
      ((cap || p.dateLabel) ? '<figcaption class="card__cap">' + cap + date + '</figcaption>' : '') +
      '</figure>';
  }

  function chapterHTML(ch, ci) {
    var start = chapterStart[ci];
    var list = photos.slice(start, start + ch.photos.length);
    var hasLead = list.length >= 5;
    var lead = hasLead ? list[0] : null;
    var rest = hasLead ? list.slice(1) : list;

    var html = '<section class="chapter" aria-labelledby="ch-' + ch.num + '-title">' +
      '<header class="chapter__head">' +
      '<span class="chapter__num">' + esc(ch.num) + '</span>' +
      '<h2 class="chapter__title" id="ch-' + ch.num + '-title">' + esc(ch.title) + '</h2>' +
      '<p class="chapter__meta"><span>' + esc(ch.date) + '</span><i></i><span>' +
      list.length + ' ' + plural(list.length, 'кадр', 'кадра', 'кадров') + '</span></p>' +
      '<p class="chapter__note">' + esc(ch.note) + '</p>' +
      '</header>';

    if (lead) html += leadHTML(lead);

    if (hasLead) {
      html += '<div class="collage">' + rest.map(cardHTML).join('') + '</div></section>';
    } else {
      var cols = list.length === 2 ? 2 : 3;
      html += '<div class="collage collage--grid" style="--cols:' + cols + '">' + rest.map(cardHTML).join('') + '</div></section>';
    }
    return html;
  }

  function interludeHTML(it) {
    var p = it.photo;
    var pos = it.pos || 'center';
    return '<section class="interlude" aria-label="цитата">' +
      '<div class="interlude__bg" data-parallax>' +
      '<img src="' + esc(p.full) + '" alt="" loading="lazy" decoding="async" style="object-position:' + esc(pos) + '">' +
      '</div>' +
      '<blockquote class="interlude__quote">' + esc(it.quote) + '</blockquote>' +
      '</section>';
  }

  function renderAlbum() {
    var album = $('#album');
    if (!album) return;
    var byAfter = {};
    (DATA.interludes || []).forEach(function (it) { byAfter[it.after] = it; });

    var html = '';
    DATA.chapters.forEach(function (ch, ci) {
      html += chapterHTML(ch, ci);
      var n = ci + 1;
      if (byAfter[n]) html += interludeHTML(byAfter[n]);
    });
    album.innerHTML = html;
  }

  /* ====================================================================
     ЖИВАЯ ЛЕНТА
     ==================================================================== */
  function renderStrip() {
    var strip = $('#strip');
    if (!strip) return;
    var byId = {};
    photos.forEach(function (p) { byId[p.id] = p; });
    var items = (DATA.liveStrip || [])
      .map(function (p) { return byId[p.id] || p; })
      .filter(function (p) { return p.live && typeof p.index === 'number'; });
    if (!items.length) {
      var sec = $('#live');
      if (sec) sec.style.display = 'none';
      return;
    }
    strip.innerHTML = items.map(function (p) {
      return '<button class="clip" type="button" data-open="' + p.index + '" aria-label="Живой кадр: ' + esc(altFor(p)) + '" style="--ar:' + p.ar + ';--bg:' + esc(p.color) + '">' +
        '<img src="' + esc(p.thumb) + '" alt="' + esc(altFor(p)) + '" width="' + p.w + '" height="' + p.h + '" loading="lazy" decoding="async">' +
        '<video data-src="' + esc(p.live.src) + '" muted loop playsinline preload="none" disablepictureinpicture></video>' +
        '<span class="clip__tag">живой кадр</span>' +
        '</button>';
    }).join('');
  }

  /* ====================================================================
     ЖИВЫЕ КАДРЫ: ВОСПРОИЗВЕДЕНИЕ ПО НАВЕДЕНИЮ / В ЗОНЕ ВИДИМОСТИ
     ==================================================================== */
  function wireVideo(video, onPlaying, onStopped) {
    if (!video || video.dataset.wired === '1') return;
    video.dataset.wired = '1';
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onStopped);
    video.addEventListener('error', function () {
      video.dataset.failed = '1';
      video.classList.add('is-broken');
      onStopped();
    });
  }

  function playVideo(video) {
    if (!video) return;
    if (!video.getAttribute('src') && video.dataset.src) video.setAttribute('src', video.dataset.src);
    var pr = video.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  function setupHoverCards() {
    if (!hoverFine || reduceMotion) return;
    $$('.card--live').forEach(function (card) {
      var video = $('.card__video', card);
      if (!video) return;
      var timer = null;

      var enter = function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          wireVideo(video,
            function () { card.classList.add('is-playing'); },
            function () { card.classList.remove('is-playing'); });
          playVideo(video);
        }, 80);
      };
      var leave = function () {
        clearTimeout(timer);
        video.pause();
        try { video.currentTime = 0; } catch (e) { /* ignore */ }
        card.classList.remove('is-playing');
      };
      card.addEventListener('pointerenter', enter);
      card.addEventListener('pointerleave', leave);
      card.addEventListener('focusin', enter);
      card.addEventListener('focusout', leave);
    });

    $$('.lead').forEach(function (lead) {
      var video = $('.lead__video', lead);
      if (!video) return;
      var timer = null;
      var enter = function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          wireVideo(video,
            function () { lead.classList.add('is-playing'); },
            function () { lead.classList.remove('is-playing'); });
          playVideo(video);
        }, 120);
      };
      var leave = function () {
        clearTimeout(timer);
        video.pause();
        try { video.currentTime = 0; } catch (e) { /* ignore */ }
        lead.classList.remove('is-playing');
      };
      lead.addEventListener('pointerenter', enter);
      lead.addEventListener('pointerleave', leave);
      lead.addEventListener('focusin', enter);
      lead.addEventListener('focusout', leave);
    });
  }

  function setupStripVideos() {
    var strip = $('#strip');
    if (!strip) return;
    var clips = $$('.clip', strip);
    clips.forEach(function (clip) {
      var video = $('video', clip);
      if (!video) return;
      wireVideo(video,
        function () { clip.classList.add('is-live'); },
        function () { clip.classList.remove('is-live'); });
    });

    var autoplay = !saveData && !reduceMotion;

    function pauseAll(except) {
      clips.forEach(function (c) {
        if (c === except) return;
        var v = $('video', c);
        if (v && !v.paused) v.pause();
      });
    }

    if (autoplay) {
      if (hoverFine) {
        /* мышь: оживают все видимые кадры */
        if (!hasIO) {
          clips.forEach(function (clip) { playVideo($('video', clip)); });
        } else {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              var video = $('video', en.target);
              if (!video) return;
              if (en.isIntersecting) playVideo(video);
              else video.pause();
            });
          }, { root: strip, threshold: 0.55 });
          clips.forEach(function (c) { io.observe(c); });
        }
      } else {
        /* палец: одновременно оживает только один кадр — самый центральный.
           Так и айфон не упирается в лимит одновременных видео, и трафик экономится. */
        var stripVisible = !hasIO;
        var rafId = null;

        var apply = function () {
          rafId = null;
          if (!stripVisible) { pauseAll(null); return; }
          var sr = strip.getBoundingClientRect();
          if (sr.bottom < 90 || sr.top > window.innerHeight - 90) { pauseAll(null); return; }
          var center = sr.left + sr.width / 2;
          var best = null, bestDist = Infinity;
          clips.forEach(function (c) {
            var r = c.getBoundingClientRect();
            if (r.right < sr.left + 12 || r.left > sr.right - 12) return;
            var d = Math.abs((r.left + r.width / 2) - center);
            if (d < bestDist) { bestDist = d; best = c; }
          });
          pauseAll(best);
          if (best) {
            var bv = $('video', best);
            if (bv && bv.paused && bv.dataset.failed !== '1') playVideo(bv);
          }
        };
        var schedule = function () {
          if (rafId) return;
          rafId = requestAnimationFrame(apply);
        };

        if (hasIO) {
          var visIO = new IntersectionObserver(function (entries) {
            stripVisible = !!entries[0].isIntersecting;
            schedule();
          }, { threshold: 0.12 });
          visIO.observe(strip);
        }
        strip.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        schedule();
      }
    }

    /* перетаскивание ленты мышкой */
    var isDown = false, startX = 0, startLeft = 0, moved = false;
    strip.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      isDown = true; moved = false;
      startX = e.clientX; startLeft = strip.scrollLeft;
      strip.classList.add('is-dragging');
    });
    strip.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      strip.scrollLeft = startLeft - dx;
    });
    var end = function () { isDown = false; strip.classList.remove('is-dragging'); };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointerleave', end);
    strip.addEventListener('pointercancel', end);
    strip.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
  }

  /* ====================================================================
     ПОЯВЛЕНИЕ ЭЛЕМЕНТОВ, СЧЁТЧИКИ, ПАРАЛЛАКС
     ==================================================================== */
  var parallaxItems = [];

  function splitWordsIn(root) {
    $$('[data-words]', root).forEach(function (el) {
      if (el.dataset.split === '1') return;
      el.dataset.split = '1';
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      var i = 0;
      nodes.forEach(function (node) {
        if (!node.nodeValue || !/\S/.test(node.nodeValue)) return;
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          var span = document.createElement('span');
          span.className = 'word';
          span.style.setProperty('--i', i++);
          span.textContent = part;
          frag.appendChild(span);
        });
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
      });
    });
  }

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reduceMotion) { el.textContent = target; return; }
    var dur = 1200, t0 = performance.now();
    function tick(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }

  function observeAll() {
    var targets = $$('[data-reveal], .stat, .wish, [data-words], .card, .lead');
    if (!hasIO) {
      targets.forEach(function (el) {
        el.classList.add('is-in', 'is-revealed');
      });
      $$('[data-count]').forEach(animateCount);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('is-in');
        if (el.hasAttribute('data-words')) el.classList.add('is-revealed');
        if (el.hasAttribute('data-count')) animateCount(el);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(function (el) { io.observe(el); });

    /* цифры в статистике */
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        animateCount(en.target);
        countIO.unobserve(en.target);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(function (el) { countIO.observe(el); });

    /* цитаты-интерлюдии */
    var quoteIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) en.target.classList.add('is-in');
      });
    }, { threshold: 0.3 });
    $$('.interlude').forEach(function (el) { quoteIO.observe(el); });
  }

  function initParallax() {
    parallaxItems = $$('.interlude').map(function (el) {
      return { el: el, bg: $('[data-parallax]', el) };
    }).filter(function (item) { return item.bg; });
  }

  function setupScrollLoop() {
    var bar = $('#progressBar');
    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      var doc = document.documentElement;
      var max = (doc.scrollHeight || 0) - vh;
      var y = window.pageYOffset || doc.scrollTop || 0;
      if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? clamp(y / max, 0, 1) : 0) + ')';

      if (reduceMotion) return;
      for (var i = 0; i < parallaxItems.length; i++) {
        var item = parallaxItems[i];
        var r = item.el.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) continue;
        var progress = (r.top + r.height / 2 - vh / 2) / vh;
        item.bg.style.transform = 'translate3d(0,' + (progress * 54).toFixed(2) + 'px,0)';
      }
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ====================================================================
     ЗАСТАВКА
     ==================================================================== */
  function initGate() {
    var gate = $('#gate');
    var btn = $('#openBtn');
    var opened = false;

    if (!gate || !btn) return;

    function open() {
      if (opened) return;
      opened = true;
      gate.classList.add('is-open');

      if (window.Music && window.Music.supported) {
        window.Music.start();
        syncSoundUI(window.Music.enabled);
        syncTrackUI();
      }

      window.setTimeout(function () {
        document.body.classList.remove('is-locked');
        document.body.classList.add('is-unlocked');
        startEffects();
      }, 900);

      window.setTimeout(function () {
        gate.classList.add('is-hidden');
        gate.setAttribute('aria-hidden', 'true');
      }, 1780);

      window.setTimeout(function () {
        if (gate.parentNode) gate.parentNode.removeChild(gate);
      }, 3600);
    }

    btn.addEventListener('click', open);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  /* ====================================================================
     ЛАЙТБОКС
     ==================================================================== */
  var lb = {};
  var lbIndex = -1;
  var lbOpen = false;
  var lbSoundOn = true;
  var lbLastFocus = null;

  function syncLbSound() {
    if (!lb.sound) return;
    lb.sound.setAttribute('aria-pressed', lbSoundOn ? 'true' : 'false');
    var label = lb.sound.querySelector('#lbSoundLabel');
    if (label) label.textContent = lbSoundOn ? 'звук' : 'без звука';
  }

  function showVideoFallback() {
    if (!lb.root) return;
    lb.root.classList.remove('has-video');
    lb.root.classList.remove('is-loading');
  }

  function playLbVideo(p) {
    var v = lb.video;
    if (!v || !p.live) return;
    v.muted = !lbSoundOn;
    v.src = p.live.src;
    try { v.load(); } catch (e) { /* ignore */ }
    var pr = v.play();
    if (pr && pr.catch) {
      pr.catch(function () {
        v.muted = true;
        var again = v.play();
        if (again && again.catch) again.catch(function () {});
      });
    }
  }

  function renderSlide(index) {
    if (!lb.root) return;
    var n = photos.length;
    index = ((index % n) + n) % n;
    lbIndex = index;
    var p = photos[index];

    lb.root.classList.add('is-loading');
    lb.img.style.background = p.color;
    lb.img.alt = altFor(p);
    lb.img.onload = function () { lb.root.classList.remove('is-loading'); };
    lb.img.onerror = function () { lb.root.classList.remove('is-loading'); };
    lb.img.src = p.full;

    if (p.live) {
      lb.root.classList.add('has-video');
      lb.sound.hidden = !p.live.audio;
      if (!p.live.audio) lbSoundOn = false;
      syncLbSound();
      playLbVideo(p);
    } else {
      lb.root.classList.remove('has-video');
      lb.sound.hidden = true;
      if (lb.video) {
        try { lb.video.pause(); } catch (e) { /* ignore */ }
        lb.video.removeAttribute('src');
      }
    }

    lb.chapter.textContent = 'глава ' + p.chapterNum + ' · ' + p.chapterTitle;
    lb.date.textContent = p.dateLabel + (p.caption ? ' · ' + p.caption : '');
    lb.counter.textContent = (index + 1) + ' / ' + n;
    lb.progress.style.width = ((index + 1) / n * 100).toFixed(1) + '%';

    /* предзагрузка соседних кадров — экономно на телефоне */
    if (!slowNet) {
      var preload = hoverFine
        ? [photos[(index + 1) % n], photos[(index - 1 + n) % n]]
        : [photos[(index + 1) % n]];
      preload.forEach(function (q) {
        var im = new Image();
        im.src = q.full;
      });
    }
  }

  function openLightbox(index) {
    if (!lb.root) return;
    lbLastFocus = document.activeElement;
    lbOpen = true;
    document.body.classList.add('lb-open');
    document.documentElement.classList.add('lb-open');
    if (lb.root.hidden) lb.root.hidden = false;
    renderSlide(index);
    requestAnimationFrame(function () { lb.root.classList.add('is-open'); });
    if (window.Music) window.Music.setDucked(true);
    window.setTimeout(function () {
      if (!lbOpen) return;
      var target = lb.dialog || lb.close;
      if (target && target.focus) {
        try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    }, 60);
  }

  function closeLightbox() {
    if (!lb.root || !lbOpen) return;
    lbOpen = false;
    lb.root.classList.remove('is-open');
    if (lb.video) {
      try { lb.video.pause(); } catch (e) { /* ignore */ }
    }
    document.body.classList.remove('lb-open');
    document.documentElement.classList.remove('lb-open');
    if (window.Music) window.Music.setDucked(false);
    window.setTimeout(function () {
      if (!lbOpen) {
        lb.root.hidden = true;
        if (lb.video) lb.video.removeAttribute('src');
      }
    }, 420);
    if (lbLastFocus && lbLastFocus.focus) {
      try { lbLastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function stepLightbox(delta) {
    if (!lbOpen) return;
    renderSlide(lbIndex + delta);
  }

  function initLightbox() {
    lb.root = $('#lightbox');
    if (!lb.root) return;
    lb.img = $('#lbImg');
    lb.video = $('#lbVideo');
    lb.chapter = $('#lbChapter');
    lb.date = $('#lbDate');
    lb.counter = $('#lbCounter');
    lb.progress = $('#lbProgress');
    lb.sound = $('#lbSound');
    lb.close = $('.lightbox__close');
    lb.dialog = $('.lightbox__dialog', lb.root);

    if (lb.video) {
      lb.video.addEventListener('error', showVideoFallback);
      lb.video.addEventListener('loadeddata', function () { lb.root.classList.remove('is-loading'); });
    }

    $$('[data-close]', lb.root).forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    var prev = $('[data-prev]', lb.root);
    var next = $('[data-next]', lb.root);
    if (prev) prev.addEventListener('click', function () { stepLightbox(-1); });
    if (next) next.addEventListener('click', function () { stepLightbox(1); });

    if (lb.sound) {
      lb.sound.addEventListener('click', function () {
        lbSoundOn = !lbSoundOn;
        if (lb.video) lb.video.muted = !lbSoundOn;
        if (lbSoundOn && lb.video) {
          var pr = lb.video.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
        syncLbSound();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!lbOpen) return;
      if (e.key === 'Escape') { closeLightbox(); }
      else if (e.key === 'ArrowLeft') { stepLightbox(-1); }
      else if (e.key === 'ArrowRight') { stepLightbox(1); }
    });

    /* свайпы */
    var startX = 0, startY = 0, startT = 0, tracking = false;
    lb.root.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });

    lb.root.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var dt = Date.now() - startT;
      if (dt > 900) return;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        stepLightbox(dx < 0 ? 1 : -1);
      } else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        closeLightbox();
      }
    }, { passive: true });
  }

  /* ====================================================================
     ТОРТ
     ==================================================================== */
  var cakeState = { blown: 0, total: 0, done: false };

  function initCake() {
    var cake = $('#cake');
    if (!cake) return;
    var candles = $$('.candle', cake);
    cakeState.total = candles.length;
    var hint = $('#cakeHint');
    var blowAll = $('#blowAll');

    function finish() {
      if (cakeState.done) return;
      cakeState.done = true;
      cake.classList.add('is-done');
      if (hint) hint.textContent = 'желание услышано — и уже летит исполняться ♡';
      if (blowAll) blowAll.setAttribute('disabled', 'disabled');
      var wish = $('#finaleWish');
      if (wish) wish.classList.add('is-in');
      if (window.FX) {
        var r = cake.getBoundingClientRect();
        var bx = clamp(r.left + r.width / 2, 40, window.innerWidth - 40);
        var by = clamp(r.top + r.height * 0.3, 80, window.innerHeight - 80);
        window.FX.burst(bx, by);
        window.setTimeout(function () {
          if (window.FX) window.FX.burst(bx + (Math.random() - 0.5) * 120, by - 40);
        }, 320);
      }
    }

    function blow(candle) {
      if (!candle || candle.classList.contains('is-out')) return false;
      candle.classList.add('is-out');
      cakeState.blown += 1;
      if (navigator.vibrate) {
        try { navigator.vibrate(12); } catch (e) { /* не критично */ }
      }
      if (cakeState.blown >= cakeState.total) finish();
      return true;
    }

    cake.addEventListener('click', function (e) {
      var target = e.target.closest ? e.target.closest('.candle') : null;
      if (target) { blow(target); return; }
      /* клик по торту — тушим следующую свечу */
      var nextCandle = candles.filter(function (c) { return !c.classList.contains('is-out'); })[0];
      blow(nextCandle);
    });

    candles.forEach(function (c) {
      c.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); blow(c); }
      });
    });

    if (blowAll) {
      blowAll.addEventListener('click', function () {
        var left = candles.filter(function (c) { return !c.classList.contains('is-out'); });
        left.forEach(function (c, i) {
          window.setTimeout(function () { blow(c); }, i * 240);
        });
      });
    }
  }

  /* ====================================================================
     ЧАСТИЦЫ: ЛЕПЕСТКИ + КОНФЕТТИ
     ==================================================================== */
  var FX = (function () {
    var canvas = null, ctx = null, raf = null;
    var w = 0, h = 0, dpr = 1;
    var petals = [], confetti = [];
    var running = false;
    var petalCount = 0;

    var PETAL_COLORS = [
      'rgba(244, 214, 210, .92)', 'rgba(233, 201, 196, .85)',
      'rgba(230, 205, 168, .8)', 'rgba(255, 242, 232, .95)',
      'rgba(219, 176, 176, .75)'
    ];
    var CONF_COLORS = ['#dba0a0', '#bc7f83', '#c8a76a', '#e3cba0', '#f4dcd8', '#a6b1a0', '#fffdf9'];

    function resize() {
      if (!canvas) return;
      w = window.innerWidth;
      h = window.innerHeight;
      /* на телефоне не рендерим канвас в 3x — бережём батарею */
      dpr = Math.min(w < 620 ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makePetal(seeded) {
      return {
        x: Math.random() * w,
        y: seeded ? Math.random() * h : -30 - Math.random() * 80,
        r: 3.2 + Math.random() * 5.2,
        vy: 0.28 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.35,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.02,
        sway: 0.5 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        squash: 0.55 + Math.random() * 0.35
      };
    }

    function spawnPetals() {
      petalCount = reduceMotion ? 0 : (w < 620 ? 9 : 16);
      petals = [];
      for (var i = 0; i < petalCount; i++) petals.push(makePetal(true));
    }

    function burst(x, y) {
      if (!ctx || reduceMotion) return;
      var amount = w < 620 ? 70 : 115;
      for (var i = 0; i < amount; i++) {
        var ang = Math.random() * Math.PI * 2;
        var spd = 3 + Math.random() * 8.6;
        confetti.push({
          x: x, y: y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 3.8,
          w: 5 + Math.random() * 9,
          h: 4 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.28,
          color: CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)],
          life: 1,
          decay: 0.0042 + Math.random() * 0.005,
          round: Math.random() > 0.72,
          sway: (Math.random() - 0.5) * 0.9
        });
      }
      if (!running) start();
    }

    function step() {
      ctx.clearRect(0, 0, w, h);

      /* лепестки */
      for (var i = 0; i < petals.length; i++) {
        var p = petals[i];
        p.phase += 0.008;
        p.x += p.vx + Math.sin(p.phase) * p.sway * 0.4;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 40 || p.x < -60 || p.x > w + 60) {
          petals[i] = makePetal(false);
          petals[i].x = Math.random() * w;
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * p.squash, p.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* конфетти */
      for (var j = confetti.length - 1; j >= 0; j--) {
        var c = confetti[j];
        c.vy += 0.16;
        c.vx *= 0.995;
        c.x += c.vx + Math.sin(c.y * 0.02) * c.sway * 0.3;
        c.y += c.vy;
        c.rot += c.vr;
        c.life -= c.decay;
        if (c.life <= 0 || c.y > h + 60) { confetti.splice(j, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, c.life * 1.6));
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        if (c.round) {
          ctx.beginPath();
          ctx.arc(0, 0, c.w * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        }
        ctx.restore();
      }

      if (running) raf = requestAnimationFrame(step);
    }

    function start() {
      if (!canvas || reduceMotion || running) return;
      running = true;
      resize();
      if (!petals.length) spawnPetals();
      raf = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    function init() {
      canvas = $('#fx');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      if (!ctx) return;
      resize();
      window.addEventListener('resize', function () {
        resize();
        spawnPetals();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop();
        else if (petals.length && !running) start();
      });
    }

    return {
      init: init,
      start: start,
      burst: burst
    };
  })();

  function startEffects() {
    FX.start();
  }

  /* ====================================================================
     ЗВУК
     ==================================================================== */
  /* ====================================================================
     ЗВУК: «СЕЙЧАС ИГРАЕТ» И ПОДПИСЬ ТРЕКА
     ==================================================================== */
  var nowPlayingTimer = null;

  function showNowPlaying(title) {
    var box = $('#nowPlaying');
    var text = $('#nowPlayingText');
    if (!box || !text || !title) return;
    text.textContent = title;
    box.classList.add('is-visible');
    if (nowPlayingTimer) clearTimeout(nowPlayingTimer);
    nowPlayingTimer = window.setTimeout(function () {
      box.classList.remove('is-visible');
      nowPlayingTimer = null;
    }, 7000);
  }

  function hideNowPlaying() {
    var box = $('#nowPlaying');
    if (nowPlayingTimer) {
      clearTimeout(nowPlayingTimer);
      nowPlayingTimer = null;
    }
    if (box) box.classList.remove('is-visible');
  }

  function syncTrackUI() {
    var music = window.Music;
    var mode = music ? music.mode : null;
    var title = music ? music.title : '';
    var foot = $('#footerMusic');
    var label = $('#footerMusicLabel');
    var btn = $('#soundBtn');

    if (foot && label) {
      if (mode) {
        label.textContent = title;
        foot.hidden = false;
      } else {
        foot.hidden = true;
      }
    }
    if (btn) btn.setAttribute('title', mode ? 'Играет: ' + title : '');
    if (mode === 'track' && music && music.enabled) showNowPlaying(title);
  }

  function syncSoundUI(on) {
    var btn = $('#soundBtn');
    var finaleBtn = $('#musicBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Выключить музыку' : 'Включить музыку');
    }
    if (finaleBtn) finaleBtn.textContent = on ? 'выключить музыку' : 'включить музыку';
  }

  function initSound() {
    var btn = $('#soundBtn');
    var finaleBtn = $('#musicBtn');

    if (!window.Music || !window.Music.supported) {
      if (btn) btn.style.display = 'none';
      if (finaleBtn) finaleBtn.style.display = 'none';
      return;
    }

    function toggle() {
      var on = window.Music.toggle();
      syncSoundUI(window.Music.enabled);
      syncTrackUI();
      if (!on) hideNowPlaying();
      return on;
    }
    if (btn) btn.addEventListener('click', toggle);
    if (finaleBtn) finaleBtn.addEventListener('click', toggle);

    if (window.Music.onModeChange) window.Music.onModeChange(syncTrackUI);
    syncSoundUI(false);
  }

  /* ====================================================================
     КНОПКА «ПРОЖИТЬ ЭТО ЕЩЁ РАЗ»
     ==================================================================== */
  function initReplay() {
    var btn = $('#replayBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ====================================================================
     ЗАПУСК
     ==================================================================== */
  function delegateOpen() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-open]') : null;
      if (!trigger) return;
      var idx = parseInt(trigger.getAttribute('data-open'), 10);
      if (isNaN(idx)) return;
      e.preventDefault();
      openLightbox(idx);
    });
  }

  function boot() {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    initHero();
    renderAlbum();
    renderStrip();

    splitWordsIn(document);
    observeAll();
    initParallax();
    setupScrollLoop();
    setupHoverCards();
    setupStripVideos();

    FX.init();
    initLightbox();
    initCake();
    initSound();
    initReplay();
    delegateOpen();
    initGate();

    /* если страница открыта не с нуля — не дёргаем анимации заново */
    if (window.pageYOffset > 4) window.scrollTo(0, 0);
  }

  window.FX = FX;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
