import fetch from "node-fetch";
import fs from "fs";

const CONFIG = {
    MODEL_NAME: "gemini-flash-latest",
    HISTORY_FILE: "word-history.json",
    CURRENT_FILE: "current-word.txt",
    COLOR: 0xa020f0 
};

async function main() {
    let history = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { history = []; }
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const payload = {
            contents: [{
                parts: [{
                    text: `Generate a "Word of the Day" that is a unique or uncommon dictionary word. 
                    
                    CRITICAL RULES:
                    1. MUST be a single word.
                    2. Do NOT use: ${history.join(", ")}.
                    3. Example sentence MUST be short, punchy, and have a streamer/gamer/degenerate vibe.
                    4. Example sentence length limit: Max 15-20 words. Keep it brief.
                    5. Adult language is allowed.

                    Format:
                    # [WORD]
                    **[Pronunciation]** ([part of speech])
                    ### Definition
                    > [Definition]
                    ### Example
                    *[Short, funny gamer example]*`
                }]
            }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const text = data.candidates[0].content.parts[0].text;
        const newWord = text.split('\n')[0].replace('# ', '').trim();

        await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ description: text, color: CONFIG.COLOR }]
            })
        });

        history.push(newWord);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CONFIG.CURRENT_FILE, newWord);
        
        console.log(`Success! Posted: ${newWord}`);

    } catch (err) {
        console.error("Failed:", err.message);
        process.exit(1);
    }
}

main();
