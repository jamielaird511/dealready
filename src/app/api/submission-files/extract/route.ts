import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { writeSubmissionFileChunks } from "@/lib/chunking";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
// @ts-expect-error - pdf-parse has no type declarations
import pdfParse from "pdf-parse";

const MIN_TEXT_LENGTH = 200;

let documentAiClient: DocumentProcessorServiceClient | null = null;

function getDocumentAiClient() {
  if (documentAiClient) return documentAiClient;

  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION;
  if (!location) {
    throw new Error("Missing GOOGLE_DOCUMENT_AI_LOCATION");
  }

  const apiEndpoint = `${location}-documentai.googleapis.com`;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    documentAiClient = new DocumentProcessorServiceClient({
      apiEndpoint,
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      projectId: creds.project_id,
    });
  } else {
    documentAiClient = new DocumentProcessorServiceClient({
      apiEndpoint,
    });
  }

  return documentAiClient;
}

function isPdf(mimeType: string | null, storagePath: string): boolean {
  return (
    mimeType === "application/pdf" ||
    (typeof storagePath === "string" && storagePath.toLowerCase().endsWith(".pdf"))
  );
}

async function toBufferAsync(data: Blob | ArrayBuffer | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  const ab = await (data as Blob).arrayBuffer();
  return Buffer.from(ab);
}

async function runOcrFallback(buffer: Buffer, fileId: string): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION;
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;

  if (!projectId || !location || !processorId) {
    console.log("[submission-files/extract] Document AI config missing; skipping OCR for file:", fileId);
    return "";
  }

  try {
    const client = getDocumentAiClient();
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: buffer,
        mimeType: "application/pdf",
      },
    });

    const text = result.document?.text?.trim() ?? "";

    console.log(
      "[submission-files/extract] Document AI OCR complete for file:",
      fileId,
      "chars:",
      text.length
    );

    return text;
  } catch (error) {
    console.error(
      "[submission-files/extract] Document AI OCR failed for file:",
      fileId,
      error
    );
    return "";
  }
}

export async function POST(request: Request) {
  try {
    let fileId: string;
    try {
      const body = await request.json();
      fileId = typeof body?.fileId === "string" ? body.fileId.trim() : "";
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!fileId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

  const { data: row, error: fetchError } = await supabase
    .from("submission_files")
    .select("id, storage_path, mime_type, storage_bucket, extraction_status, extracted_text")
    .eq("id", fileId)
    .single();

  if (fetchError || !row) {
    console.log("[submission-files/extract] File not found:", fileId, fetchError?.message);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { storage_path: storagePath, mime_type: mimeType, storage_bucket: storageBucket, extraction_status: existingStatus, extracted_text: existingText } = row as {
    id: string;
    storage_path: string;
    mime_type: string | null;
    storage_bucket?: string | null;
    extraction_status?: string | null;
    extracted_text?: string | null;
  };
  const bucket = storageBucket ?? "deal-packs";

  if (!isPdf(mimeType, storagePath)) {
    await supabase
      .from("submission_files")
      .update({ extraction_status: "skipped" })
      .eq("id", fileId);
    console.log("[submission-files/extract] Skipped non-PDF file:", fileId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (existingStatus === "succeeded" && typeof existingText === "string" && existingText.length > 0) {
    return NextResponse.json({ ok: true, alreadyExtracted: true });
  }

  await supabase
    .from("submission_files")
    .update({ extraction_status: "processing" })
    .eq("id", fileId);

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || fileData == null) {
      const errMsg = downloadError?.message ?? "Download returned no data";
      console.log("[submission-files/extract] Download failed:", fileId, errMsg);
      await supabase
        .from("submission_files")
        .update({
          extraction_status: "failed",
          extraction_error: errMsg,
        })
        .eq("id", fileId);
      return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
    }

    const buffer = await toBufferAsync(fileData);
    const parsed = await pdfParse(buffer);
    const extractedText = (parsed?.text ?? "").trim();

    let finalText = extractedText;

    if (extractedText.length >= MIN_TEXT_LENGTH) {
      console.log("[submission-files/extract] text parse succeeded", {
        fileId,
        length: extractedText.length,
      });
    } else {
      console.log("[submission-files/extract] text parse insufficient, trying OCR", {
        fileId,
        length: extractedText.length,
      });
      const ocrText = await runOcrFallback(buffer, fileId);
      if (ocrText.length >= MIN_TEXT_LENGTH) {
        finalText = ocrText;
        console.log("[submission-files/extract] OCR succeeded", {
          fileId,
          length: finalText.length,
        });
      } else {
        console.log("[submission-files/extract] OCR failed / no extractable text", {
          fileId,
          parseLength: extractedText.length,
          ocrLength: ocrText.length,
        });
        await supabase
          .from("submission_files")
          .update({
            extraction_status: "failed",
            extraction_error: "No extractable text found in PDF",
          })
          .eq("id", fileId);
        return NextResponse.json({ ok: false, error: "No extractable text found in PDF" }, { status: 500 });
      }
    }

    // submission_files has no extracted_text_len column; do not add it to the update
    await supabase
      .from("submission_files")
      .update({
        extraction_status: "succeeded",
        extracted_text: finalText,
        extracted_at: new Date().toISOString(),
        extraction_error: null,
      })
      .eq("id", fileId);

    try {
      await writeSubmissionFileChunks({
        supabaseAdmin: supabase,
        submissionFileId: fileId,
        extractedText: finalText,
        force: true,
      });
    } catch (chunkErr) {
      console.error("[submission-files/extract] Chunking failed (extraction succeeded):", chunkErr);
    }

    console.log("[submission-files/extract] Extracted text for file:", fileId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[extract] error:", err);
    console.error("[extract] stack:", (err as Error & { stack?: string })?.stack);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log("[submission-files/extract] Extraction error:", fileId, errMsg);
    await supabase
      .from("submission_files")
      .update({
        extraction_status: "failed",
        extraction_error: errMsg,
      })
      .eq("id", fileId);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
  } catch (err: unknown) {
    console.error("[extract] error:", err);
    console.error("[extract] stack:", (err as Error & { stack?: string })?.stack);
    return NextResponse.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 500 });
  }
}
