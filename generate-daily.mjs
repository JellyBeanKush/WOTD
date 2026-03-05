import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import fetch from "node-fetch";

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    HISTORY_FILE: "word-history.json",
    SAVE_FILE: "current-word.txt",
    MODELS: ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-1.5-flash"]
};

const wait = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, "utf8")); } catch (e) { history = []; }
    }
    
    // Provide only last 50 words to Gemini as context to avoid prompt bloat
    const usedWords = history.slice(0, 50).map(item => item.word).filter(Boolean).join(", ");

    const prompt = `Generate a 'Word of the Day' as a JSON object with these keys: 
    word, pronunciation, partOfSpeech, definition, example, sourceUrl. 
    
    CRITICAL CONSTRAINTS:
    1. DO NOT USE ANY OF THESE WORDS: ${usedWords}
    2. For 'pronunciation', use simple capitalized phonetic spelling like KOH-moh-REH-bee. No brackets.
    3. EXAMPLE: Feature a gay streamer couple. One is a high-energy "Honey Bear" type and the other is a "Jelly Bean" type. Use these character descriptions. Contextual/natural.
    4. CONSTRAINTS: Max 15 words. No slang like "poggers". No Cringe.
    JSON ONLY.`;

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Word of the Day with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { response_mime_type: "application/json" } 
            });
            
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

            const today = new Date();
            const dateString = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            
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

            // Save Infinite History
            history.unshift(newEntry);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(newEntry, null, 2));

            if (CONFIG.DISCORD_URL) {
                await fetch(CONFIG.DISCORD_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(discordPayload)
                });
            }
            console.log("Success!");
            return;
        } catch (err) {
            console.error(`⚠️ ${modelName} failed: ${err.message}`);
            if (err.message.includes("429")) await wait(10000);
        }
    }
}

main().catch(err => { console.error(err); process.exit(1); });
