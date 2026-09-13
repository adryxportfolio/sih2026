/**
 * Practice from study material — quizzes, flashcards and timed mock tests that
 * Samiksha AI writes from what the administrator assigned.
 *
 * Generation runs in the `study` Edge Function. The one thing the phone does
 * itself is look up a YouTube video's description: YouTube refuses requests
 * from cloud data centres, but answers a phone, so the device fetches it and
 * sends it along as the source text.
 */
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { listDemoMaterials, type MaterialKind } from "./materials";
import { recordProgress } from "./api";

export type PracticeMode = "quiz" | "flashcards" | "mock";
export type Grounding = "document" | "video_description" | "web_page" | "title_only";

export interface PracticeQuestion {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
  source_hint: string;
}

export interface PracticeCard {
  front: string;
  back: string;
}

export interface Practice {
  mode: PracticeMode;
  title: string;
  material_title: string;
  grounding: Grounding;
  items: (PracticeQuestion | PracticeCard)[];
  time_limit_seconds: number | null;
}

export interface PracticeMaterial {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  youtube_id: string | null;
  external_url: string | null;
}

export const MODE_LABEL: Record<PracticeMode, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  mock: "Mock test",
};

export const GROUNDING_LABEL: Record<Grounding, string> = {
  document: "FROM THE DOCUMENT",
  video_description: "FROM THE VIDEO'S DESCRIPTION",
  web_page: "FROM THE WEB PAGE",
  title_only: "ON THE TOPIC",
};

export async function loadPracticeMaterial(isDemo: boolean, id: string): Promise<PracticeMaterial> {
  if (isDemo) {
    const m = (await listDemoMaterials()).find((x) => x.id === id);
    if (!m) throw new Error("This material is no longer in the demo library.");
    return { id: m.id, title: m.title, description: m.description, kind: m.kind,
             youtube_id: m.youtube_id, external_url: m.external_url };
  }
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, description, kind, youtube_id, external_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("That material is not available to you.");
  return data as PracticeMaterial;
}

/**
 * What YouTube will tell this device about a video. Native builds get the full
 * description; a browser only gets title and channel, because the richer
 * endpoint does not allow cross-origin requests.
 */
async function youtubeDetails(id: string): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: id,
          context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } },
        }),
      });
      const v = (await res.json())?.videoDetails;
      if (v?.title) {
        return [`Video title: ${v.title}`, v.author ? `Channel: ${v.author}` : "",
          v.shortDescription ? `Video description:\n${v.shortDescription}` : ""]
          .filter(Boolean).join("\n\n");
      }
    }
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    const o = await res.json();
    return o?.title ? `Video title: ${o.title}${o.author_name ? `\n\nChannel: ${o.author_name}` : ""}` : null;
  } catch {
    return null;
  }
}

export async function generatePractice(
  isDemo: boolean,
  material: PracticeMaterial,
  mode: PracticeMode,
): Promise<Practice> {
  const sourceText = material.kind === "youtube" && material.youtube_id
    ? await youtubeDetails(material.youtube_id)
    : null;

  const { data, error } = await supabase.functions.invoke("study", {
    body: {
      mode,
      material_id: isDemo ? undefined : material.id,
      material: isDemo ? material : undefined,
      source_text: sourceText ?? undefined,
    },
  });
  if (error) {
    let message = "Could not prepare practice. Check your connection and try again.";
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as Practice;
}

/** Best effort: practice counts toward the streak and the admin's study minutes. */
export function recordPractice(isDemo: boolean, p: {
  questions?: number; correct?: number; cards?: number; cardsKnown?: number; seconds: number;
}) {
  if (isDemo) return;
  recordProgress({
    minutes: Math.max(1, Math.round(p.seconds / 60)),
    questions: p.questions ?? 0,
    questionsOk: p.correct ?? 0,
    cards: p.cards ?? 0,
    cardsOk: p.cardsKnown ?? 0,
    xp: (p.correct ?? 0) * 10 + (p.cardsKnown ?? 0) * 5,
  }).catch(() => {});
}
