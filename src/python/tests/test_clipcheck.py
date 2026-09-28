import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("clipcheck", Path(__file__).parents[1] / "clipcheck.py")
clipcheck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clipcheck)


class ClipcheckTests(unittest.TestCase):
    def test_windows_cover_all_predictions_once(self):
        for length in [2, 511, 512, 513, 1023, 1024, 4097]:
            ids = list(range(length))
            chunks = list(clipcheck.windows(ids))
            self.assertEqual([token for _, chunk in chunks for token in chunk[1:]], ids[1:])
            self.assertTrue(all(2 <= len(c) <= 512 for _, c in chunks))

    def test_classifier_matches_upstream_and_handles_extremes(self):
        repo = Path.home() / "src/playgrounds/fast-detect-gpt"
        sys.path.insert(0, str(repo / "scripts"))
        os.environ.setdefault("MPLCONFIGDIR", str(repo / ".matplotlib"))
        from local_infer import compute_prob_norm
        params = dict(mu0=-0.2489, sigma0=0.9968, mu1=1.8983, sigma1=1.9935)
        for score in [-3, -1, 0, 1, 3, 6]:
            self.assertAlmostEqual(clipcheck.calibrated_probability(score, params),
                                   compute_prob_norm(score, **params), places=12)
        for score in [-1000, 1000]:
            self.assertTrue(0 <= clipcheck.calibrated_probability(score, params) <= 1)

    def sample(self):
        text = 'café 漢字\n<script>alert("test")</script>\n\n'
        result = dict(created_at="2026-09-27T12:00:00-04:00", model="test", device="cpu",
                      words=5, input_tokens=10, scored_tokens=9, elapsed_seconds=1.0,
                      upstream_commit="test", model_revision="test", warnings=[],
                      input_sha256=hashlib.sha256(text.encode()).hexdigest(),
                      sections=[dict(section=1, scored_tokens=9, criterion=1.0,
                                     ai_probability=0.6, signal="Inconclusive")])
        return text, result

    def test_reports_preserve_text_escape_html_and_do_not_overwrite(self):
        text, result = self.sample()
        with tempfile.TemporaryDirectory() as root:
            first = clipcheck.write_reports(text, result, Path(root))
            second = clipcheck.write_reports(text, result, Path(root))
            self.assertNotEqual(first, second)
            self.assertEqual((first / "input.txt").read_bytes(), text.encode())
            self.assertEqual(json.loads((first / "report.json").read_text()), result)
            html = (first / "report.html").read_text()
            self.assertNotIn('<script>', html)
            self.assertIn('&lt;script&gt;', html)
            self.assertEqual(set(p.name for p in first.iterdir()), {"input.txt", "report.html", "report.md", "report.json"})

    def test_failed_write_leaves_no_report(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(Path, "write_text", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    clipcheck.write_reports(*self.sample(), Path(root))
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_empty_and_short_inputs_fail_before_loading(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "input.txt"
            for text in ["", " \n\t", "one two three"]:
                source.write_text(text)
                with patch.object(sys, "argv", ["clipcheck", "--input", str(source)]), \
                     patch.object(clipcheck, "evaluate") as evaluator, \
                     contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(clipcheck.main(), 1)
                    evaluator.assert_not_called()


if __name__ == "__main__":
    unittest.main()
