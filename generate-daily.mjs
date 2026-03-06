import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_wotd.txt',
    HISTORY_FILE: 'wotd_history.json',
    MODELS: ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-1.5-flash"]
};

const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', dateOptions);

async function getWikipediaThumbnail(wikiUrl) {
    try {
        if (!wikiUrl || !wikiUrl.includes('wikipedia.org')) return null;
        const title = wikiUrl.split('/').pop();
        const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=400&origin=*`;
        const res = await fetch(apiUrl);
        const data = await res.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === "-1") return null;
        return pages[pageId].thumbnail ? pages[pageId].thumbnail.source : null;
    } catch (err) {
        console.error("[Wiki Error]:", err.message);
        return null;
    }
}

async function postToDiscord(wordData) {
    console.log(`[Discord] Posting Word: ${wordData.word}`);
    const wikiThumbnail = await getWikipediaThumbnail(wordData.sourceUrl);

    const discordPayload = {
        embeds: [{
            title: `Word of the Day — ${displayDate}`,
            // # makes the word HUGE. 
            // Pronunciation now uses CAPS for emphasis.
            description: `# ${wordData.word}\n### *${wordData.pronunciation}*\n\n**Definition:** ${wordData.definition}\n\n**Example:** *"${wordData.example}"*\n\n[Learn more](${wordData.sourceUrl})`,
            color: 0x3498db, // Blue
            thumbnail: wikiThumbnail ? { url: wikiThumbnail } : null
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
    
    // UPDATED PROMPT: Specifically requests the gay streamer couple context and custom pronunciation
    const prompt = `Provide an interesting Word of the Day. 
    Return ONLY JSON: {
        "word": "The Word", 
        "pronunciation": "American sound-out style with CAPS for emphasis (e.g. ih-BULL-yunt)", 
        "definition": "One short, punchy sentence only", 
        "example": "A short sentence using the word, featuring the gay streamer couple HoneyBear and JellyBean", 
        "sourceUrl": "Wikipedia URL"
    }. 
    Keep all text extremely concise. Avoid these words: ${usedWords.join(", ")}`;

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
