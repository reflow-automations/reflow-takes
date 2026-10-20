/* takes:titles */
/* Extractive transcript titles. No network, external model, or invented facts. */
(function (root) {
  'use strict';
  var Takes = root.Takes;
  var STOP = new Set(('de het een en of van voor met naar bij op in uit aan over om te dat dit deze die er is zijn was worden wordt ik je jij jullie u we wij ze zij mijn jouw ons onze niet wel ook dan nog maar dus even eigenlijk gewoon eh ehm uh um ja nee hallo hoi hey allemaal welkom terug vandaag video opname filmpje laat laten zien gaan ga wil willen graag bedankt dank kijken doei tot volgende keer '+
    'a an the and or of for with to at on in from about that this these those it is are was were be been being i you your my we our they their not yes no so just also now then well really actually hi hello everyone everybody welcome back today video show showing going would like thanks thank watching bye please').split(/\s+/));
  var MAX_CHARS = 80;

  function clean(text) {
    var value = String(text || '').normalize('NFKC').replace(/https?:\/\/\S+/gi,'')
      .replace(/\[(?:music|muziek|applause|applaus|silence|stilte|noise|gelach)\]/gi,'')
      .replace(/\s+/g,' ').trim();
    var prefixes = [
      /^(?:hoi|hallo|hey|hi|hello|goedemorgen|goedemiddag|goedenavond)(?:\s+(?:allemaal|everyone|everybody|all))?[\s,!.:]+/i,
      /^(?:(?:in deze video|in dit filmpje|vandaag)[,\s]+)?(?:laat ik\s*(?:je |jullie )?zien|laten we zien|ga ik (?:je |jullie )?(?:laten zien|uitleggen)|wil ik (?:even )?(?:laten zien|uitleggen)|ik wil (?:even )?(?:laten zien|uitleggen)|bespreek ik|bespreken we|gaan we (?:kijken naar|het hebben over))\s+/i,
      /^(?:(?:in this video|today)[,\s]+)?(?:i(?:'ll| will| am going to|'m going to) (?:show you|explain|cover)|we(?:'ll| will|'re going to) (?:look at|cover|discuss)|let me show you)\s+/i,
      /^(?:ik wil graag|i would like to)\s+/i
    ];
    for (var pass=0;pass<3;pass++) prefixes.forEach(function (re) { value = value.replace(re,'').trim(); });
    return value.replace(/^[\s,.:;!?]+|[\s,.:;!?]+$/g,'');
  }

  function terms(text) {
    return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [])
      .filter(function (word) { return word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word); });
  }

  function shorten(text) {
    var words = text.split(/\s+/), kept = [];
    for (var i=0;i<words.length && kept.length<12;i++) {
      if (kept.concat(words[i]).join(' ').length > MAX_CHARS) break;
      kept.push(words[i]);
    }
    while (kept.length>2 && /^(?:en|of|van|voor|met|naar|bij|op|in|uit|aan|om|te|de|het|een|and|or|of|for|with|to|at|on|in|from|the|a|an)$/i.test(kept[kept.length-1])) kept.pop();
    var result = kept.join(' ').replace(/[,:;]+$/,'');
    return result ? result[0].toLocaleUpperCase() + result.slice(1) : '';
  }

  function suggest(cues, options) {
    if (!Array.isArray(cues)) return '';
    var ranges = options && options.ranges;
    // Only fully kept cues: a sentence partly cut out may still contain removed words.
    var retained = cues.filter(function (cue) {
      if (!cue || typeof cue.text !== 'string') return false;
      if (!Array.isArray(ranges)) return true;
      return ranges.some(function (r) { return Number(cue.start)>=r[0]-0.001 && Number(cue.end)<=r[1]+0.001 && Number(cue.end)>Number(cue.start); });
    });
    var parts = [], end = null;
    retained.forEach(function (cue) {
      if (end !== null && Number(cue.start)>end+0.5) parts.push('.');
      parts.push(cue.text); end = Number(cue.end);
    });
    var sentences = parts.join(' ').replace(/\s+/g,' ').split(/(?<=[.!?])\s+|\n+/u);
    var candidates = sentences.map(function (text,index) {
      var title = shorten(clean(text));
      return {title:title, words:Array.from(new Set(terms(title))), index:index};
    }).filter(function (c) { return c.title.length>=4 && c.words.length>0; });
    if (!candidates.length) return '';
    var counts = Object.create(null);
    candidates.forEach(function (c) { c.words.forEach(function (w) { counts[w]=(counts[w]||0)+1; }); });
    candidates.forEach(function (c) {
      var score = c.words.reduce(function (n,w) { return n+1+Math.log(counts[w]); },0) / Math.sqrt(c.words.length);
      if (/^(?:hoe\b|how\b|waarom\b|why\b)/i.test(c.title)) score += 0.6;
      if (/\b(?:welkom|welcome|bedankt|thanks|thank you|abonneer|subscribe)\b/i.test(c.title)) score -= 3;
      c.score = score - c.index*0.025;
    });
    candidates.sort(function (a,b) { return b.score-a.score || a.index-b.index; });
    return candidates[0].score>0 ? candidates[0].title : '';
  }

  function unique(title, recordings, id) {
    if (!title) return '';
    var used = new Set((recordings || []).filter(function (r) { return r && r.id!==id; }).map(function (r) { return String(r.name || '').toLocaleLowerCase(); }));
    var result = title, n = 2;
    while (used.has(result.toLocaleLowerCase())) result = title + ' (' + n++ + ')';
    return result;
  }

  var api = {suggest:suggest, unique:unique};
  if (Takes) Takes.titles = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
