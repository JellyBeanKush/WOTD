import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Initialize with your API Key from environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Define your model priority list
const modelPriority = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

async function generateWithFallback(prompt) {
  for (const modelName of modelPriority) {
    try {
      console.log(`Attempting generation with: ${modelName}...`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      console.log(`Success using ${modelName}!`);
      return response.text();

    } catch (error) {
      // Check if it's a quota error (429)
      if (error.status === 429 || error.message.includes("429")) {
        console.warn(`Quota exceeded for ${modelName}. Trying next model...`);
        // Optional: wait 2 seconds before trying the next model
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue; 
      }
      
      // If it's a different error (auth, syntax, etc.), stop and report it
      console.error(`Critical error with ${modelName}:`, error.message);
      throw error;
    }
  }
  
  throw new Error("All models failed due to quota limits.");
}

async function main() {
  const prompt = "Generate a 'Word of the Day' with a definition and an example sentence.";

  try {
    const content = await generateWithFallback(prompt);
    console.log("--- Result ---");
    console.log(content);
    // Add your logic here to save the file or post to Twitch/Discord
  } catch (err) {
    console.error("Bot failed to run:", err.message);
    process.exit(1);
  }
}

main();
