# Security Guidelines

## Mandatory Security Checks

Before ANY commit:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] No exact addresses (street number, building name). Area names and store names are OK.
- [ ] No phone numbers
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
