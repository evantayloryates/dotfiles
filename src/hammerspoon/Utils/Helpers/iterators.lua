function _range(last, first, step)
    local arr = range(last, first, step)
    local i = 0
    return function()
        i = i + 1
        return arr[i]
    end
end

function _indices(n)
    local arr = indices(n)
    local i = 0
    return function ()
        i = i + 1
        return arr[i]
    end
end

function _items(arr)
    local i = 0
    return function ()
        i = i + 1
        return arr[i]
    end
end