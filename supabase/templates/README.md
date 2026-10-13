# Auth email templates

Supabase's auth and security-notification emails in the hub's design. Paste
each into Supabase → Authentication → Emails, with the subject below.

| File | Supabase template | Subject |
|---|---|---|
| confirm-signup.html | Confirm sign up | Confirm your email — TraineeHQ |
| invite.html | Invite user | You've been invited to TraineeHQ |
| magic-link.html | Magic link | Your sign-in link — TraineeHQ |
| change-email.html | Change email address | Confirm your new email address — TraineeHQ |
| reset-password.html | Reset password | Reset your password — TraineeHQ |
| reauthentication.html | Reauthentication | Your verification code — TraineeHQ |
| password-changed.html | Password changed | Your password was changed — TraineeHQ |
| email-changed.html | Email address changed | Your email address was changed — TraineeHQ |
| phone-changed.html | Phone number changed | Your phone number was changed — TraineeHQ |
| identity-linked.html | Identity linked | A new sign-in method was added — TraineeHQ |
| identity-unlinked.html | Identity unlinked | A sign-in method was removed — TraineeHQ |
| mfa-enrolled.html | MFA method added | Two-step verification added — TraineeHQ |
| mfa-unenrolled.html | MFA method removed | Two-step verification removed — TraineeHQ |

The app's own invitations and admin-sent reset links go out through the
`invite-user` and `admin-user` functions with their own HTML; these templates
cover the emails Supabase Auth sends itself (Forgot password, email changes,
security notices).
