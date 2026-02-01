import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { writeSubmissionFileChunks } from "@/lib/chunking";

const DEFAULT_CHUNK_SIZE = 2500;
const DEFAULT_OVERLAP = 200;

export async function POST(request: Request) {
  try {
    let submissionFileId: string;
    let force = false;
    let chunkSize = DEFAULT_CHUNK_SIZE;
    let overlap = DEFAULT_OVERLAP;
    try {
      const body = (await request.json().catch(() => ({}))) as unknown;
      const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const idFromBody = typeof obj.submissionFileId === "string" ? obj.submissionFileId.trim() : (typeof obj.fileId === "string" ? obj.fileId.trim() : "");
      submissionFileId = idFromBody;
      force = obj.force === true;
      if (typeof obj.chunkSize === "number" && obj.chunkSize > 0) chunkSize = Math.floor(obj.chunkSize);
      if (typeof obj.overlap === "number" && obj.overlap >= 0) overlap = Math.floor(obj.overlap);
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!submissionFileId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: row, error: fetchError } = await supabase
      .from("submission_files")
      .select("id, extraction_status, extracted_text")
      .eq("id", submissionFileId)
      .single();

    if (fetchError || !row) {
      console.log("[submission-files/chunk] File not found:", submissionFileId, fetchError?.message);
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const extractionStatus = (row as { extraction_status?: string | null }).extraction_status;
    const extractedText = (row as { extracted_text?: string | null }).extracted_text;

    if (extractionStatus !== "succeeded" || typeof extractedText !== "string") {
      return NextResponse.json(
        { ok: false, error: "File has no extracted text (run extract first or check extraction_status)" },
        { status: 400 }
      );
    }

    const text = extractedText.trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Extracted text is empty" },
        { status: 400 }
      );
    }

    const result = await writeSubmissionFileChunks({
      supabaseAdmin: supabase,
      submissionFileId,
      extractedText: text,
      force,
      chunkSize,
      overlap,
    });

    if ("skipped" in result && result.skipped) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    if ("chunks" in result && typeof result.chunks === "number") {
      console.log("[submission-files/chunk] Chunked file:", submissionFileId, "chunks:", result.chunks);
      return NextResponse.json({ ok: true, chunks: result.chunks });
    }
    return NextResponse.json({ ok: true, chunks: 0 });
  } catch (err: unknown) {
    console.error("[submission-files/chunk] Error:", err);
    return NextResponse.json(
      { ok: false, error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
