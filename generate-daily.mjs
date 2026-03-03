import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Updated Priority: 2.5 Flash is now the primary model
const modelPriority = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
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
        // Detailed logging to find out WHY it's failing in GitHub Actions
        console.warn(`⚠️ ${modelName} (${version}) failed: ${error.message}`);
        
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);
        if (status === 429) {
          console.error("🛑 Rate limited on this model. Moving to next...");
          break; 
        }
        if (error.message.includes("403")) {
          console.error("🚫 Permission Denied. Check if your API Key is valid or if the model is restricted.");
        }
      }
    }
  }
  throw new Error("TOTAL FAILURE: All models exhausted. Check logs for specific error messages.");
}

async function main() {
  let history = [];
  if (fs.existsSync("word-history.json")) {
      try {
        history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
      } catch (e) { history = []; }
  }
  
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

    history = history.filter(item => item && item.word);
    history.unshift(newEntry);
    
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));
    fs.writeFileSync("current-word.txt", JSON.stringify(newEntry, null, 2));

    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
      console.log("🚀 Posted successfully!");
    }
  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
