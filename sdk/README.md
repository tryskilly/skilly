# Skilly Mobile SDK

This directory contains generated mobile bindings and sample integrations for the shared Rust core.

## Generate Bindings

From repo root:

```bash
./scripts/generate-mobile-sdk-bindings.sh
```

## Validate Consumer Runtime

```bash
./scripts/validate-mobile-sdk-consumers.sh
```

## Build Distribution Artifacts

```bash
./scripts/package-mobile-sdk.sh
```

Outputs:
- `sdk/ios/generated/`
- `sdk/android/generated/`

The generated API currently exposes:
- policy gating (`can_start_turn_for_mobile`, trial/cap checks)
- realtime replay summaries (`replay_realtime_events_for_mobile`, `replay_realtime_events_from_json_for_mobile`)

## Samples

- `sdk/ios/sample/PolicyAndRealtimeExample.swift`
- `sdk/android/sample/src/main/kotlin/app/tryskilly/sdk/PolicyAndRealtimeExample.kt`
