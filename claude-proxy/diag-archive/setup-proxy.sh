#!/usr/bin/env bash
# setup.sh — bare-minimum SYN-drop workaround proxy (temporary home)
# Everything lives in $DIR. Cleanup = $DIR/stop.sh && rm -rf $DIR
set -euo pipefail

DIR="$HOME/.claude-netfix-min"
mkdir -p "$DIR"

command -v caddy >/dev/null 2>&1 || brew install caddy

cat > "$DIR/Caddyfile" <<'EOF'
{
  auto_https off
  admin off
}

http://127.0.0.1:8787 {
  reverse_proxy https://api.anthropic.com {
    header_up Host api.anthropic.com
    flush_interval -1
    transport http {
      versions 1.1 2
      keepalive 300s
      keepalive_idle_conns 2
      dial_timeout 45s
    }
  }
}

http://127.0.0.1:8788 {
  reverse_proxy https://api.openai.com {
    header_up Host api.openai.com
    flush_interval -1
    transport http {
      versions 1.1 2
      keepalive 300s
      keepalive_idle_conns 2
      dial_timeout 45s
    }
  }
}
EOF

cat > "$DIR/env.sh" <<'EOF'
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export OPENAI_BASE_URL=http://127.0.0.1:8788/v1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
EOF

cat > "$DIR/stop.sh" <<EOF
#!/usr/bin/env bash
[ -f "$DIR/caddy.pid" ] && kill "\$(cat "$DIR/caddy.pid")" 2>/dev/null
rm -f "$DIR/caddy.pid"
echo 'proxy stopped'
EOF
chmod +x "$DIR/stop.sh"

# stop any previous instance, then start fresh
[ -f "$DIR/caddy.pid" ] && kill "$(cat "$DIR/caddy.pid")" 2>/dev/null || true
sleep 1
nohup caddy run --config "$DIR/Caddyfile" --adapter caddyfile \
  > "$DIR/caddy.log" 2>&1 &
echo $! > "$DIR/caddy.pid"
sleep 2

if lsof -iTCP:8787 -sTCP:LISTEN -n >/dev/null 2>&1; then
  echo "proxy UP (pid $(cat "$DIR/caddy.pid"))"
  echo
  echo "use:      source $DIR/env.sh && claude"
  echo "stop:     $DIR/stop.sh"
  echo "cleanup:  $DIR/stop.sh && rm -rf $DIR"
else
  echo 'FAILED to start — log follows:'
  tail -20 "$DIR/caddy.log"
  exit 1
fi