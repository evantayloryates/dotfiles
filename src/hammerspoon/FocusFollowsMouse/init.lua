-- FocusFollowsMouse: Automatically focus the window under the cursor
-- Configuration
local POLL_INTERVAL = 0.1  -- How often to check mouse position (seconds)
local ENABLED = false       -- Toggle to enable/disable the feature

-- Logging configuration
local LOGGING_ENABLED = false

-- Logger function that wraps print() and only logs if LOGGING_ENABLED is true
local function logger(...)
   if LOGGING_ENABLED then
      print(...)
   end
end

local FocusFollowsMouse = {}
local pollTimer = nil
local lastFocusedWindow = nil
local lastCursorPos = nil
local CURSOR_BUFFER = 5  -- Buffer in pixels for cursor position change detection

-- Check if frameA fully covers/contains frameB
local function fullyCovers(frameA, frameB)
	return frameA.x <= frameB.x and
	       frameA.y <= frameB.y and
	       (frameA.x + frameA.w) >= (frameB.x + frameB.w) and
	       (frameA.y + frameA.h) >= (frameB.y + frameB.h)
end

-- Get the visible portion of a window frame, clipped to its screen bounds
-- Returns nil if the window has no visible area on screen
local function getVisibleFrame(win)
	local frame = win:frame()
	local screen = win:screen()
	if not screen then return nil end

	local screenFrame = screen:frame()

	-- Calculate intersection of window frame and screen frame
	local visibleX = math.max(frame.x, screenFrame.x)
	local visibleY = math.max(frame.y, screenFrame.y)
	local visibleRight = math.min(frame.x + frame.w, screenFrame.x + screenFrame.w)
	local visibleBottom = math.min(frame.y + frame.h, screenFrame.y + screenFrame.h)

	local visibleW = visibleRight - visibleX
	local visibleH = visibleBottom - visibleY

	-- No visible area if width or height is non-positive
	if visibleW <= 0 or visibleH <= 0 then
		return nil
	end

	return {
		x = visibleX,
		y = visibleY,
		w = visibleW,
		h = visibleH
	}
end

-- Check if we're in desktop view mode (Mission Control desktop expose)
-- When desktop is shown, typically no window is focused even though windows exist
local function isDesktopViewMode()
	local focusedWindow = hs.window.focusedWindow()

	-- If no window is focused, check if there are visible windows
	-- In desktop view: windows exist but none are focused
	-- In other scenarios (like app switching): might also have no focused window temporarily
	if not focusedWindow then
		-- Count visible standard windows (excluding Hammerspoon console)
		local visibleWindowCount = 0
		for _, win in ipairs(hs.window.orderedWindows()) do
			if win:isStandard() and win:isVisible() then
				local appName = win:application():name()
				if appName ~= "Hammerspoon" then
					visibleWindowCount = visibleWindowCount + 1
				end
			end
		end

		-- If there are visible windows but none are focused, likely desktop view
		if visibleWindowCount > 0 then
			logger(string.format("[isDesktopViewMode] Desktop view mode detected (no focused window, %d visible windows)", visibleWindowCount))
			return true
		end

		-- If no visible windows at all, might be desktop view or just empty
		-- Log for debugging but don't assume desktop view
		logger("[isDesktopViewMode] No focused window and no visible windows")
	end

	return false
end

-- Find the window under the given screen coordinates
local function getWindowUnderMouse()
	local mousePos = hs.mouse.absolutePosition()
	local windows = hs.window.orderedWindows()

	logger(string.format("[getWindowUnderMouse] Checking mouse position: (%.0f, %.0f), %d windows to check",
	      mousePos.x, mousePos.y, #windows))

	for i, win in ipairs(windows) do
		if win:isStandard() and win:isVisible() then
			local frame = win:frame()
			local appName = win:application():name()
			local title = win:title()

			-- Skip Hammerspoon console windows
			if appName ~= "Hammerspoon" then
				if mousePos.x >= frame.x and mousePos.x <= frame.x + frame.w and
				   mousePos.y >= frame.y and mousePos.y <= frame.y + frame.h then
					logger(string.format("[getWindowUnderMouse] Found window #%d: %s - %s (frame: x=%.0f, y=%.0f, w=%.0f, h=%.0f)",
					      i, appName, title, frame.x, frame.y, frame.w, frame.h))
					return win
				end
			else
				logger(string.format("[getWindowUnderMouse] Skipping Hammerspoon window: %s", title))
			end
		end
	end

	logger("[getWindowUnderMouse] No window found under mouse")
	return nil
end

-- Check and focus window under cursor if needed
local function checkAndFocus()
	local checkStart = hs.timer.secondsSinceEpoch()

	if not ENABLED then
		logger("[checkAndFocus] Feature disabled, skipping")
		return
	end

	-- Don't interfere if user is dragging (mouse button held)
	local mouseButtons = hs.eventtap.checkMouseButtons()
	if mouseButtons.left or mouseButtons.right then
		logger(string.format("[checkAndFocus] Mouse button held (left=%s, right=%s), skipping",
		      tostring(mouseButtons.left), tostring(mouseButtons.right)))
		return
	end

	-- Don't auto-focus when in desktop view mode (Mission Control desktop expose)
	if isDesktopViewMode() then
		logger("[checkAndFocus] Desktop view mode active, skipping focus change")
		return
	end

	-- Get current cursor position
	local currentCursorPos = hs.mouse.absolutePosition()

	-- Check if cursor has moved significantly (more than buffer distance)
	if lastCursorPos then
		local dx = math.abs(currentCursorPos.x - lastCursorPos.x)
		local dy = math.abs(currentCursorPos.y - lastCursorPos.y)

		if dx <= CURSOR_BUFFER and dy <= CURSOR_BUFFER then
			logger(string.format("[checkAndFocus] Cursor position unchanged (dx=%.0f, dy=%.0f), skipping re-evaluation", dx, dy))
			return
		end
	end

	-- Update last cursor position
	lastCursorPos = currentCursorPos

	local t1 = hs.timer.secondsSinceEpoch()
	local windowUnderMouse = getWindowUnderMouse()
	logger(string.format("[TIMING] getWindowUnderMouse: %.3fs", hs.timer.secondsSinceEpoch() - t1))

	if not windowUnderMouse then
		logger("[checkAndFocus] No window under mouse, skipping")
		return
	end

	local t2 = hs.timer.secondsSinceEpoch()
	local currentFocused = hs.window.focusedWindow()
	logger(string.format("[TIMING] hs.window.focusedWindow: %.3fs", hs.timer.secondsSinceEpoch() - t2))

	local windowUnderApp = windowUnderMouse:application():name()
	local windowUnderTitle = windowUnderMouse:title()
	logger(string.format("[checkAndFocus] Window under mouse: %s - %s", windowUnderApp, windowUnderTitle))

	-- Don't auto-focus Hammerspoon console window
	if windowUnderApp == "Hammerspoon" then
		logger("[checkAndFocus] Window under mouse is Hammerspoon console, skipping focus change")
		return
	end

	if currentFocused then
		local currentApp = currentFocused:application():name()
		local currentTitle = currentFocused:title()
		logger(string.format("[checkAndFocus] Currently focused: %s - %s", currentApp, currentTitle))

		-- Don't follow cursor if a terminal hot window is currently focused.
		-- Ghostty's quick terminal autohides the moment it loses focus, so
		-- letting the mouse steal focus would dismiss it out from under you.
		if currentApp == "kitty" or currentApp == "Ghostty" then
			logger("[checkAndFocus] " .. currentApp .. " is currently focused, skipping focus change")
			return
		end

		-- Don't steal focus from Hammerspoon only if mouse is also over Hammerspoon
		-- If mouse moves to a different window, allow the focus change
		if currentApp == "Hammerspoon" and windowUnderApp == "Hammerspoon" then
			logger("[checkAndFocus] Hammerspoon is currently focused and mouse is over Hammerspoon, skipping focus change")
			return
		end

		-- Only focus if the window under cursor is different from currently focused
		if windowUnderMouse:id() == currentFocused:id() then
			logger("[checkAndFocus] Window under mouse is already focused, skipping")
			return
		end

		-- Don't focus if the new window would fully cover the visible portion of
		-- the currently focused window. We use the screen-clipped visible frame
		-- because if a window hangs off the screen, only the visible part matters.
		local t3 = hs.timer.secondsSinceEpoch()
		local newFrame = windowUnderMouse:frame()
		local visibleCurrentFrame = getVisibleFrame(currentFocused)
		logger(string.format("[TIMING] getVisibleFrame: %.3fs", hs.timer.secondsSinceEpoch() - t3))

		if visibleCurrentFrame then
			logger(string.format("[checkAndFocus] Current window visible frame: x=%.0f, y=%.0f, w=%.0f, h=%.0f",
			      visibleCurrentFrame.x, visibleCurrentFrame.y, visibleCurrentFrame.w, visibleCurrentFrame.h))
			logger(string.format("[checkAndFocus] New window frame: x=%.0f, y=%.0f, w=%.0f, h=%.0f",
			      newFrame.x, newFrame.y, newFrame.w, newFrame.h))

			-- If current window has no visible area, allow the focus change
			if fullyCovers(newFrame, visibleCurrentFrame) then
				logger("[checkAndFocus] New window fully covers current window's visible area, skipping focus change")
				return
			end
		else
			logger("[checkAndFocus] Current window has no visible area, allowing focus change")
		end
	else
		logger("[checkAndFocus] No window currently focused")
	end

	-- Focus the window (this also brings its application to front)
	logger(string.format("[checkAndFocus] Focusing window: %s - %s", windowUnderApp, windowUnderTitle))
	local t4 = hs.timer.secondsSinceEpoch()
	windowUnderMouse:focus()
	logger(string.format("[TIMING] window:focus(): %.3fs", hs.timer.secondsSinceEpoch() - t4))

	lastFocusedWindow = windowUnderMouse
	logger(string.format("[TIMING] TOTAL checkAndFocus: %.3fs", hs.timer.secondsSinceEpoch() - checkStart))
end

-- Start the focus-follows-mouse behavior
function FocusFollowsMouse.start()
	logger("=== FocusFollowsMouse.start() called ===")

	if pollTimer then
		logger("[start] Stopping existing poll timer")
		pollTimer:stop()
	end

	logger(string.format("[start] Creating new poll timer with interval: %.2fs", POLL_INTERVAL))
	pollTimer = hs.timer.doEvery(POLL_INTERVAL, checkAndFocus)
	ENABLED = true
	logger("✓ FocusFollowsMouse started")
end

-- Stop the focus-follows-mouse behavior
function FocusFollowsMouse.stop()
	logger("=== FocusFollowsMouse.stop() called ===")

	if pollTimer then
		logger("[stop] Stopping poll timer")
		pollTimer:stop()
		pollTimer = nil
	else
		logger("[stop] No poll timer to stop")
	end

	ENABLED = false
	lastCursorPos = nil  -- Reset cursor position tracking
	logger("✓ FocusFollowsMouse stopped")
end

-- Toggle the feature on/off
function FocusFollowsMouse.toggle()
	logger("=== FocusFollowsMouse.toggle() called ===")
	logger(string.format("[toggle] Current state: ENABLED=%s", tostring(ENABLED)))

	if ENABLED then
		FocusFollowsMouse.stop()
	else
		FocusFollowsMouse.start()
	end
end

-- Check if currently enabled
function FocusFollowsMouse.isEnabled()
	return ENABLED
end

-- Toggle logging on/off
function FocusFollowsMouse.toggleLogging()
	LOGGING_ENABLED = not LOGGING_ENABLED
	print(string.format("[FocusFollowsMouse] Logging %s", LOGGING_ENABLED and "enabled" or "disabled"))
	return LOGGING_ENABLED
end

-- Check if logging is enabled
function FocusFollowsMouse.isLoggingEnabled()
	return LOGGING_ENABLED
end

-- Auto-start on load only if ENABLED is true
logger("=== FocusFollowsMouse module loading ===")
logger(string.format("Configuration: POLL_INTERVAL=%.2fs, ENABLED=%s, LOGGING_ENABLED=%s", POLL_INTERVAL, tostring(ENABLED), tostring(LOGGING_ENABLED)))
if ENABLED then
	FocusFollowsMouse.start()
end

-- Export module
return FocusFollowsMouse
