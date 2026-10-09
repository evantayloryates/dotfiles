

function pp_evt(HSEvent)
	local out_string = '\n'
	for name,value in pairs(hs.eventtap.event.properties) do
		out_string = concat(out_string, name, ': ', HSEvent:getProperty(value), '\n')
	end
	out_string = concat(out_string, '\n')
	print(out_string)
end

function hs_event_pp(HSEvent)

	local out_string = concat('\n', string.rep('*', 50), '\n\n')

	-- Instance Variables --
	for name,value in pairs(hs.eventtap.event.properties) do
		out_string = concat(out_string, name, ': ', HSEvent:getProperty(value), '\n')
	end
	out_string = concat(out_string, '\n')

	out_string = concat(out_string, '\n', string.rep('*', 50), '\n')
	print(out_string)
end
