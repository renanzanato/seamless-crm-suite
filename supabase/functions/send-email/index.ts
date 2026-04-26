import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Send Email Edge Function
 *
 * Sends email via connected Gmail/Outlook account.
 * Falls back to Resend if RESEND_API_KEY is set and no OAuth account available.
 * Creates email_tracking row + activity.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const PIXEL_BASE = `${SUPABASE_URL}/functions/v1/email-pixel`;
const REDIRECT_BASE = `${SUPABASE_URL}/functions/v1/email-redirect`;

async function refreshGmailToken(account: any, supabase: any): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to refresh Gmail token');

  await supabase
    .from('email_accounts')
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      status: 'active',
    })
    .eq('id', account.id);

  return data.access_token;
}

async function refreshOutlookToken(account: any, supabase: any): Promise<string> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
      scope: 'Mail.Send Mail.Read User.Read offline_access',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to refresh Outlook token');

  await supabase
    .from('email_accounts')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? account.refresh_token,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      status: 'active',
    })
    .eq('id', account.id);

  return data.access_token;
}

function injectTracking(html: string, trackingId: string): string {
  // Inject open pixel
  const pixel = `<img src="${PIXEL_BASE}?msg=${trackingId}" width="1" height="1" style="display:none" />`;

  // Wrap links for click tracking
  const withLinks = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url) => `href="${REDIRECT_BASE}?msg=${trackingId}&u=${encodeURIComponent(url)}"`,
  );

  return withLinks + pixel;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { accountId, to, subject, body, html, contactId } = await req.json();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get account
    const { data: account, error: accErr } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (accErr || !account) {
      // Fallback to Resend
      if (RESEND_API_KEY) {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'noreply@pipadriven.com',
            to,
            subject,
            html: html ?? `<p>${body}</p>`,
          }),
        });
        const resendData = await resendRes.json();
        return new Response(
          JSON.stringify({ messageId: resendData.id, trackingId: null }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error('Conta de email não encontrada e RESEND_API_KEY não configurada');
    }

    // Create tracking row first (to get ID for pixel/links)
    const { data: tracking } = await supabase
      .from('email_tracking')
      .insert({
        account_id: account.id,
        contact_id: contactId ?? null,
        direction: 'out',
        subject,
        body_preview: body?.slice(0, 200) ?? null,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const trackingId = tracking?.id ?? '';

    // Prepare HTML with tracking
    const emailHtml = injectTracking(
      html ?? `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>`,
      trackingId,
    );

    // Check token freshness
    let accessToken = account.access_token;
    const expiresAt = new Date(account.expires_at);
    if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      // Less than 5 min to expiry — refresh
      accessToken =
        account.provider === 'gmail'
          ? await refreshGmailToken(account, supabase)
          : await refreshOutlookToken(account, supabase);
    }

    let messageId = '';

    if (account.provider === 'gmail') {
      // Build RFC 5322 raw message
      const raw = [
        `From: ${account.email_address}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        emailHtml,
      ].join('\r\n');

      const encoded = btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        await supabase.from('email_tracking').update({ error_msg: errText }).eq('id', trackingId);
        throw new Error(`Gmail send failed: ${res.status}`);
      }

      const result = await res.json();
      messageId = result.id;
    } else {
      // Outlook via Microsoft Graph
      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: emailHtml },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        await supabase.from('email_tracking').update({ error_msg: errText }).eq('id', trackingId);
        throw new Error(`Outlook send failed: ${res.status}`);
      }

      messageId = `outlook-${trackingId}`;
    }

    // Update tracking with message_id
    await supabase
      .from('email_tracking')
      .update({ message_id: messageId })
      .eq('id', trackingId);

    // Create activity
    await supabase.from('activities').insert({
      kind: 'email',
      subject,
      body: body?.slice(0, 500),
      direction: 'out',
      occurred_at: new Date().toISOString(),
      contact_id: contactId ?? null,
      created_by: account.owner_id,
      payload: {
        message_id: messageId,
        tracking_id: trackingId,
        account_id: account.id,
        provider: account.provider,
      },
    });

    return new Response(
      JSON.stringify({ messageId, trackingId }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
