import Foundation

/// One line in `<root>/activity.jsonl`, the log the app and the helper share
/// (spec §11). Structure, not sentences: the app's UI writes the words.
public struct ActivityLine: Codable, Equatable {
    public var v = 1
    public var at: String
    public var actor = "live"
    public var kind: String
    public var action: String
    public var reason: String?
    public var result: String
    public var code: String?

    public init(at: Date, kind: String, action: String, reason: String? = nil, result: String = "ok", code: String? = nil) {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime]
        self.at = format.string(from: at)
        self.kind = kind
        self.action = action
        self.reason = reason
        self.result = result
        self.code = code
    }

    public func encoded() -> Data? {
        guard var data = try? JSONEncoder.spiral.encode(self) else { return nil }
        data.append(0x0A)
        return data.count < 4096 ? data : nil
    }
}

public enum ActivityLog {
    static let rotateAt = 1_048_576

    /// Appends with O_APPEND so the app and the helper can both write.
    /// Failing to log never stops the helper.
    public static func append(_ line: ActivityLine, to url: URL) {
        guard let data = line.encoded() else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let size = (try? fm.attributesOfItem(atPath: url.path))?[.size] as? Int, size >= rotateAt {
            let old = url.appendingPathExtension("1")
            try? fm.removeItem(at: old)
            try? fm.moveItem(at: url, to: old)
        }
        let fd = open(url.path, O_WRONLY | O_APPEND | O_CREAT, 0o600)
        guard fd >= 0 else { return }
        defer { close(fd) }
        _ = data.withUnsafeBytes { write(fd, $0.baseAddress, data.count) }
    }
}
