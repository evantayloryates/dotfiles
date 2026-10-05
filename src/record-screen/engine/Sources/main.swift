// record-screend: the always-on capture engine behind the record-screen MCP.
// See src/record-screen/README.md for the protocol and layout.
import AppKit

let app = NSApplication.shared
// Never take focus, never show in the Dock. Measured: the usual .accessory
// policy activated a background helper once at launch; .prohibited did not.
app.setActivationPolicy(.prohibited)

let paths = Paths.resolve()
do {
  try paths.ensure()
} catch {
  FileHandle.standardError.write("record-screend: cannot create \(paths.root): \(error)\n".data(using: .utf8)!)
  exit(1)
}
Log.open(paths.log)

guard let lock = InstanceLock(path: paths.lock) else {
  Log.event("exit", ["reason": "another engine holds \(paths.lock)"])
  exit(0)
}

let engine = Engine(paths: paths, lock: lock)
do {
  try engine.start()
} catch {
  Log.event("exit", ["reason": "start failed", "error": "\(error)"])
  exit(1)
}

app.run()
