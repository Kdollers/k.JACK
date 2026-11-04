#!/usr/bin/env python3
"""
i18n-add.py — add translation keys to all three language files at once.

The three JSON files must stay valid, so they are read and written with the
json module (never by splicing text into them: that is how they were broken
once already). Run from the repository:

    python3 scripts/i18n-add.py batch.json   # apply one batch
    python3 scripts/i18n-add.py --check      # verify all three files parse

batch.json shape — one namespace to many keys, each key carrying all three
languages, so a key can never be added to one language and forgotten in the
other two:

    {
      "settings": {
        "add_user": {"en": "Add User", "fr": "Ajouter…", "rw": "Ongeraho…"}
      }
    }
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ('en', 'fr', 'rw')


def path_for(lang):
    return os.path.join(ROOT, 'src', 'i18n', f'{lang}.json')


def load(lang):
    with open(path_for(lang), encoding='utf-8') as fh:
        return json.load(fh)


def save(lang, data):
    with open(path_for(lang), 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def apply(batches, force=False):
    files = {lang: load(lang) for lang in LANGS}
    added = []
    skipped = []
    for namespace, keys in batches.items():
        for key, values in keys.items():
            missing = [l for l in LANGS if l not in values]
            if missing:
                raise SystemExit(f'{namespace}.{key} is missing {missing} — every key needs all three languages')
            for lang in LANGS:
                section = files[lang].setdefault(namespace, {})
                if key in section and not force:
                    skipped.append(f'{namespace}.{key}.{lang}')
                    continue
                section[key] = values[lang]
                added.append(f'{namespace}.{key}.{lang}')
    for lang in LANGS:
        save(lang, files[lang])
    return added, skipped


def check():
    ok = True
    for lang in LANGS:
        try:
            data = load(lang)
            total = sum(len(v) for v in data.values() if isinstance(v, dict))
            print(f'  ok   {lang}.json — {len(data)} namespaces, {total} keys')
        except Exception as exc:
            ok = False
            print(f'  FAIL {lang}.json — {exc}')
    return ok


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--check']
    if '--check' in sys.argv and not args:
        sys.exit(0 if check() else 1)
    if not args:
        raise SystemExit('usage: i18n-add.py <batch.json> [--force] | i18n-add.py --check')

    with open(args[0], encoding='utf-8') as fh:
        batches = json.load(fh)
    added, skipped = apply(batches, force='--force' in sys.argv)
    print(f'added {len(added)} keys')
    for note in sorted(set(s.split(".")[0] + "." + s.split(".")[1] for s in skipped)):
        print(f'  skipped (already present): {note}')
    if not check():
        sys.exit(1)
