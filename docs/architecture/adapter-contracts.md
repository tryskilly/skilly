# Adapter Contracts: Native Shell Boundaries

## Purpose
Define the interface boundary between the shared Rust core and platform-native shells.
This contract keeps policy and orchestration deterministic while allowing each OS shell
to implement its own UI, permissions, and device capabilities.

## Adapter Surfaces

### 1. Auth Adapter
- Acquire and refresh authenticated user session from platform shell credentials.
- Required fields:
  - `workos_user_id`
  - `session_token`
  - `expires_at`
- Failure must be explicit and recoverable by host UI.

### 2. Entitlement Adapter
- Fetch entitlement snapshot from worker API and map to `EntitlementState`.
- Required fields:
  - entitlement status (`none`, `trial`, `active`, `canceled`, `expired`)
  - period boundaries
  - cap metadata

### 3. Capture Adapter
- Capture current screen context for active turn.
- Contract output:
  - `display_id`
  - image bytes + encoding metadata
  - capture timestamp
- Capability gating:
  - if unavailable, shell must surface a permission/status message before turn start.

### 4. Hotkey Adapter
- Listen for global push-to-talk start/end signals.
- Contract events:
  - `hotkey_pressed`
  - `hotkey_released`

### 5. Overlay Adapter
- Render pointer and guidance affordances for `[POINT:x,y:label:screen]` directives.
- Contract methods:
  - show pointer
  - animate to coordinate
  - hide pointer

### 6. Audio Adapter
- Stream input audio chunks to realtime transport and play output audio deltas.
- Contract events:
  - microphone stream started/stopped
  - playback started/stopped

### 7. Permission Adapter
- Expose OS permission status used by shell readiness checks.
- Minimum statuses:
  - screen capture permission
  - accessibility/hotkey permission
  - microphone permission

## Core-to-Shell Handshake
1. Shell acquires auth session.
2. Shell fetches entitlement snapshot.
3. Shell asks Rust policy if turn can start.
4. If allowed, shell starts capture/hotkey/audio and emits realtime events.
5. Rust realtime state machine governs turn lifecycle transitions.

## Bootstrap Scope (Phase 4)
- Current shell bootstrap crates use mocked host adapters to validate:
  - auth session acquisition
  - entitlement-driven turn permission
  - turn-start lifecycle via `core/realtime` replay

## Development Status
- Windows shell now routes through explicit adapter modules for:
  - capture
  - hotkey
  - overlay
  - audio input/output
  - permissions
- Linux shell now routes through explicit adapter modules for the same surfaces.
- Capability-aware gating is enforced before turn start; critical adapter blockers abort flow with explicit reasons.
- Final-phase work focuses on runtime validation on real platform environments.
