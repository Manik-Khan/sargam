# Anchor Framework v1

This wave replaces meter-only authoring with a shared rendered-score anchor surface.

- CodeMirror preserves exact Markdown and folds generated anchor metadata in Clean mode.
- Structure mode reveals the same underlying HTML comment for advanced inspection/editing.
- Point marks: Da `|`, Ra `—`, Chikari `^`.
- Diri is a two-attack `V`, connecting consecutive notes.
- Meter is a draggable attack/boundary span with a custom ratio.
- Tala numerals align with the real attack at the boundary; a sustained boundary gets a tick in preview and export.
- Existing `>>` meter spans remain visible as legacy notation but new marks use metadata.
- The repeated ornament form `{n~}D--{n~}D` remains the next parser/render increment. It must preserve the single-matra rhythm of `D--D` and draw two event-level slides; v1 does not fake it as two matras.

Generated structure is portable inside the Markdown file:

```md
<!-- sargam-anchors:v1
{
  "version": 1,
  "marks": []
}
-->
```

The source text remains authoritative. The metadata stores musical context and is reconciled after edits; ambiguous or missing anchors are retained for review rather than silently moved.
