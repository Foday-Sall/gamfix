/// <reference path="../pb_data/types.d.ts" />
// GamFix: use PocketBase's NATIVE verification + password-reset emails,
// pointing their links at the app's own confirm pages instead of the
// PocketBase admin UI pages. No custom email hooks are involved: the SDK's
// requestVerification/requestPasswordReset send these templates, and the app
// confirms with confirmVerification/confirmPasswordReset (docs:
// Authentication, Sending emails).
migrate((app) => {
  const c = app.findCollectionByNameOrId('users')

  c.verificationTemplate.subject = 'Verify your {APP_NAME} email'
  c.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for joining us at {APP_NAME}.</p>
<p>Click on the button below to verify your email address.</p>
<p>
  <a class="btn" href="https://gamfix.pocketsoftware.dev/verify/email?token={TOKEN}" target="_blank" rel="noopener">Verify email</a>
</p>
<p><i>If you didn't recently register, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`

  c.resetPasswordTemplate.subject = 'Reset your {APP_NAME} password'
  c.resetPasswordTemplate.body = `<p>Hello,</p>
<p>Click on the button below to reset your {APP_NAME} password.</p>
<p>
  <a class="btn" href="https://gamfix.pocketsoftware.dev/reset-password?token={TOKEN}" target="_blank" rel="noopener">Reset password</a>
</p>
<p><i>If you didn't ask to reset your password, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`

  app.save(c)
}, (app) => {
  // Revert to PocketBase's default admin-page templates.
  const c = app.findCollectionByNameOrId('users')

  c.verificationTemplate.subject = 'Verify your {APP_NAME} email'
  c.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for joining us at {APP_NAME}.</p>
<p>Click on the button below to verify your email address.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a>
</p>
<p><i>If you didn't recently register, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`

  c.resetPasswordTemplate.subject = 'Reset your {APP_NAME} password'
  c.resetPasswordTemplate.body = `<p>Hello,</p>
<p>Click on the button below to reset your password.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>
</p>
<p><i>If you didn't ask to reset your password, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`

  app.save(c)
})
