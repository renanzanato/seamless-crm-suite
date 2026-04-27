import { supabase } from '@/lib/supabase';
import { returnEmptyOnOptionalSchema } from '@/lib/supabaseOptional';
import type { ReplyClassification, SuppressionEntry, SuppressionReason } from '@/types';

// ── Reply Classification ──────────────────────────────────

export interface ClassifiedActivity {
  id: string;
  activity_type: string;
  body: string | null;
  reply_classification: ReplyClassification | null;
  classification_confidence: number | null;
  classified_at: string | null;
  classified_by: string | null;
  sentiment_score: number | null;
  parsed_return_date: string | null;
  created_at: string;
  contact_id: string | null;
  deal_id: string | null;
  contact?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
}

export async function getClassifiedActivities(
  classification?: ReplyClassification,
  limit = 50,
): Promise<ClassifiedActivity[]> {
  let query = supabase
    .from('activities')
    .select('id, activity_type, body, reply_classification, classification_confidence, classified_at, classified_by, sentiment_score, parsed_return_date, created_at, contact_id, deal_id, contact:contacts!contact_id(id, name), deal:deals!deal_id(id, title)')
    .not('reply_classification', 'is', null)
    .order('classified_at', { ascending: false })
    .limit(limit);

  if (classification) {
    query = query.eq('reply_classification', classification);
  }

  const { data, error } = await query;
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as unknown as ClassifiedActivity[];
}

export async function getPendingClassifications(limit = 50): Promise<ClassifiedActivity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, activity_type, body, reply_classification, classification_confidence, classified_at, classified_by, sentiment_score, parsed_return_date, created_at, contact_id, deal_id, contact:contacts!contact_id(id, name), deal:deals!deal_id(id, title)')
    .eq('direction', 'in')
    .is('classified_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as unknown as ClassifiedActivity[];
}

export async function overrideClassification(
  activityId: string,
  classification: ReplyClassification,
  _classifiedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({
      reply_classification: classification,
      classified_at: new Date().toISOString(),
      classified_by: 'human',
    })
    .eq('id', activityId);
  if (error) throw error;
}

// ── Suppression List ──────────────────────────────────────

export async function getSuppressionList(limit = 100): Promise<SuppressionEntry[]> {
  const { data, error } = await supabase
    .from('suppression_list')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as SuppressionEntry[];
}

export async function addToSuppression(
  contactId: string | null,
  phone: string | null,
  reason: SuppressionReason,
  sourceActivityId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('suppression_list')
    .insert({
      contact_id: contactId,
      wa_phone_e164: phone,
      reason,
      source_activity_id: sourceActivityId ?? null,
    });
  if (error) throw error;
}

export async function removeFromSuppression(id: string): Promise<void> {
  const { error } = await supabase
    .from('suppression_list')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function isContactSuppressed(contactId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('suppression_list')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId);
  if (error) return returnEmptyOnOptionalSchema(error, false);
  return (count ?? 0) > 0;
}
