import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

/**
 * CONFIGURATION
 * Reverted to original hyphenated file names.
 */
const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json',
    MODELS: ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-1.5-flash"]
};

const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', dateOptions);

/**
 * Discord Webhook Poster
 * REMOVED: Wikipedia thumbnail logic entirely.
 */
async function postToDiscord(wordData) {
    console.log(`[Discord] Posting Word: ${wordData.word}`);

    const discordPayload = {
        embeds: [{
            title: `Word of the Day — ${displayDate}`,
            // # HUGE WORD
            // Sound-out pronunciation with CAPS
            description: `# ${wordData.word.toUpperCase()}\n\n*${wordData.pronunciation}* / ***${wordData.partOfSpeech}***\n\n**Definition**\n> ${wordData.definition}\n\n**Example**\n*${wordData.example}*\n\n[Learn More](${wordData.sourceUrl})`,
            color: 0x9b59b6 // Purple theme
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
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } 
        catch (e) { console.warn("History reset."); }
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    
    const prompt = `Provide an interesting Word of the Day. 
    Return ONLY JSON: {
        "word": "The Word", 
        "partOfSpeech": "noun/verb/adjective",
        "pronunciation": "American sound-out style with CAPS for emphasis (e.g. ih-BULL-yunt)", 
        "definition": "One very short sentence", 
        "example": "One short sentence using the word featuring the streamers HoneyBear and JellyBean", 
        "sourceUrl": "Wikipedia URL"
    }. 
    STRICTLY AVOID: phonetic symbols like /pɛtrɪkɔːr/. Use simple American sounds.
    Avoid: ${usedWords.join(", ")}`;

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

            const responseText = result.text;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const wordData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

            if (!wordData.word || !wordData.definition) throw new Error("Incomplete JSON");

            fs.writeFileSync(CONFIG.SAVE_FILE, `${wordData.word}: ${wordData.definition}`);
            historyData.unshift(wordData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));

            await postToDiscord(wordData);
            console.log("--- Process Success ---");
            return; 

        } catch (err) {
            console.warn(`[Fail] ${modelName}: ${err.message}`);
        }
    }
    process.exit(1);
}

main();
