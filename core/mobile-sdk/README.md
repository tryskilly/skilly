# skilly-core-mobile-sdk

UniFFI-exported mobile-facing API surface for selected Skilly shared-core functionality.

## Exposed APIs

- `can_start_turn_for_mobile`
- `trial_is_exhausted_for_mobile`
- `usage_is_over_cap_for_mobile`
- `replay_realtime_events_for_mobile`
- `replay_realtime_events_from_json_for_mobile`

These APIs are intentionally narrow and deterministic, wrapping:
- `skilly-core-policy`
- `skilly-core-realtime`

## Generate Bindings

From repository root:

```bash
./scripts/generate-mobile-sdk-bindings.sh
```
