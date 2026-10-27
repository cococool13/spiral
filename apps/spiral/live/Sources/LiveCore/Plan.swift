import Foundation

public enum Names {
    public static let bundleID = "app.spiral.wallpaper.live"
    public static let appBundleID = "app.spiral.wallpaper"
    /// Darwin notification the app posts after it rewrites `job.json`.
    public static let jobChanged = "app.spiral.wallpaper.live.job"
}

/// Where the helper reads and writes. The root is the Spiral app's data
/// directory: `--root <dir>` when the app launches the helper, `SPIRAL_ROOT`
/// for development, otherwise the app's Application Support folder (the case
/// at login, where there are no arguments).
public struct LivePaths: Equatable {
    public let root: URL

    public init(root: URL) {
        self.root = root
    }

    public static func resolve(arguments: [String], environment: [String: String], home: URL) -> LivePaths {
        if let index = arguments.firstIndex(of: "--root"), index + 1 < arguments.count {
            let value = arguments[index + 1]
            if value.hasPrefix("/") {
                return LivePaths(root: URL(fileURLWithPath: value, isDirectory: true))
            }
        }
        if let value = environment["SPIRAL_ROOT"], value.hasPrefix("/") {
            return LivePaths(root: URL(fileURLWithPath: value, isDirectory: true))
        }
        let support = home
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("Application Support", isDirectory: true)
            .appendingPathComponent(Names.appBundleID, isDirectory: true)
        return LivePaths(root: support)
    }

    public var live: URL { root.appendingPathComponent("live", isDirectory: true) }
    public var job: URL { live.appendingPathComponent("job.json") }
    public var status: URL { live.appendingPathComponent("status.json") }
    public var activity: URL { root.appendingPathComponent("activity.jsonl") }
}

/// One display as the helper sees it on the Space in front.
public struct ScreenState: Equatable {
    public let id: String
    public let current: String?

    public init(id: String, current: String?) {
        self.id = id
        self.current = current
    }
}

/// What the helper should do with a job, decided without AppKit.
public enum Decision: Equatable {
    case pin(Still)
    case exit(reason: String)
}

public enum Planner {
    public static func decide(job: Job?, fileExists: (String) -> Bool) -> Decision {
        guard let job else { return .exit(reason: "no_job") }
        guard let still = job.pinnedStill else { return .exit(reason: "unpinned") }
        guard fileExists(still.path) else { return .exit(reason: "file_missing") }
        return .pin(still)
    }

    /// Screens whose desktop on this Space is not the pinned file yet.
    /// Setting only these keeps a Space switch to zero work when nothing
    /// changed.
    public static func screensToSet(_ screens: [ScreenState], still: Still) -> [String] {
        let want = canonical(still.path)
        return screens.filter { screen in
            guard let current = screen.current else { return true }
            return canonical(current) != want
        }.map(\.id)
    }

    static func canonical(_ path: String) -> String {
        URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
    }
}

/// The menu-bar item's words. One place, so the copy is tested.
public enum MenuCopy {
    public static let header = "Spiral"
    public static let pinned = "Wallpaper pinned to all Spaces"
    public static let unpin = "Unpin"
    public static let openSpiral = "Open Spiral"
    public static let quit = "Quit"
    public static let tooltip = "Spiral Live keeps your wallpaper on every Space."

    public static var titles: [String] { [header, pinned, unpin, openSpiral, quit] }
}
