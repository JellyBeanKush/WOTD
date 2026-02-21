import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_word.txt',
    HISTORY_FILE: 'word_history.json'
};

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(wordData) {
    const discordPayload = {
        username: "Word of the Day",
        embeds: [{
            title: `📖 WORD OF THE DAY: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}`,
            description: `## **${wordData.word}** (${wordData.partOfSpeech})\n\n> *${wordData.definition}*\n\n**Example:**\n"${wordData.example}"`,
            color: 0x9b59b6
        }]
    };
    await fetch(CONFIG.DISCORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discordPayload) });
}

async function main() {
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === today) {
                await postToDiscord(saved);
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    const usedWords = historyData.map(h => h.word.toLowerCase());

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(`Unique vocabulary word. JSON ONLY: {"word": "...", "partOfSpeech": "...", "definition": "...", "example": "..."}. Avoid: ${usedWords.join(", ")}`);
    const wordData = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

    if (wordData) {
        wordData.generatedDate = today;
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(wordData));
        historyData.unshift(wordData); 
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
        await postToDiscord(wordData);
    }
}
main();
