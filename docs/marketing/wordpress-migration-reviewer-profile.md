# WordPress migration reviewer profile

**Profile state: draft-only.** The Hermes profile exists but is not ready to run:
it has no bundled skills, mailbox, approved sender, schedule, or outbound action.
Its gateway is stopped. This document is its human-operated workflow contract.
Do not configure or enable it until market-specific review is complete.

## Role

Research one human-selected business site at a time and prepare an individualized
email draft only when the contact and market gates are recorded. The profile may
describe publicly observable WordPress evidence with its source and observation
date. A public technology signal or email address alone does not establish
permission to contact.

## Scope and guardrails

- Japan is excluded from marketing.
- Before research or copy, record the target country/region and a supported,
  explicitly selected locale. Use the recipient's stated language when known;
  do not infer location or language from a name, TLD, or browser setting.
- Record domain, evidence source, observation date, WordPress-fit reason,
  recipient/contact basis, jurisdictional review, duplicate status, and
  suppression status. If any field is unknown, hold.
- Do not crawl a global domain list, copy pages/assets, create a prospect preview,
  or claim that Mithril already migrated the site. Ask for an owner-provided
  export or authorized WordPress REST API access before import.
- Do not claim that Mithril is safer, more secure, or feature-identical to
  WordPress until those claims have current evidence and approved copy.
- Draft one message for one reviewed recipient. Include accurate sender identity
  and the locally required opt-out method. Require copy review and individual
  human send approval in a supervised interface; never send, schedule, or bulk
  send from this profile.
- Maintain shared daily caps and suppression lists across locales. Record draft,
  approval, actual send, bounce/complaint, opt-out, reply, and provider read-back
  as distinct events.

## Process

1. **Market gate:** select market, local language, legal basis, permitted source,
   and any jurisdiction-specific exclusions. No market means no research.
2. **Account review:** a human selects one domain. The profile records an
   observable WordPress signal and verifies business fit without copying site
   content.
3. **Contact gate:** verify the individual and role, source/date, contact basis,
   permitted channel, local sending rules, and suppression/duplicate state. A
   published address is evidence of availability, not consent.
4. **Draft:** use approved claims only; describe the supported migration subset
   honestly and ask whether the owner wants to provide an export or grant API
   access. Do not promise PHP/plugin parity or an existing preview.
5. **Human review:** reviewer confirms recipient, locale, source, legal basis,
   claims, sender identity, and opt-out. The human sends the reviewed message
   through the supervised interface.
6. **Read-back:** record the provider's actual sent/failed state, then process
   replies and suppressions. An interested owner must separately authorize an
   import before a private preview can be built.

## Business process SOP

**Owner:** MithrilPress product owner | **Responsible team:** Human sales
operator with draft-only bot assistance | **Review cadence:** Before each
market launch and quarterly while active

### Purpose and scope

Qualify a single owner-selected business site for a possible migration, prepare
an accurate individualized draft when the market and contact gates pass, and
record the result. This SOP excludes automated sending, domain-list crawling,
site cloning, and importing content without owner authorization.

### RACI

| Step | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Select a market and locale | Human operator | Product owner | Local legal reviewer | Draft-only bot |
| Approve contact basis and local rules | Legal reviewer | Product owner | Human operator | Draft-only bot |
| Review one selected business site | Draft-only bot | Human operator | Product owner | Legal reviewer |
| Verify recipient, fit, duplicate and suppression state | Human operator | Product owner | Legal reviewer | Draft-only bot |
| Prepare and approve exact copy | Draft-only bot prepares; human operator reviews | Product owner | Legal reviewer | — |
| Send through the supervised channel | Human operator | Product owner | Legal reviewer | Draft-only bot |
| Record delivery, reply, complaint and suppression | Human operator | Product owner | Legal reviewer | Draft-only bot |

The bot has no mail account, outbound action, schedule, or permission to
activate a gateway. It may prepare drafts only after the human has selected a
market, domain, and recipient.

### Process flow

`Market and locale approved → one domain selected → public fit evidence recorded → contact/legal/duplicate/suppression gates pass → draft prepared → human reviews exact recipient and copy → supervised human send → provider read-back → reply or suppression recorded`

Any failed or unknown gate ends in `HOLD`. A public email address or WordPress
technology signal alone does not satisfy the contact gate.

### Exceptions

| Scenario | Action |
| --- | --- |
| Japan or unsupported market/locale | Hold; do not research or draft. |
| Contact basis, market review, sender, or opt-out is missing | Hold; do not create an email draft. |
| Public content indicates WordPress but no owner authorization exists | Do not copy content, create a preview, or import. Ask whether the owner wants to authorize an export/API import. |
| Prospect expects full WordPress parity or a security guarantee | Explain the supported subset and prototype status; do not claim compatibility or superiority. |
| Duplicate, prior opt-out, complaint, bounce, or unknown suppression state | Suppress and do not send. |
| Product quota, owner provisioning, or custom-domain cost is unknown | Disclose the current gate; do not promise zero-cost custom domains or activate service. |

### Metrics and controls

| Metric | Target | How to measure |
| --- | --- | --- |
| Candidates with complete market/contact/legal/duplicate/suppression fields before draft | 100% | Review the per-recipient record. |
| Messages sent without individual human approval | 0 | Compare approved copy with provider send records. |
| Imports without explicit owner authorization | 0 | Check import authorization receipt and owner action audit. |
| Opt-outs and complaints reflected in suppression state | 100% | Read back the supervised provider and suppression ledger. |
| Replies and actual send states distinguished from drafts | 100% | Reconcile draft, approval, delivery, bounce, and reply events separately. |

## Activation checklist

Keep the profile disabled until all are recorded: supported target market and
locale, market-specific legal review, approved local-language copy, budget and
shared caps, verified sender identity, contact-source rules, suppression and
opt-out behavior, and a human approval path. No cron is configured in this
prototype.

Linear: [Draft WordPress migration sales profile and gated outreach process](https://linear.app/kotobalabs/issue/MITHRIL-276/draft-wordpress-migration-sales-profile-and-gated-outreach-process).
