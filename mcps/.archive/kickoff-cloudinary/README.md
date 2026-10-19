# kickoff-cloudinary (archived 2026-10-18)

Global Cloudinary MCP for Claude Code and Codex, launching the official
`@cloudinary/asset-management-mcp` with a restricted key pair from the
1Password broker. Retired: Cloudinary access belongs only inside the ZDR
harness (`apps/zdr-agent/mcps/cloudinary-mcp`). Kept because
`src/onepassword/test_cloudinary_launcher.py` uses this launcher as its
broker fixture.
