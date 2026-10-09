function checkImports(path, imports, localExcludes)
	local excludes = concat(localExcludes, GLOBAL_EXCLUDES)
	local function _base(fsObjs, evalFn)
		return filtermap(fsObjs,
			function(i)
				local excluded = any(excludes,
					function(j)
						return endswith(i, concat('/', j))
					end
				)
				if not excluded then
					return evalFn(i)
				end
			end
		)
	end

	local luaFiles =  _base(getFsObjects(path, 'file'), function(f)
		if endswith(f, '.lua') then
			return last(f:split('/')):split('.')[1]
		end
	end)
	local luaFolders =  _base(getFsObjects(path, 'directory'), function(f)
		return last(f:split('/')) end)
	throwWarnings(outersect(union(luaFiles, luaFolders), imports), path)
end

function throwWarnings(missedImports, modulePath)
	local strPrefix = concat('\n\nWARNING: Missing imports in ', (modulePath:presence() or './'), ': \n')
	messages = map(missedImports,
		function(i)
			return concat('  - ', i)
		end
	)
	if empty(messages) then return end
	outStr = concat(strPrefix, join(messages, '\n'), '\n')
	print(outStr)
end
