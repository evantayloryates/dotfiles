function getFocusedApplication()
   return hs.application.frontmostApplication()
end

function getFocusedWindow()
   -- If there is no focused window, this fn returns 'nil'
   return hs.window.focusedWindow()

   -- -- If there is no focused window, this fn returns the frontmost window
   -- return hs.window.frontmostWindow()
end

function getAllWindows()
   return hs.window.allWindows()
end

function getWindowByID(id)
   return hs.window.find(id)
end

function getSublimeWindowByPath(path)
   local sublime_windows = filter(hs.window.allWindows(), function(w) return w:application():name() == "Sublime Text" end)
   return filter(sublime_windows,
	function(w)
		index,_ = string.find(w:title(), path)
			return not(index == nil)
	end
   )[1]
end

-- The Desktop is really just a window managed by Finder. It is not included
-- in the hs.window.allWindows() call
function getDesktopWindow()
	return hs.window.desktop()
end

function listModuleProps(obj)
	local out_string = concat('\n', string.rep('*', 50), '\n\n')
	for k, v in pairs(obj.__index) do
		out_string = concat(out_string, k, type(v), '\n')
	end
	out_string = concat(out_string, '\n', string.rep('*', 50), '\n')
	print(out_string)
end

function listTableProps(tabl)
	local out_string = concat('\n', string.rep('*', 50), '\n\n')
	for k,v in pairs(tabl) do
		out_string = concat(out_string, 'KEY: ', k, '\nVALUE:\n', v, '\n\n')
	end
	out_string = concat(out_string, '\n', string.rep('*', 50), '\n')
	print(out_string)
end

function listArrayProps(tabl)
	if not tabl then return end
	local out_string = concat('\n', string.rep('*', 50), '\n\n')
	for k,v in pairs(tabl) do
		out_string = concat(out_string, k, ': ', v, '\n')
	end
	out_string = concat(out_string, '\n', string.rep('*', 50), '\n')
	print(out_string)
end

function array_concat(...)
	local outArr = {}
	for idx, item in pairs({...}) do
		if type(item) == 'table' then
			for _,subItem in pairs(item) do
				table.insert(outArr, subItem)
			end
		else
			table.insert(outArr, item)
		end
	end
	return outArr
end

function concat(...)

	local args = {...}
	if type(args[1]) == 'table' then
		return array_concat(...)
	else
		return string_concat(...)
	end
end

function clip(s, maxLen, suffix)
	if #s <= maxLen then
		return s
	else
		return concat(s:sub(1,maxLen - #(suffix or {})), suffix or '')
	end
end

-- objType: 'file' or 'directory'
function getFsObjects(fp, objType)

	local rootPath = hs.fs.pathToAbsolute(fp) or './'
	local outArr = {}
	for dir_obj in hs.fs.dir(rootPath) do
		fullPath = path(rootPath, dir_obj)
		if hs.fs.attributes(fullPath).mode == objType then
			table.insert(outArr, fullPath)
		end
	end
	return outArr
end

function path(...)
	local outStr = ''
	local inputArr = {...}
	for idx, subPath in pairs(inputArr) do
		local delim = '/'
		if idx == #inputArr then
			delim = ''
		end
		outStr = concat(outStr, tostring(subPath), delim)
	end

	local prevStr = nil

	-- In case there are any issues when iterating, set a
	-- max loop cyle count
	local max_cycles = 10
	for x in _range(max_cycles) do
		prevStr = outStr
		outStr, numSubs = outStr:gsub('//', '/')
		if outStr == prevStr or not numSubs then
			break
		end
	end
	if any({'/', './'}, function(i) return startswith(outStr, i) end) then
		return outStr
	else
		return outStr
	end
end

function truthFn(...)
	return true
end

function nilFn(...)
	return nil
end

function identityFn(...)
	return ...
end
