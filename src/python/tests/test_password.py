import contextlib
import io
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import termios
import time
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import password


class ArgumentTests(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(password.parse_args([]), (10, 16, 3))

    def test_every_alias_and_format(self):
        for alias, name in password.ALIASES.items():
            for prefix in ("", "-", "--"):
                for separator in ("", " ", ":", "="):
                    argument = f"{prefix}{alias}{separator}12"
                    expected = {
                        "length": (12, 12, 3), "min": (12, 16, 3),
                        "max": (10, 12, 3), "options": (10, 16, 12),
                    }[name]
                    with self.subTest(argument=argument):
                        self.assertEqual(password.parse_args(argument.split()), expected)
                        self.assertEqual(password.parse_args([argument]), expected)

    def test_mixed_formats_and_spacing(self):
        self.assertEqual(password.parse_args(["--MIN", ":", "11", "-max=16", "cnt3"]), (11, 16, 3))
        self.assertEqual(password.parse_args(["l7", "opts1"]), (7, 7, 1))

    def test_invalid_and_ambiguous_arguments(self):
        cases = [
            ["length"], ["min=0"], ["cnt-2"], ["opts=1.5"], ["l=+12"],
            ["length12junk"], ["---l12"], ["foo12"], ["12"], ["min12max16"],
            ["l12", "len12"], ["opts3", "count4"], ["min17"], ["max9"],
            ["l12", "min10"], ["max16", "length12"], ["min:1:2"],
            ["options", "--max16"], ["l１２"],
        ]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(ValueError):
                password.parse_args(args)


class GenerationTests(unittest.TestCase):
    def test_real_words_and_inclusive_lengths(self):
        words = password.load_words()
        for minimum, maximum in [(10, 16), (7, 7), (10, 10), (16, 16), (25, 30)]:
            results = password.generate_passwords(words, minimum, maximum, 20)
            self.assertEqual(len(set(results)), 20)
            for result in results:
                self.assertTrue(result.startswith("A1!-"))
                self.assertLessEqual(minimum, len(result))
                self.assertLessEqual(len(result), maximum)
                self.assertTrue(all(word in words for word in result[4:].split("-")))

    def test_all_possible_sequences_without_duplicates(self):
        # Exact length 11 means two three-letter words, with a hyphen and prefix.
        expected = {"A1!-cat-cat", "A1!-cat-dog", "A1!-dog-cat", "A1!-dog-dog"}
        for _ in range(20):
            self.assertEqual(set(password.generate_passwords(["cat", "dog", "cat"], 11, 11, 4)), expected)
        self.assertEqual(set(password.generate_passwords(["cat", "dog"], 7, 11, 6)), expected | {"A1!-cat", "A1!-dog"})

    def test_impossible_lengths_or_counts(self):
        for minimum, maximum, count in [(1, 4, 1), (8, 10, 1), (7, 7, 3)]:
            with self.subTest(bounds=(minimum, maximum, count)), self.assertRaises(ValueError):
                password.generate_passwords(["cat", "dog"], minimum, maximum, count)

    def test_word_count_has_no_fixed_limit(self):
        for count in (1, 6, 20):
            expected = "A1!-" + "-".join(["cat"] * count)
            with self.subTest(word_count=count):
                self.assertEqual(
                    password.generate_passwords(["cat"], len(expected), len(expected), 1),
                    [expected],
                )


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(mock.patch.object(password, "require_ghostty"))
        self.enterContext(mock.patch.object(password, "temporary_screen", contextlib.nullcontext))

    def test_selection_reprompts_and_copies_only_selected_password(self):
        output = io.StringIO()
        candidates = ["A1!-first", "A1!-second", "A1!-third"]
        with mock.patch.object(password, "generate_passwords", return_value=candidates), \
                mock.patch("builtins.input", side_effect=["0", "4", "bad", "1.5", " 2 "]) as prompt, \
                mock.patch.object(password.subprocess, "run") as copy, \
                contextlib.redirect_stdout(output):
            self.assertEqual(password.main([]), 0)
        self.assertTrue(output.getvalue().replace(password.ERASE_SCREEN, "").startswith(
            "1) A1!-first  \033[90m—> 9 chars\033[0m\n"
            "2) A1!-second \033[90m—> 10 chars\033[0m\n"
            "3) A1!-third  \033[90m—> 9 chars\033[0m\n"
        ))
        self.assertEqual(prompt.call_args, mock.call("Selection: "))
        copy.assert_called_once_with(["pbcopy"], input="A1!-second", text=True, check=True)

    def test_indicators_align_across_lengths_and_two_digit_numbers(self):
        candidates = ["A1!-cat", "A1!-cat-dog", "A1!-elephant"] * 4
        output = io.StringIO()
        with mock.patch.object(password, "generate_passwords", return_value=candidates), \
                mock.patch("builtins.input", return_value="12"), \
                mock.patch.object(password.subprocess, "run"), \
                contextlib.redirect_stdout(output):
            self.assertEqual(password.main(["opts12"]), 0)
        lines = output.getvalue().replace(password.ERASE_SCREEN, "").splitlines()[:12]
        self.assertEqual(len({line.index("\033[90m—>") for line in lines}), 1)
        for line, value in zip(lines, candidates):
            self.assertTrue(line.endswith(f"\033[90m—> {len(value)} chars\033[0m"))

    def test_single_option_copies_without_display_or_selector(self):
        output = io.StringIO()
        with mock.patch.object(password, "generate_passwords", return_value=["A1!-cat-dog"]), \
                mock.patch("builtins.input") as prompt, \
                mock.patch.object(password.subprocess, "run") as copy, \
                contextlib.redirect_stdout(output):
            self.assertEqual(password.main(["opts1"]), 0)
        prompt.assert_not_called()
        self.assertEqual(output.getvalue(), "Copied option 1 (11 chars) to clipboard.\n")
        copy.assert_called_once_with(["pbcopy"], input="A1!-cat-dog", text=True, check=True)

    def test_cancel_does_not_copy(self):
        for exception in (EOFError, KeyboardInterrupt):
            with self.subTest(exception=exception), \
                    mock.patch("builtins.input", side_effect=exception), \
                    mock.patch.object(password.subprocess, "run") as copy, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(password.main([]), 130)
                copy.assert_not_called()

    def test_clipboard_failure_is_reported(self):
        error_output = io.StringIO()
        with mock.patch("builtins.input", return_value="1"), \
                mock.patch.object(password.subprocess, "run", side_effect=OSError("pbcopy failed")), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(error_output):
            self.assertEqual(password.main([]), 1)
        self.assertIn("pbcopy failed", error_output.getvalue())

    def test_pagination_keeps_every_option_accessible(self):
        candidates = ["A1!-cat"] * 25
        output = io.StringIO()
        with mock.patch.object(password, "generate_passwords", return_value=candidates), \
                mock.patch.object(password.shutil, "get_terminal_size", return_value=(80, 10)), \
                mock.patch("builtins.input", side_effect=["n", "p", "n", "25"]), \
                mock.patch.object(password.subprocess, "run"), \
                contextlib.redirect_stdout(output):
            self.assertEqual(password.main(["opts25"]), 0)
        self.assertIn("Page 1/5", output.getvalue())
        self.assertIn("Page 2/5", output.getvalue())
        self.assertIn("Copied option 25", output.getvalue())


class TerminalTests(unittest.TestCase):
    def test_redirected_output_never_generates_passwords(self):
        with contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()), \
                mock.patch.object(password, "generate_passwords") as generate:
            self.assertEqual(password.main([]), 1)
            generate.assert_not_called()

    def test_other_terminals_and_multiplexers_are_rejected(self):
        cases = [{"TERM": "dumb"}, {"TERM_PROGRAM": "ghostty", "TMUX": "test"},
                 {"TERM_PROGRAM": "ghostty", "STY": "test"}]
        for environment in cases:
            with self.subTest(environment=environment), \
                    mock.patch.dict(os.environ, environment, clear=True), \
                    mock.patch.object(sys.stdin, "isatty", return_value=True), \
                    mock.patch.object(sys.stdout, "isatty", return_value=True), \
                    self.assertRaises(ValueError):
                password.require_ghostty()

    def test_real_pty_cleanup_on_selection_eof_and_signals(self):
        scenarios = ["select", "eof", "copy_failure", signal.SIGINT, signal.SIGTERM,
                     signal.SIGHUP, signal.SIGQUIT, signal.SIGTSTP]
        for scenario in scenarios:
            with self.subTest(scenario=scenario):
                self.check_pty_cleanup(scenario)

    def check_pty_cleanup(self, scenario):
        # All terminal traffic stays in memory, uses disposable fixture words,
        # and intercepts clipboard writes. Never touches the real clipboard.
        master, slave = os.openpty()
        original_settings = termios.tcgetattr(slave)
        program = """
import sys
import password
password.load_words = lambda: ['cat', 'dog']
def copy(*args, **kwargs):
    assert args == (['pbcopy'],)
    assert kwargs['input'].startswith('A1!-')
    assert len(kwargs['input']) == 11
    if sys.argv[1] == 'copy_failure':
        raise OSError('test clipboard failure')
password.subprocess.run = copy
sys.exit(password.main(['len11']))
"""
        environment = dict(os.environ, TERM_PROGRAM="ghostty", TERM="xterm-ghostty")
        environment.pop("TMUX", None)
        environment.pop("STY", None)
        process = subprocess.Popen(
            [sys.executable, "-B", "-c", program, str(scenario)],
            cwd=Path(password.__file__).parent, env=environment,
            stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
        )
        output = bytearray()

        def read_until(predicate):
            deadline = time.monotonic() + 5
            while not predicate():
                if time.monotonic() > deadline:
                    self.fail("Timed out waiting for password terminal state")
                ready, _, _ = select.select([master], [], [], 0.05)
                if ready:
                    output.extend(os.read(master, 65536))

        try:
            read_until(lambda: b"Selection: " in output)
            self.assertTrue(termios.tcgetattr(slave)[3] & termios.ECHO)
            if isinstance(scenario, int):
                os.kill(process.pid, scenario)
            else:
                os.write(master, b"\x04" if scenario == "eof" else b"2\n")
            read_until(lambda: process.poll() is not None)
            while select.select([master], [], [], 0)[0]:
                output.extend(os.read(master, 65536))
            expected_code = 0 if scenario == "select" else 1 if scenario == "copy_failure" else 130
            self.assertEqual(process.returncode, expected_code)
            self.assertEqual(termios.tcgetattr(slave), original_settings)
            rendered = output.decode()
            self.assertIn(password.LEAVE_SCREEN, rendered)
            before, temporary = rendered.split(password.ENTER_SCREEN, 1)
            _, after = temporary.split(password.LEAVE_SCREEN, 1)
            self.assertNotIn("A1!-", before + after)
            self.assertIn("A1!-", temporary)
            if scenario == "select":
                self.assertIn("Selection: 2\r\n", temporary)
                self.assertIn("Copied option 2 (11 chars)", after)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            os.close(master)
            os.close(slave)


if __name__ == "__main__":
    unittest.main()
