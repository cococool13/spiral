import AppKit
import LiveCore

/// What draws the desktop. Today only `StillPinner`; live video and shaders
/// (spec §2) will be a second conformer with one window per screen, driven by
/// the same app delegate, job file and menu.
protocol DesktopRenderer: AnyObject {
    /// Make every screen on the Space in front match the job. Returns how
    /// many screens changed.
    func refresh() -> Int
    var lastError: String? { get }
}

/// Keeps one still on every Space with the public
/// `NSWorkspace.setDesktopImageURL(_:for:options:)`.
///
/// That call changes the Space in front only (measured on macOS 27.0.1: it
/// writes a per-Space entry in the wallpaper store). So the helper sets the
/// still again each time a Space comes to the front, and only on screens
/// that do not show it yet.
final class StillPinner: DesktopRenderer {
    private(set) var still: Still
    private(set) var lastError: String?

    init(still: Still) {
        self.still = still
    }

    func update(_ still: Still) {
        self.still = still
    }

    func refresh() -> Int {
        let workspace = NSWorkspace.shared
        let screens = NSScreen.screens
        let states = screens.map { screen in
            ScreenState(id: Self.id(of: screen), current: workspace.desktopImageURL(for: screen)?.path)
        }
        let targets = Set(Planner.screensToSet(states, still: still))
        let url = URL(fileURLWithPath: still.path)
        var changed = 0
        lastError = nil
        for screen in screens where targets.contains(Self.id(of: screen)) {
            do {
                try workspace.setDesktopImageURL(url, for: screen, options: Self.options(still.fit))
                changed += 1
            } catch {
                lastError = "set_failed:\(screen.localizedName)"
            }
        }
        return changed
    }

    static func options(_ fit: Fit) -> [NSWorkspace.DesktopImageOptionKey: Any] {
        // Same two public keys as the app's setter (setter.rs).
        let scaling: NSImageScaling = fit == .center ? .scaleNone : .scaleProportionallyUpOrDown
        return [
            .imageScaling: NSNumber(value: scaling.rawValue),
            .allowClipping: NSNumber(value: fit == .fill),
        ]
    }

    static func id(of screen: NSScreen) -> String {
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        if let number = screen.deviceDescription[key] as? NSNumber {
            return number.stringValue
        }
        return screen.localizedName
    }
}
