/**
 * PPTX and DOCX text extraction.
 *
 * SIH26101 names PPT and training documents as upload types, and in practice
 * a large share of government training material is slide decks, not PDFs.
 *
 * Both formats are ZIP archives of XML, so no heavyweight parser is needed —
 * we unzip and pull the text runs directly. That keeps the Edge Function cold
 * start small, which matters when a learner is waiting on an upload.
 *
 *   PPTX  ppt/slides/slide{N}.xml   → <a:t> runs  (plus speaker notes)
 *   DOCX  word/document.xml         → <w:t> runs, split on <w:p> paragraphs
 *
 * Slide numbers are preserved and returned as "pages", so a generated question
 * can cite "slide 12" the same way it cites "page 17".
 */
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");   // last, so other entities decode correctly
}

/** Pull the text of every <tag> run in document order. */
function textRuns(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = decodeXmlEntities(m[1].replace(/<[^>]+>/g, ""));
    if (t) out.push(t);
  }
  return out;
}

export interface OfficeDoc {
  /** One entry per slide (PPTX) or per logical page break (DOCX). */
  pages: string[];
  text: string;
  slideCount?: number;
}

/**
 * PowerPoint. Slides are returned in numeric order — the archive does not
 * guarantee ordering, and slide10 sorting before slide2 would scramble every
 * citation we later emit.
 */
export function extractPptx(bytes: Uint8Array): OfficeDoc {
  const zip = unzipSync(bytes);

  const slideFiles = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });

  const pages: string[] = [];

  for (const file of slideFiles) {
    const n = Number(file.match(/slide(\d+)\.xml$/)![1]);
    const xml = strFromU8(zip[file]);

    // <a:p> is a paragraph; joining runs inside it keeps bullets on one line
    // instead of exploding each styled fragment onto its own.
    const paras = xml.split(/<a:p[\s>]/).slice(1)
      .map((chunk) => textRuns(chunk, "a:t").join("").trim())
      .filter(Boolean);

    // Speaker notes often carry the actual explanation the slide only gestures
    // at, so they are worth indexing.
    const notesFile = `ppt/notesSlides/notesSlide${n}.xml`;
    let notes = "";
    if (zip[notesFile]) {
      const nxml = strFromU8(zip[notesFile]);
      notes = textRuns(nxml, "a:t").join(" ").trim();
      // The notes placeholder repeats the slide number; drop that noise.
      if (/^\d+$/.test(notes)) notes = "";
    }

    const body = paras.join("\n\n");
    pages.push(
      [body, notes ? `[Speaker notes] ${notes}` : ""].filter(Boolean).join("\n\n"),
    );
  }

  return {
    pages,
    text: pages.join("\n\n"),
    slideCount: slideFiles.length,
  };
}

/**
 * Word. Explicit page breaks are the only reliable page signal in OOXML
 * (rendered pagination depends on the renderer), so we split on those and
 * fall back to one page when a document has none.
 */
export function extractDocx(bytes: Uint8Array): OfficeDoc {
  const zip = unzipSync(bytes);
  const doc = zip["word/document.xml"];
  if (!doc) return { pages: [], text: "" };

  const xml = strFromU8(doc);

  const paragraphs = xml.split(/<w:p[\s>]/).slice(1).map((chunk) => ({
    text: textRuns(chunk, "w:t").join("").trim(),
    pageBreak: /w:type="page"|<w:br[^>]*w:type="page"/.test(chunk),
  }));

  const pages: string[] = [];
  let buf: string[] = [];
  for (const p of paragraphs) {
    if (p.pageBreak && buf.length) { pages.push(buf.join("\n\n")); buf = []; }
    if (p.text) buf.push(p.text);
  }
  if (buf.length) pages.push(buf.join("\n\n"));

  return { pages: pages.length ? pages : [""], text: pages.join("\n\n") };
}

const PPTX_MIMES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];
const DOCX_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export function isPptx(mime: string, path: string): boolean {
  return PPTX_MIMES.includes(mime) || /\.pptx?$/i.test(path);
}
export function isDocx(mime: string, path: string): boolean {
  return DOCX_MIMES.includes(mime) || /\.docx?$/i.test(path);
}
