# Threat model: `GET /api/qr/:token`

**Status:** written for PR B (WhatsApp QR delivery), against the code on `master` as of this PR.
**Audience:** whoever reviews this before the pilot, and the POPIA practitioner handling blocker B3.
**Scope:** one endpoint, the two Firestore collections behind it, and the data it causes to exist.

This document exists because PR B adds the **only unauthenticated route** in an
otherwise fully authenticated system, and that decision should be reviewable on
its own terms rather than inferred from code comments.

---

## 1. Why an unauthenticated endpoint exists at all

A WhatsApp template message with an image header **does not carry the image**.
The send payload contains a URL, and Meta's servers fetch that URL themselves
at send time. Meta cannot hold a session with this app, so the URL must be
reachable without one.

The alternative Meta documents is uploading the image to their Media API first
and sending a media id. That was not chosen: it means storing every parent's
pickup QR on Meta's infrastructure ahead of time rather than letting them fetch
one transiently, which is more data at rest in a third party, not less.

**This endpoint is not on the parent's path to their QR.** The same QR reaches
them as an inline `cid:` attachment on the ordinary check-in email
(`notifications/providers/email.ts`), which never touches this endpoint. If
this route were deleted tomorrow, no parent would lose access to anything — the
WhatsApp channel would simply stop carrying the image.

## 2. What the token is

| property | value |
|---|---|
| entropy | 256 bits (`crypto.randomBytes(32)`) |
| encoding | base64url, 43 characters |
| stored form | **SHA-256 only** — the raw value is never persisted |
| lifetime | `QR_ACCESS_TTL_MINUTES`, default 60 |
| uses | `QR_ACCESS_MAX_FETCHES`, currently **8** |
| scope | one guardian, one notification, one send |

Two properties are worth stating explicitly because they are easy to assume
and would be serious if wrong:

1. **The URL token is not the QR's contents.** The QR encodes the guardian's
   pickup token (`guardians.qrToken`); the URL carries a separate value minted
   for this one delivery. Meta learns the latter and never the former. Neither
   is derivable from the other.
2. **A database dump yields no working URLs.** Document ids in
   `qr_access_tokens` are hashes. An attacker with full read access to
   Firestore cannot reconstruct a fetchable URL from it.

## 3. Controls

| control | mechanism |
|---|---|
| Unguessable | 2^256 keyspace; shape-checked by regex before any Firestore read, so malformed guesses cost nothing |
| Short-lived | `expiresAt` checked before the fetch budget — an expired token is expired however much budget remains |
| Bounded use | transactional read-increment; concurrent fetches cannot both slip past the cap |
| Rate limited | per-token (10 / 15 min, keyed on a hash) **and** per-IP (60 / 15 min). The per-token limiter bounds replay of one URL; the per-IP limiter bounds enumeration, which by definition presents a different token each time |
| Revocable | the guardian is re-read at fetch time and must still be active, undeleted, in the same church, and hold a token. A guardian deactivated after the send stops rendering immediately |
| Uniform failure | every refusal returns the same body, `{"error":"Not found"}`. Status distinguishes 404 (never existed / malformed) from 410 (existed, finished) for our own log reading; the body never elaborates |
| Not cacheable | `Cache-Control: no-store, private`. A CDN or proxy holding this would outlive the token's entire point |
| Audited | every request is logged, **including refusals** — a burst of refusals is what enumeration looks like |

### Header note

`Cross-Origin-Resource-Policy: cross-origin` is set deliberately. helmet
defaults it to `same-origin`, which would block Meta's fetcher. This is the one
place that default is relaxed, and only on this route.

## 4. The identity-check dependency

Under the hardening merged in PR #98, the QR is **a lookup key checked by a
human**, not a bearer credential: `/api/check-out-guardian` requires an
`identityCheck` assertion from the volunteer and refuses one that contradicts
the guardian record. Possession of a QR image is therefore not sufficient to
collect a child.

**That property belongs to `master`, not to what is deployed today.** `main` is
intentionally held back (guardian photo coverage is being raised first), and on
`main` the identity check does not exist. This endpoint must not ship to an
environment running pre-#98 code, because there the QR *is* effectively a
bearer credential and the risk calculus above does not hold.

Even on `master`, the identity check is only as strong as the photo behind it.
At the time of writing, **45% of Bryanston's guardians have a photo on file**
(and only 1 of 24 hand-added guardians). For the rest, the volunteer's
assertion is `no-photo-acknowledged` — recorded and countable, but not
verifiable by the system. Raising that number is what makes this control real.

## 5. Residual risks (accepted, not solved)

- **Vercel edge request logs contain the full URL**, including the token, for
  whatever Vercel's retention is. Our own `[API_LOG]` line redacts it
  (`/api/qr/:token`), but the platform's access log is outside our control. The
  TTL bounds the exposure window; a shorter TTL would shrink it further.
- **Meta holds the fetched image.** Their documented behaviour is a 10-minute
  asset cache keyed on the exact URL, plus whatever retention applies to
  delivered message media. Our URLs are unique per send, so that cache never
  serves one family's QR for another's request.
- **The recipient can forward the message.** Identical to the existing email
  channel, and out of scope for a transport control.
- **A compromised WhatsApp account or mailbox** exposes the QR, exactly as it
  does today for email. This endpoint neither improves nor worsens that.
- **Fetch count is unverified against real Meta behaviour.** See §7.

## 6. New data category: `qr_access_log`

This PR creates a collection that did not previously exist and that holds
**personal information**, which the POPIA reviewer should be aware of:

| field | content | note |
|---|---|---|
| `ip` | requester IP address | normally Meta's infrastructure; abnormally, whoever is probing |
| `userAgent` | requester user-agent | truncated to 300 chars — attacker-controlled length |
| `tokenId` | SHA-256 of the presented token | not the token |
| `outcome`, `status` | what happened | includes refusals |
| `at`, `traceId` | when, and the request trace | |

- **Access:** master admin read only. Deliberately stricter than
  `church_usage`, which church admins can read — a church has no operational
  need for requester IPs.
- **Writes:** server only, append-only. No client can write or delete, so
  nobody can bury evidence of their own probing.
- **Retention: undefined.** No collection in this project has a retention
  policy yet (this is legal question **L4** in
  `docs/whatsapp-communication-plan.md`). This collection is a reason to settle
  it: it accrues one row per request indefinitely and holds IPs. A TTL policy
  is the obvious answer and is not implemented here.

## 7. Outstanding before the pilot — not before merge

**`QR_ACCESS_MAX_FETCHES = 8` is a bounded guess, not a measurement.**

Meta's documentation states only that the Cloud API "internally caches the
asset for 10 minutes" keyed on the exact link string, and that appending a
random query string makes it "treat this as a new asset, fetch it from your
server, and cache it for 10 minutes". Checked across the Media reference, the
send-message guides in both the current and legacy documentation trees, the
error-code reference (131052/131053 cover download and upload *failure* but say
nothing about re-fetching), and the image-message page, the documentation
**never states** how many requests one send makes, whether a HEAD precedes the
GET, or whether a slow or non-200 response is retried.

An earlier draft used 3. That is a guess with no margin; 8 is a guess with
margin. The asymmetry decides it — a few extra fetches of a hash-stored,
minutes-long token cost approximately nothing, while exhausting the budget
midway through Meta's own retries means **a parent never receives their QR**.

**Action before the pilot Sunday:** send one `qr_delivery` template from the
real WABA, read the `fetchCount` on that token and its `qr_access_log` rows,
and retune the constant from the observed number. Tests import the constant
rather than hardcoding a literal, so this is a one-line change.

This is not a merge blocker: no WABA exists in this project yet (blockers
**B2** and **B5**), so the measurement cannot be taken until one does, and the
whole feature is behind `WHATSAPP_ENABLED` plus a pilot allowlist until then.

## 8. Guardian photos: confirmed not transmitted

Asked explicitly during review, and verified against every code path that
touches a guardian record:

- `/api/guardian-lookup` returns `photoUrl` **only** to the authenticated
  volunteer client, for the identity check. That is the same Firebase Storage
  URL the `guardians` collection already exposes church-wide to volunteers
  (`firestore.rules`).
- **This endpoint never reads or returns a photo.** It reads `qrToken` and
  renders a QR.
- **No WhatsApp payload contains a photo.** The header image is the rendered
  QR; the body is the church name.
- **No email contains a photo.** The check-in email's only image is the
  inline QR attachment.
- Guardian photos remain app-side, behind authentication, exactly as before
  this PR.

## 9. What would change this assessment

- Shipping to an environment without PR #98's identity check (see §4).
- Raising the TTL substantially, which widens the Vercel-log exposure window.
- Adding any personal detail to the QR endpoint's response or to the WhatsApp
  body beyond the church name.
- Reusing one token across sends, which would break the per-send scoping that
  keeps Meta's 10-minute cache from crossing families.
