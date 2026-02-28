import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelPriority = [
  "gemini-3.1-flash-preview", 
  "gemini-3-flash-preview",   
  "gemini-2.5-flash",         
  "gemini-2.0-flash-lite",    
  "gemini-1.5-flash" 
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
        return JSON.parse(result.response.text());
      } catch (error) {
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);
        if (status === 429) break; 
        if (status === 404) continue;
      }
    }
  }
  throw new Error("TOTAL FAILURE");
}

async function main() {
  // --- 1. GET HISTORY TO PREVENT REPEATS ---
  let history = [];
  if (fs.existsSync("word-history.json")) {
      try {
        history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
      } catch (e) { history = []; }
  }
  const usedWords = history.map(item => item.word).join(", ");

  const prompt = `Generate a 'Word of the Day' as a JSON object with these keys: 
  word, pronunciation, partOfSpeech, definition, example, sourceUrl. 
  
  CRITICAL CONSTRAINTS:
  1. DO NOT USE ANY OF THESE WORDS: ${usedWords}
  2. Use simple capitalized phonetic spelling for 'pronunciation' like [LAN-YAP].
  3. The 'example' must relate to Twitch streaming or gaming.`;

  try {
    const data = await generateWithFallback(prompt);
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).replace(/,/g, '');
    
    // This is the standardized object format
    const newEntry = {
      word: data.word,
      phonetic: data.pronunciation,
      partOfSpeech: data.partOfSpeech,
      definition: data.definition,
      example: data.example,
      sourceUrl: data.sourceUrl,
      generatedDate: dateString
    };

    // --- 2. FORMAT DISCORD EMBED ---
    const discordPayload = {
      embeds: [{
        title: `Word of the Day - ${dateString}`,
        description: `# ${newEntry.word.toUpperCase()}\n*[${newEntry.phonetic}] (${newEntry.partOfSpeech})*`,
        color: 7419530, 
        fields: [
          { name: "Definition", value: `> ${newEntry.definition}` },
          { name: "Example", value: `*${newEntry.example}*` },
          { name: " ", value: `[Learn More](${newEntry.sourceUrl})` }
        ]
      }]
    };

    // --- 3. SAVE HISTORY & CURRENT WORD ---
    // Clean up any old malformed entries
    history = history.filter(item => item.word && !item.timestamp);
    
    // Add to the START of the history list
    history.unshift(newEntry);
    
    // Save history file (Array)
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));
    
    // Save current word file (Single Object - EXACT same format as JSON entries)
    fs.writeFileSync("current-word.txt", JSON.stringify(newEntry, null, 2));

    // --- 4. POST TO DISCORD ---
    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
      console.log("🚀 Posted Embed, saved current-word.txt (JSON format), and updated history!");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
