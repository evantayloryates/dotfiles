-- OverlayCoordinator: a single source of truth for the ephemeral, full-screen
-- overlays that compete for the very top of the screen (the HotOverlay canvas
-- and the top-left hot-corner panels). Ghostty's quick terminal owns cmd+space
-- natively and is not coordinated here.
--
-- Model: AT MOST ONE overlay is "current" (presented) at a time. There is no
-- history -- exiting any overlay always returns to the base case (nothing open).
--
-- Trigger(id) -- the only entry point. Mirrors the user's mental rule
-- ("is the thing this trigger controls currently live and focused? if so turn it
--  off; otherwise bring it up, replacing whatever else was up"):
--
--   * id is current AND actually frontmost  -> turn it OFF (back to base).
--   * id is current but NOT frontmost (it silently lost focus to another app)
--     -> re-present it (re-raise/refocus).
--   * something else is current             -> dismiss it, present id.
--   * nothing is current                    -> present id.
--
-- Invariant the coordinator guarantees: AT MOST ONE overlay is presented at any
-- time. We always dismiss the outgoing overlay before presenting the incoming
-- one, so the floating hot-corner backdrop can never end up covering the normal
-- -level kitty window (the original "terminal won't load" symptom).

OverlayCoordinator = {}

local log = hs.logger.new("OverlayCoord", "info")

-- id -> { present = fn, dismiss = fn, isFrontmost = fn }
local overlays = {}
-- the id of the currently-presented overlay, or nil for the base case
local current = nil

-- Register an overlay's mechanism. Handlers:
--   present()     -- show + raise + focus this overlay (may be async)
--   dismiss()     -- hide this overlay immediately and deterministically
--   isFrontmost() -- is this overlay actually the live/focused presentation right now?
function OverlayCoordinator.register(id, handlers)
	assert(type(id) == "string", "overlay id must be a string")
	assert(handlers and handlers.present and handlers.dismiss and handlers.isFrontmost,
		"overlay must provide present/dismiss/isFrontmost")
	overlays[id] = handlers
	log.d("registered overlay " .. id)
end

local function present(id)
	local handlers = overlays[id]
	if handlers then
		local ok, err = pcall(handlers.present)
		if not ok then
			log.e("present(" .. id .. ") failed: " .. tostring(err))
		end
	end
end

local function dismiss(id)
	local handlers = overlays[id]
	if handlers then
		local ok, err = pcall(handlers.dismiss)
		if not ok then
			log.e("dismiss(" .. id .. ") failed: " .. tostring(err))
		end
	end
end

local function isFrontmost(id)
	local handlers = overlays[id]
	if not handlers then
		return false
	end
	local ok, result = pcall(handlers.isFrontmost)
	return ok and result == true
end

-- The single trigger entry point.
function OverlayCoordinator.toggle(id)
	if not overlays[id] then
		log.w("toggle for unregistered overlay " .. tostring(id))
		return
	end

	if current == id and isFrontmost(id) then
		-- It is up and live: turn it off, back to the base case.
		dismiss(id)
		current = nil
		log.d("toggle OFF " .. id .. " -> base")
		return
	end

	-- Otherwise bring `id` up. If something else is current, dismiss it first so
	-- only one overlay is ever presented. (If `id` itself is current but not
	-- frontmost, this simply re-presents it -- e.g. a re-raise after it lost
	-- focus to another app.)
	if current and current ~= id then
		dismiss(current)
	end
	present(id)
	current = id
	log.d("toggle ON " .. id)
end

-- Inspection helper for debugging.
function OverlayCoordinator.current()
	return current
end

return OverlayCoordinator
