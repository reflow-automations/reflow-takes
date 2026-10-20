import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
require('../src/js/core.js');
const titles=require('../src/js/titles.js');
const cue=text=>[{start:0,end:8,text}];

test('Dutch title removes the spoken introduction but preserves the topic and accents',()=>{
  assert.equal(titles.suggest(cue('Hoi allemaal, vandaag laat ik zien hoe je een automatische e-mailopvolging instelt.')),'Hoe je een automatische e-mailopvolging instelt');
  assert.equal(titles.suggest(cue('In deze video bespreek ik de resultaten van de LinkedIn-campagne.')),'De resultaten van de LinkedIn-campagne');
  assert.equal(titles.suggest(cue('Vandaag bespreek ik café-reserveringen in België.')),'Café-reserveringen in België');
});

test('English transcript produces an English title without a translation service',()=>{
  assert.equal(titles.suggest(cue("Hi everyone, today I'll show you how to record your screen without uploading files.")),'How to record your screen without uploading files');
});

test('empty, silence and filler-only transcripts leave the existing name usable',()=>{
  for(const cues of [null,[],cue('[Music]'),cue('Ja ja ehm gewoon dus.'),cue('Thanks for watching.')]) assert.equal(titles.suggest(cues),'');
});

test('titles omit removed or partly removed cues rather than leak cut words',()=>{
  const cues=[{start:0,end:2,text:'Secret account access codes and passwords.'},{start:3,end:5,text:'How to repair a broken webhook.'}];
  assert.equal(titles.suggest(cues,{ranges:[[2,8]]}),'How to repair a broken webhook');
  assert.equal(titles.suggest(cues,{ranges:[[1,1.5]]}),'');
  assert.equal(titles.suggest(cues,{ranges:[]}),'');
});

test('long sentences stay short and do not cut through a word',()=>{
  const result=titles.suggest(cue('How to configure automated customer follow-up messages with reliable delivery checks and detailed notifications for the sales team.'));
  assert.ok(result.length<=80);
  assert.ok(result.split(/\s+/).length<=12);
  assert.ok(!/\b(with|and|for|the)$/.test(result));
});

test('collisions get a stable suffix and the same recording is ignored',()=>{
  const rows=[{id:'1',name:'Webhook herstellen'},{id:'2',name:'Webhook herstellen (2)'}];
  assert.equal(titles.unique('Webhook herstellen',rows,'3'),'Webhook herstellen (3)');
  assert.equal(titles.unique('Webhook herstellen',rows,'1'),'Webhook herstellen');
  assert.equal(titles.unique('',rows,'3'),'');
});
