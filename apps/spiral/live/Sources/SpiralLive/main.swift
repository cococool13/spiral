import AppKit
import LiveCore

let paths = LivePaths.resolve(
    arguments: CommandLine.arguments,
    environment: ProcessInfo.processInfo.environment,
    home: FileManager.default.homeDirectoryForCurrentUser
)
let app = NSApplication.shared
// LSUIElement in Info.plist does the same for the bundle; this covers a bare
// `swift run` during development.
app.setActivationPolicy(.accessory)
let delegate = LiveApp(paths: paths)
app.delegate = delegate
app.run()
