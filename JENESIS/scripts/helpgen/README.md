# The JENESIS Help guides — how to change them

Each of the four JENESIS applications shows its own Help guide, in English,
French and Kinyarwanda. That is twelve guides: 39 sections each,
117 sections in total.

They are generated. **Do not edit `src/views/appHelpContent.js` by hand** —
the next build overwrites it, and `npm run test:helpgen` fails the moment the
two disagree.

## Change a guide

1. Edit the words in `content/en.json`, `content/fr.json` and `content/rw.json`.
   All three are plain JSON; each file holds its language's guides.

   ```json
   {
     "order":   { "seller": ["seller_interface", ... , "credits"] },
     "guides":  { "seller": { "guideTitle": "...", "sections": { ... } } }
   }
   ```

2. Rebuild:

   ```bash
   npm run help:build
   ```

3. Commit both the content files and the regenerated
   `src/views/appHelpContent.js`.

## Check without writing

```bash
npm run help:check     # part of npm run test:all
```

Fails if the committed module has drifted from the sources.

## What the build refuses to write

The generator checks the guides before it writes them, because a Help page
that promises a section and does not deliver one is worse than no Help page:

- every language must carry the **same sections in the same order** as English;
- no section may be missing a `title`, `purpose`, `where`, `expected` or `steps`;
- every guide must **end on the `credits` section**, and it must name
  **KAYIGANWA JACQUES** — the credit is required in every language;
- `steps` must not be empty.

The content itself is checked separately by `tests/app-help.test.js`, which
asserts that no guide describes a feature JENESIS does not have, and that the
Seller's guide carries no accounting instructions.

## Adding a section

Add the id to `order.<app>` in **all three** language files (the order must
match everywhere), then add the section body under
`guides.<app>.sections.<id>` in all three.

The generator writes the file with the same formatting every time, so a new
section produces a diff of the lines it added and nothing else.

## Why generated at all

Twelve guides with an identical shape are easier to keep honest as data with
one writer than as a hand-maintained module where each of the twelve copies can
silently drift from the other eleven. The committed output means the
application never needs the generator to run; the generator only exists so the
guides can be changed without copying a change twelve times.
