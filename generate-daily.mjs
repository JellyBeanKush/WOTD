async function main() {
    console.log("Fetching allowed models directly from Google API...");
    try {
        // Bypassing the SDK to ask the server directly
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            console.log("=== EXACT APPROVED MODELS ===");
            data.models.forEach(m => {
                // Only list models that support generating text
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(m.name);
                }
            });
            console.log("=============================");
        } else {
            console.log("API returned an error:", data);
        }
    } catch (err) {
        console.log("Network Error:", err);
    }
}

main();
