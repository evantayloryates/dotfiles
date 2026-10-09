local MODULE_ROOT = 'Utils.Printers.'
local IMPORTS = {
	'HSApp',
	'HSWindow',
	'HSEvent',
	'_map',
}
local EXCLUDES = {}

for _,item in pairs(IMPORTS) do
	require(MODULE_ROOT .. item)
end

-- Function to throw warnings if you are missing any local file imports
checkImports(MODULE_ROOT:gsub('%.','/'), IMPORTS, EXCLUDES)