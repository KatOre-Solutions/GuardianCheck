# GuardianCheck Storage remediation and rollout

Status: implementation prepared for review. No production rules, application build, records, objects, or tokens have been changed by this work.

## Finding and scope

The previous Storage rules allowed unauthenticated reads of all matched objects. Authenticated users could write to child and guardian paths without a GuardianCheck role or church check, and the fallback allowed broad authenticated writes. This establishes unintended access permitted by policy. It does not establish that anyone used it. Storage App Check is enforced, but attestation does not authorize a person or church.

Client uploads were in `Profile.tsx`, `ParentDashboard.tsx`, and `ChurchSettings.tsx`. Private image URLs were stored in `users.photoUrl`, `users.photoURL`, `children.photoUrl`, `children.photoURL`, `guardians.photoUrl`, `guardians.photoURL`, and Firebase Auth `photoURL`. Church logos were stored in church branding and the public church projection. Child and guardian paths historically use the uploader's parent UID rather than a child or guardian document ID. All private image displays in profile, parent, volunteer, admin, child detail, and checkout screens now use `PrivateImage`. Church logos remain ordinary public images on landing pages.

GuardianCheck uses the named Firestore database `ai-studio-6c817cfc-8d14-458a-b0a8-7f40fc186536`. Storage Rules Firestore lookups can reach only the default database. Therefore the server checks identity, the current named-database user record, status, roles, church membership, and the parent UID represented in the object path before issuing access. Master administrators retain the existing cross-church read authority. Approved volunteers and church administrators can read images within their church. Approved parents can read their own family path. Profile writes are owner initiated. Child and guardian uploads are limited to approved parents or church administrators in their church. Church logo changes are limited to church administrators or platform administrators. Locked churches cannot upload child, guardian, or branding images.

## Object access

New private uploads use `storage://` references in Firestore. Objects use `profiles/{uid}/{uuid}.{ext}`, `children/{churchId}/{parentUid}/{uuid}.{ext}`, and `guardians/{churchId}/{parentUid}/{uuid}.{ext}`. Legacy UID paths remain readable through the authenticated server endpoint. The server accepts a private path or a legacy Firebase URL and issues a Cloud Storage signed read URL valid for one minute after authorization. The client does not send a legacy download token to this endpoint. New private uploads do not create Firebase download tokens. JPEG, PNG, and WebP uploads are limited to 4 MB by the server and checked for matching file signatures. Vercel's 4.5 MB function payload limit is the reason for the 4 MB ceiling and signed reads.

`storage.rules` deny direct client reads and writes under `profiles/`, `children/`, and `guardians/`, including legacy paths. Direct client writes elsewhere are denied. Public reads are limited to single `churches/{churchId}/logo_*` objects. Public church branding is intentionally shown before sign-in. Server Admin SDK operations bypass Storage Rules only after the endpoint performs authorization.

## Existing references and staged migration

The read-only production inventory on 30 September 2026 found 356 user, 512 child, and 310 guardian documents, plus 570 Firebase Auth users. It found private Firebase token URLs in 12 `users.photoUrl` fields, 11 `users.photoURL` fields, 44 `children.photoUrl` fields, 17 `children.photoURL` fields, 12 `guardians.photoUrl` fields, 12 `guardians.photoURL` fields, and 17 Firebase Auth `photoURL` fields. Some fields refer to the same object. Two church documents and three public church projections contain Firebase branding URLs. The dry-run migration planner found 108 Firestore fields and 17 Auth fields eligible for conversion, with zero ownership mismatches. These are counts, not evidence of access or misuse.

Deployment order:

1. Review and deploy the server and client build together. Use `123TestChurch` for live test records and accounts. Verify private reads, new uploads, church logos, check-in, checkout, and attendance views. Use synthetic accounts in the emulator for cross-church denial. Confirm the production service account can sign short-lived URLs. Do not change rules before the new build works.
2. Deploy the restrictive Storage rules and repeat direct SDK denial and application checks. Existing Firebase download tokens can still work at this stage.
3. Run `npx tsx scripts/audit-storage-references.ts` and the dry-run `npx tsx scripts/migrate-private-image-references.ts`. Compare counts and investigate mismatches. After confirming the deployed client reads `storage://` references, run the migration with `--write --ack-deployed --backup <absolute-path-outside-repo>`. The script writes a private backup before any update and checks current field values before writing. It does not delete objects or revoke tokens.
4. Check every affected role and image flow, then audit references again. Keep the backup protected. The `--rollback --ack-deployed --backup <same-path>` mode restores fields whose current values still match the migration result. Stop and inspect any conflict rather than overwriting a newer edit.
5. Only after all private references and clients have been verified, inventory unique private objects and revoke their old Firebase download tokens in a separate, reviewed operation. Recheck that no private token URL remains in Firestore, Firebase Auth, logs, or supported clients. Do not revoke church branding tokens. Token revocation can invalidate old direct links, so it is deliberately not performed in this PR.

Existing private token URLs remain valid until their tokens are revoked. Storage Rules alone do not invalidate them. A previously shared token URL may still be usable during this transition. The one-minute signed URL is also a bearer link until expiry. The new UI requests it only after server authorization and uses `no-referrer` on image elements.

## Verification and evidence limits

Added a Storage Emulator Suite test for anonymous and authenticated direct reads and writes, including legacy paths, plus public logo reads. Added authorization and file validation tests for the server decision functions. The production build and targeted TypeScript check pass. Existing Firestore rules, church access, checkout, and camera tests pass. The repository-wide `npm run lint` currently fails on an unrelated untracked `scripts/checkout-bryanston-stale-checkins.ts` file; the targeted TypeScript check for the changed application code passes.

The code paths for parent registration, child and guardian registration and editing, profile updates, church settings, admin user photos, volunteer photos, check-in, checkout, and attendance were inspected. A live production walkthrough and signed URL signing check require a reviewed deployment and role-specific test accounts. No such deployment or live walkthrough has occurred, so production continuity is not yet verified.

The codebase records selected application audit events. This work did not inspect provider Storage request logs, Cloud Audit Logs, Firebase console activity, or historical download-token use. Those sources may help investigate access if retained and enabled, but the rules finding alone cannot establish whether unauthorized access occurred. Keep any forensic review separate from the remediation rollout.

The production signing preflight failed with HTTP 403 because the configured Firebase Admin service account lacks `storage.objects.get` on the bucket. Bucket-scoped object access and signing capability must be granted and verified before deployment. No IAM permissions were changed in this work.
