#!/usr/bin/env python3
"""Compact, paged `git log` for an interactive terminal.

Reached through git_log_pretty (log_pretty.sh), which the `git` wrapper in
src/functions/aliases.sh calls for `git log …` when stdout is a terminal.
Output-shaping flags (-p, --stat, --graph, --oneline, --format, …) hand the
whole command back to native git, and so does any stdout that isn't a
terminal. `command git log …` always skips this.

    2ca00e3  8m ago  evantayloryates   subject that fits the column                (HEAD -> master, origin/master)
                                       body, reflowed, at most BODY_LINES lines, then…
    6518397  1h ago  evantayloryates   subject too long for the column, cut at a wo…
                                       ↳ rd boundary when one is near the edge. Then the
                                       body follows on the same line, up to BODY_LINES…

Widths come from the terminal: the subject column takes what is left after the
fixed lead (hash, age, author) and room for the first row's refs, within
SUBJECT_MIN..SUBJECT_MAX. That room is capped at half the free width, so one
huge branch name wraps its own row instead of squeezing every subject. The
refs list always starts two columns past the subject column, so a cut subject
fills the column to within EDGE_SLACK of the edge: at a word boundary when one
lands there, mid-word otherwise. Every … and
↳ drawn in ANNOTATIONS_COLOR was added here; any that come from the commit
message itself keep the message's color. Continuation and body text are dim.

Git config: none is required. Rows come from an explicit --format, so
format.pretty, log.date and log.abbrevCommit don't change them. Honoured:
  core.pager / GIT_PAGER / PAGER   the pager, via `git var GIT_PAGER`, run through
                                   the shell as git runs it; LESS defaults to FRX
                                   as it does under git itself
  color.diff / color.ui            whether rows are colored (git log's own switch)
  color.decorate.*                 the ref colors in the trailing (…) list
Environment:
  TERM_UNICODE (src/exports/terminal.sh)   0 swaps … and ↳ for ... and ->
  COLUMNS                                  overrides the terminal's reported width

GitHub usernames: a users.noreply.github.com email carries the login. Any other
email is looked up with `gh api` in the background after the page is shown and
cached in ~/.cache/dotfiles/github-logins.tsv (email, login, time; add a line by
hand to pin one). Until a login is known the email's local part stands in,
dimmed. Emails GitHub has no account for, or repos gh can't read, are retried
after a day.
"""
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import unicodedata

ANNOTATIONS_COLOR = "33"  # yellow: every … and ↳ this script adds
HASH_COLOR = "90"         # gray, so the hash recedes
AGE_COLOR = "32"
AUTHOR_COLOR = "34"
BODY_COLOR = "2"          # dim: subject continuation and body preview
SUBJECT_MIN, SUBJECT_MAX = 40, 100
REFS_RESERVE = 30         # columns kept for the (refs) list when the first row's is narrower
EDGE_SLACK = 2            # a cut subject may end this far short of the column edge to stop on a word
BODY_LINES = 2            # lines under the subject: its continuation, then the body
AGE_WIDTH = 7             # "12m ago", "51w ago"
AUTHOR_WIDTH = 16

UNICODE = os.environ.get("TERM_UNICODE", "1") != "0"
ELLIPSIS = "…" if UNICODE else "..."
ARROW = "↳" if UNICODE else "->"

CACHE = os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"),
                     "dotfiles", "github-logins.tsv")
RETRY_UNKNOWN_AFTER = 86400
MAX_LOOKUPS = 20
NOREPLY = re.compile(r"^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$", re.I)

# Flags that change what git log prints; these go to native git untouched.
NATIVE = re.compile(r"^(-[pugm]|--patch.*|--stat.*|--numstat|--shortstat|--dirstat.*|--compact-summary|"
                    r"--name-only|--name-status|--raw|--summary|--graph|--oneline|--pretty.*|--format.*|"
                    r"-L.*|--walk-reflogs|--cc|--diff-merges.*|--show-signature|--check|--word-diff.*|"
                    r"--color-words.*|--full-diff|--source|--notes.*|--show-notes.*|--left-right|"
                    r"--children|--parents|--binary|--no-color|--color.*)$")
SGR = re.compile(r"\x1b\[[0-9;]*m")
TRAILER = re.compile(r"^[A-Za-z0-9-]+: \S")
FORMAT = "%h%x1f%at%x1f%ae%x1f%H%x1f%C(auto)%d%C(reset)%x1f%s%x1f%b%x1e"


def width(s):
    return sum(0 if unicodedata.category(ch) in ("Mn", "Me", "Cf") else
               2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in s)


def cut(s, w):
    """Longest prefix of s that fits in w columns."""
    out, used = [], 0
    for ch in s:
        cw = width(ch)
        if used + cw > w:
            break
        out.append(ch)
        used += cw
    return "".join(out)


def wrap(text, w, first_w=None):
    """Greedy word wrap to w columns; the first line may have its own width."""
    lines, line = [], ""
    limit = w if first_w is None else first_w
    for word in text.split():
        if line and width(line) + 1 + width(word) <= limit:
            line += " " + word
            continue
        if line:
            lines.append(line)
            line, limit = "", w
        while width(word) > limit:  # a single word wider than the column
            piece = cut(word, limit)
            lines.append(piece)
            word, limit = word[len(piece):], w
        line = word
    if line:
        lines.append(line)
    return lines


def age(ts, now):
    d = max(0, now - ts)
    for unit, secs, limit in (("s", 1, 60), ("m", 60, 3600), ("h", 3600, 86400),
                              ("d", 86400, 14 * 86400), ("w", 7 * 86400, 365 * 86400)):
        if d < limit:
            return f"{d // secs}{unit} ago"
    return f"{d // (365 * 86400)}y ago"


class Logins:
    def __init__(self):
        self.cache, self.pending = {}, {}
        try:
            with open(CACHE, encoding="utf-8") as fh:
                for line in fh:
                    email, login, ts = (line.rstrip("\n").split("\t") + ["", "0"])[:3]
                    self.cache[email] = (login, int(ts or 0))  # later lines win
        except (OSError, ValueError):
            pass

    def get(self, email, sha):
        """(login, known). Unknown emails are queued for a background lookup."""
        m = NOREPLY.match(email)
        if m:
            return m.group(1), True
        login, ts = self.cache.get(email.lower(), ("", None))
        if login:
            return login, True
        if ts is None or time.time() - ts > RETRY_UNKNOWN_AFTER:
            self.pending[email.lower()] = sha  # the oldest one on the page: likeliest to be pushed
        return email.split("@")[0], False

    def resolve_later(self):
        if not self.pending or not shutil.which("gh"):
            return
        url = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout
        m = re.search(r"github\.com[:/]+([^/\s]+/[^/\s]+?)(?:\.git)?/?\s*$", url)
        if not m:
            return
        args = [x for pair in list(self.pending.items())[:MAX_LOOKUPS] for x in pair]
        subprocess.Popen([sys.executable, os.path.abspath(__file__), "--resolve-logins", m.group(1), *args],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)


def resolve_logins(repo, pairs):
    """Background: ask GitHub which account each commit's author email maps to."""
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    emails, shas = pairs[::2], pairs[1::2]
    for i, (email, sha) in enumerate(zip(emails, shas)):
        try:
            r = subprocess.run(["gh", "api", f"repos/{repo}/commits/{sha}", "--jq", '.author.login // ""'],
                               capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            return
        if r.returncode == 0:
            found = {email: r.stdout.strip()}
        elif re.search(r"HTTP 40[34]", r.stderr):
            # gh can't see this repo, so no lookup here will work: rest them all
            # for RETRY_UNKNOWN_AFTER instead of retrying on every git log.
            found = {e: "" for e in emails[i:]}
        elif "HTTP 422" in r.stderr:
            continue  # this commit was never pushed; a later git log samples another
        else:
            return  # offline or similar; the next git log retries
        with open(CACHE, "a", encoding="utf-8") as fh:
            fh.writelines(f"{e}\t{login}\t{int(time.time())}\n" for e, login in found.items())
        if r.returncode != 0:
            return


def records(stream):
    buf = b""
    for chunk in iter(lambda: stream.read1(65536), b""):
        buf += chunk
        *done, buf = buf.split(b"\x1e")
        for rec in done:
            yield rec.decode("utf-8", "replace").lstrip("\n")


class Formatter:
    def __init__(self, color, cols):
        self.color, self.cols, self.now = color, cols, int(time.time())
        self.hash_w = self.indent_w = self.subject_w = None
        self.logins = Logins()

    def c(self, code, s):
        return f"\x1b[{code}m{s}\x1b[0m" if self.color and s else s

    def more(self):
        return self.c(ANNOTATIONS_COLOR, ELLIPSIS)

    def calibrate(self, short, deco_w):
        """Column widths, from the first row: its hash length and refs width."""
        self.hash_w = len(short)
        self.indent_w = self.hash_w + 2 + AGE_WIDTH + 1 + AUTHOR_WIDTH + 2
        free = self.cols - self.indent_w - 2  # the two columns between subject and refs
        reserve = min(max(REFS_RESERVE, deco_w), free // 2)  # a huge branch name can't take the whole row
        self.subject_w = max(SUBJECT_MIN, min(SUBJECT_MAX, free - reserve))

    def split_subject(self, subject):
        """(head, head_w, rest): the part of the subject that fits the column, its
        width including the … when cut, and what continues on the ↳ line."""
        w = self.subject_w
        if width(subject) <= w:
            return subject, width(subject), ""
        room = w - width(ELLIPSIS)
        head = cut(subject, room)
        space = head.rfind(" ")
        if space > 0 and width(head[:space]) >= room - EDGE_SLACK:
            head = head[:space]
        rest = subject[len(head):].strip()
        head = head.rstrip()
        return head + self.more(), width(head) + width(ELLIPSIS), rest

    def row(self, rec):
        short, ts, email, sha, deco, subject, body = (rec.split("\x1f") + [""] * 7)[:7]
        deco = re.sub(r"^((?:\x1b\[[0-9;]*m)*) ", r"\1", deco)  # %d's own leading space, inside its colors
        deco_w = width(SGR.sub("", deco))
        if self.subject_w is None:
            self.calibrate(short, deco_w)
        w = self.subject_w

        login, known = self.logins.get(email, sha)
        shown = login if width(login) <= AUTHOR_WIDTH else cut(login, AUTHOR_WIDTH - width(ELLIPSIS))
        who = self.c(AUTHOR_COLOR if known else f"2;{AUTHOR_COLOR}", shown) + (self.more() if shown != login else "")
        who_w = width(shown) + (width(ELLIPSIS) if shown != login else 0)
        lead = (self.c(HASH_COLOR, short.ljust(self.hash_w)) + "  " +
                self.c(AGE_COLOR, age(int(ts or 0), self.now).ljust(AGE_WIDTH)) + " " +
                who + " " * (AUTHOR_WIDTH - who_w + 2))
        indent = " " * self.indent_w

        head, head_w, rest = self.split_subject(subject)
        first = lead + head
        if deco_w:
            first += " " * (w - head_w + 2) + deco  # refs always start two columns past the subject column
        out = [first]

        # Under the subject: its continuation, then the body reflowed after it. A
        # closing block of trailers (Co-authored-by:, …) isn't prose and is dropped.
        paras = re.split(r"\n\s*\n", body.strip())
        if paras[-1] and all(TRAILER.match(l) for l in paras[-1].splitlines()):
            paras.pop()
        flat = " ".join(" ".join(paras).split())
        arrow_w = width(ARROW) + 1
        if rest:
            text = rest if not flat else rest + ("" if rest[-1] in ".!?…" else ".") + " " + flat
            lines = wrap(text, w, w - arrow_w)
        else:
            lines = wrap(flat, w)
        shown_lines = lines[:BODY_LINES]
        if len(lines) > BODY_LINES:  # mark the cut, keeping the last line inside the column
            last_w = (w - arrow_w) if (rest and len(shown_lines) == 1) else w
            shown_lines[-1] = cut(shown_lines[-1], last_w - width(ELLIPSIS)).rstrip()
        for i, line in enumerate(shown_lines):
            prefix = self.c(ANNOTATIONS_COLOR, ARROW) + " " if rest and i == 0 else ""
            tail = self.more() if len(lines) > BODY_LINES and i == len(shown_lines) - 1 else ""
            out.append(indent + prefix + self.c(BODY_COLOR, line) + tail)
        return "\n".join(out) + "\n"


def pager_for(tty):
    """Where to write: git's pager when stdout is a terminal, else stdout."""
    if not tty:
        return sys.stdout, None
    cmd = subprocess.run(["git", "var", "GIT_PAGER"], capture_output=True, text=True).stdout.strip() or "less"
    if cmd == "cat":
        return sys.stdout, None
    env = dict(os.environ)
    env.setdefault("LESS", "FRX")
    env.setdefault("LV", "-c")
    env.setdefault("LESSCHARSET", "utf-8")  # without a UTF-8 locale less shows <E2><80><A6>
    proc = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE, env=env,
                            text=True, encoding="utf-8", errors="replace")
    signal.signal(signal.SIGINT, signal.SIG_IGN)  # ^C belongs to the pager, as under git
    return proc.stdin, proc


def main(args):
    if args[:1] == ["--resolve-logins"]:
        return resolve_logins(args[1], args[2:])
    opts = args[:args.index("--")] if "--" in args else args
    tty = sys.stdout.isatty()
    if not tty or any(NATIVE.match(a) for a in opts):
        os.execvp("git", ["git", "log", *args])

    # git log colors by color.diff, falling back to color.ui; "true" = stdout is a terminal.
    color = subprocess.run(["git", "config", "--get-colorbool", "color.diff", "true"],
                           capture_output=True, text=True).stdout.strip() == "true"
    cols = shutil.get_terminal_size((120, 40)).columns  # $COLUMNS, else the tty's own size
    git = subprocess.Popen(["git", "log", f"--format={FORMAT}", f"--color={'always' if color else 'never'}", *args],
                           stdout=subprocess.PIPE)
    fmt = Formatter(color, cols)
    out, pager = pager_for(tty)
    try:
        for rec in records(git.stdout):
            out.write(fmt.row(rec))
        out.flush()
    except BrokenPipeError:  # the pager quit early
        pass
    finally:
        if git.poll() is None:
            git.kill()
        code = git.wait()
        if pager:
            try:
                out.close()
            except BrokenPipeError:
                pass
            pager.wait()
        fmt.logins.resolve_later()
    return 0 if code in (0, -signal.SIGKILL) else code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
