import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelPriority = [
  "gemini-1.5-flash", 
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro"
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
    for (const version of ["v1beta", "v1"]) {
      try {
        console.log(`Checking ${modelName} on ${version}...`);
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: { response_mime_type: "application/json" } 
        }, { apiVersion: version });
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        return JSON.parse(responseText);
      } catch (error) {
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);
        if (status === 429) break; 
        if (status === 404) continue;
      }
    }
  }
  throw new Error("TOTAL FAILURE: All models exhausted or API key invalid.");
}

async function main() {
  let history = [];
  if (fs.existsSync("word-history.json")) {
      try {
        history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
      } catch (e) { 
        history = []; 
      }
  }
  
  // Clean up history to ensure we only have valid words for the exclusion list
  const usedWords = history.map(item => item.word).filter(Boolean).join(", ");

  const prompt = `Generate a 'Word of the Day' as a JSON object with these keys: 
  word, pronunciation, partOfSpeech, definition, example, sourceUrl. 
  
  CRITICAL CONSTRAINTS:
  1. DO NOT USE ANY OF THESE WORDS: ${usedWords}
  2. For 'pronunciation', use simple capitalized phonetic spelling like KOH-moh-REH-bee. Do NOT use any brackets [].
  3. EXAMPLE SENTENCE: Feature the bearded streamer and his fiancé (gay couple/streamers). Contextual/natural.`;

  try {
    const data = await generateWithFallback(prompt);
    const today = new Date();
    
    // FORMAT: March 2, 2026
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateString = today.toLocaleDateString('en-US', dateOptions);
    
    const newEntry = {
      word: data.word,
      phonetic: data.pronunciation ? data.pronunciation.replace(/[\[\]]/g, '') : "N/A", 
      partOfSpeech: data.partOfSpeech,
      definition: data.definition,
      example: data.example,
      sourceUrl: data.sourceUrl,
      generatedDate: dateString
    };

    // --- FORMAT DISCORD EMBED ---
    const discordPayload = {
      embeds: [{
        title: `Word of the Day - ${dateString}`,
        description: `# ${newEntry.word.toUpperCase()}\n${newEntry.phonetic} / *${newEntry.partOfSpeech}*`,
        color: 7419530, 
        fields: [
          { name: "Definition", value: `> ${newEntry.definition}` },
          { name: "Example", value: `*${newEntry.example}*` },
          { name: " ", value: `[Learn More](${newEntry.sourceUrl})` }
        ]
      }]
    };

    // --- SAVE HISTORY & CURRENT WORD ---
    // Remove any malformed entries and add the new one to the top
    history = history.filter(item => item && item.word);
    history.unshift(newEntry);
    
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));
    fs.writeFileSync("current-word.txt", JSON.stringify(newEntry, null, 2));

    // --- POST TO DISCORD ---
    if (process.env.DISCORD_WEBHOOK_URL) {
      const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
      
      if (!response.ok) {
        throw new Error(`Discord Webhook failed: ${response.statusText}`);
      }
      
      console.log("🚀 Posted with italicized slash-style formatting!");
    } else {
      console.warn("⚠️ No Discord Webhook URL found in environment variables.");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
