# Security Policy

## Reporting a Vulnerability

If you discover a security issue, please do not open a public issue with exploit details.

Use one of these channels:

1. Open a private security advisory in GitHub (recommended).
2. If private advisories are unavailable, open an issue titled `Security report request` and ask for a private contact channel.

Include:

- Affected component and file paths
- Reproduction steps
- Impact assessment
- Suggested remediation (if available)

## Response Expectations

- Initial triage acknowledgment target: 3 business days
- Severity and remediation plan target: 7 business days

## Scope

In-scope:

- `leanring-buddy/` application code
- `worker/` Cloudflare Worker routes and auth boundaries
- Release/update surfaces that affect trust or distribution

Out-of-scope:

- Issues requiring physical device compromise
- Social engineering without a software defect
