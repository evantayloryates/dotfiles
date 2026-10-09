WIDTH_RATIO = 1.0
HEIGHT_RATIO = 1.0

-- Logging configuration
local LOGGING_ENABLED = false

-- Logger function that wraps print() and only logs if LOGGING_ENABLED is true
local function logger(...)
   if LOGGING_ENABLED then
      print(...)
   end
end

-- Disable all window animations in Hammerspoon
hs.window.animationDuration = 0

-- Function to find the built-in Retina display
local function getRetinaDisplay()
   local allScreens = hs.screen.allScreens()
   logger(string.format("=== HotWindow: Finding Retina display from %d screens ===", #allScreens))

   -- Find the built-in Retina display by name
   for i, screen in ipairs(allScreens) do
      local name = screen:name()
      local frame = screen:frame()

      logger(string.format("Screen %d: %s (x=%d, y=%d, w=%d, h=%d)",
            i, name or "nil", frame.x, frame.y, frame.w, frame.h))

      -- Check if this is the built-in Retina display by name
      if name and string.find(name:lower(), "retina") then
         logger("  -> Found built-in Retina display!")
         return screen
      end
   end

   -- Fallback to main screen if Retina not found
   logger("No Retina display found, using main screen")
   return hs.screen.mainScreen()
end

HotWindow = {
   targetFrame = nil,
   activeWindow = nil,
   targetScreen = nil
}

function HotWindow:new (o, screen, frame)
   o = o or {}
   setmetatable(o, self)
   self.__index = self
   self.targetScreen = screen or getRetinaDisplay()
   self.targetFrame = frame or getTargetFrame(self.targetScreen)
   self.activeWindow = nil
   -- Removed slow windowFilter - using hs.window.focusedWindow() instead
   -- self.windowFilter = self.windowFilter:rejectApp("Hammerspoon")
   return o
end

function HotWindow:setActiveWindow(window)
   self._currentTimingStart = hs.timer.secondsSinceEpoch()
   logger("\n---------- setActiveWindow START ----------")

   if not window then
      hs.alert("No active window")
   end

   logger("WINDOW: " .. window:title() .. "")

   sameWindow = self.activeWindow == window

   if self.activeWindow then
      sameApp = (self.activeWindow and self.activeWindow:application() == window:application())
   end

   logger("sameWindow", sameWindow)
   logger("sameApp", sameApp)

   -- Track if the app was hidden (for cursor movement decision later)
   local app = window:application()
   local wasHidden = app and app:isHidden()
   logger("wasHidden", wasHidden)

   -- Keep target screen fixed (no dynamic update) - always use primary/Retina display
   -- Target screen is set during initialization and never changes

   -- Move window to current active space before focusing
   logger("=== SPACE MANAGEMENT START ===")
   local t1 = hs.timer.secondsSinceEpoch()
   local success, currentSpace = pcall(function()
      return hs.spaces.activeSpaceOnScreen(self.targetScreen)
   end)
   logger(string.format("[TIMING] hs.spaces.activeSpaceOnScreen: %.3fs", hs.timer.secondsSinceEpoch() - t1))

   if success and currentSpace then
      logger("Current active space: " .. tostring(currentSpace))
      logger("Target screen: " .. tostring(self.targetScreen:name()))

      -- Get all spaces for this window
      local t2 = hs.timer.secondsSinceEpoch()
      local windowSpaces = hs.spaces.windowSpaces(window)
      logger(string.format("[TIMING] hs.spaces.windowSpaces: %.3fs", hs.timer.secondsSinceEpoch() - t2))
      if windowSpaces and #windowSpaces > 0 then
         logger("Window is currently in space(s): " .. table.concat(windowSpaces, ", "))

         -- Check if window is already in current space
         local alreadyInSpace = false
         for _, spaceId in ipairs(windowSpaces) do
            if spaceId == currentSpace then
               alreadyInSpace = true
               break
            end
         end

         if not alreadyInSpace then
            logger("*** WINDOW IS IN DIFFERENT SPACE ***")
            logger("Current window space(s): " .. table.concat(windowSpaces, ", "))
            logger("Current active space: " .. tostring(currentSpace))

            -- SOLUTION: Make kitty window available on ALL spaces (like "All Desktops")
            -- This way it's always accessible no matter what space you're on

            -- Unhide the application first if needed
            local app = window:application()
            if app:isHidden() then
               logger("Unhiding application first...")
               app:unhide()
            end

            -- Make window available on all spaces
            self:makeWindowAvailableOnAllSpaces(window)

            -- Continue with normal activation immediately
            self:finishActivatingWindow(window, sameApp, sameWindow, nil, wasHidden)
            return
         else
            logger("Window already in current space - no move needed")
         end
      end
   else
      logger("ERROR getting current space: " .. tostring(currentSpace))
      logger("NOTE: The hs.spaces API requires macOS accessibility permissions")
   end

   logger("=== SPACE MANAGEMENT END (no move needed) ===")

   -- If we didn't move spaces, proceed immediately
   self:finishActivatingWindow(window, sameApp, sameWindow, nil, wasHidden)
end

function HotWindow:makeWindowAvailableOnAllSpaces(window)
   local funcStart = hs.timer.secondsSinceEpoch()
   logger("=== MAKING WINDOW AVAILABLE ON ALL SPACES ===")

   local windowId = window:id()
   logger("Window ID: " .. tostring(windowId))

   -- Get all spaces on the target screen
   local t1 = hs.timer.secondsSinceEpoch()
   local screenSpaces = hs.spaces.spacesForScreen(self.targetScreen)
   logger(string.format("[TIMING] hs.spaces.spacesForScreen: %.3fs", hs.timer.secondsSinceEpoch() - t1))
   logger("All spaces on target screen: " .. table.concat(screenSpaces or {}, ", "))
   logger("Total spaces: " .. tostring(#screenSpaces))

   -- Move the window to ALL spaces
   logger("Adding window to all spaces...")
   local successCount = 0
   local totalMoveTime = 0
   for i, spaceId in ipairs(screenSpaces) do
      local t2 = hs.timer.secondsSinceEpoch()
      local success = pcall(function()
         hs.spaces.moveWindowToSpace(windowId, spaceId)
      end)
      local moveTime = hs.timer.secondsSinceEpoch() - t2
      totalMoveTime = totalMoveTime + moveTime
      logger(string.format("[TIMING] moveWindowToSpace (space %d/%d): %.3fs", i, #screenSpaces, moveTime))
      if success then
         successCount = successCount + 1
      end
   end
   logger(string.format("[TIMING] Total moveWindowToSpace loop: %.3fs", totalMoveTime))
   logger("Successfully added to " .. tostring(successCount) .. " spaces")

   -- Verify immediately (spaces API should be synchronous)
   local t3 = hs.timer.secondsSinceEpoch()
   local windowSpaces = hs.spaces.windowSpaces(window)
   logger(string.format("[TIMING] hs.spaces.windowSpaces (verify): %.3fs", hs.timer.secondsSinceEpoch() - t3))
   logger("VERIFICATION: Window is now in spaces: " .. table.concat(windowSpaces or {}, ", "))
   logger("Window should now be available on all desktops")
   logger(string.format("[TIMING] TOTAL makeWindowAvailableOnAllSpaces: %.3fs", hs.timer.secondsSinceEpoch() - funcStart))
end

function HotWindow:finishActivatingWindow(window, sameApp, sameWindow, currentSpace, wasHidden)
   local funcStart = hs.timer.secondsSinceEpoch()
   logger("=== FINISH ACTIVATING WINDOW START ===")
   logger("Window: " .. window:title())
   logger("Current space param: " .. tostring(currentSpace))

   -- Unhide the application first if it's hidden (critical for showing the window)
   local app = window:application()
   if app and app:isHidden() then
      logger("Application is hidden, unhiding it now...")
      app:unhide()
   end

   -- Check if window is on correct screen
   local tScreen = hs.timer.secondsSinceEpoch()
   windowIsOnCorrectScreen = (window:screen() == self.targetScreen)
   logger(string.format("[TIMING] window:screen() check: %.3fs", hs.timer.secondsSinceEpoch() - tScreen))

   -- Check if window is focused (scope: app)
   local tAppFocus = hs.timer.secondsSinceEpoch()
   windowIsAppFocused = (window:application():focusedWindow() == window)
   logger(string.format("[TIMING] app:focusedWindow() check: %.3fs", hs.timer.secondsSinceEpoch() - tAppFocus))

   -- Check if window is focused (scope: system) - using direct API instead of slow windowFilter
   local tSysFocus = hs.timer.secondsSinceEpoch()
   windowIsSystemFocused = (hs.window.focusedWindow() == window)
   logger(string.format("[TIMING] hs.window.focusedWindow() check: %.3fs", hs.timer.secondsSinceEpoch() - tSysFocus))

   -- Check that window is sized correctly
   local tFrame = hs.timer.secondsSinceEpoch()
   windowHasCorrectFrame = (window:frame() == self.targetFrame)
   logger(string.format("[TIMING] window:frame() check: %.3fs", hs.timer.secondsSinceEpoch() - tFrame))

   -- Check if window is minimized
   local tMin = hs.timer.secondsSinceEpoch()
   windowIsMinimized = false
   if window:isMinimized() then windowIsMinimized = true end
   logger(string.format("[TIMING] window:isMinimized() check: %.3fs", hs.timer.secondsSinceEpoch() - tMin))

   s = "\n"
   s = s .. "    Correct Screen      : " .. tostring(windowIsOnCorrectScreen) .. "\n"
   s = s .. "    App Focused         : " .. tostring(windowIsAppFocused) .. "\n"
   s = s .. "    System Focused      : " .. tostring(windowIsSystemFocused) .. "\n"
   s = s .. "    Correct Size        : " .. tostring(windowHasCorrectFrame) .. "\n"
   s = s .. "    Window is Minimized : " .. tostring(windowIsMinimized) .. "\n"

   logger(s)

   -- Set frame with 0 duration - force immediate positioning
   logger("Setting window frame...")
   local t1 = hs.timer.secondsSinceEpoch()
   window:setFrame(self.targetFrame, 0)
   logger(string.format("[TIMING] window:setFrame: %.3fs", hs.timer.secondsSinceEpoch() - t1))
   logger("Window frame set")

   if not windowIsSystemFocused then
      logger("Window is not system focused, focusing it now...")
      local t2 = hs.timer.secondsSinceEpoch()
      logger("Calling window:raise()...")
      window:raise()
      logger(string.format("[TIMING] window:raise: %.3fs", hs.timer.secondsSinceEpoch() - t2))
      local t3 = hs.timer.secondsSinceEpoch()
      logger("Calling window:focus()...")
      window:focus()
      logger(string.format("[TIMING] window:focus: %.3fs", hs.timer.secondsSinceEpoch() - t3))

      -- Single aggressive retry for focus if needed (0.05s interval, max 5 attempts = 0.25s total)
      -- Bail out if the window's app has since been hidden (e.g. the overlay
      -- coordinator handed the screen off to another overlay and dismissed kitty):
      -- re-focusing here would resurrect a window we deliberately hid.
      local retryCount = 0
      hs.timer.doUntil(
         function()
            retryCount = retryCount + 1
            local app = window:application()
            local appHidden = app and app:isHidden()
            return (hs.window.focusedWindow() == window) or retryCount >= 5 or appHidden
         end,
         function()
            local app = window:application()
            if app and app:isHidden() then
               return
            end
            logger("Focusing Again: ", window:title())
            window:focus()
         end,
         0.05
      )
   end

   -- If window is minimized, unminimize it immediately
   if windowIsMinimized then
      window:unminimize()
   end

   -- Hide old active window if it's not part of the same app
   if self.activeWindow and not sameApp then
      logger("Hiding old active window (different app)")
      local oldApp = self.activeWindow:application()
      if oldApp then
         oldApp:hide()
      else
         logger("Old window's application no longer exists (already quit)")
      end
   end

   -- Set new activeWindow
   logger("Setting new activeWindow: " .. window:title())
   self.activeWindow = window

   -- Only move cursor to primary screen when window was previously hidden (off → on)
   -- AND cursor is not already on the primary screen
   if wasHidden then
      local currentCursorScreen = hs.mouse.getCurrentScreen()
      local cursorAlreadyOnTargetScreen = (currentCursorScreen == self.targetScreen)

      if cursorAlreadyOnTargetScreen then
         logger("Cursor already on primary screen, not moving")
      else
         local screenFrame = self.targetScreen:frame()
         local centerX = screenFrame.x + (screenFrame.w / 2)
         local centerY = screenFrame.y + (screenFrame.h / 2)
         hs.mouse.absolutePosition({x = centerX, y = centerY})
         logger(string.format("Cursor moved to primary screen center: (%.0f, %.0f)", centerX, centerY))
      end
   else
      logger("Window was already visible, cursor not moved")
   end

   logger(string.format("[TIMING] TOTAL finishActivatingWindow: %.3fs", hs.timer.secondsSinceEpoch() - funcStart))
   if self._currentTimingStart then
      logger(string.format("[TIMING] TOTAL setActiveWindow: %.3fs", hs.timer.secondsSinceEpoch() - self._currentTimingStart))
   end
   logger("---------- setActiveWindow END ----------")

end

function getTargetFrame(screen)
   sf = screen:frame()
   tw = sf.w * WIDTH_RATIO
   th = sf.h * HEIGHT_RATIO

   xOff = (sf.w/2)-(tw/2);
   yOff = (sf.h/2)-(th/2);

   tx = sf.x + xOff
   ty = sf.y + yOff
   return hs.geometry.new(tx, ty, tw, th)
end
