import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Updated for Feb 2026: Using valid model strings to fix 404 errors.
const modelPriority = [
  "gemini-3.1-flash-preview", 
  "gemini-3-flash-preview",   
  "gemini-2.5-flash",         
  "gemini-2.0-flash-lite",    
  "gemini-1.5-flash"          // Fix: Removed '-latest' to resolve 404s
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
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
          break; 
        } 
        
        if (status === 404) {
          // Silent continue as per your original logic to check next version/model
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
