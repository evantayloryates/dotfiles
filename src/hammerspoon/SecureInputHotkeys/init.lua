-- Keeps cmd+space (Ghostty quick terminal) and ctrl+space (SkillPicker)
-- working while macOS Secure Input is on.
--
-- Secure Input (a focused password field, or an app that forgot to release it)
-- stops macOS delivering keystrokes to every event tap, and Ghostty's
-- global:cmd+space is an event tap. Karabiner reads the keyboard below that
-- layer, so a Karabiner rule takes over both shortcuts, but only while the
-- Karabiner variable `secure_input_fallback` is 1. This module flips that
-- variable when Secure Input changes. Normal presses never leave the native
-- path, so they gain no latency; the fallback costs about 60 ms.
local M={}

local KARABINER_CLI='/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli'
local VARIABLE='secure_input_fallback'
local POLL_SECONDS=0.2

local function setVariable(value,sync)
  local payload=hs.json.encode({[VARIABLE]=value})
  if sync then
    hs.execute(string.format('%q --set-variables %q',KARABINER_CLI,payload))
    return
  end
  hs.task.new(KARABINER_CLI,function(code,_,err)
    if code~=0 then
      M.state=nil -- retry on the next tick
      print('SecureInputHotkeys: karabiner_cli failed: '..tostring(err))
    end
  end,{'--set-variables',payload}):start()
end

local function tick()
  local secure=hs.eventtap.isSecureInputEnabled() and 1 or 0
  if secure~=M.state then
    M.state=secure
    setVariable(secure,false)
  end
end

-- Called by Karabiner's shell_command while Secure Input is on.
function M.fire(target)
  if target=='ghostty' then
    local ok=hs.osascript.applescript(
      'tell application "Ghostty" to perform action "toggle_quick_terminal" on terminal 1')
    if not ok then hs.application.launchOrFocus('Ghostty') end
  elseif target=='skillPicker' then
    require('SkillPicker').toggle()
  end
end

function M.stop()
  if M.timer then M.timer:stop(); M.timer=nil end
  -- Leave Karabiner on the native path when Hammerspoon is gone.
  setVariable(0,true)
  M.state=nil
end

M.state=nil
M.timer=hs.timer.doEvery(POLL_SECONDS,tick)
tick()

local previousShutdown=hs.shutdownCallback
hs.shutdownCallback=function() M.stop(); if previousShutdown then previousShutdown() end end

return M
