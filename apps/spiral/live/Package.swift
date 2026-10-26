// swift-tools-version:5.9
// Spiral Live: the menu-bar helper that keeps a wallpaper on every Space.
// Build the app bundle with `node scripts/build-live.mjs` from apps/spiral.
import PackageDescription

let package = Package(
    name: "SpiralLive",
    platforms: [.macOS(.v13)],
    targets: [
        // Pure logic: the job file, the plan, the menu words. No AppKit, so
        // `swift test` covers it without a window server.
        .target(name: "LiveCore", path: "Sources/LiveCore"),
        .executableTarget(
            name: "SpiralLive",
            dependencies: ["LiveCore"],
            path: "Sources/SpiralLive"
        ),
        .testTarget(
            name: "LiveCoreTests",
            dependencies: ["LiveCore"],
            path: "Tests/LiveCoreTests",
            resources: [.copy("fixtures")]
        ),
    ]
)
