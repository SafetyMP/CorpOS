---
name: code-review
description: "Review CorpOS PRs for company-day simulation rules: PDP/PEP, HITL exceptions, and no live LLM in CI. Use on pull requests that touch packages/core, apps/api, apps/console, or verify scripts. Flag LangGraph/CrewAI additions and auto-approve in product paths."
---

# Copilot code review — CorpOS

Use this skill when reviewing a pull request in this repository.

CorpOS is a **company-day simulation**, not an orchestration framework.

- Reject auto-approve in product/demo paths.
- Reject live LLM in CI (`CORPOS_ALLOW_LIVE`, `OPENROUTER_API_KEY`).
- Reject Express, `better-sqlite3`, LangGraph, or CrewAI.
- Verify with `./scripts/harness/verify.sh`.


## Always flag

- Secrets, `.env` values, private keys, or real personal data in the diff
- Weakened or skipped verify / lint / typecheck / adversarial gates
- Invented success (prose claiming a gate passed with no command output)
- Fail-open authorization, skipped human approval, or agents recording `--actor user`

## Never request

- Drive-by major upgrades, formatter churn, or unrelated refactors
- Softening honesty disclaimers or certification claims
