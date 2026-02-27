import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Priority list of models to try
const modelPriority = [
  "gemini-2.5-flash", 
  "gemini-2.0-flash", 
  "gemini-1.5-flash"
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
    // We try two API versions for each model to avoid the 404 error
    const apiVersions = ["v1beta", "v1"]; 

    for (const version of apiVersions) {
      try {
        console.log(`Trying ${modelName} on API ${version}...`);
        
        // Pass the apiVersion to the model initialization
        const model = genAI.getGenerativeModel(
          { model: modelName },
          { apiVersion: version }
        );

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        console.log(`✅ Success! Used ${modelName} (${version})`);
        return response.text();

      } catch (error) {
        const status = error.status || (error.message.includes("429") ? 429 : error.message.includes("404") ? 404 : null);

        if (status === 429) {
          console.warn(`⚠️ Quota hit for ${modelName}. Skipping...`);
          break; // Stop trying this model, move to next model in modelPriority
        } 
        
        if (status === 404) {
          console.log(`ℹ️ ${modelName} not found on ${version}, trying next version...`);
          continue; // Try the next version (v1) for the same model
        }

        console.error(`❌ Unexpected error with ${modelName}:`, error.message);
        // If it's something else (like a bad API key), we should probably stop entirely
        throw error;
      }
    }
  }
  throw new Error("Critical: All models and API versions failed.");
}

async function main() {
  const prompt = "Generate a 'Word of the Day' with a definition and an example sentence.";

  try {
    const content = await generateWithFallback(prompt);
    console.log("\n--- Final Output ---\n", content);
  } catch (err) {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
  }
}

main();
