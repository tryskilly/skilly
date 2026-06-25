// swift-tools-version:5.9
import PackageDescription

// The embeddable Skilly companion for iOS apps (Phase 9.1 skeleton). A mobile-app
// owner adds this package; their users get the in-app tutor/guide. The iOS analog
// of @skilly/web. The shared Rust brain (core/mobile-sdk UniFFI) is wired in 9.3.
let package = Package(
    name: "SkillyCompanion",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "SkillyCompanion", targets: ["SkillyCompanion"])
    ],
    targets: [
        .target(name: "SkillyCompanion")
    ]
)
