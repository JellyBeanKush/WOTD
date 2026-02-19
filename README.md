# 📚 Streamer's Word of the Day

Automatically posts a new word every day to your Discord server using GitHub Actions. No app to open, no computer to leave running — it's fully automated in the cloud.

---

## How It Works

1. Every day at your scheduled time, GitHub Actions wakes up and runs `generate-daily.mjs`
2. The script calls Google Gemini to generate a unique, interesting word (avoiding all past words)
3. It posts a formatted embed to your Discord channel via a webhook
4. It saves the word to `word-history.json` and commits it back to the repo so duplicates are always avoided

---

## Setup (one-time)

### 1. Fork or push this repo to GitHub

If you haven't already, create a new GitHub repository and push this project to it.

### 2. Add your secrets

Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these two secrets:

| Secret Name | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — free |
| `DISCORD_WEBHOOK` | Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL |

### 3. Set your post time

Open `.github/workflows/daily-word.yml` and change the cron schedule:

```yaml
- cron: '0 14 * * *'   # 9 AM Eastern / 2 PM UTC
```

Use [crontab.guru](https://crontab.guru) to find the right UTC time for your timezone.

### 4. Enable GitHub Actions

Go to the **Actions** tab in your repo. If prompted, click **"I understand my workflows, go ahead and enable them."**

### 5. Test it manually

Go to **Actions** → **Daily Word of the Day** → **Run workflow** → **Run workflow**

Watch it run — you should see the word post in Discord within ~30 seconds!

---

## Files

| File | Purpose |
|---|---|
| `generate-daily.mjs` | The main script — generates word and posts to Discord |
| `word-history.json` | Tracks all past words to avoid repeats |
| `.github/workflows/daily-word.yml` | GitHub Actions schedule config |

---

## Troubleshooting

**The workflow ran but nothing posted to Discord**
- Double-check that `DISCORD_WEBHOOK` is set correctly in your repo secrets
- Make sure the webhook URL starts with `https://discord.com/api/webhooks/...`

**Got a Gemini API error**
- Make sure `GEMINI_API_KEY` is set in your secrets
- Check your API key is active at [Google AI Studio](https://aistudio.google.com/)

**Want to change the post time?**
- Edit the `cron` line in `.github/workflows/daily-word.yml`
- Note: GitHub Actions schedules can be delayed by up to ~15 minutes during busy periods
