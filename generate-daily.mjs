import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import fs from "fs";

const CONFIG = {
    MODEL_NAME: "gemini-flash-latest",
    HISTORY_FILE: "word-history.json",   // Using your existing file
    CURRENT_FILE: "current-word.txt",    // Using your existing file
    COLOR: 0xa020f0 
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function main() {
    // 1. Load your existing history
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { history = []; }
    }

    try {
        const model = genAI.getGenerativeModel(
            { model: CONFIG.MODEL_NAME },
            { apiVersion: 'v1beta' } // The fix for your 2026 API access
        );

        const prompt = `Generate a "Word of the Day" for a gaming community. 
        Format it EXACTLY like this (No conversational filler):
        
        # [WORD IN ALL CAPS]
        **[Pronunciation]** ([part of speech])
        
        ### Definition
        > [Definition]
        
        ### Example
        *[Funny gaming or streaming example sentence]*
        
        CRITICAL: Do NOT use any of these words: ${history.join(", ")}.
        Keep it PG and family friendly for stream safety.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Extract the word to update your files
        const newWord = text.split('\n')[0].replace('# ', '').trim();

        // 2. Send to Discord (Clean embed, no footer/profile)
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ description: text, color: CONFIG.COLOR }]
            })
        });

        // 3. Update your existing files
        history.push(newWord);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CONFIG.CURRENT_FILE, newWord);
        
        console.log(`Updated ${CONFIG.CURRENT_FILE} and ${CONFIG.HISTORY_FILE} with: ${newWord}`);

    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

main();
