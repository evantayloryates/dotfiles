import AppKit
import ScreenCaptureKit
import CoreImage
import VideoToolbox
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

/// One retained source buffer, no encoder or input, hard process deadline.
/// Only the owned coordinate/color fixture is admitted by this probe.
final class ColorBufferSink: NSObject, SCStreamOutput, @unchecked Sendable {
  let lock=NSLock()
  var buffer:CVPixelBuffer?
  var receivedNS:UInt64=0
  func stream(_ stream:SCStream,didOutputSampleBuffer sample:CMSampleBuffer,of type:SCStreamOutputType) {
    guard type == .screen,
      let info=(CMSampleBufferGetSampleAttachmentsArray(sample,createIfNecessary:false) as? [[SCStreamFrameInfo:Any]])?.first,
      (info[.status] as? Int)==SCFrameStatus.complete.rawValue,
      let pb=CMSampleBufferGetImageBuffer(sample) else{return}
    lock.lock();defer{lock.unlock()}
    if buffer==nil {buffer=pb;receivedNS=clock_gettime_nsec_np(CLOCK_UPTIME_RAW)}
  }
  func snapshot()->CVPixelBuffer? {lock.lock();defer{lock.unlock()};return buffer}
}

func colorSpaceDescription(_ space:CGColorSpace?)->[String:Any] {
  guard let space else{return ["available":false]}
  var out:[String:Any]=["available":true,"name":space.name.map{String($0)} ?? "unnamed","model":space.model.rawValue]
  if let data=space.copyICCData() as Data? {out["icc_sha256"]=SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined()}
  return out
}

func savePNG(_ image:CGImage,_ path:URL) throws {
  guard let output=CGImageDestinationCreateWithURL(path as CFURL,UTType.png.identifier as CFString,1,nil) else{throw NSError(domain:"probe.png",code:1)}
  CGImageDestinationAddImage(output,image,nil)
  guard CGImageDestinationFinalize(output) else{throw NSError(domain:"probe.png",code:2)}
}

@main struct ColorBufferProbe {
  static func main() async {
    do {
      NSApplication.shared.setActivationPolicy(.prohibited)
      let args=CommandLine.arguments
      guard args.count==5,let id=UInt32(args[1]),["bgra","nv12"].contains(args[2]),["default","709"].contains(args[3]) else{exit(2)}
      DispatchQueue.global().asyncAfter(deadline:.now()+15){fputs("color probe deadline\n",stderr);exit(124)}
      guard CGPreflightScreenCaptureAccess() else{fputs("existing capture access missing; no prompt requested\n",stderr);exit(3)}
      let output=URL(fileURLWithPath:args[4]);try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
      let content=try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:false)
      guard let window=content.windows.first(where:{$0.windowID==id}),window.owningApplication?.bundleIdentifier=="com.taylor.record-screen.coordinate-color" else{exit(4)}
      let config=SCStreamConfiguration();config.width=440;config.height=312
      config.pixelFormat=args[2]=="bgra" ? kCVPixelFormatType_32BGRA:kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      config.colorSpaceName=CGColorSpace.sRGB
      if args[3]=="709" {config.colorMatrix=CGDisplayStream.yCbCrMatrix_ITU_R_709_2}
      config.minimumFrameInterval=CMTime(value:1,timescale:2);config.queueDepth=3
      config.showsCursor=false;config.ignoreShadowsSingleWindow=true
      let sink=ColorBufferSink();let stream=SCStream(filter:SCContentFilter(desktopIndependentWindow:window),configuration:config,delegate:nil)
      try stream.addStreamOutput(sink,type:.screen,sampleHandlerQueue:DispatchQueue(label:"color-probe.frames"))
      try await stream.startCapture()
      let deadline=clock_gettime_nsec_np(CLOCK_UPTIME_RAW)+2_000_000_000
      while sink.snapshot()==nil && clock_gettime_nsec_np(CLOCK_UPTIME_RAW)<deadline {try await Task.sleep(nanoseconds:5_000_000)}
      try await stream.stopCapture()
      guard let pb=sink.snapshot() else{throw NSError(domain:"probe.no_complete_buffer",code:1)}
      var report:[String:Any]=["schema":"color-buffer-probe/v1","window_id":id,"fixture_pid":Int(window.owningApplication!.processID),
        "window_frame":[window.frame.minX,window.frame.minY,window.frame.width,window.frame.height],
        "requested_format":args[2],"requested_color_space":"sRGB","requested_matrix":args[3],
        "actual_pixel_format":Int(CVPixelBufferGetPixelFormatType(pb)),"pixels":[CVPixelBufferGetWidth(pb),CVPixelBufferGetHeight(pb)],
        "received_host_ns":String(sink.receivedNS),"limits":["single source buffer; no encoder, input or universal color claim"]]
      var attachments:[String:Any]=[:]
      for (key,label) in [(kCVImageBufferColorPrimariesKey,"primaries"),(kCVImageBufferTransferFunctionKey,"transfer"),(kCVImageBufferYCbCrMatrixKey,"matrix")] {
        if let value=CVBufferCopyAttachment(pb,key,nil) {attachments[label]=String(describing:value)}
      }
      let all=CVBufferCopyAttachments(pb,.shouldPropagate)
      report["attachments"]=attachments
      report["attachment_color_space"]=colorSpaceDescription(all.flatMap{CVImageBufferCreateColorSpaceFromAttachments($0)?.takeRetainedValue()})
      var vt:CGImage?;let code=VTCreateCGImageFromCVPixelBuffer(pb,options:nil,imageOut:&vt)
      report["vt_status"]=code
      if let vt {report["vt_color_space"]=colorSpaceDescription(vt.colorSpace);try savePNG(vt,output.appendingPathComponent("vt.png"))}
      let srgb=CGColorSpace(name:CGColorSpace.sRGB)!
      let context=CIContext(options:[.cacheIntermediates:false])
      let ci=CIImage(cvPixelBuffer:pb)
      guard let converted=context.createCGImage(ci,from:ci.extent,format:.RGBA8,colorSpace:srgb) else{throw NSError(domain:"probe.ci",code:1)}
      report["ci_srgb_color_space"]=colorSpaceDescription(converted.colorSpace)
      try savePNG(converted,output.appendingPathComponent("ci-srgb.png"))
      let bytes=try JSONSerialization.data(withJSONObject:report,options:[.sortedKeys,.prettyPrinted]);try bytes.write(to:output.appendingPathComponent("buffer.json"))
      print("{\"complete\":true,\"pixel_format\":\(CVPixelBufferGetPixelFormatType(pb))}")
    }catch{fputs("\(error)\n",stderr);exit(1)}
  }
}
