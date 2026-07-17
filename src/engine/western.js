// western.js — sargam → Western staff notation, via MusicXML.
//
// THE SPELLING INSIGHT (the part that needs sargam, not justarithmetic):
// each sargam degree owns a LETTER NAME. Sa is the tonic's letter, Re the
// 2nd letter, Ga the 3rd, Ma the 4th, Pa the 5th, Dha the 6th, Ni the 7th —
// and komal/tivra become the accidental on that letter. So with Sa=C, komal
// ga is E-flat (3rd letter, flattened); with Sa=D the same komal ga is F
// natural (the 3rd letter from D *is* F). No key-signature guessing, no
// enharmonic coin-flips: sargam states the scale degree outright, which is
// exactly the information Western spelling has to infer. The tradition
// hands us the answer.
//
// Output is MusicXML rather than rendered staves: it opens in MuseScore,
// Sibelius, Dorico and Finale, it prints, and — unlike a rendering library
// — it is a pure text transform that node can verify. A live in-app staff
// toggle would need VexFlow plus a full tuplet/beam layer; that is its own
// milestone (see spec §10). This gets the notation onto a staff today.
//
// Engine rules: plain JS, no React, no DOM, never throws.

import { parseSa, SEMITONES, DEFAULT_SA } from './schedule.js';
import { getTal } from './tala.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Which letter-step above Sa each sargam degree occupies. This table IS the
// spelling rule: r and R are both "the 2nd letter", differing only in alter.
const LETTER_STEP = { S: 0, r: 1, R: 1, g: 2, G: 2, m: 3, M: 3, P: 4, d: 5, D: 5, n: 6, N: 6 };

const midiOfLetter = (letter, octave) => 12 * (octave + 1) + NATURAL[letter];

/** Sa's letter and octave from its directive string ('C', 'A3', 'Bb2'). */
function saLetter(saValue) {
  const m = /^\s*([A-Ga-g])([#b]?)(\d)?\s*$/.exec(String(saValue ?? DEFAULT_SA));
  if (!m) return { letter: 'C', octave: 3 };
  return { letter: m[1].toUpperCase(), octave: m[3] !== undefined ? Number(m[3]) : 3 };
}

/**
 * Spell a sargam degree as a Western pitch.
 * @param {string} saValue  the `sa:` directive ('C', 'D', 'A3', 'C#')
 * @param {string} ch  sargam letter (S r R g G m M P d D n N)
 * @param {number} [octaveOffset]  -1 mandra, 0 madhya, +1 taar
 * @returns {{step: string, alter: number, octave: number, midi: number}}
 */
export function spellDegree(saValue, ch, octaveOffset = 0) {
  const sa = parseSa(saValue);
  const { letter, octave: saOct } = saLetter(saValue);
  const semi = SEMITONES[ch] ?? 0;
  const midi = sa.midi + semi + 12 * octaveOffset;

  const stepIdx = LETTER_STEP[ch] ?? 0;
  const raw = LETTERS.indexOf(letter) + stepIdx;
  const step = LETTERS[raw % 7];
  const octave = saOct + Math.floor(raw / 7) + octaveOffset;
  const alter = midi - midiOfLetter(step, octave);
  return { step, alter, octave, midi };
}

// ---------------------------------------------------------------------------
// MusicXML
// ---------------------------------------------------------------------------

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => Math.abs(a * b) / (gcd(a, b) || 1);
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// duration in divisions → a standard note type, where one exists. Tuplets
// and irregular values get no <type>; importers infer, and adding proper
// <time-modification> markup is the natural next increment.
function noteType(durDiv, divisions) {
  const beats = durDiv / divisions; // in quarter notes
  const table = [
    [4, 'whole'], [3, 'half'], [2, 'half'], [1.5, 'quarter'], [1, 'quarter'],
    [0.75, 'eighth'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd'],
  ];
  for (const [v, name] of table) if (Math.abs(beats - v) < 1e-9) return name;
  return null;
}

/**
 * Flatten the document into absolute-matra note events, mirroring the
 * rhythm decisions schedule.js makes (repeats unroll; whole-matra sustains
 * lengthen the ringing note; graces carry no time) — but in RHYTHM space
 * rather than seconds, which is what notation needs.
 */
function flatten(doc) {
  const out = [];
  let at = 0; // absolute matra position
  let meterMatras = 16;
  let firstMeterSet = false;

  for (const section of doc?.sections || []) {
    const tal = section.tal === 'free' ? null : getTal(section.tal);
    if (!firstMeterSet) {
      meterMatras = tal ? tal.matras : 4; // free sections flow in 4/4
      firstMeterSet = true;
    }
    for (const line of section.lines || []) {
      if (!line.matras || line.matras.length === 0) continue;

      const order = [];
      for (let i = 0; i < line.matras.length; ) {
        const pr = (line.phraseRepeats || []).find((r) => r.fromMatra === i);
        if (pr) {
          for (let rep = 0; rep < pr.times; rep++) {
            for (let k = pr.fromMatra; k <= pr.toMatra; k++) order.push(k);
          }
          i = pr.toMatra + 1;
        } else {
          order.push(i);
          i++;
        }
      }
      const passes = line.lineRepeat ? 2 : 1;

      for (let pass = 0; pass < passes; pass++) {
        let ringing = null;
        for (const mi of order) {
          const evs = line.matras[mi].events;
          if (evs.length === 1 && evs[0].type === 'sustain') {
            if (ringing) ringing.dur += 1;
            else out.push({ kind: 'rest', at, dur: 1 });
            at += 1;
            continue;
          }
          let cursor = at;
          for (const e of evs) {
            if (e.grace) {
              out.push({ kind: 'grace', at: cursor, ch: e.ch, octave: e.octave || 0 });
              continue;
            }
            const frac = e.dur.num / e.dur.den;
            if (e.type === 'note') {
              const ev = { kind: 'note', at: cursor, dur: frac, ch: e.ch, octave: e.octave || 0 };
              out.push(ev);
              ringing = ev;
            } else if (e.type === 'rest') {
              out.push({ kind: 'rest', at: cursor, dur: frac });
              ringing = null;
            } else if (ringing) {
              ringing.dur += frac;
            } else {
              out.push({ kind: 'rest', at: cursor, dur: frac });
            }
            cursor += frac;
          }
          at += 1;
        }
      }
    }
  }
  return { events: out, meterMatras, total: at };
}

/** Denominator of a float that came from exact fractions (safe: small). */
function denomOf(x) {
  for (let d = 1; d <= 5040; d++) if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return d;
  return 1;
}

/**
 * @param {Document} doc  parsed model
 * @returns {string} MusicXML 4.0 score-partwise
 */
export function documentToMusicXML(doc) {
  const dirs = doc?.directives || {};
  const saValue = dirs.sa || DEFAULT_SA;
  const { events, meterMatras, total } = flatten(doc);

  // divisions per quarter (= per matra) must make every duration an integer
  let divisions = 1;
  for (const e of events) if (e.dur) divisions = lcm(divisions, denomOf(e.dur));
  divisions = Math.max(1, Math.min(divisions, 5040));

  const measures = [];
  const measureCount = Math.max(1, Math.ceil(total / meterMatras));
  for (let m = 0; m < measureCount; m++) measures.push([]);

  // Place events into measures, splitting + tying anything that crosses.
  for (const e of events) {
    if (e.kind === 'grace') {
      const mi = Math.min(measures.length - 1, Math.floor(e.at / meterMatras));
      measures[mi].push({ ...e });
      continue;
    }
    let start = e.at;
    let left = e.dur;
    let first = true;
    while (left > 1e-9) {
      const mi = Math.min(measures.length - 1, Math.floor(start / meterMatras + 1e-9));
      const measureEnd = (mi + 1) * meterMatras;
      const take = Math.min(left, measureEnd - start);
      const last = left - take <= 1e-9;
      measures[mi].push({
        ...e,
        at: start,
        dur: take,
        tieStart: !last,
        tieStop: !first,
      });
      start += take;
      left -= take;
      first = false;
    }
  }

  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  );
  L.push('<score-partwise version="4.0">');
  const title = dirs.title || dirs.raga || 'Sargam';
  L.push(`  <work><work-title>${esc(title)}</work-title></work>`);
  L.push('  <identification>');
  if (dirs.composer) L.push(`    <creator type="composer">${esc(dirs.composer)}</creator>`);
  const misc = [];
  for (const k of ['raga', 'tal', 'laya', 'composition', 'type', 'year', 'source']) {
    if (dirs[k]) misc.push(`      <miscellaneous-field name="${k}">${esc(dirs[k])}</miscellaneous-field>`);
  }
  if (misc.length) {
    L.push('    <miscellaneous>');
    L.push(...misc);
    L.push('    </miscellaneous>');
  }
  L.push('    <encoding><software>Sargam</software></encoding>');
  L.push('  </identification>');
  L.push('  <part-list>');
  L.push(`    <score-part id="P1"><part-name>${esc(dirs.raga || 'Sargam')}</part-name></score-part>`);
  L.push('  </part-list>');
  L.push('  <part id="P1">');

  measures.forEach((notes, mi) => {
    L.push(`    <measure number="${mi + 1}">`);
    if (mi === 0) {
      L.push('      <attributes>');
      L.push(`        <divisions>${divisions}</divisions>`);
      L.push('        <key><fifths>0</fifths></key>');
      L.push(`        <time><beats>${meterMatras}</beats><beat-type>4</beat-type></time>`);
      L.push('        <clef><sign>G</sign><line>2</line></clef>');
      L.push('      </attributes>');
      if (dirs.tempo) {
        L.push('      <direction placement="above"><direction-type>');
        L.push(
          `        <metronome><beat-unit>quarter</beat-unit><per-minute>${esc(dirs.tempo)}</per-minute></metronome>`
        );
        L.push('      </direction-type></direction>');
      }
    }
    if (notes.length === 0) {
      L.push('      <note><rest measure="yes"/>' + `<duration>${meterMatras * divisions}</duration></note>`);
    }
    for (const e of notes) {
      if (e.kind === 'grace') {
        const p = spellDegree(saValue, e.ch, e.octave);
        L.push('      <note>');
        L.push('        <grace slash="yes"/>');
        L.push('        <pitch>');
        L.push(`          <step>${p.step}</step>`);
        if (p.alter) L.push(`          <alter>${p.alter}</alter>`);
        L.push(`          <octave>${p.octave}</octave>`);
        L.push('        </pitch>');
        L.push('        <type>eighth</type>');
        L.push('      </note>');
        continue;
      }
      const durDiv = Math.round(e.dur * divisions);
      if (durDiv <= 0) continue;
      L.push('      <note>');
      if (e.kind === 'rest') {
        L.push('        <rest/>');
      } else {
        const p = spellDegree(saValue, e.ch, e.octave);
        if (e.tieStop) L.push('        <tie type="stop"/>');
        if (e.tieStart) L.push('        <tie type="start"/>');
        L.push('        <pitch>');
        L.push(`          <step>${p.step}</step>`);
        if (p.alter) L.push(`          <alter>${p.alter}</alter>`);
        L.push(`          <octave>${p.octave}</octave>`);
        L.push('        </pitch>');
      }
      L.push(`        <duration>${durDiv}</duration>`);
      const t = noteType(durDiv, divisions);
      if (t) L.push(`        <type>${t}</type>`);
      if (e.kind === 'note' && (e.tieStart || e.tieStop)) {
        L.push('        <notations>');
        if (e.tieStop) L.push('          <tied type="stop"/>');
        if (e.tieStart) L.push('          <tied type="start"/>');
        L.push('        </notations>');
      }
      L.push('      </note>');
    }
    L.push('    </measure>');
  });

  L.push('  </part>');
  L.push('</score-partwise>');
  return L.join('\n');
}
