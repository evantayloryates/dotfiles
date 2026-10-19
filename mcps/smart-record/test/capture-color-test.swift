import CoreVideo
import Foundation

@main struct CaptureColorTest {
  static func main() throws {
    var checks=0
    func check(_ value:Bool,_ message:String){guard value else{fputs("failed: \(message)\n",stderr);exit(1)};checks+=1}
    func buffer(_ format:OSType)->CVPixelBuffer {
      var value:CVPixelBuffer?
      guard CVPixelBufferCreate(nil,16,16,format,nil,&value)==kCVReturnSuccess,let value else{fputs("pixel buffer allocation failed\n",stderr);exit(1)}
      return value
    }
    let bgra=buffer(kCVPixelFormatType_32BGRA),nv12=buffer(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
    let untagged=CaptureColor(bgra)
    check(untagged.primaries==nil && untagged.transfer==nil && untagged.matrix==nil,"absent tags remain unknown")
    check(untagged.dict["observed_primaries"] is NSNull,"unknown is JSON null")
    check(untagged==CaptureColor(bgra),"unchanged frame does not create a color segment")
    check(untagged != CaptureColor(nv12),"pixel format change creates a boundary")
    CVBufferSetAttachment(nv12,kCVImageBufferColorPrimariesKey,kCVImageBufferColorPrimaries_ITU_R_709_2,.shouldPropagate)
    CVBufferSetAttachment(nv12,kCVImageBufferTransferFunctionKey,kCVImageBufferTransferFunction_ITU_R_709_2,.shouldPropagate)
    CVBufferSetAttachment(nv12,kCVImageBufferYCbCrMatrixKey,kCVImageBufferYCbCrMatrix_ITU_R_709_2,.shouldPropagate)
    let tagged=CaptureColor(nv12)
    check(tagged.primaries=="ITU_R_709_2" && tagged.transfer=="ITU_R_709_2" && tagged.matrix=="ITU_R_709_2","actual tags copied")
    check(tagged != CaptureColor(buffer(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)),"tag change creates a boundary")
    CVBufferSetAttachment(nv12,kCVImageBufferTransferFunctionKey,kCVImageBufferTransferFunction_sRGB,.shouldPropagate)
    check(CaptureColor(nv12).transfer==kCVImageBufferTransferFunction_sRGB as String && CaptureColor(nv12) != tagged,"changed tag is copied without overwriting the prior observation")
    CVBufferSetAttachment(nv12,kCVImageBufferTransferFunctionKey,NSNumber(value:7),.shouldPropagate)
    check(CaptureColor(nv12).transfer==nil,"wrong-type tag remains unknown")
    CVBufferSetAttachment(nv12,kCVImageBufferTransferFunctionKey,String(repeating:"x",count:257) as CFString,.shouldPropagate)
    check(CaptureColor(nv12).transfer==nil,"unexpected large tag remains unknown")
    check(JSONSerialization.isValidJSONObject(tagged.dict),"descriptor serializes")
    print("{\"passed\":\(checks),\"scope\":\"observed color tag copying, explicit unknowns and change boundaries; no screen capture or color fidelity claim\"}")
  }
}
