
import { WordData } from "../types";

export const sendToDiscord = async (webhookUrl: string, data: WordData) => {
  if (!webhookUrl) return;

  // Formatting the embed to match the app's aesthetic
  const payload = {
    embeds: [
      {
        // Title removed as per request (username handles it)
        description: `## ${data.word}\n**${data.phonetic}** *(${data.partOfSpeech})*`,
        color: 0x9146FF, // Twitch Purple
        fields: [
          {
            name: "Definition",
            value: `> ${data.definition}`,
            inline: false
          },
          {
            name: "Example",
            value: `*"${data.example}"*`,
            inline: false
          }
        ]
        // Footer removed as requested
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}`);
    }
  } catch (error) {
    console.error("Discord Webhook Error:", error);
    throw error;
  }
};
