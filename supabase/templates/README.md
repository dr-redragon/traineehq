# Auth email templates

Supabase's auth and security-notification emails in the hub's design. Paste
each into Supabase → Authentication → Emails, with the subject below.

| File | Supabase template | Subject |
|---|---|---|
| confirm-signup.html | Confirm sign up | Confirm your email — HST Training Hub |
| invite.html | Invite user | You've been invited to HST Training Hub |
| magic-link.html | Magic link | Your sign-in link — HST Training Hub |
| change-email.html | Change email address | Confirm your new email address — HST Training Hub |
| reset-password.html | Reset password | Reset your password — HST Training Hub |
| reauthentication.html | Reauthentication | Your verification code — HST Training Hub |
| password-changed.html | Password changed | Your password was changed — HST Training Hub |
| email-changed.html | Email address changed | Your email address was changed — HST Training Hub |
| phone-changed.html | Phone number changed | Your phone number was changed — HST Training Hub |
| identity-linked.html | Identity linked | A new sign-in method was added — HST Training Hub |
| identity-unlinked.html | Identity unlinked | A sign-in method was removed — HST Training Hub |
| mfa-enrolled.html | MFA method added | Two-step verification added — HST Training Hub |
| mfa-unenrolled.html | MFA method removed | Two-step verification removed — HST Training Hub |

The app's own invitations and admin-sent reset links go out through the
`invite-user` and `admin-user` functions with their own HTML; these templates
cover the emails Supabase Auth sends itself (Forgot password, email changes,
security notices).
