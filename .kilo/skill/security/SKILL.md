---
name: security
description: Audit code and changes for secrets, injection, and unsafe patterns. Run before commits or on demand.
---

# Skill: security

Use this skill when asked to audit for security issues, before committing
sensitive code, or whenever a change touches auth, crypto, input parsing,
or external I/O.

## Workflow

1. **Gather scope.** The diff (`git diff`), specific files, or `$1` path
   filter. Read changed files in full context.
2. **Secret sweep.** Scan for hardcoded credentials and tokens:
   - API keys / bearer tokens / passwords / private keys
   - Connection strings with embedded credentials
   - Patterns: `(?i)(api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\s*[:=]\s*["'\S]`
   - AWS/GCP/Azure keys, JWTs, PEM blocks
   - Real values must live in env vars or a secrets manager, never literals.
3. **Injection & deserialization.** Check for unsanitized input flowing
   into: SQL, shell, templates/eval, HTML, command builders, and
   untrusted deserialization (pickle, yaml.load without SafeLoader, eval).
4. **Auth & access.** Missing authz checks, IDOR, JWT `alg: none`, weak
   comparisons, plaintext password storage, missing rate limits on auth.
5. **Crypto.** Weak algorithms (MD5/SHA1 for security), custom crypto,
   hardcoded IVs/salts, ECB mode, insecure randomness for tokens.
6. **Deps & config.** Overly broad file/external-directory permissions,
   CORS `*` with credentials, debug flags in production, insecure
   redirect handling.

## Output

Group by severity:
- **Critical** — exploitable / secret leak. Must fix before commit.
- **High** — likely exploitable or broken access control.
- **Medium** — defense-in-depth gaps.
- **Low / Hardening** — best-practice improvements.

Cite `file:line` and give a concrete remediation per finding. If a secret
is found, instruct immediate rotation — do not just remove it from code.

Never edit files. Read-only; report findings.
