-- Dismiss only floating alerts currently shown on the display. Opening the
-- Notification Center panel would also expose older delivered notifications.

on panelIsOpen()
    try
        tell application "System Events"
            tell process "NotificationCenter"
                if not (exists window "Notification Center") then return false
                set panel to first window whose name is "Notification Center"
                set scroller to UI element 1 of UI element 1 of UI element 1 of panel
                if value of attribute "AXRole" of scroller is not "AXScrollArea" then return false
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

on notificationElements()
    tell application "System Events"
        tell process "NotificationCenter"
            if not (exists window "Notification Center") then return {}
            set panel to first window whose name is "Notification Center"
            set scroller to UI element 1 of UI element 1 of UI element 1 of panel
            if value of attribute "AXRole" of scroller is not "AXScrollArea" then return missing value
            if (count of UI elements of scroller) is 0 then return {}
            set firstElement to UI element 1 of scroller
            set firstIdentifier to missing value
            try
                set firstIdentifier to value of attribute "AXIdentifier" of firstElement
            end try
            if firstIdentifier is "AXNotificationListItems" then
                return UI elements of firstElement
            end if
            -- Remaining alerts can be promoted directly under the scroll area.
            if value of attribute "AXRole" of firstElement is "AXGroup" then return UI elements of scroller
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

on visibleNotificationIDs()
    try
        set candidateElements to notificationElements()
        if candidateElements is missing value then return missing value
        if (count of candidateElements) is 0 then return {}
        set notificationIDs to {}
        tell application "System Events"
            tell process "NotificationCenter"
                set notificationWindow to first window whose name is "Notification Center"
                set windowPosition to position of notificationWindow
                set windowSize to size of notificationWindow
                set windowLeft to item 1 of windowPosition
                set windowTop to item 2 of windowPosition
                set windowRight to windowLeft + (item 1 of windowSize)
                set windowBottom to windowTop + (item 2 of windowSize)
                repeat with itemRef in candidateElements
                    if my hasCloseAction(itemRef, false, 3) then
                        set elementPosition to position of itemRef
                        set elementSize to size of itemRef
                        set elementLeft to item 1 of elementPosition
                        set elementTop to item 2 of elementPosition
                        set elementRight to elementLeft + (item 1 of elementSize)
                        set elementBottom to elementTop + (item 2 of elementSize)
                        if elementLeft >= windowLeft and elementTop >= windowTop and elementRight <= windowRight and elementBottom <= windowBottom then
                            set elementID to value of attribute "AXIdentifier" of itemRef
                            if elementID is missing value then error "A visible notification has no stable identifier."
                            set end of notificationIDs to elementID as text
                        end if
                    end if
                end repeat
                return notificationIDs
            end tell
        end tell
    on error errorMessage number errorNumber
        if errorNumber is -1728 or errorNumber is -1719 then return missing value
        error errorMessage number errorNumber
    end try
end visibleNotificationIDs

on notificationWithID(targetID, shouldClose)
    try
        set candidateElements to notificationElements()
        if candidateElements is missing value then return missing value
        tell application "System Events"
            tell process "NotificationCenter"
                repeat with itemRef in candidateElements
                    set elementID to value of attribute "AXIdentifier" of itemRef
                    if elementID as text is targetID then
                        if shouldClose then return my hasCloseAction(itemRef, true, 3)
                        return true
                    end if
                end repeat
                return false
            end tell
        end tell
    on error errorMessage number errorNumber
        if errorNumber is -1728 or errorNumber is -1719 then return missing value
        error errorMessage number errorNumber
    end try
end notificationWithID

if panelIsOpen() then error "Close Notification Center before clearing on-screen alerts."
set initialIDs to missing value
repeat 5 times
    set initialIDs to visibleNotificationIDs()
    if initialIDs is not missing value then exit repeat
    delay 0.1
end repeat
if initialIDs is missing value then error "Could not inspect on-screen notifications."
set clearedCount to 0
repeat with targetID in initialIDs
    set closedByUs to false
    set stillPresent to missing value
    repeat 8 times
        if panelIsOpen() then error "Notification Center opened while clearing on-screen alerts."
        set stillPresent to notificationWithID(contents of targetID as text, false)
        if stillPresent is false then exit repeat
        if stillPresent is true then
            set didClose to notificationWithID(contents of targetID as text, true)
            if didClose is true then set closedByUs to true
        end if
        delay 0.2
    end repeat
    if stillPresent is not false then set stillPresent to notificationWithID(contents of targetID as text, false)
    if stillPresent is not false then error "An initially visible notification remained after clearing."
    if closedByUs then set clearedCount to clearedCount + 1
end repeat
return "Cleared " & clearedCount & " on-screen notification(s)."
