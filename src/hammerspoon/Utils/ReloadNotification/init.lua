-- Simple reload notification panel
-- Shows "Hammerspoon Reloaded" in top left corner for 3 seconds

-- ============================================================
-- STYLING CONFIGURATION
-- ============================================================

-- Window Size
local WINDOW_WIDTH = "auto"  -- Set to "auto" to fit text, or a number for fixed width
local WINDOW_HEIGHT = "auto"  -- Set to "auto" to fit text, or a number for fixed height

-- Window Position
-- Options: "topLeft", "topRight", "bottomLeft", "bottomRight", "center"
local POSITION = "topLeft"
local POSITION_OFFSET_X = 20  -- Offset from edge (positive = right/inward)
local POSITION_OFFSET_Y = 20  -- Offset from edge (positive = down/inward)

-- Background Styling
local BG_COLOR = '#FFFFFF'
local BG_ALPHA = 0.7
local BORDER_RADIUS_X = 8
local BORDER_RADIUS_Y = 8

-- Text Styling
local TEXT_MESSAGE = 'Hammerspoon Reloaded'
local TEXT_COLOR = '#000000'
local TEXT_FONT = 'HelveticaNeue'
local TEXT_SIZE = 16
local TEXT_ALIGNMENT = 'center'  -- Options: 'left', 'center', 'right'
local TEXT_VERTICAL_ALIGNMENT = 'center'  -- Options: 'top', 'center', 'bottom'
local TEXT_VERTICAL_OFFSET = 3  -- Vertical offset from calculated position (positive = down, negative = up)
local TEXT_PADDING_TOP = 5  -- Used for 'top' and 'bottom' alignment modes
local TEXT_PADDING_BOTTOM = TEXT_PADDING_TOP  -- Used for 'top' and 'bottom' alignment modes
local TEXT_PADDING_LEFT = 13
local TEXT_PADDING_RIGHT = TEXT_PADDING_LEFT

-- Display Duration
local DISPLAY_DURATION = 3  -- seconds

-- Screen Target
-- Set to true to prefer built-in Retina display, false to use main screen
local PREFER_BUILTIN_SCREEN = true

-- ============================================================

-- Store canvas and timer at module level for proper cleanup
local activeCanvas = nil
local activeTimer = nil

local function showReloadNotification()
    -- Clean up any existing notification first
    if activeTimer then
        activeTimer:stop()
        activeTimer = nil
    end
    if activeCanvas then
        activeCanvas:delete()
        activeCanvas = nil
    end

    -- Select target screen
    local targetScreen
    if PREFER_BUILTIN_SCREEN then
        print("=== ReloadNotification: Checking screens ===")
        local allScreens = hs.screen.allScreens()
        print(string.format("Total screens found: %d", #allScreens))

        -- Find the built-in MacBook display
        local builtInScreen = nil
        for i, screen in ipairs(allScreens) do
            local info = screen:getInfo()
            local name = screen:name()
            local frame = screen:frame()

            print(string.format("Screen %d:", i))
            print(string.format("  Name: %s", name or "nil"))
            print(string.format("  Frame: x=%d, y=%d, w=%d, h=%d", frame.x, frame.y, frame.w, frame.h))

            -- Check if this is the built-in Retina display by name
            if name and string.find(name:lower(), "retina") then
                builtInScreen = screen
                print("  -> This is the built-in Retina display!")
            end

            if info then
                print(string.format("  Info available: builtIn=%s", tostring(info.builtIn)))
            else
                print("  Info: nil")
            end
        end

        -- Fallback to main screen if built-in not found
        targetScreen = builtInScreen or hs.screen.mainScreen()
        if not builtInScreen then
            print("No built-in screen found, using main screen")
        end
        print("===========================================")
    else
        targetScreen = hs.screen.mainScreen()
    end

    local sRect = targetScreen:frame()

    -- Calculate window dimensions
    local windowWidth, windowHeight

    -- Create styled text to measure its size (if needed for auto sizing)
    local textSize
    if WINDOW_WIDTH == "auto" or WINDOW_HEIGHT == "auto" then
        local styledText = hs.styledtext.new(TEXT_MESSAGE, {
            font = {
                name = TEXT_FONT,
                size = TEXT_SIZE
            }
        })
        textSize = hs.drawing.getTextDrawingSize(styledText)
    end

    if WINDOW_WIDTH == "auto" then
        windowWidth = textSize.w + TEXT_PADDING_LEFT + TEXT_PADDING_RIGHT
    else
        windowWidth = WINDOW_WIDTH
    end

    if WINDOW_HEIGHT == "auto" then
        windowHeight = textSize.h + TEXT_PADDING_TOP + TEXT_PADDING_BOTTOM
    else
        windowHeight = WINDOW_HEIGHT
    end

    local windowSize = {
        w = windowWidth,
        h = windowHeight,
    }

    -- Calculate position based on POSITION setting
    local x, y
    if POSITION == "topLeft" then
        x = sRect.x + POSITION_OFFSET_X
        y = sRect.y + POSITION_OFFSET_Y
    elseif POSITION == "topRight" then
        x = sRect.x + sRect.w - windowSize.w - POSITION_OFFSET_X
        y = sRect.y + POSITION_OFFSET_Y
    elseif POSITION == "bottomLeft" then
        x = sRect.x + POSITION_OFFSET_X
        y = sRect.y + sRect.h - windowSize.h - POSITION_OFFSET_Y
    elseif POSITION == "bottomRight" then
        x = sRect.x + sRect.w - windowSize.w - POSITION_OFFSET_X
        y = sRect.y + sRect.h - windowSize.h - POSITION_OFFSET_Y
    elseif POSITION == "center" then
        x = sRect.x + (sRect.w - windowSize.w) / 2 + POSITION_OFFSET_X
        y = sRect.y + (sRect.h - windowSize.h) / 2 + POSITION_OFFSET_Y
    else
        -- Default to top left
        x = sRect.x + POSITION_OFFSET_X
        y = sRect.y + POSITION_OFFSET_Y
    end

    local absoluteRect = hs.geometry(x, y, windowSize.w, windowSize.h)

    -- Create canvas
    local canvas = hs.canvas.new(absoluteRect)

    -- Background rectangle
    local backgroundElement = {
        id = 'reloadNotification__background',
        type = 'rectangle',
        action = 'fill',
        fillColor = {
            hex = BG_COLOR,
            alpha = BG_ALPHA
        },
        roundedRectRadii = { xRadius = BORDER_RADIUS_X, yRadius = BORDER_RADIUS_Y }
    }

    -- Calculate text frame based on padding and vertical alignment
    local textFrame = {
        x = TEXT_PADDING_LEFT,
        y = TEXT_PADDING_TOP,
        w = windowSize.w - TEXT_PADDING_LEFT - TEXT_PADDING_RIGHT,
        h = windowSize.h - TEXT_PADDING_TOP - TEXT_PADDING_BOTTOM
    }

    -- Adjust vertical position based on TEXT_VERTICAL_ALIGNMENT
    if TEXT_VERTICAL_ALIGNMENT == 'center' then
        -- Center vertically by adjusting y position
        local textHeight = TEXT_SIZE * 1.5  -- Approximate line height
        textFrame.y = (windowSize.h - textHeight) / 2 + TEXT_VERTICAL_OFFSET
        textFrame.h = textHeight
    elseif TEXT_VERTICAL_ALIGNMENT == 'top' then
        textFrame.y = TEXT_PADDING_TOP + TEXT_VERTICAL_OFFSET
        textFrame.h = windowSize.h - TEXT_PADDING_TOP - TEXT_PADDING_BOTTOM
    elseif TEXT_VERTICAL_ALIGNMENT == 'bottom' then
        local textHeight = TEXT_SIZE * 1.5
        textFrame.y = windowSize.h - textHeight - TEXT_PADDING_BOTTOM + TEXT_VERTICAL_OFFSET
        textFrame.h = textHeight
    end

    -- Text element
    local textElement = {
        id = 'reloadNotification__text',
        type = 'text',
        text = hs.styledtext.new(TEXT_MESSAGE, {
            color = {
                hex = TEXT_COLOR
            },
            font = {
                name = TEXT_FONT,
                size = TEXT_SIZE
            },
            paragraphStyle = {
                alignment = TEXT_ALIGNMENT
            }
        }),
        frame = textFrame
    }

    -- Add elements to canvas
    canvas:appendElements(backgroundElement, textElement)

    -- Store canvas at module level
    activeCanvas = canvas

    -- Show the notification
    canvas:show()

    -- Hide after configured duration and clean up
    activeTimer = hs.timer.doAfter(DISPLAY_DURATION, function()
        if activeCanvas then
            activeCanvas:delete()
            activeCanvas = nil
        end
        activeTimer = nil
    end)
end

-- Show notification when module is loaded
showReloadNotification()
