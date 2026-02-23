import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_word.txt',
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
    
    await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });
}

async function generateWithRetry(modelName, prompt, retries = 3) {
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().replace(/```json|```/g, "").trim();
        } catch (error) {
            if (i < retries - 1) await new Promise(r => setTimeout(r, 5000));
            else throw error;
        }
    }
}

async function main() {
    let historyData = [];
    
    // Load existing history so we don't lose it
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const content = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(content);
            historyData = Array.isArray(parsed) ? parsed : [];
        } catch (e) { 
            console.log("Starting history from scratch.");
        }
    }

    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) {
        console.log("Already posted today.");
        return;
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    
    const prompt = `Provide a unique "Word of the Day".
    Dictionary definition tone. 
    JSON ONLY: {
      "word": "WORD",
      "phonetic": "spelled-out-phonetic-with-EMPHASIS-CAPS",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Formal definition",
      "example": "One short, punchy sentence using streamer lingo (max 15 words).",
      "sourceUrl": "Wiktionary or Wikipedia URL",
      "imageUrl": "Direct .jpg or .png link from Wikipedia"
    }. 
    DO NOT use: ${usedWords.join(", ")}`;
    
    let responseText;
    try {
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    try {
        const wordData = JSON.parse(responseText);
        wordData.generatedDate = todayFormatted;
        
        // Save current day's word separately
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
        
        // Update history (Newest at top)
        historyData.unshift(wordData);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
        
        await postToDiscord(wordData);
        console.log(`Success! Posted ${wordData.word} and updated all files.`);
    } catch (err) {
        console.error("JSON Error:", err.message);
        process.exit(1);
    }
}

main();
