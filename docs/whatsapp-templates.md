# WhatsApp message templates

Every WhatsApp message this system sends is a **template** — Meta requires one
for any business-initiated message outside a 24-hour customer-service window,
which is all of ours. Templates are created and approved in Meta Business
Manager against a WhatsApp Business Account (WABA), and each is referenced from
code by name and language code through an environment variable.

**No WABA exists for this project yet** (blockers **B2** and **B5** in
`docs/whatsapp-communication-plan.md`). Nothing here has been submitted or
approved. Until it is, every template name below is unset, and unset means the
corresponding send is never attempted — the safe default in every case.

## How code reaches a template

| env var | used by | category |
|---|---|---|
| `WHATSAPP_OTP_TEMPLATE_NAME` | phone-ownership verification | AUTHENTICATION |
| `WHATSAPP_UTILITY_TEMPLATE_CHECKIN` | check-in notification | UTILITY |
| `WHATSAPP_UTILITY_TEMPLATE_CHECKOUT` | check-out notification | UTILITY |
| `WHATSAPP_UTILITY_TEMPLATE_ROOMMOVE` | room-move notification | UTILITY |
| `WHATSAPP_UTILITY_TEMPLATE_QR_DELIVERY` | pickup QR delivery | UTILITY |

`WHATSAPP_UTILITY_LANGUAGE_CODE` (default `en_US`) applies to all four utility
templates; `WHATSAPP_OTP_LANGUAGE_CODE` to the authentication one.

Emergency alerts are deliberately **not** on WhatsApp — email and in-app only.
`utilityTemplateNameFor` returns `undefined` for that event type by design.

---

## 1. `qr_delivery` — pickup QR (new in PR B)

The only template with a **media header**, which is why it is submitted
separately from the three notification templates rather than as a variant of
one. Meta reviews an image-header template on its own terms.

**Category:** UTILITY
**Header:** IMAGE
**Body variables:** 1
**Buttons:** one static URL button

### Body

```
Here is your pickup QR code for {{1}}. Show it to a volunteer when collecting your child.
```

`{{1}}` = church name. Deliberately the only variable: no child name, no room,
no time. The message is about a credential belonging to the parent, and the
less it says about a specific child the better.

### Button

A **static** URL button pointing at `https://guardiancheck.co.za/parent`.

Static rather than dynamic on purpose. A dynamic URL button takes a variable
suffix and draws more scrutiny at review; nothing here needs one, since the
parent dashboard is the same destination for every recipient.

### Header media at send time

The header image is supplied as a `link`, which Meta's servers fetch
themselves:

```json
{
  "type": "header",
  "parameters": [
    { "type": "image", "image": { "link": "https://guardiancheck.co.za/api/qr/<43-char token>" } }
  ]
}
```

That URL is the unauthenticated QR endpoint. See
`docs/qr-endpoint-threat-model.md` for why it is safe to expose and what is
still outstanding about it.

Meta's documented constraints on a linked image: **PNG or JPEG, 5 MB maximum,
8-bit RGB or RGBA**. Ours is a ~2 KB PNG rendered at 300px
(`notifications/qr-image.ts`), well inside all three.

Meta caches a linked asset for **10 minutes against the exact URL string**. Our
URLs are unique per send, so that cache can never serve one family's QR in
response to another family's message.

### Sample approval submission

> **Name:** `qr_delivery`
> **Category:** Utility
> **Language:** English (US)
> **Header:** Image
> **Body:** `Here is your pickup QR code for {{1}}. Show it to a volunteer when collecting your child.`
> **Sample body value for {{1}}:** `Bryanston Methodist Church`
> **Button:** Visit website → `https://guardiancheck.co.za/parent`, label `View my children`

---

## 2–4. `checkin` / `checkout` / `roommove` — event notifications

**Category:** UTILITY · **Header:** none · **Body variables:** 1 · **Buttons:** none

All three take a single pre-rendered sentence as `{{1}}`, produced by
`whatsappSummaryText` in `notifications/templates.ts`. Examples:

```
Amahle has been checked in at Bryanston Methodist Church (9:05 AM).
Amahle and Bongani have been checked out of Bryanston Methodist Church (11:20 AM).
Amahle has been moved to Elephants at Bryanston Methodist Church.
```

One variable rather than several is a deliberate simplification: the exact
variable layout of the real approved templates is unknown until they exist, and
a single body parameter is the shape least likely to need reworking. Multi-child
consolidation happens on our side before the parameter is built, so the template
never needs to know how many children are involved.

---

## 5. `otp_verification` — phone-ownership verification

**Category:** AUTHENTICATION · **Body variables:** 1 · **Buttons:** one COPY_CODE

Sends a 6-digit code the parent enters to prove they control the number.
Meta requires the code to appear **twice** in the send payload — once as the
body parameter, once as the button's `coupon_code` — see
`buildOtpTemplateComponents` in `notifications/providers/whatsapp.ts`.

**Blocker B2 is open:** whether Meta permits an AUTHENTICATION template for
phone-*ownership* verification (as opposed to login) is not settled. Their
documentation offers no permitted-use list either way. If it is refused, this
becomes a UTILITY template with different wording, and `M4` in the
communication plan tracks the consequence.

---

## Verification still required

The component shapes in this document are assembled from Meta's template
documentation and several BSPs' technical guides. **None has been verified
against a real approved template**, because no WABA exists to create one
against. Two specific things to re-check at rollout:

1. The `qr_delivery` header component shape above — an image header's exact
   parameter layout.
2. The `otp_verification` COPY_CODE button's `coupon_code` parameter.

Both fail loudly if wrong: a mismatch is a 4xx from the Graph API at send time,
not a silent non-delivery. That is the reason this was acceptable to build
ahead of a WABA existing.
