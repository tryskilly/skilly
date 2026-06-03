# Core Boundaries

This document defines migration boundaries between the existing Swift host and the new shared Rust core.

## Goal
- Keep shipping the macOS host while extracting deterministic, reusable logic to Rust.
- Preserve native platform capability integrations in host shells.

## Ownership Split

### Remains in Native Shells (Platform-specific)
- Screen capture API integration
- Global hotkey registration/listening
- Overlay/window composition and animation
- Permission prompts and OS dialogs
- Device-level audio session details

### Moves to Rust Core (Platform-agnostic)
- Entitlement/trial/cap decision logic
- Admin policy behavior
- Skill prompt composition and budget logic
- Realtime lifecycle orchestration state machine
- Shared telemetry event schema and aggregations

## Contract Model
- Native shell gathers runtime inputs (user ID, entitlement status, usage counters, current capabilities).
- Rust core returns deterministic decisions/events.
- Native shell executes side effects.

## Migration Sequence
1. Policy extraction
2. Skills/prompt extraction
3. Realtime state extraction
4. New platform shell onboarding

## Non-goals for Initial Migration
- Replacing macOS UI layer
- Replacing platform capture/hotkey/overlay with cross-platform abstractions in one step
- Forcing Linux/Windows full visual parity before core parity

