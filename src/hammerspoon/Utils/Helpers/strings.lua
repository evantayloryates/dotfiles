function startswith(str, subStr)
   return string.sub(str,1,string.len(subStr))==subStr
end

function endswith(str, subStr)
   return subStr == "" or str:sub(-#subStr) == subStr
end

-- Escape special chars with a `%`
function replace(sourceStr, searchStr, replaceStr)
	pure, _ = sourceStr:gsub(searchStr, replaceStr, 1)
	return pure
end

-- Escape special chars with a `%`
function replaceAll(sourceStr, searchStr, replaceStr)
	pure, _ = sourceStr:gsub(searchStr, replaceStr)
	return pure
end

function string:split(sep)
   local sep, fields = sep or ":", {}
   local pattern = string.format("([^%s]+)", sep)
   self:gsub(pattern, function(c) fields[#fields+1] = c end)
   return fields
end

function string:presence()
   if #self == 0 then
	return false
   else
	return self
   end
end

function string_concat(...)
	local out_string = ''
	for idx, str in pairs({...}) do
		out_string = out_string .. tostring(str)
	end
	return out_string
end
