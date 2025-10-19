from PIL import Image
import numpy as np
import sys

def trim_to_black_border(path, threshold=40, pad=0):
  img = Image.open(path).convert('RGB')
  arr = np.asarray(img, dtype=np.uint8)

  # Perceptual luminance
  luminance = (0.2126 * arr[...,0] + 0.7152 * arr[...,1] + 0.0722 * arr[...,2]).astype(np.float32)

  dark = luminance < threshold

  # Find first/last rows and cols containing dark pixels (the black frame itself)
  rows_with_dark = np.where(np.any(dark, axis=1))[0]
  cols_with_dark = np.where(np.any(dark, axis=0))[0]

  if len(rows_with_dark) == 0 or len(cols_with_dark) == 0:
    print('No dark pixels found (adjust threshold).')
    return

  top = max(0, rows_with_dark[0] - pad)
  bottom = min(arr.shape[0], rows_with_dark[-1] + 1 + pad)
  left = max(0, cols_with_dark[0] - pad)
  right = min(arr.shape[1], cols_with_dark[-1] + 1 + pad)

  print(f'Crop box: left={left}, top={top}, right={right}, bottom={bottom}')
  cropped = img.crop((left, top, right, bottom))
  out_path = path.replace('.png', '_trimmed.png')
  cropped.save(out_path)
  print(f'Saved: {out_path}')

if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: python3 trim_to_black_border.py path/to/image.png [threshold] [pad]')
    sys.exit(1)
  path = sys.argv[1]
  threshold = int(sys.argv[2]) if len(sys.argv) > 2 else 40
  pad = int(sys.argv[3]) if len(sys.argv) > 3 else 0
  trim_to_black_border(path, threshold, pad)
