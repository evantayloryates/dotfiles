local MODULE_ROOT = ''
require('hs.logger').historySize(1000)
require('hs.ipc')
hs.allowAppleScript(true)

local IMPORTS = {
	'config',
	'Utils',
	'ProfileLayouts',
	'OverlayCoordinator',
	'HotOverlay',
	'FocusFollowsMouse',
	'CursorScreenshot',
	'SkillPicker',
}
local EXCLUDES = {
	'AppleScripts',
	-- Deprecated: the kitty hot window was replaced by Ghostty's quick terminal
	-- on cmd+space. Kept on disk but no longer loaded.
	'HotWindows',
}

for _,item in pairs(IMPORTS) do
	require(MODULE_ROOT .. item)
end

-- Function to throw warnings if you are missing any local file imports
checkImports(MODULE_ROOT:gsub('%.','/'), IMPORTS, EXCLUDES)
