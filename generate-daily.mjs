import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "word-history.json");
const TEXT_FILE = path.join(__dirname, "current-word.txt");

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

function buildPrompt(previousWords) {
  const exclusionList = previousWords.join(", ");
  return `Generate a "Word of the Day" for a Twitch stream. 
  EXCLUDE: [${exclusionList}]
  Rules: Obscure word, sound-it-out pronunciation, definition under 15 words, fun example.
  Response MUST be raw JSON:
  {
    "word": "WORD",
    "phonetic": "PRONUNCIATION",
    "partOfSpeech": "noun/verb/adj",
    "definition": "definition",
    "example": "fun sentence"
  }`;
}

async function generateWithGemini(previousWords) {
  const apiKey = process.env.GEMINI_API_KEY;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(previousWords) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini Error: ${await response.text()}`);
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function postToDiscord(wordData) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  const payload = {
    embeds: [{
      title: `${wordData.word}`,
      // Discord formatting with vertical bar separators
      description: `**${wordData.phonetic}** | *(${wordData.partOfSpeech})* | ${wordData.definition}\n\n*"${wordData.example}"*`,
      color: 0x9146ff
    }]
  };
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const history = loadHistory();
  try {
    const wordData = await generateWithGemini(history.map(w => w.word));
    
    // 1. Post to Discord
    await postToDiscord(wordData);
    
    // 2. Save to JSON history
    history.push(wordData);
    if (history.length > 365) history.shift();
    saveHistory(history);

    // 3. Create Plain Text file for Mix It Up with vertical bar separators
    const plainText = `${wordData.word} | ${wordData.phonetic} | (${wordData.partOfSpeech}) | ${wordData.definition} | ${wordData.example}`;
    fs.writeFileSync(TEXT_FILE, plainText);
    
    console.log(`✅ Successfully updated Word of the Day: ${wordData.word}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
