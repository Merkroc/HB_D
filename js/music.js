/* =========================================================================
   Музыка открытки.

   Основной режим — реальная песня из assets/music/track.* (mp3 / m4a / ...).
   Если файла нет или браузер его не прочитал — играет синтезированная
   «музыкальная шкатулка» на Web Audio (никаких внешних файлов).

   Публичный интерфейс: window.Music
     Music.start() / Music.stop() / Music.toggle()
     Music.setDucked(true|false)   — приглушить, пока играет живой кадр
     Music.resume()                — вернуть песню, если её «придержали»
     Music.mode                    — 'track' | 'synth' | null
     Music.title                   — что сейчас играет
     Music.onModeChange(fn)        — колбэк, когда режим определился
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    title: 'Хаски — Ветром, снегом, зноем',
    candidates: [
      'assets/music/track.mp3',
      'assets/music/track.m4a',
      'assets/music/track.ogg',
      'assets/music/track.wav',
      'assets/music/track.flac',
      'assets/music/track.aac'
    ],
    volume: 0.42,        // обычная громкость песни (0..1)
    duckVolume: 0.05,    // насколько тихо, пока звучит живой кадр
    fadeIn: 1.8          // сек: плавное появление звука
  };

  var AC = window.AudioContext || window.webkitAudioContext;
  var hasAudioEl = typeof Audio !== 'undefined';

  /* На iPhone/iPad браузер игнорирует el.volume: выставить громкость нельзя.
     Там «приглушить» = честно поставить паузу, а потом вернуть песню. */
  var volumeSettable = (function () {
    try {
      var probe = new Audio();
      probe.volume = 0.25;
      var ok = Math.abs(probe.volume - 0.25) < 0.02;
      probe.volume = 1;
      return ok;
    } catch (e) {
      return true;
    }
  })();

  var enabled = false;
  var started = false;
  var ducked = false;
  var mode = null;          // 'track' | 'synth' | null
  var modeChangeCallback = null;

  /* =====================================================================
     РЕАЛЬНАЯ ПЕСНЯ
     ===================================================================== */
  var el = null;
  var trackIndex = -1;
  var trackFadeTimer = null;
  var trackProbeFinished = false;
  var resumeTries = 0;
  var resumeTimer = null;

  function volumeTarget() {
    if (!enabled) return 0;
    return ducked ? CONFIG.duckVolume : CONFIG.volume;
  }

  function rampTrack(target, seconds) {
    if (!el) return;
    if (trackFadeTimer) {
      clearInterval(trackFadeTimer);
      trackFadeTimer = null;
    }
    var from = el.volume;
    var to = Math.max(0, Math.min(1, target));
    var t0 = Date.now();
    var ms = Math.max(1, (seconds || 0.5) * 1000);
    trackFadeTimer = setInterval(function () {
      var p = Math.min(1, (Date.now() - t0) / ms);
      try { el.volume = from + (to - from) * p; } catch (e) { /* ignore */ }
      if (p >= 1) {
        clearInterval(trackFadeTimer);
        trackFadeTimer = null;
      }
    }, 40);
  }

  /* ---------- возвращаем песню, если её поставили на паузу снаружи ----------
     Так бывает, когда зазвучал живой кадр, когда система отдала звук другому
     приложению или когда паузу «придержал» сам браузер. Свои паузы не трогаем:
     возвращаемся только тогда, когда музыка действительно должна играть. */
  function cancelResume() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  function tryResume() {
    if (!el || !enabled || ducked || document.hidden) return false;
    if (!el.paused) { resumeTries = 0; return false; }
    if (resumeTries >= 5) return false;
    resumeTries += 1;
    var pr = null;
    try { pr = el.play(); } catch (e) { pr = null; }
    if (pr && pr.catch) pr.catch(function () { /* ещё попробуем по таймеру */ });
    return true;
  }

  function scheduleResume(delay) {
    if (resumeTimer || resumeTries >= 5) return;
    resumeTimer = window.setTimeout(function () {
      resumeTimer = null;
      if (tryResume()) scheduleResume(900);
    }, delay || 500);
  }

  function tryNextCandidate() {
    if (!hasAudioEl) {
      probeFinished('synth');
      return;
    }
    trackIndex += 1;
    if (trackIndex >= CONFIG.candidates.length) {
      probeFinished('synth');
      return;
    }
    var src = CONFIG.candidates[trackIndex];
    el = new Audio();
    el.preload = 'metadata';
    el.loop = true;
    el.volume = 0;
    el.src = src;

    var settled = false;
    var onReady = function () {
      if (settled) return;
      settled = true;
      el.removeEventListener('error', onError);
      probeFinished('track');
    };
    var onError = function () {
      if (settled) return;
      settled = true;
      el.removeEventListener('loadedmetadata', onReady);
      el = null;
      tryNextCandidate();
    };
    el.addEventListener('loadedmetadata', onReady);
    el.addEventListener('error', onError);
    el.addEventListener('pause', function () {
      /* пауза не по нашей воле, а музыка должна играть — вернёмся сами */
      if (!enabled || ducked || document.hidden) return;
      resumeTries = 0;
      scheduleResume(600);
    });

    /* на всякий случай: если событие так и не придёт, через 10 с пробуем дальше */
    window.setTimeout(function () {
      if (!settled) onError();
    }, 10000);
  }

  function probeFinished(found) {
    if (trackProbeFinished && mode) return;
    trackProbeFinished = true;
    setMode(found);
  }

  function setMode(next) {
    var prev = mode;
    mode = next;
    if (modeChangeCallback) modeChangeCallback(mode, currentTitle());
    if (!enabled || prev === mode) return;

    if (mode === 'track' && el) {
      synthStop();
      playTrack();
      rampTrack(volumeTarget(), 1.2);
    } else if (mode === 'synth') {
      if (el) {
        try { el.pause(); } catch (e) { /* ignore */ }
        rampTrack(0, 0.2);
      }
      synthStart();
    }
  }

  function playTrack() {
    if (!el) return;
    var pr;
    try { pr = el.play(); } catch (e) { pr = null; }
    if (pr && pr.catch) {
      pr.catch(function () {
        /* автоплей запрещён или файл битый — уходим на шкатулку */
        if (mode === 'track') {
          setMode(AC ? 'synth' : null);
        }
      });
    }
  }

  /* =====================================================================
     ШКАТУЛКА (синтез, запасной вариант)
     ===================================================================== */
  var BPM = 88;
  var BEAT = 60 / BPM;

  var MELODY = [
    [1.0, 60, 0.45, 0.16], [1.5, 60, 0.45, 0.13], [2.0, 62, 0.9, 0.16], [3.0, 60, 0.9, 0.16], [4.0, 65, 0.9, 0.17], [5.0, 64, 1.9, 0.16],
    [7.0, 60, 0.45, 0.16], [7.5, 60, 0.45, 0.13], [8.0, 62, 0.9, 0.16], [9.0, 60, 0.9, 0.16], [10.0, 67, 0.9, 0.17], [11.0, 65, 1.9, 0.16],
    [13.0, 60, 0.45, 0.16], [13.5, 60, 0.45, 0.13], [14.0, 72, 0.9, 0.17], [15.0, 69, 0.9, 0.16], [16.0, 65, 0.9, 0.16], [17.0, 64, 0.9, 0.15], [18.0, 62, 1.9, 0.15],
    [20.0, 70, 0.45, 0.15], [20.5, 70, 0.45, 0.12], [21.0, 69, 0.9, 0.15], [22.0, 65, 0.9, 0.16], [23.0, 67, 0.9, 0.14], [24.0, 65, 2.4, 0.15]
  ];
  var BASS = [
    [1.0, 41, 0.10], [4.0, 41, 0.09], [7.0, 48, 0.09], [10.0, 41, 0.10],
    [13.0, 41, 0.09], [16.0, 41, 0.09], [19.0, 48, 0.10], [22.0, 41, 0.11]
  ];
  var ARP = [
    [1.5, 65, 0.035], [2.5, 72, 0.03], [4.5, 77, 0.03], [5.5, 72, 0.028],
    [7.5, 67, 0.035], [8.5, 72, 0.03], [10.5, 79, 0.028], [11.5, 72, 0.03],
    [13.5, 65, 0.033], [14.5, 72, 0.03], [16.5, 77, 0.03], [17.5, 69, 0.028],
    [19.5, 70, 0.033], [20.5, 74, 0.03], [22.5, 77, 0.028], [23.5, 72, 0.03]
  ];
  var LOOP_BEATS = 28;

  var ctx = null;
  var master = null;
  var dry = null;
  var wet = null;
  var reverb = null;
  var loopTimer = null;
  var synthVolume = 0.5;

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildImpulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var impulse = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  function synthInit() {
    if (ctx) return true;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0;
    dry = ctx.createGain();
    dry.gain.value = 0.85;
    wet = ctx.createGain();
    wet.gain.value = 0.42;
    reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(2.6, 2.4);
    dry.connect(master);
    wet.connect(reverb);
    reverb.connect(master);
    master.connect(ctx.destination);
    return true;
  }

  function bell(midi, when, dur, level, pan) {
    if (!ctx) return;
    var f = midiToHz(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(level, when + 0.008);
    g.gain.exponentialRampToValueAtTime(level * 0.3, when + dur * 0.32);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    o1.connect(g);

    var g2 = ctx.createGain();
    g2.gain.value = 0.34;
    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.004;
    o2.connect(g2);
    g2.connect(g);

    var g3 = ctx.createGain();
    g3.gain.value = 0.12;
    var o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = f * 3.008;
    o3.connect(g3);
    g3.connect(g);

    var out = g;
    if (ctx.createStereoPanner && typeof pan === 'number') {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(dry);
    out.connect(wet);

    o1.start(when); o2.start(when); o3.start(when);
    var stopAt = when + dur + 0.05;
    o1.stop(stopAt); o2.stop(stopAt); o3.stop(stopAt);
  }

  function schedulerLoop(startAt) {
    for (var i = 0; i < MELODY.length; i++) {
      var n = MELODY[i];
      bell(n[1], startAt + n[0] * BEAT, Math.max(0.6, n[2] * BEAT * 1.5), n[3] * (i % 2 ? 0.92 : 1), (Math.random() - 0.5) * 0.35);
    }
    for (var b = 0; b < BASS.length; b++) {
      var q = BASS[b];
      bell(q[1], startAt + q[0] * BEAT, 2.6, q[2] * 0.9, 0);
    }
    for (var a = 0; a < ARP.length; a++) {
      var r = ARP[a];
      bell(r[1], startAt + r[0] * BEAT, 1.9, r[2], (Math.random() - 0.5) * 0.7);
    }
    var loopSeconds = LOOP_BEATS * BEAT;
    var delay = Math.max(200, (startAt + loopSeconds - ctx.currentTime - 1.2) * 1000);
    loopTimer = window.setTimeout(function () {
      if (!enabled || mode !== 'synth') return;
      schedulerLoop(startAt + loopSeconds);
    }, delay);
  }

  function synthApplyVolume(ramp) {
    if (!ctx || !master) return;
    var t = ctx.currentTime;
    var v = enabled ? synthVolume : 0.0001;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
    master.gain.linearRampToValueAtTime(v < 0.0001 ? 0.0001 : v, t + (ramp || 0.6));
  }

  function synthStart() {
    if (!synthInit()) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    synthApplyVolume(0.6);
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    schedulerLoop(ctx.currentTime + 0.12);
  }

  function synthStop() {
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (!ctx) return;
    synthApplyVolume(0.4);
    window.setTimeout(function () {
      if (mode !== 'synth' && ctx && ctx.state === 'running') {
        try { ctx.suspend(); } catch (e) { /* ignore */ }
      }
    }, 700);
  }

  function synthSetVolume(v) {
    synthVolume = Math.max(0.0001, Math.min(1, v)) * 0.9;
    synthApplyVolume(0.4);
  }

  /* =====================================================================
     ОБЩЕЕ УПРАВЛЕНИЕ
     ===================================================================== */
  function currentTitle() {
    if (mode === 'synth') return 'музыкальная шкатулка';
    return CONFIG.title;
  }

  function applyVolume(ramp) {
    if (mode === 'track' && el) {
      rampTrack(volumeTarget(), ramp || 0.4);
      if (!ducked) tryResume();
    } else if (mode === 'synth') {
      synthSetVolume(!enabled ? 0.0001 : (ducked ? CONFIG.duckVolume : CONFIG.volume * 1.6));
    }
  }

  function start() {
    if (!enabled) {
      enabled = true;
      started = true;
      resumeTries = 0;
      cancelResume();
    }
    if (mode === 'track' && el) {
      playTrack();
      rampTrack(volumeTarget(), CONFIG.fadeIn);
      return true;
    }
    if (mode === 'synth') {
      synthStart();
      applyVolume(0.8);
      return true;
    }
    /* режим ещё определяется: запускаем шкатулку,
       а когда найдётся песня — переключимся на неё */
    if (AC) {
      synthStart();
      applyVolume(0.8);
    }
    return !!(mode || AC);
  }

  function stop() {
    enabled = false;
    cancelResume();
    if (mode === 'track' && el) {
      rampTrack(0, 0.45);
      window.setTimeout(function () {
        if (!enabled && el) { try { el.pause(); } catch (e) { /* ignore */ } }
      }, 520);
      return;
    }
    if (mode === 'synth') synthStop();
  }

  function toggle() {
    if (enabled) { stop(); return false; }
    return start();
  }

  function setDucked(flag) {
    var next = !!flag;
    if (ducked === next) return;
    ducked = next;
    cancelResume();
    resumeTries = 0;
    if (!enabled) return;

    if (ducked) {
      /* уступаем звук: музыка уходит на второй план */
      if (mode === 'track' && el) {
        if (volumeSettable) {
          rampTrack(CONFIG.duckVolume, 0.35);
        } else {
          try { el.pause(); } catch (e) { /* ignore */ }
        }
      } else if (mode === 'synth') {
        synthSetVolume(CONFIG.duckVolume);
      }
      return;
    }

    /* звук снова наш — возвращаем песню на место */
    if (mode === 'track' && el) {
      tryResume();
      rampTrack(volumeTarget(), 0.55);
    } else if (mode === 'synth') {
      if (!loopTimer) synthStart();
      synthSetVolume(CONFIG.volume * 1.6);
    }
  }

  /* вернуть песню на место, если её «придержали» (например, звук живого кадра) */
  function resume() {
    if (!enabled) return;
    cancelResume();
    resumeTries = 0;
    if (mode === 'track' && el) {
      tryResume();                       /* синхронно: браузер ещё считает это жестом */
      rampTrack(volumeTarget(), 0.6);
      return;
    }
    if (mode === 'synth') {
      if (!loopTimer) synthStart();
      applyVolume(0.6);
    }
  }

  /* ---------- реакция на сворачивание вкладки ---------- */
  document.addEventListener('visibilitychange', function () {
    if (mode === 'track' && el) {
      if (document.hidden && enabled) {
        try { el.pause(); } catch (e) { /* ignore */ }
      } else if (!document.hidden && enabled) {
        var pr = el.play();
        if (pr && pr.catch) pr.catch(function () { /* ignore */ });
        rampTrack(volumeTarget(), 0.6);
      }
      return;
    }
    if (!ctx) return;
    if (document.hidden && enabled) {
      try { ctx.suspend(); } catch (e) { /* ignore */ }
    } else if (!document.hidden && enabled) {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  });

  /* ---------- старт поиска песни ---------- */
  tryNextCandidate();

  window.Music = {
    supported: true,
    get enabled() { return enabled; },
    get started() { return started; },
    get mode() { return mode; },
    get title() { return currentTitle(); },
    /* небольшая «диагностика» — пригодится, если что-то не играет */
    get paused() { return mode === 'track' ? (!el || el.paused) : !enabled; },
    get position() { return el ? el.currentTime : 0; },
    get volume() { return el ? el.volume : 0; },
    get ducked() { return ducked; },
    start: start,
    stop: stop,
    toggle: toggle,
    setDucked: setDucked,
    resume: resume,
    onModeChange: function (fn) {
      modeChangeCallback = typeof fn === 'function' ? fn : null;
      if (modeChangeCallback && mode) modeChangeCallback(mode, currentTitle());
    }
  };
})();
