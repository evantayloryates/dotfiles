-- Warm native glass popup; Hammerspoon owns only the shortcut and local bridge.
local root = hs.configdir .. '/SkillPicker/'
if SkillPicker and SkillPicker.destroy then SkillPicker.destroy() end
local M = {visible=false, helperReady=false, workerReady=false, byID={}, metrics={}}
SkillPicker=M
local log=hs.logger.new('SkillPicker','warning')
local coordinator=OverlayCoordinator
local python=hs.fs.attributes('/opt/homebrew/bin/python3') and '/opt/homebrew/bin/python3' or '/usr/bin/python3'
local function send(task,value)
  if task and task:isRunning() then task:setInput(hs.json.encode(value) .. '\n'); return true end
  return false
end
local function stream(callback)
  local buffer=''
  return function(_,out)
    buffer=buffer .. (out or '')
    while buffer:find('\n',1,true) do
      local line; line,buffer=buffer:match('^(.-)\n(.*)$')
      local ok,value=pcall(hs.json.decode,line)
      if ok and type(value)=='table' then callback(value) end
    end
    return true
  end
end
local function dispatchPending()
  if M.workerReady and not M.inflight and M.pending and M.visible then
    local request=M.pending; M.pending=nil; M.inflight=request
    if not send(M.worker,request) then M.inflight=nil; M.workerReady=false end
  end
end
local function receiveInventory(data)
  if data.action=='ready' then
    M.workerReady=true; M.inventoryCount=data.count; M.sourceCounts=data.source_counts
    dispatchPending(); return
  end
  local request=M.inflight
  if not request or request.id~=data.id then return end
  M.inflight=nil
  if M.visible and M.latestID==data.id then
    M.byID={}
    for _,skill in ipairs(data.skills or {}) do M.byID[skill.id]=skill end
    M.confirmedID=data.id
    M.inventoryCount=data.count; M.sourceCounts=data.source_counts
    M.metrics.refresh_ms=data.elapsed_ms
    M.metrics.reloads=data.reloads
    send(M.helper,{action='results',id=data.id,skills=data.skills or {},error=data.error==true})
  end
  dispatchPending()
end
function M.select(data)
  if not M.visible or data.id~=M.confirmedID or data.id~=M.latestID then return false end
  local skill=M.byID[data.skill_id]
  if not skill or skill.name~=data.name or skill.path~=data.path then return false end
  for _,source in ipairs(skill.sources or {}) do
    if not hs.fs.attributes(source.path) then return false end
  end
  local duplicates=0
  for _,s in pairs(M.byID) do if s.name==skill.name then duplicates=duplicates+1 end end
  -- Copy the invocation itself; spacing belongs to the destination message.
  local reference='/' .. skill.name
  if skill.ambiguous or duplicates>1 then
    local attributed={}
    for _,source in ipairs(skill.sources or {}) do
      local quoted=hs.json.encode({source.path}):sub(2,-2):gsub('\\/','/')
      table.insert(attributed,source.harness .. ': ' .. quoted)
    end
    reference='Use the skill for the current harness (' .. table.concat(attributed,'; ') .. ') for this request: '
  end
  if not hs.pasteboard.setContents(reference) then return false end
  M.lastSelection={name=skill.name,path=skill.path}
  return true
end
local function receivePopup(data)
  if data.action=='ready' then
    M.helperReady=true
    M.reduceTransparency=data.reduce_transparency
    if M.queuedOpen then send(M.helper,M.queuedOpen); M.queuedOpen=nil end
  elseif data.action=='refresh' and M.visible and type(data.id)=='number' and type(data.query)=='string' then
    -- A stopped reader recovers on the next open-window cadence.
    M.start()
    M.latestID=data.id; M.pending={action='refresh',id=data.id,query=data.query}
    M.confirmedID=nil; dispatchPending()
  elseif data.action=='select' then M.select(data)
  elseif data.action=='closed' then
    M.visible=false; M.pending=nil; M.confirmedID=nil
    if M.restoreOnClose and (data.reason=='escape' or data.reason=='shortcut' or data.reason=='selection') and M.origin then
      pcall(function() M.origin:focus() end)
    end
    M.lastClose={reason=data.reason}
  elseif data.action=='shown' then
    M.metrics.first_paint_ms=data.first_paint_ms
    M.metrics.bridge_open_ms=(hs.timer.absoluteTime()-M.startedAt)/1000000
  elseif data.action=='painted' then
    if data.first_results_ms then M.metrics.results_open_ms=data.first_results_ms end
    M.metrics.refresh_paint_ms=data.refresh_paint_ms
    M.metrics.ui_changed=data.ui_changed
    M.metrics.table_reloads=data.table_reloads
    M.metrics.quiet_completions=data.quiet_completions
  end
end
function M.start()
  if not M.helper or not M.helper:isRunning() then
    M.helperReady=false
    M.helper=hs.task.new(root .. 'SkillPicker.app/Contents/MacOS/SkillPicker',function()
      M.helperReady=false; M.visible=false; M.queuedOpen=nil
    end,stream(receivePopup),{})
    local environment=M.helper:environment()
    environment.__CFBundleIdentifier=nil
    M.helper:setEnvironment(environment)
    M.helper:start()
  end
  if not M.worker or not M.worker:isRunning() then
    M.workerReady=false; M.inflight=nil
    M.worker=hs.task.new(python,function()
      M.workerReady=false; M.inflight=nil
      if M.visible then send(M.helper,{action='results',id=M.latestID,error=true,skills={}}) end
    end,stream(receiveInventory),{root .. 'catalog_service.py'}):start()
  end
end
function M.present()
  if hs.eventtap.isSecureInputEnabled() then return end
  M.start()
  M.origin=hs.window.frontmostWindow()
  -- One cursor sample at invocation; never reposition this opening afterwards.
  local screen=hs.mouse.getCurrentScreen() or hs.screen.mainScreen()
  local f=screen:frame()
  local w,h=math.min(396,f.w-40),math.min(420,f.h-80)
  M.targetScreen=screen:name()
  M.visible=true; M.restoreOnClose=true; M.startedAt=hs.timer.absoluteTime()
  local frame={x=f.x+(f.w-w)/2,y=f.y+math.max(24,(f.h-h)/3),w=w,h=h}
  local command={action='show',frame=frame}
  if M.helperReady then send(M.helper,command) else M.queuedOpen=command end
end
function M.dismiss(restore)
  M.restoreOnClose=restore
  M.queuedOpen=nil
  send(M.helper,{action='hide',reason=restore and 'shortcut' or 'coordinator'})
end
function M.toggle()
  if M.visible then M.dismiss(true)
  elseif coordinator then coordinator.toggle('skillPicker')
  else M.present() end
end
function M.destroy(shuttingDown)
  M.visible=false; M.pending=nil
  -- hs.hotkey:delete() logs through hs.ipc's console mirror. During full
  -- Lua teardown, that can touch a CLI port already being disposed (the
  -- CFMessagePortSendRequest crash in the 2026-10-01 report). Hammerspoon
  -- disposes native hotkeys itself when replacing the Lua state. Only an
  -- in-place module replacement needs an explicit, logging deletion here.
  if M.hotkey then
    if not shuttingDown then M.hotkey:delete() end
    M.hotkey=nil
  end
  for _,task in ipairs({M.helper,M.worker}) do
    -- EOF lets the reader release its native child and the panel leave AppKit
    -- cleanly. Both helpers have private process groups; no other app is touched.
    if task and task:isRunning() then task:closeInput() end
  end
  M.helper=nil; M.worker=nil
end
if coordinator then coordinator.register('skillPicker',{
  present=M.present,dismiss=function() M.dismiss(false) end,isFrontmost=function() return M.visible end,
}) end
-- No message argument: hs.hotkey otherwise displays the unwanted shortcut pill.
M.hotkey=hs.hotkey.bind({'ctrl'},'space',M.toggle)
local previousShutdown=hs.shutdownCallback
hs.shutdownCallback=function() M.destroy(true); if previousShutdown then previousShutdown() end end
M.start()
return M
