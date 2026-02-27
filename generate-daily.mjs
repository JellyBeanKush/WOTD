import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Updated for Feb 2026: Try the newest models first.
// If your 2.5 quota is hit, it will roll back to 3.1 or 3.0.
const modelPriority = [
  "gemini-3.1-flash-preview", // Newest & highest intelligence
  "gemini-3-flash-preview",   // Gemini 3 standard flash
  "gemini-2.5-flash",         // Your current default
  "gemini-2.0-flash-lite",    // Ultra-high quota model
  "gemini-1.5-flash-latest"   // The safe "stable" alias
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
        
        console.log(`✅ Success! Bot is live using ${modelName}`);
        return response.text();

      } catch (error) {
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);

        if (status === 429) {
          console.warn(`⚠️ Quota hit for ${modelName}. Moving to next model...`);
          break; // Try the next model in modelPriority
        } 
        
        if (status === 404) {
          // If 404 on v1beta, it will try v1 in the inner loop.
          // If 404 on both, it moves to the next model.
          continue; 
        }

        console.error(`❌ Unexpected error with ${modelName}:`, error.message);
      }
    }
  }
  throw new Error("TOTAL FAILURE: All current and legacy models are unavailable.");
}

async function main() {
  const prompt = "Generate a 'Word of the Day' with a definition and an example sentence.";

  try {
    const content = await generateWithFallback(prompt);
    console.log("\n--- WORD OF THE DAY ---\n", content);
  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
