# clipcheck

Copy a passage, then run `clipcheck`. For an existing shell, first run:

```zsh
source "$HOME/dotfiles/src/functions/clipcheck.sh"
clipcheck
```

The normal dotfiles loader picks up the function in new shells. The function uses
`~/src/playgrounds/fast-detect-gpt/.venv/bin/python`, not the shell's Python.
`CLIPCHECK_REPO` can override that repository location.

Each successful run creates `~/Desktop/clipcheck-YYYY-MM-DD_HH-MM-SS-<unique>/`:

- `report.html`: standalone browser-readable report, including original text.
- `report.md`: readable summary, interpretation, warnings and provenance.
- `report.json`: numeric scores, model/runtime versions and input hash.
- `input.txt`: original text, with Unicode and trailing newlines preserved.

Stdout contains the summary and report directory. Loading/progress/errors use
stderr. Nonzero exit means the run failed. The clipboard is only read, never
modified. Reports have private filesystem permissions. Inference is offline.
The setup below downloads public model weights; no API key or service is used.

Use at least 20 words; 100+ is preferable. Inputs over 512 tokens are evaluated in
sections with one context token of overlap. Every token after the first is scored
once; nothing is silently truncated. Each section gets its own score. There is
no validated document-level probability for a multi-section input.

This uses upstream's GPT-Neo 2.7B sampling/scoring configuration and calibration,
with half-precision inference on Apple MPS and FP32 scoring on CPU. It is an older,
experimental detector, not a reliable proof of authorship or a measurement of
what percentage of a passage was written by AI. The displayed 20%/80% signal
bands are heuristic. Its Gaussian calibration assumes equal human and AI priors.
The classifier can assign high scores to either extreme of the criterion; the
raw criterion is included so that this behavior remains inspectable.

## Setup / restore

Validated on Apple Silicon, Python 3.12. Model weights occupy about 10 GB on disk;
the model uses roughly 5 GB plus runtime/attention memory when loaded.
The pinned requirements are the working Mac inference environment, replacing
upstream's obsolete Transformers 4.28.1 pin. They are not a reproduction of the
paper's full experiment environment.

```zsh
git clone https://github.com/baoguangsheng/fast-detect-gpt.git "$HOME/src/playgrounds/fast-detect-gpt"
cd "$HOME/src/playgrounds/fast-detect-gpt"
# Version used to validate this integration:
git checkout 971b05202bac2bb504d60c0ac0812fea7a8f7c82
python3.12 -m venv .venv
.venv/bin/python -m pip install -r "$HOME/dotfiles/src/python/clipcheck-requirements.txt"
.venv/bin/python - <<'PY'
from pathlib import Path
from huggingface_hub import snapshot_download
snapshot_download('EleutherAI/gpt-neo-2.7B',
    revision='e24fa291132763e59f4a5422741b424fb5d59056',
    allow_patterns=['*.json', 'merges.txt', 'model.safetensors'],
    local_dir='models/gpt-neo-2.7B')
link = Path('models/local.EleutherAI_gpt-neo-2.7B')
if not link.exists():
    link.symlink_to('gpt-neo-2.7B', target_is_directory=True)
PY
```

The model path alias allows upstream's loader to use the downloaded files with
network access disabled. Upstream source is unmodified. Pinning the model and
upstream revisions matters because calibration is specific to the model pair.

## Diagnostics

```zsh
clipcheck --help
clipcheck --input /absolute/path/to/passage.txt
clipcheck --device cpu  # slower fallback if MPS is unavailable
"$HOME/src/playgrounds/fast-detect-gpt/.venv/bin/python" -m unittest discover \
  -s "$HOME/dotfiles/src/python/tests" -p test_clipcheck.py
```

Concurrent evaluations are rejected to prevent multiple large model copies
from exhausting memory. Empty or very short clipboard content is rejected
before model loading. Failed report writes remove the incomplete staging folder.
