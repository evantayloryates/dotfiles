printMap = {
	hs_window = hs_window_pp,
	hs_application = hs_application_pp,
	hs_eventtap_event = hs_event_pp,
}

stringMap = {
	hs_window = hs_window_str,
}

reprMap = {
	hs_window = hs_window_repr,
}

function pp(obj)
	printMap[replaceAll(obj.__type, '%.', '_')](obj)
end

function str(obj)
	return stringMap[replaceAll(obj.__type, '%.', '_')](obj)
end

function repr(obj)
	return reprMap[replaceAll(obj.__type, '%.', '_')](obj)
end
