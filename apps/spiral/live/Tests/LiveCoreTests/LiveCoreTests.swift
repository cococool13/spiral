import Foundation
import XCTest
@testable import LiveCore

/// The fixtures are the contract with the Rust side: `src/live.rs` decodes
/// the same files in `cargo test`.
final class LiveCoreTests: XCTestCase {
    func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "fixtures/\(name)", withExtension: "json"))
        return try Data(contentsOf: url)
    }

    func testThePinFixtureDecodesToAPinnedStill() throws {
        let job = try XCTUnwrap(Job.decode(fixture("job-pin")))
        XCTAssertEqual(job.seq, 1_761_487_200_000)
        XCTAssertEqual(job.pinnedStill?.fit, .fill)
        XCTAssertTrue(job.pinnedStill?.path.hasSuffix("/live/pinned/w-abc123.jpg") == true)
        XCTAssertFalse(job.keepAfterRestart)
    }

    func testTheOffFixtureHasNothingToDo() throws {
        let job = try XCTUnwrap(Job.decode(fixture("job-off")))
        XCTAssertNil(job.pinnedStill)
        XCTAssertEqual(Planner.decide(job: job, fileExists: { _ in true }), .exit(reason: "unpinned"))
    }

    func testTheStatusFixtureDecodes() throws {
        let status = try JSONDecoder().decode(Status.self, from: fixture("status-running"))
        XCTAssertTrue(status.running)
        XCTAssertEqual(status.ackSeq, 1_761_487_200_000)
    }

    func testAnUnknownModeOrVersionIsNotGuessed() {
        var job = Job(seq: 1, mode: "live", still: Still(path: "/a.jpg", fit: .fill), keepAfterRestart: false)
        XCTAssertNil(job.pinnedStill)
        job.mode = Mode.pinStill
        job.v = 2
        XCTAssertNil(job.pinnedStill)
        job.v = 1
        job.still = Still(path: "relative.jpg", fit: .fill)
        XCTAssertNil(job.pinnedStill)
    }

    func testNoJobOrAMissingFileExits() {
        XCTAssertEqual(Planner.decide(job: nil, fileExists: { _ in true }), .exit(reason: "no_job"))
        let job = Job(seq: 1, mode: Mode.pinStill, still: Still(path: "/gone.jpg", fit: .fit), keepAfterRestart: false)
        XCTAssertEqual(Planner.decide(job: job, fileExists: { _ in false }), .exit(reason: "file_missing"))
        XCTAssertEqual(Planner.decide(job: job, fileExists: { _ in true }), .pin(Still(path: "/gone.jpg", fit: .fit)))
    }

    func testOnlyScreensThatDoNotShowTheStillAreSet() {
        let still = Still(path: "/w/pin.jpg", fit: .fill)
        let screens = [
            ScreenState(id: "1", current: "/w/pin.jpg"),
            ScreenState(id: "2", current: "/w/other.jpg"),
            ScreenState(id: "3", current: nil),
            ScreenState(id: "4", current: "/w/./pin.jpg"),
        ]
        XCTAssertEqual(Planner.screensToSet(screens, still: still), ["2", "3"])
    }

    func testTurningOffClearsTheStillAndTheLoginItem() {
        let job = Job(seq: 5, mode: Mode.pinStill, still: Still(path: "/a.jpg", fit: .fill), keepAfterRestart: true)
        let off = job.turnedOff(seq: 6)
        XCTAssertEqual(off.mode, Mode.off)
        XCTAssertNil(off.still)
        XCTAssertFalse(off.keepAfterRestart)
        XCTAssertEqual(off.seq, 6)
    }

    func testTheRootComesFromTheArgumentThenTheEnvironmentThenApplicationSupport() {
        let home = URL(fileURLWithPath: "/Users/x")
        XCTAssertEqual(
            LivePaths.resolve(arguments: ["Spiral Live", "--root", "/tmp/r"], environment: ["SPIRAL_ROOT": "/e"], home: home).root.path,
            "/tmp/r")
        XCTAssertEqual(LivePaths.resolve(arguments: [], environment: ["SPIRAL_ROOT": "/e"], home: home).root.path, "/e")
        let fallback = LivePaths.resolve(arguments: ["--root", "relative"], environment: [:], home: home)
        XCTAssertEqual(fallback.root.path, "/Users/x/Library/Application Support/app.spiral.wallpaper")
        XCTAssertEqual(fallback.job.path, "/Users/x/Library/Application Support/app.spiral.wallpaper/live/job.json")
        XCTAssertEqual(fallback.activity.lastPathComponent, "activity.jsonl")
    }

    func testTheMenuSaysWhatItDoes() {
        XCTAssertEqual(MenuCopy.titles, ["Spiral", "Wallpaper pinned to all Spaces", "Unpin", "Open Spiral", "Quit"])
    }

    func testActivityLinesAreOneShortJsonLine() throws {
        let line = ActivityLine(at: Date(timeIntervalSince1970: 0), kind: "live", action: "started", reason: "pin_still")
        let data = try XCTUnwrap(line.encoded())
        XCTAssertEqual(data.last, 0x0A)
        let text = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("{\"action\":\"started\",\"actor\":\"live\",\"at\":\"1970-01-01T00:00:00Z\""))
        XCTAssertEqual(text.filter { $0 == "\n" }.count, 1)
    }

    func testActivityAppendsAndRotates() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let log = dir.appendingPathComponent("activity.jsonl")
        let line = ActivityLine(at: Date(), kind: "live", action: "stopped", reason: "quit")
        ActivityLog.append(line, to: log)
        ActivityLog.append(line, to: log)
        XCTAssertEqual(String(decoding: try Data(contentsOf: log), as: UTF8.self).split(separator: "\n").count, 2)
        try Data(count: ActivityLog.rotateAt).write(to: log)
        ActivityLog.append(line, to: log)
        XCTAssertTrue(FileManager.default.fileExists(atPath: log.appendingPathExtension("1").path))
        XCTAssertEqual(String(decoding: try Data(contentsOf: log), as: UTF8.self).split(separator: "\n").count, 1)
    }
}
