/* takes:ui */
/*
 * ui.js: the only module that reads or writes the shell (src/index.html).
 * It wires the other modules to the page: the capability banner, the first-run guide,
 * the four views, the Record setup, the recording bar, the Review view and the toasts.
 *
 * Sections, one init function each, all called from init():
 *   1. small tools            6. record setup         11. save: download and the cloud folder
 *   2. toasts                 7. recording flow       12. captions
 *   3. capabilities + name    8. recording bar        13. library
 *   4. first-run guide        9. review               14. boot
 *   5. views                 10. trim and cut
 */
(function (root) {
  'use strict';
  var Takes = root.Takes;

  var TOAST_INFO_MS = 5000;
  var TOAST_ERROR_MS = 9000;
  var TOAST_LEAVE_MS = 240;
  var MAX_TOASTS = 3;
  var TIMER_MS = 250;

  var KEY_GUIDE = 'takes.guideDismissed';
  var KEY_PREFS = 'takes.prefs.2'; // bumped when the default bubble corner moved, so an old saved corner does not stick

  var VIEWS = ['record', 'review', 'library', 'about'];
  var STATE_CLASSES = {
    countdown: 'tk-is-countdown',
    recording: 'tk-is-recording',
    paused: 'tk-is-paused',
    processing: 'tk-is-processing'
  };
  var STATUS_TEXT = {
    countdown: 'Get ready',
    recording: 'Recording',
    paused: 'Paused',
    processing: 'Finishing your recording…'
  };
  var CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  var el = {};              // every shell element this file touches, by a short key
  var started = false;      // init() has run
  var currentView = 'record';
  var capsOk = true;        // this browser can record at all
  var starting = false;     // between the Record click and the countdown
  var activeRun = null;     // the recording being set up or made, or null
  var recState = 'idle';    // the last state the recorder announced
  var timerId = null;
  var playerUrl = '';       // the Blob URL the player is showing
  var deviceSeq = 0;        // so a slow device list never overwrites a newer one
  var defaultCorner = 'bottom-left'; // replaced at start-up by whichever corner the shell has checked
  var liveText = '';                 // the shell's own words for the stage while recording
  var baseTitle = '';                // the tab title when nothing is being recorded
  var toasts = [];          // { node, text, timer }

  // ================================================================ 1. small tools

  function byId(id) {
    return root.document.getElementById(id);
  }

  function collect() {
    el.body = root.document.body;
    el.navRecord = byId('tk-nav-record');
    el.navLibrary = byId('tk-nav-library');
    el.navAbout = byId('tk-nav-about');
    el.banner = byId('tk-banner');
    el.bannerText = byId('tk-banner-text');
    el.bannerLink = byId('tk-banner-link');
    el.main = byId('tk-main');
    el.toasts = byId('tk-toasts');

    el.viewRecord = byId('tk-view-record');
    el.viewReview = byId('tk-view-review');
    el.viewLibrary = byId('tk-view-library');
    el.viewAbout = byId('tk-view-about');

    el.guide = byId('tk-guide');
    el.guideDismiss = byId('tk-guide-dismiss');

    el.setup = byId('tk-setup');
    el.srcScreen = byId('tk-src-screen');
    el.srcCamera = byId('tk-src-camera');
    el.srcMic = byId('tk-src-mic');
    el.cameraField = byId('tk-camera-field');
    el.cameraSelect = byId('tk-camera-select');
    el.micField = byId('tk-mic-field');
    el.micSelect = byId('tk-mic-select');
    el.bubbleSize = byId('tk-bubble-size');
    el.bubbleSizeValue = byId('tk-bubble-size-value');
    el.bubbleColor = byId('tk-bubble-color');
    el.bubbleColorField = byId('tk-bubble-color-field');
    el.captionsLanguage = byId('tk-captions-language');
    el.bubbleShape = byId('tk-bubble-shape');
    el.bubbleShapeCircle = byId('tk-bubble-shape-circle');
    el.bubbleShapeRect = byId('tk-bubble-shape-rect');
    el.corners = byId('tk-corners');
    el.cornerInputs = [byId('tk-corner-tl'), byId('tk-corner-tr'), byId('tk-corner-bl'), byId('tk-corner-br')];
    for (var c = 0; c < el.cornerInputs.length; c++) {
      if (el.cornerInputs[c] && el.cornerInputs[c].checked) defaultCorner = el.cornerInputs[c].value;
    }
    el.setupNote = byId('tk-setup-note');
    el.recordHint = byId('tk-record-hint');
    el.recordLive = byId('tk-record-live');
    liveText = el.recordLive ? el.recordLive.textContent : '';
    el.captionsFileNote = byId('tk-captions-file-note');
    el.recordBtn = byId('tk-record-btn');
    el.countdown = byId('tk-countdown');
    el.countdownNum = byId('tk-countdown-num');

    el.recbar = byId('tk-recbar');
    el.recStatus = byId('tk-rec-status');
    el.recTimer = byId('tk-rec-timer');
    el.pauseBtn = byId('tk-pause-btn');
    el.resumeBtn = byId('tk-resume-btn');
    el.stopBtn = byId('tk-stop-btn');

    el.reviewName = byId('tk-review-name');
    el.reviewNew = byId('tk-review-new');
    el.player = byId('tk-player');

    el.mode = byId('tk-record-mode');
    el.importVideo = byId('tk-import-video');
    el.cutList = byId('tk-cut-list');
    el.undo = byId('tk-undo');
    el.redo = byId('tk-redo');
    el.trim = byId('tk-trim');
    el.trimKept = byId('tk-trim-kept');
    el.trimCut = byId('tk-trim-cut');
    el.trimPlayhead = byId('tk-trim-playhead');
    el.trimStart = byId('tk-trim-start');
    el.trimEnd = byId('tk-trim-end');
    el.trimStartTime = byId('tk-trim-start-time');
    el.trimEndTime = byId('tk-trim-end-time');
    el.trimLength = byId('tk-trim-length');
    el.trimReset = byId('tk-trim-reset');
    el.trimNote = byId('tk-trim-note');
    el.cutToggle = byId('tk-cut-toggle');
    el.cutControls = byId('tk-cut-controls');
    el.cutStart = byId('tk-cut-start');
    el.cutStartTime = byId('tk-cut-start-time');
    el.cutEnd = byId('tk-cut-end');
    el.cutEndTime = byId('tk-cut-end-time');
    el.cutApply = byId('tk-cut-apply');
    el.cutClear = byId('tk-cut-clear');
    el.cutNote = byId('tk-cut-note');

    el.saveOptions = byId('tk-save-options');
    el.optBurn = byId('tk-opt-burn');
    el.optBurnWrap = byId('tk-opt-burn-wrap');
    el.optBurnNote = byId('tk-opt-burn-note');
    el.optSize = byId('tk-opt-size');
    el.optSizeOriginal = byId('tk-opt-size-original');
    el.optSizeVertical = byId('tk-opt-size-vertical');
    el.optSizeNote = byId('tk-opt-size-note');
    el.optSlowNote = byId('tk-opt-slow-note');
    el.saveDownload = byId('tk-save-download');
    el.saveCloud = byId('tk-save-cloud');
    el.cloud = byId('tk-cloud');
    el.cloudFolderName = byId('tk-cloud-folder-name');
    el.cloudChoose = byId('tk-cloud-choose');
    el.exportProgress = byId('tk-export-progress');
    el.exportFill = byId('tk-export-progress-fill');
    el.exportStatus = byId('tk-export-status');
    el.saveNote = byId('tk-save-note');

    el.captions = byId('tk-captions');
    el.captionsSize = byId('tk-captions-size');
    el.captionsLong = byId('tk-captions-long-warning');
    el.captionsAdd = byId('tk-captions-add');
    el.captionsToggleWrap = byId('tk-captions-toggle-wrap');
    el.captionsToggle = byId('tk-captions-toggle');
    el.captionsProgress = byId('tk-captions-progress');
    el.captionsFill = byId('tk-captions-progress-fill');
    el.captionsStatus = byId('tk-captions-status');
    el.captionsEmpty = byId('tk-captions-empty');
    el.cueList = byId('tk-cue-list');
    el.captionsDownload = byId('tk-captions-download');
    el.transcriptTools = byId('tk-transcript-tools');
    el.transcriptSearch = byId('tk-transcript-search');
    el.transcriptCount = byId('tk-transcript-count');
    el.transcriptCopy = byId('tk-transcript-copy');
    el.transcriptTxt = byId('tk-transcript-txt');
    el.transcriptSrt = byId('tk-transcript-srt');

    el.bubbleSource = byId('tk-bubble-source');
    el.bubbleCamera = byId('tk-bubble-camera');
    el.bubbleFileRadio = byId('tk-bubble-file');
    el.bubbleFileField = byId('tk-bubble-file-field');
    el.bubbleFileInput = byId('tk-bubble-file-input');
    el.bubbleFileName = byId('tk-bubble-file-name');
    el.bubbleSound = byId('tk-bubble-sound');

    el.libraryNote = byId('tk-library-note');
    el.libraryList = byId('tk-library-list');
    el.libraryEmpty = byId('tk-library-empty');
    el.libraryEmptyRecord = byId('tk-library-empty-record');
    el.confirm = byId('tk-confirm');
    el.confirmText = byId('tk-confirm-text');
    el.confirmCancel = byId('tk-confirm-cancel');
    el.confirmOk = byId('tk-confirm-ok');
  }

  function setHidden(node, hidden) {
    if (node) node.hidden = !!hidden;
  }

  function on(node, type, fn) {
    if (node && typeof node.addEventListener === 'function') node.addEventListener(type, fn);
  }

  function emitToast(kind, text) {
    Takes.bus.emit('toast', { kind: kind, text: text });
  }

  /** Read one remembered value. Storage can throw on some origins; then nothing is remembered. */
  function recall(key) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function remember(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) { /* not remembered this time; nothing else depends on it */ }
  }

  function ordinal(n) {
    var tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + 'th';
    var last = n % 10;
    return n + (last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th');
  }

  /** 'October 4th, 9:31 AM', in the computer's local time. */
  function formatWhen(ms) {
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var hour12 = h % 12 === 0 ? 12 : h % 12;
    return MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()) + ', ' +
      hour12 + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  function formatSize(bytes) {
    var b = Number(bytes);
    if (!isFinite(b) || b <= 0) return '0 KB';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** 'October 4th, 9:31 AM · 1:23 · 4.2 MB' */
  function describe(recording) {
    var parts = [];
    var when = formatWhen(recording.createdAt);
    if (when) parts.push(when);
    parts.push(Takes.util.formatTime((Number(recording.durationMs) || 0) / 1000));
    if (recording.blob) parts.push(formatSize(recording.blob.size));
    return parts.join(' · ');
  }

  function liveVideoTrack(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return null;
    var tracks = stream.getVideoTracks();
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i] && tracks[i].readyState !== 'ended') return tracks[i];
    }
    return null;
  }

  // ================================================================ 2. toasts

  function removeToast(entry) {
    var i = toasts.indexOf(entry);
    if (i !== -1) toasts.splice(i, 1);
    root.clearTimeout(entry.timer);
    if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
  }

  function dismissToast(entry) {
    if (entry.leaving) return;
    entry.leaving = true;
    root.clearTimeout(entry.timer);
    entry.node.classList.add('tk-is-leaving');
    entry.timer = root.setTimeout(function () { removeToast(entry); }, TOAST_LEAVE_MS);
  }

  function armToast(entry) {
    root.clearTimeout(entry.timer);
    entry.timer = root.setTimeout(function () { dismissToast(entry); },
      entry.kind === 'error' ? TOAST_ERROR_MS : TOAST_INFO_MS);
  }

  function showToast(payload) {
    if (!payload || !el.toasts) return;
    var text = payload.text == null ? '' : String(payload.text);
    if (!text) return;
    var kind = payload.kind === 'error' ? 'error' : 'info';

    // The same words already on screen: keep the one toast and give it its full time again.
    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].text === text && !toasts[i].leaving) { armToast(toasts[i]); return; }
    }
    // Never more than three: the oldest makes room at once.
    while (toasts.length >= MAX_TOASTS) removeToast(toasts[0]);

    var doc = root.document;
    var node = doc.createElement('div');
    node.className = 'tk-toast ' + (kind === 'error' ? 'tk-toast-error' : 'tk-toast-info');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var p = doc.createElement('p');
    p.className = 'tk-toast-text';
    p.textContent = text;
    var close = doc.createElement('button');
    close.type = 'button';
    close.className = 'tk-toast-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    node.appendChild(p);
    node.appendChild(close);

    var entry = { node: node, text: text, kind: kind, timer: null, leaving: false };
    on(close, 'click', function () { dismissToast(entry); });
    toasts.push(entry);
    el.toasts.appendChild(node);
    armToast(entry);
  }

  function initToasts() {
    Takes.bus.on('toast', showToast);
  }

  // ================================================================ 3. capabilities and the product name

  function writeName() {
    var name = Takes.PRODUCT_NAME;
    var doc = root.document;
    var slots = doc.querySelectorAll('.tk-name');
    for (var i = 0; i < slots.length; i++) slots[i].textContent = name;
    var title = String(doc.title || '');
    var colon = title.indexOf(':');
    doc.title = colon === -1 ? name : name + title.slice(colon);
    baseTitle = doc.title;
  }

  /** The tab title says when a take is running, so it can be found among other tabs. */
  function writeTitle(state) {
    var name = Takes.PRODUCT_NAME;
    root.document.title = state === 'recording' ? '\u25cf Recording \u2014 ' + name
      : state === 'paused' ? 'Paused \u2014 ' + name
        : baseTitle;
  }

  function initCaps() {
    var caps = Takes.detectCaps();
    var message = '';
    if (!caps.userMedia) {
      message = 'This browser cannot record the screen. Use Chrome or Edge on a computer.';
    } else if (!caps.mp4) {
      message = 'This browser cannot record MP4 video. Please update Chrome or Edge.';
    }
    capsOk = message === '';
    if (!capsOk) {
      el.bannerText.textContent = message;
      // The same recorder is online; a browser that cannot run this file is offered that page.
      setHidden(el.bannerLink, false);
      setHidden(el.banner, false);
    }
  }

  // ================================================================ 4. first-run guide

  function hideGuide(forGood) {
    setHidden(el.guide, true);
    if (forGood) remember(KEY_GUIDE, true);
  }

  function initGuide() {
    if (recall(KEY_GUIDE) === true) setHidden(el.guide, true);
    on(el.guideDismiss, 'click', function () {
      hideGuide(true);
      if (el.recordBtn && !el.recordBtn.disabled) el.recordBtn.focus();
    });
  }

  // ================================================================ 5. views

  function viewNode(view) {
    return view === 'record' ? el.viewRecord
      : view === 'review' ? el.viewReview
        : view === 'library' ? el.viewLibrary
          : el.viewAbout;
  }

  function navNode(view) {
    return view === 'record' ? el.navRecord
      : view === 'library' ? el.navLibrary
        : view === 'about' ? el.navAbout
          : null;
  }

  /** Switch views by the hidden attribute. moveFocus sends the keyboard to the main area. */
  function show(view, moveFocus) {
    if (VIEWS.indexOf(view) === -1 || !started) return;
    var changed = view !== currentView;
    for (var i = 0; i < VIEWS.length; i++) {
      setHidden(viewNode(VIEWS[i]), VIEWS[i] !== view);
      var nav = navNode(VIEWS[i]);
      if (!nav) continue;
      if (VIEWS[i] === view) {
        nav.classList.add('tk-is-active');
        nav.setAttribute('aria-current', 'page');
      } else {
        nav.classList.remove('tk-is-active');
        nav.removeAttribute('aria-current');
      }
    }
    if (changed && currentView === 'review' && el.player) {
      try { el.player.pause(); } catch (err) { /* nothing was playing */ }
    }
    currentView = view;
    if (view === 'library') renderLibrary();
    if (moveFocus && el.main) {
      try { el.main.focus({ preventScroll: true }); } catch (err) { /* focus is a nicety */ }
      try { root.scrollTo(0, 0); } catch (err2) { /* not scrollable here */ }
    }
  }

  function initViews() {
    var navs = [el.navRecord, el.navLibrary, el.navAbout];
    navs.forEach(function (nav) {
      on(nav, 'click', function () { show(nav.getAttribute('data-view'), true); });
    });
    on(el.reviewNew, 'click', function () { show('record', true); });
    on(el.libraryEmptyRecord, 'click', function () { show('record', true); });
  }

  // ================================================================ 6. record setup

  function chosenCorner() {
    for (var i = 0; i < el.cornerInputs.length; i++) {
      if (el.cornerInputs[i] && el.cornerInputs[i].checked) return el.cornerInputs[i].value;
    }
    return defaultCorner;
  }

  function readSetup() {
    return {
      screen: !!el.srcScreen.checked,
      camera: !!el.srcCamera.checked,
      mic: !!el.srcMic.checked,
      cameraId: el.srcCamera.checked ? wantedDevice(el.cameraSelect, 'cameraId', 'cameraLabel').id : '',
      cameraLabel: el.srcCamera.checked ? wantedDevice(el.cameraSelect, 'cameraId', 'cameraLabel').label : '',
      micId: el.srcMic.checked ? wantedDevice(el.micSelect, 'micId', 'micLabel').id : '',
      micLabel: el.srcMic.checked ? wantedDevice(el.micSelect, 'micId', 'micLabel').label : '',
      corner: chosenCorner(),
      color: el.bubbleColor.value,
      scale: Number(el.bubbleSize.value) / 100,
      shape: el.bubbleShapeRect && el.bubbleShapeRect.checked ? 'rectangle' : 'circle',
      // The bubble can show a video file in place of the live camera; it still needs the Camera chip on.
      bubbleFromFile: !!el.srcScreen.checked && !!el.srcCamera.checked && !!el.bubbleFileRadio.checked,
      bubbleSound: !!el.bubbleSound.checked
    };
  }

  var bubbleFile = null;    // the video chosen for the bubble; a File cannot be remembered across a reload
  var bubbleProbe = 0;      // so a slow look at an earlier file never overwrites a newer choice

  function showBubbleFile(text) {
    el.bubbleFileName.textContent = text || 'No video chosen yet';
  }

  /** Take the file the person picked: check it really is a video this browser can open, then show its name and length. */
  function onBubbleFilePicked() {
    var file = el.bubbleFileInput.files && el.bubbleFileInput.files[0];
    if (!file) return;
    var probe = ++bubbleProbe;
    var refuse = function () {
      if (probe !== bubbleProbe) return;
      bubbleFile = null;
      showBubbleFile('');
      try { el.bubbleFileInput.value = ''; } catch (err) { /* nothing to clear */ }
      emitToast('error', 'That file could not be opened as a video. Choose an MP4 or WebM video.');
    };
    if (file.type && file.type.indexOf('video/') !== 0) { refuse(); return; }

    var url = '';
    var video = null;
    var timer = null;
    var done = false;
    var finish = function (ok) {
      if (done) return;
      done = true;
      root.clearTimeout(timer);
      var length = video ? Number(video.duration) : NaN;
      if (video) { try { video.removeAttribute('src'); video.load(); } catch (err) { /* gone */ } }
      if (url) { try { root.URL.revokeObjectURL(url); } catch (err2) { /* gone */ } }
      if (!ok) { refuse(); return; }
      if (probe !== bubbleProbe) return;
      bubbleFile = file;
      showBubbleFile(file.name + (isFinite(length) && length > 0 ? ' \u00b7 ' + time(length) : ''));
    };
    try {
      url = root.URL.createObjectURL(file);
      video = root.document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      on(video, 'loadedmetadata', function () { finish(video.videoWidth > 0); });
      on(video, 'error', function () { finish(false); });
      timer = root.setTimeout(function () { finish(false); }, 8000);
      video.src = url;
    } catch (err) {
      finish(false);
    }
  }

  function savePrefs() {
    var s = readSetup();
    var old = recall(KEY_PREFS) || {};
    var camera = chosenDevice(el.cameraSelect, old.cameraId, old.cameraLabel);
    var mic = chosenDevice(el.micSelect, old.micId, old.micLabel);
    remember(KEY_PREFS, {
      screen: s.screen,
      camera: s.camera,
      mic: s.mic,
      cameraId: camera.id,
      cameraLabel: camera.label,
      micId: mic.id,
      micLabel: mic.label,
      corner: s.corner,
      shape: s.shape,
      color: s.color,
      scale: s.scale,
      bubble: el.bubbleFileRadio.checked ? 'file' : 'camera',
      bubbleSound: s.bubbleSound
    });
  }

  /**
   * The device to remember. Before the first permission the picker holds only its default line,
   * so an empty value there says nothing and the remembered device is kept.
   */
  function chosenDevice(select, rememberedId, rememberedLabel) {
    if (select.value) return { id: select.value, label: trueLabel(select) };
    if (select.getAttribute('data-picked') === 'yes') return { id: '', label: '' }; // the first line was picked on purpose
    return {
      id: typeof rememberedId === 'string' ? rememberedId : '',
      label: typeof rememberedLabel === 'string' ? rememberedLabel : ''
    };
  }

  /** The chosen device's own name, without the "(virtual)" or "(infrared)" the picker adds for the eye. */
  function trueLabel(select) {
    var option = select.options[select.selectedIndex];
    if (!option || !option.value) return '';
    return option.getAttribute('data-label') || option.textContent || '';
  }

  /**
   * The device to ask for: what the picker shows, or, while the list cannot be read yet, what was remembered.
   * Its name travels with its id, because the browser hands out new ids to a page opened as a file.
   */
  function wantedDevice(select, idKey, labelKey) {
    var old = recall(KEY_PREFS) || {};
    return chosenDevice(select, old[idKey], old[labelKey]);
  }

  /** Bring the setup panel, its note and the Record button in line with what is chosen and what is happening. */
  function syncSetup() {
    var s = readSetup();
    var busy = starting || recState !== 'idle';
    byId('tk-hero-line').textContent = s.screen ? 'Record your screen. Keep your money.' : 'Your camera. Your story.';
    el.mode.value = s.screen ? (s.camera ? 'both' : 'screen') : 'camera';
    setHidden(el.bubbleSource, !(s.screen && s.camera));
    setHidden(el.bubbleFileField, !s.bubbleFromFile);
    setHidden(el.cameraField, !s.camera || s.bubbleFromFile); // a video file needs no camera
    setHidden(el.micField, !s.mic);
    setHidden(el.corners, !(s.screen && s.camera));
    el.bubbleSizeValue.textContent = el.bubbleSize.value + '%';
    setHidden(el.bubbleColorField, !(s.screen && s.camera));
    setHidden(el.bubbleShape, !(s.screen && s.camera)); // the shape matters exactly when the corner does

    var controls = el.setup ? el.setup.elements : [];
    for (var i = 0; i < controls.length; i++) controls[i].disabled = busy || !capsOk;

    var nothing = !s.screen && !s.camera;
    if (capsOk && nothing) {
      el.setupNote.textContent = 'Pick the screen or the camera, so there is a picture to record.';
      setHidden(el.setupNote, false);
    } else {
      setHidden(el.setupNote, true);
    }

    el.recordBtn.disabled = busy || nothing || !capsOk || (s.screen && !Takes.state.caps.displayMedia);
    byId('tk-record-hint').textContent = s.screen
      ? 'Choose a screen, window or tab. Recording starts after a 3-second countdown.'
      : 'Only your camera' + (s.mic ? ' and microphone' : '') + '. No screen is shared. Recording starts after a 3-second countdown.';
    if (starting) el.recordBtn.classList.add('tk-is-busy');
    else el.recordBtn.classList.remove('tk-is-busy');
  }

  /** Real webcams first, then virtual cameras, then the infrared one a laptop uses for face sign-in. */
  function cameraRank(device) {
    return device && device.infrared ? 2 : device && device.virtual ? 1 : 0;
  }

  function fillSelect(select, devices, firstLabel, wanted) {
    var doc = root.document;
    var list = [];
    for (var n = 0; n < devices.length; n++) if (devices[n] && devices[n].deviceId) list.push(devices[n]);
    // A stable sort by kind; within a kind the browser's own order is kept.
    list = list.map(function (d, at) { return { d: d, at: at }; })
      .sort(function (a, b) { return cameraRank(a.d) - cameraRank(b.d) || a.at - b.at; })
      .map(function (x) { return x.d; });
    var wantedId = wanted && wanted.id ? wanted.id : '';
    var wantedLabel = wanted && wanted.label ? String(wanted.label) : '';
    while (select.firstChild) select.removeChild(select.firstChild);
    var first = doc.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);
    // Before the first permission the browser hides the ids; a line with no id would only repeat the first one.
    var byId = '';
    var byLabel = '';
    var byLooseLabel = '';
    for (var i = 0; i < list.length; i++) {
      var label = String(list[i].label || '');
      var option = doc.createElement('option');
      option.value = list[i].deviceId;
      option.setAttribute('data-label', label);
      option.textContent = label + (list[i].infrared ? ' (infrared)' : list[i].virtual ? ' (virtual)' : '');
      select.appendChild(option);
      if (wantedId && list[i].deviceId === wantedId) byId = list[i].deviceId;
      if (wantedLabel && !byLabel && label === wantedLabel) byLabel = list[i].deviceId;
      if (wantedLabel && !byLooseLabel && label.toLowerCase() === wantedLabel.toLowerCase()) byLooseLabel = list[i].deviceId;
    }
    // The id first; then the name, since a page opened as a file gets new ids on every visit.
    select.value = byId || byLabel || byLooseLabel || '';
  }

  /** Fill both device pickers. Asked for again when a device is plugged in and after the first permission. */
  function refreshDevices(usedCameraId) {
    if (!Takes.capture || typeof Takes.capture.listDevices !== 'function') return;
    var seq = ++deviceSeq;
    var wantCamera = wantedDevice(el.cameraSelect, 'cameraId', 'cameraLabel');
    var wantMic = wantedDevice(el.micSelect, 'micId', 'micLabel');
    // The camera a recording really opened (the real webcam, when the browser's own default was a virtual one)
    // becomes the choice, so the next recording and the next visit start on it.
    if (usedCameraId) wantCamera = { id: usedCameraId, label: '' };
    Takes.capture.listDevices().then(function (devices) {
      if (seq !== deviceSeq || !devices) return;
      var cameraBefore = el.cameraSelect.value;
      fillSelect(el.cameraSelect, devices.cameras || [], 'Automatic (your webcam)', wantCamera);
      fillSelect(el.micSelect, devices.mics || [], 'Default microphone', wantMic);
      if (usedCameraId || (el.cameraSelect.value && el.cameraSelect.value !== cameraBefore)) savePrefs();
    }, function () { /* listDevices never rejects; nothing to do */ });
  }

  function initSetup() {
    var prefs = recall(KEY_PREFS);
    if (prefs && typeof prefs === 'object') {
      if (typeof prefs.screen === 'boolean') el.srcScreen.checked = prefs.screen;
      if (typeof prefs.camera === 'boolean') el.srcCamera.checked = prefs.camera;
      if (typeof prefs.mic === 'boolean') el.srcMic.checked = prefs.mic;
      if (prefs.bubble === 'file') el.bubbleFileRadio.checked = true;
      if (typeof prefs.bubbleSound === 'boolean') el.bubbleSound.checked = prefs.bubbleSound;
      el.bubbleColor.value = Takes.compositor.borderColor(prefs.color);
      el.bubbleSize.value = String(Math.round(Takes.compositor.bubbleScale(prefs.scale) * 100));
      if (prefs.shape === 'rectangle') el.bubbleShapeRect.checked = true;
      else if (prefs.shape === 'circle') el.bubbleShapeCircle.checked = true;
      if (CORNERS.indexOf(prefs.corner) !== -1) {
        for (var i = 0; i < el.cornerInputs.length; i++) {
          el.cornerInputs[i].checked = el.cornerInputs[i].value === prefs.corner;
        }
      }
    }

    // Only a choice the person made in the picker can clear a remembered device; a list that merely
    // lacks it (new ids on a new visit, a camera not plugged in yet) never does.
    [el.cameraSelect, el.micSelect].forEach(function (select) {
      on(select, 'change', function () { select.setAttribute('data-picked', 'yes'); });
    });
    on(el.mode, 'change', function () {
      el.srcScreen.checked = el.mode.value !== 'camera';
      el.srcCamera.checked = el.mode.value !== 'screen';
      if (el.mode.value === 'camera') el.bubbleCamera.checked = true;
    });
    showBubbleFile('');
    on(el.bubbleFileInput, 'change', onBubbleFilePicked);
    on(el.bubbleSize, 'input', function () { el.bubbleSizeValue.textContent = el.bubbleSize.value + '%'; });
    on(el.setup, 'change', function () { savePrefs(); syncSetup(); });
    on(el.setup, 'submit', function (event) { event.preventDefault(); });

    var md = null;
    try { md = root.navigator && root.navigator.mediaDevices ? root.navigator.mediaDevices : null; } catch (err) { md = null; }
    on(md, 'devicechange', function () { refreshDevices(); });

    syncSetup();
    refreshDevices();
  }

  // ================================================================ 7. recording flow

  /** Close everything a run opened. Safe to call more than once. */
  function endRun(run) {
    Takes.preview.stop();
    var cameraPreview = byId('tk-camera-preview');
    cameraPreview.pause();
    cameraPreview.srcObject = null;
    setHidden(cameraPreview, true);
    setHidden(byId('tk-hero'), false);
    try { Takes.compositor.stop(); } catch (err) { /* already stopped */ }
    try { Takes.capture.stop(); } catch (err2) { /* already stopped */ }
    if (!run || activeRun === run) activeRun = null;
    starting = false;
    syncSetup();
  }

  /** The picture source went away: finish the take exactly as if Stop was pressed. */
  function stopBecauseSourceEnded(run) {
    if (!run || run !== activeRun || run.ending) return;
    run.ending = true;
    if (!run.recorderStarted) {
      run.aborted = true; // still setting up; the start chain cleans up when it gets there
      return;
    }
    if (Takes.recorder.getState() === 'countdown') {
      emitToast('info', 'Sharing stopped before the recording began, so nothing was recorded. Press Record to try again.');
    }
    Takes.recorder.stop();
  }

  function onCaptureEnded(payload) {
    var run = activeRun;
    if (!run) return;
    var reason = payload && payload.reason;
    if (reason === 'device-lost') {
      var streams = run.streams;
      var stillPicture = !streams || !!liveVideoTrack(streams.screenStream) || !!liveVideoTrack(streams.cameraStream);
      if (stillPicture) {
        // The camera or the microphone dropped out but there is still a picture: keep the take going and say so.
        var cameraGone = run.want.camera && (!streams || (streams.cameraStream && !liveVideoTrack(streams.cameraStream)));
        emitToast('error', cameraGone
          ? 'The camera stopped working. This recording carries on without the camera.'
          : 'The microphone stopped working. This recording carries on without your voice.');
        return;
      }
    }
    stopBecauseSourceEnded(run);
  }

  function cancelled() {
    var err = new Error('The recording was stopped before it began.');
    err.code = 'cancelled';
    return err;
  }

  function onRecordClick() {
    if (starting || activeRun || !capsOk || Takes.recorder.getState() !== 'idle') return;
    var want = readSetup();
    if (!want.screen && !want.camera) return;
    if (captionRunId !== null) {
      // Making captions pauses the page in bursts, which would make a recording stutter.
      emitToast('info', 'Captions are still being made. Give it a moment, then press Record.');
      return;
    }

    if (want.bubbleFromFile && !bubbleFile) {
      emitToast('info', 'Choose a video for the bubble first, or switch back to My camera.');
      return;
    }
    // With a video file in the bubble the real camera is never opened.
    want.camera = want.camera && !want.bubbleFromFile;

    // The screen picker needs this very click, so capture.start is the first thing that happens. No await before it.
    var opening;
    try {
      opening = Takes.capture.start({
        screen: want.screen,
        camera: want.camera,
        mic: want.mic,
        cameraId: want.cameraId,
        cameraLabel: want.cameraLabel,
        micId: want.micId,
        micLabel: want.micLabel,
        bubbleFile: want.bubbleFromFile ? bubbleFile : null,
        bubbleSound: want.bubbleSound
      });
    } catch (err) {
      opening = Promise.reject(err);
    }

    var run = { want: want, streams: null, aborted: false, ending: false, recorderStarted: false, done: false };
    activeRun = run;
    starting = true;
    syncSetup();

    Promise.resolve(opening).then(function (streams) {
      run.streams = streams || {};
      if (run.aborted || activeRun !== run) throw cancelled();
      // Permission was just given, so the device names are readable now; and the camera that was really used is kept.
      var used = typeof run.streams.cameraIdUsed === 'string' ? run.streams.cameraIdUsed : '';
      refreshDevices(used && used !== el.cameraSelect.value ? used : '');
      return Takes.compositor.start({
        screenStream: run.streams.screenStream || null,
        cameraStream: run.streams.cameraStream || null,
        // A camera is shown as in a mirror; a video file must not be flipped (its words would read backwards).
        bubble: { corner: want.corner, size: 'medium', shape: want.shape, color: want.color, scale: want.scale, mirror: !want.bubbleFromFile }
      });
    }).then(function (videoStream) {
      if (run.aborted || activeRun !== run) throw cancelled();
      if (!liveVideoTrack(videoStream)) throw cancelled();
      var screenTrack = liveVideoTrack(run.streams.screenStream);
      var surface = screenTrack && screenTrack.getSettings ? screenTrack.getSettings().displaySurface : '';
      Takes.preview.start(videoStream, surface);
      setHidden(byId('tk-hero'), true);
      if (currentView !== 'record') show('record', false);
      Takes.recorder.start(videoStream, run.streams.audioTrack || null);
      if (Takes.recorder.getState() !== 'countdown') throw new Error('the recorder did not start');
      run.recorderStarted = true;
      starting = false;
      syncSetup();
    }).catch(function (err) {
      if (run.recorderStarted) return; // the recorder owns the ending from here on
      var silent = err && (err.toasted === true || err.code === 'cancelled');
      if (run.aborted && !(err && err.toasted === true)) {
        emitToast('info', 'Sharing stopped before the recording began, so nothing was recorded. Press Record to try again.');
      } else if (!silent) {
        emitToast('error', 'The recording could not start. Press Record to try again.');
      }
      endRun(run);
      if (currentView !== 'record') show('record', false);
    });
  }

  /** 'Take, October 3rd, 8:59 PM', with ' (2)', ' (3)' and so on when the library already has that name. */
  function newTakeName(createdAt) {
    var when = new Date(createdAt);
    var base = typeof Takes.util.makeTakeName === 'function'
      ? Takes.util.makeTakeName(when)
      : Takes.util.makeFileName(when, 'mp4').replace(/\.mp4$/, '');
    var taken = {};
    var list = Takes.state.recordings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && typeof list[i].name === 'string') taken['$' + list[i].name.toLowerCase()] = true;
    }
    if (!taken['$' + base.toLowerCase()]) return base;
    var n = 2;
    while (taken['$' + (base + ' (' + n + ')').toLowerCase()]) n++;
    return base + ' (' + n + ')';
  }

  function buildRecording(payload) {
    var name = newTakeName(payload.createdAt);
    return {
      id: payload.id,
      name: name,
      titleSource: 'automatic',
      titleAutoName: name,
      titleFallbackName: name,
      blob: payload.blob,
      mimeType: payload.mimeType,
      durationMs: payload.durationMs,
      createdAt: payload.createdAt,
      edits: { trimStart: 0, trimEnd: null, cut: null },
      cues: []
    };
  }

  function onRecordDone(payload) {
    if (!payload || !payload.blob) return;
    var run = activeRun;
    if (run) run.done = true;
    endRun(run);

    if (!(Number(payload.durationMs) >= 1000)) {
      // Too short to trim or watch: say so and stay ready to record again.
      emitToast('info', 'That recording was under a second, so it was not kept. Press Record to try again.');
      if (currentView !== 'record') show('record', false);
      return;
    }

    var recording = buildRecording(payload);
    sessionTakes[recording.id] = true;
    hideGuide(true);

    // Storing is never waited for; the library handles its own failures and says so itself.
    if (Takes.library && typeof Takes.library.add === 'function') {
      try {
        Takes.library.add(recording).then(null, function () { /* already handled inside the library */ });
      } catch (err) { /* the take is still open in Review */ }
    }

    openReview(recording);
  }

  function importVideo(file) {
    if (!file || starting || activeRun || saving) return;
    if (!/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      emitToast('error', 'Choose an MP4, WebM or MOV video.'); return;
    }
    var video = root.document.createElement('video');
    var url = root.URL.createObjectURL(file);
    var done = false;
    function finish(error) {
      if (done) return;
      done = true; root.clearTimeout(timer);
      var duration = video.duration;
      video.removeAttribute('src'); video.load(); root.URL.revokeObjectURL(url);
      el.importVideo.value = '';
      if (error) { emitToast('error', error); return; }
      var recording = buildRecording({ id: root.crypto.randomUUID(), blob: file,
        mimeType: file.type || (/\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4'),
        durationMs: duration * 1000, createdAt: Date.now() });
      recording.name = file.name.replace(/\.[^.]+$/, '');
      recording.titleSource = 'import';
      Takes.library.add(recording).catch(function () {});
      openReview(recording);
    }
    var timer = root.setTimeout(function () { finish('The video could not be read. Try a playable MP4 or WebM file.'); }, 15000);
    video.onloadedmetadata = function () {
      if (!(isFinite(video.duration) && video.duration >= 0.5 && video.videoWidth > 0)) {
        finish('This video has no usable picture or duration. Convert it to MP4 first.'); return;
      }
      finish();
    };
    video.onerror = function () { finish('This browser cannot decode that video. Try an MP4 with H.264 video.'); };
    video.preload = 'metadata'; video.src = url;
  }

  function initRecording() {
    on(el.recordBtn, 'click', onRecordClick);
    on(byId('tk-open-preview'), 'click', Takes.preview.open);
    Takes.bus.on('bubble:changed', function (layout) {
      var percent = String(Math.round(layout.scale * 100));
      if (el.bubbleColor.value !== layout.color || el.bubbleSize.value !== percent) {
        el.bubbleColor.value = layout.color; el.bubbleSize.value = percent; el.bubbleSizeValue.textContent = percent + '%'; savePrefs();
      }
    });
    on(el.importVideo, 'change', function () { importVideo(el.importVideo.files[0]); });
    Takes.bus.on('capture:ended', onCaptureEnded);
    Takes.bus.on('record:done', onRecordDone);
  }

  // ================================================================ 8. recording bar

  function updateTimer() {
    el.recTimer.textContent = Takes.util.formatTime(Takes.recorder.elapsed());
  }

  function callCapture(name) {
    try {
      if (Takes.capture && typeof Takes.capture[name] === 'function') Takes.capture[name]();
    } catch (err) { /* the bubble is a nicety; the take carries on */ }
  }

  function onRecordState(payload) {
    var state = payload && typeof payload.state === 'string' ? payload.state : 'idle';
    var before = recState;
    recState = state;
    // A video file in the bubble starts from its first frame with the take, and holds still while the take is paused.
    if (state === 'recording' && before === 'countdown') callCapture('restartBubble');
    else if (state === 'recording' && before === 'paused') callCapture('resumeBubble');
    else if (state === 'paused') callCapture('pauseBubble');
    // The countdown's last beat ('countdown' with 0 seconds left) comes a moment BEFORE recording starts, so the
    // page can repaint: from that beat on it already looks exactly as it does while recording, with no numeral
    // and no dimming, and so the take's first frame never shows the countdown.
    var look = state === 'countdown' && payload.secondsLeft === 0 ? 'recording' : state;

    for (var key in STATE_CLASSES) {
      if (!Object.prototype.hasOwnProperty.call(STATE_CLASSES, key)) continue;
      if (key === look) el.body.classList.add(STATE_CLASSES[key]);
      else el.body.classList.remove(STATE_CLASSES[key]);
    }

    var idle = state === 'idle';
    setHidden(el.recbar, idle);
    setHidden(el.countdown, look !== 'countdown');
    if (look === 'countdown' && typeof payload.secondsLeft === 'number') {
      el.countdownNum.textContent = String(payload.secondsLeft);
    }
    if (!idle) el.recStatus.textContent = STATUS_TEXT[look] || '';
    var live = state === 'countdown' || state === 'recording' || state === 'paused';
    setHidden(el.recordHint, live);
    el.recordLive.textContent = state === 'paused' ? 'Paused. Press Resume to carry on, or Stop to finish.'
      : activeRun && !activeRun.want.screen ? 'Recording your camera. Press Pause or Stop below.' : liveText;
    setHidden(el.recordLive, !live);
    writeTitle(look);

    // Pause and Resume trade places; neither does anything during the countdown or while the file is finished.
    var hadFocus = root.document.activeElement;
    setHidden(el.pauseBtn, state === 'paused');
    setHidden(el.resumeBtn, state !== 'paused');
    el.pauseBtn.disabled = look !== 'recording';
    el.stopBtn.disabled = state === 'processing' || idle;
    if (state === 'paused' && hadFocus === el.pauseBtn) el.resumeBtn.focus();
    if (state === 'recording' && hadFocus === el.resumeBtn) el.pauseBtn.focus();

    if (idle) {
      if (timerId !== null) { root.clearInterval(timerId); timerId = null; }
      el.recTimer.textContent = '0:00';
      // A countdown that was cancelled, or a take that failed, ends here with no record:done.
      var run = activeRun;
      if (run && run.recorderStarted) {
        endRun(run);
        if (!run.done && currentView !== 'record') show('record', false);
      }
    } else {
      updateTimer();
      // Display only. A hidden tab slows this down, which changes nothing in the recording.
      if (timerId === null) timerId = root.setInterval(updateTimer, TIMER_MS);
    }
    syncSetup();
  }

  function initRecbar() {
    Takes.bus.on('record:state', onRecordState);
    on(el.pauseBtn, 'click', function () { Takes.recorder.pause(); });
    on(el.resumeBtn, 'click', function () { Takes.recorder.resume(); });
    on(el.stopBtn, 'click', function () { Takes.recorder.stop(); });

    // The one native prompt: closing the tab mid-take would lose the take.
    on(root, 'beforeunload', function (event) {
      if (recState === 'idle') return;
      event.preventDefault();
      event.returnValue = 'A recording is in progress.';
    });
  }

  // ================================================================ 9. review (the player, the name, opening a recording)

  var detachPlayer = null;   // undoes editor.attachPlayer for the open recording
  var editTimer = null;      // edits waiting to be stored
  var cueTimer = null;       // corrected caption text waiting to be stored
  var captionTrack = null;   // the one text track on the player
  var captionRunId = null;   // the recording captions are being made for, or null
  var saving = false;        // an export or a save is running
  var exportCache = null;    // { key, result }: the last trimmed file, so a second click does not redo it

  function current() {
    return Takes.state.current;
  }

  function durationOf(recording) {
    var d = Number(recording && recording.durationMs) / 1000;
    return isFinite(d) && d > 0 ? d : 0;
  }

  /** The top of every time slider: the length, rounded up to the slider's 0.1 step so the far end can be reached. */
  function sliderMax(recording) {
    return Math.ceil(durationOf(recording) * 10 - 1e-6) / 10;
  }

  function pct(seconds, recording) {
    var max = sliderMax(recording);
    if (!(max > 0)) return '0%';
    return Takes.util.clamp(seconds / max * 100, 0, 100) + '%';
  }

  function time(seconds) {
    return Takes.util.formatTime(seconds);
  }

  /** A trim, cut or length time: tenths of a second under a minute ('0:05.5'), whole seconds above. */
  function fineTime(seconds) {
    var s = Number(seconds);
    if (!isFinite(s) || s < 0) s = 0;
    var tenths = Math.round(s * 10);
    if (tenths >= 600) return Takes.util.formatTime(tenths / 10);
    var whole = Math.floor(tenths / 10);
    return '0:' + (whole < 10 ? '0' : '') + whole + '.' + (tenths % 10);
  }

  /** True when the saved file has the middle cut taken out too (the editor says so; anything else means no). */
  function cutIsSaved() {
    return !!Takes.editor && Takes.editor.exportsCut === true;
  }

  /**
   * Every copy of a recording this page is holding: the one open in Review and the one the library list holds.
   * Work that finishes later (captions, a stored edit) writes through this, by id, so it never lands on an
   * object the screen has since replaced.
   */
  function knownCopies(id) {
    var found = [];
    var cur = current();
    if (cur && cur.id === id) found.push(cur);
    var list = Takes.state.recordings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id && found.indexOf(list[i]) === -1) found.push(list[i]);
    }
    return found;
  }

  function patchKnown(id, patch) {
    var copies = knownCopies(id);
    for (var i = 0; i < copies.length; i++) {
      for (var key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) copies[i][key] = patch[key];
      }
    }
  }

  function storeInLibrary(id, patch, then) {
    patchKnown(id, patch);
    if (!Takes.library || typeof Takes.library.update !== 'function') { if (then) then(); return; }
    try {
      Takes.library.update(id, patch).then(function () { if (then) then(); }, function () { /* handled inside the library */ });
    } catch (err) { /* what is on screen is still right */ }
  }

  function flushEdits() {
    if (editTimer === null) return;
    root.clearTimeout(editTimer.timer);
    var job = editTimer;
    editTimer = null;
    storeInLibrary(job.id, { edits: job.edits, captionReviewed: false }, function () {
      Takes.bus.emit('edit:changed', { id: job.id, edits: job.edits });
    });
  }

  function flushCues() {
    if (cueTimer === null) return;
    root.clearTimeout(cueTimer.timer);
    var job = cueTimer;
    cueTimer = null;
    storeInLibrary(job.id, { cues: job.cues, captionReviewed: false });
    var recording = knownCopies(job.id)[0];
    if (recording) refreshTranscriptTitle(recording);
  }

  function markActiveCard() {
    if (!el.libraryList) return;
    var cards = el.libraryList.children;
    var id = current() ? String(current().id) : null;
    for (var i = 0; i < cards.length; i++) {
      if (id !== null && cards[i].getAttribute('data-id') === id) cards[i].classList.add('tk-is-active');
      else cards[i].classList.remove('tk-is-active');
    }
  }

  /** Open one recording in the Review view. */
  function openReview(recording) {
    if (!recording || !recording.blob) {
      emitToast('error', 'That recording has no video in it, so it cannot be opened. Try recording it again.');
      return;
    }
    flushEdits();
    flushCues();
    if (!recording.edits || typeof recording.edits !== 'object') recording.edits = { trimStart: 0, trimEnd: null, cut: null };
    if (!recording.cues || !recording.cues.length) recording.cues = [];
    Takes.state.current = recording;
    el.captionsLanguage.value = recording.captionLanguage || (recording.cues.length ? 'en' : 'nl');

    var old = playerUrl;
    playerUrl = '';
    try {
      playerUrl = root.URL.createObjectURL(recording.blob);
      el.player.src = playerUrl;
      el.player.load();
    } catch (err) {
      emitToast('error', 'The recording could not be shown here. Use Download to keep it.');
    }
    if (old) { try { root.URL.revokeObjectURL(old); } catch (err2) { /* already revoked */ } }

    el.reviewName.value = recording.name || '';
    showSaveNote(describe(recording));
    hideExportProgress();

    setCutOpen(false);
    attachEdits();
    renderTrim();
    renderCaptions();
    syncSaveButtons();
    refreshFolder();

    markActiveCard();
    show('review', true);

    checkDrift(recording.id, DRIFT_WAIT_TRIES);

    // Never plays by itself: the take waits, paused, on the first frame that is kept.
    try { el.player.pause(); } catch (err3) { /* nothing was playing */ }
  }

  /** Once the video can seek, rest it on the first kept frame so the player is not an empty box. */
  function onPlayerReady() {
    var cur = current();
    if (!cur || !el.player.paused) return;
    var start = settledEdits(cur).trimStart;
    try {
      if (Math.abs((Number(el.player.currentTime) || 0) - start) > 0.01) el.player.currentTime = start;
    } catch (err) { /* the person can press play */ }
  }

  function titleSuggestion(recording) {
    try {
      return Takes.titles.suggest(recording.cues,{ranges:Takes.editor.keptRanges(recording.edits,durationOf(recording))});
    } catch (err) { return ''; }
  }

  function editingAName(recording) {
    var active = root.document.activeElement;
    return active && (active === el.reviewName || active.classList.contains('tk-card-name-input')) && active.value !== recording.name;
  }

  function renderTitleSuggestion() {
    var rec = current();
    if (!rec) return;
    var suggestion = titleSuggestion(rec);
    var candidate = Takes.titles.unique(suggestion,Takes.state.recordings,rec.id);
    byId('tk-title-suggestion').textContent = suggestion ? 'From transcript: ' + candidate
      : rec.cues && rec.cues.length ? 'No usable title in the kept transcript. You can keep or edit the name yourself.'
        : 'Generate captions for a free, local title suggestion. Only kept transcript sections are used.';
    byId('tk-use-title').disabled = saving || captionRunId !== null || !suggestion || rec.name === candidate;
  }

  function refreshTranscriptTitle(recording) {
    var rec = latest(recording);
    var suggestion = titleSuggestion(rec);
    var patch = {};
    if (rec.titleSuggestion !== suggestion) patch.titleSuggestion = suggestion;
    var owned = (rec.titleSource === 'automatic' || rec.titleSource === 'transcript') && rec.name === rec.titleAutoName;
    if (owned && !editingAName(rec)) {
      var candidate = Takes.titles.unique(suggestion || rec.titleFallbackName || rec.name,Takes.state.recordings,rec.id);
      if (candidate !== rec.name) {
        patch.name = candidate; patch.titleAutoName = candidate;
        patch.titleSource = suggestion ? 'transcript' : 'automatic';
      }
    }
    if (Object.keys(patch).length) storeInLibrary(rec.id,patch);
    if (current() && current().id === rec.id) {
      if (patch.name) el.reviewName.value = patch.name;
      renderTitleSuggestion();
    }
  }

  function useTranscriptTitle() {
    var rec = current();
    if (!rec || saving || captionRunId !== null) return;
    var suggestion = titleSuggestion(rec);
    if (!suggestion) return;
    var name = Takes.titles.unique(suggestion,Takes.state.recordings,rec.id);
    storeInLibrary(rec.id,{name:name,titleSource:'manual',titleSuggestion:suggestion});
    el.reviewName.value = name;
    renderTitleSuggestion();
  }

  function onNameChange() {
    var cur = current();
    if (!cur) return;
    var name = String(el.reviewName.value || '').replace(/^\s+|\s+$/g, '');
    if (!name) { el.reviewName.value = cur.name || ''; return; }
    el.reviewName.value = name;
    if (name === cur.name) return;
    patchKnown(cur.id, { name: name, titleSource: 'manual' });
    if (Takes.library && typeof Takes.library.rename === 'function') {
      try {
        Takes.library.rename(cur.id, name).then(null, function () { /* handled inside the library */ });
      } catch (err) { /* the name is still right on screen */ }
    }
    renderTitleSuggestion();
  }

  function onPlayerTime() {
    var cur = current();
    if (!cur) return;
    var t = Number(el.player.currentTime) || 0;
    el.trimPlayhead.style.left = pct(t, cur);
    el.trimPlayhead.setAttribute('aria-valuenow', t.toFixed(2));
    el.trimPlayhead.setAttribute('aria-valuetext', preciseTime(t));
    el.trimPlayhead.setAttribute('aria-valuemax', String(durationOf(cur)));
    byId('tk-playhead-time').textContent = t.toFixed(2) + ' s';
    markActiveCue(t);
    drawOutputPreview();
  }

  function initReview() {
    on(el.reviewName, 'change', onNameChange);
    on(byId('tk-use-title'),'click',useTranscriptTitle);
    on(el.reviewName, 'keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); el.reviewName.blur(); }
    });
    on(el.player, 'loadeddata', onPlayerReady);
    on(el.player, 'timeupdate', onPlayerTime);
    on(el.player, 'loadeddata', drawOutputPreview);
    on(el.player, 'play', animateOutputPreview);
    on(el.player, 'seeked', onPlayerTime);
    on(root, 'pagehide', function () { flushEdits(); flushCues(); });
  }

  // ================================================================ 10. trim and cut

  /** The open recording's edits with every value settled. Never throws. */
  function settledEdits(recording) {
    var dur = durationOf(recording);
    try {
      return Takes.editor.normalizeEdits(recording.edits, dur);
    } catch (err) {
      return Takes.editor.normalizeEdits(null, dur);
    }
  }

  function attachEdits() {
    var cur = current();
    if (detachPlayer) { try { detachPlayer(); } catch (err) { /* already detached */ } }
    detachPlayer = cur ? Takes.editor.attachPlayer(el.player, cur.edits, { allowPausedSeeking: true }) : null;
  }

  /** Draw the trim bar, the read-outs and the notes from the open recording's edits. */
  function renderTrim() {
    var cur = current();
    if (!cur) return;
    var dur = durationOf(cur);
    var max = sliderMax(cur);
    var e = settledEdits(cur);
    var atEnd = e.trimEnd >= dur - 0.001;

    el.trimStart.max = String(max);
    el.trimEnd.max = String(max);
    el.trimStart.value = String(e.trimStart);
    el.trimEnd.value = String(atEnd ? max : e.trimEnd);
    el.trimStart.setAttribute('aria-valuetext', fineTime(e.trimStart));
    el.trimEnd.setAttribute('aria-valuetext', fineTime(e.trimEnd));

    el.trimKept.style.left = pct(e.trimStart, cur);
    el.trimKept.style.width = pct((atEnd ? max : e.trimEnd) - e.trimStart, cur);
    el.trimStartTime.textContent = fineTime(e.trimStart);
    el.trimEndTime.textContent = fineTime(e.trimEnd);

    // Length is always the saved file's length. Whether the cut comes out of that file is the editor's to say.
    var savesCut = cutIsSaved();
    var trimLength = e.trimEnd - e.trimStart;
    var playLength = trimLength;
    try { playLength = Takes.editor.editedDuration(e, dur); } catch (err) { playLength = trimLength; }
    var savedLength = savesCut ? playLength : trimLength;
    el.trimLength.textContent = fineTime(savedLength);
    var cuts = Takes.editor.cutsOf(e);
    el.cutNote.textContent = cuts.length + ' cut(s). All cuts are removed from the exported video. The original stays in your library.';
    var trimmed = Takes.editor.hasTrim(e, dur);
    setHidden(el.trimNote, !trimmed);
    setHidden(el.trimCut, true);
    var bar = byId('tk-trim-bar');
    bar.querySelectorAll('.tk-multi-cut').forEach(function (node) { node.remove(); });
    el.cutList.replaceChildren();
    cuts.forEach(function (c, index) {
      var mark = root.document.createElement('div');
      mark.className = 'tk-trim-cut tk-multi-cut';
      mark.style.left = pct(c.start, cur);
      mark.style.width = pct(c.end - c.start, cur);
      mark.setAttribute('aria-hidden', 'true');
      bar.appendChild(mark);
      var row = root.document.createElement('li');
      var text = root.document.createElement('span');
      text.textContent = preciseTime(c.start) + ' to ' + preciseTime(c.end);
      var remove = root.document.createElement('button');
      remove.type = 'button'; remove.className = 'tk-btn tk-btn-ghost';
      remove.textContent = 'Restore section'; remove.disabled = saving;
      remove.setAttribute('aria-label', 'Restore section ' + text.textContent);
      on(remove, 'click', function () {
        applyEdits({ trimStart: e.trimStart, trimEnd: e.trimEnd,
          cuts: cuts.filter(function (_, i) { return i !== index; }) });
      });
      row.append(text, remove); el.cutList.appendChild(row);
    });
    setHidden(el.cutNote, !cuts.length);
    el.cutClear.disabled = saving || !cuts.length;
    el.cutToggle.textContent = 'Add a cut';
    el.trimReset.disabled = saving || (!trimmed && !cuts.length);
    var h = historyFor(cur);
    el.undo.disabled = saving || !h.undo.length;
    el.redo.disabled = saving || !h.redo.length;
    el.trimStart.disabled = saving;
    el.trimEnd.disabled = saving;
    el.cutToggle.disabled = saving;
    el.cutStart.disabled = saving;
    el.cutEnd.disabled = saving;
    el.cutApply.disabled = saving;
    el.trimPlayhead.disabled = saving;
    byId('tk-cut-mark-start').disabled = saving;
    byId('tk-cut-mark-end').disabled = saving;

    el.cutStart.max = String(max);
    el.cutEnd.max = String(max);
    onPlayerTime();
  }

  /**
   * Take new edits for the open recording: settle them, show them, play by them and store them.
   * An edit that would leave nothing is refused gently and the handles go back where they were.
   */
  var histories = Object.create(null);
  function historyFor(cur) {
    return histories[cur.id] || (histories[cur.id] = { undo: [], redo: [] });
  }
  function restoreEdit(direction) {
    var cur = current();
    if (!cur || saving) return;
    var h = historyFor(cur);
    if (!h[direction].length) return;
    var next = h[direction].pop();
    h[direction === 'undo' ? 'redo' : 'undo'].push(structuredClone(cur.edits));
    applyEdits(next, true);
  }
  function applyEdits(next, restoring) {
    var cur = current();
    if (!cur) return null;
    if (saving) {
      // The file being made was started from the edits as they were; they must not move under it.
      renderTrim();
      return null;
    }
    var dur = durationOf(cur);
    var e;
    try {
      e = Takes.editor.normalizeEdits(next, dur);
    } catch (err) {
      emitToast('info', 'That would trim away the whole recording. Leave at least half a second to keep.');
      renderTrim();
      return null;
    }
    if (!restoring) {
      var h = historyFor(cur);
      h.undo.push(structuredClone(cur.edits));
      if (h.undo.length > 100) h.undo.shift();
      h.redo = [];
    }
    cur.edits = { version: 2, trimStart: e.trimStart,
      trimEnd: e.trimEnd >= dur - 0.001 ? null : e.trimEnd,
      cuts: Takes.editor.cutsOf(e).map(function (c) { return { start: c.start, end: c.end }; }) };
    exportCache = null; // a file made from the old edits is no longer the right one
    patchKnown(cur.id, { edits: cur.edits, captionReviewed: false });
    el.optBurn.checked = false;
    attachEdits();
    renderTrim();
    renderSaveOptions();
    refreshTranscriptTitle(cur);

    if (editTimer !== null) root.clearTimeout(editTimer.timer);
    editTimer = { id: cur.id, edits: cur.edits, timer: root.setTimeout(flushEdits, 300) };
    return cur.edits;
  }

  /** Show the frame at a time, so a handle that is being moved can be seen landing. */
  function preview(seconds) {
    try {
      if (!el.player.paused) el.player.pause();
      el.player.currentTime = seconds;
    } catch (err) { /* the video is not ready to seek; the handle still moved */ }
  }

  function onTrimStartInput() {
    var cur = current();
    if (!cur) return;
    var v = Number(el.trimStart.value) || 0;
    if (applyEdits({ trimStart: v, trimEnd: cur.edits.trimEnd, cuts: Takes.editor.cutsOf(cur.edits) })) preview(v);
  }

  function onTrimEndInput() {
    var cur = current();
    if (!cur) return;
    var dur = durationOf(cur);
    var v = Number(el.trimEnd.value) || 0;
    var end = v >= dur - 0.001 ? null : v;
    if (applyEdits({ trimStart: cur.edits.trimStart, trimEnd: end, cuts: Takes.editor.cutsOf(cur.edits) })) {
      preview(Math.max(0, (end === null ? dur : end) - 0.05));
    }
  }

  function preciseTime(seconds) {
    var value = Math.max(0, Number(seconds) || 0);
    var ticks = Math.round(value * 100);
    return Math.floor(ticks / 6000) + ':' + ((ticks % 6000) / 100).toFixed(2).padStart(5, '0');
  }

  function showCutTimes() {
    el.cutStartTime.textContent = preciseTime(Number(el.cutStart.value) || 0);
    el.cutEndTime.textContent = preciseTime(Number(el.cutEnd.value) || 0);
  }

  function setCutOpen(open) {
    setHidden(el.cutControls, !open);
    el.cutToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    var cur = current();
    if (!open || !cur) return;
    var e = settledEdits(cur);
    var from;
    var to;
    from = Takes.util.clamp(Number(el.player.currentTime) || 0, e.trimStart, Math.max(e.trimStart, e.trimEnd - 0.5));
    to = Math.min(from + 2, e.trimEnd);
    el.cutStart.value = String(Math.round(from * 100) / 100);
    el.cutEnd.value = String(Math.round(to * 100) / 100);
    showCutTimes();
  }

  function seekFromTimeline(event) {
    var cur = current();
    if (!cur || saving) return;
    var rect = byId('tk-trim-bar').getBoundingClientRect();
    var seconds = Math.max(0, Math.min(durationOf(cur), (event.clientX - rect.left) / rect.width * durationOf(cur)));
    preview(Math.round(seconds * 100) / 100);
    onPlayerTime();
  }

  function initTrim() {
    var bar = byId('tk-trim-bar');
    var drag = false;
    on(bar, 'pointerdown', function (event) {
      if (saving || event.target.tagName === 'INPUT') return;
      event.preventDefault(); drag = true; bar.setPointerCapture(event.pointerId); seekFromTimeline(event);
    });
    on(bar, 'pointermove', function (event) { if (drag) seekFromTimeline(event); });
    ['pointerup','pointercancel','lostpointercapture'].forEach(function (name) { on(bar,name,function () { drag = false; }); });
    on(el.trimPlayhead, 'keydown', function (event) {
      if (!current() || saving) return;
      var t = el.player.currentTime, step = event.shiftKey ? 0.1 : 0.01;
      if (event.key === 'ArrowLeft') t -= step;
      else if (event.key === 'ArrowRight') t += step;
      else if (event.key === 'Home') t = 0;
      else if (event.key === 'End') t = durationOf(current());
      else return;
      event.preventDefault(); preview(Math.max(0,Math.min(durationOf(current()),t))); onPlayerTime();
    });
    on(byId('tk-cut-mark-start'),'click',function () {
      if (!current() || saving) return;
      setCutOpen(true); el.cutStart.value = String(el.player.currentTime); showCutTimes();
    });
    on(byId('tk-cut-mark-end'),'click',function () {
      if (!current() || saving) return;
      if (el.cutControls.hidden) setCutOpen(true);
      el.cutEnd.value = String(el.player.currentTime); showCutTimes();
    });
    el.trimReset.textContent = 'Reset edits';
    on(el.undo, 'click', function () { restoreEdit('undo'); });
    on(el.redo, 'click', function () { restoreEdit('redo'); });
    on(root.document, 'keydown', function (event) {
      if (currentView !== 'review' || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      var target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      var key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      restoreEdit(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    });
    on(el.trimStart, 'change', onTrimStartInput);
    on(el.trimEnd, 'change', onTrimEndInput);

    on(el.trimReset, 'click', function () {
      if (!current()) return;
      setCutOpen(false);
      applyEdits({ trimStart: 0, trimEnd: null, cut: null });
    });

    on(el.cutToggle, 'click', function () { setCutOpen(el.cutControls.hidden); });
    on(el.cutStart, 'input', function () { showCutTimes(); preview(Number(el.cutStart.value) || 0); });
    on(el.cutEnd, 'input', function () { showCutTimes(); preview(Number(el.cutEnd.value) || 0); });

    on(el.cutApply, 'click', function () {
      var cur = current();
      if (!cur) return;
      var a = Number(el.cutStart.value) || 0;
      var b = Number(el.cutEnd.value) || 0;
      if (b - a < 0.1) { emitToast('info', 'Choose an end at least 0.1 seconds after the start.'); return; }
      var result = applyEdits({ trimStart: cur.edits.trimStart, trimEnd: cur.edits.trimEnd, cuts: Takes.editor.cutsOf(cur.edits).concat([{ start: a, end: b }]) });
      if (result && Math.abs(b - a) < 0.1) {
        emitToast('info', 'Nothing was cut. Set "Cut to" later than "Cut from", inside the part you are keeping.');
      } else if (result) {
        setCutOpen(false);
      }
    });

    on(el.cutClear, 'click', function () {
      var cur = current();
      if (!cur) return;
      applyEdits({ trimStart: cur.edits.trimStart, trimEnd: cur.edits.trimEnd, cut: null });
    });
  }

  // ================================================================ 11. save: download and the cloud folder

  function syncSaveButtons() {
    var has = !!current();
    el.saveDownload.disabled = saving || !has;
    el.saveCloud.disabled = saving || !has;
    el.cloudChoose.disabled = saving;
    renderSaveOptions();
    if (has) renderTitleSuggestion();
    if (has) renderTrim(); // the trim handles, the cut and Reset are locked while a file is being made
  }

  function setSaving(button, on_) {
    saving = on_;
    if (button) {
      if (on_) button.classList.add('tk-is-busy');
      else button.classList.remove('tk-is-busy');
    }
    syncSaveButtons();
  }

  function setBar(bar, fill, value) {
    setHidden(bar, false);
    if (value === null) {
      bar.classList.add('tk-is-indeterminate');
      bar.removeAttribute('aria-valuenow');
    } else {
      var v = Math.round(Takes.util.clamp(value, 0, 100));
      bar.classList.remove('tk-is-indeterminate');
      bar.setAttribute('aria-valuenow', String(v));
      fill.style.width = v + '%';
    }
  }

  function hideExportProgress() {
    setHidden(el.exportProgress, true);
    el.exportStatus.textContent = '';
  }

  function onExportProgress(payload) {
    var cur = current();
    if (!payload || !cur || payload.id !== cur.id || !saving) return;
    // A plain trim reports only its start and its end, so until a real figure arrives the bar sweeps.
    var p = Math.round(Number(payload.pct) || 0);
    setBar(el.exportProgress, el.exportFill, p > 0 ? p : null);
    el.exportStatus.textContent = 'Preparing your video\u2026' + (p > 0 ? ' ' + p + '%' : '');
  }

  // ---- the two opt-in save options: captions drawn into the picture, and a tall shape. Nothing here is automatic.
  var BURN_READY_TEXT = 'The captions are drawn into the picture, so they show everywhere you post it.';
  var BURN_ALSO_TEXT = 'Captions will be drawn into the video you save, and also saved as a separate file (.vtt).';
  var burnNoteText = '';     // the shell's own words, put back when the option cannot be used
  var fileNoteText = '';
  var optionsFor = null;     // the recording the options were last shown for; another one starts with both off

  /** What this build of the editor can do. Nothing listed means the options are not offered at all. */
  function supportedOptions() {
    var o = Takes.editor && Takes.editor.exportOptions;
    if (!o || typeof o !== 'object') return { burn: false, vertical: false };
    return { burn: o.burnCaptions === true, vertical: o.vertical === true };
  }

  /** The options as they stand right now: read when Download or Save to my cloud folder is pressed. */
  function captionsApproved(rec) {
    return !!rec && rec.captionReviewed === true && !!rec.cues && rec.cues.length > 0;
  }
  function approvedForSave(rec) {
    return captionsApproved(rec) ? rec : Object.assign({},rec,{cues:[]});
  }
  function renderCaptionApproval() {
    var cur = current(), approved = captionsApproved(cur), has = !!cur && !!cur.cues && cur.cues.length > 0;
    var button = byId('tk-captions-approve');
    button.hidden = !has;
    button.disabled = saving || captionRunId !== null || approved;
    button.textContent = approved ? 'Captions approved' : 'Approve captions';
    byId('tk-captions-review-status').textContent = !has ? 'Generate captions, correct the text, then approve it before adding it to your export.'
      : approved ? 'Approved. You can now burn these captions into the video or save subtitles.'
      : 'Draft: check and correct the text below, then approve. These captions are not added to your export yet.';
    el.captionsDownload.disabled = saving || !approved;
    el.transcriptSrt.disabled = saving || !approved;
  }

  var outputPreviewFrame = 0;
  function drawOutputPreview() {
    var cur = current();
    if (!cur) return;
    var opts = readSaveOptions();
    var showPreview = opts.vertical || opts.burn;
    setHidden(byId('tk-output-preview'), !showPreview);
    if (showPreview) Takes.editor.renderPreview(byId('tk-output-canvas'),el.player,editorOptions(cur,opts));
  }
  function animateOutputPreview() {
    if (outputPreviewFrame) return;
    function frame() {
      outputPreviewFrame = 0;
      drawOutputPreview();
      if (!el.player.paused && currentView === 'review') outputPreviewFrame = root.requestAnimationFrame(frame);
    }
    outputPreviewFrame = root.requestAnimationFrame(frame);
  }

  function readSaveOptions() {
    var cur = current();
    var can = supportedOptions();
    var hasCues = !!cur && !!cur.cues && cur.cues.length > 0;
    return {
      burn: can.burn && hasCues && captionsApproved(cur) && !!el.optBurn.checked,
      vertical: can.vertical && !!el.optSizeVertical.checked
    };
  }

  /** The same options in the shape the editor takes. The cues stay in SOURCE time; the editor moves them itself. */
  function editorOptions(recording, opts) {
    return {
      burnCaptions: !!opts.burn,
      cues: opts.burn ? (recording.cues || []) : [],
      size: opts.vertical ? 'vertical' : 'original'
    };
  }

  /** Bring the options, their notes and the captions-file note in line with the open recording. */
  function renderSaveOptions() {
    var cur = current();
    var can = supportedOptions();
    setHidden(el.saveOptions, !can.burn && !can.vertical);
    setHidden(el.optBurnWrap, !can.burn);
    setHidden(el.optBurnNote, !can.burn);
    setHidden(el.optSize, !can.vertical);
    setHidden(el.optSizeNote, !can.vertical);
    if (!cur) return;

    if (optionsFor !== cur.id) {
      optionsFor = cur.id;
      el.optBurn.checked = false;
      el.optSizeOriginal.checked = true;
    }
    var approved = captionsApproved(cur);
    if (!approved) el.optBurn.checked = false;
    el.optBurn.disabled = saving || !approved;
    el.optBurnNote.textContent = approved ? BURN_READY_TEXT : 'Generate captions below, check the text and click Approve captions first.';
    el.optSizeOriginal.disabled = saving;
    el.optSizeVertical.disabled = saving;

    var opts = readSaveOptions();
    setHidden(el.optSlowNote, !(opts.burn || opts.vertical));
    // With the option on the note says what will happen; off, the shell's own words come back.
    el.captionsFileNote.textContent = opts.burn ? BURN_ALSO_TEXT : fileNoteText;
    renderCaptionApproval();
    drawOutputPreview();
  }

  function noSpeechIn(id) {
    return typeof noSpeech === 'object' && noSpeech !== null && noSpeech[id] === true;
  }

  /** Only reviewed captions can be added to the saved video. */
  function onBurnSwitch() {
    if (!captionsApproved(current())) el.optBurn.checked = false;
    renderSaveOptions();
  }

  /** True (and says so) when captions were asked to be drawn in but are still being made. */
  function waitingForCaptions(cur) {
    if (!el.optBurn.checked || captionRunId !== cur.id) return false;
    emitToast('info', 'The captions are still being made. Give it a moment, then save again.');
    return true;
  }

  function exportKey(recording, opts) {
    var e = settledEdits(recording);
    var key = recording.id + '|' + e.trimStart.toFixed(3) + '|' + e.trimEnd.toFixed(3) +
      '|' + JSON.stringify(Takes.editor.cutsOf(e));
    if (opts && opts.vertical) key += '|tall';
    if (opts && opts.burn) {
      // The words and their times are part of the file, so a corrected caption makes a new one.
      var cues = recording.cues || [];
      var parts = [];
      for (var i = 0; i < cues.length; i++) parts.push(cues[i].start + '~' + cues[i].end + '~' + cues[i].text);
      key += '|burn|' + parts.join('\n');
    }
    return key;
  }

  /** A file has to be made when the ends are trimmed, or when there is a cut and the saved file takes cuts out. */
  function needsExport(recording, opts) {
    var dur = durationOf(recording);
    if (opts && (opts.burn || opts.vertical)) return true;
    if (typeof Takes.editor.needsExport === 'function') {
      try { return !!Takes.editor.needsExport(recording.edits, dur); } catch (err) { /* fall through to the plain test */ }
    }
    if (Takes.editor.hasTrim(recording.edits, dur)) return true;
    return cutIsSaved() && !!settledEdits(recording).cut;
  }

  /**
   * The recording as the captions file for a SAVED video needs it: cues moved into that file's time.
   * withCut says whether the saved video has the cut taken out; cues inside a removed part are dropped.
   * The copy carries no edits, so nothing downstream shifts the cues a second time. The original is untouched.
   */
  function forCaptionsFile(recording, withCut) {
    var cues = recording.cues || [];
    if (!cues.length || !needsExport(recording, null)) return recording;
    var e = recording.edits || {};
    var shifted = Takes.captions.shiftCuesForEdits(cues, {
      trimStart: e.trimStart || 0,
      trimEnd: e.trimEnd == null ? null : e.trimEnd,
      cuts: withCut ? Takes.editor.cutsOf(e) : []
    });
    var copy = {};
    for (var key in recording) {
      if (Object.prototype.hasOwnProperty.call(recording, key)) copy[key] = recording[key];
    }
    copy.cues = shifted;
    copy.edits = { trimStart: 0, trimEnd: null, cut: null };
    return copy;
  }

  /** Whether the saved video for this recording has (or will have) the cut taken out. */
  function cutComesOut(recording, result) {
    if (!settledEdits(recording).cut) return false;
    if (result) return result.cutApplied === true;
    if (exportCache && exportCache.key === exportKey(recording)) return exportCache.result.cutApplied === true;
    return cutIsSaved();
  }

  /**
   * Export all requested edits or reject. Never substitute the original or a partial export.
   */
  function prepareFile(recording, opts) {
    opts = opts || { burn: false, vertical: false };
    if (opts.burn && !captionsApproved(recording)) return Promise.reject(new Error('Review and approve captions first.'));
    var plain = { override: undefined, trimmed: false, burned: false, tall: false };
    if (!needsExport(recording, opts)) return Promise.resolve(plain);
    var made = function (result) {
      if (!result || !result.blob || !result.blob.size ||
          (Takes.editor.cutsOf(settledEdits(recording)).length && result.cutApplied !== true) ||
          (opts.burn && result.captionsBurned !== true) || (opts.vertical && result.size !== 'vertical')) {
        throw new Error('Export incomplete. Nothing was saved.');
      }
      return {
        override: result, trimmed: true,
        burned: opts.burn && result.captionsBurned === true,
        tall: opts.vertical && result.size === 'vertical'
      };
    };
    var key = exportKey(recording, opts);
    if (exportCache && exportCache.key === key) return Promise.resolve(made(exportCache.result));
    var asked = opts.burn || opts.vertical;
    setBar(el.exportProgress, el.exportFill, null);
    el.exportStatus.textContent = 'Preparing your video\u2026';
    var exporting;
    try {
      exporting = asked ? Takes.editor.exportEdited(recording, editorOptions(recording, opts)) : Takes.editor.exportEdited(recording);
    } catch (thrown) {
      exporting = Promise.reject(thrown);
    }
    return Promise.resolve(exporting).then(function (result) {
      var file = made(result);
      exportCache = { key: key, result: result };
      hideExportProgress();
      return file;
    }, function (err) {
      hideExportProgress();
      if (!(err && err.toasted === true)) {
        emitToast('error', 'Export failed. Nothing was saved. Your original and edits are still in the library.');
      }
      throw err;
    });
  }

  /** ' (vertical)', ' (captions)' or ' (vertical, captions)': what was really done to the file, so versions can be told apart. */
  function versionSuffix(file) {
    var words = [];
    if (file.tall) words.push('vertical');
    if (file.burned) words.push('captions');
    return words.length ? ' (' + words.join(', ') + ')' : '';
  }

  /** The recording under the name its saved file should carry. A copy; the stored name never changes. */
  function namedFor(recording, file) {
    var suffix = versionSuffix(file);
    if (!suffix) return recording;
    var copy = {};
    for (var key in recording) {
      if (Object.prototype.hasOwnProperty.call(recording, key)) copy[key] = recording[key];
    }
    copy.name = String(recording.name || '').replace(/\.mp4$/i, '') + suffix;
    return copy;
  }

  var saveMessage = '';

  /** A take whose picture and sound drifted apart says so here, ahead of anything else on that line. */
  function driftText(recording) {
    var drift = Number(recording && recording.syncDrift);
    if (!(drift > 0)) return '';
    return 'Heads up: in this recording the picture runs about ' + drift.toFixed(1) + ' s behind the sound. ' +
      'That can happen when the computer is very busy. For a clean take, record again and keep the ' +
      Takes.PRODUCT_NAME + ' tab visible in its own window, or switch the camera off.';
  }

  function renderSaveNote() {
    var heads = driftText(current());
    el.saveNote.textContent = heads && saveMessage ? heads + ' ' + saveMessage : heads || saveMessage;
    setHidden(el.saveNote, !el.saveNote.textContent);
  }

  function showSaveNote(text) {
    saveMessage = text;
    renderSaveNote();
  }

  // ---- picture and sound out of step
  // Measured on real takes: a finished take's video is at most 0.144 s longer than the time the recorder
  // counted when it is clean, and at least 0.285 s longer when the picture drifted. 0.2 s separates the two.
  var DRIFT_LIMIT_SEC = 0.2;
  var DRIFT_MIN_TAKE_MS = 3000;   // shorter takes are too short to tell
  var DRIFT_WAIT_TRIES = 12;      // about three seconds for the player to report a real length
  var sessionTakes = {};          // ids of takes made in this visit; older recordings are never checked again
  var driftChecked = {};

  function checkDrift(id, triesLeft) {
    var cur = current();
    if (!cur || cur.id !== id || driftChecked[id] || !sessionTakes[id]) return;
    if (!(Number(cur.durationMs) >= DRIFT_MIN_TAKE_MS)) { driftChecked[id] = true; return; }
    var length = Number(el.player.duration);
    if (!isFinite(length) || !(length > 0)) {
      // Some players report no length for a moment; if it never comes the check is skipped, silently.
      if (triesLeft > 0) root.setTimeout(function () { checkDrift(id, triesLeft - 1); }, 250);
      return;
    }
    driftChecked[id] = true;
    var drift = length - Number(cur.durationMs) / 1000;
    if (!(drift > DRIFT_LIMIT_SEC)) return;
    var figure = Math.round(drift * 10) / 10;
    storeInLibrary(id, { syncDrift: figure });
    renderSaveNote();
    emitToast('info', 'Heads up: the picture runs about ' + figure.toFixed(1) +
      ' s behind the sound in this recording. Recording again with the ' + Takes.PRODUCT_NAME + ' tab visible usually fixes it.');
  }

  /** The newest copy of a recording this page holds, looked up when slow work finishes. */
  function latest(recording) {
    return knownCopies(recording.id)[0] || recording;
  }

  /** A save result goes under the Save buttons when that recording is still the one on screen; otherwise it is a toast. */
  function reportSave(id, text) {
    var cur = current();
    if (cur && cur.id === id) showSaveNote(text);
    else emitToast('info', text);
  }

  function onDownloadClick() {
    var cur = current();
    if (!cur || saving) return;
    if (waitingForCaptions(cur)) return;
    flushEdits();
    flushCues();
    var opts = readSaveOptions(); // read now, at the press
    setSaving(el.saveDownload, true);
    prepareFile(cur, opts).then(function (file) {
      var fileName = Takes.save.download(namedFor(latest(cur), file), file.override);
      if (!fileName) return; // save.js has already said why
      reportSave(cur.id, (file.trimmed ? 'Downloaded the edited recording as ' : 'Downloaded as ') + fileName + '. Look in your Downloads folder.');
    }).then(null, function (err) {
      hideExportProgress();
      reportSave(cur.id, 'Export failed. Nothing was downloaded. Your original and edits are still here.');
      if (!quiet(err)) emitToast('error', 'Export failed. Nothing was downloaded. Try again.');
    }).then(function () { setSaving(el.saveDownload, false); });
  }

  var folderChosen = false;

  function showFolder(name) {
    folderChosen = !!name;
    el.cloudFolderName.textContent = name || 'none chosen yet';
    el.cloudChoose.textContent = name ? 'Change folder' : 'Choose folder';
  }

  function refreshFolder() {
    if (!Takes.state.caps.dirPicker) return;
    Takes.save.cloudFolderName().then(showFolder, function () { /* never rejects */ });
  }

  function quiet(err) {
    return !!err && (err.toasted === true || err.code === 'cancelled');
  }

  /**
   * The folder picker needs a fresh click, and a long export would use that click up.
   * So the order is: make sure a folder is chosen (inside the click), then export, then write.
   */
  function onCloudClick() {
    var cur = current();
    if (!cur || saving) return;
    if (waitingForCaptions(cur)) return;
    flushEdits();
    flushCues();
    var opts = readSaveOptions(); // read now, at the press
    setSaving(el.saveCloud, true);
    // Inside the click: the folder is picked, or a remembered folder's permission is asked, before any slow work.
    Takes.save.ensureCloudAccess().then(function (name) {
      if (name === null) {
        var stop = new Error('No folder was chosen.');
        stop.code = 'cancelled';
        throw stop;
      }
      showFolder(name);
      return prepareFile(cur, opts);
    }).then(function (file) {
      var rec = approvedForSave(latest(cur));
      // With a made file, the captions written beside it are moved into that file's time here.
      return Takes.save.saveToCloudFolder(namedFor(file.override ? forCaptionsFile(rec, cutComesOut(rec, file.override), true) : rec, file), file.override);
    }).then(function (saved) {
      showFolder(saved.folderName);
      reportSave(cur.id, 'Saved ' +
        saved.fileName + (saved.vttFileName ? ' and ' + saved.vttFileName : '') + ' in ' + saved.folderName + '.');
    }).then(null, function (err) {
      if (!quiet(err)) emitToast('error', 'The recording could not be saved to your cloud folder. Try again, or use Download instead.');
      refreshFolder();
    }).then(function () { setSaving(el.saveCloud, false); });
  }

  function onChooseFolder() {
    if (saving) return;
    // With no folder yet this picks one (or asks again for a remembered one); with one showing it changes it.
    var asking = folderChosen ? Takes.save.chooseCloudFolder() : Takes.save.ensureCloudAccess();
    asking.then(function (name) {
      if (name !== null) showFolder(name);
    }, function (err) {
      if (!quiet(err)) emitToast('error', 'The cloud folder picker could not open. Click Choose folder again.');
    });
  }

  function initSave() {
    burnNoteText = el.optBurnNote.textContent;
    fileNoteText = el.captionsFileNote.textContent;
    on(el.optBurn, 'change', onBurnSwitch);
    on(el.saveOptions, 'change', renderSaveOptions);
    renderSaveOptions();
    on(el.saveDownload, 'click', onDownloadClick);
    Takes.bus.on('export:progress', onExportProgress);
    if (!Takes.state.caps.dirPicker) {
      setHidden(el.saveCloud, true);
      setHidden(el.cloud, true);
      return;
    }
    on(el.saveCloud, 'click', onCloudClick);
    on(el.cloudChoose, 'click', onChooseFolder);
    refreshFolder();
  }

  // ================================================================ 12. captions

  var noSpeech = {};            // recording id -> true when captions were made and nothing was said
  var captionProgress = null;   // the last progress of the run in flight, so it can be shown again on return

  function captionsBusy() {
    return captionRunId !== null;
  }

  function hideCaptionProgress() {
    setHidden(el.captionsProgress, true);
    el.captionsProgress.classList.remove('tk-is-indeterminate');
    el.captionsStatus.textContent = '';
  }

  function showCaptionProgress(phase, value) {
    setBar(el.captionsProgress, el.captionsFill, value);
    if (phase === 'transcribe') {
      el.captionsStatus.textContent = 'Listening to your recording… The page may pause for a moment while it works.';
    } else if (value === null) {
      el.captionsStatus.textContent = 'Downloading the caption tools…';
    } else if (value <= 0) {
      el.captionsStatus.textContent = 'Getting ready…';
    } else {
      el.captionsStatus.textContent = 'Downloading the caption tools… ' + Math.round(value) + '%';
    }
  }

  function setTrackMode() {
    if (captionTrack) captionTrack.mode = el.captionsToggle.checked ? 'showing' : 'hidden';
  }

  /** Put the open recording's cues on the player (source time), keeping the on/off choice. */
  function attachCues() {
    var cur = current();
    var cues = cur && cur.cues ? cur.cues : [];
    if (!cues.length && !captionTrack) return;
    captionTrack = Takes.captions.attach(el.player, cues, cur && cur.captionLanguage || 'en');
    setTrackMode();
  }

  function markActiveCue(t) {
    var rows = el.cueList.children;
    var cur = current();
    if (!rows.length || !cur) return;
    for (var i = 0; i < rows.length; i++) {
      var cue = cur.cues[i];
      if (cue && t >= cue.start && t < cue.end) rows[i].classList.add('tk-is-active');
      else rows[i].classList.remove('tk-is-active');
    }
  }

  /** A moment the player can really rest on: one inside a trimmed-off or cut part moves to the nearest kept moment. */
  function keptMoment(seconds) {
    var cur = current();
    var t = Number(seconds) || 0;
    if (!cur) return t;
    var e = settledEdits(cur);
    if (t < e.trimStart) return e.trimStart;
    if (t > e.trimEnd) return Math.max(e.trimStart, e.trimEnd - 0.05);
    var activeCut = Takes.editor.cutsOf(e).find(function (c) { return t >= c.start && t < c.end; });
    if (activeCut) {
      e = Object.assign({}, e, { cut: activeCut });
      var before = Math.max(e.trimStart, e.cut.start - 0.05);
      return t - e.cut.start < e.cut.end - t && before < e.cut.start ? before : e.cut.end;
    }
    return t;
  }

  function jumpTo(seconds, play) {
    try {
      el.player.currentTime = keptMoment(seconds);
      if (!play) return;
      var playing = el.player.play();
      if (playing && typeof playing.catch === 'function') playing.catch(function () { /* the person can press play */ });
    } catch (err) { /* the person can press play */ }
  }

  /** Which cues the search box matches: indexes, or null when the box is empty. */
  function searchMatches() {
    var cur = current();
    var query = String(el.transcriptSearch.value || '');
    if (!cur || !query.replace(/\s+/g, '')) return null;
    try { return Takes.captions.searchCues(cur.cues || [], query) || []; } catch (err) { return []; }
  }

  /** Show only the caption lines the search matches, and say how many there are. An empty box shows them all. */
  function applySearch() {
    var rows = el.cueList.children;
    var found = searchMatches();
    for (var i = 0; i < rows.length; i++) rows[i].hidden = found !== null && found.indexOf(i) === -1;
    el.transcriptCount.textContent = found === null ? ''
      : found.length === 0 ? 'No matches'
        : found.length === 1 ? '1 match' : found.length + ' matches';
  }

  /** The open recording as its caption files need it: in the saved video's time, removed parts left out. */
  function transcriptSource() {
    var cur = current();
    if (!cur) return null;
    flushCues();
    return forCaptionsFile(cur, cutComesOut(cur, null));
  }

  function copyWithTextarea(text) {
    var doc = root.document;
    var box = doc.createElement('textarea');
    box.className = 'tk-sr-only';
    box.setAttribute('aria-hidden', 'true');
    box.value = text;
    doc.body.appendChild(box);
    var ok = false;
    try {
      box.select();
      ok = !!doc.execCommand('copy');
    } catch (err) { ok = false; }
    doc.body.removeChild(box);
    return ok;
  }

  function onCopyTranscript() {
    var source = transcriptSource();
    if (!source) return;
    var text = Takes.captions.toText(source.cues || []);
    var said = function (ok) {
      if (ok) emitToast('info', 'Transcript copied');
      else emitToast('error', 'The transcript could not be copied. Use Download text (.txt) instead.');
      try { el.transcriptCopy.focus(); } catch (err) { /* focus is a nicety */ }
    };
    var clip = null;
    try { clip = root.navigator && root.navigator.clipboard ? root.navigator.clipboard : null; } catch (err) { clip = null; }
    if (clip && typeof clip.writeText === 'function') {
      clip.writeText(text).then(function () { said(true); }, function () { said(copyWithTextarea(text)); });
    } else {
      said(copyWithTextarea(text));
    }
  }

  function onCueInput(index, input) {
    var cur = current();
    if (!cur || !cur.cues[index]) return;
    if (saving) { input.value = cur.cues[index].text; return; }
    patchKnown(cur.id,{captionReviewed:false});
    el.optBurn.checked = false; exportCache = null; renderSaveOptions();
    cur.cues[index] = { start: cur.cues[index].start, end: cur.cues[index].end, text: input.value };
    if (searchMatches() !== null) {
      // The count follows the typing; the row being typed in stays put until the search itself changes.
      var found = searchMatches();
      el.transcriptCount.textContent = found.length === 0 ? 'No matches' : found.length === 1 ? '1 match' : found.length + ' matches';
    }
    if (cueTimer !== null) root.clearTimeout(cueTimer.timer);
    cueTimer = {
      id: cur.id,
      cues: cur.cues,
      timer: root.setTimeout(function () {
        if (current() && current().id === cur.id) attachCues();
        flushCues();
      }, 400)
    };
  }

  /** Store corrected caption text now, without waiting for the pause in typing. */
  function commitCues() {
    if (cueTimer === null) return;
    var id = cueTimer.id;
    flushCues();
    if (current() && current().id === id) attachCues();
  }

  function makeCueRow(cue, index) {
    var doc = root.document;
    var li = doc.createElement('li');
    li.className = 'tk-cue';
    li.setAttribute('data-index', String(index));

    var jump = doc.createElement('button');
    jump.type = 'button';
    jump.className = 'tk-cue-time';
    jump.textContent = time(cue.start);
    jump.setAttribute('aria-label', 'Play from ' + time(cue.start));
    on(jump, 'click', function () {
      var cur = current();
      var now = cur && cur.cues[index] ? cur.cues[index] : cue;
      jumpTo(now.start, true);
    });

    var input = doc.createElement('textarea');
    input.rows = 2;
    input.className = 'tk-input tk-cue-input';
    input.value = cue.text == null ? '' : String(cue.text);
    input.setAttribute('aria-label', 'Caption at ' + time(cue.start));
    input.spellcheck = true;
    on(input, 'input', function () { onCueInput(index, input); });
    // Enter finishes this line and moves to the next one; Shift with Enter makes a new line.
    on(input, 'keydown', function (event) {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      commitCues();
      var next = li.nextElementSibling ? li.nextElementSibling.querySelector('.tk-cue-input') : null;
      if (next) next.focus();
      else input.blur();
    });
    on(input, 'blur', commitCues);

    li.appendChild(jump);
    li.appendChild(input);
    return li;
  }

  /** Bring the whole captions panel in line with the open recording. */
  var transcriptFor = null;   // the recording the search box belongs to

  function renderCaptions() {
    var cur = current();
    if (!cur) return;
    var cues = cur.cues || [];
    renderTitleSuggestion();
    var busyHere = captionRunId === cur.id;

    setHidden(el.captionsLong, !(Number(cur.durationMs) > 300000) || cues.length > 0);
    el.captionsAdd.disabled = captionsBusy();
    el.captionsLanguage.disabled = captionsBusy() || saving;
    if (busyHere) el.captionsAdd.classList.add('tk-is-busy');
    else el.captionsAdd.classList.remove('tk-is-busy');
    el.captionsAdd.textContent = cues.length ? 'Make captions again' : 'Add captions';
    if (!busyHere) hideCaptionProgress();
    else if (captionProgress) showCaptionProgress(captionProgress.phase, captionProgress.pct);

    while (el.cueList.firstChild) el.cueList.removeChild(el.cueList.firstChild);
    for (var i = 0; i < cues.length; i++) el.cueList.appendChild(makeCueRow(cues[i], i));

    setHidden(el.captionsToggleWrap, cues.length === 0);
    setHidden(el.captionsDownload, cues.length === 0);
    setHidden(el.captionsFileNote, cues.length === 0);
    renderSaveOptions();
    setHidden(el.transcriptTools, cues.length === 0);
    setHidden(el.transcriptCopy, cues.length === 0);
    setHidden(el.transcriptTxt, cues.length === 0);
    setHidden(el.transcriptSrt, cues.length === 0);
    if (transcriptFor !== cur.id) {
      // Another recording: its search starts empty.
      transcriptFor = cur.id;
      el.transcriptSearch.value = '';
    }
    applySearch();
    setHidden(el.captionsEmpty, !(noSpeech[cur.id] === true && cues.length === 0));
    attachCues();
  }

  function onCaptionsProgress(payload) {
    if (!payload || payload.id !== captionRunId) return;
    captionProgress = { phase: payload.phase, pct: typeof payload.pct === 'number' ? payload.pct : null };
    var cur = current();
    if (cur && cur.id === captionRunId) showCaptionProgress(captionProgress.phase, captionProgress.pct);
  }

  function onAddCaptions() {
    var cur = current();
    if (!cur || captionsBusy()) return;
    flushCues();

    if (starting || recState !== 'idle') {
      emitToast('info', 'A recording is in progress. Add captions when it is finished.');
      return;
    }
    var id = cur.id;
    var language = el.captionsLanguage.value;

    // The working state goes on screen first; the heavy work starts only after it.
    captionRunId = id;
    captionProgress = { phase: 'download', pct: 0 };
    delete noSpeech[id];
    setHidden(el.captionsEmpty, true);
    el.captionsAdd.disabled = true;
    el.captionsLanguage.disabled = true;
    el.captionsAdd.classList.add('tk-is-busy');
    showCaptionProgress('download', 0);
    renderTitleSuggestion();

    var finish = function () {
      captionRunId = null;
      captionProgress = null;
      if (current()) renderCaptions();
    };

    var making;
    try { making = Takes.captions.generate(cur, { language: language }); } catch (err) { making = Promise.reject(err); }
    Promise.resolve(making).then(function (result) {
      var cues = result && result.cues ? result.cues : [];
      // By id, not by the object captured at the click: the screen may hold a newer copy by now.
      if (cues.length === 0) noSpeech[id] = true;
      else delete noSpeech[id];
      storeInLibrary(id, { cues: cues, captionLanguage: language, captionReviewed: false });
      refreshTranscriptTitle(latest(cur));
      finish();
    }, function (err) {
      if (!quiet(err)) emitToast('error', 'Captions could not be made. Click Add captions to try again.');
      finish();
    });
  }

  function initCaptions() {
    if (typeof Takes.captions.DOWNLOAD_SIZE_TEXT === 'string') {
      el.captionsSize.textContent = Takes.captions.DOWNLOAD_SIZE_TEXT;
    }
    // The size for this very computer, when the captions module can work it out; the range above stays otherwise.
    if (typeof Takes.captions.downloadSizeText === 'function') {
      try {
        Promise.resolve(Takes.captions.downloadSizeText()).then(function (text) {
          if (typeof text === 'string' && text) el.captionsSize.textContent = text;
        }, function () { /* the range is already shown */ });
      } catch (err) { /* the range is already shown */ }
    }
    el.captionsLong.textContent = 'This recording is longer than 5 minutes, so captions will take a while, ' +
      'and the page may pause while it works.';
    on(el.captionsAdd, 'click', onAddCaptions);
    on(byId('tk-captions-approve'),'click',function () {
      var cur = current(); if (!cur || saving || captionRunId !== null || !cur.cues.length) return;
      commitCues(); storeInLibrary(cur.id,{captionReviewed:true}); exportCache = null; renderSaveOptions();
    });
    on(el.captionsToggle, 'change', setTrackMode);
    on(el.captionsDownload, 'click', function () {
      var cur = current();
      if (!captionsApproved(cur)) return;
      flushCues();
      // Beside a trimmed file the times must match that file, so they are shifted for the trim.
      Takes.captions.downloadVtt(forCaptionsFile(cur, cutComesOut(cur, null)), false);
    });
    Takes.bus.on('captions:progress', onCaptionsProgress);

    on(el.transcriptSearch, 'input', applySearch);
    on(el.transcriptSearch, 'search', applySearch); // the little clear cross in the box
    on(el.transcriptSearch, 'keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var found = searchMatches();
      var cur = current();
      if (found && found.length && cur && cur.cues[found[0]]) jumpTo(cur.cues[found[0]].start, false);
    });
    on(el.transcriptCopy, 'click', onCopyTranscript);
    on(el.transcriptTxt, 'click', function () {
      var source = transcriptSource();
      if (source) Takes.captions.downloadText(source, false);
    });
    on(el.transcriptSrt, 'click', function () {
      if (!captionsApproved(current())) return;
      var source = transcriptSource();
      if (source) Takes.captions.downloadSrt(source, false);
    });
  }

  // ================================================================ 13. library

  var thumbs = {};          // recording id -> a small picture of its first frame, or '' when none could be made
  var thumbQueue = [];
  var thumbBusy = false;
  var pendingDeleteId = null;

  function findCard(id) {
    var cards = el.libraryList.children;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-id') === String(id)) return cards[i];
    }
    return null;
  }

  function paintThumb(node, dataUrl) {
    if (!node || !dataUrl) return;
    node.style.backgroundImage = 'url("' + dataUrl + '")';
    node.style.backgroundSize = 'cover';
    node.style.backgroundPosition = 'center';
  }

  /** One frame from near the start of a recording, as a small picture. Calls back with '' when it cannot be made. */
  function grabFrame(recording, done) {
    var doc = root.document;
    var url = '';
    var video = null;
    var timer = null;
    var finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      root.clearTimeout(timer);
      if (video) { try { video.removeAttribute('src'); video.load(); } catch (err) { /* gone */ } }
      if (url) { try { root.URL.revokeObjectURL(url); } catch (err2) { /* gone */ } }
      done(result);
    }
    try {
      url = root.URL.createObjectURL(recording.blob);
      video = doc.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      on(video, 'loadeddata', function () {
        try { video.currentTime = Math.min(0.2, durationOf(recording) / 2); } catch (err) { finish(''); }
      });
      on(video, 'seeked', function () {
        try {
          var w = 320;
          var h = 180;
          var canvas = doc.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          var vw = video.videoWidth;
          var vh = video.videoHeight;
          if (!ctx || !vw || !vh) { finish(''); return; }
          var scale = Math.max(w / vw, h / vh);
          ctx.drawImage(video, (w - vw * scale) / 2, (h - vh * scale) / 2, vw * scale, vh * scale);
          finish(canvas.toDataURL('image/jpeg', 0.72));
        } catch (err) {
          finish('');
        }
      });
      on(video, 'error', function () { finish(''); });
      timer = root.setTimeout(function () { finish(''); }, 5000);
      video.src = url;
    } catch (err) {
      finish('');
    }
  }

  // One at a time, so a long library never has many videos decoding at once.
  function nextThumb() {
    if (thumbBusy || !thumbQueue.length) return;
    var recording = thumbQueue.shift();
    if (Object.prototype.hasOwnProperty.call(thumbs, recording.id)) { nextThumb(); return; }
    thumbBusy = true;
    grabFrame(recording, function (dataUrl) {
      thumbs[recording.id] = dataUrl;
      thumbBusy = false;
      var card = findCard(recording.id);
      if (card && dataUrl) paintThumb(card.querySelector('.tk-card-thumb'), dataUrl);
      nextThumb();
    });
  }

  function finishRename(card, recording, input, commit) {
    if (input.hidden) return;
    setHidden(input, true);
    card.classList.remove('tk-is-editing');
    var name = String(input.value || '').replace(/^\s+|\s+$/g, '');
    if (!commit || !name || name === recording.name) return;
    patchKnown(recording.id,{name:name,titleSource:'manual'});
    var cur = current();
    if (cur && cur.id === recording.id) {
      cur.name = name;
      el.reviewName.value = name;
      renderTitleSuggestion();
    }
    try {
      Takes.library.rename(recording.id, name).then(null, function () { /* handled inside the library */ });
    } catch (err) { /* the list is drawn again on the next change */ }
  }

  function askDelete(recording) {
    pendingDeleteId = recording.id;
    el.confirmText.textContent = 'This removes "' + (recording.name || 'this recording') +
      '" from your library. Files you already downloaded are not touched.';
    try {
      if (!el.confirm.open) el.confirm.showModal();
      el.confirmCancel.focus();
    } catch (err) {
      pendingDeleteId = null;
      emitToast('error', 'The delete question could not be shown. Reload the page and try again.');
    }
  }

  function closeConfirm() {
    pendingDeleteId = null;
    try { if (el.confirm.open) el.confirm.close(); } catch (err) { /* already closed */ }
  }

  function confirmDelete() {
    var id = pendingDeleteId;
    closeConfirm();
    if (id === null) return;
    var cur = current();
    if (cur && cur.id === id) {
      // The open recording is the one being deleted: close it before it goes.
      if (editTimer !== null) { root.clearTimeout(editTimer.timer); editTimer = null; }
      if (cueTimer !== null) { root.clearTimeout(cueTimer.timer); cueTimer = null; }
      Takes.state.current = null;
      try { el.player.pause(); el.player.removeAttribute('src'); el.player.load(); } catch (err) { /* nothing loaded */ }
      if (playerUrl) { try { root.URL.revokeObjectURL(playerUrl); } catch (err2) { /* gone */ } playerUrl = ''; }
      if (currentView === 'review') show('library', true);
    }
    delete thumbs[id];
    try {
      Takes.library.remove(id).then(null, function () { /* handled inside the library */ });
    } catch (err3) { /* the list is drawn again on the next change */ }
  }

  function makeCard(recording) {
    var doc = root.document;
    var li = doc.createElement('li');
    li.className = 'tk-card';
    li.setAttribute('data-id', String(recording.id));

    var open = doc.createElement('button');
    open.type = 'button';
    open.className = 'tk-card-open';
    var thumb = doc.createElement('span');
    thumb.className = 'tk-card-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    var name = doc.createElement('span');
    name.className = 'tk-card-name';
    name.textContent = recording.name || 'Recording';
    open.appendChild(thumb);
    open.appendChild(name);
    on(open, 'click', function () {
      var cur = current();
      // The one already open keeps what is on screen, edits not yet stored included.
      if (cur && cur.id === recording.id) {
        renderTrim();
        renderCaptions();
        show('review', true);
      } else {
        openReview(recording);
      }
    });

    var meta = doc.createElement('p');
    meta.className = 'tk-card-meta';
    meta.textContent = describe(recording);

    var input = doc.createElement('input');
    input.type = 'text';
    input.className = 'tk-input tk-card-name-input';
    input.maxLength = 120;
    input.setAttribute('aria-label', 'New name for ' + (recording.name || 'this recording'));
    input.hidden = true;
    on(input, 'keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); finishRename(li, recording, input, true); }
      else if (event.key === 'Escape') { event.preventDefault(); finishRename(li, recording, input, false); rename.focus(); }
    });
    on(input, 'blur', function () { finishRename(li, recording, input, true); });

    var actions = doc.createElement('div');
    actions.className = 'tk-card-actions';
    var rename = doc.createElement('button');
    rename.type = 'button';
    rename.className = 'tk-btn tk-btn-ghost tk-card-rename';
    rename.textContent = 'Rename';
    on(rename, 'click', function () {
      input.value = recording.name || '';
      setHidden(input, false);
      li.classList.add('tk-is-editing');
      input.focus();
      input.select();
    });
    var del = doc.createElement('button');
    del.type = 'button';
    del.className = 'tk-btn tk-btn-danger tk-card-delete';
    del.textContent = 'Delete';
    on(del, 'click', function () { askDelete(recording); });
    actions.appendChild(rename);
    actions.appendChild(del);

    li.appendChild(open);
    li.appendChild(meta);
    li.appendChild(input);
    li.appendChild(actions);

    if (thumbs[recording.id]) paintThumb(thumb, thumbs[recording.id]);
    else if (!Object.prototype.hasOwnProperty.call(thumbs, recording.id) && recording.blob) thumbQueue.push(recording);
    return li;
  }

  function renderLibrary() {
    if (!el.libraryList) return;
    var list = Takes.state.recordings || [];
    thumbQueue = [];
    while (el.libraryList.firstChild) el.libraryList.removeChild(el.libraryList.firstChild);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id != null) el.libraryList.appendChild(makeCard(list[i]));
    }
    setHidden(el.libraryEmpty, el.libraryList.children.length > 0);
    setHidden(el.libraryNote, Takes.state.caps.indexedDB !== false);
    markActiveCard();
    nextThumb();
  }

  function initLibrary() {
    Takes.bus.on('library:changed', renderLibrary);
    on(el.confirmCancel, 'click', closeConfirm);
    on(el.confirmOk, 'click', confirmDelete);
    on(el.confirm, 'close', function () { pendingDeleteId = null; });
    renderLibrary();
    // Recordings kept from earlier visits.
    try {
      Takes.library.list().then(renderLibrary, function () { /* handled inside the library */ });
    } catch (err) { /* the list stays empty */ }
  }

  // ================================================================ 14. boot

  function init() {
    if (started || !root.document || !root.document.body) return;
    started = true;
    collect();
    initToasts();   // first, so anything said during start-up is seen
    writeName();
    initCaps();
    initGuide();
    initViews();
    initSetup();
    initRecording();
    initRecbar();
    initReview();
    initTrim();
    initSave();
    initCaptions();
    initLibrary();
  }

  var api = { init: init, show: function (view) { show(view, false); } };
  if (Takes) Takes.ui = api;

  // Under Node there is no document, so nothing below runs and the file does nothing.
  if (Takes && root.document && typeof root.document.addEventListener === 'function') {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
