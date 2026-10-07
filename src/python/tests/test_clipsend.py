import os
from pathlib import Path
import subprocess
import struct
import zlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from clipsend import infer_extension, inferred_name
import clipsend

REPO = Path(__file__).resolve().parents[3]

NEW_TYPES = {
    'yaml': 'name: demo\nreplicas: 2\n',
    'ts': 'interface User { name: string; }\n',
    'jsx': 'const App = () => <div>Hello</div>;\n',
    'tsx': 'const App = (props: Props) => <div>{props.name}</div>;\n',
    'sql': 'SELECT id, name FROM users WHERE active = true;\n',
    'css': '.card { color: red; padding: 1rem; }\n',
    'graphql': 'query Users { users { id name } }\n',
    'diff': '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n',
}


class InferenceTests(unittest.TestCase):
    def test_supported_text(self):
        cases = {
            ' {"ok": true, "values": [1, null]} \r\n': "json",
            '[1,2]': "json", '42': "json", 'true': "json", '"hello"': "json",
            '{"x":1}\n{"x":2}\n': "jsonl",
            '<root><item id="1"/></root>': "xml",
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>': "svg",
            '<svg/>': "svg", '<html><body/></html>': "html",
            '<div><p>Hello</p></div>': "html",
            '<!DOCTYPE html><html><body><br></body></html>': "html",
            '<!-- exported -->\n<HTML><br></HTML>': "html",
            '{\\rtf1\\ansi Hello}': "rtf",
            'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Taylor\r\nEND:VCARD': "vcf",
            'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR': "ics",
            '#!/usr/bin/env python3\nprint(1)': "py",
            '#!/usr/bin/env -S python3 -u\nprint(1)': "py",
            '#!/bin/bash\necho hi': "sh",
            '#!/usr/bin/env node\nconsole.log(1)': "js",
            '[project]\nname = "example"\nversion = "1.0"': "toml",
            'name,age\r\nTaylor,30\r\n': "csv",
            'name,description\nTaylor,"hello, world"\n': "csv",
            'name,description\nTaylor,"hello\nworld"\n': "csv",
            'name\tcount\nTaylor\t2\n': "tsv",
            'name\tcount\nTaylor\t\n': "tsv",
            '# Notes\n\n- One\n- Two': "md",
            '```json\n{"x": 1}\n```': "md",
            '~~~\nsome code\n~~~': "md",
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                if expected == 'toml' and clipsend.tomllib is None:
                    expected = 'txt'
                self.assertEqual(infer_extension(text.encode()), expected)

    def test_unknown_and_malformed_fall_back(self):
        for text in (
            '', ' \n\t', 'hello world', 'Résumé 😀', '{"broken":}', '{"x":NaN}',
            'Infinity', '{"x": 1} trailing', '<root>', '<svg><broken></svg>',
            '<!DOCTYPE root [<!ENTITY x "expanded">]><root>&x;</root>',
            '1\n2\n3', '{"x":1}\n\n{"x":2}', '{"x":1}\ninvalid',
            'a,b\n1,2,3', 'a,a\n1,2', 'name,value\na,"unfinished',
            'Hello, friend\nGoodbye, friend', 'just,a,single,row',
            '# A heading alone', '- shopping\n- laundry', '```\nunclosed',
            'key: value', 'https://example.com/file.json',
            '{\\rtf1 unfinished', 'BEGIN:VCARD\nFN:Taylor', '#!/unknown\nanything',
            'key = ',
        ):
            with self.subTest(text=text):
                self.assertEqual(infer_extension(text.encode()), "txt")
        self.assertEqual(infer_extension(b'\xff\x80\x81'), "bin")
        self.assertEqual(infer_extension(b'abc\x00def'), "bin")

    def test_scripts_without_shebangs(self):
        cases = {
            'import os\nprint(os.getcwd())': 'py',
            'from pathlib import Path\nfiles = list(Path(".").glob("*"))': 'py',
            'def greet(name):\n    return f"Hello {name}"\n': 'py',
            'class Example:\n    pass': 'py',
            'squares = [x * x for x in range(10)]': 'py',
            'print("hello")': 'py',
            'for item in items:\n    process(item)': 'py',
            'if ready:\n    start()': 'py',
            'const answer = 42;': 'js',
            'let total = 0;\ntotal += 1;': 'js',
            'const {name} = user;': 'js',
            'const greet = (name) => `Hello ${name}`;': 'js',
            'items.map(item => item.name)': 'js',
            'async function fetchData() { return await fetch("/api"); }': 'js',
            'console.log("hello");': 'js',
            'document.querySelector("main").remove();': 'js',
            'import fs from "node:fs";': 'js',
            'import "./setup.js";': 'js',
            'module.exports = { answer: 42 };': 'js',
            'puts "hello"': 'rb',
            'puts("hello")': 'rb',
            'require "json"\nputs JSON.generate({ok: true})': 'rb',
            'def greet(name)\n  "Hello #{name}"\nend': 'rb',
            'class Example\n  attr_accessor :name\nend': 'rb',
            'items.each do |item|\n  puts item\nend': 'rb',
            'echo "hello"': 'sh',
            'set -euo pipefail\nls -la': 'sh',
            'export APP_ENV=production\ncurl -fsS https://example.com': 'sh',
            'curl https://example.com': 'sh',
            'if [ -f "$file" ]; then\n  cat "$file"\nfi': 'sh',
            'for file in *.txt; do\n  wc -l "$file"\ndone': 'sh',
            'while true\ndo\n  sleep 1\ndone': 'sh',
            'greet() { echo hello; }': 'sh',
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(infer_extension(text.encode()), expected)

    def test_script_ambiguity_comments_and_format_precedence(self):
        cases = {
            'hello(world)': 'txt',
            'require("json")': 'txt',
            'Please import os before running this.': 'txt',
            'echo this sentiment': 'txt',
            '# const answer = 42;': 'txt',
            '// console.log("hello");': 'txt',
            '/*\nconst answer = 42;\n*/': 'txt',
            '/* unclosed comment\nconst answer = 42;': 'txt',
            '"unterminated string\nconsole.log(42);': 'txt',
            '\'\'\'\nconst answer = 42;\nputs "hello"\n\'\'\'': 'txt',
            'def broken(:\n    pass': 'txt',
            'const answer =': 'txt',
            'import os\nconst answer = 42;\nputs "mixed"': 'txt',
            'console.log("hello");\necho "shell"': 'txt',
            '```python\nimport os\nprint(os.getcwd())\n```': 'md',
            '# Instructions\n\n- Run this\n\nconsole.log("hello");': 'md',
            '{"source":"console.log(42)"}': 'json',
            'language,source\njs,"console.log(42)"': 'csv',
            '[script]\nsource = "console.log(42)"': 'toml' if clipsend.tomllib else 'txt',
            '#!/bin/sh\nnode -e \'console.log(42)\'': 'sh',
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(infer_extension(text.encode()), expected)

    def test_script_detection_does_not_execute_code(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'must-not-exist'
            samples = {
                f'import pathlib\npathlib.Path({str(marker)!r}).touch()': 'py',
                f'const fs = require("fs"); fs.writeFileSync({str(marker)!r}, "");': 'js',
                f'require "fileutils"\nFileUtils.touch({str(marker)!r})': 'rb',
                f'export OUTPUT={str(marker)!r}\ntouch "$OUTPUT"': 'sh',
            }
            for text, expected in samples.items():
                with self.subTest(language=expected):
                    self.assertEqual(infer_extension(text.encode()), expected)
                    self.assertFalse(marker.exists())

    def test_boms_and_binary_signatures(self):
        for encoding in ('utf-8-sig', 'utf-16', 'utf-32'):
            with self.subTest(encoding=encoding):
                self.assertEqual(infer_extension('{"ok":true}'.encode(encoding)), 'json')
        for data, extension in (
            (b'\x89PNG\r\n\x1a\nrest', 'png'), (b'\xff\xd8\xffrest', 'jpg'),
            (b'GIF89arest', 'gif'), (b'II*\x00rest', 'tiff'), (b'%PDF-1.7', 'pdf'),
            (b'PK\x03\x04rest', 'zip'), (b'\x1f\x8brest', 'gz'),
            (b'RIFF1234WEBPrest', 'webp'), (b'RIFF1234WAVErest', 'wav'),
        ):
            with self.subTest(data=data):
                self.assertEqual(infer_extension(data), extension)

    def test_names(self):
        with tempfile.TemporaryDirectory() as directory:
            content = Path(directory) / 'content'
            content.write_text('{"x":1}')
            for name, expected in (
                ('results', 'results.json'), ('résults copy', 'résults copy.json'),
                ('.hidden', '.hidden.json'), ('result.', 'result.json'),
                ('data.TXT', 'data.TXT'), ('.config.json', '.config.json'),
                ('data.tar.gz', 'data.tar.gz'),
            ):
                with self.subTest(name=name):
                    self.assertEqual(inferred_name(name, content), expected)
        # Explicit extensions bypass reading/parsing altogether.
        self.assertEqual(inferred_name('data.txt', '/missing'), 'data.txt')

    def test_large_input_is_not_parsed_as_a_complete_prefix(self):
        with tempfile.TemporaryDirectory() as directory:
            content = Path(directory) / 'content'
            content.write_bytes(b'{"x": 1}    invalid tail')
            with mock.patch.object(clipsend, 'MAX_TEXT_BYTES', 8):
                self.assertEqual(inferred_name('data', content), 'data.txt')
                content.write_bytes(b'%PDF-1.7 lots of data')
                self.assertEqual(inferred_name('data', content), 'data.pdf')

    def test_toml_is_optional(self):
        with mock.patch.object(clipsend, 'tomllib', None):
            self.assertEqual(infer_extension(b'[project]\nname = "demo"'), 'txt')

    def assert_types(self, cases):
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(infer_extension(text.encode()), expected)

    def test_yaml_structures_and_ambiguity(self):
        self.assert_types({
            NEW_TYPES['yaml']: 'yaml',
            'services:\n  web:\n    image: nginx\n    ports: ["8080:80"]': 'yaml',
            '- name: first\n  enabled: true\n- name: second': 'yaml',
            'enabled: true': 'yaml',
            '---\nname: demo\n---\nname: other\n': 'yaml',
            'description: |\n  A multi-line\n  description.\n': 'yaml',
            'script: |\n  echo "hello"\n  ls -la\n': 'yaml',
            'script: |\n  const a = 1;\n  console.log(a);\n': 'yaml',
            'script: |\n  puts "hello"\n': 'yaml',
            'name: demo\ncommand: print("hello")': 'yaml',
            'defaults: &defaults\n  retries: 3\nproduction:\n  <<: *defaults\n': 'yaml',
            'root: &root\n  children: [*root]\n': 'yaml',
            '{name: demo, enabled: true}': 'yaml',
            '[red, green, blue]': 'yaml',
            '%YAML 1.2\n---\n- first\n- second': 'yaml',
            'name: first\nname: duplicate': 'txt',
            'items: [one, two': 'txt',
            'root:\n\tchild: value': 'txt',
            'name: *undefined': 'txt',
            'value: !!python/object/apply:os.system ["echo unsafe"]': 'txt',
            'just ordinary prose': 'txt',
            'Note: remember groceries': 'txt',
            '- shopping\n- laundry': 'txt',
            '---\njust prose': 'txt',
            '{"broken":}': 'txt',
            'import os\nif True:\n    print(os.getcwd())': 'py',
        })

    def test_typescript_and_react_syntax(self):
        self.assert_types({
            NEW_TYPES['ts']: 'ts', NEW_TYPES['jsx']: 'jsx', NEW_TYPES['tsx']: 'tsx',
            'const count: number = 1;': 'ts',
            'type Result<T> = { value: T };': 'ts',
            'const identity = <T>(value: T): T => value;': 'ts',
            'const value = <number>unknownValue;': 'ts',
            'import type { User } from "./types";': 'ts',
            'const value = response as User;': 'ts',
            'const Component: React.FC<Props> = ({name}) => <span>{name}</span>;': 'tsx',
            'export default function App() { return <><Button /></>; }': 'jsx',
            '<Button onClick={() => alert("hello")} />': 'jsx',
            '<div>{name}</div>': 'jsx',
            '<><div>Hello</div></>': 'jsx',
            '<div className="card">Hello</div>': 'jsx',
            '<div>Hello</div>': 'html',
            '<svg xmlns="http://www.w3.org/2000/svg"/>': 'svg',
            '<root><item/></root>': 'xml',
            'const comparison = a < b && c > d;': 'js',
            'const text = "interface User { name: string }";': 'js',
            '// interface User { name: string }': 'txt',
            'const App = () => <div>unfinished': 'txt',
            'interface User { name: }': 'txt',
            'const value: number = ;': 'txt',
            'enum Color { RED, BLUE }': 'txt',  # Valid TS and GraphQL.
        })

    def test_sql_css_graphql_and_diff(self):
        self.assert_types({
            NEW_TYPES['sql']: 'sql', NEW_TYPES['css']: 'css',
            NEW_TYPES['graphql']: 'graphql', NEW_TYPES['diff']: 'diff',
            'SELECT 1': 'sql',
            'SELECT id,name\nFROM users,others;': 'sql',
            '-- query\nSELECT "id"::text FROM "users";': 'sql',
            'WITH active AS (SELECT * FROM users) SELECT * FROM active;': 'sql',
            'INSERT INTO users (name) VALUES (\'Taylor\');': 'sql',
            'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);': 'sql',
            'select a book': 'txt',
            'SELECT FROM;': 'txt',
            'SELECT * FROM users; this is invalid': 'txt',
            '@media (min-width: 600px) { .card:hover { color: blue; } }': 'css',
            '@font-face { font-family: Demo; src: url("demo.woff2"); }': 'css',
            ':root { --accent: #123456; }': 'css',
            '#main { display: flex; }': 'css',
            'p::before { content: "{ not a block }"; }': 'css',
            '.card { color: red': 'txt',
            '.card { color: ; }': 'txt',
            '.card { color red; }': 'txt',
            '/* .card { color: red; } */': 'txt',
            'query User($id: ID!) { user(id: $id) { id name } }': 'graphql',
            '{ users { id name } }': 'graphql',
            '{ alias: field }': 'txt',
            'type User { id: ID! name: String }': 'graphql',
            'interface Node { id: ID! }': 'graphql',
            'fragment UserFields on User { id name }': 'graphql',
            'mutation { createUser(name: "Taylor") { id } }': 'graphql',
            'query Missing { user(': 'txt',
            'query this sentence': 'txt',
            '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n-old\n+new\n context\n': 'diff',
            'diff --git a/f b/f\nindex 111..222 100644\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n': 'diff',
            '--- a/f\n+++ b/f\n@@ -1,5 +1,5 @@\n-a\n+b\n': 'txt',
            '--- a/f\n+++ b/f\nnot a patch': 'txt',
            '@@ not a patch @@': 'txt',
        })

    def test_new_types_preserve_existing_format_precedence(self):
        for extension, source in NEW_TYPES.items():
            with self.subTest(extension=extension):
                self.assertEqual(infer_extension(f'```{extension}\n{source}```'.encode()), 'md')
        self.assert_types({
            '{"name": "demo", "enabled": true}': 'json',
            '#!/bin/sh\necho "query { users { id } }"': 'sh',
            '[project]\nname = "demo"': 'toml' if clipsend.tomllib else 'txt',
        })

    def test_parser_failure_is_quiet_and_bounded(self):
        for error in (FileNotFoundError(), subprocess.TimeoutExpired('node', 3),
                      subprocess.CalledProcessError(1, 'node')):
            with self.subTest(error=error), mock.patch.object(clipsend.subprocess, 'run', side_effect=error):
                self.assertEqual(infer_extension(NEW_TYPES['yaml'].encode()), 'txt')
        with mock.patch.object(clipsend.subprocess, 'run', return_value=mock.Mock(stdout='invalid')):
            self.assertEqual(clipsend.infer_extended('name: demo'), {})

    def test_new_parsers_do_not_execute_content(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'must-not-exist'
            self.assert_types({
                f'import fs from "fs"; const n: number = 1; fs.writeFileSync({str(marker)!r}, "");': 'ts',
                f'const App = () => <div>{{require("fs").writeFileSync({str(marker)!r}, "")}}</div>;': 'jsx',
                f'command: "touch {marker}"\nenabled: true': 'yaml',
            })
            self.assertFalse(marker.exists())


class ShellTests(unittest.TestCase):
    """Exercise real zsh, inference, and writes without touching the clipboard."""

    def setUp(self):
        self.temp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(self.temp)
        self.desktop = self.root / 'Desktop'
        self.desktop.mkdir()
        self.payload = self.root / 'payload'
        self.payload.write_bytes(b'{"ok":true}\r\n')

    def run_cs(self, name=None, kind='text', sources=(), failure='', before='', extension='bin', bridge='', arguments=None):
        env = dict(os.environ, HOME=self.temp, DOTFILES_DIR=str(REPO),
                   CLIP_PAYLOAD=str(self.payload), CLIP_KIND=kind,
                   CLIP_SOURCES='\n'.join(map(str, sources)), CLIP_FAILURE=failure, CLIP_EXTENSION=extension, CLIP_BRIDGE=str(bridge))
        script = '''
source "$DOTFILES_DIR/src/functions/clipsend.sh"
source "$DOTFILES_DIR/src/functions/aliases.sh"
__alias_nudge() { :; }
__clipsend_pasteboard() {
  [[ "$1" == capture ]] || { print -u2 'unexpected second clipboard read'; return 1; }
  print -r -- "$1" >> "$HOME/bridge-calls"
  [[ "$CLIP_FAILURE" == inspect || "$CLIP_FAILURE" == image || "$CLIP_FAILURE" == paste ]] && return 1
  if [[ "$CLIP_KIND" == image ]]; then
    printf '%s' "$3" > "$2"
  elif [[ "$CLIP_KIND" == text || "$CLIP_KIND" == data ]]; then
    cat "$CLIP_PAYLOAD" > "$2"
  fi
  print -r -- "$CLIP_KIND"
  [[ "$CLIP_KIND" == data ]] && print -r -- "$CLIP_EXTENSION"
  [[ -n "$CLIP_SOURCES" ]] && print -r -- "$CLIP_SOURCES"
  return 0
}
pbpaste() { print -u2 'unexpected lossy clipboard read'; return 1; }
functions[/usr/bin/pbcopy]='[[ "$CLIP_FAILURE" == copy ]] && return 1; cat > "$HOME/copied-path"'
''' + before + '\ncs "$@"\n'
        return subprocess.run(['zsh', '-f', '-c', script, 'test', *(arguments if arguments is not None else ([] if name is None else [name]))],
                              env=env, text=True, capture_output=True)

    def assert_saved(self, result, expected_name):
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = self.desktop / expected_name
        self.assertTrue(saved.exists(), result.stdout)
        self.assertEqual((self.root / 'copied-path').read_text(), str(saved))
        return saved

    def test_named_unnamed_and_explicit_extension(self):
        saved = self.assert_saved(self.run_cs('my-json-results'), 'my-json-results.json')
        self.assertEqual(saved.read_bytes(), self.payload.read_bytes())
        result = self.run_cs()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(Path(result.stdout.splitlines()[0]).name, r'^clipsend-\d{6}-1-lines\.json$')
        saved = self.assert_saved(self.run_cs('literal.TXT'), 'literal.TXT')
        self.assertEqual(saved.read_bytes(), self.payload.read_bytes())

    def test_fallback_and_default_fallback(self):
        self.payload.write_bytes(b'ordinary prose without a final newline')
        self.assert_saved(self.run_cs('notes'), 'notes.txt')
        result = self.run_cs()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(Path(result.stdout.splitlines()[0]).name, r'-0-lines\.txt$')

    def test_script_extensions_named_unnamed_and_explicit(self):
        for extension, source in (
            ('py', 'import os\nprint(os.getcwd())\n'),
            ('js', 'const answer = 42;\n'),
            ('rb', 'puts "hello"\n'),
            ('sh', 'echo "hello"\n'),
        ):
            with self.subTest(extension=extension):
                self.payload.write_text(source)
                saved = self.assert_saved(self.run_cs('snippet'), f'snippet.{extension}')
                self.assertEqual(saved.read_bytes(), self.payload.read_bytes())
                result = self.run_cs()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(Path(result.stdout.splitlines()[0]).name.endswith('.' + extension))
                saved = self.assert_saved(self.run_cs(extension + '.txt'), extension + '.txt')
                self.assertEqual(saved.read_bytes(), self.payload.read_bytes())

    def test_new_extensions_named_unnamed_and_explicit(self):
        for extension, source in NEW_TYPES.items():
            with self.subTest(extension=extension):
                self.payload.write_bytes(source.replace('\n', '\r\n').encode())
                saved = self.assert_saved(self.run_cs('snippet'), f'snippet.{extension}')
                self.assertEqual(saved.read_bytes(), self.payload.read_bytes())
                result = self.run_cs()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(Path(result.stdout.splitlines()[0]).name.endswith('.' + extension))
                saved = self.assert_saved(self.run_cs(extension + '.txt'), extension + '.txt')
                self.assertEqual(saved.read_bytes(), self.payload.read_bytes())

    def test_collision_hidden_names_trailing_dot_and_path_stripping(self):
        (self.desktop / 'data.json').write_text('existing')
        (self.desktop / 'data-1.json').symlink_to(self.root / 'missing')
        self.assert_saved(self.run_cs('data'), 'data-2.json')
        self.assertEqual((self.desktop / 'data.json').read_text(), 'existing')
        self.assert_saved(self.run_cs('.hidden'), '.hidden.json')
        self.assert_saved(self.run_cs('.hidden'), '.hidden-1.json')
        self.assert_saved(self.run_cs('data.'), 'data-3.json')
        self.assert_saved(self.run_cs('/elsewhere/a name'), 'a name.json')

    def test_finder_files_directories_and_multiple(self):
        original = self.root / 'original.csv'
        original.write_text('name,age\na,1\n')
        self.assert_saved(self.run_cs('renamed', 'files', [original]), 'renamed.csv')
        self.assert_saved(self.run_cs('trailing.', 'files', [original]), 'trailing.csv')
        self.assert_saved(self.run_cs('renamed.txt', 'files', [original]), 'renamed.txt')
        extensionless = self.root / 'records'
        extensionless.write_bytes(self.payload.read_bytes())
        self.assert_saved(self.run_cs(kind='files', sources=[extensionless]), 'records.json')
        directory = self.root / 'source-folder'
        directory.mkdir()
        (directory / 'child').write_text('keep')
        saved = self.assert_saved(self.run_cs('folder', 'files', [directory]), 'folder')
        self.assertEqual((saved / 'child').read_text(), 'keep')
        result = self.run_cs('ignored', 'files', [original, extensionless])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('ignoring name', result.stderr)
        self.assertEqual(len((self.root / 'copied-path').read_text().splitlines()), 2)

    def test_images_keep_conversion_rules(self):
        for name, expected, fmt in (
            ('picture', 'picture.png', 'png'), ('picture.jpg', 'picture.jpg', 'jpeg'),
            ('picture.JPEG', 'picture.JPEG', 'jpeg'), ('picture.tif', 'picture.tif', 'tiff'),
            ('picture.gif', 'picture.gif', 'gif'), ('picture.bmp', 'picture.bmp', 'bmp'),
            ('picture.txt', 'picture.txt.png', 'png'),
            ('trailing.', 'trailing.png', 'png'),
        ):
            with self.subTest(name=name):
                saved = self.assert_saved(self.run_cs(name, 'image'), expected)
                self.assertEqual(saved.read_text(), fmt)
        result = self.run_cs(kind='image')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout.splitlines()[0], r'-image\.png$')

    def test_binary_capture_preserves_bytes_and_uses_one_bridge_call(self):
        self.payload.write_bytes(b'\xff\0binary\x80')
        saved = self.assert_saved(self.run_cs('payload', 'data'), 'payload.bin')
        self.assertEqual(saved.read_bytes(), self.payload.read_bytes())
        self.assertEqual((self.root / 'bridge-calls').read_text(), 'capture\n')
        self.assert_saved(self.run_cs('document', 'data', extension='pdf'), 'document.pdf')
        self.assert_saved(self.run_cs('explicit.dat', 'data'), 'explicit.dat')
        result = self.run_cs(kind='data')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(Path(result.stdout.splitlines()[0]).name, r'-data\.bin$')

    def test_from_source_bypasses_clipboard_and_preserves_any_file(self):
        source = self.root / 'photo with spaces.heic'
        source.write_bytes(b'\0opaque binary\xff\x80')
        saved = self.assert_saved(self.run_cs(arguments=['renamed', '--from', str(source)], failure='inspect'), 'renamed.heic')
        self.assertEqual(saved.read_bytes(), source.read_bytes())
        self.assertFalse((self.root / 'bridge-calls').exists())
        self.assert_saved(self.run_cs(arguments=['--from', str(source)]), source.name)
        self.assert_saved(self.run_cs(arguments=['explicit.dat', '--from', str(source)]), 'explicit.dat')
        extensionless = self.root / 'binary-source'
        extensionless.write_bytes(source.read_bytes())
        self.assert_saved(self.run_cs(arguments=['--from', str(extensionless)]), 'binary-source.bin')
        directory = self.root / 'original-folder'
        directory.mkdir()
        (directory / 'child').write_bytes(source.read_bytes())
        saved = self.assert_saved(self.run_cs(arguments=['folder', '--from', str(directory)]), 'folder')
        self.assertEqual((saved / 'child').read_bytes(), source.read_bytes())

    def test_from_invalid_arguments_do_not_publish_or_capture(self):
        for args in [['--from'], ['--from', ''], ['name', '--from', ''],
                     ['--from', str(self.root / 'missing')], ['name', 'unexpected'],
                     ['name', '--from', 'source', 'unexpected']]:
            with self.subTest(args=args):
                result = self.run_cs(arguments=args)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / 'bridge-calls').exists())
                self.assertFalse((self.root / 'copied-path').exists())
                self.assertEqual(list(self.desktop.iterdir()), [])

    @unittest.skipUnless(sys.platform == 'darwin', 'requires macOS AppKit')
    def test_native_capture_through_cs(self):
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\0\0' * 2) * 2)) + chunk(b'IEND', b'')
        self.payload.write_bytes(png)
        source = (REPO / 'src/javascript/clipsend-pasteboard.js').read_text().replace('function run(argv)', 'function originalRun(argv)')
        helper = self.root / 'native.js'
        helper.write_text(source + r'''
function run(argv) {
  if (argv[0] === 'make-jpeg') {
    const png = $.NSData.dataWithContentsOfFile(argv[1]);
    convertImage(png, 'jpeg').writeToFileAtomically(argv[2], true);
    return 'ok';
  }
  const pb = $.NSPasteboard.pasteboardWithUniqueName;
  try {
    pb.setDataForType($.NSData.dataWithContentsOfFile(argv[3]), argv[4]);
    const result = capture(pb, argv[1], argv[2]);
    pb.clearContents; // a subsequent clipboard change must not affect the saved snapshot
    return result;
  } finally { pb.releaseGlobally; }
}
''')
        jpg = self.root / 'source.jpg'
        subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(helper), 'make-jpeg',
                        str(self.payload), str(jpg)], capture_output=True, check=True)
        before = r'''
__clipsend_pasteboard() {
  print -r -- "$1" >> "$HOME/bridge-calls"
  /usr/bin/osascript -l JavaScript "$CLIP_BRIDGE" "$@" "$CLIP_PAYLOAD" "$CLIP_SOURCES"
}
'''
        for name, payload, clip_type, expected, prefix in (
            ('screenshot', png, 'public.png', 'screenshot.png', b'\x89PNG'),
            ('raw-png', png, 'public.utf8-plain-text', 'raw-png.png', b'\x89PNG'),
            ('photo', jpg.read_bytes(), 'public.jpeg', 'photo.png', b'\x89PNG'),
            ('photo.jpg', jpg.read_bytes(), 'public.jpeg', 'photo.jpg', b'\xff\xd8\xff'),
            ('raw.jpg', jpg.read_bytes(), 'public.utf8-plain-text', 'raw.jpg', b'\xff\xd8\xff'),
            ('raw-default', jpg.read_bytes(), 'public.utf8-plain-text', 'raw-default.png', b'\x89PNG'),
            ('records', b'{"ok":true}\r\n', 'public.utf8-plain-text', 'records.json', b'{'),
            ('binary', b'\xff\0\x80', 'public.utf8-plain-text', 'binary.bin', b'\xff\0\x80'),
        ):
            with self.subTest(name=name):
                self.payload.write_bytes(payload)
                (self.root / 'bridge-calls').unlink(missing_ok=True)
                saved = self.assert_saved(self.run_cs(name, sources=[clip_type], before=before, bridge=helper), expected)
                self.assertTrue(saved.read_bytes().startswith(prefix))
                if expected.endswith(('.jpg', '.json', '.bin')) or payload == png:
                    self.assertEqual(saved.read_bytes(), payload)
                self.assertEqual((self.root / 'bridge-calls').read_text(), 'capture\n')

    def test_failures_do_not_publish_paths(self):
        for kind, failure in (('empty', ''), ('unexpected', ''), ('text', 'inspect'),
                              ('text', 'paste'), ('image', 'image')):
            with self.subTest(kind=kind, failure=failure):
                result = self.run_cs(kind=kind, failure=failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / 'copied-path').exists())
                self.assertEqual(list(self.desktop.iterdir()), [])

    def test_detector_failure_falls_back(self):
        self.assert_saved(self.run_cs('fallback', before='python3() { return 1; }'), 'fallback.txt')

    def test_publish_failure_reports_saved_file(self):
        result = self.run_cs('data', failure='copy')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.desktop / 'data.json').exists())
        self.assertIn('Files saved', result.stderr)


@unittest.skipUnless(sys.platform == 'darwin', 'requires macOS AppKit')
class PasteboardTests(unittest.TestCase):
    """Real AppKit capture on a private pasteboard; no system clipboard writes."""

    def run_native(self, checks):
        bridge = (REPO / 'src/javascript/clipsend-pasteboard.js').read_text()
        bridge = bridge.replace('function run(argv)', 'function originalRun(argv)')
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / 'test.js'
            script.write_text(bridge + r'''
function run(argv) {
  const pb = $.NSPasteboard.pasteboardWithUniqueName;
  const path = argv[0] + '/snapshot';
  function check(condition, message) { if (!condition) throw new Error(message); }
  function equal(data) { return $.NSData.dataWithContentsOfFile(path).isEqualToData(data); }
  function fails(operation, message) {
    let error = '';
    try { operation(); } catch (e) { error = String(e); }
    check(error.includes(message), 'expected ' + message + ', got ' + error);
  }
  const bitmap = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, 2, 3, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  bitmap.colorSpace = $.NSColorSpace.deviceRGBColorSpace;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 3; y++) bitmap.setColorAtXY($.NSColor.redColor, x, y);
  const png = bitmap.representationUsingTypeProperties(4, $({}));
  const jpg = bitmap.representationUsingTypeProperties(3, $({}));
  const damaged = '\ufffd'.repeat(4) + '\0\x10JFIF\0\1\1';
  try {
''' + checks + r'''
    return 'ok';
  } finally {
    pb.releaseGlobally;
  }
}
''')
            result = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(script), directory],
                                    text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), 'ok')

    def test_images_conversions_and_mislabeled_raw_bytes(self):
        self.run_native(r'''
    pb.clearContents;
    check(capture(pb, path, 'png') === 'empty', 'empty clipboard');
    pb.setDataForType(png, 'public.png');
    for (const fmt of ['png', 'jpeg', 'tiff', 'gif', 'bmp']) {
      check(capture(pb, path, fmt) === 'image', 'image capture ' + fmt);
      check(!$.NSImage.alloc.initWithContentsOfFile(path).isNil(), 'decode ' + fmt);
      if (fmt === 'png') check(equal(png), 'original PNG bytes');
    }
    for (const fmt of ['png', 'jpeg', 'tiff', 'gif', 'bmp']) {
      const data = bitmap.representationUsingTypeProperties(FILE_TYPES[fmt], $({}));
      pb.clearContents; pb.setDataForType(data, RAW_TYPES[fmt]);
      check(capture(pb, path, fmt) === 'image' && equal(data), 'preserve original ' + fmt);
      check(capture(pb, path, 'png') === 'image', 'convert ' + fmt + ' to PNG');
      check(!$.NSImage.alloc.initWithContentsOfFile(path).isNil(), 'decode PNG from ' + fmt);
    }
    pb.clearContents; pb.setDataForType(jpg, 'public.jpeg');
    check(capture(pb, path, 'jpeg') === 'image' && equal(jpg), 'original JPEG bytes');
    check(capture(pb, path, 'png') === 'image', 'default JPEG conversion');
    check(imageFormat(header($.NSData.dataWithContentsOfFile(path))) === 'png', 'default PNG encoding');
    for (const type of ['public.utf8-plain-text', 'NSStringPboardType', 'public.data']) {
      for (const [data, fmt] of [[png, 'png'], [jpg, 'jpeg']]) {
        pb.clearContents; pb.setDataForType(data, type);
        check(capture(pb, path, fmt) === 'image' && equal(data), 'binary image mislabeled as ' + type);
      }
    }
    // The common matching-format paths must never enter the full decoder.
    convertImage = function() { throw new Error('unexpected full decoding'); };
    check(capture(pb, path, 'jpeg') === 'image' && equal(jpg), 'JPEG fast path');
    pb.clearContents; pb.setDataForType(png, 'public.png');
    check(capture(pb, path, 'png') === 'image' && equal(png), 'PNG fast path');
    pb.setDataForType(jpg, 'public.jpeg');
    check(capture(pb, path, 'png') === 'image' && equal(png), 'prefer already offered PNG over JPEG conversion');
''')

    def test_jpeg_orientation_preserved_on_conversion(self):
        self.run_native(r'''
    // APP1 Exif with one little-endian TIFF entry: orientation = 6 (90 degrees).
    const exif = $('\xff\xe1\0\x22Exif\0\0II*\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0')
      .dataUsingEncoding($.NSISOLatin1StringEncoding);
    const oriented = $.NSMutableData.alloc.init;
    oriented.appendData(jpg.subdataWithRange($.NSMakeRange(0, 2)));
    oriented.appendData(exif);
    oriented.appendData(jpg.subdataWithRange($.NSMakeRange(2, Number(jpg.length) - 2)));
    pb.setDataForType(oriented, 'public.jpeg');
    check(capture(pb, path, 'jpeg') === 'image' && equal(oriented), 'preserve JPEG Exif bytes');
    check(capture(pb, path, 'png') === 'image', 'convert oriented JPEG');
    const result = $.NSBitmapImageRep.imageRepWithData($.NSData.dataWithContentsOfFile(path));
    check(Number(result.pixelsWide) === 3 && Number(result.pixelsHigh) === 2, 'apply JPEG orientation');
''')

    def test_text_bytes_unicode_boms_and_precedence(self):
        self.run_native(r'''
    for (const value of ['{"ok":true}\r\n', 'Résumé 😀\n', '\ufeff{"ok":true}', 'ordinary \ufffd prose', 'BMW is a car brand']) {
      pb.clearContents; pb.setStringForType(value, $.NSPasteboardTypeString);
      const original = pb.dataForType($.NSPasteboardTypeString);
      pb.setDataForType(png, 'public.png');
      check(capture(pb, path, 'png') === 'text' && equal(original), 'text bytes and precedence');
    }
    for (const encoding of [$.NSUTF16StringEncoding, $.NSUTF32StringEncoding]) {
      const bomText = $('{\"ok\":true}').dataUsingEncoding(encoding);
      pb.clearContents; pb.setDataForType(bomText, $.NSPasteboardTypeString);
      check(capture(pb, path, 'png') === 'text' && equal(bomText), 'BOM in generic text flavor');
    }
    const utf16 = $('Résumé 😀\r\n').dataUsingEncoding($.NSUTF16StringEncoding);
    pb.clearContents; pb.setDataForType(utf16, 'public.utf16-external-plain-text');
    check(capture(pb, path, 'png') === 'text' && equal(utf16), 'UTF-16 bytes');
    pb.clearContents; pb.setStringForType('legacy text', 'NSStringPboardType');
    check(capture(pb, path, 'png') === 'text', 'legacy string');
    pb.clearContents; pb.writeObjects($([$.NSURL.fileURLWithPath(path)]));
    pb.setStringForType('snapshot', $.NSPasteboardTypeString); pb.setDataForType(png, 'public.png');
    check(capture(pb, path, 'png') === 'files\n' + path, 'Finder beats text and image');
    pb.clearContents; pb.setStringForType('first', $.NSPasteboardTypeString);
    const first = $.NSPasteboardItem.alloc.init;
    const second = $.NSPasteboardItem.alloc.init;
    first.setStringForType('one', $.NSPasteboardTypeString);
    second.setStringForType('two', $.NSPasteboardTypeString);
    pb.clearContents; pb.writeObjects($([first, second]));
    check(capture(pb, path, 'png') === 'text', 'multi-item text');
    check($.NSString.alloc.initWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js === 'one\ntwo', 'text concatenation');
''')

    def test_binary_and_corrupt_text_recovery(self):
        self.run_native(r'''
    for (const [value, ext] of [['%PDF-1.7\n', 'pdf'], ['PK\3\4rest', 'zip'], ['RIFF1234WAVErest', 'wav'], ['\0unknown binary', 'bin']]) {
      pb.clearContents; pb.setStringForType(value, $.NSPasteboardTypeString);
      const original = pb.dataForType($.NSPasteboardTypeString);
      check(capture(pb, path, 'png') === 'data\n' + ext && equal(original), 'binary bytes ' + ext);
    }
    const invalid = $.NSData.alloc.initWithBase64EncodedStringOptions('/4CB', 0);
    pb.clearContents; pb.setDataForType(invalid, $.NSPasteboardTypeString);
    check(capture(pb, path, 'png') === 'data\nbin' && equal(invalid), 'invalid UTF-8 preserved');
    pb.clearContents; pb.setStringForType(damaged, $.NSPasteboardTypeString);
    fails(() => capture(pb, path, 'png'), 'already converted to text');
    pb.setDataForType(png, 'public.png');
    check(capture(pb, path, 'png') === 'image' && equal(png), 'recover intact alternate image');
    pb.clearContents; pb.setDataForType($('not an image').dataUsingEncoding($.NSUTF8StringEncoding), 'public.png');
    fails(() => capture(pb, path, 'png'), 'could not decode');
''')

    def test_changed_clipboard_unavailable_data_and_write_failure(self):
        self.run_native(r'''
    pb.clearContents; pb.setStringForType('hello', $.NSPasteboardTypeString);
    const changing = {
      get changeCount() { return pb.changeCount; },
      get types() { return pb.types; },
      readObjectsForClassesOptions: (classes, options) => pb.readObjectsForClassesOptions(classes, options),
      dataForType: (type) => { const data = pb.dataForType(type); pb.clearContents; return data; }
    };
    fails(() => capture(changing, path, 'png'), 'clipboard changed');
    pb.setStringForType('hello', $.NSPasteboardTypeString);
    changing.dataForType = () => $();
    fails(() => capture(changing, path, 'png'), 'data unavailable');
    fails(() => capture(pb, argv[0] + '/missing/out', 'png'), 'could not write');
    fails(() => capture(pb, path, 'unsupported'), 'unsupported format');
''')


if __name__ == '__main__':
    unittest.main()
