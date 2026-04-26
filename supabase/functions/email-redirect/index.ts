import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Email Redirect — click tracking.
 * Logs click in email_tracking.clicked_at and 302 redirects to original URL.
 */

serve(async (req) => {
  const url = new URL(req.url);
  const msgId = url.searchParams.get('msg');
  const targetUrl = url.searchParams.get('u');

  if (!targetUrl) {
    return new Response('Missing URL', { status: 400 });
  }

  if (msgId) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await supabase
        .from('email_tracking')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', msgId)
        .is('clicked_at', null);
    } catch {
      // Silently fail
    }
  }

  return Response.redirect(decodeURIComponent(targetUrl), 302);
});
