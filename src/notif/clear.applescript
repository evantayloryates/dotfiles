-- Dismiss delivered notifications through Notification Center's accessibility
-- actions. This leaves notification settings, scheduled notifications, and the
-- usernoted database alone.

on panelIsOpen()
    tell application "System Events"
        tell process "NotificationCenter"
            return exists window "Notification Center"
        end tell
    end tell
end panelIsOpen

on togglePanel()
    tell application "System Events"
        tell process "ControlCenter"
            click (first menu bar item of menu bar 1 whose description is "Clock")
        end tell
    end tell
end togglePanel

on notificationList()
    tell application "System Events"
        tell process "NotificationCenter"
            set panel to first window whose name is "Notification Center"
            set listGroup to UI element 1 of UI element 1 of UI element 1 of UI element 1 of panel
            if value of attribute "AXIdentifier" of listGroup is not "AXNotificationListItems" then error "Notification Center layout changed."
            return listGroup
        end tell
    end tell
end notificationList

on closeOne()
    set listGroup to notificationList()
    tell application "System Events"
        tell process "NotificationCenter"
            set items to UI elements of listGroup
            if (count of items) is 0 then return false
            repeat with itemRef in items
                repeat with actionRef in actions of itemRef
                    set actionName to name of actionRef
                    if actionName is "AXClose" or actionName starts with "Name:Close" then
                        perform action actionName of itemRef
                        return true
                    end if
                end repeat
            end repeat
            error "Notification Center has items without a Close action."
        end tell
    end tell
end closeOne

on visibleItemCount()
    set listGroup to notificationList()
    tell application "System Events"
        tell process "NotificationCenter"
            return count of UI elements of listGroup
        end tell
    end tell
end visibleItemCount

set openedHere to false
set clearedCount to 0
try
    if not panelIsOpen() then
        togglePanel()
        set openedHere to true
        repeat 20 times
            if panelIsOpen() then exit repeat
            delay 0.1
        end repeat
        if not panelIsOpen() then error "Notification Center did not open."
    end if

    repeat 500 times
        if not closeOne() then
            -- Confirm after the dismissal animation before reporting success.
            delay 0.2
            if not closeOne() then exit repeat
        end if
        set clearedCount to clearedCount + 1
        delay 0.05
    end repeat
    if visibleItemCount() > 0 then error "Notification Center kept receiving notifications; stopped after 500 dismissals."
on error errorMessage number errorNumber
    if openedHere then
        try
            if panelIsOpen() then togglePanel()
        end try
    end if
    error errorMessage number errorNumber
end try

if openedHere and panelIsOpen() then togglePanel()
return "Cleared " & clearedCount & " notification(s)."
