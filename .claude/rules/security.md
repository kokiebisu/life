# Security Guidelines

## Mandatory Security Checks

Before ANY commit:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] No personal information (addresses, phone numbers, etc.)
- [ ] Sensitive data belongs in Issues/comments, not in the repository
- [ ] Error messages don't leak sensitive data

## Secret Management

```
# NEVER: Hardcoded secrets in files
api_key = "sk-proj-xxxxx"

# ALWAYS: Use environment variables or keep in .env (gitignored)
```

## Security Response Protocol

If security issue found:

1. STOP immediately
2. Fix CRITICAL issues before continuing
3. Rotate any exposed secrets
4. Review related files for similar issues
