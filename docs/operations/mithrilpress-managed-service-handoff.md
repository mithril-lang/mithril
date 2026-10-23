# MithrilPress managed migration handoff packet

Use this packet only after a site owner requests a migration assessment or
accepts a separately described migration/content-operations service. The
MithrilPress product and hosting remain free to site owners. Any optional human
service is separate; this packet contains no price, service-level promise, or
claim that a managed team is staffed.

## Request and authority

| Field | Record before accepting work |
| --- | --- |
| Site owner and authorized contact | Name and role supplied by the owner |
| Contact authority | Owner request, explicit opt-in, existing authorized business relationship, or documented partner introduction |
| Target market and locale | Explicit country/region and supported language; Japan is excluded from marketing |
| Content authorization | Exact owner-provided WXR/REST export and the permitted processing scope |
| Data handling contact | Named owner and approved method for transfer, retention, and deletion |
| Service proposal | Separate scope and cost worksheet; acceptance date and approver |

Public website content, a public email address, or a WordPress detection result
does not establish contact authority. Never scan or clone a prospect site to
create a preview. Use only content the owner supplied and authorized.

## Migration work packet

Record the following for each accepted site:

1. Verify ownership through the approved organization process and reserve an
   available hosting slot before receiving site content.
2. Create the tenant and owner tokens through the approved provisioning path.
   Keep import, preview, approval, publication, domain, and DNS scopes separate
   where possible. Record each token ID, scope, expiry, and revocation owner;
   never put bearer secrets in the packet.
3. Preserve the original WordPress export and its digest under the agreed
   retention policy. Do not fetch source content or media URLs. Record the
   importer version, source origin, and exact revision ID.
4. Review the migration report field-by-field: supported records, source
   omissions, nested routes, taxonomy, image mapping, sanitizer removals,
   unresolved links, Gutenberg dynamic/unknown blocks, and all fallbacks.
5. Give the owner an authenticated private preview with noindex and nofollow.
   Require the owner to inspect the exact revision and record the approval
   proof. A later edit creates a new revision and needs its own review.
6. Publish only through the separate owner-approved action. Read back the
   public routes, REST subset, media, and publication snapshot digest.
7. Keep the previous approved revision available during the agreed rollback
   window. A restore must name both the historical target revision and the
   current revision. Read the restored content back and record the restore
   action.
8. Export the currently published supported subset and reconcile record counts,
   routes, taxonomy IDs, metadata, and media references with the source report.

## Operations and cost controls

| Gate | Evidence to attach | Owner/status |
| --- | --- | --- |
| Free product terms and tenant usage caps | Current app settings, cap behavior, and stop response | Unverified until exact deployed read-back |
| Provider account and billing boundary | Account plan, shared usage, owner-approved budget and alert/stop method | Unverified; no zero-cost provider promise |
| Worker, D1, and R2 production bindings | Exact resource IDs, schemas, and successful read-back | Not provisioned by the local demo |
| Hostname and TLS | Owner domain proof, certificate/HTTPS read-back, rollback path | Separate DNS/domain release gate |
| Content backup and restore | Source digest, export digest, retained approved revision, restore read-back | Record per site |
| Security response | Named operator, incident route, token revocation, and content isolation procedure | Must be staffed before service acceptance |
| Service costs and scope | Reviewed labor estimate and any optional service quote | To be supplied separately; never bill hosting automatically |

The local migration demo qualifies none of these production gates. Cloudflare
provider charges may be incurred by the hosting operator. Do not enable
production routes until account plan, enforceable provider boundaries, exact
source qualification, rollback, and live read-back are complete.

## Handoff record

```text
Customer/owner:
Site ID and hostname:
Authorized source origin:
Owner-supplied export digest:
Imported revision and parity status:
Omissions accepted by owner:
Preview reviewed at:
Approval proof ID and owner:
Published revision and read-back digest:
Restore target/current IDs (if used):
Current export digest:
Open migration gaps:
Hosting cap and provider-cost gate status:
Support owner and agreed contact channel:
Optional service scope/cost acceptance:
Next owner-approved action:
```

Keep this record separate from the marketing prospect workflow. A migration
handoff is not permission to send follow-up email or to schedule a campaign.
