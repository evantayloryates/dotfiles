// Bounded synthetic AVAssetWriter timing oracle. No screen/input/UI capture.
// Compile privately and run under probe-supervisor.py in a fresh output folder.
// Actual frame PTS uses nanoseconds; alternate media timebase and explicitly
// supplied one-second held buffers are diagnostic controls, not production fixes.
import AVFoundation
import CoreVideo
import Foundation
func errorValue(_ e:Error?)->[String:Any]? {guard let e else {return nil};let n=e as NSError;return ["domain":n.domain,"code":n.code,"description":n.localizedDescription,"underlying":errorValue(n.userInfo[NSUnderlyingErrorKey] as? Error) as Any? ?? NSNull()]}
let root=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
var variants:[(String,Int32,[Double])]=[("short-gap-ns",1_000_000_000,[0,0.033333333,1,3.5,6.5,6.533333333]),("long-gap-ns",1_000_000_000,[0,0.033333333,1,3.5,22.5,22.533333333]),("long-gap-us",1_000_000,[0,0.033333333,1,3.5,22.5,22.533333333]),("long-gap-held-ns",1_000_000_000,[0,0.033333333]+Array(1...22).map(Double.init)+[22.5,22.533333333])]
for gap in [1.9,2.1,2.2,2.5,4.2,4.4] {
 let offsets:[Double]=[0,0.033333333,1,1+gap,1+gap+0.033333333]
 variants.append(("boundary-\(gap)",1_000_000_000,offsets))
}
var results=[[String:Any]]()
for (name,timescale,offsets) in variants {
 let url=root.appendingPathComponent(name+".mp4")
 let writer=try AVAssetWriter(outputURL:url,fileType:.mp4);writer.movieTimeScale=timescale;writer.movieFragmentInterval=CMTime(seconds:1,preferredTimescale:600)
 let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:1000,AVVideoHeightKey:732,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:2_000_000,AVVideoExpectedSourceFrameRateKey:30,AVVideoMaxKeyFrameIntervalDurationKey:2,AVVideoAllowFrameReorderingKey:false]])
 input.expectsMediaDataInRealTime=true;input.mediaTimeScale=timescale;writer.add(input)
 let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:nil)
 _=writer.startWriting();let origin:UInt64=100_000_000_000_000
 func pts(_ x:Double)->CMTime {CMTime(value:Int64(origin)+Int64((x*1e9).rounded()),timescale:1_000_000_000)}
 writer.startSession(atSourceTime:pts(0));var submissions=[[String:Any]]()
 for (i,x) in offsets.enumerated() {
  var optional:CVPixelBuffer?;let code=CVPixelBufferCreate(kCFAllocatorDefault,1000,732,kCVPixelFormatType_32BGRA,[kCVPixelBufferIOSurfacePropertiesKey:[:] ] as CFDictionary,&optional)
  guard code==kCVReturnSuccess,let pb=optional else {fatalError("pixel buffer unavailable")}
  CVPixelBufferLockBaseAddress(pb,[]);memset(CVPixelBufferGetBaseAddress(pb),i%2==0 ? 80:180,CVPixelBufferGetBytesPerRow(pb)*732);CVPixelBufferUnlockBaseAddress(pb,[])
  let deadline=Date().addingTimeInterval(3)
  while !input.isReadyForMoreMediaData && writer.status == .writing && Date()<deadline {Thread.sleep(forTimeInterval:0.005)}
  let accepted=input.isReadyForMoreMediaData && adaptor.append(pb,withPresentationTime:pts(x))
  submissions.append(["offset_s":x,"accepted":accepted,"writer_status":writer.status.rawValue,"error":errorValue(writer.error) as Any? ?? NSNull()])
 }
 input.markAsFinished();writer.endSession(atSourceTime:pts(offsets.last!+0.033333333))
 let done=DispatchSemaphore(value:0);writer.finishWriting{done.signal()};let waited=done.wait(timeout:.now()+5)
 results.append(["variant":name,"media_timescale":timescale,"finish_returned":waited == .success,"writer_status":writer.status.rawValue,"error":errorValue(writer.error) as Any? ?? NSNull(),"submissions":submissions])
}
let data=try JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys]);try data.write(to:root.appendingPathComponent("sparse-writer-results.json"));print(String(data:data,encoding:.utf8)!)
