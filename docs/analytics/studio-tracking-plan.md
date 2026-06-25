# Studio Tracking Plan

Last updated: 2026-06-22

## Tools

- PostHog: product analytics and funnel analysis.
- Google Analytics 4: aggregate acquisition/conversion reporting.
- Studio source surfaces:
  - `web_dashboard` for signed-in dashboard UI and server actions.
  - `web_onboarding` for post-signup onboarding.
  - `studio_dashboard` for the in-dashboard widget preview.
  - `web_backend` for public SDK runtime events.

## Suppression Policy

Events are not sent to PostHog or GA4 when any of these are true:

- Local development host: `localhost`, `127.0.0.1`, `0.0.0.0`, `*.local`.
- Preview host: `*.netlify.app`, `*.netlify.live`, `*.vercel.app`.
- Server environment is not production.
- Netlify/Vercel context is not production.
- `ANALYTICS_DISABLED=true`.
- Signed-in account email is an internal excluded account.

Default excluded account:

- `eng.mohamedszaied@gmail.com`

Additional excluded accounts can be configured with:

```text
ANALYTICS_EXCLUDED_EMAILS=founder@example.com,teammate@example.com
```

## Funnel Events

| Funnel Stage | Event | Source | Trigger |
| --- | --- | --- | --- |
| Dashboard viewed | `dashboard_page_viewed` | Client | Route change inside signed-in Studio |
| Navigation/action click | `dashboard_nav_clicked`, explicit button events | Client | Elements with `data-analytics-event` |
| Signup onboarding | `onboarding_company_named` | Server | Workspace name saved |
| Key setup | `dashboard_key_created`, `dashboard_key_revoked` | Server | API key lifecycle |
| Surface setup | `dashboard_origin_added`, `dashboard_app_id_added` | Server | Project allowlist changes |
| Teaching setup | `dashboard_skill_saved`, `dashboard_skill_validation_failed` | Server | SKILL.md editor save |
| Widget style | `dashboard_widget_config_saved` | Server | Widget appearance save |
| Test widget | `dashboard_test_widget_token_minted`, `dashboard_test_widget_usage_reported` | Server | In-Studio preview session |
| Billing | `dashboard_checkout_started`, `dashboard_checkout_url_created`, `dashboard_portal_opened` | Server | Checkout/portal flow |
| Runtime token | `web_sdk_token_mint_finished` | Server | Installed widget/native SDK token request |
| Runtime skill | `web_sdk_skill_fetched` | Server | Installed widget/native SDK skill fetch |
| Runtime usage | `web_sdk_session_usage_reported` | Server | Installed widget/native SDK usage report |
| Subscription webhook | `tenant_plan_cap_updated` | Server | Polar webhook updates tenant cap |

## Property Rules

- Include `tenant_id` on all server-side tenant events.
- Include `source_surface` on every event.
- Include `role_surface` on signed-in dashboard events.
- Do not send email, name, phone, prompt text, transcript text, or document content to GA4.
- Email may be present before provider dispatch only to make the internal-account suppression decision; GA4 client properties strip email/name/phone keys.
- Use event-specific counts and booleans instead of raw values where possible, for example `origin_count`, `app_id_count`, `content_length`, `seconds`, `status`, `ok`.

## Decision Questions This Funnel Answers

- Are users completing the setup path: teach, style, allow, install, test?
- Where do users drop before a working install?
- Are widget preview sessions succeeding before production install?
- Which workspaces hit quota or need billing follow-up?
- Are installed widgets minting tokens, fetching skills, and reporting usage successfully?
