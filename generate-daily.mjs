import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474196919332114574/3dxnI_sWfWeyKHIjNruIwl7T4_d6a0j7Ilm-lZxEudJsgxyKBUBgQqgBFczLF9fXOUwk",
    SAVE_FILE: 'current-word.txt', // Matches your GitHub file list
    HISTORY_FILE: 'word-history.json' // Matches your GitHub file list
};

// This creates a reliable "2026-02-20" format that won't break
const today = new Date().toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).split(' ')[0];

const PROMPT = `Pick one interesting, sophisticated, or unusual English word. 
JSON ONLY: {
  "word": "WORD", 
  "pronunciation": "PRON-un-si-AY-shun", 
  "type": "noun/verb/adj", 
  "definition": "definition", 
  "example": "sentence"
}
Note: In the pronunciation, use CAPITAL letters for the stressed syllable.`;

async function postToDiscord(wotd) {
    const discordPayload = {
        username: "Word of the Day",
        embeds: [{
            description: `# **${wotd.word.toUpperCase()}**\n**${wotd.pronunciation}** (*${wotd.type}*)\n\n**Definition**\n> ${wotd.definition}\n\n**Example**\n*"${wotd.example}"*`,
            color: 0x9b59b6 // Purple accent from Grawlix image
        }]
    };
    await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
    });
}

async function main() {
    let wotd = null;

    // 1. REPOST/UPDATE CHECK
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.date === today) {
                console.log(`♻️ Found word for ${today} in current-word.txt. Updating formatting...`);
                await postToDiscord(saved);
                return;
            }
        } catch (e) { console.log("Updating file to new JSON format..."); }
    }

    // 2. HISTORY CHECK
    let historyWords = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            const historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
            historyWords = historyData.map(item => (typeof item === 'string' ? item : item.word).toLowerCase());
        } catch (e) { console.log("History file initialized."); }
    }

    // 3. GENERATE NEW WORD
    console.log(`🚀 No post found for ${today}. Generating new word...`);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    for (let i = 0; i < 5; i++) {
        const result = await model.generateContent(PROMPT + ` DO NOT use these words: ${historyWords.join(", ")}`);
        const tempWotd = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
        
        if (!historyWords.includes(tempWotd.word.toLowerCase())) {
            wotd = tempWotd;
            break;
        }
        console.log(`🔄 AI chose "${tempWotd.word}" which is in history. Retrying...`);
    }

    if (wotd) {
        wotd.date = today;
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wotd));
        
        // Update word-history.json
        const fullHistory = fs.existsSync(CONFIG.HISTORY_FILE) ? JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')) : [];
        fullHistory.push({ word: wotd.word, date: today });
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(fullHistory, null, 2));
        
        await postToDiscord(wotd);
        console.log(`✅ Posted ${wotd.word} successfully!`);
    }
}

main();
