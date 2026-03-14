import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: path.join(process.cwd(), 'current-word.txt'),
    HISTORY_FILE: path.join(process.cwd(), 'word-history.json'),
    MODELS: ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-1.5-flash"]
};

const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', dateOptions);

async function postToDiscord(wordData) {
    const discordPayload = {
        embeds: [{
            title: `Word of the Day — ${displayDate}`,
            description: `# ${wordData.word.toUpperCase()}\n\n*${wordData.pronunciation}* / ***${wordData.partOfSpeech}***\n\n**Definition**\n> ${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n[Learn More](${wordData.sourceUrl})`,
            color: 0x9b59b6 
        }]
    };

    const res = await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
    });

    if (!res.ok) throw new Error(`Discord Failed: ${await res.text()}`);
}

async function main() {
    console.log("--- Starting WOTD Generation ---");

    // 1. Load History
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const raw = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            historyData = JSON.parse(raw);
            console.log(`[History] Loaded ${historyData.length} previous words.`);
        } catch (e) { 
            console.warn("[History] Error reading history file, starting fresh."); 
        }
    }

    // Map all previously used words to lowercase for strict comparison
    const usedWords = historyData.map(h => h.word.toLowerCase());
    
    // Hardened prompt with explicit constraints
    const prompt = `Provide a unique and interesting Word of the Day. 
    IMPORTANT: Do not use any of the following words: ${usedWords.slice(0, 150).join(", ")}.
    
    Return ONLY JSON: {
        "word": "The Word", 
        "partOfSpeech": "noun/verb/adjective",
        "pronunciation": "American sound-out style with CAPS for emphasis", 
        "definition": "One short sentence", 
        "example": "Short sentence featuring HoneyBear and JellyBean", 
        "sourceUrl": "Wikipedia URL"
    }.`;

    const client = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`[Model] Trying ${modelName}...`);
            const result = await client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingLevel: "minimal" }
                }
            });

            const wordData = JSON.parse(result.text.match(/\{[\s\S]*\}/)[0]);
            const newWordClean = wordData.word.trim().toLowerCase();

            // --- THE FIX: Hard Validation ---
            if (usedWords.includes(newWordClean)) {
                console.warn(`[Duplicate Found] Model suggested "${wordData.word}", which is already in history. Retrying...`);
                continue; // Skips this model and moves to the next one to get a fresh word
            }

            // 2. WRITE FILES
            const saveText = `${wordData.word}: ${wordData.definition}`;
            historyData.unshift(wordData);
            const historyText = JSON.stringify(historyData, null, 2);

            fs.writeFileSync(CONFIG.SAVE_FILE, saveText, 'utf8');
            fs.writeFileSync(CONFIG.HISTORY_FILE, historyText, 'utf8');

            console.log(`[Files] Successfully wrote to ${CONFIG.SAVE_FILE}`);
            console.log(`[Files] Successfully updated ${CONFIG.HISTORY_FILE}`);

            // 3. Post to Discord
            await postToDiscord(wordData);
            console.log("--- Success ---");
            return; 

        } catch (err) {
            console.warn(`[Fail] ${modelName}: ${err.message}`);
        }
    }
    
    console.error("Critical: All models failed or produced duplicates.");
    process.exit(1);
}

main();
