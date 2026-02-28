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
  const historyPath = "word-history.json";
  const currentPath = "current-word.txt";
  const today = new Date().toISOString().split('T')[0]; // Gets YYYY-MM-DD
  
  let content = "";

  // CHECK: Did we already generate a word today?
  if (fs.existsSync(currentPath)) {
    const stats = fs.statSync(currentPath);
    const lastUpdate = stats.mtime.toISOString().split('T')[0];

    if (lastUpdate === today) {
      console.log("📅 Word already generated for today. Re-using existing content...");
      content = fs.readFileSync(currentPath, "utf8");
    }
  }

  // If no word exists for today, generate one
  if (!content) {
    const prompt = "Generate a 'Word of the Day' with a definition and an example sentence.";
    try {
      content = await generateWithFallback(prompt);
      console.log("\n--- NEW WORD GENERATED ---\n", content);
      
      // Save to files for history
      fs.writeFileSync(currentPath, content);
      
      let history = [];
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
      }
      const wordOnly = content.split('\n')[0].replace(/[*#]/g, '').trim();
      history.push({ date: today, word: wordOnly });
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

    } catch (err) {
      console.error("\n💥 Bot crashed:", err.message);
      process.exit(1);
    }
  }

  // POST TO DISCORD
  if (process.env.DISCORD_WEBHOOK_URL && content) {
    try {
      const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      if (response.ok) {
        console.log("🚀 Posted to Discord successfully!");
      } else {
        console.error("❌ Discord post failed:", response.statusText);
      }
    } catch (postError) {
      console.error("❌ Error posting to Discord:", postError.message);
    }
  }
}

main();
