#!/bin/zsh

# Preview only files whose contents match an image format supported by our
# terminal renderer. Return 2 when the path is not eligible, 1 on render error.
# Callers decide what to do after a preview; this never changes the clipboard.
__terminal_image_preview() {
  [[ -f "$1" ]] && command -v chafa >/dev/null 2>&1 || return 2

  # Follow symlinks and inspect the contents instead of trusting the suffix.
  local mime
  mime=$(/usr/bin/file -L -b --mime-type -- "$1") || return 2
  case "$mime" in
    image/avif|image/bmp|image/gif|image/heic|image/heif|image/jpeg|image/jxl|image/png|image/qoi|image/svg+xml|image/tiff|image/vnd.microsoft.icon|image/webp|image/x-qoi|image/x-xwindowdump)
      chafa --probe=off "$1" || return 1 ;;
    *) return 2 ;;
  esac
}
