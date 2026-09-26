#!/usr/bin/env python3
"""Compact, paged `git log` for an interactive terminal.

Reached through git_log_pretty (log_pretty.sh), which the `git` wrapper in
src/functions/aliases.sh calls for `git log …` when stdout is a terminal.
Output-shaping flags (-p, --stat, --graph, --oneline, --format, …) hand the
whole command back to native git, and so does any stdout that isn't a
terminal. `command git log …` always skips this.

    2ca00e3  8m ago  evantayloryates   subject up to 50 columns, cut at a word…   (HEAD -> master, origin/master)
                                       ↳ the rest of that subject
                                       body, reflowed, at most two lines, and if more is left we…

Every … and ↳ drawn in ANNOTATIONS_COLOR was added here; any that come from
the commit message itself keep the message's color.

Git config: none is required. Rows come from an explicit --format, so
format.pretty, log.date and log.abbrevCommit don't change them. Honoured:
  core.pager / GIT_PAGER / PAGER   the pager, via `git var GIT_PAGER`, run through
                                   the shell as git runs it; LESS defaults to FRX
                                   as it does under git itself
  color.diff / color.ui            whether rows are colored (git log's own switch)
  color.decorate.*                 the ref colors in the trailing (…) list
Environment:
  TERM_UNICODE (src/exports/terminal.sh)   0 swaps … and ↳ for ... and ->

GitHub usernames: a users.noreply.github.com email carries the login. Any other
email is looked up once with `gh api` in the background after the page is shown
and cached in ~/.cache/dotfiles/github-logins.tsv; until then the email's local
part stands in, dimmed.
"""
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import unicodedata

ANNOTATIONS_COLOR = "33"  # yellow
HASH_COLOR = "90"         # gray, so the hash recedes
AGE_COLOR = "32"
AUTHOR_COLOR = "34"
BODY_COLOR = "2"          # dim
SUBJECT_WIDTH = 50
BODY_LINES = 2
AGE_WIDTH = 7             # "12m ago", "51w ago"
AUTHOR_WIDTH = 16

UNICODE = os.environ.get("TERM_UNICODE", "1") != "0"
ELLIPSIS = "…" if UNICODE else "..."
ARROW = "↳" if UNICODE else "->"

CACHE = os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"),
                     "dotfiles", "github-logins.tsv")
RETRY_UNKNOWN_AFTER = 7 * 86400
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


def wrap(text, w):
    lines, line = [], ""
    for word in text.split():
        while width(word) > w:  # a single word wider than the column
            if line:
                lines.append(line)
                line = ""
            lines.append(cut(word, w))
            word = word[len(lines[-1]):]
        if not line:
            line = word
        elif width(line) + 1 + width(word) <= w:
            line += " " + word
        else:
            lines.append(line)
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
            self.pending.setdefault(email.lower(), sha)
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
    for email, sha in zip(pairs[::2], pairs[1::2]):
        try:
            r = subprocess.run(["gh", "api", f"repos/{repo}/commits/{sha}", "--jq", '.author.login // ""'],
                               capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if r.returncode == 0:  # network/auth failures aren't cached; next run retries
            with open(CACHE, "a", encoding="utf-8") as fh:
                fh.write(f"{email}\t{r.stdout.strip()}\t{int(time.time())}\n")


def records(stream):
    buf = b""
    for chunk in iter(lambda: stream.read1(65536), b""):
        buf += chunk
        *done, buf = buf.split(b"\x1e")
        for rec in done:
            yield rec.decode("utf-8", "replace").lstrip("\n")


class Formatter:
    def __init__(self, color):
        self.color, self.now, self.hash_w = color, int(time.time()), None
        self.logins = Logins()

    def c(self, code, s):
        return f"\x1b[{code}m{s}\x1b[0m" if self.color and s else s

    def more(self):
        return self.c(ANNOTATIONS_COLOR, ELLIPSIS)

    def fit(self, s, w):
        """s cut to w columns, with an annotation … when anything was dropped."""
        return s if width(s) <= w else cut(s, w) + self.more()

    def row(self, rec):
        short, ts, email, sha, deco, subject, body = (rec.split("\x1f") + [""] * 7)[:7]
        self.hash_w = self.hash_w or len(short)
        login, known = self.logins.get(email, sha)
        shown = login if width(login) <= AUTHOR_WIDTH else cut(login, AUTHOR_WIDTH - width(ELLIPSIS))
        who = self.c(AUTHOR_COLOR if known else f"2;{AUTHOR_COLOR}", shown) + (self.more() if shown != login else "")
        who_w = width(shown) + (width(ELLIPSIS) if shown != login else 0)
        lead = (self.c(HASH_COLOR, short.ljust(self.hash_w)) + "  " +
                self.c(AGE_COLOR, age(int(ts or 0), self.now).ljust(AGE_WIDTH)) + " " +
                who + " " * (AUTHOR_WIDTH - who_w + 2))
        indent = " " * (self.hash_w + 2 + AGE_WIDTH + 1 + AUTHOR_WIDTH + 2)

        # Subject: whole when it fits in SUBJECT_WIDTH; otherwise cut at a word
        # boundary, marked with …, and the rest continues on a ↳ line.
        rest = ""
        if width(subject) <= SUBJECT_WIDTH:
            head, head_w = subject, width(subject)
        else:
            head = cut(subject, SUBJECT_WIDTH)
            space = head.rfind(" ")
            head = head[:space] if space >= SUBJECT_WIDTH // 2 else head
            rest = subject[len(head):].lstrip()
            head_w = width(head) + width(ELLIPSIS)
            head = head.rstrip() + self.more()
        first = lead + head
        if SGR.sub("", deco).strip():  # deco carries color codes even when there are no refs
            first += " " * (SUBJECT_WIDTH + width(ELLIPSIS) - head_w + 1) + deco.lstrip()
        out = [first]
        if rest:
            out.append(indent + self.c(ANNOTATIONS_COLOR, ARROW) + " " +
                       self.fit(rest, SUBJECT_WIDTH - width(ARROW) - 1))

        # Body preview, reflowed. A closing block of trailers (Co-authored-by:, …) isn't prose.
        paras = re.split(r"\n\s*\n", body.strip())
        if paras[-1] and all(TRAILER.match(l) for l in paras[-1].splitlines()):
            paras.pop()
        lines = wrap(" ".join(paras), SUBJECT_WIDTH)
        for i, line in enumerate(lines[:BODY_LINES]):
            tail = self.more() if i == BODY_LINES - 1 and len(lines) > BODY_LINES else ""
            out.append(indent + self.c(BODY_COLOR, line) + tail)
        return "\n".join(out) + "\n"


def pager_for(color_output):
    """Where to write: git's pager when stdout is a terminal, else stdout."""
    if not color_output:
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
    git = subprocess.Popen(["git", "log", f"--format={FORMAT}", f"--color={'always' if color else 'never'}", *args],
                           stdout=subprocess.PIPE)
    fmt = Formatter(color)
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
