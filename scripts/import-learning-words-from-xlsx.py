#!/usr/bin/env python3
"""Import Korean learning noun list xlsx into www/js/learning-words-data.js."""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / 'data' / 'korean-learning-nouns.xlsx'
OUT_JS = ROOT / 'www' / 'js' / 'learning-words-data.js'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
HANGUL_RE = re.compile(r'^[가-힣]+$')
GRADE_TO_DIFFICULTY = {'A': 1, 'B': 2, 'C': 3}


def read_xlsx_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as zf:
        shared = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        strings: list[str] = []
        for si in shared.findall('m:si', NS):
            parts = [
                (t.text or '')
                for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
            ]
            strings.append(''.join(parts))

        sheet = ET.fromstring(zf.read('xl/worksheets/sheet1.xml'))
        rows: list[list[str]] = []
        for row in sheet.findall('m:sheetData/m:row', NS):
            vals: list[str] = []
            for cell in row.findall('m:c', NS):
                value_el = cell.find('m:v', NS)
                if value_el is None:
                    vals.append('')
                elif cell.get('t') == 's':
                    vals.append(strings[int(value_el.text)])
                else:
                    vals.append(value_el.text or '')
            rows.append(vals)
    return rows


def parse_entry(row: list[str]) -> dict | None:
    if not row or row[0] == '순위' or (len(row) > 1 and row[1] == '단어'):
        return None

    word = meaning = grade = pos = ''
    if len(row) >= 5:
        word, pos, meaning, grade = row[1], row[2], row[3], row[4]
    elif len(row) == 4:
        if row[2] == '명' and row[3] in GRADE_TO_DIFFICULTY:
            word, pos, grade = row[1], row[2], row[3]
        elif row[2] == '명':
            word, pos, meaning = row[1], row[2], row[3]
    elif len(row) == 3 and row[1] == '명':
        word, pos, grade = row[0], row[1], row[2]

    word = str(word).strip()
    if not word or not HANGUL_RE.match(word):
        return None
    if pos and pos != '명':
        return None

    meaning = str(meaning).strip()
    grade = str(grade).strip().upper()
    difficulty = GRADE_TO_DIFFICULTY.get(grade, 2)

    entry = {
        'word': word,
        'category': 'noun',
        'difficulty': difficulty,
    }
    if meaning:
        entry['meaning'] = meaning
    if grade in GRADE_TO_DIFFICULTY:
        entry['grade'] = grade
    return entry


def build_entries(rows: list[list[str]]) -> list[dict]:
    entries: list[dict] = []
    seen: set[str] = set()
    for row in rows[1:]:
        entry = parse_entry(row)
        if not entry or entry['word'] in seen:
            continue
        seen.add(entry['word'])
        entries.append(entry)
    return entries


def render_js(entries: list[dict], source_name: str) -> str:
    lines = [
        '/**',
        ' * AUTO-GENERATED — do not edit by hand.',
        f' * Source: data/{source_name}',
        ' * Regenerate: npm run import-words',
        ' */',
        '(function (global) {',
        "  'use strict';",
        '',
        '  global.LEARNING_WORDS_RAW = [',
    ]
    for entry in entries:
        lines.append(f'    {json.dumps(entry, ensure_ascii=False)},')
    lines.extend([
        '  ];',
        '})(typeof window !== \'undefined\' ? window : globalThis);',
        '',
    ])
    return '\n'.join(lines)


def main() -> int:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx_path.is_file():
        print(f'Missing xlsx: {xlsx_path}', file=sys.stderr)
        return 1

    rows = read_xlsx_rows(xlsx_path)
    entries = build_entries(rows)
    if not entries:
        print('No entries parsed from xlsx.', file=sys.stderr)
        return 1

    OUT_JS.write_text(render_js(entries, xlsx_path.name), encoding='utf-8')

    lengths: dict[int, int] = {}
    for entry in entries:
        lengths[len(entry['word'])] = lengths.get(len(entry['word']), 0) + 1

    print(f'Wrote {len(entries)} words to {OUT_JS}')
    print('Length distribution:', dict(sorted(lengths.items())))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
