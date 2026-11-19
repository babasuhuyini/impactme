# ImpactMe: sign-in email templates

Paste these into **Supabase › Authentication › Emails › Templates**. Each link opens the app, and the app finishes the step itself, so the link works in any browser or on any device, and email scanners that open links in advance can't use it up.

The link must stay exactly as written: `{{ .RedirectTo }}` is the app's address (the live site, or `http://localhost:5173/` when testing locally), and `{{ .TokenHash }}` is a one-time code that expires.

## Confirm signup

**Subject:** `Confirm your email for ImpactMe`

**Message body** (switch the editor to source/HTML if it offers one):

```html
<div style="font-family: Arial, Helvetica, sans-serif; color: #14201b; max-width: 480px; margin: 0 auto; padding: 24px 8px; line-height: 1.5">
  <h2 style="margin: 0 0 12px; font-size: 22px">Confirm your email</h2>
  <p style="margin: 0 0 12px">Hi,</p>
  <p style="margin: 0 0 20px">Thanks for creating an ImpactMe account. Confirm this email address to finish, and your tasks, projects and settings can sync across your devices.</p>
  <p style="margin: 0 0 24px">
    <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"
       style="display: inline-block; background: #0b7a5d; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 22px; border-radius: 10px">Confirm Email</a>
  </p>
  <p style="margin: 0 0 8px; font-size: 14px; color: #5d6b65">Or copy this link into your browser:</p>
  <p style="margin: 0 0 20px; font-size: 13px; word-break: break-all; color: #0a7356">{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email</p>
  <p style="margin: 0; font-size: 14px; color: #5d6b65">If you didn't create an ImpactMe account, you can ignore this email. No account is made until the address is confirmed.</p>
</div>
```

## Reset password

**Subject:** `Reset your ImpactMe password`

```html
<div style="font-family: Arial, Helvetica, sans-serif; color: #14201b; max-width: 480px; margin: 0 auto; padding: 24px 8px; line-height: 1.5">
  <h2 style="margin: 0 0 12px; font-size: 22px">Reset your password</h2>
  <p style="margin: 0 0 12px">Hi,</p>
  <p style="margin: 0 0 20px">Someone asked to reset the password for the ImpactMe account that uses this email address. If that was you, choose a new password here:</p>
  <p style="margin: 0 0 24px">
    <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery"
       style="display: inline-block; background: #0b7a5d; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 22px; border-radius: 10px">Choose a New Password</a>
  </p>
  <p style="margin: 0 0 8px; font-size: 14px; color: #5d6b65">Or copy this link into your browser:</p>
  <p style="margin: 0 0 20px; font-size: 13px; word-break: break-all; color: #0a7356">{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery</p>
  <p style="margin: 0; font-size: 14px; color: #5d6b65">If you didn't ask for this, ignore this email. Your password stays the same.</p>
</div>
```

## Notes

- `type=email` for sign-up confirmation and `type=recovery` for a password reset: the app treats them differently, so don't swap them.
- The other templates (Magic Link, Change Email, Invite, Reauthentication) aren't used by ImpactMe.
- To test: sign up from the **live site** (or set `VITE_SITE_URL` to the live address), not from `localhost`. A link to `localhost` in an email is a strong spam signal, and only works on the computer running the app.
