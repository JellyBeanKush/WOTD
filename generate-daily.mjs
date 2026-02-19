/**
 * generate-daily.mjs
 * Stream-ready Word of the Day Generator (Gemini 3 Fixed)
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
  return `Generate a "Word of the Day" for a Twitch stream audience. 
  
  EXCLUDE THESE PREVIOUS WORDS: [${exclusionList}]

  Rules:
  1. Pick a cool, slightly obscure English word.
  2. Include a sound-it-out pronunciation (e.g. KER-nul). 
  3. Definition: Under 15 words.
  4. Example sentence: Fun and conversational.

  Response MUST be raw JSON with these exact fields:
  {
    "word": "WORD",
    "phonetic": "PRONUNCIATION",
    "partOfSpeech": "noun/verb/adj",
    "definition": "simple definition",
    "example": "fun sentence"
  }`;
}

// ─── Gemini (Primary) ────────────────────────────────────────────────────────

async function generateWithGemini(previousWords) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY secret.");

  console.log("[Gemini] Requesting word using gemini-3-flash-preview...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(previousWords) }] }],
        generationConfig: {
          // FIXED: Changed response_mime_type to responseMimeType
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API Error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) throw new Error("Empty response from Gemini.");

  const parsed = JSON.parse(jsonText);
  return { ...parsed, generatedDate: new Date().toDateString() };
}

// ─── Discord ──────────────────────────────────────────────────────────────────

async function postToDiscord(wordData) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK secret.");

  const payload = {
    embeds: [{
      title: `✨ Word of the Day: ${wordData.word}`,
      description: `**${wordData.phonetic}** — *${wordData.partOfSpeech}*`,
      color: 0x9146ff, // Twitch Purple
      fields: [
        { name: "What it means", value: `> ${wordData.definition}` },
        { name: "In a sentence", value: `*"${wordData.example}"*` }
      ],
      footer: { text: `HoneyBearSquish Community • ${wordData.generatedDate}` }
    }]
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`Discord error: ${response.status}`);
  console.log("[Discord] Posted successfully!");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Word of the Day Generator ===");
  const history = loadHistory();
  const previousWords = history.map(entry => entry.word);

  try {
    const wordData = await generateWithGemini(previousWords);
    await postToDiscord(wordData);
    
    history.push(wordData);
    if (history.length > 365) history.splice(0, history.length - 365);
    saveHistory(history);
    console.log(`✅ Success! Today's word: ${wordData.word}`);
  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
  }
}

main();
