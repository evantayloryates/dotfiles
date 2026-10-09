local MODULE_ROOT = 'Utils.'
local IMPORTS = {
	'Helpers',
	'Printers',
	'keybinds',
	'aliases',
	'ReloadNotification',
}
local EXCLUDES = {}

-- Conditionally load DebugMode if enabled
if DEBUG_WINDOW then
	table.insert(IMPORTS, 'DebugMode')
end

for _,item in pairs(IMPORTS) do
	require(MODULE_ROOT .. item)
end

-- Function to throw warnings if you are missing any local file imports
checkImports(MODULE_ROOT:gsub('%.','/'), IMPORTS, EXCLUDES)