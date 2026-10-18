-- Dismiss delivered notifications through Notification Center's accessibility
-- actions. This leaves notification settings, scheduled notifications, and the
-- usernoted database alone.

on panelIsOpen()
    try
        tell application "System Events"
            tell process "NotificationCenter"
                if not (exists window "Notification Center") then return false
                set panel to first window whose name is "Notification Center"
                set scroller to UI element 1 of UI element 1 of UI element 1 of panel
                if value of attribute "AXRole" of scroller is not "AXScrollArea" then error "Notification Center layout changed."
                repeat with elementRef in UI elements of scroller
                    set elementIdentifier to missing value
                    try
                        set elementIdentifier to value of attribute "AXIdentifier" of elementRef
                    end try
                    -- A floating banner also owns a window named "Notification Center".
                    -- The widget controls are present only when its panel is open.
                    if elementIdentifier is "widget-editor-button" or elementIdentifier is "xmark" then return true
                end repeat
                return false
            end tell
        end tell
    on error errorMessage number errorNumber
        if errorNumber is -1728 or errorNumber is -1719 then return false
        error errorMessage number errorNumber
    end try
end panelIsOpen

on togglePanel()
    tell application "System Events"
        tell process "ControlCenter"
            click (first menu bar item of menu bar 1 whose description is "Clock")
        end tell
    end tell
end togglePanel

on ensurePanel()
    if panelIsOpen() then return
    togglePanel()
    repeat 20 times
        if panelIsOpen() then return
        delay 0.1
    end repeat
    error "Notification Center did not open."
end ensurePanel

on closePanel()
    -- A Clock click can be ignored while Notification Center is animating.
    -- Recheck its window before each attempt so a delayed close is not undone.
    repeat 3 times
        if not panelIsOpen() then return true
        togglePanel()
        repeat 20 times
            if not panelIsOpen() then return true
            delay 0.1
        end repeat
    end repeat
    return false
end closePanel

on notificationElements()
    tell application "System Events"
        tell process "NotificationCenter"
            if not (exists window "Notification Center") then return missing value
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
            -- A remaining alert may be promoted directly under the scroll area.
            -- Keep the widget provider and panel controls out of the search.
            if value of attribute "AXRole" of firstElement is "AXGroup" then return {firstElement}
            return {}
        end tell
    end tell
end notificationElements

on hasCloseAction(itemRef, shouldClose, depth)
    tell application "System Events"
        tell process "NotificationCenter"
            -- Snapshot actions before dismissal: their live collection changes
            -- while Notification Center removes an alert.
            set actionNames to (get name of every action of itemRef) as list
            repeat with actionText in actionNames
                set actionName to contents of actionText as text
                if actionName is "AXClose" or actionName starts with "Name:Close" then
                    if shouldClose then perform action actionName of itemRef
                    return true
                end if
            end repeat
            if depth is 0 then return false
            repeat with childRef in UI elements of itemRef
                if my hasCloseAction(childRef, shouldClose, depth - 1) then return true
            end repeat
            return false
        end tell
    end tell
end hasCloseAction

on hasClosableNotification(shouldClose)
    try
        set candidateElements to notificationElements()
        if candidateElements is missing value then return missing value
        tell application "System Events"
            tell process "NotificationCenter"
                repeat with itemRef in candidateElements
                    if my hasCloseAction(itemRef, shouldClose, 3) then return true
                end repeat
                return false
            end tell
        end tell
    on error errorMessage number errorNumber
        -- A dismissal may remove the window or invalidate an AX element
        -- between the snapshot and its next lookup. Reacquire the panel.
        if errorNumber is -1728 or errorNumber is -1719 then return missing value
        error errorMessage number errorNumber
    end try
end hasClosableNotification

on clearVisibleNotifications()
    set visibleCount to 0
    set emptyChecks to 0
    repeat 500 times
        if panelIsOpen() then exit repeat
        set didClose to hasClosableNotification(true)
        if didClose is missing value then exit repeat
        if didClose then
            set visibleCount to visibleCount + 1
            set emptyChecks to 0
            delay 0.05
        else
            set emptyChecks to emptyChecks + 1
            if emptyChecks is 2 then exit repeat
            delay 0.2
        end if
    end repeat
    return visibleCount
end clearVisibleNotifications

set clearedCount to 0
try
    -- Floating alerts on the primary display can be separate from the panel
    -- opened by the Clock on another display. Dismiss them where they appear.
    if not panelIsOpen() then set clearedCount to clearVisibleNotifications()
    ensurePanel()

    set transientFailures to 0
    set emptyChecks to 0
    repeat 500 times
        set didClose to hasClosableNotification(true)
        if didClose is missing value then
            set transientFailures to transientFailures + 1
            if transientFailures > 5 then error "Notification Center kept disappearing while clearing notifications."
            ensurePanel()
            delay 0.1
        else if didClose then
            set transientFailures to 0
            set emptyChecks to 0
            set clearedCount to clearedCount + 1
            delay 0.05
        else
            set transientFailures to 0
            set emptyChecks to emptyChecks + 1
            if emptyChecks is 2 then exit repeat
            delay 0.2
        end if
    end repeat
    set remaining to missing value
    repeat 5 times
        ensurePanel()
        set remaining to hasClosableNotification(false)
        if remaining is not missing value then exit repeat
        delay 0.1
    end repeat
    if remaining is missing value then error "Could not verify Notification Center after clearing notifications."
    if remaining then error "Notification Center kept receiving notifications; stopped after 500 dismissals."
on error errorMessage number errorNumber
    try
        closePanel()
    end try
    error errorMessage number errorNumber
end try

if not closePanel() then
    error "Cleared " & clearedCount & " notification(s), but Notification Center did not close."
end if
set clearedCount to clearedCount + clearVisibleNotifications()
if hasClosableNotification(false) is true then error "Notifications remained after clearing."
return "Cleared " & clearedCount & " notification(s)."
