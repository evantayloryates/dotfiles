"""Generate word-based passwords and copy a selected option to the clipboard."""

from contextlib import contextmanager
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import sys
import termios


DEFAULT_LENGTH_MIN = 10
DEFAULT_LENGTH_MAX = 16
DEFAULT_OPTIONS = 3
PREFIX = "A1!-"
ENTER_SCREEN = "\033[?1049h\033[2J\033[H"
ERASE_SCREEN = "\033[0m\033[2J\033[H"
LEAVE_SCREEN = ERASE_SCREEN + "\033[?1049l"

ALIASES = {
    "length": "length", "len": "length", "l": "length",
    "min": "min", "max": "max",
    "options": "options", "opts": "options", "count": "options", "cnt": "options",
}
ARGUMENT = re.compile(
    r"(?:--?)?(length|len|l|min|max|options|opts|count|cnt)"
    r"(?:\s*[:=]\s*|\s*)([0-9]+)(?=\s|$)", re.IGNORECASE,
)
HELP = """Usage: password [length N | min N max N] [options N]

Generate distinct hyphen-separated word passwords starting with A1!-.
Lengths count every character, including the prefix and hyphens.
There is no word-count limit; any number of whole words may fit the length.
Defaults: min 10, max 16, options 3. All values must be positive integers.

Aliases: length/len/l, min, max, options/opts/count/cnt.
Use no dash, one dash, or two dashes; attach the value directly or separate
it with a space, colon, or equals sign. Examples:
  password len12 opts3
  password --min:10 -max=16 count 5

Options appear temporarily in Ghostty, then are erased on exit.
Select a number to copy that password. Use Ctrl-C or Ctrl-D to cancel.
Ctrl-Z cancels instead of leaving passwords in a suspended process.
A single option is copied automatically without displaying the password.
Run directly in Ghostty, without piping, redirection, tmux, or screen.
Use the 'words' command to edit the word list.
"""


def parse_args(argv):
    arguments = " ".join(argv).strip()
    values = {}
    while arguments:
        match = ARGUMENT.match(arguments)
        if not match:
            raise ValueError(f"Invalid argument near {arguments!r}. Use password --help.")
        name = ALIASES[match[1].lower()]
        value = int(match[2])
        if value < 1:
            raise ValueError(f"{name} must be a positive integer.")
        if name in values:
            raise ValueError(f"{name} was supplied more than once.")
        values[name] = value
        arguments = arguments[match.end():].lstrip()

    if "length" in values:
        if "min" in values or "max" in values:
            raise ValueError("Use length by itself, or use min/max for a range.")
        minimum = maximum = values["length"]
    else:
        minimum = values.get("min", DEFAULT_LENGTH_MIN)
        maximum = values.get("max", DEFAULT_LENGTH_MAX)
    if minimum > maximum:
        raise ValueError("min must be less than or equal to max.")
    return minimum, maximum, values.get("options", DEFAULT_OPTIONS)


def load_words():
    dotfiles_dir = Path(os.environ.get("DOTFILES_DIR") or Path(__file__).resolve().parents[2])
    words_path = dotfiles_dir / "src" / "__assets" / "words.txt"
    # Deduplicate entries so each generated option has a unique representation.
    words = list(dict.fromkeys(words_path.read_text().split()))
    if not words:
        raise ValueError("The word list is empty.")
    if any(not word.isalpha() for word in words):
        raise ValueError("The word list must contain only alphabetic words.")
    return words


def generate_passwords(words, minimum, maximum, options):
    words = list(dict.fromkeys(words))
    body_max = maximum - len(PREFIX)
    body_min = max(1, minimum - len(PREFIX))
    if not words or body_max < min(map(len, words)):
        raise ValueError("The requested length is too short for the prefix and word list.")

    # Count all word sequences of each length. This avoids truncating words or
    # retrying forever when a requested length cannot be made from the list.
    lengths = {}
    for word in words:
        lengths[len(word)] = lengths.get(len(word), 0) + 1
    ways = [0] * (body_max + 1)
    for size in range(1, body_max + 1):
        for word_length, count in lengths.items():
            if word_length == size:
                ways[size] += count
            elif word_length < size:
                ways[size] += count * ways[size - word_length - 1]

    total = sum(ways[body_min:])
    if not total:
        raise ValueError("No whole-word passwords fit the requested length range.")
    if options > total:
        raise ValueError(f"Only {total} distinct passwords fit; request fewer options.")

    passwords = []
    swaps = {}
    for _ in range(options):
        # Sample unique sequence indexes without allocating the entire space.
        index = secrets.randbelow(total)
        rank = swaps.get(index, index)
        total -= 1
        swaps[index] = swaps.get(total, total)
        size = body_min
        while rank >= ways[size]:
            rank -= ways[size]
            size += 1
        selected = []
        while size:
            for word in words:
                remainder = size - len(word)
                count = 1 if remainder == 0 else ways[remainder - 1] if remainder > 0 else 0
                if rank >= count:
                    rank -= count
                    continue
                selected.append(word)
                size = max(0, remainder - 1)
                break
        passwords.append(PREFIX + "-".join(selected))
    return passwords


def require_ghostty():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError("Run password interactively in Ghostty, without pipes or redirection.")
    if os.environ.get("TMUX") or os.environ.get("STY"):
        raise ValueError("Run password directly in Ghostty, outside tmux or screen.")
    if os.environ.get("TERM_PROGRAM") != "ghostty" and os.environ.get("TERM") != "xterm-ghostty":
        raise ValueError("This temporary password display requires Ghostty.")


@contextmanager
def temporary_screen():
    """Erase the alternate screen before restoring the shell, including on signals."""
    fd = sys.stdin.fileno()
    settings = termios.tcgetattr(fd)
    handlers = {}

    def cancel(signum, frame):
        raise KeyboardInterrupt

    try:
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP,
                       signal.SIGQUIT, signal.SIGTSTP):
            handlers[signum] = signal.signal(signum, cancel)
        # Selection numbers are not sensitive; show normal input feedback.
        interactive = settings[:]
        interactive[3] |= termios.ECHO
        termios.tcsetattr(fd, termios.TCSAFLUSH, interactive)
        print(ENTER_SCREEN, end="", flush=True)
        yield
    finally:
        # A second Ctrl-C must not interrupt terminal restoration.
        for signum in handlers:
            signal.signal(signum, signal.SIG_IGN)
        try:
            print(LEAVE_SCREEN, end="", flush=True)
        finally:
            try:
                termios.tcsetattr(fd, termios.TCSAFLUSH, settings)
            finally:
                for signum, handler in handlers.items():
                    signal.signal(signum, handler)


def select_password(passwords):
    rows = [f"{number}) {value}" for number, value in enumerate(passwords, 1)]
    width = max(map(len, rows))
    page = 0
    message = ""
    while True:
        columns, height = shutil.get_terminal_size()
        # Reserve room for navigation, validation and input. Account for wrapping
        # so large option counts remain accessible without alternate scrollback.
        row_height = max(1, (width + len(f" —> {max(map(len, passwords))} chars") + columns - 1) // columns)
        per_page = max(1, (height - 4) // row_height)
        pages = (len(rows) + per_page - 1) // per_page
        page = min(page, pages - 1)
        start = page * per_page
        print(ERASE_SCREEN, end="")
        for row, value in zip(rows[start:start + per_page], passwords[start:start + per_page]):
            print(f"{row:<{width}} \033[90m—> {len(value)} chars\033[0m")
        if pages > 1:
            print(f"Page {page + 1}/{pages}. n: next, p: previous; select any option number.")
        if message:
            print(message)
        selection = input("Selection: ").strip()
        if selection.lower() in ("n", "p") and pages > 1:
            page = (page + (1 if selection.lower() == "n" else -1)) % pages
            message = ""
            continue
        if re.fullmatch(r"[0-9]+", selection):
            normalized = selection.lstrip("0") or "0"
            if len(normalized) <= len(str(len(passwords))):
                number = int(normalized)
                if 1 <= number <= len(passwords):
                    return number
        message = f"Enter a number from 1 to {len(passwords)}."


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv in (["-h"], ["--help"], ["help"]):
        print(HELP, end="")
        return 0
    try:
        arguments = parse_args(argv)
        require_ghostty()
        passwords = generate_passwords(load_words(), *arguments)
        if len(passwords) == 1:
            number = 1
        else:
            with temporary_screen():
                number = select_password(passwords)
        subprocess.run(["pbcopy"], input=passwords[number - 1], text=True, check=True)
        print(f"Copied option {number} ({len(passwords[number - 1])} chars) to clipboard.")
        return 0
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.")
        return 130
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"password: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
