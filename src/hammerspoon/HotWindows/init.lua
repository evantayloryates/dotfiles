-- Load HotWindow classes
require('HotWindows.HotWindow')
require('HotWindows.HotWindowDriver')

-- Logging configuration
local LOGGING_ENABLED = false

-- Logger function that wraps print() and only logs if LOGGING_ENABLED is true
local function logger(...)
   if LOGGING_ENABLED then
      print(...)
   end
end

-- Create a HotWindow for kitty terminal - always on built-in Retina display
local kittyHotWindow = HotWindow:new()

-- Saved cursor state for restoring on toggle off
-- { x = number, y = number, space = number, expiresAt = number }
local savedCursorState = nil
local CURSOR_RESTORE_EXPIRY_SECONDS = 30

-- Save current cursor position and space before showing hotwindow
local function saveCursorState()
   local pos = hs.mouse.absolutePosition()
   local currentScreen = hs.mouse.getCurrentScreen()
   local space = nil
   if currentScreen then
      local success, result = pcall(function()
         return hs.spaces.activeSpaceOnScreen(currentScreen)
      end)
      if success then
         space = result
      end
   end

   savedCursorState = {
      x = pos.x,
      y = pos.y,
      space = space,
      expiresAt = hs.timer.secondsSinceEpoch() + CURSOR_RESTORE_EXPIRY_SECONDS
   }
   logger(string.format("Saved cursor state: (%.0f, %.0f) space=%s expiresAt=%.0f",
         pos.x, pos.y, tostring(space), savedCursorState.expiresAt))
end

-- Check if cursor is within the kitty window bounds
local function isCursorInKittyWindow(kittyWindow)
   if not kittyWindow then return false end

   local pos = hs.mouse.absolutePosition()
   local frame = kittyWindow:frame()

   return pos.x >= frame.x and pos.x <= (frame.x + frame.w) and
          pos.y >= frame.y and pos.y <= (frame.y + frame.h)
end

-- Restore cursor to saved position if conditions are met
local function restoreCursorIfNeeded(kittyWindow)
   -- Always clear saved state at the end, but check conditions first
   local stateToRestore = savedCursorState
   savedCursorState = nil  -- Always clear

   if not stateToRestore then
      logger("No saved cursor state to restore")
      return
   end

   -- Check if expired
   local now = hs.timer.secondsSinceEpoch()
   if now > stateToRestore.expiresAt then
      logger(string.format("Saved cursor state expired (%.1fs ago)", now - stateToRestore.expiresAt))
      return
   end

   -- Check if cursor is still in kitty window bounds
   if not isCursorInKittyWindow(kittyWindow) then
      logger("Cursor moved outside kitty window, not restoring")
      return
   end

   -- Restore cursor position
   hs.mouse.absolutePosition({x = stateToRestore.x, y = stateToRestore.y})
   logger(string.format("Restored cursor to (%.0f, %.0f)", stateToRestore.x, stateToRestore.y))
end

-- Function to wait for kitty window with retries
local function waitForKittyWindow(callback, maxRetries)
   maxRetries = maxRetries or 20  -- Increased from 10 to 20 (4 seconds total)
   local retryCount = 0

   local function checkForWindow()
      retryCount = retryCount + 1

      -- Try to find kitty application with error handling
      local kitty = nil
      local success, result = pcall(function() return hs.application.find("kitty") end)
      if success then
         kitty = result
      end

      if kitty then
         -- Verify kitty is actually running (not just a stale object)
         local isRunning = false
         local win = nil
         local runSuccess, runResult = pcall(function()
            isRunning = kitty:isRunning()
            if isRunning then
               win = kitty:mainWindow()
            end
            return win
         end)

         if runSuccess and isRunning and win then
            -- Additional check: verify window is actually visible/valid
            local winValid = false
            local validSuccess, validResult = pcall(function()
               winValid = win:isStandard() and win:isVisible()
               return winValid
            end)

            if validSuccess and winValid then
               logger("✓ Kitty window found after " .. retryCount .. " attempts")
               callback(win)
               return true
            else
               logger("Kitty window found but not valid yet (attempt " .. retryCount .. ")")
            end
         end
      end

      if retryCount >= maxRetries then
         logger("✗ Failed to find kitty window after " .. maxRetries .. " attempts")
         hs.alert("Failed to launch Kitty window")
         -- Try one more time with a direct check
         hs.timer.doAfter(0.5, function()
            local finalKitty = hs.application.find("kitty")
            if finalKitty then
               local finalWin = finalKitty:mainWindow()
               if finalWin then
                  logger("✓ Found kitty window on final retry")
                  callback(finalWin)
               end
            end
         end)
         return true
      end

      return false
   end

   -- Check every 0.2 seconds
   hs.timer.doUntil(checkForWindow, function() end, 0.2)
end

-- Resolve kitty's current state. Returns (kitty, isRunning, isHidden, win) with
-- stale application objects normalised to "not running".
local function resolveKitty()
   local kitty = nil
   local findSuccess, findResult = pcall(function() return hs.application.find("kitty") end)
   if findSuccess then
      kitty = findResult
   end

   if not kitty then
      return nil, false, false, nil
   end

   local isRunning, isHidden, win = false, false, nil
   local success = pcall(function()
      isRunning = kitty:isRunning()
      if isRunning then
         isHidden = kitty:isHidden()
         win = kitty:mainWindow()
      end
   end)

   if not success or not isRunning then
      -- Stale object or not running.
      return nil, false, false, nil
   end

   return kitty, isRunning, isHidden, win
end

-- isFrontmost: kitty is the live, focused presentation right now. Because kitty
-- is a NORMAL-level window it can silently lose the front to any other app, so we
-- ask the OS directly rather than trusting our own cached state.
local function terminalIsFrontmost()
   local _, isRunning, isHidden, win = resolveKitty()
   if not isRunning or isHidden or not win then
      return false
   end
   local focused = hs.window.focusedWindow()
   if not focused then
      return false
   end
   local app = focused:application()
   return app ~= nil and app:name() == "kitty"
end

-- Monotonic token that invalidates in-flight async work (window-launch waits).
-- Every present and every dismiss bumps it, so a slow kitty-launch callback that
-- resolves AFTER the user has already handed the screen off to the panels (or
-- re-triggered the terminal) is dropped instead of raising kitty out of turn.
local activationToken = 0

local function bumpActivationToken()
   activationToken = activationToken + 1
   return activationToken
end

-- Configure (frame + raise + focus) a kitty window once we have a handle to it.
-- `token` is the activation token captured when this activation was requested;
-- if it has since changed, a newer present/dismiss superseded us -> do nothing.
local function activateWindow(win, token)
   if not win then
      return
   end
   if token ~= activationToken then
      logger("Stale activation (token " .. tostring(token) .. " != " .. tostring(activationToken) .. "), skipping")
      return
   end
   local setSuccess, setError = pcall(function()
      kittyHotWindow:setActiveWindow(win)
   end)
   if not setSuccess then
      logger("✗ Error in setActiveWindow: " .. tostring(setError))
      hs.alert("Failed to configure Kitty window")
   end
end

-- present: bring the kitty hot window to the very top. Launches kitty (or makes a
-- new window) if needed. Never hides -- dismissal is the coordinator's job.
local function terminalPresent()
   logger("\n========== TERMINAL PRESENT ==========")
   local token = bumpActivationToken()

   local kitty, isRunning, isHidden, win = resolveKitty()

   -- Only snapshot the cursor when the terminal is actually being revealed from a
   -- hidden/absent state. Re-raising an already-visible terminal (e.g. it quietly
   -- lost focus to another app) must NOT clobber the pre-terminal cursor anchor.
   if (not isRunning) or isHidden or (not win) then
      saveCursorState()
   end

   if not kitty or not isRunning then
      logger("Kitty is not running, launching...")
      local launchSuccess, launchResult = pcall(function()
         return hs.application.open("kitty")
      end)
      if not launchSuccess then
         logger("✗ Failed to launch kitty: " .. tostring(launchResult))
         hs.alert("Failed to launch Kitty")
         return
      end
      waitForKittyWindow(function(w) activateWindow(w, token) end)
      return
   end

   if not win then
      logger("Kitty running but no window, creating new window...")
      local menuSuccess, menuError = pcall(function()
         kitty:selectMenuItem({"Shell", "New Window"})
      end)
      if not menuSuccess then
         logger("✗ Failed to create new window: " .. tostring(menuError))
         hs.alert("Failed to create Kitty window")
         return
      end
      waitForKittyWindow(function(w) activateWindow(w, token) end)
      return
   end

   -- Kitty is running with a window: show/raise/focus it.
   activateWindow(win, token)
end

-- dismiss: hide the kitty hot window. Deterministic and safe to call anytime,
-- even when kitty is already hidden or gone. Bumping the token cancels any
-- in-flight launch wait so it cannot re-raise kitty after we have hidden it.
local function terminalDismiss()
   logger("\n========== TERMINAL DISMISS ==========")
   bumpActivationToken()
   local kitty, isRunning, _, win = resolveKitty()
   if not isRunning then
      return
   end
   if win then
      -- Restore the cursor if it is still inside the kitty window.
      restoreCursorIfNeeded(win)
   end
   local hideSuccess, hideError = pcall(function()
      kitty:hide()
   end)
   if not hideSuccess then
      logger("✗ Failed to hide kitty: " .. tostring(hideError))
   end
end

-- Register with the coordinator so the terminal and the hot-corner panels share
-- one consistent on/off state machine.
OverlayCoordinator.register("terminal", {
   present = terminalPresent,
   dismiss = terminalDismiss,
   isFrontmost = terminalIsFrontmost,
})

-- DEPRECATED: cmd+space used to toggle this kitty hot window. That trigger now
-- drives Ghostty's native quick terminal
-- (keybind = global:cmd+space=toggle_quick_terminal in ~/.config/ghostty/config),
-- and this module is no longer imported from init.lua. The mechanism is kept so
-- it can be revived via OverlayCoordinator.toggle("terminal") or a new hotkey.

logger("✓ HotWindows loaded: registered with OverlayCoordinator, no key trigger bound")
