/**
 * POST /functions/v1/process-material
 *
 * Turns an uploaded file into learnable material:
 *   upload → extract text → chunk → embed → AI-analyse → ready
 *
 * Extraction strategy
 * ───────────────────
 *  PDF     `unpdf` (pdf.js core, serverless-safe) pulls the text layer.
 *  PPTX    slide XML + speaker notes, slide order preserved.
 *  DOCX    document XML, split on explicit page breaks.
 *  Text    used as-is.
 *  Images  require a vision-capable model.
 *
 * VISION: the active model (deepseek-v4-flash) is TEXT-ONLY. A scanned PDF has
 * no text layer, so rather than silently indexing an empty document — which
 * would then generate confident nonsense — we detect the thin text layer and
 * fail with an explicit, actionable message. `modelSupportsVision()` gates the
 * OCR path so it lights up automatically if a vision model is ever configured.
 *
 * Embeddings use Supabase Edge Runtime's built-in `gte-small` (384-dim).
 * It runs in-process, costs nothing, and needs no third-party embedding API.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration, modelSupportsVision } from "../_shared/openrouter.ts";
import { materialAnalysisSchema } from "../_shared/schemas.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { extractPptx, extractDocx, isPptx, isDocx } from "../_shared/officedocs.ts";

// deno-lint-ignore no-explicit-any
declare const Supabase: any;

interface Chunk {
  index: number;
  content: string;
  heading: string | null;
  pageFrom: number | null;
  pageTo: number | null;
}

/**
 * Page-aware chunking.
 *
 * Chunks carry the page range they came from, so every generated question and
 * every tutor citation can point at "page 17" rather than "somewhere in your
 * document". For a government trainer reviewing an AI-generated assessment,
 * that is the difference between verifiable and unauditable.
 *
 * ~1200-char chunks on paragraph boundaries with 150-char overlap: overlap
 * keeps a concept that straddles a boundary retrievable from either side,
 * paragraph-awareness stops us cutting mid-sentence.
 */
function chunkPages(pages: string[], target = 1200, overlap = 150): Chunk[] {
  // Flatten to paragraphs while remembering which page each came from.
  type Para = { text: string; page: number };
  const paras: Para[] = [];
  pages.forEach((pageText, i) => {
    for (const raw of pageText.split(/\n\s*\n/)) {
      const text = raw.trim();
      if (text) paras.push({ text, page: i + 1 });
    }
  });

  const isHeading = (p: string) =>
    p.length < 120 && (/^[A-Z0-9][^.!?]*$/.test(p) || /^(chapter|section|unit|part|\d+\.)/i.test(p));

  const chunks: Chunk[] = [];
  let buf = "";
  let heading: string | null = null;
  let pageFrom: number | null = null;
  let pageTo: number | null = null;

  const flush = () => {
    const content = buf.trim();
    if (content.length > 40) {
      chunks.push({
        index: chunks.length,
        content,
        heading,
        pageFrom,
        pageTo,
      });
    }
    // Carry the tail forward as overlap; it belongs to the page we ended on.
    buf = content.length > overlap ? content.slice(-overlap) : "";
    pageFrom = buf ? pageTo : null;
  };

  for (const p of paras) {
    if (isHeading(p.text)) heading = p.text;
    if ((buf + "\n\n" + p.text).length > target && buf.length > 0) flush();
    if (pageFrom === null) pageFrom = p.page;
    pageTo = p.page;
    buf += (buf ? "\n\n" : "") + p.text;
  }
  flush();

  // Split any oversized chunk (dense tables, wall-of-text pages) but keep
  // its page attribution.
  const final: Chunk[] = [];
  for (const c of chunks) {
    if (c.content.length <= target * 2) { final.push({ ...c, index: final.length }); continue; }
    for (let i = 0; i < c.content.length; i += target - overlap) {
      final.push({
        index: final.length,
        content: c.content.slice(i, i + target),
        heading: c.heading,
        pageFrom: c.pageFrom,
        pageTo: c.pageTo,
      });
    }
  }
  return final;
}

async function ocrViaVision(
  dataUrl: string, userId: string, pageHint: string,
): Promise<{ text: string; model: string; cost: number }> {
  const r = await chat<unknown>({           // Kimi k2.5 — vision-capable
    task: "ocr_material",
    userId,
    temperature: 0.1,
    maxTokens: 16_000,
    timeoutMs: 120_000,
    messages: [
      {
        role: "system",
        content:
          "You are a precise OCR and document-transcription engine. Transcribe ALL text from the image in natural reading order. " +
          "Preserve headings, numbered lists and table structure (render tables as markdown). " +
          "Transcribe mathematical notation as LaTeX. Do not summarise, do not comment, do not add anything that is not in the image. " +
          "If the image contains no legible text, reply with exactly: [NO_TEXT]",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Transcribe this document page. ${pageHint}` },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  return { text: r.content === "[NO_TEXT]" ? "" : r.content, model: r.model, cost: r.costUsd };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const admin = adminClient();
  let userId: string | null = null;
  let materialId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const { material_id } = await req.json().catch(() => ({}));
    if (!material_id) return errorResponse("material_id is required", 400);
    materialId = material_id;

    const { data: material, error: mErr } = await supabase
      .from("materials")
      .select("id, owner_id, title, storage_path, mime_type, status")
      .eq("id", material_id)
      .single();
    if (mErr || !material) return errorResponse("Material not found", 404, mErr?.message);
    if (material.owner_id !== userId) return errorResponse("Not your material", 403);
    if (!material.storage_path) return errorResponse("Material has no stored file", 400);

    await supabase.from("materials").update({ status: "extracting" }).eq("id", material_id);

    // ── 1. Download ─────────────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await admin.storage
      .from("materials")
      .download(material.storage_path);
    if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = material.mime_type ?? blob.type ?? "application/octet-stream";

    // ── 2. Extract ──────────────────────────────────────────────────────────
    let text = "";
    // One entry per page, so chunks can be attributed to a page number.
    let pages: string[] = [];
    let pageCount: number | null = null;
    let usedOcr = false;
    let ocrCost = 0;

    if (mime === "application/pdf" || material.storage_path.toLowerCase().endsWith(".pdf")) {
      try {
        const pdf = await getDocumentProxy(bytes);
        pageCount = pdf.numPages;
        // mergePages:false returns an array — one string per page. That array
        // is what makes page-level citation possible downstream.
        const { text: pdfText } = await extractText(pdf, { mergePages: false });
        pages = Array.isArray(pdfText) ? pdfText.map((p) => String(p ?? "")) : [String(pdfText ?? "")];
        text = pages.join("\n\n");
      } catch (e) {
        console.warn("[process-material] pdf text layer failed", e);
      }

      // Heuristic: a real text PDF yields well over 100 chars/page. Far less
      // than that means we're looking at page images, not text.
      const charsPerPage = pageCount ? text.replace(/\s/g, "").length / pageCount : text.length;
      if (charsPerPage < 100) {
        if (!modelSupportsVision()) {
          await supabase.from("materials").update({
            status: "failed",
            error_message:
              "This looks like a scanned PDF — it has images of text rather than selectable text. " +
              "The current model reads text only. Please upload a text-based PDF, a PPTX/DOCX, " +
              "or run OCR on the file first.",
          }).eq("id", material_id);
          return errorResponse(
            "Scanned document detected. The active model is text-only, so this file cannot be read.",
            422,
            { scanned: true, chars_per_page: Math.round(charsPerPage), needs_vision_model: true },
          );
        }

        console.log(`[process-material] thin text layer (${Math.round(charsPerPage)} chars/page) → vision OCR`);
        const b64 = btoa(String.fromCharCode(...bytes.slice(0, 8_000_000)));
        const ocr = await ocrViaVision(
          `data:application/pdf;base64,${b64}`, userId,
          `This is a ${pageCount ?? "multi"}-page scanned document.`,
        );
        if (ocr.text.trim().length > text.trim().length) {
          text = ocr.text;
          pages = text.split(/\f|\n(?=\s*(?:Page|PAGE)\s+\d+\s*\n)/).filter((p) => p.trim());
          if (pages.length < 2) pages = [text];
          usedOcr = true;
          ocrCost = ocr.cost;
        }
      }
    } else if (isPptx(mime, material.storage_path)) {
      // Slide decks are a large share of government training material, and a
      // deck's speaker notes often carry the real explanation.
      const deck = extractPptx(bytes);
      pages = deck.pages;
      text = deck.text;
      pageCount = deck.slideCount ?? deck.pages.length;
    } else if (isDocx(mime, material.storage_path)) {
      const doc = extractDocx(bytes);
      pages = doc.pages;
      text = doc.text;
      pageCount = doc.pages.length;
    } else if (mime.startsWith("image/")) {
      if (!modelSupportsVision()) {
        await supabase.from("materials").update({
          status: "failed",
          error_message: "Image uploads need a vision-capable model. Please upload a PDF, PPTX, DOCX or text file.",
        }).eq("id", material_id);
        return errorResponse(
          "Image uploads require a vision-capable model. The active model is text-only.",
          422, { needs_vision_model: true },
        );
      }
      const b64 = btoa(String.fromCharCode(...bytes));
      const ocr = await ocrViaVision(`data:${mime};base64,${b64}`, userId, "Single page image.");
      text = ocr.text;
      pages = [text];
      usedOcr = true;
      ocrCost = ocr.cost;
      pageCount = 1;
    } else if (mime.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(material.storage_path)) {
      text = new TextDecoder().decode(bytes);
      pages = [text];
    } else {
      return errorResponse(
        `Unsupported file type: ${mime}. Supported: PDF, PPTX, DOCX, images (JPG/PNG/WebP), and plain text/markdown.`,
        415,
      );
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    pages = (pages.length ? pages : [text]).map((p) =>
      p.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim(),
    );

    if (text.length < 50) {
      await supabase.from("materials").update({
        status: "failed",
        error_message: "Could not extract readable text. If this is a scan, try a clearer photo or a higher-quality PDF.",
      }).eq("id", material_id);
      return errorResponse("No readable text could be extracted from this file.", 422);
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    await supabase.from("materials").update({
      status: "chunking",
      extracted_text: text,
      word_count: wordCount,
      page_count: pageCount,
    }).eq("id", material_id);

    // ── 3. Chunk ────────────────────────────────────────────────────────────
    const chunks = chunkPages(pages);

    // ── 4. Embed (Supabase built-in gte-small, 384-dim, free) ───────────────
    await supabase.from("materials").update({ status: "embedding" }).eq("id", material_id);

    let embedded = 0;
    try {
      const session = new Supabase.ai.Session("gte-small");
      await admin.from("material_chunks").delete().eq("material_id", material_id);

      const BATCH = 20;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const rows = await Promise.all(slice.map(async (c) => {
          let embedding: number[] | null = null;
          try {
            embedding = await session.run(c.content, { mean_pool: true, normalize: true });
          } catch (e) {
            console.warn(`[embed] chunk ${c.index} failed`, e);
          }
          if (embedding) embedded++;
          return {
            material_id,
            chunk_index: c.index,
            content: c.content,
            token_count: Math.ceil(c.content.length / 4),
            heading: c.heading,
            page_from: c.pageFrom,
            page_to: c.pageTo,
            embedding,
          };
        }));
        const { error } = await admin.from("material_chunks").insert(rows);
        if (error) console.error("[embed] insert failed", error.message);
      }
    } catch (e) {
      // Embeddings are an enhancement; quiz generation works without them.
      console.error("[embed] embedding unavailable, continuing without RAG", e);
    }

    // ── 5. AI analysis: summary, topics, competency tagging ─────────────────
    const { data: comps } = await admin
      .from("competencies").select("id, code, name, comp_type").eq("is_active", true).limit(60);
    const compList = (comps ?? []).map((c: any) => `  ${c.code} — ${c.name} (${c.comp_type})`).join("\n");

    const analysis = await chat<{
      title: string; summary: string; key_topics: string[]; language: string;
      difficulty: string; competencies: { code: string; relevance: number }[];
    }>({
      task: "analyse_material",
      userId,
      schema: materialAnalysisSchema,
      temperature: 0.3,
      maxTokens: 3000,
      messages: [
        {
          role: "system",
          content:
            "You catalogue training material for India's Official Statistical System (MoSPI / NSSTA). " +
            "Summarise accurately and tag against the FRAC competency framework. Only use codes from the supplied list.\n\n" +
            "FRAC competencies:\n" + compList,
        },
        {
          role: "user",
          content: `Analyse this material (title as uploaded: "${material.title}").\n\n` +
            text.slice(0, 120_000),
        },
      ],
    });

    const a = analysis.parsed;
    if (a) {
      await supabase.from("materials").update({
        summary: a.summary ?? null,
        key_topics: Array.isArray(a.key_topics) ? a.key_topics.slice(0, 12) : [],
        detected_language: a.language ?? null,
      }).eq("id", material_id);

      const byCode = new Map((comps ?? []).map((c: any) => [c.code, c.id]));
      const links = (a.competencies ?? [])
        .filter((c) => byCode.has(c.code))
        .map((c) => ({
          material_id,
          competency_id: byCode.get(c.code) as string,
          relevance: Math.max(0, Math.min(1, Number(c.relevance) || 0.5)),
        }));
      if (links.length) {
        await supabase.from("material_competencies")
          .upsert(links, { onConflict: "material_id,competency_id" });
      }
    }

    await supabase.from("materials").update({ status: "ready", error_message: null }).eq("id", material_id);

    await logGeneration(admin, {
      userId, task: "process_material", model: analysis.model,
      promptTokens: analysis.promptTokens, completionTokens: analysis.completionTokens,
      costUsd: (analysis.costUsd ?? 0) + ocrCost, latencyMs: analysis.latencyMs, success: true,
      meta: { material_id, chunks: chunks.length, embedded, used_ocr: usedOcr, word_count: wordCount },
    });

    return jsonResponse({
      material_id,
      status: "ready",
      word_count: wordCount,
      page_count: pageCount,
      chunks: chunks.length,
      chunks_embedded: embedded,
      pages_indexed: pages.length,
      unit: isPptx(mime, material.storage_path) ? "slide" : "page",
      used_ocr: usedOcr,
      summary: a?.summary ?? null,
      key_topics: a?.key_topics ?? [],
      competencies: a?.competencies ?? [],
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[process-material] unhandled", err);
    if (materialId) {
      await admin.from("materials").update({
        status: "failed",
        error_message: (err as Error)?.message?.slice(0, 500) ?? "Processing failed",
      }).eq("id", materialId);
    }
    return errorResponse("Material processing failed", 500, (err as Error)?.message);
  }
});
