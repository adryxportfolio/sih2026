/**
 * POST /functions/v1/curate-videos
 *
 * Finds genuinely good tutoring videos for a topic and stores them for
 * in-app playback.
 *
 * COMPLIANCE: we call the official YouTube Data API v3 for metadata and play
 * through the official IFrame player embedded in the app. We never download,
 * proxy or re-host video streams — that would breach YouTube's Terms of
 * Service. Only video IDs and metadata are stored.
 *
 * The AI layer is the point. YouTube relevance ranking optimises for watch
 * time, not for whether a video correctly teaches stratified sampling. We
 * fetch a wide candidate set and have the reasoning model assess pedagogical
 * quality and topical fit before anything reaches a learner.
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";
import { chat, logGeneration } from "../_shared/openrouter.ts";
import { videoCurationSchema } from "../_shared/schemas.ts";

interface YtCandidate {
  youtube_id: string;
  title: string;
  channel: string;
  channelId: string;
  description: string;
  thumbnail: string | null;
  publishedAt: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
}

/** ISO-8601 duration (PT1H2M30S) → seconds */
function parseDuration(iso: string): number {
  const m = iso?.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

async function youtubeSearch(query: string, apiKey: string, max = 18): Promise<YtCandidate[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", String(max));
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("videoEmbeddable", "true");   // must be playable in-app
  searchUrl.searchParams.set("safeSearch", "strict");
  searchUrl.searchParams.set("videoDuration", "medium");   // 4–20 min: tutorial-shaped
  searchUrl.searchParams.set("key", apiKey);

  const sRes = await fetch(searchUrl);
  if (!sRes.ok) throw new Error(`YouTube search ${sRes.status}: ${await sRes.text()}`);
  const sJson = await sRes.json();
  const ids: string[] = (sJson.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  // Second call gets duration + statistics, which search doesn't return
  const detUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  detUrl.searchParams.set("id", ids.join(","));
  detUrl.searchParams.set("key", apiKey);

  const dRes = await fetch(detUrl);
  if (!dRes.ok) throw new Error(`YouTube details ${dRes.status}`);
  const dJson = await dRes.json();

  return (dJson.items ?? []).map((v: any): YtCandidate => ({
    youtube_id: v.id,
    title: v.snippet?.title ?? "",
    channel: v.snippet?.channelTitle ?? "",
    channelId: v.snippet?.channelId ?? "",
    description: (v.snippet?.description ?? "").slice(0, 600),
    thumbnail: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
    publishedAt: v.snippet?.publishedAt ?? null,
    durationSeconds: parseDuration(v.contentDetails?.duration ?? ""),
    viewCount: Number(v.statistics?.viewCount ?? 0),
    likeCount: Number(v.statistics?.likeCount ?? 0),
  }));
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const admin = adminClient();
  let userId: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    const supabase = userClient(req);

    const { query, competency_code, limit = 6 } = await req.json().catch(() => ({}));

    let searchQuery = String(query ?? "").trim();
    let competencyId: string | null = null;
    let competencyName = "";

    if (competency_code) {
      const { data: c } = await admin
        .from("competencies").select("id, name, description").eq("code", competency_code).single();
      if (c) {
        competencyId = c.id;
        competencyName = c.name;
        if (!searchQuery) searchQuery = `${c.name} tutorial explained statistics`;
      }
    }
    if (!searchQuery) return errorResponse("Provide `query` or `competency_code`.", 400);

    // ── Cache: skip the API entirely if we already vetted this query ────────
    const { data: cached } = await admin
      .from("videos")
      .select("*")
      .eq("search_query", searchQuery)
      .eq("is_vetted", true)
      .order("quality_score", { ascending: false })
      .limit(limit);

    if (cached && cached.length >= Math.min(3, limit)) {
      return jsonResponse({ videos: cached, cached: true, query: searchQuery });
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return errorResponse(
        "YOUTUBE_API_KEY is not configured on the server. Add it with `supabase secrets set YOUTUBE_API_KEY=...`",
        503,
        { configured: false },
      );
    }

    // ── 1. Candidates ───────────────────────────────────────────────────────
    const candidates = await youtubeSearch(searchQuery, apiKey, 18);
    if (!candidates.length) {
      return jsonResponse({ videos: [], cached: false, query: searchQuery, note: "No embeddable results." });
    }

    // ── 2. AI quality gate ──────────────────────────────────────────────────
    const brief = candidates.map((c, i) =>
      `${i + 1}. id:${c.youtube_id}
   title: ${c.title}
   channel: ${c.channel}
   duration: ${Math.round(c.durationSeconds / 60)} min · views: ${c.viewCount.toLocaleString()} · likes: ${c.likeCount.toLocaleString()}
   description: ${c.description.replace(/\n/g, " ").slice(0, 300)}`,
    ).join("\n\n");

    const result = await chat<{ selections: any[] }>({
      tier: "reasoning",
      task: "curate_videos",
      userId,
      schema: videoCurationSchema,
      temperature: 0.3,
      maxTokens: 5000,
      messages: [
        {
          role: "system",
          content: `You vet YouTube videos as tutoring material for officers in India's Official Statistical System.

Judge each candidate on:
· TOPICAL FIT — does it actually teach the requested concept, or merely mention it?
· PEDAGOGICAL QUALITY — worked examples, clear build-up, correct terminology. A lecture recording that derives the idea beats a listicle that names it.
· CORRECTNESS RISK — statistics attracts confident misinformation. Penalise anything that looks like exam-cramming shortcuts over understanding, or channels that oversimplify to the point of being wrong.
· APPROPRIATE LEVEL — these are working professionals, not school students. Penalise material pitched at children.
· SIGNAL, NOT POPULARITY — high views on a bad explainer is still a bad explainer. Do not simply rank by view count.

Set recommended=false for anything you would not put in front of a government officer. Being selective is correct — returning three excellent videos beats ten mediocre ones. Score honestly; do not give everything 0.8.`,
        },
        {
          role: "user",
          content: `Topic being taught: "${searchQuery}"${competencyName ? `\nFRAC competency: ${competencyName}` : ""}\n\nCandidates:\n\n${brief}\n\nAssess every candidate.`,
        },
      ],
    });

    const selections = result.parsed?.selections ?? [];
    const byId = new Map(candidates.map((c) => [c.youtube_id, c]));

    const vetted = selections
      .filter((s) => s.recommended && byId.has(s.youtube_id))
      .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
      .slice(0, limit);

    if (!vetted.length) {
      return jsonResponse({
        videos: [], cached: false, query: searchQuery,
        note: "Candidates were found but none met the quality bar for this topic.",
      });
    }

    // ── 3. Persist ──────────────────────────────────────────────────────────
    const rows = vetted.map((s) => {
      const c = byId.get(s.youtube_id)!;
      return {
        youtube_id: c.youtube_id,
        title: c.title,
        channel_title: c.channel,
        channel_id: c.channelId,
        description: c.description,
        thumbnail_url: c.thumbnail,
        duration_seconds: c.durationSeconds,
        published_at: c.publishedAt,
        view_count: c.viewCount,
        quality_score: Math.max(0, Math.min(1, Number(s.quality_score) || 0.5)),
        quality_rationale: s.rationale ?? null,
        is_vetted: true,
        search_query: searchQuery,
      };
    });

    const { data: saved, error: vErr } = await admin
      .from("videos").upsert(rows, { onConflict: "youtube_id" }).select("*");
    if (vErr) console.error("[curate-videos] upsert failed", vErr.message);

    if (competencyId && saved?.length) {
      await admin.from("video_competencies").upsert(
        saved.map((v: any) => {
          const sel = vetted.find((s) => s.youtube_id === v.youtube_id);
          return {
            video_id: v.id,
            competency_id: competencyId as string,
            relevance: Math.max(0, Math.min(1, Number(sel?.relevance) || 0.7)),
          };
        }),
        { onConflict: "video_id,competency_id" },
      );
    }

    await logGeneration(admin, {
      userId, task: "curate_videos", model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, success: true,
      meta: { query: searchQuery, candidates: candidates.length, vetted: vetted.length },
    });

    return jsonResponse({
      videos: saved ?? rows,
      cached: false,
      query: searchQuery,
      curation: {
        candidates_screened: candidates.length,
        passed_quality_gate: vetted.length,
        model: result.model,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[curate-videos] unhandled", err);
    return errorResponse("Video curation failed", 500, (err as Error)?.message);
  }
});
