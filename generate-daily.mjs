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
  const prompt = `Generate a 'Word of the Day' as a JSON object with these keys: 
  word, pronunciation, partOfSpeech, definition, example, sourceUrl. 
  
  IMPORTANT: 
  1. For 'pronunciation', use simple capitalized phonetic spelling like [LAN-YAP] or [KWID-nuhnk]. Do not use IPA symbols.
  2. The 'example' should mention a streamer, chat, or gaming context.`;

  try {
    const data = await generateWithFallback(prompt);
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).replace(/,/g, '');
    
    // Structure the data exactly for your JSON schema
    const newEntry = {
      word: data.word,
      phonetic: data.pronunciation, // Mapping 'pronunciation' to your 'phonetic' key
      partOfSpeech: data.partOfSpeech,
      definition: data.definition,
      example: data.example,
      sourceUrl: data.sourceUrl,
      generatedDate: dateString
    };

    // --- 1. FORMAT DISCORD POST ---
    const discordMessage = `**Word of the Day - ${dateString}**\n\n` +
      `# ${newEntry.word.toUpperCase()}\n\n` +
      `*[${newEntry.phonetic}] (${newEntry.partOfSpeech})*\n\n` +
      `**Definition**\n` +
      `> ${newEntry.definition}\n\n` +
      `**Example**\n` +
      `*${newEntry.example}*\n\n` +
      `[Learn More](${newEntry.sourceUrl})`;

    // --- 2. SAVE HISTORY (Newest at the top) ---
    let history = [];
    if (fs.existsSync("word-history.json")) {
        history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
    }
    
    // Filter out any previous malformed entries (like the one with "timestamp")
    history = history.filter(item => item.word && !item.timestamp);
    
    // Add to the START of the list
    history.unshift(newEntry);
    
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));
    fs.writeFileSync("current-word.txt", discordMessage);

    // --- 3. POST TO DISCORD ---
    if (process.env.DISCORD_WEBHOOK_URL) {
      const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: discordMessage })
      });
      if (response.ok) console.log("🚀 Posted and saved successfully!");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
