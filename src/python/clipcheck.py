#!/usr/bin/env python3
"""Local Fast-DetectGPT clipboard reports. No text is sent to a service."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import html
import importlib.metadata
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace

MODEL = "gpt-neo-2.7B"
MODEL_REVISION = "e24fa291132763e59f4a5422741b424fb5d59056"
CHUNK_TOKENS = 512
LIMITATION = (
    "Experimental signal, not proof of authorship. Uses the upstream GPT-Neo 2.7B "
    "calibration and its equal human/AI prior; the percentage is not the fraction "
    "of text written by AI. This older model can miss newer AI output and flag "
    "human text. Short, non-English, edited, and mixed-author text is less reliable. "
    "Long inputs are evaluated section by section; there is no validated combined probability."
)


def windows(ids, size=CHUNK_TOKENS):
    """One token of context overlap; every token after the first is scored once."""
    for start in range(0, len(ids) - 1, size - 1):
        yield start, ids[start:start + size]


def calibrated_probability(criterion, params):
    # Same Gaussian classifier as upstream, in log space to avoid underflow.
    from scipy.special import expit
    from scipy.stats import norm
    human = norm.logpdf(criterion, params["mu0"], params["sigma0"])
    ai = norm.logpdf(criterion, params["mu1"], params["sigma1"])
    return float(expit(ai - human))


def signal(probability):
    # These are display bands, not claimed validation thresholds.
    if probability >= 0.8:
        return "Higher AI signal"
    if probability <= 0.2:
        return "Lower AI signal"
    return "Inconclusive"


def evaluate(text, repo, device):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    os.environ.setdefault("MPLCONFIGDIR", str(repo / ".matplotlib"))
    os.environ.setdefault("MPLBACKEND", "Agg")
    sys.path.insert(0, str(repo / "scripts"))
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        from local_infer import FastDetectGPT
        if device == "auto":
            device = "mps" if torch.backends.mps.is_available() else "cpu"
        print(f"clipcheck: loading {MODEL} on {device} (offline)...", file=sys.stderr)
        detector = FastDetectGPT(SimpleNamespace(
            sampling_model_name=MODEL, scoring_model_name=MODEL,
            device=device, cache_dir=str(repo / "models")))
    ids = detector.scoring_tokenizer.encode(text, add_special_tokens=False, truncation=False)
    if len(ids) < 2:
        raise ValueError("Text needs at least two tokens to evaluate.")
    results = []
    total = math.ceil((len(ids) - 1) / (CHUNK_TOKENS - 1))
    for index, (start, chunk) in enumerate(windows(ids), 1):
        print(f"clipcheck: evaluating section {index}/{total}...", file=sys.stderr)
        inputs = torch.tensor([chunk], device=device)
        with torch.inference_mode():
            # Score in FP32 on CPU to avoid half-precision variance cancellation.
            logits = detector.scoring_model(input_ids=inputs, use_cache=False).logits[:, :-1].float().cpu()
            criterion = detector.criterion_fn(logits, logits, inputs[:, 1:].cpu())
        if not math.isfinite(criterion):
            raise ValueError("Model returned a non-finite score; no report was saved.")
        probability = calibrated_probability(criterion, detector.classifier)
        results.append(dict(section=index, context_start_token=start,
                            scored_tokens=len(chunk) - 1, criterion=criterion,
                            ai_probability=probability, signal=signal(probability)))
        del inputs, logits
    return dict(model="EleutherAI/" + MODEL, model_revision=MODEL_REVISION,
                device=device, input_tokens=len(ids), scored_tokens=len(ids) - 1,
                chunk_size=CHUNK_TOKENS, calibration=detector.classifier, sections=results)


def write_reports(text, result, desktop):
    desktop.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    staging = Path(tempfile.mkdtemp(prefix=".clipcheck-", dir=desktop))
    destination = desktop / ("clipcheck-" + stamp + "-" + staging.name.rsplit("-", 1)[-1])
    try:
        rows = result["sections"]
        lines = ["# Clipboard AI detection report", "", f"Created: {result['created_at']}",
                 f"Model: {result['model']}", f"Device: {result['device']}",
                 f"Input: {result['words']} words / {result['input_tokens']} tokens",
                 f"Coverage: {result['scored_tokens']} predicted tokens; no truncation",
                 f"Elapsed: {result['elapsed_seconds']:.1f} seconds", "", "## Results", "",
                 "| Section | Scored tokens | Criterion | Calibrated AI score | Signal |",
                 "|---|---:|---:|---:|---|"]
        for row in rows:
            lines.append(f"| {row['section']} | {row['scored_tokens']} | {row['criterion']:.4f} | "
                         f"{row['ai_probability']:.1%} | {row['signal']} |")
        lines += ["", "## Interpretation", "", LIMITATION,
                  "", "Display bands: below or equal to 20% = lower AI signal; 80% or above = higher AI signal; otherwise inconclusive.",
                  "These display bands are heuristic, not measured accuracy guarantees.",
                  "", "## Warnings", ""] + ["- " + w for w in result["warnings"]]
        lines += ["", "## Provenance", "", f"Upstream commit: {result['upstream_commit']}",
                  f"Model revision: {result['model_revision']}", f"Input SHA-256: {result['input_sha256']}",
                  "", "Original clipboard text is saved in input.txt. Machine-readable details are in report.json.",
                  "", "Source: https://github.com/baoguangsheng/fast-detect-gpt", ""]
        markdown = "\n".join(lines)
        table_rows = "".join(f"<tr><td>{r['section']}</td><td>{r['scored_tokens']}</td>"
                             f"<td>{r['criterion']:.4f}</td><td>{r['ai_probability']:.1%}</td>"
                             f"<td>{r['signal']}</td></tr>" for r in rows)
        document = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clipboard AI detection report</title><style>
body{{max-width:960px;margin:48px auto;padding:0 24px;font:16px/1.6 system-ui;color:#17202a}}
table{{border-collapse:collapse;width:100%}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #ddd}}
pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f6f8;padding:20px}}
aside{{border-left:4px solid #b78316;padding:12px 20px;background:#fff8e8}}
</style><h1>Clipboard AI detection report</h1>
<p>{html.escape(result['created_at'])} · {result['words']} words · {result['input_tokens']} tokens · {result['device']}</p>
<p>Model: {html.escape(result['model'])} · {len(rows)} section(s) · No truncation</p>
<table><thead><tr><th>Section</th><th>Scored tokens</th><th>Criterion</th><th>Calibrated AI score</th><th>Signal</th></tr></thead>
<tbody>{table_rows}</tbody></table><aside>{html.escape(LIMITATION)}</aside>
<h2>Details</h2><pre>{html.escape(markdown)}</pre>
<details><summary>Original clipboard text</summary><pre>{html.escape(text)}</pre></details></html>"""
        for name, content in {"input.txt": text, "report.md": markdown, "report.html": document,
                              "report.json": json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n"}.items():
            (staging / name).write_text(content, encoding="utf-8")
        staging.rename(destination)
        return destination
    except BaseException:
        shutil.rmtree(staging)
        raise


def main():
    parser = argparse.ArgumentParser(description="Evaluate clipboard text locally; save HTML, Markdown, JSON and input.txt to ~/Desktop/clipcheck-*/.")
    parser.add_argument("--repo", type=Path, default=Path.home() / "src/playgrounds/fast-detect-gpt")
    parser.add_argument("--input", type=Path, help="Read a UTF-8 file instead of the clipboard")
    parser.add_argument("--device", choices=["auto", "mps", "cpu"], default="auto")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.input:
            text = args.input.read_bytes().decode("utf-8")
        else:
            clipboard = subprocess.run(["/usr/bin/pbpaste", "-Prefer", "txt"], capture_output=True, check=True)
            text = clipboard.stdout.decode("utf-8")
        if not text.strip():
            raise ValueError("Clipboard/input contains no text. Copy a passage and run clipcheck again.")
        if len(text.split()) < 20:
            raise ValueError("At least 20 words are required; use 100+ words for a more useful signal.")
        if not (args.repo / "models/local.EleutherAI_gpt-neo-2.7B/model.safetensors").is_file():
            raise ValueError("Local model missing. See dotfiles/docs/clipcheck.md for setup.")
        with (args.repo / ".clipcheck.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError("Another clipcheck is running; wait for it to finish.")
            started = time.monotonic()
            result = evaluate(text, args.repo, args.device)
            result.update(schema_version=1, created_at=dt.datetime.now().astimezone().isoformat(),
                          words=len(text.split()), characters=len(text),
                          input_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                          elapsed_seconds=round(time.monotonic() - started, 2),
                          upstream_commit=subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", "HEAD"], text=True).strip(),
                          packages={p: importlib.metadata.version(p) for p in ["torch", "transformers", "numpy", "scipy"]},
                          limitations=LIMITATION, warnings=[])
            if result["words"] < 100:
                result["warnings"].append("Short input: fewer than 100 words.")
            if len(result["sections"]) > 1:
                result["warnings"].append("Multiple sections: inspect each score; no combined probability is claimed.")
            destination = write_reports(text, result, Path.home() / "Desktop")
        print(f"clipcheck: {result['words']} words, {len(result['sections'])} section(s), {result['elapsed_seconds']:.1f}s on {result['device']}")
        for row in result["sections"]:
            print(f"  Section {row['section']}: {row['signal']} | calibrated AI score {row['ai_probability']:.1%} | criterion {row['criterion']:.4f}")
        print("  Experimental signal, not proof of authorship.")
        for warning in result["warnings"]:
            print("  Warning: " + warning)
        print(f"Reports: {destination}")
        return 0
    except (Exception, KeyboardInterrupt) as error:
        print(f"clipcheck: {error or 'Interrupted; no completed report was saved.'}", file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1


if __name__ == "__main__":
    raise SystemExit(main())
