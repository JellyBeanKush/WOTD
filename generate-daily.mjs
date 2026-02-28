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
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: version });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
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
  const prompt = "Generate a 'Word of the Day' with a definition and an example sentence.";

  try {
    // Always generate a new word
    const content = await generateWithFallback(prompt);
    console.log("\n--- NEW WORD OF THE DAY -- --\n", content);

    // 1. Save full info to current-word.txt
    fs.writeFileSync("current-word.txt", content);

    // 2. Save full info to word-history.json
    let history = [];
    if (fs.existsSync("word-history.json")) {
      try {
        history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
      } catch (e) { history = []; }
    }
    
    // Storing the full generated content string in the history array
    history.push({
      timestamp: new Date().toISOString(),
      content: content
    });
    fs.writeFileSync("word-history.json", JSON.stringify(history, null, 2));

    // 3. Post to Discord
    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      console.log("🚀 Posted to Discord and saved to history!");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
