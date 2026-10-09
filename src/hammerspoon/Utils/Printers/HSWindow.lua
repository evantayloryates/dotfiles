function hs_window_pp(HSWindow)
	local print_header = concat('\n', string.rep('*', 50), '\n\n')
	local print_footer = concat('\n', string.rep('*', 50), '\n')
	local print_body = hs_window_str(HSWindow)
	print(concat(print_header, print_body, print_footer))
end

function hs_window_str(HSWindow)
	-- Static Variables --
	--   hs.window.animationDuration
	--   hs.window.setFrameCorrectness

	local out_string = ''

	-- Instance Variables --
	out_string = concat(out_string, 'ID:            ', HSWindow:id(), '\n' )
	out_string = concat(out_string, 'Title:         ', HSWindow:title(), '\n' )
	out_string = concat(out_string, 'Application:   ', HSWindow:application(), '\n' )
	out_string = concat(out_string, 'Screen:        ', HSWindow:screen(), '\n' )
	out_string = concat(out_string, 'Standard:      ', HSWindow:isStandard(), '\n' )
	out_string = concat(out_string, 'Fullscreen:    ', HSWindow:isFullScreen(), '\n' )
	out_string = concat(out_string, 'Can Maximize:  ', HSWindow:isMaximizable(), '\n' )
	out_string = concat(out_string, 'Minimized:     ', HSWindow:isMinimized(), '\n' )
	out_string = concat(out_string, 'Visible:       ', HSWindow:isVisible(), '\n' )
	out_string = concat(out_string, 'Size:          ', HSWindow:size(), '\n' )
	out_string = concat(out_string, 'Frame:         ', HSWindow:frame(), '\n' )
	out_string = concat(out_string, 'Top Left:      ', HSWindow:topLeft(), '\n' )
	out_string = concat(out_string, 'Role:          ', HSWindow:role(), '\n' )
	out_string = concat(out_string, 'Role (sub):    ', HSWindow:subrole(), '\n' )
	out_string = concat(out_string, 'Tab Count:     ', HSWindow:tabCount(), '\n' )
	out_string = concat(out_string, 'Windows North: ', #HSWindow:windowsToNorth(), '\n' )
	out_string = concat(out_string, 'Windows South: ', #HSWindow:windowsToSouth(), '\n' )
	out_string = concat(out_string, 'Windows East:  ', #HSWindow:windowsToEast(), '\n' )
	out_string = concat(out_string, 'Windows West:  ', #HSWindow:windowsToWest(), '\n' )

	return out_string
end

function hs_window_repr(HSWindow)
	-- Static Variables --
	--   hs.window.animationDuration
	--   hs.window.setFrameCorrectness

	local repr_data = {}

	-- Instance Variables --
	table.insert(repr_data, concat({}, 'ID', HSWindow:id() ))
	table.insert(repr_data, concat({}, 'Title', HSWindow:title() ))
	table.insert(repr_data, concat({}, 'Application', HSWindow:application():title() ))
	table.insert(repr_data, concat({}, 'Screen', HSWindow:screen():name() ))
	table.insert(repr_data, concat({}, 'Standard', HSWindow:isStandard() ))
	table.insert(repr_data, concat({}, 'Fullscreen', HSWindow:isFullScreen() ))
	table.insert(repr_data, concat({}, 'Can Maximize', HSWindow:isMaximizable() ))
	table.insert(repr_data, concat({}, 'Minimized', HSWindow:isMinimized() ))
	table.insert(repr_data, concat({}, 'Visible', HSWindow:isVisible() ))
	table.insert(repr_data, concat({}, 'Size', HSWindow:size() ))
	table.insert(repr_data, concat({}, 'Frame', HSWindow:frame() )	)
	table.insert(repr_data, concat({}, 'Top Left', HSWindow:topLeft() ))
	table.insert(repr_data, concat({}, 'Role', HSWindow:role() ))
	table.insert(repr_data, concat({}, 'Role (sub)', HSWindow:subrole() ))
	table.insert(repr_data, concat({}, 'Tab Count', HSWindow:tabCount() ))
	table.insert(repr_data, concat({}, 'Windows North', #HSWindow:windowsToNorth() ))
	table.insert(repr_data, concat({}, 'Windows South', #HSWindow:windowsToSouth() ))
	table.insert(repr_data, concat({}, 'Windows East', #HSWindow:windowsToEast() ))
	table.insert(repr_data, concat({}, 'Windows West', #HSWindow:windowsToWest() ))

	return repr_data
end

function hs_window_ppa(HSWindowArray)
	for _, HSWindow in pairs(HSWindowArray) do
		pp(HSWindow)
	end
end

function getWindowOrderIndex(HSWindow)
	-- hs.window.orderedWindows
end
