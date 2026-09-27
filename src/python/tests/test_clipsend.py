import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from clipsend import infer_extension, inferred_name
import clipsend

REPO = Path(__file__).resolve().parents[3]


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
            'key: value', 'const answer = 42;', 'https://example.com/file.json',
            '{\\rtf1 unfinished', 'BEGIN:VCARD\nFN:Taylor', '#!/unknown\nanything',
            'key = ', 'abc\x00def',
        ):
            with self.subTest(text=text):
                self.assertEqual(infer_extension(text.encode()), "txt")
        self.assertEqual(infer_extension(b'\xff\x80\x81'), "txt")

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


class ShellTests(unittest.TestCase):
    """Exercise real zsh, inference, and writes without touching the clipboard."""

    def setUp(self):
        self.temp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(self.temp)
        self.desktop = self.root / 'Desktop'
        self.desktop.mkdir()
        self.payload = self.root / 'payload'
        self.payload.write_bytes(b'{"ok":true}\r\n')

    def run_cs(self, name=None, kind='text', sources=(), failure='', before=''):
        env = dict(os.environ, HOME=self.temp, DOTFILES_DIR=str(REPO),
                   CLIP_PAYLOAD=str(self.payload), CLIP_KIND=kind,
                   CLIP_SOURCES='\n'.join(map(str, sources)), CLIP_FAILURE=failure)
        script = '''
source "$DOTFILES_DIR/src/functions/clipsend.sh"
source "$DOTFILES_DIR/src/functions/aliases.sh"
__alias_nudge() { :; }
__clipsend_pasteboard() {
  [[ "$CLIP_FAILURE" == inspect ]] && return 1
  if [[ "$1" == inspect ]]; then
    print -r -- "$CLIP_KIND"
    [[ -n "$CLIP_SOURCES" ]] && print -r -- "$CLIP_SOURCES"
    return 0
  fi
  [[ "$CLIP_FAILURE" == image ]] && return 1
  printf '%s' "$3" > "$2"
}
pbpaste() { [[ "$CLIP_FAILURE" == paste ]] && return 1; cat "$CLIP_PAYLOAD"; }
functions[/usr/bin/pbcopy]='[[ "$CLIP_FAILURE" == copy ]] && return 1; cat > "$HOME/copied-path"'
''' + before + '\ncs "$@"\n'
        return subprocess.run(['zsh', '-f', '-c', script, 'test', *([] if name is None else [name])],
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
        ):
            with self.subTest(name=name):
                saved = self.assert_saved(self.run_cs(name, 'image'), expected)
                self.assertEqual(saved.read_text(), fmt)
        result = self.run_cs(kind='image')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout.splitlines()[0], r'-image\.png$')

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
    def test_native_bridge_on_private_pasteboard(self):
        # A private pasteboard exercises AppKit without reading or replacing the
        # user's system clipboard. Keep the production bridge unmodified.
        bridge = (REPO / 'src/javascript/clipsend-pasteboard.js').read_text()
        bridge = bridge.replace('function run(argv)', 'function originalRun(argv)')
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / 'test.js'
            script.write_text(bridge + r'''
function run(argv) {
  const pb = $.NSPasteboard.pasteboardWithUniqueName;
  function check(condition, message) { if (!condition) throw new Error(message); }
  try {
    pb.clearContents;
    check(inspect(pb) === 'empty', 'empty clipboard');
    const bitmap = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
      null, 2, 2, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) bitmap.setColorAtXY($.NSColor.redColor, x, y);
    const png = bitmap.representationUsingTypeProperties(4, $({}));
    pb.setDataForType(png, 'public.png');
    check(inspect(pb) === 'image', 'PNG detection');
    for (const fmt of ['png', 'jpeg', 'tiff', 'gif', 'bmp']) {
      const path = argv[0] + '/image.' + fmt;
      writeImage(pb, path, fmt);
      check(!$.NSImage.alloc.initWithContentsOfFile(path).isNil(), 'decode ' + fmt);
      if (fmt === 'png') check($.NSData.dataWithContentsOfFile(path).isEqualToData(png), 'original PNG bytes');
    }
    pb.setStringForType('{"ok":true}', $.NSPasteboardTypeString);
    check(inspect(pb) === 'text', 'text takes precedence over accompanying image');
    pb.clearContents;
    pb.writeObjects($([$.NSURL.fileURLWithPath(argv[0] + '/image.png')]));
    pb.setStringForType('image.png', $.NSPasteboardTypeString);
    check(inspect(pb) === 'files\n' + argv[0] + '/image.png', 'file takes precedence over text');
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


if __name__ == '__main__':
    unittest.main()
