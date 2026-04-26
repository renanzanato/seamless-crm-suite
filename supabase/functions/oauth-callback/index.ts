import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * OAuth Callback Edge Function
 *
 * Handles the OAuth redirect from Gmail/Outlook.
 * Flow:
 *   1. Frontend opens window to: /functions/v1/oauth-callback?provider=gmail
 *   2. This function redirects to the OAuth provider's authorize URL
 *   3. Provider redirects back with ?code=...
 *   4. We exchange code for tokens and store in email_accounts
 *   5. Redirect to /settings?tab=email&status=connected
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const GOOGLE_REDIRECT_URI =
  Deno.env.get('GOOGLE_REDIRECT_URI') ??
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID') ?? '';
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '';
const MICROSOFT_REDIRECT_URI =
  Deno.env.get('MICROSOFT_REDIRECT_URI') ??
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:8080';

serve(async (req) => {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // contains user_id

  // Step 1: No code yet — redirect to OAuth provider
  if (!code) {
    if (provider === 'gmail') {
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent',
        state: `gmail:${url.searchParams.get('user_id') ?? ''}`,
      });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    }

    if (provider === 'outlook') {
      const params = new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        redirect_uri: MICROSOFT_REDIRECT_URI,
        response_type: 'code',
        scope: 'Mail.Send Mail.Read User.Read offline_access',
        state: `outlook:${url.searchParams.get('user_id') ?? ''}`,
      });
      return Response.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
    }

    return new Response('Missing provider', { status: 400 });
  }

  // Step 2: We have a code — exchange for tokens
  try {
    const [prov, userId] = (state ?? ':').split(':');
    const isGmail = prov === 'gmail';

    const tokenUrl = isGmail
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

    const tokenBody = new URLSearchParams({
      code,
      client_id: isGmail ? GOOGLE_CLIENT_ID : MICROSOFT_CLIENT_ID,
      client_secret: isGmail ? GOOGLE_CLIENT_SECRET : MICROSOFT_CLIENT_SECRET,
      redirect_uri: isGmail ? GOOGLE_REDIRECT_URI : MICROSOFT_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token exchange failed:', err);
      return Response.redirect(`${APP_URL}/settings?tab=email&status=error`);
    }

    const tokens = await tokenRes.json();

    // Get user email
    let emailAddress = '';
    if (isGmail) {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      emailAddress = profile.email;
    } else {
      const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      emailAddress = profile.mail ?? profile.userPrincipalName ?? '';
    }

    // Store in DB (service role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    await supabase.from('email_accounts').upsert(
      {
        owner_id: userId,
        provider: isGmail ? 'gmail' : 'outlook',
        email_address: emailAddress,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? '',
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scopes: isGmail
          ? ['gmail.send', 'gmail.readonly', 'userinfo.email']
          : ['Mail.Send', 'Mail.Read', 'User.Read'],
        status: 'active',
      },
      { onConflict: 'email_address' },
    );

    return Response.redirect(`${APP_URL}/settings?tab=email&status=connected`);
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return Response.redirect(`${APP_URL}/settings?tab=email&status=error`);
  }
});
