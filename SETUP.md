# 🎬 Media Studio: Step-by-Step Setup (beginner friendly)

Follow these steps **in order**. Each step says exactly where to click and what to copy.
Whenever you see **📋 Save this**, paste the value into a private note on your phone. You will need it in Step 7.

> ⏱️ Total time: about 1–2 hours (most of it is recording your voice samples).
> 💳 You need a debit/credit card for the paid services (Claude and ElevenLabs).

---

## What it costs (approximate, check each site for current prices)

| Service | What it does | Cost |
|---|---|---|
| Claude API (Anthropic) | Finds topics, researches, writes scripts | Pay as you go, roughly $1–3 per video. Start with $20 credit. |
| ElevenLabs | Your realistic voice-over | **Creator plan ≈ $22/month** (needed to clone your voice; about 10–12 videos a month including fixes) |
| Pexels | Real stock video footage | Free |
| Telegram | Where you review and approve videos | Free |
| GitHub Actions | The "computer" that runs the studio | Free (your repo is public) |
| YouTube | Your channel | Free |

---

## Step 1: Put the studio on your main branch

The studio code arrives as a pull request. GitHub only runs the daily automation from your **main** branch.

👉 Open the pull request link Claude gave you (or **Pull requests** tab in your repo), click the green **Merge pull request** button, then **Confirm merge**.

---

## Step 2: Create your Telegram review bot (5 min)

This is where the studio sends you each video to approve.

1. Install **Telegram** on your phone and create an account (if you don't have one).
2. In Telegram, tap the search 🔍 and type **@BotFather** (it has a blue ✔️). Open it and tap **Start**.
3. Send the message: `/newbot`
4. It asks for a name. Send something like: `Uzorka Studio`
5. It asks for a username ending in `bot`. Send something like: `uzorka_studio_bot` (try another if it's taken).
6. BotFather replies with a long code like `7123456789:AAH...`.
   **📋 Save this as `TELEGRAM_BOT_TOKEN`.**
7. Tap the link to your new bot (t.me/your_bot_name) and tap **Start**, then send it any message, e.g. `hello`.
   (You'll get your chat ID from this in Step 8.)

---

## Step 3: Get your Claude API key (5 min)

1. Go to **https://console.anthropic.com** and sign up.
2. Click **Settings → Billing** and add **$20** of credit. (You can turn on auto-reload later.)
3. Click **Settings → API Keys → Create Key**. Name it `media-studio`.
4. Copy the key (starts with `sk-ant-`). You can only see it once!
   **📋 Save this as `ANTHROPIC_API_KEY`.**

---

## Step 4: Clone your voice on ElevenLabs (30–60 min)

This gives videos **your** real voice, not a robot.

1. Go to **https://elevenlabs.io** and sign up.
2. Subscribe to the **Creator** plan (click your profile → **Subscription**).
3. Record your voice samples:
   - Find a **quiet room** (closets full of clothes are great), phone 15–20 cm from your mouth.
   - Read anything out loud in your natural "YouTube host" voice: tech articles, product reviews.
   - **Professional Voice Clone** (best quality): about 30 minutes or more of clean audio.
   - **Instant Voice Clone** (quick start): 1–3 minutes. You can upgrade to Professional later.
4. In ElevenLabs click **Voices → + Add a new voice → Professional Voice Clone** (or Instant), upload your recordings and follow the steps (it asks you to verify it's your voice).
   - Professional clones take a few hours to train. You can continue with the other steps meanwhile.
5. Get your API key: click your profile (bottom left) → **API Keys → Create API Key**. Give it full access.
   **📋 Save this as `ELEVENLABS_API_KEY`.**
6. Get your voice ID: go to **Voices**, click the **⋯** next to your voice → **Copy voice ID**.
   **📋 Save this as `ELEVENLABS_VOICE_ID`.**
   (Don't worry if you can't find it. Step 8 prints all your voice IDs.)

---

## Step 5: Get a free Pexels key for stock footage (3 min)

1. Go to **https://www.pexels.com/api/** and click **Get Started** (create a free account).
2. Fill in the short form (Project: "YouTube channel video production").
3. Copy your API key.
   **📋 Save this as `PEXELS_API_KEY`.**

---

## Step 6: Create your YouTube channel (10 min)

1. Go to **https://www.youtube.com**, sign in with Google, click your picture → **Create a channel**.
   Tip: choose "use a custom name" (e.g. **Uzorka Tech**) so it's a brand channel.
2. Verify your phone at **https://www.youtube.com/verify**. This unlocks custom thumbnails and videos longer than 15 minutes.
3. Add a profile picture, banner and a short description in **YouTube Studio → Customization**.

---

## Step 7: Give the studio your keys (GitHub Secrets) (10 min)

Secrets are stored encrypted. Nobody, including people who can see your code, can read them.

1. Open your repo on GitHub: **https://github.com/Uzorka/Claude-Video-Tewam**
2. Click **Settings** (top menu) → in the left menu **Secrets and variables → Actions**.
3. On the **Secrets** tab click **New repository secret**. Add each one (Name exactly as written, Value = what you saved):

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | from Step 3 |
   | `ELEVENLABS_API_KEY` | from Step 4 |
   | `ELEVENLABS_VOICE_ID` | from Step 4 |
   | `PEXELS_API_KEY` | from Step 5 |
   | `TELEGRAM_BOT_TOKEN` | from Step 2 |

4. Now click the **Variables** tab → **New repository variable** and add your channel settings:

   | Name | Example value |
   |---|---|
   | `CHANNEL_NAME` | `Uzorka Tech` |
   | `TARGET_MINUTES` | `8` |
   | `CHANNEL_NICHE` | *(optional)* `AI tools, smartphones and the tech industry` |
   | `CHANNEL_STYLE` | *(optional)* how you want to sound, e.g. `Calm, witty, honest, like MKBHD` |

---

## Step 8: Run the setup check and get your chat ID (5 min)

1. In your repo click the **Actions** tab. If asked, click **I understand my workflows, enable them**.
2. On the left click **🎬 Media Studio** → on the right click **Run workflow** → choose **check** → green **Run workflow**.
3. Wait about a minute, click the run, then click **studio** to see the log. You'll see ✅ / ❌ for each key, plus:
   - `👉 Your TELEGRAM_CHAT_ID is: 123456789 (YourName)`
     **📋 Save this number** and add it as a new **Secret** named `TELEGRAM_CHAT_ID` (Step 7 again).
   - A list of your ElevenLabs voices with IDs (if you still need `ELEVENLABS_VOICE_ID`).
4. Run **check** again. Your Telegram bot should message you: *"👋 Your studio is connected!"* 🎉

---

## Step 9: See a sample video (10 min)

1. **Actions → 🎬 Media Studio → Run workflow → demo**.
2. In about 5–10 minutes you'll receive a short sample video in Telegram. It shows the visual style (animated titles, stock footage, captions, transitions) and uses your cloned voice if Step 4 is done.

---

## Step 10: Make your first real video 🚀

1. **Actions → 🎬 Media Studio → Run workflow → make**.
   (Optionally type your own topic in the "topic" box, e.g. `Is the new iPhone worth upgrading to?`)
2. In about 30–60 minutes Telegram gets:
   - the video (phone-quality preview) and a **Full quality** download link
   - the title, alternative titles and why the topic was picked
3. **Reply to that message** (swipe right on it in Telegram) with either:
   - `approve` → you get everything needed to upload (see Step 11)
   - your notes, e.g. `1:20 the price is wrong, it's $799. Make the intro punchier and add a comparison with the Pixel.` → a fixed version comes back
   - `reject` → it's dropped
4. Replies are picked up within about 10–20 minutes. A fixed version takes about 20–40 minutes more.

**From now on it runs by itself:** every day at 06:17 UTC it picks the best trending topic and sends you a video.

### Telegram commands you can send any time
| Send | What happens |
|---|---|
| `/topics` | Today's 5 best trending topics |
| `/make 2` | Make topic #2 from that list |
| `/new Your topic here` | Make a video about anything you choose |
| `/status` | What's in progress |
| `/help` | Show these commands |

---

## Step 11: Publishing your approved video

When you reply `approve`, the bot sends: the thumbnail, a full-quality download link, and the title, description and tags in tap-to-copy boxes.

1. Download the video (tap the link).
2. Open the **YouTube Studio** app or **studio.youtube.com** → **Create → Upload videos**.
3. Paste the title, description and tags, and upload the thumbnail.
4. Under **Altered content**, answer **Yes** (your voice is AI-generated; being honest protects your channel).
5. Choose **Publish** or **Schedule**. Done! ✅

> Why not upload automatically? YouTube locks videos uploaded by new, unaudited apps to "private". Automatic upload is ready in the code (see "Later" below) and can be switched on once Google approves your app.

---

## Optional extras

### Background music
Download free tracks from **YouTube Studio → Audio Library** (choose "No attribution required").
On GitHub, open the folder `assets/music`, click **Add file → Upload files**, drop the MP3s in and click **Commit changes**. A random track plays quietly under each video.

### Better trending data from YouTube (free)
1. Go to **https://console.cloud.google.com**, create a project named `media-studio`.
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Copy it.
4. Add it as a GitHub Secret named `YOUTUBE_API_KEY`.

### Later: fully automatic YouTube upload
Do this after your first few videos. Ask Claude to walk you through it. In short: create OAuth credentials in the same Google project, get a refresh token, add `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` as secrets, request a YouTube API audit, then set the variable `PUBLISH_MODE` to `api`.

---

## Good to know

- **Your repo is public.** Scripts, research notes and the review videos (via the download link) can be seen by anyone who finds them. Your keys are safe in Secrets. If you'd rather keep drafts private, ask Claude about moving the studio to a private repo.
- **Grow a channel YouTube trusts:** YouTube demonetizes mass-produced, templated AI channels. Your review notes, your real opinions and (over time) your own hands-on clips are what make this a real channel. Approve fewer, better videos rather than more.
- **Facts:** the studio only scripts from its research brief and lists sources in the description, but you're the editor. Check prices, specs and dates before approving.
- **Something failed?** You'll get a ⚠️ message in Telegram. Reply `retry`. You can also look at the red ❌ run in the **Actions** tab and send the error to Claude.
- The video engine (Remotion) is free for individuals and companies of up to 3 people.
