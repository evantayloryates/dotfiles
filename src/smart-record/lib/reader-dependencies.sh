# Optional retained-media readers. Sourced after the shared binary resolver.
# No dependency starts during launch; missing support is explicit on request.
if _smart_record_probe="$(resolve_binary ffprobe 2>/dev/null)"; then
  export FFPROBE_PATH="$_smart_record_probe"
fi
if _smart_record_decoder="$(resolve_binary ffmpeg 2>/dev/null)"; then
  export FFMPEG_PATH="$_smart_record_decoder"
fi
if [ -z "${SMART_RECORD_REGISTRATION_PYTHON:-}" ]; then
  _smart_record_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
  if [ -x "$_smart_record_python" ]; then
    export SMART_RECORD_REGISTRATION_PYTHON="$_smart_record_python"
  elif _smart_record_python="$(resolve_binary python3 2>/dev/null)"; then
    export SMART_RECORD_REGISTRATION_PYTHON="$_smart_record_python"
  fi
fi
unset _smart_record_probe _smart_record_decoder _smart_record_python
