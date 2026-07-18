# Ranged slides and first endings

## One slide over several beats

Use a tilde before parentheses:

```
~(.D.n.D S.n.D .n)
```

Spaces retain their ordinary rhythmic meaning. The first note inside the range
and the last note inside the range are joined by one meend arc. Parentheses
without the tilde remain phrase repeats and must still end in `xN`.

The Slide toolbar command now wraps a multi-beat selection in `~(...)`.
A one-cluster selection still uses the compact form `~mg`.

## First ending / volta

Place `|1` where first-pass-only material begins inside a line repeat:

```
@4 ||: S .n .D .n | S - - | m - | g - | g - m | D - | - - |1 m g R :||

A.
@1 m - - | ...
```

Playback is:

1. full repeated line, including `m g R`;
2. repeat only the common material before `|1`;
3. continue into the next written line.

`|1` remains playback structure, but its numbered bracket is hidden from notation and print.
A later page-layout phase will provide positioned printable notes such as
`→ Start Line 1.a`, anchored visually without putting them inside the music line.
The initial implementation intentionally supports one first ending and two
line-repeat passes. It does not yet add `|2`, arbitrary jumps, D.C., or D.S.

## Soft written dividers and navigable diagnostics

Ordinary `|` characters are author-facing phrase dividers. They remain useful
for source grouping and lyric/bol alignment, but they do not claim to be tala
vibhag boundaries. The rendered tala grid is derived from the active tal, the
line's `@N` start, and the number of written matras.

`|1` retains the same soft written boundary and additionally marks the start
of first-pass-only material for playback. It remains hidden from notation and
print.

The diagnostics list is still collapsed on demand. Each visible issue is now a
button: selecting it focuses the text editor, scrolls to its source line, and
selects either the reported token or the full line when no column is available.
