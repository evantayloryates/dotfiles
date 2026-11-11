#!/usr/bin/env python3
"""Generate a parallel Replicate comparison from a clipboard image and prompt."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import replicate


ROOT = Path(__file__).resolve().parent
DESKTOP = Path.home() / "Desktop"
MODELS = (
    ("black-forest-labs/flux-schnell", None, {
        "aspect_ratio": "16:9", "num_outputs": 1, "num_inference_steps": 4,
        "output_format": "png", "disable_safety_checker": True, "megapixels": "1",
    }),
    ("luma/photon", "image_reference", {
        "aspect_ratio": "16:9", "image_reference_weight": 0.85,
    }),
    ("luma/photon-flash", "image_reference", {
        "aspect_ratio": "16:9", "image_reference_weight": 0.85,
    }),
    ("prunaai/hidream-l1-fast:06898b39cb00e42d31666b0dc8b9904f326169768129d756184f65ecf1986c8f", None, {
        "model_type": "fast", "speed_mode": "Unsqueezed 🍋 (highest quality)",
        "resolution": "1248 × 832 (Landscape)", "output_format": "png",
    }),
    ("prunaai/wan-2.2-image", None, {
        "juiced": True, "aspect_ratio": "16:9", "megapixels": 2,
        "output_format": "png",
    }),
    ("qwen/qwen-image", "image", {
        "strength": 0.75, "aspect_ratio": "16:9", "image_size": "optimize_for_quality",
        "num_inference_steps": 50, "guidance": 3, "output_format": "png",
        "disable_safety_checker": True,
    }),
    ("qwen/qwen-image-edit-plus", "image", {
        "go_fast": False, "aspect_ratio": "match_input_image",
        "output_format": "png", "disable_safety_checker": True,
    }),
    ("recraft-ai/recraft-v3", None, {
        "aspect_ratio": "16:9", "style": "realistic_image",
    }),
)


def next_directory() -> Path:
    for number in range(1, 10000):
        name = "bulk generation" if number == 1 else f"bulk generation {number}"
        candidate = DESKTOP / name
        try:
            candidate.mkdir()
            return candidate
        except FileExistsError:
            continue
    raise RuntimeError("Too many bulk generation directories")


def extension(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    raise RuntimeError("model returned an unrecognized image format")


def run_model(model: str, image_field: str | None, defaults: dict, prompt: str,
              image_path: Path, output_dir: Path) -> list[Path]:
    fields = {"prompt": prompt, **defaults}
    if image_field:
        # Give each concurrent request its own file handle.
        with image_path.open("rb") as image:
            fields[image_field] = [image] if model == "qwen/qwen-image-edit-plus" else image
            result = replicate.run(model, input=fields)
    else:
        result = replicate.run(model, input=fields)
    outputs = result if isinstance(result, list) else [result]
    if not outputs:
        raise RuntimeError("model returned no images")
    slug = model.split(":", 1)[0].replace("/", "--")
    if image_field is None:
        slug += "--text-only"
    paths = []
    for index, output in enumerate(outputs, 1):
        data = output.read() if hasattr(output, "read") else None
        if not data:
            raise RuntimeError("model returned an empty or unsupported image")
        suffix = f"--{index}" if len(outputs) > 1 else ""
        target = output_dir / f"{slug}{suffix}{extension(data)}"
        target.write_bytes(data)
        paths.append(target)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Run eight Replicate models in parallel using the clipboard image.")
    parser.add_argument("prompt", nargs="+", help="Prompt text following the burst command")
    args = parser.parse_args()
    prompt = " ".join(args.prompt).strip()
    if not prompt:
        parser.error("prompt must not be empty")
    if not os.environ.get("REPLICATE_API_TOKEN"):
        parser.error("REPLICATE_API_TOKEN is missing from the environment")
    with tempfile.TemporaryDirectory(prefix="burst-") as scratch:
        image_path = Path(scratch) / "clipboard.png"
        subprocess.run(["/usr/bin/swift", str(ROOT / "clipboard.swift"), str(image_path)], check=True)
        output_dir = next_directory()
        print(f"Saving to {output_dir}", flush=True)
        failures = []
        with ThreadPoolExecutor(max_workers=len(MODELS)) as pool:
            jobs = {pool.submit(run_model, model, field, defaults, prompt, image_path, output_dir): model
                    for model, field, defaults in MODELS}
            for job in as_completed(jobs):
                model = jobs[job].split(":", 1)[0]
                try:
                    paths = job.result()
                    for path in paths:
                        print(f"✓ {model}: {path.name}", flush=True)
                except Exception as error:
                    failures.append(model)
                    print(f"✗ {model}: {error}", file=sys.stderr, flush=True)
        print(f"Finished: {len(MODELS) - len(failures)}/{len(MODELS)} models; {output_dir}")
        return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
