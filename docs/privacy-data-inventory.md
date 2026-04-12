# Privacy Data Inventory

Date: 2026-04-13

This document summarizes user data handled by the app and Worker for release/privacy label preparation.

## Data Categories

| Category | Data | Source | Destination | Purpose | Stored |
|---|---|---|---|---|---|
| Account identity | WorkOS user ID, email, first/last name | WorkOS AuthKit | App Keychain, in-memory app state | Authentication and entitlement lookup | Yes (Keychain) |
| Auth credentials | Access token, refresh token, worker session token | Worker `/auth/token` | App Keychain (`ThisDeviceOnly`) | Authenticated API calls and token refresh | Yes (Keychain) |
| Audio input | Push-to-talk microphone PCM audio | User microphone | OpenAI Realtime API | Transcription + model reasoning | Not persisted by app |
| Screen content | JPEG screenshots (multi-monitor) | ScreenCaptureKit | OpenAI Realtime API | Visual grounding + pointing | Not persisted by app |
| Model output | Transcript text and audio response deltas | OpenAI Realtime API | In-memory app state + audio playback | User response playback | Not persisted long-term |
| Billing metadata | Authenticated user ID/email + entitlement periods | App + Polar webhooks | Worker KV (`SKILLY_ENTITLEMENTS`) | Access control and usage entitlement | Yes (Worker KV) |
| Analytics (optional) | Event names, counters, user_id, email in identify call, usage/session metrics | App runtime | PostHog | Product telemetry and usage analytics | Stored by PostHog when enabled |

## Consent and Controls

- `analyticsEnabled` toggles analytics globally.
- `beta_terms_consent` gates beta telemetry events (`skilly_turn_completed`, `skilly_session_ended`).
- Permissions are explicitly requested for microphone, screen capture, speech recognition, and accessibility.

## Sensitive Data Handling Notes

- Raw OpenAI API key is not returned to the app. Worker returns a short-lived Realtime client secret.
- Worker endpoints that expose billing/AI capability require authenticated worker session tokens.
- OAuth callback now validates `state` before token exchange.

## Release Label Inputs

Use this inventory to populate platform privacy labels and policy disclosures, especially:

- Identifiers: user ID and email
- Diagnostics/analytics fields
- Audio and screen capture processing to OpenAI
