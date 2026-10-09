import CoreVideo
import Foundation

/// Observed buffer tags, not inferred application/backing/display color intent.
/// Keep absent tags unknown; never replace them with the requested output space.
struct CaptureColor: Equatable {
  let pixelFormat: OSType
  let primaries: String?
  let transfer: String?
  let matrix: String?
  init(_ buffer: CVPixelBuffer) {
    pixelFormat = CVPixelBufferGetPixelFormatType(buffer)
    func tag(_ key: CFString) -> String? {
      guard let value = CVBufferCopyAttachment(buffer, key, nil) as? String,
            value.utf8.count <= 256 else { return nil }
      return value
    }
    primaries = tag(kCVImageBufferColorPrimariesKey)
    transfer = tag(kCVImageBufferTransferFunctionKey)
    matrix = tag(kCVImageBufferYCbCrMatrixKey)
  }
  var dict: [String:Any] {
    ["requested_output_color_space":"sRGB", "pixel_format":Int(pixelFormat),
     "observed_primaries":primaries as Any? ?? NSNull(),
     "observed_transfer":transfer as Any? ?? NSNull(),
     "observed_ycbcr_matrix":matrix as Any? ?? NSNull(),
     "qualification":"observed buffer tags; app backing intent, colorimetric accuracy and HDR are not inferred"]
  }
}
