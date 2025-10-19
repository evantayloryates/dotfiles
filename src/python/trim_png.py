from PIL import Image
import numpy as np
import os
import sys

# Internal defaults - update here as needed
THRESHOLD = 40  # Luminance threshold for detecting dark/black border
PADDING = 0     # Extra pixels to include around the detected border

def compute_luminance(rgb_array):
  # Perceptual luminance
  return (0.2126 * rgb_array[..., 0] + 0.7152 * rgb_array[..., 1] + 0.0722 * rgb_array[..., 2]).astype(np.float32)

def build_output_path(input_path):
  root, ext = os.path.splitext(input_path)
  return f"{root}_trimmed{ext}"

def trim_to_black_border(image_path):
  img = Image.open(image_path).convert('RGB')
  arr = np.asarray(img, dtype=np.uint8)

  luminance = compute_luminance(arr)
  dark = luminance < THRESHOLD

  rows_with_dark = np.where(np.any(dark, axis=1))[0]
  cols_with_dark = np.where(np.any(dark, axis=0))[0]

  if len(rows_with_dark) == 0 or len(cols_with_dark) == 0:
    raise RuntimeError('No dark border detected; consider adjusting THRESHOLD')

  top = max(0, rows_with_dark[0] - PADDING)
  bottom = min(arr.shape[0], rows_with_dark[-1] + 1 + PADDING)
  left = max(0, cols_with_dark[0] - PADDING)
  right = min(arr.shape[1], cols_with_dark[-1] + 1 + PADDING)

  cropped = img.crop((left, top, right, bottom))
  out_path = build_output_path(image_path)
  cropped.save(out_path)
  return out_path

if __name__ == '__main__':
  if len(sys.argv) != 2:
    print('Usage: python3 trim_png.py /absolute/path/to/image.png', file=sys.stderr)
    sys.exit(1)

  input_path = sys.argv[1]
  if not os.path.isabs(input_path):
    input_path = os.path.abspath(input_path)
  if not os.path.exists(input_path):
    print('Input file does not exist', file=sys.stderr)
    sys.exit(1)

  try:
    trimmed_path = trim_to_black_border(input_path)
    # Print only the resulting path so callers can capture it
    sys.stdout.write(trimmed_path)
  except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
