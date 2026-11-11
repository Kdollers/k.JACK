#!/usr/bin/env node
'use strict';
/**
 * gen.cjs — builds src/views/appHelpContent.js from the guide sources.
 *
 * JENESIS shows a different Help guide in each of its four applications, in
 * three languages. That is twelve guides, and they are easier to keep honest
 * as editable data with one writer than as a hand-maintained module with
 * twelve near-identical shapes to keep in step.
 *
 *   scripts/helpgen/content/{en,fr,rw}.json   the words, one file per language
 *   scripts/helpgen/gen.cjs                   this file
 *   src/views/appHelpContent.js               what it writes
 *
 * Run it with:  npm run help:build
 *
 * It refuses to write a guide that is broken, because a Help page that
 * promises a section and does not deliver it is worse than no Help page:
 *
 *   - every language must carry every section, in the same order;
 *   - no section may be missing a title, purpose, where, expected or steps;
 *   - every guide must end with the credit to KAYIGANWA JACQUES;
 *   - every guide must document only what JENESIS actually does, which is
 *     checked by the forbidden-phrase list in checks.cjs.
 *
 * The output is committed, and tests/app-help.test.js reads the committed
 * file — so this generator is the way to change the guides, and the tests
 * keep whatever it produces honest.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const CONTENT_DIR = path.join(HERE, 'content');
const OUT = path.join(ROOT, 'src', 'views', 'appHelpContent.js');

const LANGS = ['en', 'fr', 'rw'];
const APPS = ['seller', 'admin', 'maintenance', 'settings'];

const CREDIT_SECTION = 'credits';

const HEADER = `/**
 * appHelpContent.js — the Help guide each JENESIS application shows.
 *
 * A Seller at a till, an accountant keeping the books, the person who looks
 * after the network, and whoever configures the program are four different
 * people doing four different jobs. They used to be given the same guide,
 * which meant each of them had to read past a great deal that had nothing to
 * do with them — and, worse, the Seller's guide carried accounting
 * instructions a Seller is not allowed to carry out.
 *
 * So each application now has its own guide, and it is chosen automatically
 * from the application the user opened. Nobody is ever asked which guide they
 * want: the question would be meaningless to them and easy to answer wrong.
 *
 * The guides are deliberately narrow. The Seller's guide covers the counter —
 * sales, product search, customers, receipts, printing, returns, stock and
 * shortcuts — and says nothing about accounting, because a Seller cannot post
 * a journal entry. The Maintenance guide covers the service and the network,
 * and holds no accounting, sales or stock instructions at all.
 *
 * Structure of a section, identical to helpContent.js so the two can be read
 * the same way:
 *   title, purpose, where, steps[], expected, notes[]
 *
 * Every guide ends with the same credit, in every language: JENESIS is
 * created and developed by KAYIGANWA JACQUES.
 *
 * These guides document the program as it is. Nothing here describes a
 * feature that does not exist in JENESIS.
 *
 * GENERATED FILE — edit scripts/helpgen/content/{en,fr,rw}.json and run
 * npm run help:build. Editing this file by hand loses the change on the
 * next build.
 */

`;

/** Escapes a string for inclusion in a double-quoted JavaScript literal. */
function jsString(value) {
  return JSON.stringify(value);
}

function arrayLiteral(values, indent) {
  if (!values || values.length === 0) return '[]';
  const pad = ' '.repeat(indent + 2);
  // A trailing comma on the last element too: that is how the file reads, and
  // it keeps a later insertion from producing a diff on the line above it.
  const items = values.map((v) => pad + jsString(v) + ',');
  return '[\n' + items.join('\n') + '\n' + ' '.repeat(indent) + ']';
}

function renderSection(id, section, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const lines = [];
  lines.push(pad + id + ': {');
  lines.push(inner + 'title: ' + jsString(section.title) + ',');
  lines.push(inner + 'purpose: ' + jsString(section.purpose) + ',');
  lines.push(inner + 'where: ' + jsString(section.where) + ',');
  lines.push(inner + 'steps: ' + arrayLiteral(section.steps, indent + 2) + ',');
  lines.push(inner + 'expected: ' + jsString(section.expected) + ',');
  lines.push(inner + 'notes: ' + arrayLiteral(section.notes, indent + 2));
  lines.push(pad + '}');
  return lines.join('\n');
}

function renderGuide(guide, order) {
  const lines = [];
  lines.push('      guideTitle: ' + jsString(guide.guideTitle) + ',');
  lines.push('      guideIntro: ' + jsString(guide.guideIntro) + ',');
  lines.push('      closingNote: ' + jsString(guide.closingNote) + ',');
  lines.push('      sections: {');
  const rendered = order.map((id) => renderSection(id, guide.sections[id], 8));
  // The last section carries a trailing comma too, so adding a section later
  // does not also rewrite the line above it.
  lines.push(rendered.join(',\n') + ',');
  lines.push('      }');
  return lines.join('\n');
}

function readContent(lang) {
  const file = path.join(CONTENT_DIR, lang + '.json');
  if (!fs.existsSync(file)) throw new Error('missing guide source: ' + file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function build() {
  const byLang = {};
  for (const lang of LANGS) byLang[lang] = readContent(lang);

  // 1. Every language must agree on which sections exist and in what order.
  const reference = byLang.en.order;
  for (const lang of LANGS) {
    for (const app of APPS) {
      const mine = byLang[lang].order[app];
      if (!mine) throw new Error(lang + '/' + app + ': no section order defined');
      if (JSON.stringify(mine) !== JSON.stringify(reference[app])) {
        throw new Error(
          lang + '/' + app + ': section order differs from English.\n' +
          '    english: ' + reference[app].join(', ') + '\n' +
          '    ' + lang + ': ' + mine.join(', ')
        );
      }
    }
  }

  // 2. Every section must be complete, and every guide must end on the credit.
  for (const lang of LANGS) {
    for (const app of APPS) {
      const guide = byLang[lang].guides[app];
      if (!guide) throw new Error(lang + '/' + app + ': guide missing');
      for (const key of ['guideTitle', 'guideIntro', 'closingNote']) {
        if (!guide[key]) throw new Error(lang + '/' + app + ': ' + key + ' is empty');
      }
      for (const id of reference[app]) {
        const s = guide.sections[id];
        if (!s) throw new Error(lang + '/' + app + '/' + id + ': section missing');
        for (const key of ['title', 'purpose', 'where', 'expected']) {
          if (!s[key]) throw new Error(lang + '/' + app + '/' + id + ': ' + key + ' is empty');
        }
        if (!Array.isArray(s.steps) || s.steps.length === 0) {
          throw new Error(lang + '/' + app + '/' + id + ': has no steps');
        }
      }
      const last = reference[app][reference[app].length - 1];
      if (last !== CREDIT_SECTION) {
        throw new Error(lang + '/' + app + ': must end on the ' + CREDIT_SECTION + ' section');
      }
      const credit = JSON.stringify(guide.sections[CREDIT_SECTION]).toLowerCase();
      if (!credit.includes('kayiganwa jacques')) {
        throw new Error(lang + '/' + app + ': the credit must name KAYIGANWA JACQUES');
      }
    }
  }

  // 3. Render.
  let out = HEADER;
  out += 'export const APP_HELP_ORDER = {\n';
  out += APPS.map((app) => '  ' + app + ': [' + reference[app].map(jsString).join(', ') + ']').join(',\n');
  out += '\n};\n\n';
  out += 'export const APP_HELP = {\n';

  const appBlocks = APPS.map((app) => {
    const langBlocks = LANGS.map(
      (lang) => '    ' + lang + ': {\n' + renderGuide(byLang[lang].guides[app], reference[app]) + '\n    }'
    );
    return '  ' + app + ': {\n' + langBlocks.join(',\n') + ',\n  }';
  });
  out += appBlocks.join(',\n') + ',';
  out += '\n};\n';

  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const text = build();

  if (checkOnly) {
    // Reported in the same shape as the other suites (a ✓ or ✗ line and a
    // total) so scripts/count-checks.mjs counts it. A check the counter
    // cannot see is a check the release notes cannot quote.
    console.log('--- STARTING HELP GENERATOR CHECK ---');
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current === text) {
      console.log('  ✓ appHelpContent.js matches its sources in scripts/helpgen/content/');
      console.log('\n--- 1 passed, 0 failed ---');
      return;
    }
    console.log('  ✗ appHelpContent.js has drifted from its sources. Run: npm run help:build');
    console.log('\n--- 0 passed, 1 failed ---');
    process.exit(1);
  }

  fs.writeFileSync(OUT, text);
  // The English order is the reference every language is checked against in
  // build(), so it is also the honest place to count sections from.
  const order = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'en.json'), 'utf8')).order;
  const perLanguage = APPS.reduce((n, app) => n + order[app].length, 0);
  console.log('wrote ' + path.relative(ROOT, OUT));
  console.log(
    '  ' + APPS.length + ' guides x ' + LANGS.length + ' languages, ' +
    perLanguage + ' sections per language (' + perLanguage * LANGS.length + ' in total)'
  );
}

main();
