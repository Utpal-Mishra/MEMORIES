# Project logs

Use these 13 categories to trace major decisions and changes. The repository is public. Its branches share that visibility. This directory contains the structure and blank templates for records approved for public release. Keep detailed historical records and private evidence in the owner's private audit register.

## Log categories

| Log | Code |
| --- | --- |
| [Business Learning](01-business-learning.md) | BL |
| [System](02-system.md) | SYS |
| [Architecture](03-architecture.md) | ARC |
| [Automation](04-automation.md) | AUT |
| [Recommendation](05-recommendation.md) | REC |
| [Experiment](06-experiment.md) | EXP |
| [External Evidence](07-external-evidence.md) | EVD |
| [Risk & Assumption](08-risk-assumption.md) | RSK |
| [Data & Integration](09-data-integration.md) | DAT |
| [Product / Feature](10-product-feature.md) | PRD |
| [Merchant & Fulfilment](11-merchant-fulfilment.md) | MER |
| [Expansion](12-expansion.md) | XPN |
| [Decision](13-decision.md) | DEC |

## Recording a change

1. Review the existing private register before assigning the next shared change ID, `FH-YYYYMMDD-NNN`. Use Europe/Dublin for event dates. Record an unknown event date explicitly and assign the ID using the recording date if needed.
2. Use an entry ID `<change-id>-<log-code>-NN`. Add entries to the applicable logs and cross-reference their IDs. Reuse the existing IDs when migrating records.
3. Copy the [entry template](templates/entry.md), including evidence and verification fields. Update the [change index](CHANGE_INDEX.md). For a risk or assumption, include its verification method, impact and mitigation.
4. Distinguish Proposed, Approved, Implemented, Verified, Deferred and Superseded. Record historical implementation reports as reported until their supporting evidence is checked. A code commit, CI result and live device check establish different facts.
5. Append corrections and reversals with links to the original record. Record the original event date and the backfill date separately.
6. Check the destination's visibility before adding content. Public records require explicit approval for their actual content. Keep detailed drafts in the ignored `/private-audit/` directory during local work and retain the authoritative record privately in the owner's account. Git ignore rules apply to untracked files and can be bypassed, so inspect the staged diff before every commit.
7. Private historical records can use this same folder structure in a verified private destination after the owner authorizes that destination and its access. Review repository access whenever collaborators, integrations or visibility change.

## Reviewing completeness

Use the [coverage template](templates/coverage.md) to track reviewed sources, event ranges and gaps. A retrieved chat summary is partial evidence. Keep unverified claims and unavailable source text visible in the private coverage record.
