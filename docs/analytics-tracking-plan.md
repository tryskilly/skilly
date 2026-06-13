# Skilly Analytics Tracking Plan

Last updated: 2026-06-13

## Overview

Tools:
- PostHog: primary product analytics and full-funnel identity stitching.
- GA4 / Google Tag Manager: public marketing-page acquisition and campaign reporting.

Current implementation status:
- macOS app: PostHog implemented through `SkillyAnalytics.swift`.
- Cloudflare Worker: PostHog silent-failure events implemented for backend drift and checkout failures.
- Web dashboard/backend: env-gated PostHog + GA4 scaffolding and server-side dashboard/API events.
- Web SDK: `Skilly.identify()` exists as the public API; tenant/end-user analytics should be wired through this surface.
- Marketing site: implemented in `/Users/engmsaleh/Repos/skilly-web` as an Astro/Netlify site. It uses the same PostHog project as the Mac app, GA4 for acquisition/conversion reporting, and the Worker checkout redirect `tryskilly.app/checkout-success?uid=<WorkOS user id>` to identify checkout success with the same WorkOS user ID.

## Identity Model

Use one PostHog project for Skilly-owned surfaces.

Primary Skilly-owned identity:
- `distinct_id`: WorkOS user ID.
- Applies to marketing signup/checkout success, dashboard, Mac app, future desktop shells, and future iOS/Android companion apps.

Tenant/product context:
- `tenant_id`: Skilly tenant/workspace ID.
- `role_surface`: `tenant_admin`, `super_admin`, or `public`.
- `source_surface`: `marketing_site`, `web_dashboard`, `web_backend`, `web_sdk`, `mac_app`, `worker`, `ios_sdk`, `android_sdk`, `windows_app`, `linux_app`.

Embedded SDK identity:
- `tenant_id`: owning tenant.
- `end_user_id`: supplied by tenant via `Skilly.identify(endUserId, traits?)`.
- If no tenant end-user ID is supplied, use an anonymous SDK session ID.
- Do not mix tenant customer identities with Skilly owner identities unless explicitly modelling B2B2C analysis.

## Privacy Rules

Never send:
- Raw API keys or OpenAI client secrets.
- Audio, screenshots, DOM text dumps, transcripts, prompts, responses, or SKILL.md content.
- Full user-entered form content.
- Email addresses, names, phone numbers, or freeform form text to GA4.

Allowed:
- Event names, route names, status codes, counts, booleans, content length, duration seconds, plan/quota values, tenant ID, WorkOS user ID, and non-sensitive action labels.
- For PostHog only: email addresses from explicit lead forms and checkout success when needed for marketing attribution and user journey stitching.

## Events

| Event Name | Surface | Description | Key Properties |
| --- | --- | --- | --- |
| `$pageview` | Marketing site | Marketing page viewed | `source_surface`, UTM fields |
| `web_cta_download_clicked` | Marketing site | Download CTA clicked | `location`, `source_surface` |
| `hero_email_captured` | Marketing site | Hero email capture succeeded | `email_submitted`, `$set.email` in PostHog only |
| `web_waitlist_submitted` | Marketing site | Platform waitlist submitted | `platform`, `email_submitted`, `$set.email` in PostHog only |
| `web_beta_waitlist_submitted` | Marketing site | Mac beta waitlist submitted | `platform`, `email_submitted`, `$set.email` in PostHog only |
| `newsletter_subscribed` | Marketing site | Newsletter/update form submitted | `email_submitted`, `$set.email` in PostHog only |
| `web_skill_request_submitted` | Marketing site | Skill request form submitted | `app`, `message_present`, `$set.email` in PostHog only |
| `web_demo_video_played` | Marketing site | Demo video CTA clicked | `location`, `source_surface` |
| `web_checkout_completed` | Marketing site | Checkout success page loaded with WorkOS uid | `source_surface`; PostHog `distinct_id` = WorkOS user ID |
| `dashboard_page_viewed` | Web dashboard | Tenant/super-admin page viewed | `tenant_id`, `role_surface`, `page_path` |
| `dashboard_nav_clicked` | Web dashboard | Dashboard navigation clicked | `tenant_id`, `action_label`, `action_target` |
| `dashboard_key_created` | Web backend | Tenant API key created | `tenant_id`, `key_type` |
| `dashboard_key_revoked` | Web backend | Tenant API key revoked | `tenant_id` |
| `dashboard_origin_added` | Web backend | Web origin allowlist changed | `tenant_id`, `origin_count` |
| `dashboard_app_id_added` | Web backend | Native app-id allowlist changed | `tenant_id`, `app_id_count` |
| `dashboard_skill_saved` | Web backend | SKILL.md saved after validation | `tenant_id`, `skill_id`, `content_length` |
| `dashboard_skill_validation_failed` | Web backend | SKILL.md failed safety validation | `tenant_id`, `issue_count` |
| `dashboard_checkout_started` | Web dashboard/backend | Tenant started checkout | `tenant_id` |
| `dashboard_checkout_url_created` | Web backend | Polar checkout URL created | `tenant_id` |
| `tenant_plan_cap_updated` | Web backend | Polar webhook changed quota | `tenant_id`, `cap_seconds` |
| `web_sdk_token_mint_finished` | Web backend | SDK token mint completed or failed | `tenant_id`, `status`, `request_surface`, `ok` |
| `web_sdk_skill_fetched` | Web backend | SDK fetched tenant skill | `tenant_id`, `skill_id`, `content_length` |
| `web_sdk_session_usage_reported` | Web backend | SDK reported session seconds | `tenant_id`, `seconds` |
| `app_opened` | Mac app | macOS app opened | `app_version` |
| `onboarding_started` | Mac app | Onboarding started | WorkOS distinct ID |
| `all_permissions_granted` | Mac app | Required permissions complete | WorkOS distinct ID |
| `push_to_talk_started` | Mac app | Voice turn started | WorkOS distinct ID |
| `skilly_turn_completed` | Mac app | Beta telemetry turn summary | token counts, costs, durations |
| `skilly_session_ended` | Mac app | Beta telemetry session summary | token counts, costs, durations |
| `trial_started` | Mac app | Trial lifecycle | `user_id` |
| `trial_exhausted` | Mac app | Trial lifecycle | `user_id` |
| `skilly_checkout_started` | Mac app | User opened checkout | `user_id` |
| `skilly_subscription_activated` | Mac app | Subscription active | `user_id` |
| `skilly_silent_failure` | Mac app / Worker | Swallowed upstream/backend failure | `source`, `subsystem`, `error_code`, `surface` |

## GA4 Conversions

GA4 should be used mainly on public marketing pages:
- `$pageview` / automatic page views
- `web_cta_download_clicked`
- `hero_email_captured`
- `web_waitlist_submitted`
- `web_beta_waitlist_submitted`
- `newsletter_subscribed`
- `web_skill_request_submitted`
- `web_demo_video_played`
- `web_checkout_completed`

GA4 events must never include email addresses, names, phone numbers, or freeform form text. Dashboard/product events can also be mirrored to GA4 when useful, but PostHog remains the primary product analytics source.

## Marketing-Site Implementation

The marketing site lives in `/Users/engmsaleh/Repos/skilly-web`.

Current rules:
- Use the same PostHog project key as the Mac app.
- Use persistent first-party PostHog attribution for repeat visits and lead stitching.
- Preserve UTMs in PostHog super-properties.
- Send lead email to PostHog only when the user explicitly submits it.
- Mirror key conversion events to GA4 through `window.skillyTrack()`, with PII stripped before calling `gtag`.
- On `/checkout-success?uid=...`, call `posthog.identify(uid)` before firing `web_checkout_completed`, then remove `uid` from the URL.
- Keep privacy/FAQ/trust copy aligned with first-party analytics storage and lead attribution.

## Environment Variables

Web dashboard/backend:
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (optional, defaults to `https://us.i.posthog.com`)
- `POSTHOG_PROJECT_API_KEY` (server-side capture; may be the public ingest key)
- `POSTHOG_HOST` (optional)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `GA_MEASUREMENT_ID`
- `GA_API_SECRET` (server-side GA Measurement Protocol)
