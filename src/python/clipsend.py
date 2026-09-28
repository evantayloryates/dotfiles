"""Conservative content inference for clipsend.

Detection never modifies the payload. Explicit suffixes win; unknown or
ambiguous content is text. Keep ordering from specific formats to heuristics.
"""

import ast
import csv
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import xml.etree.ElementTree as ET

try:
    import tomllib
except ImportError:  # macOS installations with Python < 3.11
    tomllib = None

MAX_TEXT_BYTES = 16 * 1024 * 1024


def infer_extended(text):
    """Use local syntax parsers without executing code or exposing diagnostics."""
    helper = Path(__file__).resolve().parents[1] / "javascript" / "clipsend-infer.js"
    try:
        result = subprocess.run(
            ["node", str(helper)], input=text, text=True, encoding="utf-8",
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3, check=True,
        )
        value = json.loads(result.stdout)
        if isinstance(value, dict) and value.get("extension") in (
            None, "yaml", "ts", "jsx", "tsx", "sql", "css", "graphql", "diff", "txt"
        ):
            return value
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return {}


def strict_json(text):
    def reject_constant(value):
        raise ValueError(value)

    return json.loads(text, parse_constant=reject_constant)


def infer_script(text):
    """Recognize language-specific syntax without executing clipboard content.

    Python must parse and contain a recognizable construct. The other languages
    use signatures, not runtime interpreters or broad syntax/prose guesses.
    Conflicting signals deliberately produce no answer.
    """
    candidates = set()
    try:
        tree = ast.parse(text)
        constructs = (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef,
                      ast.ClassDef, ast.ListComp, ast.SetComp, ast.DictComp,
                      ast.GeneratorExp, ast.Lambda, ast.JoinedStr, ast.With, ast.Try,
                      ast.If, ast.For, ast.AsyncFor, ast.While, ast.Assert, ast.Raise)
        if any(isinstance(node, constructs) or (
            isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in {"print", "input", "range", "enumerate", "isinstance"}
        ) for node in ast.walk(tree)):
            candidates.add("py")
    except (SyntaxError, ValueError, RecursionError):
        pass

    # Ignore signatures inside comments and quoted strings. Retain the quote
    # delimiters and newlines so patterns can still recognize `puts "..."`, etc.
    tokens = re.compile(
        r"(?P<quote>\"\"\"|'''|[\"'`])(?:\\[\s\S]|(?!(?P=quote))[^\\])*?(?:(?P=quote)|\Z)"
        r"|/\*[\s\S]*?(?:\*/|\Z)|//[^\n]*|\#[^\n]*", re.X
    )

    def hide(match):
        quote = match.group("quote") or ""
        return quote + "\n" * match[0].count("\n") + quote

    code = tokens.sub(hide, text)
    ident = r"[A-Za-z_$][\w$]*"
    js_patterns = (
        rf"^\s*(?:export\s+)?(?:const|let|var)\s+(?:{ident}|\{{[^}}\n]+\}}|\[[^\]\n]+\])\s*=\s*\S",
        rf"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(?:{ident})?\s*\([^)]*\)\s*\{{",
        rf"(?:\([^;\n]*\)|(?<![:\w]){ident})\s*=>\s*\S",
        r"^\s*console\.(?:log|error|warn|info|debug)\s*\(",
        r"^\s*document\.(?:querySelector(?:All)?|getElementById|createElement)\s*\(",
        rf"^\s*(?:module\.exports|exports\.{ident})\s*=\s*\S",
        r"^\s*import\s+(?:[\w$*{},\s]+\s+from\s+)?['\"]",
        r"^\s*export\s+default\s+\S",
    )
    if any(re.search(pattern, code, re.M) for pattern in js_patterns):
        candidates.add("js")

    ruby_patterns = (
        r"^\s*(?:puts|p)\s*(?:\(\s*)?['\"]",
        # Bare require(...) is also valid CommonJS; do not pick Ruby for it.
        r"^\s*(?:require|require_relative)\s+['\"]",
        r"^\s*attr_(?:accessor|reader|writer)\s+:[A-Za-z_]\w*",
    )
    ruby_block = re.search(r"^\s*(?:def\s+[\w.!?=]+|(?:class|module)\s+[A-Z]\w*)", code, re.M)
    ruby_iterator = re.search(r"\bdo\s*\|[^|\n]+\|", code)
    if (any(re.search(pattern, code, re.M) for pattern in ruby_patterns)
            or ((ruby_block or ruby_iterator) and re.search(r"\bend\s*(?:$|[;\n])", code))):
        candidates.add("rb")

    shell_patterns = (
        r"^\s*(?:export|readonly)\s+[A-Za-z_]\w*=",
        r"^\s*set\s+-[A-Za-z]",
        r"^\s*(?:echo|printf|cd|ls|cat|grep|sed|awk|find|curl|wget|git|mkdir|rm|cp|mv|source|read)\s+(?:-[A-Za-z]|\$|['\"])",
        r"^\s*(?:curl|wget)\s+https?:",
        r"^\s*[A-Za-z_]\w*\s*\(\s*\)\s*\{",
    )
    shell_if = re.search(r"^\s*if\s+[^\n]+(?:;\s*|\n\s*)then\b", code, re.M)
    shell_loop = re.search(r"^\s*(?:for|while|until)\s+[^\n]+(?:;\s*|\n\s*)do\b", code, re.M)
    if (any(re.search(pattern, code, re.M) for pattern in shell_patterns)
            or (shell_if and re.search(r"\bfi\b", code))
            or (shell_loop and re.search(r"\bdone\b", code))):
        candidates.add("sh")
    return next(iter(candidates)) if len(candidates) == 1 else None


def infer_extension(data, *, complete=True):
    """Return a bare extension; require full input for structured text checks."""
    # Unambiguous signatures also serve extensionless Finder files. Do not use
    # a broad MIME guesser: its source-code/prose guesses are often misleading.
    for signature, extension in (
        (b"\x89PNG\r\n\x1a\n", "png"), (b"\xff\xd8\xff", "jpg"),
        (b"GIF87a", "gif"), (b"GIF89a", "gif"),
        (b"II*\x00", "tiff"), (b"MM\x00*", "tiff"),
        (b"%PDF-", "pdf"), (b"PK\x03\x04", "zip"),
        (b"PK\x05\x06", "zip"), (b"\x1f\x8b", "gz"),
    ):
        if data.startswith(signature):
            return extension
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "wav"
    if not complete:
        return "txt"

    try:
        # Inspect through BOMs without changing the saved bytes.
        encoding = "utf-8-sig"
        if data.startswith((b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):
            encoding = "utf-32"
        elif data.startswith((b"\xff\xfe", b"\xfe\xff")):
            encoding = "utf-16"
        original_text = data.decode(encoding)
        text = original_text.strip()
    except UnicodeError:
        return "txt"
    if not text or "\x00" in text:
        return "txt"

    try:
        strict_json(text)
        return "json"
    except (ValueError, RecursionError):
        pass

    lines = text.splitlines()
    if len(lines) > 1 and all(line.strip() for line in lines):
        try:
            # Restrict JSONL to records; lines of numbers are ambiguous.
            if all(isinstance(strict_json(line), (dict, list)) for line in lines):
                return "jsonl"
        except (ValueError, RecursionError):
            pass

    extended = None
    # JSX components/expressions can also be well-formed XML. Plain HTML and
    # SVG still win unless the parser finds a JSX-specific construct.
    if text.startswith("<"):
        extended = infer_extended(original_text)
        if extended.get("extension") in ("jsx", "tsx", "ts"):
            return extended["extension"]

    # ElementTree does not fetch external entities. Reject entity declarations
    # altogether, including internal expansion, before parsing untrusted text.
    if text.startswith("<") and not re.search(r"<!ENTITY\b", text, re.I):
        try:
            root = ET.fromstring(text)
            tag = root.tag.rsplit("}", 1)[-1]
            if tag == "svg" and root.tag in ("svg", "{http://www.w3.org/2000/svg}svg"):
                return "svg"
            html_fragments = {"div", "p", "span", "table", "ul", "ol", "main", "section", "article", "form"}
            if tag.lower() == "html" or root.tag.startswith("{http://www.w3.org/1999/xhtml}"):
                return "html"
            if root.tag in html_fragments:
                return "html"
            return "xml"
        except (ET.ParseError, ValueError, RecursionError):
            pass
    # HTML is not necessarily well-formed XML. Require a document marker,
    # rather than guessing from an arbitrary '<tag>' in prose.
    if re.match(r"(?is)(?:<!--.*?-->\s*)*(?:<!doctype\s+html\b|<html(?:\s|>))", text):
        return "html"

    if text.startswith("{\\rtf1") and text.endswith("}"):
        return "rtf"
    for marker, extension in (("VCARD", "vcf"), ("VCALENDAR", "ics")):
        if lines[0].upper() == f"BEGIN:{marker}" and lines[-1].upper() == f"END:{marker}":
            return extension

    if text.startswith("#!"):
        try:
            words = shlex.split(lines[0][2:])
            executable = Path(words.pop(0)).name if words else ""
            if executable == "env":
                executable = next((word for word in words if not word.startswith("-") and "=" not in word), "")
            interpreters = {"sh": "sh", "bash": "sh", "zsh": "sh", "fish": "fish",
                            "node": "js", "ruby": "rb", "perl": "pl"}
            if re.fullmatch(r"python(?:[23](?:\.\d+)?)?", executable):
                return "py"
            if executable in interpreters:
                return interpreters[executable]
        except ValueError:
            pass

    if tomllib is not None and re.search(r"(?m)^\s*[\w.-]+\s*=", text):
        try:
            if tomllib.loads(text):
                return "toml"
        except (ValueError, RecursionError):
            pass

    # Keep documentation containing code as Markdown.
    fence = re.search(r"(?m)^(`{3,}|~{3,})[^\n]*\n", text)
    if fence and re.search(r"(?m)^" + re.escape(fence[1]) + r"\s*$", text[fence.end():]):
        return "md"
    if re.search(r"(?m)^#{1,6} \S", text) and re.search(r"(?m)^(?:[-*+] |\d+\. |> )|\[[^\]\n]+\]\([^\)\n]+\)", text):
        return "md"
    if extended is None:
        extended = infer_extended(original_text)
    extension = extended.get("extension")
    # Valid SQL/source can also look rectangular to a CSV reader. Let the more
    # specific grammars win, while leaving permissive YAML behind tabular data.
    if extension and extension != "yaml":
        return extension

    # At least two nonempty, rectangular records with multiple fields. Comma
    # data additionally needs a simple unique header to avoid comma-rich prose.
    for delimiter, table_extension in (("\t", "tsv"), (",", "csv")):
        if delimiter not in text:
            continue
        try:
            rows = list(csv.reader(io.StringIO(original_text, newline=""), delimiter=delimiter, strict=True))
        except csv.Error:
            continue
        if len(rows) < 2 or len(rows[0]) < 2 or not all(len(row) == len(rows[0]) for row in rows):
            continue
        if delimiter == ",":
            header = [cell.strip() for cell in rows[0]]
            if len(set(header)) != len(header) or not all(re.fullmatch(r"[A-Za-z_][\w .-]*", cell) for cell in header):
                continue
            # Each field in a putative prose sentence often begins with a space.
            if all(cell.startswith(" ") for row in rows for cell in row[1:]):
                continue
        return table_extension

    script = infer_script(text)
    if extension == "yaml" and script == "py":
        # Python blocks can be YAML mappings too, but calls nested inside YAML
        # values (including Python-compatible annotations) are not programs.
        statements = (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef,
                      ast.ClassDef, ast.If, ast.For, ast.While, ast.With, ast.Try)
        if any(isinstance(node, statements) for node in ast.parse(text).body):
            return "py"
    if extension:
        return extension
    if script == "js" and extended.get("javascript") is False:
        return "txt"
    return script or "txt"


def inferred_name(name, path):
    """Preserve an explicit suffix and infer only for extensionless names."""
    if Path(name).suffix and not name.endswith("."):
        return name
    # Never parse a prefix as though it were a complete JSON/XML document, and
    # never load an arbitrarily large Finder file just to choose its suffix.
    with Path(path).open("rb") as content:
        data = content.read(MAX_TEXT_BYTES + 1)
    extension = infer_extension(data, complete=len(data) <= MAX_TEXT_BYTES)
    return f"{name.rstrip('.') or 'clipsend'}.{extension}"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: clipsend.py <name> <content-file>")
    print(inferred_name(sys.argv[1], sys.argv[2]))
