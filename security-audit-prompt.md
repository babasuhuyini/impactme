# Comprehensive Application Security Audit Prompt

Use before major production releases or when auditing an existing application.

Act as an independent senior application security auditor.

Your assignment is to conduct a comprehensive security assessment of this entire application.

I developed this application with AI assistance. Do not assume that the implementation is secure.

Use the project's CLAUDE.md security policy and the OWASP ASVS 5.0 framework as your baseline.

Also consider OWASP Top 10:2025, OWASP API Security Top 10 and the OWASP Web Security Testing Guide.

PHASE 1: APPLICATION DISCOVERY

Before testing, understand:

- The application architecture.
- Frontend framework.
- Backend architecture.
- Database technology.
- Authentication provider.
- External API integrations.
- Hosting and deployment platform.
- File storage architecture.
- User roles and permissions.
- Data being collected and stored.
- Available administrative functions.

Identify the application's trust boundaries and sensitive assets.

PHASE 2: THREAT MODELLING

Identify realistic threats to this application.

Consider:

- Unauthorised users.
- Malicious authenticated users.
- Compromised user accounts.
- Automated bots.
- Malicious file uploads.
- Third-party service compromise.
- Accidental credential exposure.
- Database access abuse.
- Privilege escalation.
- Data theft.
- Denial of service.
- Business logic abuse.

Document the attack scenarios and relevant controls.

PHASE 3: SECRETS AND CREDENTIAL AUDIT

Inspect:

- All source files.
- Environment variable references.
- Environment files.
- Git history.
- GitHub configuration.
- Production build output.
- Deployment configuration.
- Third-party integrations.

Identify exposed credentials and insecure secret-handling practices.

Do not print complete secret values in the report.

PHASE 4: AUTHENTICATION AND AUTHORISATION

Test:

- Registration.
- Login.
- Email verification.
- Password reset.
- Session handling.
- Logout.
- Session expiration.
- Protected routes.
- Administrative access.
- User-level permissions.
- Organisation-level permissions.
- Resource ownership.

Check for IDOR, privilege escalation and broken access control.

Use separate test accounts with different permission levels.

Do not access real users' private data.

PHASE 5: DATABASE AND STORAGE AUDIT

Inspect database permissions, RLS policies, storage permissions, database functions, RPC operations and administrative privileges.

Where Supabase is used, inspect:

- All exposed tables.
- RLS status.
- SELECT policies.
- INSERT policies.
- UPDATE policies.
- DELETE policies.
- Storage bucket permissions.
- Realtime authorisation.
- Database functions.
- Secret management.
- Database network security.

Test whether one user can access another user's information.

PHASE 6: FRONTEND AND API SECURITY

Assess the application for:

- XSS.
- CSRF.
- SQL injection.
- SSRF.
- Path traversal.
- Unsafe HTML rendering.
- Insecure CORS.
- Weak security headers.
- Authentication bypass.
- Broken API authorisation.
- Unrestricted resource consumption.
- Insecure webhook handling.
- Sensitive information disclosure.

PHASE 7: FILE SECURITY

If the application supports uploads or downloads, assess file validation, content verification, storage permissions, download authorisation, file size restrictions and malicious file handling.

PHASE 8: DEPENDENCY AND SUPPLY CHAIN AUDIT

Review:

- Package dependencies.
- Transitive dependencies.
- Known vulnerabilities.
- Outdated packages.
- Abandoned packages.
- Lockfile integrity.
- Build scripts.
- Deployment workflows.
- Third-party scripts.

Run suitable dependency and static security scans.

PHASE 9: DATA PRIVACY AND RESILIENCE

Assess:

- Personal information exposure.
- Data minimisation.
- Encryption.
- Data retention.
- Account deletion.
- Logging practices.
- Backup configuration.
- Recovery procedures.
- Error handling.

PHASE 10: AUTOMATED SECURITY TESTING

Where suitable tools are available, perform:

- SAST.
- Secret scanning.
- Dependency scanning.
- DAST.
- API security testing.
- Database policy testing.
- Production build inspection.

Do not install unfamiliar tools or make destructive changes without approval.

Do not run intrusive tests against third-party services or production systems without explicit authorisation.

PHASE 11: REPORT

Produce a professional security audit report containing:

1. Executive summary.
2. Application architecture and attack surface.
3. Threat model.
4. CRITICAL vulnerabilities.
5. HIGH vulnerabilities.
6. MEDIUM vulnerabilities.
7. LOW vulnerabilities.
8. INFORMATIONAL findings.
9. Security controls that passed verification.
10. Tests not performed.
11. Items requiring manual verification.
12. Recommended remediation priorities.
13. Overall security assessment.

For every vulnerability, include:

- Exact location.
- Supporting evidence.
- Potential impact.
- Severity.
- Recommended fix.
- How the fix should be verified.

Do not modify files during the initial audit.

Do not deploy anything.

Do not claim the application is secure simply because it builds successfully.

Wait for my approval before implementing remediation.
