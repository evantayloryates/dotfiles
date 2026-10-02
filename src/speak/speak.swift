// speak: stream text to speech through Cartesia and play it as it arrives.
// Usage, profiles and the latency design are in README.md beside this file.
import AudioToolbox
import CoreAudio
import Foundation

let apiURL = "https://api.cartesia.ai/tts/bytes"
let apiVersion = "2026-08-14"

// MARK: clock

let mainAt = DispatchTime.now().uptimeNanoseconds
func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds - mainAt) / 1e6 }

/// Milliseconds the kernel and dyld spent between exec and the first line of main.
func launchOverhead() -> Double {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return 0 }
    var wall = timeval()
    gettimeofday(&wall, nil)
    let started = info.kp_proc.p_starttime
    let elapsed = Double(wall.tv_sec - started.tv_sec) * 1e3 + Double(wall.tv_usec - started.tv_usec) / 1e3
    return max(0, elapsed - now())
}

func die(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data("speak: \(message)\n".utf8))
    exit(code)
}

// MARK: player

/// Plays raw PCM through the default output device. The device is started
/// before any audio exists, so it is already running when the first bytes land.
final class Player {
    private var unit: AudioUnit!
    private var pitchUnit: AudioUnit?
    private let lock = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    private var fifo = [UInt8]()
    private var head = 0
    private var inputEnded = false
    private var drainSignalled = false
    private let frameBytes: Int
    private let outFrameBytes: Int
    private let prebufferBytes: Int
    private var primed = false

    let drained = DispatchSemaphore(value: 0)
    private(set) var readyAt = 0.0
    private(set) var firstRenderAt: Double?
    private(set) var underruns = 0
    private(set) var renderedBytes = 0

    /// `rate` other than 1 time-stretches playback (pitch kept) through a time-pitch unit.
    init(sampleRate: Double, float: Bool, rate: Double, prebufferMs: Double) {
        lock.initialize(to: os_unfair_lock())
        let stretch = abs(rate - 1) > 0.001
        frameBytes = float ? 4 : 2
        // The time-pitch unit only takes float, so 16-bit audio is converted on the way in.
        let unitFloat = float || stretch
        outFrameBytes = unitFloat ? 4 : 2
        prebufferBytes = Int(sampleRate * prebufferMs / 1000) * frameBytes

        var description = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_DefaultOutput,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0)
        guard let component = AudioComponentFindNext(nil, &description) else { die("no audio output component") }
        var instance: AudioUnit?
        check(AudioComponentInstanceNew(component, &instance), "open audio output")
        unit = instance

        // Mono PCM at the stream's own rate; the output unit resamples for the device.
        var format = AudioStreamBasicDescription(
            mSampleRate: sampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: (unitFloat ? kLinearPCMFormatFlagIsFloat : kLinearPCMFormatFlagIsSignedInteger)
                | kLinearPCMFormatFlagIsPacked,
            mBytesPerPacket: UInt32(outFrameBytes),
            mFramesPerPacket: 1,
            mBytesPerFrame: UInt32(outFrameBytes),
            mChannelsPerFrame: 1,
            mBitsPerChannel: UInt32(outFrameBytes * 8),
            mReserved: 0)
        let formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0,
                                   &format, formatSize),
              "set stream format")

        var callback = AURenderCallbackStruct(
            inputProc: { refCon, _, _, _, _, ioData in
                guard let buffer = ioData?.pointee.mBuffers, let destination = buffer.mData else { return noErr }
                Unmanaged<Player>.fromOpaque(refCon).takeUnretainedValue()
                    .render(into: destination, bytes: Int(buffer.mDataByteSize))
                return noErr
            },
            inputProcRefCon: Unmanaged.passUnretained(self).toOpaque())
        let callbackSize = UInt32(MemoryLayout<AURenderCallbackStruct>.size)
        if stretch {
            // queue -> time-pitch unit -> output unit
            var pitchDescription = AudioComponentDescription(
                componentType: kAudioUnitType_FormatConverter,
                componentSubType: kAudioUnitSubType_NewTimePitch,
                componentManufacturer: kAudioUnitManufacturer_Apple,
                componentFlags: 0,
                componentFlagsMask: 0)
            guard let pitchComponent = AudioComponentFindNext(nil, &pitchDescription) else { die("no time-pitch unit") }
            var pitchInstance: AudioUnit?
            check(AudioComponentInstanceNew(pitchComponent, &pitchInstance), "open time-pitch unit")
            let pitch = pitchInstance!
            pitchUnit = pitch
            check(AudioUnitSetProperty(pitch, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0,
                                       &format, formatSize), "set time-pitch input format")
            check(AudioUnitSetProperty(pitch, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0,
                                       &format, formatSize), "set time-pitch output format")
            var maxFrames = UInt32(4096)
            check(AudioUnitSetProperty(pitch, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0,
                                       &maxFrames, UInt32(MemoryLayout<UInt32>.size)), "set time-pitch slice size")
            check(AudioUnitSetProperty(pitch, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0,
                                       &callback, callbackSize), "set render callback")
            check(AudioUnitSetParameter(pitch, kNewTimePitchParam_Rate, kAudioUnitScope_Global, 0,
                                        AudioUnitParameterValue(rate), 0), "set playback rate")
            var connection = AudioUnitConnection(sourceAudioUnit: pitch, sourceOutputNumber: 0, destInputNumber: 0)
            check(AudioUnitSetProperty(unit, kAudioUnitProperty_MakeConnection, kAudioUnitScope_Input, 0,
                                       &connection, UInt32(MemoryLayout<AudioUnitConnection>.size)),
                  "connect time-pitch unit")
            check(AudioUnitInitialize(pitch), "initialize time-pitch unit")
        } else {
            check(AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0,
                                       &callback, callbackSize), "set render callback")
        }
        check(AudioUnitInitialize(unit), "initialize audio output")
        check(AudioOutputUnitStart(unit), "start audio output")
        readyAt = now()
    }

    private func check(_ status: OSStatus, _ what: String) {
        if status != noErr { die("could not \(what) (OSStatus \(status))") }
    }

    func append(_ data: Data) {
        os_unfair_lock_lock(lock)
        if head > 1 << 20 {
            fifo.removeFirst(head)
            head = 0
        }
        fifo.append(contentsOf: data)
        os_unfair_lock_unlock(lock)
    }

    /// No more audio is coming: `drained` fires once the queue is empty.
    func end() {
        os_unfair_lock_lock(lock)
        inputEnded = true
        os_unfair_lock_unlock(lock)
    }

    private func render(into destination: UnsafeMutableRawPointer, bytes: Int) {
        os_unfair_lock_lock(lock)
        let wanted = bytes / outFrameBytes
        let available = (fifo.count - head) / frameBytes
        if !primed, available * frameBytes >= prebufferBytes || inputEnded { primed = available > 0 }
        let frames = primed ? min(available, wanted) : 0
        if frames > 0 {
            fifo.withUnsafeBytes { queue in
                let source = queue.baseAddress! + head
                if outFrameBytes == frameBytes {
                    memcpy(destination, source, frames * frameBytes)
                } else {
                    let samples = destination.assumingMemoryBound(to: Float32.self)
                    for index in 0..<frames {
                        samples[index] = Float32(source.loadUnaligned(fromByteOffset: index * 2, as: Int16.self)) / 32768
                    }
                }
            }
            head += frames * frameBytes
            renderedBytes += frames * frameBytes
            if firstRenderAt == nil { firstRenderAt = now() }
        }
        if frames < wanted {
            memset(destination + frames * outFrameBytes, 0, (wanted - frames) * outFrameBytes)
            if primed, !inputEnded { underruns += 1 }
        }
        let finished = inputEnded && fifo.count - head < frameBytes && !drainSignalled
        if finished { drainSignalled = true }
        os_unfair_lock_unlock(lock)
        if finished { drained.signal() }
    }

    /// Seconds of audio still inside the device after the queue empties.
    func tail() -> Double {
        var device = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
                                   &device, &size) == noErr else { return 0.2 }
        func frames(_ selector: AudioObjectPropertySelector) -> Double {
            var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioDevicePropertyScopeOutput,
                                                     mElement: kAudioObjectPropertyElementMain)
            var value = UInt32(0)
            var size = UInt32(MemoryLayout<UInt32>.size)
            return AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr ? Double(value) : 0
        }
        var rateAddress = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyNominalSampleRate,
                                                     mScope: kAudioObjectPropertyScopeGlobal,
                                                     mElement: kAudioObjectPropertyElementMain)
        var rate = Float64(48000)
        var rateSize = UInt32(MemoryLayout<Float64>.size)
        _ = AudioObjectGetPropertyData(device, &rateAddress, 0, nil, &rateSize, &rate)
        let buffered = frames(kAudioDevicePropertyLatency) + frames(kAudioDevicePropertySafetyOffset)
            + 2 * frames(kAudioDevicePropertyBufferFrameSize)
        // The time-pitch unit holds a little audio of its own; silence pushes it through.
        var pitchLatency = Float64(0)
        if let pitchUnit {
            var latencySize = UInt32(MemoryLayout<Float64>.size)
            _ = AudioUnitGetProperty(pitchUnit, kAudioUnitProperty_Latency, kAudioUnitScope_Global, 0,
                                     &pitchLatency, &latencySize)
            pitchLatency += 0.1
        }
        return min(1.5, buffered / max(rate, 8000) + 0.05 + pitchLatency)
    }

    func stop() {
        AudioOutputUnitStop(unit)
    }
}

// MARK: network

/// Feeds the response body to the player as each packet arrives.
final class Stream: NSObject, URLSessionDataDelegate {
    var player: Player?
    private var pending = Data()
    private let lock = NSLock()
    private var status = 0
    private var errorBody = Data()

    let finished = DispatchSemaphore(value: 0)
    private(set) var headersAt: Double?
    private(set) var firstBytesAt: Double?
    private(set) var bytes = 0
    private(set) var failure: String?
    private(set) var metrics: URLSessionTaskTransactionMetrics?

    /// Audio that arrived before the player existed is handed over here.
    func attach(_ player: Player) {
        lock.lock()
        self.player = player
        if !pending.isEmpty { player.append(pending) }
        pending = Data()
        lock.unlock()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        status = (response as? HTTPURLResponse)?.statusCode ?? 0
        headersAt = now()
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard status == 200 else {
            errorBody.append(data)
            return
        }
        if firstBytesAt == nil { firstBytesAt = now() }
        bytes += data.count
        lock.lock()
        if let player { player.append(data) } else { pending.append(data) }
        lock.unlock()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        self.metrics = metrics.transactionMetrics.last
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            failure = error.localizedDescription
        } else if status != 200 {
            let body = String(data: errorBody, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            failure = "Cartesia returned HTTP \(status)\(body.isEmpty ? "" : ": \(body)")"
        }
        finished.signal()
    }
}

// MARK: configuration

let environment = ProcessInfo.processInfo.environment
let dotfiles = environment["DOTFILES_DIR"] ?? NSHomeDirectory() + "/dotfiles"

func loadVoices() -> (fallback: String, profiles: [String: [String: Any]]) {
    let path = environment["SPEAK_VOICES"] ?? dotfiles + "/src/speak/voices.json"
    guard let data = FileManager.default.contents(atPath: path) else { die("cannot read \(path)") }
    guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let profiles = root["profiles"] as? [String: [String: Any]],
          let fallback = root["default"] as? String
    else { die("\(path) must be {\"default\": id, \"profiles\": {id: {...}}}") }
    guard profiles[fallback] != nil else { die("default profile '\(fallback)' is not in \(path)") }
    return (fallback, profiles)
}

/// CARTESIA_API_KEY from the environment, else from dotfiles/.env (GUI-launched callers).
func apiKey() -> String {
    if let key = environment["CARTESIA_API_KEY"], !key.isEmpty { return key }
    if let text = try? String(contentsOfFile: dotfiles + "/.env", encoding: .utf8) {
        for line in text.split(separator: "\n") {
            var entry = line.trimmingCharacters(in: .whitespaces)
            if entry.hasPrefix("export ") { entry = String(entry.dropFirst(7)).trimmingCharacters(in: .whitespaces) }
            guard entry.hasPrefix("CARTESIA_API_KEY=") else { continue }
            let value = entry.dropFirst("CARTESIA_API_KEY=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
            if !value.isEmpty { return value }
        }
    }
    die("CARTESIA_API_KEY is not set. Add a standard Cartesia API key (not the admin key) to \(dotfiles)/.env")
}

// MARK: main

let launchMs = environment["SPEAK_TIMING"] != nil ? launchOverhead() : 0
let voices = loadVoices()
let known = voices.profiles.keys.sorted().map { "--\($0)" }.joined(separator: " ")
let usage = "usage: speak [--<voice-profile>] <text to speak>\nvoice profiles: \(known) (default: --\(voices.fallback))"

var arguments = Array(CommandLine.arguments.dropFirst())
var profileID = voices.fallback
if let first = arguments.first, first.hasPrefix("-") {
    arguments.removeFirst()
    if first == "-h" || first == "--help" {
        print(usage)
        exit(0)
    }
    // `--` ends the flags, so text that itself starts with a dash can be spoken.
    if first != "--" {
        let id = String(first.drop(while: { $0 == "-" }))
        guard first.hasPrefix("--"), voices.profiles[id] != nil else {
            die("unknown voice profile '\(first)'\n\(usage)", code: 2)
        }
        profileID = id
    }
}
var text = arguments.joined(separator: " ")
if arguments.isEmpty, isatty(STDIN_FILENO) == 0 {
    text = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
}
text = text.trimmingCharacters(in: .whitespacesAndNewlines)
if text.isEmpty { die(usage, code: 2) }

// The profile is the request body, minus `_` keys (local to speak), plus the transcript.
let profile = voices.profiles[profileID]!
let playbackRate = min(3, max(0.5, (profile["_playback_rate"] as? NSNumber)?.doubleValue ?? 1))
var body = profile.filter { !$0.key.hasPrefix("_") }
let format = body["output_format"] as? [String: Any]
    ?? ["container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000]
body["output_format"] = format
body["transcript"] = text
let encoding = format["encoding"] as? String ?? ""
guard format["container"] as? String == "raw", encoding == "pcm_s16le" || encoding == "pcm_f32le",
      let sampleRate = (format["sample_rate"] as? NSNumber)?.doubleValue
else { die("profile '\(profileID)': output_format must be raw pcm_s16le or pcm_f32le with a sample_rate") }

// Opening the output device is the slowest local step (100 ms warm, 500 ms for
// idle Bluetooth), so it starts first and runs while the request travels.
let stream = Stream()
let playerReady = DispatchSemaphore(value: 0)
var player: Player!
Thread.detachNewThread {
    player = Player(sampleRate: sampleRate, float: encoding == "pcm_f32le", rate: playbackRate,
                    prebufferMs: Double(environment["SPEAK_PREBUFFER_MS"] ?? "") ?? 0)
    stream.attach(player)
    playerReady.signal()
}

var request = URLRequest(url: URL(string: environment["SPEAK_URL"] ?? apiURL)!)
request.httpMethod = "POST"
request.httpBody = try! JSONSerialization.data(withJSONObject: body)
request.setValue("Bearer \(apiKey())", forHTTPHeaderField: "Authorization")
request.setValue(apiVersion, forHTTPHeaderField: "Cartesia-Version")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.timeoutInterval = 30

let configuration = URLSessionConfiguration.ephemeral
configuration.urlCache = nil
configuration.httpCookieStorage = nil
let queue = OperationQueue()
queue.maxConcurrentOperationCount = 1
let session = URLSession(configuration: configuration, delegate: stream, delegateQueue: queue)
session.dataTask(with: request).resume()
let sentAt = now()

stream.finished.wait()
let streamDoneAt = now()
if stream.bytes == 0, let failure = stream.failure { die(failure) }
playerReady.wait()
player.end()
if stream.bytes > 0 {
    player.drained.wait()
    Thread.sleep(forTimeInterval: player.tail())
}
player.stop()

if environment["SPEAK_TIMING"] != nil {
    func ms(_ value: Double?) -> String { value.map { String(format: "%.0f", $0 + launchMs) } ?? "-" }
    func span(_ from: Date?, _ to: Date?) -> String {
        guard let from, let to else { return "-" }
        return String(format: "%.0f", to.timeIntervalSince(from) * 1e3)
    }
    let m = stream.metrics
    let frameBytes = encoding == "pcm_f32le" ? 4.0 : 2.0
    let report = """
        speak timing, ms since exec (profile \(profileID), \(text.count) chars)
          main reached         \(ms(0))
          request started      \(ms(sentAt))
          audio device ready   \(ms(player.readyAt))
          response headers     \(ms(stream.headersAt))
          first audio bytes    \(ms(stream.firstBytesAt))
          first sample played  \(ms(player.firstRenderAt))
          stream complete      \(ms(streamDoneAt))
        network: dns \(span(m?.domainLookupStartDate, m?.domainLookupEndDate)) \
        connect+tls \(span(m?.connectStartDate, m?.connectEndDate)) \
        (tls \(span(m?.secureConnectionStartDate, m?.secureConnectionEndDate))) \
        server wait \(span(m?.requestEndDate, m?.responseStartDate)) \
        protocol \(m?.networkProtocolName ?? "-")
        audio: \(String(format: "%.2f", Double(stream.bytes) / frameBytes / sampleRate))s \
        \(encoding)@\(Int(sampleRate)) played at \(playbackRate)x underruns \(player.underruns)

        """
    FileHandle.standardError.write(Data(report.utf8))
}

if let failure = stream.failure { die(failure) }
