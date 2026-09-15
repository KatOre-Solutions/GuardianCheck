# Application separation

Planning documents for epic [#14](https://github.com/KatOre-Solutions/GuardianCheck/issues/14):
splitting GuardianCheck into a marketing site on `guardiancheck.co.za` and the
application on `app.guardiancheck.co.za`.

These documents prepare the migration. They do not perform it. No code, DNS,
Vercel, Firebase or PayFast setting has been changed.

| Document | Issue | Answers |
|---|---|---|
| [architecture.md](architecture.md) | [#50](https://github.com/KatOre-Solutions/GuardianCheck/issues/50) (7.1) | Which host serves what, SEO and indexing per host, the redirect map, the phased migration plan and checklist |
| [auth-session.md](auth-session.md) | [#51](https://github.com/KatOre-Solutions/GuardianCheck/issues/51) (7.2) | What happens to sign-in, sessions, offline data and installed apps when the app changes origin, and why shared cookies are not the answer |
| [config-inventory.md](config-inventory.md) | [#52](https://github.com/KatOre-Solutions/GuardianCheck/issues/52) (7.3) | Every env var, hard-coded URL, cross-host link, PayFast URL, SEO file and external console setting affected, with an action per item |

## Decisions in brief

1. **Subdomain for the app, apex for marketing**, as the epic proposes. Nothing
   indexable moves, so there is no SEO cost, and the marketing site stops
   sharing a browser security boundary with the app.
2. **Church pages move to the app host** (`app.guardiancheck.co.za/grace`). Old
   apex church URLs, invite links and payment returns redirect with 308,
   keeping their query strings.
3. **Church signup moves to the app host.** It creates a Firebase account, so
   it has to run where the user will stay signed in.
4. **The apex proxies `/api/*` to the app permanently**, because PayFast keeps
   sending renewal notifications for existing subscriptions to the apex.
5. **No session sharing and no parent-domain cookies.** Users sign in once on
   the app host. The marketing site has no auth state.
6. **Phased rollout.** The app host runs in parallel and takes new traffic for
   at least three Sundays before the apex is switched to marketing, on a
   weekday.
7. **Written to hold for any #47 outcome.** The few framework-specific steps are
   marked **(#47)**.

## Before any implementation starts

- [#47](https://github.com/KatOre-Solutions/GuardianCheck/issues/47) must be
  decided (phase 3 needs it; phases 0 to 2 do not).
- Open questions are listed at the end of [architecture.md](architecture.md#open-questions).
- One pre-existing bug surfaced while surveying: church slug generation does not
  check reserved paths, so a church named "About" or "Login" gets an unreachable
  URL today. Tracked in [#143](https://github.com/KatOre-Solutions/GuardianCheck/issues/143);
  see [architecture.md](architecture.md#the-slug-rule-important). It should be
  fixed before phase 0 extends the reserved list.
