# Password-Free Email Connections

Memex connects Gmail and Outlook/Microsoft 365 through server-side OAuth 2.0.
Users sign in on the provider's own page. Memex never asks for, receives, or
stores a mailbox password for these connections.

## Before You Start

Set `APP_BASE_URL` to the exact public URL of the deployment. OAuth redirect
URLs must match exactly, including `https` and the domain.

For local development, use `http://localhost:3000` while `npm run dev` is
running. Do not put OAuth client secrets in a frontend variable or commit them.

## Google Gmail

1. Create or select a Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen. While testing, add yourself and other
   intended testers as test users.
4. Create an OAuth client ID of type **Web application**.
5. Add these authorized redirect URIs:

   - Local: `http://localhost:3000/api/email-accounts/oauth/google/callback`
   - Production: `https://YOUR_DOMAIN/api/email-accounts/oauth/google/callback`

6. Add the generated values to the server environment:

   ```env
   GOOGLE_OAUTH_CLIENT_ID="..."
   GOOGLE_OAUTH_CLIENT_SECRET="..."
   ```

Memex requests `gmail.modify` and `gmail.send` so it can sync Inbox messages,
perform the existing mailbox actions, and send user-approved mail. Google may
require OAuth verification before unrestricted public use because Gmail data
scopes are sensitive/restricted. Keep the app in testing mode until your
privacy policy, authorized domains, and verification requirements are ready.

## Microsoft Outlook / Microsoft 365

1. Open Microsoft Entra admin center and create an **App registration**.
2. Choose accounts appropriate for your users. `Accounts in any organizational
   directory and personal Microsoft accounts` supports Outlook.com plus many
   Microsoft 365 users.
3. Add a **Web** redirect URI:

   - Local: `http://localhost:3000/api/email-accounts/oauth/microsoft/callback`
   - Production: `https://YOUR_DOMAIN/api/email-accounts/oauth/microsoft/callback`

4. Create a client secret and copy it immediately; Microsoft shows it once.
5. Add the generated values to the server environment:

   ```env
   MICROSOFT_OAUTH_CLIENT_ID="..."
   MICROSOFT_OAUTH_CLIENT_SECRET="..."
   ```

Memex requests delegated `Mail.ReadWrite`, `Mail.Send`, and `offline_access`
permissions. Some Microsoft 365 organizations require an administrator to
grant consent before users can connect.

## Security Model

- Authorization uses server-side authorization-code flow with PKCE, an
  HttpOnly SameSite=Lax state cookie, signed state, and a ten-minute expiry.
- OAuth access and refresh tokens are encrypted with `ENCRYPTION_KEY` before
  database storage and are never returned by the API.
- Access tokens refresh server-side. A revoked connection is marked
  disconnected and must be reauthorized by the user.
- Disconnecting clears Memex's stored OAuth tokens. Google revocation is also
  attempted; users can revoke any remaining provider grant in their Google or
  Microsoft security settings.
- OAuth client secrets remain server-only. Never prefix them with `NEXT_PUBLIC_`.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes), and [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
