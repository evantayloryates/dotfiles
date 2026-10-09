-- CursorScreenshot: capture a square region centered on the cursor (cursor included)

local CursorScreenshot = {}

local CAPTURE_SIZE = 500

local function captureRect()
	local pos = hs.mouse.absolutePosition()
	local half = CAPTURE_SIZE / 2
	return {
		x = math.floor(pos.x - half),
		y = math.floor(pos.y - half),
		w = CAPTURE_SIZE,
		h = CAPTURE_SIZE,
	}
end

function CursorScreenshot.capture()
	local rect = captureRect()
	local rectArg = string.format("%d,%d,%d,%d", rect.x, rect.y, rect.w, rect.h)

	hs.task.new("/usr/sbin/screencapture", function(exitCode)
		if exitCode == 0 then
			hs.alert.show("Screenshot copied to clipboard", 1)
		else
			hs.alert.show("Screenshot failed", 2)
		end
	end, {"-x", "-C", "-c", "-R", rectArg}):start()
end

return CursorScreenshot
