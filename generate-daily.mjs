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
                    text: `Generate a "Word of the Day" that is a unique, interesting, or uncommon dictionary word (like 'Opsimath' or 'Ultracrepidarian'). 
                    
                    CRITICAL RULES:
                    1. It MUST be a single, real word. No compound gaming tropes like 'Glass Cannon'.
                    2. Do NOT use these previous words: ${history.join(", ")}.
                    3. The example sentence MUST be tailored to a gamer, Twitch streamer, or degenerate internet culture vibe.
                    4. Adult themes and language are PERMITTED. 

                    Format it EXACTLY like this:
                    # [WORD IN ALL CAPS]
                    **[Pronunciation]** ([part of speech])
                    ### Definition
                    > [Definition]
                    ### Example
                    *[Funny, gamer-focused, or streamer-vibe example sentence]*

                    No conversational filler.`
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
        const lines = text.split('\n').filter(line => line.trim() !== "");
        const newWord = lines[0].replace('# ', '').trim();

        // Send to Discord
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ description: text, color: CONFIG.COLOR }]
            })
        });

        // Update your files
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
