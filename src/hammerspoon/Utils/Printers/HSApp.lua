function hs_application_pp(HSApp)
	local out_string = concat('\n', string.rep('*', 50), '\n\n')

	-- Static Variables --
	-- hs.application.menuGlyphs

	out_string = concat(out_string, 'ID:      ', HSApp:bundleID(), '\n' )
	out_string = concat(out_string, 'Name:    ', HSApp:name(), '\n' )
	out_string = concat(out_string, 'Title:   ', HSApp:title(), '\n' )
	out_string = concat(out_string, 'Path:    ', HSApp:path(), '\n' )
	out_string = concat(out_string, 'PID:     ', HSApp:pid(), '\n' )
	out_string = concat(out_string, 'Focused: ', HSApp:isFrontmost(), '\n' )
	out_string = concat(out_string, 'Hidden:  ', HSApp:isHidden(), '\n' )
	out_string = concat(out_string, 'Running: ', HSApp:isRunning(), '\n' )
	out_string = concat(out_string, 'In Dock: ', convertDockStatus(HSApp:kind()), '\n' )

	out_string = concat(out_string, '\n', string.rep('*', 50), '\n')
	print(out_string)

	-- TODO: Write printers for Windows and MenuItems
	-- 	HSApp:focusedWindow() -- Focused Window:
	-- 	HSApp:mainWindow() -- Main Window:
	-- 	HSApp:visibleWindows()  -- Windows:
	-- 	HSApp:allWindows()  -- Windows:
	-- 	HSApp:getMenuItems() -- Menu Items:
end

function convertDockStatus(statusID)
	local dockStatuses = {
		[-1] = "no (GUI restricted)",
		[0] = "no",
		[1] = "yes",
	}
	return dockStatuses[statusID]
end
