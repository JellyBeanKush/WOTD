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
Ensure the word is distinct and avoid extremely common words.
JSON ONLY: {"word": "word", "definition": "definition", "example": "A sentence using the word."}`;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Retries a function if the AI service is overloaded (503 error).
 */
async function retryRequest(fn, name, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            const isBusy = err.message.includes("503") || err.message.includes("demand") || err.message.includes("Overloaded");
            if (isBusy && i < maxRetries - 1) {
                const waitTime = (i + 1) * 15000; 
                console.log(`⚠️ ${name} is busy (503). Waiting ${waitTime/1000}s... (Attempt ${i + 1}/${maxRetries})`);
                await sleep(waitTime);
            } else {
                throw err;
            }
        }
    }
}

async function getGeminiWord() {
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(PROMPT);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
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
    if (CONFIG.GEMINI_KEY) {
        try {
            console.log("🚀 Requesting Word of the Day from Gemini...");
            wotd = await retryRequest(getGeminiWord, "Gemini");
        } catch (e) {
            console.log(`❌ Gemini failed: ${e.message}`);
        }
    }

    // TIER 2: GROQ FALLBACK
    if (!wotd && CONFIG.GROQ_KEY) {
        try {
            console.log("⚡ Switching to Groq fallback...");
            wotd = await retryRequest(getGroqWord, "Groq");
        } catch (e) {
            console.log(`❌ Groq failed: ${e.message}`);
        }
    }

    if (wotd) {
        // SAVE FOR MIX IT UP (Word and Definition only)
        const saveString = `${wotd.word}: ${wotd.definition}`;
        fs.writeFileSync(CONFIG.SAVE_FILE, saveString);
        console.log(`💾 Saved "${wotd.word}" to ${CONFIG.SAVE_FILE}`);

        // POST TO DISCORD
        await fetch(CONFIG.DISCORD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: "Word of the Day",
                embeds: [{
                    title: `✨ Word of the Day: ${wotd.word}`,
                    description: `**Definition:** ${wotd.definition}\n\n**Example:** *"${wotd.example}"*`,
                    color: 0x3498db
                }]
            })
        });
        console.log("✅ Posted to Discord!");
    } else {
        console.error("💀 BOTH AI MODELS FAILED.");
        process.exit(1);
    }
}

main();
