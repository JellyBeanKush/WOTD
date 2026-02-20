import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    DISCORD_URL: "https://discord.com/api/webhooks/1474196919332114574/3dxnI_sWfWeyKHIjNruIwl7T4_d6a0j7Ilm-lZxEudJsgxyKBUBgQqgBFczLF9fXOUwk",
    SAVE_FILE: 'current_wotd.txt'
};

async function repost() {
    if (!fs.existsSync(CONFIG.SAVE_FILE)) {
        console.error("No word found in current_wotd.txt to repost.");
        return;
    }

    const savedData = fs.readFileSync(CONFIG.SAVE_FILE, 'utf8');
    // Assuming the format is "WORD: Definition"
    const [word, definition] = savedData.split(': ');

    // Manually setting today's missing info for the repost
    // You can edit these three lines if they are wrong for today's word
    const pronunciation = "tur-jiv-er-SAY-shun"; 
    const type = "noun";
    const example = "The politician’s constant tergiversation on the controversial policy left the voters confused.";

    const discordPayload = {
        username: "Word of the Day",
        embeds: [{
            description: `# **${word.toUpperCase()}**\n**${pronunciation}** (*${type}*)\n\n**Definition**\n> ${definition}\n\n**Example**\n*"${example}"*`,
            color: 0x9b59b6 
        }]
    };

    await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
    });
    console.log("✅ Reposted with new formatting!");
}

repost();
