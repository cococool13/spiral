import Foundation

/// The helper's whole job, written by the Spiral app (Rust, `src/live.rs`) to
/// `<root>/live/job.json`. The helper only reads it, except that Unpin in the
/// menu writes `mode: "off"` so the app's switch follows.
///
/// The shape leaves room for live video and shaders (`mode: "live"` later):
/// an unknown mode reads as "nothing to do", so an old helper exits cleanly
/// instead of guessing.
public struct Job: Codable, Equatable {
    public static let version = 1

    public var v: Int
    /// Bumped by every write. The helper echoes it in `status.json` as
    /// `ackSeq`, so the app knows its change was seen.
    public var seq: UInt64
    public var mode: String
    public var still: Still?
    /// Register Spiral Live as a login item (SMAppService). Off by default.
    public var keepAfterRestart: Bool

    public init(seq: UInt64, mode: String, still: Still?, keepAfterRestart: Bool) {
        self.v = Job.version
        self.seq = seq
        self.mode = mode
        self.still = still
        self.keepAfterRestart = keepAfterRestart
    }

    /// The still to keep on every Space, or nil when there is nothing to do.
    public var pinnedStill: Still? {
        guard v == Job.version, mode == Mode.pinStill else { return nil }
        guard let still, !still.path.isEmpty, still.path.hasPrefix("/") else { return nil }
        return still
    }

    public func turnedOff(seq: UInt64) -> Job {
        Job(seq: seq, mode: Mode.off, still: nil, keepAfterRestart: false)
    }

    public static func decode(_ data: Data) -> Job? {
        try? JSONDecoder().decode(Job.self, from: data)
    }

    public static func read(_ url: URL) -> Job? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return decode(data)
    }

    public func write(_ url: URL) throws {
        try AtomicFile.write(JSONEncoder.spiral.encode(self), to: url)
    }
}

public enum Mode {
    public static let off = "off"
    public static let pinStill = "pinStill"
}

public enum Fit: String, Codable, Equatable {
    case fill, fit, center
}

public struct Still: Codable, Equatable {
    public var path: String
    public var fit: Fit

    public init(path: String, fit: Fit) {
        self.path = path
        self.fit = fit
    }
}

/// What the helper last did, in `<root>/live/status.json`. Written on start,
/// after every job change and on exit; never on a timer.
public struct Status: Codable, Equatable {
    public var v: Int = 1
    public var pid: Int32
    public var running: Bool
    public var ackSeq: UInt64
    public var pinned: String?
    /// `off`, `enabled`, `requiresApproval`, `notFound` or `failed`.
    public var loginItem: String
    /// Spaces and displays the helper set the still on since it started.
    public var applied: Int
    public var error: String?

    public init(pid: Int32, running: Bool, ackSeq: UInt64, pinned: String?, loginItem: String, applied: Int, error: String?) {
        self.pid = pid
        self.running = running
        self.ackSeq = ackSeq
        self.pinned = pinned
        self.loginItem = loginItem
        self.applied = applied
        self.error = error
    }

    public func write(_ url: URL) throws {
        try AtomicFile.write(JSONEncoder.spiral.encode(self), to: url)
    }
}

public enum AtomicFile {
    public static func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
}

extension JSONEncoder {
    static var spiral: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}
