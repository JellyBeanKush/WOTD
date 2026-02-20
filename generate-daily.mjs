import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474196919332114574/3dxnI_sWfWeyKHIjNruIwl7T4_d6a0j7Ilm-lZxEudJsgxyKBUBgQqgBFczLF9fXOUwk",
    SAVE_FILE: 'current-word.txt',
    HISTORY_FILE: 'word-history.json'
};

// Standardizes date to 2026-02-20 to avoid server formatting issues
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(wotd) {
    const discordPayload = {
        username: "Word of the Day",
        embeds: [{
            description: `# **${wotd.word.toUpperCase()}**\n**${wotd.phonetic}** (*${wotd.partOfSpeech}*)\n\n**Definition**\n> ${wotd.definition}\n\n**Example**\n*"${wotd.example}"*`,
            color: 0x9b59b6 
        }]
    };
    await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
    });
}

async function main() {
    // 1. REPOST CHECK: Checks for both 'date' and 'generatedDate'
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            const savedDate = saved.generatedDate || saved.date; 
            
            if (savedDate === today) {
                console.log(`♻️ Found word for ${today}. Updating Discord...`);
                await postToDiscord(saved);
                return;
            }
        } catch (e) { console.log("Updating file format..."); }
    }

    // 2. LOAD HISTORY
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { console.log("History file empty."); }
    }
    const usedWords = historyData.map(h => h.word.toLowerCase());

    // 3. GENERATE NEW WORD
    console.log(`🚀 No post found for ${today}. Generating...`);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    let wotd = null;
    const PROMPT = `Pick an unusual word. JSON ONLY: {"word":"WORD","phonetic":"PRON-un-si-AY-shun","partOfSpeech":"noun/verb/adj","definition":"def","example":"sentence"}`;
    
    const result = await model.generateContent(PROMPT + ` DO NOT use: ${usedWords.join(", ")}`);
    wotd = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

    if (wotd) {
        wotd.generatedDate = today;
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wotd));
        
        historyData.unshift(wotd); 
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
        
        await postToDiscord(wotd);
        console.log(`✅ Posted ${wotd.word} successfully!`);
    }
}
main();
