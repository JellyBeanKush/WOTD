import fetch from "node-fetch";
import fs from "fs";

// Using your exact file names from your current setup
const CONFIG = {
    MODEL_NAME: "gemini-flash-latest",
    HISTORY_FILE: "word-history.json",
    CURRENT_FILE: "current-word.txt",
    COLOR: 0xa020f0 
};

async function main() {
    console.log("Starting Word of the Day (Direct API Mode)...");

    // 1. Load your existing history
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { history = []; }
    }

    try {
        // 2. Direct URL to bypass SDK versioning issues
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const payload = {
            contents: [{
                parts: [{
                    text: `Generate a "Word of the Day" for a gaming community. 
                    Format it EXACTLY like this:
                    # [WORD IN ALL CAPS]
                    **[Pronunciation]** ([part of speech])
                    ### Definition
                    > [Definition]
                    ### Example
                    *[Funny gaming example sentence]*

                    CRITICAL: Do NOT use these previous words: ${history.join(", ")}.
                    Keep it PG and family friendly.`
                }]
            }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Google API Error: ${data.error.message}`);
        }

        const text = data.candidates[0].content.parts[0].text;
        const newWord = text.split('\n')[0].replace('# ', '').trim();

        // 3. Send to Discord (Clean format)
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ description: text, color: CONFIG.COLOR }]
            })
        });

        // 4. Update your existing files
        history.push(newWord);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CONFIG.CURRENT_FILE, newWord);
        
        console.log(`Successfully posted: ${newWord}`);

    } catch (err) {
        console.error("FAILED:", err.message);
        process.exit(1);
    }
}

main();
