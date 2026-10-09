
function getMaxChars()
    return math.floor(windowSize.w/12)
end

focusedScreen = hs.screen.mainScreen()
sRect = focusedScreen:frame()

windowSize = {
    w = 400,
    h = 320,
}

absoluteRect = hs.geometry(sRect.x,sRect.y,windowSize.w,windowSize.h)
relativeRect = hs.geometry(0, 0, absoluteRect.w,absoluteRect.h)

innerRect = hs.geometry.copy(relativeRect)
innerRect:scale(0.9)

-- Construct Root and Inner Canvases
c = hs.canvas.new(absoluteRect)
cInner = hs.canvas.new(relativeRect)

baseElement = {
    id = 'rootCanvas__backgroundRect',
    type = 'rectangle',
    action = 'fill',
    fillColor = {
        hex = '#000000',
        alpha = 0.6
    },
}

innerCanvasElement = {
    id = 'innerCanvas',
    type = 'canvas',
    canvas = cInner,
    frame = {x=innerRect.x,y=innerRect.y,w=innerRect.w,h=innerRect.h},
}

windowText = str(getFocusedWindow())

reprData = repr(getFocusedWindow())

labelText = ''
valueText = ''
for _, row in ipairs(reprData) do
    label = row[1]
    labelText = concat(labelText, label, '\n')
    value = row[2]
    valueText = concat(valueText, clip(tostring(value), getMaxChars(), '...'), '\n')
end

labelTextElement = {
    id = 'rootCanvas__text',
    type = 'text',
    text = hs.styledtext.new(labelText, {
        color  = {
            hex = '#FFFFFF'
        },
        font = {
            name = 'Menlo',
            size = 12
        },
        paragraphStyle = {
            alignment = 'left'
        },
        lineBreak = 'clip'
    }),
}

valueTextElement = {
    id = 'rootCanvas__text',
    type = 'text',
    text = hs.styledtext.new(valueText, {
        color  = {
            hex = '#FFFFFF'
        },
        font = {
            name = 'Menlo',
            size = 12
        },
        paragraphStyle = {
            alignment = 'right'
        },
        lineBreak = 'clip'
    }),
}

-- Toggle hint text at bottom center
local toggleHintElement = {
    id = 'rootCanvas__toggleHint',
    type = 'text',
    text = hs.styledtext.new('Press ⌘⌃H to toggle', {
        color = {
            hex = '#AAAAAA',
            alpha = 0.8
        },
        font = {
            name = 'Menlo-Italic',
            size = 10
        },
        paragraphStyle = {
            alignment = 'center'
        }
    }),
    frame = {
        x = 0,
        y = windowSize.h - 25,
        w = windowSize.w,
        h = 20
    }
}

cInner:appendElements(labelTextElement, valueTextElement)
c:appendElements(baseElement, innerCanvasElement, toggleHintElement)

-- Only show canvas if DEBUG_WINDOW is enabled
if DEBUG_WINDOW then
    c:show()
end

function rectBuilder(x, y)
    return hs.geometry(x, y, windowSize.w, windowSize.h)
end

function topRight()
    local newX = sRect.x + sRect.w - windowSize.w
    c:frame(rectBuilder(newX, sRect.y))
end

function topLeft()
    c:frame(rectBuilder(sRect.x, sRect.y))
end

function bottomRight()
    local newX = sRect.x + sRect.w - windowSize.w
    local newY = sRect.y + sRect.h - windowSize.h
    c:frame(rectBuilder(newX, newY))
end

function bottomLeft()
    local newY = sRect.y + sRect.h - windowSize.h
    c:frame(rectBuilder(sRect.x, newY))
end
