import Foundation

/// Unix-domain socket server speaking newline-delimited JSON.
///
///   request:  {"id": 1, "method": "status", "params": {}}
///   response: {"id": 1, "result": {...}}
///          or {"id": 1, "error": {"code": "unknown_method", "message": "..."}}
///
/// A connection may carry many requests; responses can arrive out of order
/// (match them by id). Only processes running as this user may connect.
final class SocketServer: @unchecked Sendable {
  typealias Handler = (_ method: String, _ params: [String: Any]) async throws -> Any

  private let path: String
  private let handler: Handler
  private let queue = DispatchQueue(label: "record-screen.socket")
  private var listenFD: Int32 = -1
  private var acceptSource: DispatchSourceRead?
  private var connections: [Int32: Connection] = [:]

  init(path: String, handler: @escaping Handler) {
    self.path = path
    self.handler = handler
  }

  func start() throws {
    unlink(path)
    listenFD = socket(AF_UNIX, SOCK_STREAM, 0)
    guard listenFD >= 0 else { throw posixError("socket") }
    var addr = sockaddr_un()
    addr.sun_family = sa_family_t(AF_UNIX)
    let capacity = MemoryLayout.size(ofValue: addr.sun_path)
    guard path.utf8.count < capacity else { throw RPCError(code: "socket_path", message: "socket path too long: \(path)") }
    _ = withUnsafeMutableBytes(of: &addr.sun_path) { buf in
      path.withCString { strncpy(buf.baseAddress!.assumingMemoryBound(to: CChar.self), $0, capacity - 1) }
    }
    let previousMask = umask(0o077)
    let bound = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listenFD, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
    }
    umask(previousMask)
    guard bound == 0 else { throw posixError("bind \(path)") }
    chmod(path, 0o600)
    guard listen(listenFD, 32) == 0 else { throw posixError("listen") }
    _ = fcntl(listenFD, F_SETFL, fcntl(listenFD, F_GETFL) | O_NONBLOCK)

    let source = DispatchSource.makeReadSource(fileDescriptor: listenFD, queue: queue)
    source.setEventHandler { [weak self] in self?.acceptPending() }
    source.resume()
    acceptSource = source
  }

  func stop() {
    acceptSource?.cancel()
    if listenFD >= 0 { close(listenFD) }
    unlink(path)
  }

  private func acceptPending() {
    while true {
      let fd = accept(listenFD, nil, nil)
      if fd < 0 { return }
      var uid: uid_t = 0, gid: gid_t = 0
      guard getpeereid(fd, &uid, &gid) == 0, uid == getuid() else {
        close(fd)
        Log.event("rejected_peer", ["uid": uid])
        continue
      }
      var on: Int32 = 1
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
      let conn = Connection(fd: fd, queue: queue, handler: handler) { [weak self] in self?.connections[fd] = nil }
      connections[fd] = conn
      conn.start()
    }
  }

  private func posixError(_ what: String) -> RPCError {
    RPCError(code: "posix", message: "\(what): \(String(cString: strerror(errno)))")
  }
}

private final class Connection: @unchecked Sendable {
  private let fd: Int32
  private let queue: DispatchQueue
  private let handler: SocketServer.Handler
  private let onClose: () -> Void
  private var source: DispatchSourceRead?
  private var buffer = Data()
  private var closed = false
  // A client may send its requests and half-close; answer them before closing.
  private var inflight = 0
  private var peerDone = false
  private var suspended = false

  init(fd: Int32, queue: DispatchQueue, handler: @escaping SocketServer.Handler, onClose: @escaping () -> Void) {
    self.fd = fd
    self.queue = queue
    self.handler = handler
    self.onClose = onClose
  }

  func start() {
    _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)
    let s = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
    s.setEventHandler { [weak self] in self?.readAvailable() }
    s.setCancelHandler { [fd] in close(fd) }
    s.resume()
    source = s
  }

  private func readAvailable() {
    var chunk = [UInt8](repeating: 0, count: 65536)
    let n = read(fd, &chunk, chunk.count)
    if n <= 0 {
      if n < 0 && (errno == EAGAIN || errno == EINTR) { return }
      peerDone = true
      if inflight == 0 { shutdown() } else { source?.suspend(); suspended = true }
      return
    }
    buffer.append(contentsOf: chunk[0..<n])
    while let nl = buffer.firstIndex(of: 0x0A) {
      let line = buffer[buffer.startIndex..<nl]
      buffer.removeSubrange(buffer.startIndex...nl)
      if !line.isEmpty { dispatch(Data(line)) }
    }
    if buffer.count > 4 << 20 {
      Log.event("request_too_large", ["bytes": buffer.count])
      shutdown()
    }
  }

  private func dispatch(_ line: Data) {
    guard let req = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any] else {
      send(["id": NSNull(), "error": ["code": "bad_json", "message": "request is not a JSON object"]])
      return
    }
    let id = req["id"] ?? NSNull()
    guard let method = req["method"] as? String else {
      send(["id": id, "error": ["code": "bad_request", "message": "missing method"]])
      return
    }
    let params = req["params"] as? [String: Any] ?? [:]
    let handler = self.handler
    inflight += 1
    Task {
      let t0 = uptimeNs()
      var reply: [String: Any] = ["id": id]
      do {
        reply["result"] = try await handler(method, params)
      } catch let e as RPCError {
        reply["error"] = ["code": e.code, "message": e.message]
      } catch {
        reply["error"] = ["code": "internal", "message": "\(error)"]
      }
      let ms = Double(uptimeNs() - t0) / 1e6
      Log.event("rpc", ["method": method, "ms": ms, "ok": reply["error"] == nil])
      self.queue.async {
        self.send(reply)
        self.inflight -= 1
        if self.peerDone && self.inflight == 0 { self.shutdown() }
      }
    }
  }

  private func send(_ obj: [String: Any]) {
    guard !closed else { return }
    var data: Data
    do {
      data = try JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    } catch {
      data = try! JSONSerialization.data(withJSONObject: ["id": obj["id"] ?? NSNull(), "error": ["code": "internal", "message": "result is not JSON-serializable"]])
    }
    data.append(0x0A)
    data.withUnsafeBytes { raw in
      var off = 0
      while off < raw.count {
        let w = write(fd, raw.baseAddress! + off, raw.count - off)
        if w > 0 { off += w; continue }
        if w < 0 && (errno == EAGAIN || errno == EINTR) { usleep(500); continue }
        break
      }
    }
  }

  private func shutdown() {
    guard !closed else { return }
    closed = true
    if suspended { source?.resume(); suspended = false }
    source?.cancel()
    onClose()
  }
}
