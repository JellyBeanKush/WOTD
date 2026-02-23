import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current-word.txt',        
    HISTORY_FILE: 'word-history.json',    
    PRIMARY_MODEL: "gemini-2.5-flash", 
    BACKUP_MODEL: "gemini-1.5-flash-latest" 
};

const todayFormatted = new Date().toDateString(); 
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(wordData) {
    const discordPayload = {
        embeds: [{
            title: `Word of the Day - ${displayDate}`,
            description: `# ${wordData.word.toUpperCase()}\n` +
                         `*[${wordData.phonetic}] (${wordData.partOfSpeech})*\n\n` +
                         `**Definition**\n> ${wordData.definition}\n\n` +
                         `**Example**\n*${wordData.example}*\n\n` +
                         `[Learn More](${wordData.sourceUrl})`,
            color: 0x9b59b6, 
            image: { url: wordData.imageUrl }
        }]
    };
    await fetch(CONFIG.DISCORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discordPayload) });
}

async function main() {
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const content = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            historyData = JSON.parse(content).filter(item => typeof item === 'object');
        } catch (e) { historyData = []; }
    }

    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) return;

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: CONFIG.PRIMARY_MODEL });

    const prompt = `Provide a unique "Word of the Day".
    Dictionary tone. PHONETIC must be spelled-out with CAPS for emphasis (e.g. "suh-NAN-ih-gunz").
    EXAMPLE: Grounded, non-cringe context. Use variety: "The streamer...", "The game's lore...", "Chat reacted to...", etc. Max 15 words. No "poggers/pogs".
    JSON ONLY: {
      "word": "WORD",
      "phonetic": "PHONETIC",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Definition",
      "example": "Example",
      "sourceUrl": "Wiktionary URL",
      "imageUrl": "Direct .jpg/.png link"
    }. DO NOT use: ${usedWords.join(", ")}`;

    const result = await model.generateContent(prompt);
    const wordData = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
    wordData.generatedDate = todayFormatted;

    // SAVE BOTH FILES
    fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
    historyData.unshift(wordData);
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));

    await postToDiscord(wordData);
}
main();
