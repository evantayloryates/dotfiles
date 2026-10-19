// Moved to mcps/_shared/kernel/mcp-stdio.mjs. This shim keeps existing
// importers (claude-driver, smart-record, codex-bridge, sealed releases)
// working until each one moves into mcps/.
export * from '../../../mcps/_shared/kernel/mcp-stdio.mjs'
