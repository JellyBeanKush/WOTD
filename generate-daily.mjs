import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Updated for Feb 2026: Removed '-latest' from 1.5-flash to fix 404 errors.
const modelPriority = [
  "gemini-3.1-flash-preview", 
  "gemini-3-flash-preview",   
  "gemini-2.5-flash",         
  "gemini-2.0-flash-lite",    
  "gemini-1.5-flash"          // The stable alias
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
    // Try v1beta (for new models) then v1 (for stable)
    for (const version of ["v1beta", "v1"]) {
      try {
        console.log(`Checking ${modelName} on ${version}...`);
        
        const model = genAI.getGenerativeModel(
          { model: modelName },
          { apiVersion: version }
        );

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log(`✅ Success! Bot is live using ${modelName}`);
        return text;

      } catch (error) {
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);

        if (status === 429) {
          console.warn(`⚠️ Quota hit for ${modelName}. Moving to next model...`);
          break; // Try the next model in modelPriority
        } 
        
        if (status === 404) {
          console.warn(`⚠️ ${modelName} not found on ${version}. Skipping...`);
          continue; 
        }

        console.error(`❌ Unexpected error with ${modelName}:`, error.message);
      }
    }
  }
  throw new Error("TOTAL FAILURE: All current and legacy models are unavailable.");
}

async function main() {
  // Load history to avoid repeats
  let history = [];
  if (fs.existsSync("word-history.json")) {
    try {
      history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
    } catch (e) {
      history = [];
    }
  }

  const prompt = `Generate a 'Word of the Day' with a definition and an example sentence. 
  Avoid using these recent words: ${history.slice(-10).join(", ")}`;

  try {
    const content = await generateWithFallback(prompt);
    console.log("\n--- WORD OF THE DAY ---\n", content);

    // --- SAVE HISTORY (Matches your .yml requirements) ---
    fs.writeFileSync("current-word.txt", content);
    
    // Extract just the word (usually the first line) for the history list
    const firstLine = content.split('\n')[0].replace(/[*#]/g, '').trim();
    history.push(firstLine);
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));

    // --- POST TO DISCORD ---
    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      console.log("🚀 Posted to Discord!");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
