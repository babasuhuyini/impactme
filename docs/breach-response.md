# ImpactMe: personal data breach response

One page to follow if personal data may have been exposed, changed, lost or deleted without permission. Fill in the placeholders now, not during an incident.

| Role | Who | Contact |
|---|---|---|
| Incident lead (decides, notifies) | **[TAYYIB]** | **[phone, email]** |
| Technical support | **[NAME]** | **[contact]** |
| Legal / data protection adviser | **[NAME]** | **[contact]** |
| Ghana Data Protection Commission | — | **[address, email, phone from dpc.gov.gh]** |
| Supabase support | — | supabase.com/support (dashboard › Support) |

## 1. First hour: contain

Write down the time you first knew, and every step you take after.

1. **Secret key exposed** (repo, chat, logs, screenshot): Supabase › Project Settings › API Keys › **delete that secret key**, create a new one, and update `IMPACTME_SECRET_KEY` in Edge Functions › Secrets. Treat anything the key could reach (all account data) as exposed.
2. **Resend API key exposed:** Resend › API Keys › revoke; create a sending-only key; update Supabase › Authentication › SMTP Settings.
3. **Turnstile secret exposed:** Cloudflare › Turnstile › rotate the secret; update Supabase › Authentication › Attack Protection.
4. **Accounts taken over, or sessions stolen:** Supabase › Authentication › Users › affected users › **sign out all sessions**; ask them to reset their passwords. For a wide incident, consider turning off new sign-ups for a while (Authentication › Sign In / Providers).
5. **Admin account compromised** (Supabase, GitHub, Google Cloud, Resend, Cloudflare, DNS): change its password, check that two-factor sign-in is on, remove unknown members and tokens, review recent changes.
6. **Bad code deployed** (for example a script that leaks data): revert on `main` so GitHub Pages republishes, or turn off GitHub Pages until fixed.
7. **Data deleted or damaged:** stop changes if possible; restore from Supabase backups (Database › Backups).

## 2. First 24 hours: assess

- What happened, when, and is it still happening?
- Which data: emails, names, tasks, **journal entries (health: special personal data)**, consent records, sessions?
- Which and how many people? Is anyone in the EU or UK?
- Evidence: Supabase › Logs (API, Auth, Edge Functions), GitHub audit log, Resend logs. Export them before they expire.
- Risk to people: could it cause harm, embarrassment, discrimination, fraud? Health data raises the risk.

## 3. Notify

- **Ghana Data Protection Commission:** as soon as reasonably practicable after discovering the breach (Act 843, section 31). **[ADVISER: confirm form and content]**
- **Affected people:** as soon as reasonably practicable, in plain language: what happened, what data, what we've done, what they should do (for example change their password), and who to contact. Act 843 requires this unless their identity can't be established.
- **If EU or UK users are affected:** the lead supervisory authority **within 72 hours** of becoming aware (GDPR Article 33 / UK GDPR), and the people affected without undue delay when the risk to them is high (Article 34).
- Processors must tell us without delay if the breach is on their side (Supabase, Resend: see their DPAs).

## 4. Afterwards

1. Fix the cause; add a test or check so it can't recur.
2. Record the incident below, even if no one had to be notified.
3. Review this page and `docs/data-inventory.md`.

## Incident record

| Date found | What happened | Data and people affected | Actions | Notified (who, when) | Closed |
|---|---|---|---|---|---|
| | | | | | |
