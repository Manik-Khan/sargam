# Sargam repository instructions

## Source of truth

This GitHub clone is the implementation source of truth. On Manik's workstation,
the preferred clone is `/Users/khansolo/Documents/GitHub/sargam`.

Never implement Sargam inside a ChatGPT project mirror or any path beneath
`.codex/.chatgpt-projects`. Those folders may contain useful reference material,
but they are not development checkouts.

Before reading implementation files, planning a change, or editing anything:

1. Run `npm run repo:preflight:remote` from the repository root.
2. Confirm it reports the canonical `Manik-Khan/sargam` remote, clean `main`, and
   matching local, tracking, and live GitHub commits.
3. If it fails, stop before editing. Report the mismatch or existing user changes
   and resolve them with the user rather than copying files between repositories.

After the preflight, read `CONTEXT.md` and the most relevant document under
`docs/` before changing behavior. Musical and archival semantics belong to Manik;
do not invent them.

## Change discipline

- Preserve existing user changes and inspect `git status` before every edit.
- Keep notation Markdown as the source of truth.
- Use stable recording IDs; never treat a filename or raw filesystem path as
  durable archive identity.
- For product/UX changes, follow mock -> approval -> build.
- Run `npm run verify` before handing off implementation work.
- Report the repository root, branch, HEAD, verification result, and remaining
  manual acceptance work in the handoff.
- Do not commit or push unless the user explicitly authorizes it.
