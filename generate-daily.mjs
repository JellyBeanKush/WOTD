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
                         `[SOURCE](${wordData.sourceUrl})`,
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
    
    // 1. IMPROVED LOAD: Try to recover history, but don't die if it fails
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const content = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            if (content.trim()) {
                const parsed = JSON.parse(content);
                historyData = Array.isArray(parsed) ? parsed.filter(item => typeof item === 'object' && item !== null) : [];
            }
        } catch (e) { 
            console.log("⚠️ History file is corrupted. Bot will attempt to post anyway and repair the file.");
            // If the file is broken, we'll just start with an empty history for this run
            // and the next save will overwrite the broken file with a clean one.
            historyData = []; 
        }
    }

    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) {
        console.log("Already handled today.");
        return;
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    
    const prompt = `Provide a unique "Word of the Day".
    Dictionary definition tone. Example must be funny and use Twitch/streamer lingo (chat, pogs, malting, etc).
    JSON ONLY: {
      "word": "THE WORD",
      "phonetic": "phonetic-spelling",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Dictionary definition",
      "example": "Streamer-themed example",
      "sourceUrl": "Wikipedia URL",
      "imageUrl": "Direct .jpg or .png link from Wikipedia"
    }. 
    DO NOT use these words: ${usedWords.join(", ")}`;
    
    let responseText;
    try {
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    try {
        const wordData = JSON.parse(responseText);
        wordData.generatedDate = todayFormatted;
        
        // 2. OVERWRITE current_word.txt
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData, null, 2));
        
        // 3. ADD TO TOP
        historyData.unshift(wordData);
        
        // 4. SAVE UPDATED HISTORY (This effectively REPAIRS the file)
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
        
        await postToDiscord(wordData);
        console.log(`Success: Posted ${wordData.word}. History file has been repaired and updated.`);
    } catch (err) {
        console.error("Critical JSON Parse Error from AI:", err.message);
        process.exit(1);
    }
}

main();
