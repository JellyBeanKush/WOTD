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

// Matches your current JSON date format exactly: "Mon Feb 23 2026"
const todayFormatted = new Date().toDateString(); 
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);

async function postToDiscord(wordData) {
    const discordPayload = {
        embeds: [{
            title: `✨ Word of the Day - ${displayDate}`,
            description: `Yo chat! Today's word is **${wordData.word}** (${wordData.phonetic}).\n\n**Definition:** ${wordData.definition}\n\n*Example:* ${wordData.example}\n\n[SOURCE](${wordData.sourceUrl})`,
            color: 0x3498db, 
            image: {
                url: wordData.imageUrl 
            }
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
            const text = result.response.text().replace(/```json|```/g, "").trim();
            return text;
        } catch (error) {
            if (i < retries - 1) await new Promise(r => setTimeout(r, 5000));
            else throw error;
        }
    }
}

async function main() {
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            const content = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            historyData = JSON.parse(content); 
            // 1. CLEANUP: This removes any accidental strings (like "GLASS CANNON") from your JSON
            historyData = historyData.filter(item => typeof item === 'object' && item !== null);
        } catch (e) { console.error("History file issue, starting fresh."); }
    }

    // 2. CHECK: Only proceed if today's date isn't already at the top
    if (historyData.length > 0 && historyData[0].generatedDate === todayFormatted) {
        console.log("Word of the day already handled.");
        return;
    }

    const usedWords = historyData.slice(0, 100).map(h => h.word);
    
    const prompt = `Provide a unique "Word of the Day" with a fun gaming/streamer example.
    Keep the tone chill and friendly for a Twitch community.
    JSON ONLY: {
      "word": "THE WORD",
      "phonetic": "phonetic-spelling",
      "partOfSpeech": "noun/verb/adj",
      "definition": "Simple definition",
      "example": "A funny example using streamer lingo (chat, pogs, malting, etc)",
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
        
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData));
        
        // 3. UNSHIFT: This puts the newest word at index 0 (the top of the file)
        historyData.unshift(wordData);
        
        // 4. SAVE: Limits the file to the 100 most recent words
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
        
        await postToDiscord(wordData);
        console.log(`Posted and saved to top: ${wordData.word}`);
    } catch (err) {
        console.error("Critical Error:", err.message);
        process.exit(1);
    }
}

main();
