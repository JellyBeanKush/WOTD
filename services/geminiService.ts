
import { GoogleGenAI, Type } from "@google/genai";
import { WordData } from "../types";

export const generateWordOfTheDay = async (previousWords: string[] = []): Promise<WordData> => {
  const modelId = "gemini-3-flash-preview";
  
  const exclusionList = previousWords.join(", ");

  const prompt = `
    Generate a "Word of the Day" suitable for a Twitch stream audience.
    
    IMPORTANT CONSTRAINTS:
    - DO NOT generate any of the following words: [${exclusionList}]
    
    Criteria:
    1. The word should be real, valid English.
    2. It can be slightly obscure or interesting (e.g., 'petrichor', 'drossy', 'sonder').
    3. Include a "sound-it-out" pronunciation guide (e.g. for 'Colonel', use 'KER-nul'). Do NOT use IPA symbols. Capitalize the stressed syllable.
    4. The definition must be concise (under 15 words) and plain text (no HTML).
    5. Provide a short, fun example sentence.
  `;

  // process.env.API_KEY is replaced by Vite at build time
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let lastError: any;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Gemini] Requesting word (Attempt ${attempt}/${MAX_RETRIES})...`);
      
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING, description: "The word itself, capitalized." },
              phonetic: { type: Type.STRING, description: "Sound-it-out pronunciation (e.g. 'KER-nul'). No IPA symbols." },
              partOfSpeech: { type: Type.STRING, description: "noun, verb, adjective, etc." },
              definition: { type: Type.STRING, description: "A concise definition, max 15 words. Plain text." },
              example: { type: Type.STRING, description: "A short example sentence utilizing the word." },
            },
            required: ["word", "phonetic", "partOfSpeech", "definition", "example"],
          },
        },
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Empty response from Gemini");

      const parsed = JSON.parse(jsonText);
      
      // Extra safety check: If Gemini ignored the prompt and sent a duplicate
      if (previousWords.includes(parsed.word)) {
          console.warn("[Gemini] Generated duplicate word. Retrying...");
          throw new Error("Duplicate word generated"); 
      }

      // If successful, return immediately
      return {
        ...parsed,
        generatedDate: new Date().toDateString(),
      };

    } catch (error: any) {
      // Robustly get the error message, even if it's a JSON object or array
      const errString = error.message || JSON.stringify(error);
      console.error(`[Gemini] Attempt ${attempt} failed:`, errString);
      lastError = error;

      // Check for common retryable conditions including XHR/RPC errors
      const isRetryable = 
        errString.includes("503") || 
        errString.includes("overloaded") || 
        errString.includes("500") || 
        errString.includes("Internal") || 
        errString.includes("fetch failed") ||
        errString.includes("Rpc failed") ||
        errString.includes("xhr error") ||
        errString.includes("Duplicate");

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.log(`[Gemini] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not retryable or max retries reached, break loop
      break;
    }
  }

  // If we exit the loop, throw the last error
  throw lastError;
};
