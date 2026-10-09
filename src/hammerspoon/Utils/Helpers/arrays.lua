function indices(n)
	local outArr = {}
	local i = 1
	if type(n) == 'number' then
		while i <= n do
			table.insert(outArr, i, i)
			i = i + 1
		end
	end
	return outArr
end

function last(arr, ind)
	return arr[#arr - (ind or 0)]
end

function range(lastNum, firstNum, stepNum)
	local first = firstNum or 1
	local step = stepNum or 1
	local outLen = math.ceil((lastNum - first) / step)
	local val = first
	local outArr = {}
	for ind in _indices(outLen) do
		table.insert(outArr, ind, val)
		val = val + step
	end

	return outArr
end

function _base(arr, condFn, mapFn)
	local outItems = {}
	for item in _items(arr) do
		local condRes = condFn(item)
		if condRes then
			if mapFn then
				table.insert(outItems, mapFn(item) or nil)
			else
				table.insert(outItems, condRes)
			end
		end
	end
	return outItems
end

function map(arr, mapFn)
	return _base(arr, truthFn, mapFn)
end

function each(arr, eachFn)
	return _base(arr, truthFn, function(i) eachFn(i) end)
end

function filter(arr, condFn)
	return _base(arr, condFn, identityFn)
end

function filtermap(arr, condFn)
	local out = _base(arr, condFn, nil)
	return _base(arr, condFn, nil)
end


function any(arr, fn)
	if #filter(arr, fn) == 0 then
		return false
	else
		return true
	end
end

function all(arr, fn)
	if #filter(arr, fn) == #arr then
		return true
	else
		return false
	end
end

function empty(arr)
	if not arr then return true end
	return not next(arr)
end

function find(arr, item)
	return (findall(arr, item) or {nil})[1]
end

function findall(arr, item)
	local idxArr = {}
	for k,v in pairs(arr) do
		if v == item then
			table.insert(idxArr, k)
		end
	end
	if #idxArr > 0 then
		return idxArr
	else
		return {}
	end
end

function remove(arr, idx)
	local locArr = clone(arr)
	_pop(locArr, idx)
	return locArr
end

function pop(arr, idx)
	return table.remove(arr, (idx or 1))
end

function popMany(arr, idxArr)
	rsort(idxArr)
	local poppedItems = {}
	for idx in _items(idxArr) do
		table.insert(poppedItems, pop(arr, idx))
	end
	return poppedItems
end

function popAll(arr, item)
	popMany(arr, findall(arr, item))
end

function sort(arr, sortFn)
	table.sort(arr, sortFn)
end

function rsort(arr)
	sort(arr, function(s1,s2) return s1 > s2 end)
end

function clone(arr)
  return {table.unpack(arr)}
end

function join(arr, delim, startInd, endInd)
	return table.concat(arr, delim, start, endInd)
end

function _set(leftArr, rightArr, evalFn)
	local leftArr = clone(leftArr)
	local rightArr = clone(rightArr)

	local outSet = {}

	while (true) do

		local items = {}
		items.left =  pop(leftArr)
		if not items.left then
			items.right = pop(rightArr)
		end
		items.target = items.left or items.right

		local shouldBreak = evalFn(items, leftArr, rightArr, outSet)

		-- Remove all remaining occurances of item in both arrays
		map({leftArr, rightArr}, function(a) popAll(a, items.target) end)

		-- If evalFn triggers break, or if there are no more items left, break
		if shouldBreak or empty(items) then break end

	end

	return outSet
end

function union(leftArr, rightArr)
	return _set(leftArr, rightArr,
		function(items, leftArr, rightArr, outSet)
			-- Add the item
			table.insert(outSet, items.target)
		end
	)
end

function intersect(leftArr, rightArr)
	return _set(leftArr, rightArr,
		function(items, leftArr, rightArr, outSet)
			if items.left then
				-- If left item is in the right array, add it
				if find(rightArr, items.left) then
					table.insert(outSet, items.left)
				end
			else
				return true
			end
		end
	)
end

function outersect(leftArr, rightArr)
	return _set(leftArr, rightArr,
		function(items, leftArr, rightArr, outSet)
			if items.left then
				-- If left item is in the right array, add it
				if not find(rightArr, items.left) then
					table.insert(outSet, items.left)
				end
			else
				table.insert(outSet, items.right)
			end
		end
	)
end
