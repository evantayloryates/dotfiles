import Foundation

/// Validate before narrowing JSON numbers into fixed-width IDs, dimensions or
/// timer values. Booleans are NSNumber too; never let them become identifiers.
enum RPCNumber {
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
      _ = try boolean(p,"include_transients")
      _ = try boolean(p,"on_screen_only")
    }
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
