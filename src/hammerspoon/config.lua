-- Configuration flags
DEBUG_WINDOW = false  -- Set to true to show debug window panel
LEFT_HOT_CORNER_ENABLED = false  -- bottom-left corner trigger -> top-left web view panels

-- Files/folders in GLOAL_EXCLUDES will be ignored when import checks are run
GLOBAL_EXCLUDES = {
	'.',
	'..',
	'init.lua',
	'.git',
	'hs',
}
BASE_DIR = hs.configdir .. '/'
APPLESCRIPTS_DIR = BASE_DIR .. 'AppleScripts'

-- print("✓ Debug keybind loaded: cmd+ctrl+c toggles console")
