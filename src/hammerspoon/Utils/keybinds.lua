
-- Reload Configuration (^⌘R) - pass through for Cursor + amplify workspace --
local reloadHotkey
reloadHotkey = hs.hotkey.bind({"cmd", "ctrl"}, "r", function()
  local frontApp = hs.application.frontmostApplication()
  local appName = frontApp and frontApp:name() or "unknown"
  local focusedWindow = hs.window.focusedWindow()
  local windowTitle = focusedWindow and focusedWindow:title() or ""

  local isCursor = appName == "Cursor"
  local isAmplifyWorkspace = windowTitle:find("Amplify") ~= nil

  print(string.format("[Reload Hotkey] App: %s, Window: %s", appName, windowTitle))
  print(string.format("[Reload Hotkey] isCursor: %s, isAmplifyWorkspace: %s", tostring(isCursor), tostring(isAmplifyWorkspace)))

  if isCursor and isAmplifyWorkspace then
    print("[Reload Hotkey] Passing through to Cursor")
    reloadHotkey:disable()
    hs.eventtap.keyStroke({"cmd", "ctrl"}, "r")
    reloadHotkey:enable()
  else
    print("[Reload Hotkey] Reloading Hammerspoon config")
    hs.reload()
  end
end)

-- Clear Console (^⌘K) - only when Hammerspoon is focused --
local clearConsoleHotkey
clearConsoleHotkey = hs.hotkey.bind({"cmd", "ctrl"}, "k", function()
  local frontApp = hs.application.frontmostApplication()
  if frontApp and frontApp:bundleID() == "org.hammerspoon.Hammerspoon" then
    hs.console.clearConsole()
  else
    -- Pass through to other apps
    clearConsoleHotkey:disable()
    hs.eventtap.keyStroke({"cmd", "ctrl"}, "k")
    clearConsoleHotkey:enable()
  end
end)

-- -- Toggle Debug View (^⌘H) --
-- hs.hotkey.bind({"cmd", "ctrl"}, "h", function ()
--   if c and c:isShowing() then
--     c:hide()
--   elseif c then
--     c:show()
--   end
-- end)

-- Manually trigger CamCheck cycle (^⌘H) - for debugging --
hs.hotkey.bind({"cmd", "ctrl"}, "h", function()
  local CamCheck = require("CamCheck")
  if CamCheck and CamCheck.checkNow then
    print("[Keybind] Manually triggering CamCheck cycle")
    CamCheck.checkNow()
  else
    print("[Keybind] CamCheck module not available")
  end
end)

-- -- Toggle Console (^⌘C) - pass through for Finder with selection --
-- local toggleConsoleHotkey
-- toggleConsoleHotkey = hs.hotkey.bind({"cmd", "ctrl"}, "c", function()
--   local frontApp = hs.application.frontmostApplication()
--   local appName = frontApp and frontApp:name() or "unknown"
--
--   print(string.format("[Toggle Console] App: %s", appName))
--
--   if appName == "Finder" then
--     -- Check if any files are selected
--     local _, selectionCount = hs.osascript.applescript([[
--       tell application "Finder"
--         return count of (selection as alias list)
--       end tell
--     ]])
--
--     print(string.format("[Toggle Console] Finder selection count: %s", tostring(selectionCount)))
--
--     if selectionCount and selectionCount > 0 then
--       print("[Toggle Console] Passing through to Finder")
--       toggleConsoleHotkey:disable()
--       hs.eventtap.keyStroke({"cmd", "ctrl"}, "c")
--       toggleConsoleHotkey:enable()
--     else
--       print("[Toggle Console] No selection, toggling console")
--       hs.toggleConsole()
--     end
--   else
--     print("[Toggle Console] Toggling console")
--     hs.toggleConsole()
--   end
-- end)

-- Capture 500x500 screenshot centered on cursor (^⌘⇧4) --
hs.hotkey.bind({"cmd", "ctrl", "shift"}, "4", function()
  local CursorScreenshot = require("CursorScreenshot")
  if CursorScreenshot and CursorScreenshot.capture then
    CursorScreenshot.capture()
  else
    print("[Keybind] CursorScreenshot module not available")
  end
end)

-- Toggle FocusFollowsMouse logging (^⌘J) --
hs.hotkey.bind({"cmd", "ctrl"}, "j", function()
  local FocusFollowsMouse = require("FocusFollowsMouse")
  if FocusFollowsMouse and FocusFollowsMouse.toggleLogging then
    FocusFollowsMouse.toggleLogging()
  else
    print("[Keybind] FocusFollowsMouse module not available")
  end
end)
