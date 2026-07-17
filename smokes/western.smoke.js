// western.smoke.js — sargam → Western staff notation (via MusicXML).
// The interesting half is the SPELLING: each sargam degree owns a letter
// name (Sa=tonic letter, Re=2nd, Ga=3rd, Ma=4th, Pa=5th, Dha=6th, Ni=7th)
// and komal/tivra become the accidental. So the spelling falls out of the
// scale-degree identity sargam already states — no key-signature guessing.
import assert from 'node:assert/strict';
import { spellDegree, documentToMusicXML } from '../src/engine/western.js';
import { parseDocument } from '../src/engine/parse.js';

const spell = (saStr, ch, oct = 0) => {
  const s = spellDegree(saStr, ch, oct);
  return `${s.step}${s.alter > 0 ? '#'.repeat(s.alter) : s.alter < 0 ? 'b'.repeat(-s.alter) : ''}${s.octave}`;
};

export const smokes = [
  // ---------- spelling: sarod's C ----------
  {
    name: 'spell: sa C — the full sargam gamut spells as C major with accidentals',
    fn() {
      assert.equal(spell('C', 'S'), 'C3');
      assert.equal(spell('C', 'r'), 'Db3', 'komal re = flattened 2nd letter');
      assert.equal(spell('C', 'R'), 'D3');
      assert.equal(spell('C', 'g'), 'Eb3', 'komal ga = flattened 3rd letter');
      assert.equal(spell('C', 'G'), 'E3');
      assert.equal(spell('C', 'm'), 'F3', 'shuddh ma = natural 4th');
      assert.equal(spell('C', 'M'), 'F#3', 'tivra ma = sharpened 4th');
      assert.equal(spell('C', 'P'), 'G3');
      assert.equal(spell('C', 'd'), 'Ab3');
      assert.equal(spell('C', 'D'), 'A3');
      assert.equal(spell('C', 'n'), 'Bb3');
      assert.equal(spell('C', 'N'), 'B3');
    },
  },
  // ---------- spelling: sitar's D, vocal's A ----------
  {
    name: "spell: sa D (sitar) — komal ga is F natural, not E#",
    fn() {
      assert.equal(spell('D', 'S'), 'D3');
      assert.equal(spell('D', 'r'), 'Eb3');
      assert.equal(spell('D', 'g'), 'F3', 'the 3rd letter from D is F — natural here');
      assert.equal(spell('D', 'G'), 'F#3');
      assert.equal(spell('D', 'M'), 'G#3');
      assert.equal(spell('D', 'n'), 'C4', 'the 7th letter wraps the octave');
      assert.equal(spell('D', 'N'), 'C#4');
    },
  },
  {
    name: "spell: sa A3 (vocal classes) — komal ni is G natural",
    fn() {
      assert.equal(spell('A3', 'S'), 'A3');
      assert.equal(spell('A3', 'g'), 'C4');
      assert.equal(spell('A3', 'P'), 'E4');
      assert.equal(spell('A3', 'n'), 'G4');
      assert.equal(spell('A3', 'N'), 'G#4');
    },
  },
  {
    name: 'spell: octave marks shift the register, letters stay honest',
    fn() {
      assert.equal(spell('C', 'S', 1), 'C4', 'taar sa');
      assert.equal(spell('C', 'S', -1), 'C2', 'mandra sa');
      assert.equal(spell('C', 'n', -1), 'Bb2');
      assert.equal(spell('A3', 'S', 1), 'A4');
    },
  },
  {
    name: 'spell: midi agrees with the pitch machinery schedule.js already uses',
    fn() {
      assert.equal(spellDegree('C', 'S').midi, 48, 'C3');
      assert.equal(spellDegree('A3', 'S').midi, 57, 'A3 = 220Hz');
      assert.equal(spellDegree('A3', 'P').midi, 64, 'E4');
      assert.equal(spellDegree('C', 'M').midi, 54, 'F#3');
    },
  },

  // ---------- MusicXML ----------
  {
    name: 'xml: emits a well-formed score-partwise with the title and raga',
    fn() {
      const src = 'title: Kahe Ko\nraga: kirwani\nsa: C\ntal: tintal\n\nS R g m\n';
      const xml = documentToMusicXML(parseDocument(src).doc);
      assert.match(xml, /^<\?xml version="1\.0"/);
      assert.match(xml, /<score-partwise/);
      assert.match(xml, /<\/score-partwise>\s*$/);
      assert.match(xml, /<work-title>Kahe Ko<\/work-title>/);
      assert.ok(xml.split('<measure').length > 1, 'has measures');
      // balanced tags on the elements that matter
      assert.equal((xml.match(/<note>/g) || []).length, (xml.match(/<\/note>/g) || []).length);
      assert.equal((xml.match(/<measure /g) || []).length, (xml.match(/<\/measure>/g) || []).length);
    },
  },
  {
    name: 'xml: time signature comes from the tal (tintal 16/4, rupak 7/4)',
    fn() {
      const tin = documentToMusicXML(parseDocument('tal: tintal\n\nS R g m\n').doc);
      assert.match(tin, /<beats>16<\/beats>\s*<beat-type>4<\/beat-type>/);
      const rup = documentToMusicXML(parseDocument('tal: rupak\n\nS R g m\n').doc);
      assert.match(rup, /<beats>7<\/beats>/);
    },
  },
  {
    name: 'xml: pitches carry step/alter/octave from the spelling',
    fn() {
      const xml = documentToMusicXML(parseDocument('sa: C\ntal: tintal\n\nS g M N\n').doc);
      assert.match(xml, /<step>C<\/step>\s*<octave>3<\/octave>/);
      assert.match(xml, /<step>E<\/step>\s*<alter>-1<\/alter>/, 'komal ga = E flat');
      assert.match(xml, /<step>F<\/step>\s*<alter>1<\/alter>/, 'tivra ma = F sharp');
    },
  },
  {
    name: 'xml: durations are integers and each measure sums to the tal',
    fn() {
      const xml = documentToMusicXML(
        parseDocument('tal: tintal\n\nS R g m P d n N S R g m P d n N\n').doc
      );
      const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(xml)[1]);
      const measures = xml.split('<measure ').slice(1);
      for (const m of measures) {
        const durs = [...m.matchAll(/<duration>(\d+)<\/duration>/g)].map((x) => Number(x[1]));
        for (const d of durs) assert.ok(Number.isInteger(d) && d > 0, `bad duration ${d}`);
        const total = durs.reduce((a, b) => a + b, 0);
        assert.equal(total, 16 * divisions, 'measure fills one avartan');
      }
    },
  },
  {
    name: 'xml: subdivided matras divide the beat exactly (thirds stay integers)',
    fn() {
      const xml = documentToMusicXML(parseDocument('tal: tintal\n\nSRg m R g\n').doc);
      const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(xml)[1]);
      assert.equal(divisions % 3, 0, 'divisions accommodate the triplet');
      const durs = [...xml.matchAll(/<duration>(\d+)<\/duration>/g)].map((x) => Number(x[1]));
      assert.equal(durs[0], divisions / 3);
    },
  },
  {
    name: 'xml: sustains lengthen the note rather than repeating it',
    fn() {
      const xml = documentToMusicXML(parseDocument('tal: tintal\n\nS - - m\n').doc);
      const notes = (xml.match(/<pitch>/g) || []).length;
      assert.equal(notes, 2, 'S and m only');
      const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(xml)[1]);
      const durs = [...xml.matchAll(/<duration>(\d+)<\/duration>/g)].map((x) => Number(x[1]));
      assert.equal(durs[0], 3 * divisions, 'S holds three beats');
    },
  },
  {
    name: 'xml: a note crossing the avartan is split and tied',
    fn() {
      // 16 matras of tintal, then a note held across the barline
      const line = 'S R g m P d n N S R g m P d n S - - -\n';
      const xml = documentToMusicXML(parseDocument(`tal: tintal\n\n${line}`).doc);
      assert.match(xml, /<tie type="start"\/>/);
      assert.match(xml, /<tie type="stop"\/>/);
      assert.match(xml, /<tied type="start"\/>/);
    },
  },
  {
    name: 'xml: rests emit as rests, not silence-by-omission',
    fn() {
      const xml = documentToMusicXML(parseDocument('tal: tintal\n\nS . g m\n').doc);
      assert.match(xml, /<rest\/>/);
    },
  },
  {
    name: 'xml: kan graces emit as MusicXML grace notes (no duration)',
    fn() {
      const xml = documentToMusicXML(parseDocument("sa: C\ntal: tintal\n\n{'S}n R g m\n").doc);
      // slash="yes" = acciaccatura — the crushed grace, which is exactly
      // what a kan is. Plain <grace/> would be an appoggiatura (takes time).
      assert.match(xml, /<grace slash="yes"\/>/);
      const graceBlock = /<note>\s*<grace slash="yes"\/>[\s\S]*?<\/note>/.exec(xml)[0];
      assert.doesNotMatch(graceBlock, /<duration>/, 'graces carry no metric time');
    },
  },
  {
    name: 'xml: empty document produces a valid empty score, no throw',
    fn() {
      const xml = documentToMusicXML(parseDocument('').doc);
      assert.match(xml, /<score-partwise/);
      assert.match(xml, /<\/score-partwise>/);
    },
  },
  {
    name: 'xml: the Appendix A corpus exports without throwing',
    fn() {
      const src = `title: Kahe Ko (khyal)\nraga: kirwani\ntal: tintal\nsa: C#\ntempo: 72\n\nSthayi\n@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||\n\nTihai\n(SR gm P)x3\n`;
      const xml = documentToMusicXML(parseDocument(src).doc);
      assert.match(xml, /<score-partwise/);
      assert.ok((xml.match(/<note>/g) || []).length > 10);
    },
  },
];
