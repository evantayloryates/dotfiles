import Foundation

/// Validate before narrowing JSON numbers into fixed-width IDs, dimensions or
/// timer values. Booleans are NSNumber too; never let them become identifiers.
enum RPCNumber {
  static func fields(_ input:[String:Any],allowed:Set<String>,label:String) throws {
    let extra=Set(input.keys).subtracting(allowed).sorted()
    guard extra.isEmpty else { throw RPCError.badParams("\(label) contains unsupported fields: \(extra.joined(separator:", "))") }
  }
  static func string(_ input:[String:Any],_ key:String,max:Int=256) throws {
    if let raw=input[key] {
      guard let value=raw as? String,value.count<=max else { throw RPCError.badParams("\(key) must be a string of at most \(max) characters") }
    }
  }
  static func optional(_ input:[String:Any],_ key:String,min:Double,max:Double,integer:Bool=false) throws -> Double? {
    guard let raw=input[key] else { return nil }
    guard let value=raw as? NSNumber,CFGetTypeID(value) != CFBooleanGetTypeID(),
          value.doubleValue.isFinite,value.doubleValue>=min,value.doubleValue<=max,
          !integer || value.doubleValue.rounded(.towardZero)==value.doubleValue else {
      throw RPCError.badParams("\(key) must be a \(integer ? "whole " : "")number in \(min)…\(max)")
    }
    return value.doubleValue
  }
  static func boolean(_ input:[String:Any],_ key:String) throws -> Bool? {
    guard let raw=input[key] else { return nil }
    guard let n=raw as? NSNumber,CFGetTypeID(n)==CFBooleanGetTypeID() else { throw RPCError.badParams("\(key) must be a boolean") }
    return n.boolValue
  }
  static func validate(_ method:String,_ p:[String:Any]) throws {
    if method == "windows.list" {
      try fields(p,allowed:["app","title","on_screen_only","include_transients","limit"],label:method)
      try string(p,"app");try string(p,"title")
      _ = try boolean(p,"include_transients")
      _ = try boolean(p,"on_screen_only")
    }
    let captureFields:[String:Set<String>] = [
      "frame.resolve":["target"],
      "frame.verify":["target","session_id","session","max_width","format","path","quality"],
      "overlay.show":["target","session_id","overlay_id","seconds","label","capturable"],
      "record.schedule":["target","session_id","session","caller","start_at","end_at","if_late","idempotency_key","label","preset","fps","codec","max_width","show_cursor","bitrate_mbps","input"]
    ]
    if let allowed=captureFields[method] {
      try fields(p,allowed:allowed,label:method)
      _ = try TargetSpec.parse(p["target"])
      for key in ["session_id","label","overlay_id","idempotency_key"] { try string(p,key,max:1000) }
      if let raw=p["caller"] {
        guard let caller=raw as? [String:Any] else { throw RPCError.badParams("caller must be an object") }
        // Existing adapters attach unverified caller metadata to scheduling.
        // This is not an ownership assertion or a capture option.
        for key in caller.keys { try string(caller,key,max:4096) }
      }
      if let raw=p["session"] {
        guard let session=raw as? [String:Any] else { throw RPCError.badParams("session must be an object") }
        try fields(session,allowed:["title","purpose","tags"],label:"session")
        try string(session,"title",max:1000);try string(session,"purpose",max:3000)
        if let tags=session["tags"] { guard tags is [String] else { throw RPCError.badParams("session.tags must be an array of strings") } }
      }
    }
    if method == "frame.verify" {
      if let raw=p["format"] { guard let value=raw as? String,["png","jpeg"].contains(value) else { throw RPCError.badParams("format must be png or jpeg") } }
      try string(p,"path",max:4096)
      _ = try optional(p,"quality",min:0,max:1)
    }
    if method == "overlay.show" { _ = try boolean(p,"capturable") }
    if method == "record.schedule" { try string(p,"preset");try string(p,"codec");try string(p,"if_late") }
    // All these names are numeric in the public protocol; validate before
    // target discovery, filesystem work or capture admission occurs.
    for key in ["max_width","fps","limit","events","keyframe_images"] where p[key] != nil {
      let bounds:(Double,Double)
      switch key {
      case "fps": bounds=(1,120)
      case "max_width": bounds=(0,16384)
      case "keyframe_images": bounds=(0,24)
      case "events": bounds=(0,1000)
      default: bounds=(1,1000)
      }
      _=try optional(p,key,min:bounds.0,max:bounds.1,integer:true)
    }
    for key in ["timeout_s","seconds","from_s","to_s"] where p[key] != nil {
      let maxValue=key=="seconds" ? 10800.0 : key=="timeout_s" ? 3600.0 : 10800.0
      _=try optional(p,key,min:0,max:maxValue)
    }
    if let raw=p["at_s"] {
      guard let list=raw as? [Any],!list.isEmpty,list.count<=24 else { throw RPCError.badParams("at_s must contain 1–24 finite offsets") }
      for value in list { _=try optional(["at_s":value],"at_s",min:0,max:10800) }
    }
    if method=="record.schedule" { _=try RecordSettings.from(p); _=try InputSettings.parse(p["input"]) }
  }
}
