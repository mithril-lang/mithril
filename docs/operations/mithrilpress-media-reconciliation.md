# MithrilPress media reconciliation

Use this operator-only procedure when an image upload or removal returns an
uncertain result. The Worker keeps the media row and its storage reservation
until the R2 object and D1 state can be reconciled. Do not release the
reservation based on age or a missing R2 object alone.

## Safety boundary

- A media asset is served only while its D1 status is `active` and a published
  revision references it. `pending` and `deleting` assets are private.
- Exactly one immutable `media-uploaded` action proves that the awaited R2
  `put` completed. Match the event's site, media ID, token ID, creation time,
  byte length, content type, SHA-256, and WordPress source ID to the exact D1
  reservation. If optional width, height, or alt-text fields are present in the
  event, they must also match.
- A zero, duplicate, malformed, or mismatched upload event means the write
  outcome is unknown. Keep the reservation and object untouched, even when an
  R2 `head` returns no object. Escalate to the service owner.
- Never accept an object key, site ID, or media ID from an unauthenticated
  request or operator-supplied free text. Resolve each identifier from the
  exact site-scoped D1 row and verify the resulting R2 key is under that site's
  prefix.

## Read-only triage

1. Identify the affected tenant from the authenticated owner report. Read the
   exact `media_assets` row by both `site_id` and `id`; record status, object
   key, content type, byte length, dimensions, SHA-256, WordPress source ID,
   uploader token ID, and creation time.
2. Read at most two `media-uploaded` actions for that same `site_id` and media
   ID. Require exactly one action and compare the immutable fields listed
   above. Do not use the most recent action to hide duplicates.
3. Read the exact R2 object by the D1 `object_key`. Record whether it exists,
   its size, HTTP content type, and custom `mediaId` and `sha256` values.
4. Capture the site/media identifiers, operator, timestamps, action ID, object
   result, and D1 result in the incident record. Redact owner tokens and do not
   copy image bytes into the incident.

## Remove an upload with verified completion

The owner DELETE API performs these steps for a verified asset. Use a separate
operator workflow only when the owner API cannot finish; keep it disabled from
public routes.

1. Re-read the exact D1 row and the single matching upload action. If the row
   is not already `deleting`, conditionally change only `pending` or `active`
   to `deleting` for the same `site_id` and media ID. Continue only when exactly
   one row changed. This hides the image before touching R2.
2. Re-read the exact R2 object. If it is present, verify size, content type,
   custom media ID, and SHA-256 against the D1 row, then delete only that exact
   key and read it back as absent. If any value differs or a provider result is
   uncertain, stop with the row still `deleting` and keep the reservation.
3. If R2 reports the object absent, the verified immutable upload action proves
   the original `put` completed, so a late write cannot recreate it. Continue
   only after the `deleting` fence and exact-key read-back.
4. In one D1 transaction, delete the exact `deleting` row and append the
   immutable `media-deleted` action. Require exactly one row deleted. If the
   D1 response is ambiguous, read back the row and action before reporting
   success. Storage usage triggers release quota only when that D1 row is
   deleted.
5. Preserve the before/after evidence and record operator identity, object
   result, D1 result, and the associated owner report. Do not delete audit
   actions.

## Unknown outcomes

When no exact completed-upload action exists, the Worker and Studio leave the
asset private and quota-counted. A negative R2 `head`, elapsed time, failed
request, or client disconnect does not prove that a pending `put` cannot still
commit. Do not run cleanup or delete the D1 reservation. Keep the exact row for
later review and escalate it to the service owner; no automated cleanup job is
enabled.

## Qualification boundary

Before using this procedure with production data, qualify late R2 completion
after an initial missing-object read, concurrent activation and deletion,
duplicate/mismatched upload actions, exact-key metadata mismatch, object
deletion read-back, D1 response ambiguity, and quota-counter read-back in an
isolated environment. Preserve the standalone receipt and before/after
read-backs. No production reconciliation is authorized by this document.
