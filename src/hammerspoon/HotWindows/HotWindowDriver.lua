----- Parent -----
HotWindowDriver = {
   windowHashMap = {},
}

function HotWindowDriver:new (o)
   o = o or {}
   setmetatable(o, self)
   self.__index = self
   return o
end

function HotWindowDriver:addWindow ()
   print("The frame of HotWindowDriver is ",self.frame)
end


----- Node -----
HotWindowDriverNode = {
   activeWindow = nil,
   nextWindow = nil,
   previousWindow = nil
}

function HotWindowDriverNode:new (o)
   o = o or {}
   setmetatable(o, self)
   self.__index = self
   return o
end

function HotWindowDriverNode:sayHi ()
   print('Hello from HotWindowDriverNode')
end
