import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location("burst", Path(__file__).with_name("burst.py"))
burst = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(burst)
PNG = b"\x89PNG\r\n\x1a\nmock"


class Output:
    def read(self):
        return PNG


class BurstSmokeTest(unittest.TestCase):
    def run_case(self, has_image):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "bulk generation").mkdir()
            calls = {}

            def clipboard(command, check):
                if has_image:
                    Path(command[-1]).write_bytes(PNG)
                return mock.Mock(returncode=0 if has_image else 3)

            def generate(model, input):
                image_field = next(field for name, field, _ in burst.MODELS if name == model)
                self.assertEqual(image_field in input if image_field else False,
                                 bool(image_field and has_image))
                if image_field and has_image:
                    handle = input[image_field]
                    handle = handle[0] if isinstance(handle, list) else handle
                    self.assertEqual(handle.read(), PNG)
                calls[model] = input
                return [Output()]

            stdout = io.StringIO()
            with mock.patch.object(burst, "DESKTOP", root), \
                 mock.patch.object(burst.subprocess, "run", side_effect=clipboard), \
                 mock.patch.object(burst.replicate, "run", side_effect=generate), \
                 mock.patch.object(burst.os, "environ", {"REPLICATE_API_TOKEN": "test"}), \
                 mock.patch.object(burst.sys, "argv", ["burst", "red", "sunrise"]), \
                 contextlib.redirect_stdout(stdout):
                self.assertEqual(burst.main(), 0)

            output = root / "bulk generation 2"
            expected = 8 if has_image else 7
            self.assertEqual(len(calls), expected)
            self.assertEqual(len(list(output.glob("*.png"))), expected)
            self.assertTrue(all(value["prompt"] == "red sunrise" for value in calls.values()))
            self.assertEqual(len(list(output.glob("*--text-only.png"))), 4 if has_image else 7)
            self.assertIn("image found" if has_image else "no image found", stdout.getvalue())
            if not has_image:
                self.assertNotIn("qwen/qwen-image-edit-plus", calls)
                self.assertIn("Skipping qwen/qwen-image-edit-plus", stdout.getvalue())

    def test_clipboard_image(self):
        self.run_case(True)

    def test_text_only(self):
        self.run_case(False)


if __name__ == "__main__":
    unittest.main()
