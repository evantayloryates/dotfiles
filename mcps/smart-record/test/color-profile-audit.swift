import AppKit
import CryptoKit

/// Passive profile/transform audit; no capture, input, or settings changes.
@main struct ColorProfileAudit {
  static func main() throws {
    guard CommandLine.arguments.count==2 else{exit(2)}
    NSApplication.shared.setActivationPolicy(.prohibited)
    let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    let refs:[[CGFloat]]=[[1,0,0],[0,1,0],[0,0,1],[0.5,0.5,0.5],[1,1,1],[0,0,0]]
    var profiles:[[String:Any]]=[]
    for screen in NSScreen.screens {
      guard let number=screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else{continue}
      let space=CGDisplayCopyColorSpace(number.uint32Value)
      guard let icc=space.copyICCData() as Data?,let ns=NSColorSpace(cgColorSpace:space) else{continue}
      let path=root.appendingPathComponent("display-\(number.uint32Value).icc");try icc.write(to:path);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
      let deviceValues=refs.map{rgb->[Double] in
        guard let color=NSColor(srgbRed:rgb[0],green:rgb[1],blue:rgb[2],alpha:1).usingColorSpace(ns) else{return []}
        return [color.redComponent,color.greenComponent,color.blueComponent].map{Double($0*255)}
      }
      profiles.append(["display_id":number.uint32Value,"name":screen.localizedName,"frame":[screen.frame.minX,screen.frame.minY,screen.frame.width,screen.frame.height],
        "scale":screen.backingScaleFactor,"color_space_name":space.name.map{String($0)} ?? "unnamed","icc_sha256":SHA256.hash(data:icc).map{String(format:"%02x",$0)}.joined(),
        "icc_path":path.path,"declared_srgb_in_display_rgb":deviceValues])
    }
    let data=try JSONSerialization.data(withJSONObject:["schema":"color-profile-audit/v1","displays":profiles],options:[.prettyPrinted,.sortedKeys]);try data.write(to:root.appendingPathComponent("profiles.json"))
    print("{\"displays\":\(profiles.count)}")
  }
}
