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

// Helper to check if a URL actually exists
async function isValidUrl(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch {
        return false;
    }
}

async function postToDiscord(wordData) {
    const word = wordData.word.toLowerCase();
    
    // Waterfall logic for the link
    const wiktionaryUrl = `https://en.wiktionary.org/wiki/${word}`;
    const mwUrl = `https://www.merriam-webster.com/dictionary/${word}`;
    const fallbackUrl = `https://www.google.com/search?q=definition+of+${word}`;

    let finalUrl = fallbackUrl;

    if (await isValidUrl(wiktionaryUrl)) {
        finalUrl = wiktionaryUrl;
    } else if (await isValidUrl(mwUrl)) {
        finalUrl = mwUrl;
    }

    const discordPayload = {
        embeds: [{
            title: `Word of the Day — ${displayDate}`,
            description: `# ${wordData.word.toUpperCase()}\n\n*${wordData.pronunciation}* / ***${wordData.partOfSpeech}***\n\n**Definition**\n> ${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n[Learn More](${finalUrl})`,
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

    const usedWords = historyData.map(h => h.word.toLowerCase());
    
    const prompt = `Provide a unique, real, but obscure Word of the Day. 
    IMPORTANT: Do not use any of the following words: ${usedWords.slice(0, 150).join(", ")}.
    
    Return ONLY JSON: {
        "word": "The Word", 
        "partOfSpeech": "noun/verb/adjective",
        "pronunciation": "American sound-out style with CAPS for emphasis", 
        "definition": "One short sentence", 
        "example": "Short sentence featuring HoneyBear and JellyBean", 
        "sourceUrl": "https://en.wiktionary.org/wiki/Word"
    }. 
    STRICT RULE: Do NOT use Wikipedia. Use Wiktionary as the primary source.`;

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

            if (usedWords.includes(newWordClean)) {
                console.warn(`[Duplicate Found] Skipping ${wordData.word}...`);
                continue; 
            }

            // Save to history
            historyData.unshift(wordData);
            fs.writeFileSync(CONFIG.SAVE_FILE, `${wordData.word}: ${wordData.definition}`, 'utf8');
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2), 'utf8');

            // Post with the new URL validation logic
            await postToDiscord(wordData);
            console.log("--- Success ---");
            return; 

        } catch (err) {
            console.warn(`[Fail] ${modelName}: ${err.message}`);
        }
    }
    process.exit(1);
}

main();
