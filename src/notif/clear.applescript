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

on notificationElements()
    tell application "System Events"
        tell process "NotificationCenter"
            if not (exists window "Notification Center") then return {}
            set panel to first window whose name is "Notification Center"
            set scroller to UI element 1 of UI element 1 of UI element 1 of panel
            if value of attribute "AXRole" of scroller is not "AXScrollArea" then error "Notification Center layout changed."
            if (count of UI elements of scroller) is 0 then return {}
            set firstElement to UI element 1 of scroller
            set firstIdentifier to missing value
            try
                set firstIdentifier to value of attribute "AXIdentifier" of firstElement
            end try
            if firstIdentifier is "AXNotificationListItems" then
                return UI elements of firstElement
            end if
            -- With one alert left, macOS promotes it directly under the scroll
            -- area instead of wrapping it in AXNotificationListItems.
            return UI elements of scroller
        end tell
    end tell
end notificationElements

on hasClosableNotification(shouldClose)
    set candidateElements to notificationElements()
    tell application "System Events"
        tell process "NotificationCenter"
            repeat with itemRef in candidateElements
                -- Snapshot values before iterating: System Events' live action
                -- collection can change while a notification is animating out.
                set actionNames to (get name of every action of itemRef) as list
                repeat with actionText in actionNames
                    set actionName to contents of actionText as text
                    if actionName is "AXClose" or actionName starts with "Name:Close" then
                        if shouldClose then perform action actionName of itemRef
                        return true
                    end if
                end repeat
            end repeat
            return false
        end tell
    end tell
end hasClosableNotification

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
        if not hasClosableNotification(true) then
            -- Confirm after the dismissal animation before reporting success.
            delay 0.2
            if not hasClosableNotification(true) then exit repeat
        end if
        set clearedCount to clearedCount + 1
        delay 0.05
    end repeat
    if hasClosableNotification(false) then error "Notification Center kept receiving notifications; stopped after 500 dismissals."
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
