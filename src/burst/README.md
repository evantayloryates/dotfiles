# burst

Copy an image, then run `burst your prompt here`. The command starts eight
Replicate models concurrently and saves their results in the first available
`~/Desktop/bulk generation`, `bulk generation 2`, and so on. Filenames include
the full model name. Four outputs say `text-only` because those models accept
only the prompt; the other four receive the clipboard image.

The shell must provide `REPLICATE_API_TOKEN` (the dotfiles shell environment
already exports it). `uv` and macOS Swift are required. Each run sends eight
billed predictions. Individual model failures leave successful images intact
and make the command exit nonzero after all jobs finish.
