import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use stable aliases to avoid 404s and prioritize high-quota models
const modelPriority = [
  "gemini-1.5-flash",         // Highest free-tier quota
  "gemini-2.0-flash-lite",    
  "gemini-2.5-flash",         
  "gemini-3-flash-preview",   
  "gemini-3.1-flash-preview"
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
    // Try v1 (stable) then v1beta (previews)
    for (const version of ["v1", "v1beta"]) {
      try {
        console.log(`Checking ${modelName} on ${version}...`);
        
        const model = genAI.getGenerativeModel(
          { model: modelName },
          { apiVersion: version }
        );

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        if (!text) throw new Error("Empty response from AI");

        console.log(`✅ Success! Bot is live using ${modelName}`);
        return text;

      } catch (error) {
        const errMsg = error.message || "";
        const status = error.status || 0;

        // Detect Quota (429)
        if (status === 429 || errMsg.includes("429") || errMsg.includes("quota")) {
          console.warn(`⚠️ Quota hit for ${modelName}. Moving to next model...`);
          break; 
        } 
        
        // Detect Not Found (404)
        if (status === 404 || errMsg.includes("404") || errMsg.includes("not found")) {
          console.warn(`⚠️ ${modelName} not found on ${version}. Skipping...`);
          continue; 
        }

        console.error(`❌ Unexpected error with ${modelName}:`, errMsg);
      }
    }
  }
  throw new Error("TOTAL FAILURE: All current and legacy models are unavailable.");
}

async function main() {
  const prompt = "Generate a 'Word of the Day' with a definition and an example sentence. Format it nicely for Discord.";

  try {
    const content = await generateWithFallback(prompt);
    
    console.log("\n--- WORD OF THE DAY ---\n", content);

    // Send to Discord Webhook
    if (process.env.DISCORD_WEBHOOK_URL) {
      const discordResponse = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            content: `**Today's Word of the Day:**\n${content}` 
        })
      });

      if (discordResponse.ok) {
        console.log("🚀 Posted to Discord successfully!");
      } else {
        console.error("❌ Discord post failed:", discordResponse.statusText);
      }
    } else {
      console.warn("⚠️ No DISCORD_WEBHOOK_URL found in environment variables.");
    }

  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
