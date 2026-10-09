# Optional retained-media readers. Sourced after the shared binary resolver.
# No dependency starts during launch; missing support is explicit on request.
if _record_screen_probe="$(resolve_binary ffprobe 2>/dev/null)"; then
  export FFPROBE_PATH="$_record_screen_probe"
fi
if _record_screen_decoder="$(resolve_binary ffmpeg 2>/dev/null)"; then
  export FFMPEG_PATH="$_record_screen_decoder"
fi
if [ -z "${RECORD_SCREEN_REGISTRATION_PYTHON:-}" ]; then
  _record_screen_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
  if [ -x "$_record_screen_python" ]; then
    export RECORD_SCREEN_REGISTRATION_PYTHON="$_record_screen_python"
  elif _record_screen_python="$(resolve_binary python3 2>/dev/null)"; then
    export RECORD_SCREEN_REGISTRATION_PYTHON="$_record_screen_python"
  fi
fi
unset _record_screen_probe _record_screen_decoder _record_screen_python
