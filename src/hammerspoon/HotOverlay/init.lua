-- HotOverlay: menu-bar-aware full-viewport overlay. Previously toggled by
-- cmd+option+space; that trigger now drives Ghostty's quick terminal instead.
--
-- Positioning mirrors TopLeftHotCorner's viewportContext(): use screen:frame()
-- (excludes menu bar when it reserves space) vs screen:fullFrame() (edge-to-edge
-- when the menu bar is auto-hidden or absent, e.g. media fullscreen).

local HotOverlay = {}
local log = hs.logger.new("HotOverlay", "info")

-- Debug fill so the framed region is unmistakable while wiring this up.
local FILL_COLOR = { hex = "#32CD32", alpha = 0.3 }

local canvas = nil
local isVisible = false
local screenWatcher = nil

local function getPrimaryRetinaScreen()
	local fallback = hs.screen.mainScreen()
	for _, screen in ipairs(hs.screen.allScreens()) do
		local info = screen:getInfo()
		local name = screen:name()
		if info and info.builtIn then
			return screen
		end
		if name and string.find(string.lower(name), "retina") then
			return screen
		end
	end
	return fallback
end

-- Same framing math as TopLeftHotCorner: sit below the menu bar when it
-- occupies space; fill edge-to-edge when menuBarOffset is 0.
local function overlayFrame()
	local screen = getPrimaryRetinaScreen()
	local viewportFrame = screen:frame()
	local fullFrame = screen:fullFrame()
	local menuBarOffset = viewportFrame.y - fullFrame.y
	return {
		x = fullFrame.x,
		y = viewportFrame.y,
		w = fullFrame.w,
		h = fullFrame.h - menuBarOffset,
	}
end

local function ensureCanvas()
	local frame = overlayFrame()
	if not canvas then
		canvas = hs.canvas.new(frame)
		canvas:appendElements({
			type = "rectangle",
			action = "fill",
			fillColor = FILL_COLOR,
		})
		canvas
			:level(hs.canvas.windowLevels.floating)
			:behavior({ "canJoinAllSpaces", "stationary" })
			:alpha(1)
			:hide()
	else
		canvas:frame(frame)
	end
	return canvas
end

local function present()
	ensureCanvas()
	canvas:show():bringToFront()
	isVisible = true
	log.d("present")
end

local function dismiss()
	if canvas then
		canvas:hide()
	end
	isVisible = false
	log.d("dismiss")
end

local function isFrontmost()
	return isVisible == true
end

OverlayCoordinator.register("hotOverlay", {
	present = present,
	dismiss = dismiss,
	isFrontmost = isFrontmost,
})

-- cmd+option+space now belongs to Ghostty's native quick terminal
-- (keybind = global:cmd+alt+space=toggle_quick_terminal in ~/.config/ghostty/config).
-- The overlay stays registered so it can be driven programmatically via
-- OverlayCoordinator.toggle("hotOverlay") or rebound to another trigger.

screenWatcher = hs.screen.watcher.new(function()
	if canvas then
		canvas:frame(overlayFrame())
	end
end)
screenWatcher:start()

log.i("HotOverlay ready: registered with OverlayCoordinator, no key trigger bound")

return HotOverlay
