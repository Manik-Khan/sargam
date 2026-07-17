// src/shell/Legend.jsx — the notation key (M's ask, 2026-07-16: "a key or
// legend to the top bar that explains what each command does"). Pure data
// below; editing the reference is editing an array. The wording sticks to
// the tradition's terms — this doubles as the app teaching the notation.

import React from 'react';

const SECTIONS = [
  [
    'Notes & octaves',
    [
      ['S R G m P D N', 'shuddh swaras (capital; m is shuddh Ma)'],
      ['r g d n', 'komal (lowercase)'],
      ['M', 'tivra Ma'],
      ["'S", "taar saptak — ' before the note, dot renders above"],
      ['.S', 'mandra saptak — . before the note, dot renders below'],
      ["''S  ..S", 'two octaves up / down'],
    ],
  ],
  [
    'Rhythm',
    [
      ['S R g m', 'spaces separate beats — one token per matra'],
      ['SRg', 'notes together share one beat, split evenly'],
      ['[m - g]', 'uneven beat: m holds two-thirds, g the last third'],
      ['-', 'sustain — the previous note keeps ringing'],
      ['.', 'rest (silence) when written alone on a beat'],
      ['|', 'barline between vibhags; checked against the tal'],
      ['@6', 'start this line at matra 6 (lines auto-continue the cycle — @ overrides)'],
    ],
  ],
  [
    'Ornaments',
    [
      ['~mg', 'meend/slide within the beat — arc over the cluster'],
      ['m~ g', 'meend across two beats'],
      ["{'S}n", 'kan: small grace before the note; n owns the beat'],
      ['{dP}m', 'grace run into m'],
      ['{dP} m', 'spaced: graces sound BEFORE the beat, stealing from the previous note'],
      ["'S~n", 'shorthand kan — same as {\u2019S}n'],
      ['[[DP]]', 'krintan — square bracket over the notes'],
    ],
  ],
  [
    'Repeats & sections',
    [
      ['||: … :||', 'repeat the whole passage'],
      ['(SR gm P)x3', 'repeat the phrase three times — landing is reported'],
      ['Sthayi / Antara / 1.', 'a line with no notes is a section label; sections reset to sam'],
      ['> dha dhin', 'bol line, attached to the music line above'],
    ],
  ],
  [
    'Header (frontmatter)',
    [
      ['raga:', 'the raga — becomes the page heading'],
      ['tal: tintal', 'the tal; free = unmetered (alap)'],
      ['sa: C', 'the key — playback, CDE names, and staff export follow it (C sarod · D sitar · A vocal)'],
      ['laya: madhya', "the tradition's speed word"],
      ['tempo: 72', 'playback bpm — the transport BPM field reads and writes it'],
      ['anything: else', 'any other line (composer:, year:, source:) prints under the title on export'],
    ],
  ],
  [
    'Playing & tools',
    [
      ['Space', 'play / pause (tick marks the tal; sam accented, khali hollow)'],
      ['click a beat', 'move the playhead there'],
      ['Loop line/section', 'practice the passage under your cursor'],
      ['SRG / CDE', 'show Western note names (display only — the text stays sargam)'],
      ['Dictate', 'type or say syllables: sa ga ma pa · 1 2 3 4 · komal re · low ni'],
      ['Staff ↗', 'MusicXML — opens in MuseScore, Sibelius, Dorico, Finale'],
    ],
  ],
];

export default function Legend({ onClose }) {
  return (
    <div className="legend">
      <div className="legend-head">
        <strong>Notation key</strong>
        <button className="tb-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="legend-grid">
        {SECTIONS.map(([title, rows]) => (
          <div className="legend-sec" key={title}>
            <h4>{title}</h4>
            {rows.map(([syntax, meaning]) => (
              <div className="legend-row" key={syntax}>
                <code>{syntax}</code>
                <span>{meaning}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
