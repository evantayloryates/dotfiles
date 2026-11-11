# burst

Run `burst your prompt here`. An image on the clipboard is optional. The command
starts Replicate models concurrently and saves their results in the first available
`~/Desktop/bulk generation`, `bulk generation 2`, and so on. Filenames include
the full model name. When the clipboard has an image, four models receive it and
four outputs say `text-only` because those models accept only the prompt. With
no clipboard image, seven models generate from text; Qwen Image Edit Plus is
skipped because it requires an input image. The command logs the clipboard
decision and whether each model uses the image.

The shell must provide `REPLICATE_API_TOKEN` (the dotfiles shell environment
already exports it). `uv` and macOS Swift are required. Each run sends eight
billed predictions. Individual model failures leave successful images intact
and make the command exit nonzero after all jobs finish.
