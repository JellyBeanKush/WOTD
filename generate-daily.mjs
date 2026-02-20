import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474196919332114574/3dxnI_sWfWeyKHIjNruIwl7T4_d6a0j7Ilm-lZxEudJsgxyKBUBgQqgBFczLF9fXOUwk",
    SAVE_FILE: 'current_wotd.txt'
};

const PROMPT = `Pick one interesting, sophisticated, or unusual English word for a "Word of the Day" post. 
JSON ONLY: {
  "word": "WORD", 
  "pronunciation": "PRON-un-si-AY-shun", 
  "type": "noun/verb/adj", 
  "definition": "definition", 
  "example": "A sentence using the word."
}
Note: Use CAPITAL letters for the stressed syllable in the pronunciation.`;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function retryRequest(fn, name, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            const isBusy = err.message.includes("503") || err.message.includes("demand");
            if (isBusy && i < maxRetries - 1) {
                await sleep((i + 1) * 15000); // 15s, 30s...
                continue;
            }
            throw err;
        }
    }
}

async function getGeminiWord() {
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(PROMPT);
    return JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
}

async function getGroqWord() {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${CONFIG.GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: PROMPT }],
            response_format: { type: "json_object" }
        })
    });
    const json = await response.json();
    return JSON.parse(json.choices[0].message.content);
}

async function main() {
    let wotd = null;

    // TIER 1: GEMINI
    try {
        wotd = await retryRequest(getGeminiWord, "Gemini");
    } catch (e) {
        console.log("⚠️ Gemini failed, trying Groq fallback...");
        // TIER 2: GROQ
        try { 
            wotd = await retryRequest(getGroqWord, "Groq"); 
        } catch (e2) { 
            console.error("💀 All AI models are currently unavailable."); 
        }
    }

    if (wotd) {
        fs.writeFileSync(CONFIG.SAVE_FILE, `${wotd.word}: ${wotd.definition}`);

        const discordPayload = {
            username: "Word of the Day",
            embeds: [{
                description: `# **${wotd.word.toUpperCase()}**\n**${wotd.pronunciation}** (*${wotd.type}*)\n\n**Definition**\n> ${wotd.definition}\n\n**Example**\n*"${wotd.example}"*`,
                color: 0x9b59b6 
            }]
        };

        await fetch(CONFIG.DISCORD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
        });
        console.log("✅ Success!");
    }
}

main();
