/**
 * generate-daily.mjs
 *
 * Standalone script — no browser, no React, no OBS.
 * Run by GitHub Actions every day on a schedule.
 *
 * Required environment variables (set as GitHub Actions Secrets):
 *   GEMINI_API_KEY   — your Google Gemini API key (primary)
 *   OPENAI_API_KEY   — your OpenAI API key (fallback)
 *   DISCORD_WEBHOOK  — your Discord webhook URL
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "word-history.json");

// ─── Load word history ────────────────────────────────────────────────────────

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ─── Shared prompt ────────────────────────────────────────────────────────────

function buildPrompt(previousWords) {
  const exclusionList = previousWords.join(", ");
  return `Generate a "Word of the Day" suitable for a Twitch stream audience.

IMPORTANT CONSTRAINTS:
- DO NOT generate any of the following words: [${exclusionList}]

Criteria:
1. The word should be real, valid English.
2. It can be slightly obscure or interesting (e.g. 'petrichor', 'drossy', 'sonder').
3. Include a "sound-it-out" pronunciation guide (e.g. for 'Colonel', use 'KER-nul'). Do NOT use IPA symbols. Capitalize the stressed syllable.
4. The definition must be concise (under 15 words) and plain text (no HTML).
5. Provide a short, fun example sentence.

Respond ONLY with a JSON object with these fields:
{
  "word": "string — the word itself, capitalized",
  "phonetic": "string — sound-it-out pronunciation",
  "partOfSpeech": "string — noun, verb, adjective, etc.",
  "definition": "string — concise definition, max 15 words",
  "example": "string — short example sentence"
}`;
}

function validateAndFinalize(parsed, previousWords) {
  if (previousWords.map(w => w.toLowerCase()).includes(parsed.word.toLowerCase())) {
    throw new Error(`Duplicate word generated: "${parsed.word}".`);
  }
  return { ...parsed, generatedDate: new Date().toDateString() };
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function generateWithGemini(previousWords) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  console.log("[Gemini] Requesting word...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(previousWords) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) throw new Error("Empty response from Gemini.");

  const parsed = JSON.parse(jsonText);
  console.log(`[Gemini] Generated word: "${parsed.word}"`);
  return validateAndFinalize(parsed, previousWords);
}

// ─── OpenAI fallback ──────────────────────────────────────────────────────────

async function generateWithOpenAI(previousWords) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  console.log("[OpenAI] Requesting word...");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildPrompt(previousWords) }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const jsonText = data?.choices?.[0]?.message?.content;
  if (!jsonText) throw new Error("Empty response from OpenAI.");

  const parsed = JSON.parse(jsonText);
  console.log(`[OpenAI] Generated word: "${parsed.word}"`);
  return validateAndFinalize(parsed, previousWords);
}

// ─── Generate with fallback ───────────────────────────────────────────────────

async function generateWord(previousWords = []) {
  try {
    return await generateWithGemini(previousWords);
  } catch (error) {
    const shouldFallback =
      error.message.includes("429") ||
      error.message.includes("404") ||
      error.message.includes("quota") ||
      error.message.includes("RESOURCE_EXHAUSTED") ||
      error.message.includes("NOT_FOUND");

    if (shouldFallback) {
      console.warn("[Gemini] Failed, falling back to OpenAI...");
      return await generateWithOpenAI(previousWords);
    }

    throw error;
  }
}

// ─── Discord ──────────────────────────────────────────────────────────────────

async function postToDiscord(wordData) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK environment variable.");

  const payload = {
    embeds: [
      {
        description: `## ${wordData.word}\n**${wordData.phonetic}** *(${wordData.partOfSpeech})*`,
        color: 0x9146ff,
        fields: [
          {
            name: "Definition",
            value: `> ${wordData.definition}`,
            inline: false,
          },
          {
            name: "Example",
            value: `*"${wordData.example}"*`,
            inline: false,
          },
        ],
      },
    ],
  };

  console.log("[Discord] Posting word to webhook...");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook error ${response.status}: ${text}`);
  }

  console.log("[Discord] Posted successfully!");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Word of the Day Generator ===");
  console.log(`Date: ${new Date().toDateString()}\n`);

  const history = loadHistory();
  const previousWords = history.map(entry => entry.word);
  console.log(`[History] ${previousWords.length} previous words loaded.`);

  const wordData = await generateWord(previousWords);

  await postToDiscord(wordData);

  history.push(wordData);
  if (history.length > 365) history.splice(0, history.length - 365);
  saveHistory(history);

  console.log("\n✅ Done!");
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
