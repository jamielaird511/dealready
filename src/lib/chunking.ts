import { createSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_CHUNK_SIZE = 2500;
const DEFAULT_OVERLAP = 200;
const BATCH_SIZE = 200;

export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): { content: string; char_start: number; char_end: number }[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
    return [];
  }
  const step = chunkSize - overlap;
  const chunks: { content: string; char_start: number; char_end: number }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push({
      content: text.slice(start, end),
      char_start: start,
      char_end: end,
    });
    start += step;
    if (end >= text.length) break;
  }
  return chunks;
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export type WriteSubmissionFileChunksParams = {
  supabaseAdmin: SupabaseAdmin;
  submissionFileId: string;
  extractedText: string;
  force?: boolean;
  chunkSize?: number;
  overlap?: number;
};

export type WriteSubmissionFileChunksResult =
  | { skipped: true }
  | { chunks: number };

export async function writeSubmissionFileChunks(params: WriteSubmissionFileChunksParams): Promise<WriteSubmissionFileChunksResult> {
  const {
    supabaseAdmin,
    submissionFileId,
    extractedText,
    force = false,
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
  } = params;

  const text = extractedText.trim();
  if (!text) {
    return { skipped: true };
  }

  // Idempotency: if chunks exist and not force, skip
  const { data: existingChunks, error: countError } = await supabaseAdmin
    .from("submission_file_chunks")
    .select("submission_file_id")
    .eq("submission_file_id", submissionFileId)
    .limit(1);

  if (countError) {
    throw new Error(`Failed to check existing chunks: ${countError.message}`);
  }

  if (existingChunks && existingChunks.length > 0 && !force) {
    return { skipped: true };
  }

  if (force && existingChunks && existingChunks.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("submission_file_chunks")
      .delete()
      .eq("submission_file_id", submissionFileId);
    if (deleteError) {
      throw new Error(`Failed to delete existing chunks: ${deleteError.message}`);
    }
  }

  const chunkSpecs = chunkText(text, chunkSize, overlap);
  const rows = chunkSpecs.map((c, idx) => ({
    submission_file_id: submissionFileId,
    chunk_index: idx,
    content: c.content,
    char_start: c.char_start,
    char_end: c.char_end,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabaseAdmin.from("submission_file_chunks").insert(batch);
    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }
  }

  return { chunks: rows.length };
}
