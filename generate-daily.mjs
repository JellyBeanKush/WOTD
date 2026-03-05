import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import fetch from "node-fetch";

const CONFIG = {
    // AUTO-UPDATING MODELS:
    // latest aliases stay current forever. 
    // Fallbacks ensure reliability if the newest model is glitchy.
    MODELS: [
        "gemini-flash-latest", // Auto-points to Gemini 3.1 Flash-Lite
        "gemini-pro-latest",   // Auto-points to Gemini 3.1 Pro
        "gemini-2.5-flash",    // Stable fallback
        "gemini-1.5-flash"     // Safety net
    ]
};

async function generateWithFallback(prompt) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting: ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { response_mime_type: "application/json" } 
            });
            
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Extract JSON even if the model wraps it in markdown blocks
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (error) {
            console.warn(`⚠️ ${modelName} failed: ${error.message}`);
            
            // If we are rate limited (429), wait a moment before trying the next model
            if (error.message.includes("429")) {
                console.log("Rate limit hit. Waiting 10s...");
                await new Promise(r => setTimeout(r, 10000));
            }
            
            // If it's the last model, throw the error
            if (modelName === CONFIG.MODELS[CONFIG.MODELS.length - 1]) {
                throw new Error("TOTAL FAILURE: All models exhausted.");
            }
        }
    }
}

async function main() {
    let history = [];
    if (fs.existsSync("word-history.json")) {
        try {
            history = JSON.parse(fs.readFileSync("word-history.json", "utf8"));
        } catch (e) { history = []; }
    }
    
    const usedWords = history.map(item => item.word).filter(Boolean).join(", ");

    const prompt = `Generate a 'Word of the Day' as a JSON object with these keys: 
    word, pronunciation, partOfSpeech, definition, example, sourceUrl. 
    
    CRITICAL CONSTRAINTS:
    1. DO NOT USE ANY OF THESE WORDS: ${usedWords}
    2. For 'pronunciation', use simple capitalized phonetic spelling like KOH-moh-REH-bee. Do NOT use any brackets [].
    EXAMPLE SENTENCE: Feature a gay streamer couple. One is a high-energy "Honey Bear" type and the other is a "Jelly Bean" type. Use these character descriptions. Contextual/natural.
    CONSTRAINTS: Max 15 words. No slang like "poggers". No Cringe.
    JSON ONLY.`;

    try {
        const data = await generateWithFallback(prompt);
        const today = new Date();
        const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
        const dateString = today.toLocaleDateString('en-US', dateOptions);
        
        const newEntry = {
            word: data.word,
            phonetic: data.pronunciation ? data.pronunciation.replace(/[\[\]]/g, '') : "N/A", 
            partOfSpeech: data.partOfSpeech,
            definition: data.definition,
            example: data.example,
            sourceUrl: data.sourceUrl,
            generatedDate: dateString
        };

        const discordPayload = {
            embeds: [{
                title: `Word of the Day - ${dateString}`,
                description: `# ${newEntry.word.toUpperCase()}\n${newEntry.phonetic} / *${newEntry.partOfSpeech}*`,
                color: 7419530, 
                fields: [
                    { name: "Definition", value: `> ${newEntry.definition}` },
                    { name: "Example", value: `*${newEntry.example}*` },
                    { name: " ", value: `[Learn More](${newEntry.sourceUrl})` }
                ]
            }]
        };

        history = history.filter(item => item && item.word);
        history.unshift(newEntry);
        
        fs.writeFileSync("word-history.json", JSON.stringify(history.slice(0, 100), null, 2));
        fs.writeFileSync("current-word.txt", JSON.stringify(newEntry, null, 2));

        if (process.env.DISCORD_WEBHOOK_URL) {
            await fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(discordPayload)
            });
            console.log("🚀 Posted successfully using latest model!");
        }
    } catch (err) {
        console.error("\n💥 Bot crashed:", err.message);
        process.exit(1);
    }
}

main();
