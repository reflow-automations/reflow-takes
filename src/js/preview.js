/* takes:preview */
/* A live view of the actual compositor output, optionally in an always-on-top window. */
(function (root) {
  'use strict';
  var Takes = root.Takes;
  var stream = null, pip = null, views = [], surface = '';
  var styles = 'body{margin:0;background:#131c2b;color:#fff;font:14px system-ui} .preview{width:100%} .preview video{display:block;width:100%;height:auto;max-height:65vh;object-fit:contain;background:#111;touch-action:none} .preview-controls{display:flex;flex-wrap:wrap;gap:8px;padding:10px} .preview button,.preview select{font:inherit;padding:8px;border:1px solid #888;border-radius:7px;background:#203247;color:inherit} .preview p{font:13px system-ui;line-height:1.5;margin:8px 10px}';

  function refresh() {
    var layout = Takes.compositor.layout();
    views.forEach(function (view) {
      view.position.hidden = !layout;
      view.colorLabel.hidden = !layout;
      view.sizeLabel.hidden = !layout;
      view.video.style.cursor = layout ? 'move' : 'default';
      if (layout) { view.color.value = layout.color; view.size.value = Math.round(layout.scale * 100); view.sizeValue.textContent = view.size.value + '%'; }
      view.note.textContent = !stream ? 'Start recording to see your live preview.'
        : layout ? 'This is your recorded frame. Click or drag the camera to move it. Arrow keys also work.'
          : 'Live preview of your recording.';
      view.warning.hidden = surface !== 'monitor';
      var state = Takes.recorder.getState();
      view.pause.textContent = state === 'paused' ? 'Resume' : 'Pause';
      view.pause.disabled = state !== 'recording' && state !== 'paused';
      view.stop.disabled = state !== 'recording' && state !== 'paused' && state !== 'countdown';
    });
  }

  function wireVideo(video) {
    var dragging = false;
    function move(event) {
      if (!Takes.compositor.layout()) return;
      var r = video.getBoundingClientRect();
      // object-fit: contain can letterbox tall screens; map only the actual picture.
      var scale = Math.min(r.width / video.videoWidth, r.height / video.videoHeight);
      var w = video.videoWidth * scale, h = video.videoHeight * scale;
      if (!(w > 0 && h > 0)) return;
      Takes.compositor.updateBubble({ x: (event.clientX - r.left - (r.width - w) / 2) / w,
        y: (event.clientY - r.top - (r.height - h) / 2) / h });
    }
    video.tabIndex = 0;
    video.addEventListener('pointerdown', function (event) {
      if (!Takes.compositor.layout()) return;
      event.preventDefault(); dragging = true; video.setPointerCapture(event.pointerId); move(event);
    });
    video.addEventListener('pointermove', function (event) { if (dragging) move(event); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
      video.addEventListener(name, function () { dragging = false; });
    });
    video.addEventListener('keydown', function (event) {
      var l = Takes.compositor.layout();
      if (!l || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(event.key) < 0) return;
      event.preventDefault();
      Takes.compositor.updateBubble({ x: (l.x + l.w / 2) / l.width + (event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0),
        y: (l.y + l.h / 2) / l.height + (event.key === 'ArrowDown' ? 0.02 : event.key === 'ArrowUp' ? -0.02 : 0) });
    });
  }

  function makeView(doc, host, video) {
    host.classList.add('preview');
    if (!video) { video = doc.createElement('video'); host.appendChild(video); }
    video.muted = true; video.autoplay = true; video.playsInline = true;
    video.setAttribute('aria-label', 'Live recording preview. Click or drag to position the camera.');
    wireVideo(video);
    var controls = doc.createElement('div'); controls.className = 'preview-controls';
    var position = doc.createElement('select'); position.setAttribute('aria-label', 'Camera position');
    [['','Move camera'],['top-left','Top left'],['top-right','Top right'],['bottom-left','Bottom left'],['bottom-right','Bottom right']].forEach(function (item) {
      var option = doc.createElement('option'); option.value = item[0]; option.textContent = item[1]; position.appendChild(option);
    });
    position.addEventListener('change', function () { Takes.compositor.updateBubble({corner:position.value}); });
    var colorLabel = doc.createElement('label'); colorLabel.textContent = 'Border ';
    var color = doc.createElement('input'); color.type = 'color'; color.value = '#ffffff'; color.setAttribute('aria-label','Camera border color');
    color.addEventListener('input', function () { Takes.compositor.updateBubble({color:color.value}); }); colorLabel.appendChild(color);
    var sizeLabel = doc.createElement('label'); sizeLabel.textContent = 'Size ';
    var size = doc.createElement('input'); size.type = 'range'; size.min = '10'; size.max = '50'; size.step = '1'; size.value = '22'; size.setAttribute('aria-label','Camera size');
    var sizeValue = doc.createElement('output'); sizeValue.textContent = '22%';
    size.addEventListener('input', function () { Takes.compositor.updateBubble({scale:Number(size.value)/100}); });
    sizeLabel.append(size, sizeValue);
    var pause = doc.createElement('button'); pause.type = 'button';
    pause.addEventListener('click', function () { Takes.recorder[Takes.recorder.getState() === 'paused' ? 'resume' : 'pause'](); });
    var stop = doc.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop'; stop.addEventListener('click', function () { Takes.recorder.stop(); });
    controls.append(position, colorLabel, sizeLabel, pause, stop);
    var note = doc.createElement('p'), warning = doc.createElement('p');
    warning.textContent = 'You are sharing an entire screen. Keep this preview on another monitor, or share a tab/window so the preview is not captured too.';
    host.append(controls, note, warning);
    var view = {video:video, host:host, position:position, color:color, colorLabel:colorLabel, size:size, sizeLabel:sizeLabel, sizeValue:sizeValue, pause:pause, stop:stop, note:note, warning:warning};
    views.push(view);
    return view;
  }

  function setStream(view) {
    view.video.srcObject = stream;
    if (stream) { view.video.hidden = false; view.video.play().catch(function () {}); }
  }

  function start(nextStream, displaySurface) {
    stream = nextStream; surface = displaySurface || '';
    var host = root.document.getElementById('tk-live-preview');
    if (!views.some(function (view) { return view.host === host; })) makeView(root.document, host, root.document.getElementById('tk-camera-preview'));
    host.hidden = false;
    views.forEach(setStream); refresh();
  }

  async function open() {
    if (!root.documentPictureInPicture) {
      Takes.bus.emit('toast',{kind:'info',text:'Floating preview requires desktop Chrome or Edge. The live preview stays available in this tab.'}); return;
    }
    if (pip && !pip.closed) { pip.focus(); return; }
    try {
      var win = await root.documentPictureInPicture.requestWindow({width:520,height:440});
      pip = win;
      var style = win.document.createElement('style'); style.textContent = styles; win.document.head.appendChild(style);
      win.document.title = 'Reflow Takes live preview';
      var host = win.document.createElement('div'); win.document.body.appendChild(host);
      var view = makeView(win.document,host); setStream(view); refresh();
      win.addEventListener('pagehide', function () { view.video.srcObject = null; views = views.filter(function (v) { return v !== view; }); if (pip === win) pip = null; });
    } catch (err) { Takes.bus.emit('toast',{kind:'info',text:'The floating preview could not open. Use Open floating preview again in Chrome or Edge.'}); }
  }

  function stop() {
    stream = null; surface = '';
    views.forEach(function (v) { v.video.pause(); v.video.srcObject = null; });
    if (pip && !pip.closed) pip.close();
    pip = null;
    var host = root.document && root.document.getElementById('tk-live-preview');
    if (host) host.hidden = true;
    refresh();
  }

  Takes.bus.on('bubble:changed', refresh);
  Takes.bus.on('record:state', refresh);
  Takes.preview = {start:start,stop:stop,open:open};
})(typeof window !== 'undefined' ? window : globalThis);
