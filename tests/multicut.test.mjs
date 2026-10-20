import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Takes } = require('../src/js/core.js');
const editor = require('../src/js/editor.js');
const captions = require('../src/js/captions.js');
const edits = { version: 2, trimStart: 0.5, trimEnd: 7.5, cuts: [{ start: 1, end: 2 }, { start: 4, end: 5 }] };

test('multiple cuts share the same ranges, duration and source-time mapping', () => {
  assert.deepEqual(editor.keptRanges(edits, 8), [[0.5, 1], [2, 4], [5, 7.5]]);
  assert.equal(editor.editedDuration(edits, 8), 5);
  for (const t of [1, 1.5, 4, 4.99]) assert.equal(editor.mapTime(t, edits, 8), null);
  assert.equal(editor.mapTime(5, edits, 8), 2.5);
  assert.equal(editor.mapTime(7.5, edits, 8), 5);
});

test('overlaps, reversed cuts, adjacency and trim edges normalize without changing input', () => {
  const input = { trimStart: 1, trimEnd: 9, cuts: [{start:4,end:2},{start:3,end:5},{start:5,end:6},{start:-3,end:1.5},{start:9.5,end:11}] };
  const before = structuredClone(input);
  assert.deepEqual(editor.normalizeEdits(input, 10).cuts, [{start:1,end:1.5},{start:2,end:6}]);
  assert.deepEqual(input, before);
  assert.throws(() => editor.normalizeEdits({cuts:[{start:0,end:4},{start:4,end:7.8}]},8), RangeError);
});

test('v2 empty cut list overrides stale legacy data', () => {
  assert.equal(editor.editedDuration({cut:{start:1,end:3},cuts:[]},8),8);
  assert.deepEqual(editor.cutsOf(editor.normalizeEdits({cut:{start:1,end:3}},8)), [{start:1,end:3}]);
});

test('production frame retiming never reuses a frame originating inside a removed section', () => {
  assert.equal(editor._retimeMany(1.5,1,[{start:1,end:2}]), null);
  assert.deepEqual(editor._retimeMany(5,0.1,edits.cuts), {timestamp:3,duration:0.1});
  assert.equal(editor._retimeMany(4.5,0.1,edits.cuts), null);
});

test('caption export drops speech wholly inside either cut and shifts later speech', () => {
  const cues = [{start:1.2,end:1.8,text:'removed one'}, {start:4.2,end:4.8,text:'removed two'}, {start:5,end:6,text:'kept'}];
  assert.deepEqual(captions.shiftCuesForEdits(cues,edits), [{start:2.5,end:3.5,text:'kept'}]);
  assert.deepEqual(editor._cuesForExport(cues,edits), [{start:2.5,end:3.5,text:'kept'}]);
});

test('player skips both cuts', () => {
  const events = {};
  const video = {duration:8,currentTime:0.5,paused:true,addEventListener:(n,fn)=>events[n]=fn, removeEventListener:n=>delete events[n],pause(){this.paused=true;}};
  const detach = editor.attachPlayer(video,edits);
  video.currentTime=1.2; events.seeking({type:'seeking'}); assert.equal(video.currentTime,2);
  video.currentTime=4.2; events.seeking({type:'seeking'}); assert.equal(video.currentTime,5);
  detach(); assert.equal(Object.keys(events).length,0);
});

test('editor scrubbing can inspect removed source frames, while playback still skips them', () => {
  const events = {};
  const video = {duration:8,currentTime:0.5,paused:true,addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],pause(){this.paused=true;}};
  const detach = editor.attachPlayer(video,edits,{allowPausedSeeking:true});
  video.currentTime=4.2; events.seeking({type:'seeking'}); assert.equal(video.currentTime,4.2);
  events.timeupdate({type:'timeupdate'}); assert.equal(video.currentTime,4.2);
  video.paused=false; events.play({type:'play'}); assert.equal(video.currentTime,5);
  detach();
});

test('portrait preview keeps captions inside a tall source when no lower caption band exists', () => {
  const text=[];
  const ctx={drawImage(){},fillRect(){},beginPath(){},roundRect(){},fill(){},measureText(s){return {width:s.length*20};},fillText(s,x,y){text.push({s,x,y});}};
  const canvas={width:0,height:0,getContext(){return ctx;}};
  const video={videoWidth:1080,videoHeight:1920,readyState:2,currentTime:1,seeking:false};
  assert.equal(editor.renderPreview(canvas,video,{size:'vertical',burnCaptions:true,cues:[{start:0,end:2,text:'Review me'}]}),true);
  assert.equal(canvas.width,1080); assert.equal(canvas.height,1920);
  assert.equal(text.length,1); assert.ok(text[0].y>0 && text[0].y<1920);
  video.seeking=true; assert.equal(editor.renderPreview(canvas,video,{size:'vertical'}),false);
});
