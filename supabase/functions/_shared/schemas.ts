/**
 * JSON Schemas for OpenRouter strict structured output.
 *
 * All three of our models support `strict: true`, which means the provider
 * constrains decoding to the grammar — the response is valid JSON of exactly
 * this shape or the request fails. That removes an entire class of parsing
 * bugs that plague prompt-and-pray MCQ generators.
 *
 * Strict mode requires: every property listed in `required`, and
 * `additionalProperties: false` on every object.
 */

const BLOOM = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;
const LEVELS = ["unskilled", "beginner", "practitioner", "proficient", "expert"] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  MCQ / QUIZ GENERATION
// ─────────────────────────────────────────────────────────────────────────────
export const quizSchema = {
  name: "generated_quiz",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "questions"],
    properties: {
      title: { type: "string", description: "Concise quiz title drawn from the material" },
      summary: { type: "string", description: "2-3 sentence description of what this quiz assesses" },
      questions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "stem", "kind", "options", "correct_option_ids", "explanation",
            "bloom", "difficulty", "competency_code", "source_quote", "distractor_rationales",
          ],
          properties: {
            stem: {
              type: "string",
              description: "The question. Self-contained; never refers to 'the passage' or 'the document'.",
            },
            kind: {
              type: "string",
              enum: ["mcq_single", "mcq_multi", "true_false", "assertion_reason"],
            },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "text"],
                properties: {
                  id: { type: "string", description: "Short id: a, b, c, d" },
                  text: { type: "string" },
                },
              },
            },
            correct_option_ids: {
              type: "array",
              minItems: 1,
              items: { type: "string" },
            },
            explanation: {
              type: "string",
              description: "Why the correct answer is right. Teach, don't just assert.",
            },
            bloom: { type: "string", enum: BLOOM as unknown as string[] },
            difficulty: {
              type: "number",
              description: "0=trivial recall .. 4=expert synthesis. Aim for a spread.",
            },
            competency_code: {
              type: "string",
              description: "FRAC competency code from the supplied list, or empty string if none fits.",
            },
            source_quote: {
              type: "string",
              description: "VERBATIM span from the material that justifies the answer. Empty string if not grounded in the text.",
            },
            distractor_rationales: {
              type: "array",
              description: "For each WRONG option, the specific misconception it represents.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["option_id", "why_wrong"],
                properties: {
                  option_id: { type: "string" },
                  why_wrong: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  MATERIAL ANALYSIS (summary, topics, competency tagging)
// ─────────────────────────────────────────────────────────────────────────────
export const materialAnalysisSchema = {
  name: "material_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "key_topics", "language", "competencies", "difficulty"],
    properties: {
      title: { type: "string", description: "A clean title for this material" },
      summary: { type: "string", description: "150-250 word summary of what it covers" },
      key_topics: { type: "array", items: { type: "string" }, maxItems: 12 },
      language: { type: "string", description: "ISO 639-1 code of the dominant language" },
      difficulty: { type: "string", enum: LEVELS as unknown as string[] },
      competencies: {
        type: "array",
        description: "FRAC competencies this material develops, from the supplied list only.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "relevance"],
          properties: {
            code: { type: "string" },
            relevance: { type: "number", description: "0..1" },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  COMPETENCY DIAGNOSIS
// ─────────────────────────────────────────────────────────────────────────────
export const diagnosisSchema = {
  name: "competency_diagnosis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["overall_summary", "strengths", "priority_gaps", "recommended_focus_weeks"],
    properties: {
      overall_summary: {
        type: "string",
        description: "Plain-language read of where this officer stands against their role. Address them as 'you'.",
      },
      strengths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["competency_code", "note"],
          properties: {
            competency_code: { type: "string" },
            note: { type: "string" },
          },
        },
      },
      priority_gaps: {
        type: "array",
        description: "Ordered most-urgent first.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["competency_code", "rationale", "impact_on_role", "suggested_first_step"],
          properties: {
            competency_code: { type: "string" },
            rationale: { type: "string", description: "Why we believe this gap exists, citing the evidence." },
            impact_on_role: { type: "string", description: "What goes wrong at work if this stays unaddressed." },
            suggested_first_step: { type: "string", description: "One concrete action to take this week." },
          },
        },
      },
      recommended_focus_weeks: { type: "number" },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  PERSONALISED LEARNING PATH
// ─────────────────────────────────────────────────────────────────────────────
export const learningPathSchema = {
  name: "learning_path",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "rationale", "estimated_minutes", "items"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      rationale: {
        type: "string",
        description: "Why this sequence, in this order. Reference the learner's specific gaps and the spacing/interleaving logic.",
      },
      estimated_minutes: { type: "number" },
      items: {
        type: "array",
        minItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "title", "description", "why_this", "competency_code", "estimated_minutes", "course_external_id", "search_query"],
          properties: {
            kind: {
              type: "string",
              enum: ["course", "video", "quiz", "material", "flashcard_deck", "practice", "reflection"],
            },
            title: { type: "string" },
            description: { type: "string" },
            why_this: { type: "string", description: "One sentence: why this step, now." },
            competency_code: { type: "string" },
            estimated_minutes: { type: "number" },
            course_external_id: {
              type: "string",
              description: "iGOT course id if kind=course and one was supplied, else empty string.",
            },
            search_query: {
              type: "string",
              description: "If kind=video, the YouTube query to find tutoring content. Else empty string.",
            },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  VIDEO CURATION — AI quality gate over YouTube search results
// ─────────────────────────────────────────────────────────────────────────────
export const videoCurationSchema = {
  name: "video_curation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["selections"],
    properties: {
      selections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["youtube_id", "quality_score", "rationale", "relevance", "recommended"],
          properties: {
            youtube_id: { type: "string" },
            quality_score: { type: "number", description: "0..1 pedagogical quality for this specific topic" },
            rationale: { type: "string", description: "One sentence on why this teaches the topic well or badly." },
            relevance: { type: "number", description: "0..1 topical match" },
            recommended: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  FLASHCARD GENERATION
// ─────────────────────────────────────────────────────────────────────────────
export const flashcardSchema = {
  name: "generated_flashcards",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["front", "back", "elaboration", "hint", "bloom", "competency_code", "source_quote"],
          properties: {
            front: {
              type: "string",
              description: "A question that forces active recall. Never a bare term — 'What is X?' is weak; ask what X does, or when it applies.",
            },
            back: { type: "string", description: "The answer. One idea only — atomic cards are recalled far better." },
            elaboration: {
              type: "string",
              description: "The 'why' behind the answer. Elaborative interrogation strengthens encoding.",
            },
            hint: { type: "string", description: "A cue for a stuck learner. Empty string if none." },
            bloom: { type: "string", enum: BLOOM as unknown as string[] },
            competency_code: { type: "string" },
            source_quote: { type: "string" },
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  TUTOR REPLY (grounded, with citations)
// ─────────────────────────────────────────────────────────────────────────────
export const tutorSchema = {
  name: "tutor_reply",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "citations", "follow_up_questions", "confidence"],
    properties: {
      answer: { type: "string", description: "The explanation, in markdown." },
      citations: {
        type: "array",
        description: "Chunk indices actually used. Empty if answering from general knowledge.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chunk_index", "quote"],
          properties: {
            chunk_index: { type: "number" },
            quote: { type: "string" },
          },
        },
      },
      follow_up_questions: {
        type: "array",
        maxItems: 3,
        items: { type: "string" },
        description: "Socratic follow-ups that push the learner to retrieve, not just read.",
      },
      confidence: {
        type: "string",
        enum: ["grounded", "partly_grounded", "general_knowledge"],
        description: "grounded = fully supported by the supplied material.",
      },
    },
  },
} as const;
