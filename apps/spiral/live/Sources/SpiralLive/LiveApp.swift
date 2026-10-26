import AppKit
import LiveCore
import ServiceManagement

/// Spiral Live. Rules (AGENTS.md, spec §3):
/// - The menu-bar item exists before any work. No item, no work.
/// - No network calls. It reads one job file and sets local files.
/// - Nothing to do means exit within a second.
/// - No timers: it wakes only for Space, screen, wake and job-file events.
final class LiveApp: NSObject, NSApplicationDelegate {
    private let paths: LivePaths
    private var statusItem: NSStatusItem?
    private var pinner: StillPinner?
    private var job: Job?
    private var applied = 0
    private var loginItem = "off"
    private var observers: [(NotificationCenter, NSObjectProtocol)] = []
    private var stopping = false

    init(paths: LivePaths) {
        self.paths = paths
    }

    // MARK: Lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        if anotherCopyIsRunning() {
            // The running copy re-reads the job; this one has nothing to add.
            postJobChanged()
            exit(0)
        }
        guard makeStatusItem() else {
            writeStatus(running: false, error: "menu_bar_failed")
            log(kind: "live", action: "stopped", reason: "menu_bar_failed", result: "error")
            exit(3)
        }
        let job = Job.read(paths.job)
        switch Planner.decide(job: job, fileExists: FileManager.default.fileExists(atPath:)) {
        case .exit(let reason):
            self.job = job
            stop(reason: reason)
        case .pin(let still):
            self.job = job
            pinner = StillPinner(still: still)
            observe()
            log(kind: "live", action: "started", reason: "pin_still")
            syncLoginItem()
            refreshNowAndSoon()
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !stopping {
            stopping = true
            writeStatus(running: false, error: nil)
            log(kind: "live", action: "stopped", reason: "quit")
        }
        return .terminateNow
    }

    private func stop(reason: String) {
        guard !stopping else { return }
        stopping = true
        for (center, token) in observers {
            center.removeObserver(token)
        }
        observers.removeAll()
        CFNotificationCenterRemoveEveryObserver(
            CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
        if job?.pinnedStill == nil {
            // Unpinned (here or in the app): no login item either.
            syncLoginItem(want: false)
        }
        writeStatus(running: false, error: pinner?.lastError)
        log(kind: "live", action: "stopped", reason: reason)
        NSApp.terminate(nil)
    }

    // MARK: Events

    private func observe() {
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [
            NSWorkspace.activeSpaceDidChangeNotification,
            NSWorkspace.didWakeNotification,
            NSWorkspace.screensDidWakeNotification,
        ] {
            let token = workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.refreshNowAndSoon()
            }
            observers.append((workspace, token))
        }
        let screens = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.refreshNowAndSoon()
        }
        observers.append((NotificationCenter.default, screens))

        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            { _, observer, _, _, _ in
                guard let observer else { return }
                let app = Unmanaged<LiveApp>.fromOpaque(observer).takeUnretainedValue()
                DispatchQueue.main.async { app.jobChanged() }
            },
            Names.jobChanged as CFString,
            nil,
            .deliverImmediately
        )
    }

    /// The app rewrote job.json: pin a new still, change the login item, or stop.
    private func jobChanged() {
        guard !stopping else { return }
        let next = Job.read(paths.job)
        job = next
        switch Planner.decide(job: next, fileExists: FileManager.default.fileExists(atPath:)) {
        case .exit(let reason):
            stop(reason: reason)
        case .pin(let still):
            if let pinner {
                pinner.update(still)
            } else {
                pinner = StillPinner(still: still)
            }
            syncLoginItem()
            refreshNowAndSoon()
        }
    }

    /// Another process's wallpaper change reaches `desktopImageURL(for:)`
    /// here about a second late (measured on macOS 27.0.1), so one read can
    /// say "already pinned" when it is not. Check again once, shortly after.
    /// A one-shot follow-up per event, not a repeating timer.
    private func refreshNowAndSoon() {
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.refresh()
        }
    }

    private func refresh() {
        guard !stopping, let pinner else { return }
        applied += pinner.refresh()
        writeStatus(running: true, error: pinner.lastError)
    }

    // MARK: Menu bar

    private func makeStatusItem() -> Bool {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        guard let button = item.button else { return false }
        let image = NSImage(systemSymbolName: "pin.fill", accessibilityDescription: "Spiral Live")
        image?.isTemplate = true
        button.image = image
        button.toolTip = MenuCopy.tooltip

        let menu = NSMenu()
        menu.autoenablesItems = false
        let header = NSMenuItem(title: MenuCopy.header, action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        let state = NSMenuItem(title: MenuCopy.pinned, action: nil, keyEquivalent: "")
        state.isEnabled = false
        menu.addItem(state)
        menu.addItem(.separator())
        menu.addItem(entry(MenuCopy.unpin, #selector(unpin)))
        menu.addItem(entry(MenuCopy.openSpiral, #selector(openSpiral)))
        menu.addItem(.separator())
        menu.addItem(entry(MenuCopy.quit, #selector(quit), key: "q"))
        item.menu = menu
        item.isVisible = true
        statusItem = item
        return true
    }

    private func entry(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.isEnabled = true
        return item
    }

    /// Turns the pin off for good: the app's switch reads job.json and shows off.
    @objc private func unpin() {
        let seq = (job?.seq ?? 0) + 1
        let off = (job ?? Job(seq: 0, mode: Mode.off, still: nil, keepAfterRestart: false)).turnedOff(seq: seq)
        try? off.write(paths.job)
        job = off
        stop(reason: "unpinned")
    }

    @objc private func openSpiral() {
        let workspace = NSWorkspace.shared
        let outer = Bundle.main.bundleURL
            .deletingLastPathComponent() // LoginItems
            .deletingLastPathComponent() // Library
            .deletingLastPathComponent() // Contents
            .deletingLastPathComponent() // Spiral.app
        let target: URL?
        if outer.pathExtension == "app" {
            target = outer
        } else {
            target = workspace.urlForApplication(withBundleIdentifier: Names.appBundleID)
        }
        guard let target else { return }
        workspace.openApplication(at: target, configuration: NSWorkspace.OpenConfiguration())
    }

    /// Stops the helper now. The pin stays on: Spiral starts the helper again
    /// the next time Wallpaper opens, or at login when that switch is on.
    @objc private func quit() {
        stop(reason: "quit")
    }

    // MARK: Login item

    private func syncLoginItem(want: Bool? = nil) {
        let wanted = want ?? (job?.keepAfterRestart == true && job?.pinnedStill != nil)
        guard Bundle.main.bundleIdentifier == Names.bundleID else {
            loginItem = "off"
            return
        }
        let service = SMAppService.mainApp
        let before = service.status
        do {
            if wanted, before != .enabled {
                try service.register()
            } else if !wanted, before == .enabled || before == .requiresApproval {
                try service.unregister()
            }
        } catch {
            loginItem = "failed"
            log(kind: "login", action: wanted ? "registered" : "removed", result: "error", code: "login_item_failed")
            return
        }
        let after = service.status
        // Never registered reads as notFound; to the person that is just "off".
        loginItem = !wanted && after == .notFound ? "off" : Self.word(after)
        if before != after {
            log(kind: "login", action: after == .enabled || after == .requiresApproval ? "registered" : "removed")
        }
    }

    static func word(_ status: SMAppService.Status) -> String {
        switch status {
        case .enabled: return "enabled"
        case .requiresApproval: return "requiresApproval"
        case .notFound: return "notFound"
        case .notRegistered: return "off"
        @unknown default: return "off"
        }
    }

    // MARK: Files

    private func anotherCopyIsRunning() -> Bool {
        guard Bundle.main.bundleIdentifier == Names.bundleID else { return false }
        let me = ProcessInfo.processInfo.processIdentifier
        return NSRunningApplication.runningApplications(withBundleIdentifier: Names.bundleID)
            .contains { $0.processIdentifier != me && !$0.isTerminated }
    }

    private func postJobChanged() {
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(Names.jobChanged as CFString), nil, nil, true)
    }

    private func writeStatus(running: Bool, error: String?) {
        let status = Status(
            pid: ProcessInfo.processInfo.processIdentifier,
            running: running,
            ackSeq: job?.seq ?? 0,
            pinned: running ? pinner?.still.path : nil,
            loginItem: loginItem,
            applied: applied,
            error: error
        )
        try? status.write(paths.status)
    }

    private func log(kind: String, action: String, reason: String? = nil, result: String = "ok", code: String? = nil) {
        ActivityLog.append(
            ActivityLine(at: Date(), kind: kind, action: action, reason: reason, result: result, code: code),
            to: paths.activity)
    }
}
