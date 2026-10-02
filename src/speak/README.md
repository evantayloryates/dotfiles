# speak

Speaks text through Cartesia, streaming, with the audio starting as soon as
the first bytes arrive.

```bash
speak Build finished, three tests failed.
speak --init-alt "Same line, the other voice."
pbpaste | speak
speak -- --text that starts with a dash
```

Everything after the optional voice flag is sent as one literal string. With no
text arguments, `speak` reads stdin.

## Voice profiles

`voices.json` maps a profile id to the Cartesia request body for that voice.
The flag is the id: `--init-alt` selects `profiles["init-alt"]`. With no flag,
the `default` id is used.

Each profile is sent to `POST /tts/bytes` as written, plus the `transcript`.
Any Cartesia setting can go in it (`model_id`, `voice`, `language`,
`generation_config.speed`, `.volume`, `.emotion`, `output_format`). Keys that
start with `_` are notes and are not sent. Edits take effect on the next run;
no rebuild.

| id | voice |
| - | - |
| `init-default` | Skylar, en-US female |
| `init-alt` | Daniel, en-US male |

## Setup

`CARTESIA_API_KEY` in `dotfiles/.env`: a standard key from
<https://play.cartesia.ai/keys>. The admin key (`CARTESIA_ADMIN_API_KEY`) is
rejected by generation routes.

`bin/speak` compiles `speak.swift` to `.build/speak` on first use and whenever
the source is newer.

## Why it is built this way

- **One native process.** No interpreter start-up and no pipe to a separate
  player: about 12 ms from exec to the first line of `main`.
- **Device first, in parallel.** Opening the output device costs about 100 ms
  when it is awake and up to 500 ms for idle AirPods. It starts on its own
  thread before the request is built, so it overlaps the network wait.
- **Bytes endpoint.** One POST whose body streams as audio is generated. The
  WebSocket only wins when a connection stays open across utterances, which a
  one-shot command cannot do.
- **Raw `pcm_s16le` at 24 kHz.** No container header to parse, no decoder, and
  no codec frame to wait for: the first bytes are playable samples. 24 kHz
  covers speech; 16-bit is half the bytes of float for the same audible result.
- **Length does not matter.** Audio plays while the rest is still being
  generated, so time to first sound is the same for a word or a page.

`SPEAK_TIMING=1 speak hello` prints where the time went. `SPEAK_URL` points the
request at another server (used for the local mock in testing).
