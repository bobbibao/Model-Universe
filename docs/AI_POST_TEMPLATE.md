# AI post template

The owner's original document is versioned, unchanged, at
[model-universe-post-template.md](../apps/agent-service/data/knowledge/brand/model-universe-post-template.md).
It is included in the agent Docker image through the existing `COPY data ./data` step.

The admin `marketing_copy` graph loads the entire document into the Facebook writer's system instructions.
The assistant copywriter, growth brand-voice playbook and Facebook brand judge also receive the template.
Facebook drafts are checked for the service/location/shipping/CTA footer, shop/anh em voice, selected products,
known NEW/2ND conditions, verified prices and every disclosed defect before being returned to the admin.

Product facts come from the selected catalog rows, including assembly state, box condition, accessories and defects.
Selection is not capped and facts are not shortened to omit products. The template's example prices, free shipping,
deposits, gifts and assembly rates do not establish current offers. Its hotline remains unconfirmed and is omitted.
Existing claim validation, publishing approvals and budget rules still apply.

The original document can be updated at that canonical path. Restart/rebuild the agent after changing it: brand files
are read once when the process imports its configuration.
