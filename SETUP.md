# 🎬 Claude Video Team: Step-by-Step Setup (beginner friendly)

Follow these steps **in order**. Each step says exactly where to click and what to copy.
Whenever you see **📋 Save this**, paste the value into a private note on your phone. You will need it in Step 7.

## ☁️ Cloud mode (laptop can stay off)

Once GitHub Actions works on your account, the studio runs on GitHub's computers:

- Every 10 minutes it checks Telegram. If you've sent something, it gets to work (a video takes about 20–40 minutes in the cloud).
- **Your chat connects automatically:** the first message you send the bot claims it. No `TELEGRAM_CHAT_ID` needed.
- Your voice choice (`/voice`) and your footage library are saved in GitHub, so nothing lives on the laptop.
- Failed videos (for example when Gemini is busy) are retried automatically every 15 minutes, up to 3 times.
- **Don't run `npm run serve` on the laptop at the same time.** Both would answer the same Telegram messages. Pick one.

---

## 💻 Run it on your Ubuntu laptop (no GitHub Actions needed)

Use this if GitHub Actions isn't available on your account, or you simply prefer your own computer.

**One-time setup (about 10 minutes):**
1. Open **Terminal** (press `Ctrl` + `Alt` + `T`).
2. Copy this line, paste it into Terminal (`Ctrl` + `Shift` + `V`) and press **Enter**:
   ```
   bash <(curl -fsSL https://raw.githubusercontent.com/Uzorka/Claude-Video-Tewam/main/scripts/setup-ubuntu.sh)
   ```
3. Type your computer password if asked (nothing shows while you type; that's normal) and press **Enter**.
4. When it asks, paste each key (Gemini, ElevenLabs key and voice ID, Telegram bot token) and press **Enter**. For questions with a suggested answer in `[brackets]`, just press **Enter** to accept it.
5. When it says *"Open your bot in Telegram and send it any message"*, send your bot `hello`. It replies, and the setup finishes with a ✅ list.

**Every time you want to use the studio:**
1. Open **Terminal** and run:
   ```
   cd ~/Claude-Video-Tewam && npm run serve
   ```
2. Leave that window open, and keep the laptop plugged in and awake. Closing the window stops the studio.
3. Talk to it from Telegram: `/demo` for a sample video, `/topics`, `/make 1`, `/new your topic`, then reply `approve` or your notes.

**Updating to the newest version later:** run the same setup line from step 2 again. It keeps your keys.

---

## Start free, upgrade later

You can test the whole idea **without a card**. Free test mode uses free services everywhere:

| Job | 🆓 Free test mode (no card) | 💎 Full mode (when you're convinced) |
|---|---|---|
| AI brain (topics, research, scripts) | **Google Gemini** free key | **Claude**: best writing and live web research. Pay as you go, about $1–3 per video |
| Voice-over | **ElevenLabs free plan**: realistic ready-made voices, about 10 minutes of speech a month | **ElevenLabs Creator** (about $22/month): **your own cloned voice** |
| Stock footage | Pixabay (free) | Pixabay (free) |
| Review on your phone | Telegram (free) | Telegram (free) |
| Running everything | GitHub Actions (free) | GitHub Actions (free) |

**Free mode limits, so you know what to expect:**
- About **3 short videos a month** (3 minutes each), because of the free voice allowance.
- The voice is a natural ElevenLabs voice, but **not yours**, and the free plan **doesn't allow commercial use** and asks you to credit ElevenLabs. Fine for testing; don't monetize those videos.
- Gemini's free tier is good but writes a bit less sharply than Claude, and Google may use free-tier requests to improve its products.

When you're happy with the results, the **"Upgrade to full mode"** section at the bottom takes about 10 minutes. No code changes.

> ⏱️ Free setup takes about 45 minutes.

---

## Step 1: Put the studio on your main branch

The studio code arrives as a pull request. GitHub only runs the automation from your **main** branch.

👉 Open the pull request link Claude gave you (or the **Pull requests** tab in your repo), click the green **Merge pull request** button, then **Confirm merge**.

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
7. Tap the link to your new bot (t.me/your_bot_name), tap **Start**, then send it any message, e.g. `hello`.
   (You'll get your chat ID from this in Step 8.)

---

## Step 3: 🆓 Get a free Gemini key: the AI brain (3 min)

1. Go to **https://aistudio.google.com** and sign in with your Google account.
2. Click **Get API key** (left menu) → **Create API key**. If asked, let it create a project for you.
3. Copy the key (starts with `AIza`).
   **📋 Save this as `GEMINI_API_KEY`.**

No card is needed. Don't turn on billing for this test.

---

## Step 4: 🆓 Get a free ElevenLabs voice (10 min)

1. Go to **https://elevenlabs.io** and sign up (free plan, no card).
2. Pick a voice you like: click **Voices** (or **Voice Library**), listen to a few, and add one that sounds like a confident tech YouTuber to **My Voices**.
   Good starting points among the default voices are deep, clear, conversational male or female voices. Choose whatever fits your channel.
3. Get your API key: click your profile (bottom left) → **API Keys → Create API Key**.
   **📋 Save this as `ELEVENLABS_API_KEY`.**
4. Get the voice ID: in **My Voices**, click the **⋯** next to your voice → **Copy voice ID**.
   **📋 Save this as `ELEVENLABS_VOICE_ID`.**
   (Can't find it? Step 8 prints all your voice IDs.)

---

## Step 5: Get a free Pixabay key for stock footage (3 min)

1. Go to **https://pixabay.com** and click **Join** (free account). Confirm your email.
2. While logged in, open **https://pixabay.com/api/docs/**.
3. Scroll to the **Parameters** section. Your key is shown in green next to `key (required)`.
   **📋 Save this as `PIXABAY_API_KEY`.**

> Pexels has paused new API keys. If you already have a Pexels key, you can add it too as `PEXELS_API_KEY`, and the studio will search both libraries.
> No key at all? The studio still works and uses animated backgrounds instead of footage.

---

## Step 6: Create your YouTube channel (10 min)

1. Go to **https://www.youtube.com**, sign in with Google, click your picture → **Create a channel**.
   Tip: choose "use a custom name" (e.g. **Uzorka Tech**) so it's a brand channel.
2. Verify your phone at **https://www.youtube.com/verify**. This unlocks custom thumbnails and videos longer than 15 minutes.
3. Add a profile picture, banner and a short description in **YouTube Studio → Customization**.

(You can skip this step while testing. You only need the channel when you publish.)

---

## Step 7: Give the studio your keys (GitHub Secrets) (10 min)

Secrets are stored encrypted. Nobody, including people who can see your code, can read them.

1. Open your repo on GitHub: **https://github.com/Uzorka/Claude-Video-Tewam**
2. Click **Settings** (top menu) → in the left menu **Secrets and variables → Actions**.
3. On the **Secrets** tab click **New repository secret**. Add each one (Name exactly as written, Value = what you saved):

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | from Step 3 |
   | `ELEVENLABS_API_KEY` | from Step 4 |
   | `ELEVENLABS_VOICE_ID` | from Step 4 |
   | `PIXABAY_API_KEY` | from Step 5 |
   | `TELEGRAM_BOT_TOKEN` | from Step 2 |

4. Now click the **Variables** tab → **New repository variable** and add:

   | Name | Value | Why |
   |---|---|---|
   | `CHANNEL_NAME` | `Uzorka Tech` (your channel name) | shown on videos and thumbnails |
   | `TARGET_MINUTES` | `3` | short test videos fit the free voice allowance |
   | `DESCRIPTION_FOOTER` | `Voice generated with ElevenLabs (elevenlabs.io)` | the credit ElevenLabs' free plan asks for |
   | `CHANNEL_NICHE` | *(optional)* `AI tools, smartphones and the tech industry` | what your channel covers |
   | `CHANNEL_STYLE` | *(optional)* e.g. `Calm, witty, honest, like MKBHD` | how the scripts should sound |

---

## Step 8: Run the setup check and get your chat ID (5 min)

1. In your repo click the **Actions** tab. If asked, click **I understand my workflows, enable them**.
2. On the left click **🎬 Media Studio** → on the right click **Run workflow** → choose **check** → green **Run workflow**.
3. Wait about a minute, click the run, then click **studio** to see the log. You'll see ✅ / ❌ for each key, plus:
   - `👉 Your TELEGRAM_CHAT_ID is: 123456789 (YourName)`
     **📋 Save this number** and add it as a new **Secret** named `TELEGRAM_CHAT_ID` (Step 7 again).
   - `🧠 Gemini key works`
   - A list of your ElevenLabs voices with IDs (if you still need `ELEVENLABS_VOICE_ID`).
4. Run **check** again. Your Telegram bot should message you: *"👋 Your studio is connected!"* 🎉

---

## Step 9: See a sample video (10 min)

1. **Actions → 🎬 Media Studio → Run workflow → demo**.
2. In about 5–10 minutes you'll receive a short sample video in Telegram showing the visual style (animated titles, stock footage, captions, transitions), voiced by the ElevenLabs voice you picked.

---

## Step 10: Make your first real video 🚀

1. **Actions → 🎬 Media Studio → Run workflow → make**.
   (Optionally type your own topic in the "topic" box, e.g. `Is the new iPhone worth upgrading to?`)
2. In about 20–40 minutes Telegram gets:
   - the video and a **Full quality** download link
   - the title, alternative titles and why the topic was picked
3. **Reply to that message** (swipe right on it in Telegram) with either:
   - `approve` → you get everything needed to upload (see Step 11)
   - your notes, e.g. `0:40 the price is wrong, it's $799. Make the intro punchier.` → a fixed version comes back
   - `reject` → it's dropped
4. Replies are picked up within about 10–20 minutes. A fixed version takes about 20–40 minutes more.

> 💡 In free mode each revision uses voice allowance too, so batch your notes into one reply.

### Telegram commands you can send any time
| Send | What happens |
|---|---|
| `/topics` | Today's 5 best trending topics |
| `/make 2` | Make topic #2 from that list |
| `/new Your topic here` | Make a video about anything you choose |
| `/status` | What's in progress |
| `/help` | Show these commands |

### Turn on the daily automatic video (optional)
Add a **Variable** named `DAILY_VIDEO` with value `on`. From then on, every day at 06:17 UTC the studio picks the best trending topic and sends you a video.
In free mode, leave it off and use `/topics` and `/make` instead, so you don't run out of free voice minutes.

---

## Step 11: Publishing your approved video

When you reply `approve`, the bot sends: the thumbnail, a full-quality download link, and the title, description and tags in tap-to-copy boxes.

1. Download the video (tap the link).
2. Open the **YouTube Studio** app or **studio.youtube.com** → **Create → Upload videos**.
3. Paste the title, description and tags, and upload the thumbnail.
4. Under **Altered content**, answer **Yes** (the voice is AI-generated; being honest protects your channel).
5. Choose **Publish** or **Schedule**. Done! ✅

> Why not upload automatically? YouTube locks videos uploaded by new, unaudited apps to "private". Automatic upload is ready in the code (see "Later" below) and can be switched on once Google approves your app.

---

## 💎 Upgrade to full mode (when you're convinced)

1. **Claude brain:** create a key at **https://console.anthropic.com** (Settings → Billing: add credit; Settings → API Keys → Create Key) and add it as the Secret `ANTHROPIC_API_KEY`. The studio switches to Claude automatically, including live web research. You can delete `GEMINI_API_KEY`.
2. **Your own voice:** subscribe to ElevenLabs **Creator**, then **Voices → Add a new voice → Professional Voice Clone**. Record about 30 minutes of yourself reading tech articles in a quiet room (a closet full of clothes works great). When it's trained, copy its voice ID into the `ELEVENLABS_VOICE_ID` Secret.
3. **Variables:** change `TARGET_MINUTES` to `8`, delete `DESCRIPTION_FOOTER`, and add `DAILY_VIDEO` = `on`.

---

## 📷 Real product photos and your own footage

The studio adds real visuals in two ways:

1. **Automatically, from the maker's own website:** whenever a scene names a product (e.g. *Apple HomePod*), the studio opens the maker's official product page and newsroom (apple.com, samsung.com, store.google.com…) and takes their official photos and video clips. The photo pops up **the moment the name is said**, with the name under it, so viewers connect the name to the product. Product scenes use the official video clip when there is one, and comparisons show both products above their columns. Companies publish these images for news coverage and reviews; the company is credited in the video and in the description.
   - Test it any time: **Actions → 🎬 Media Studio → Run workflow → photos**, and type a product in "topic". The bot sends you what it found.
   - To switch it off, add the repository variable `OFFICIAL_MEDIA` = `off`.
   - News-site photos and Wikimedia stay off (they're often the wrong model). Add the variable `PRODUCT_PHOTOS` = `on` to allow them as a last resort.
2. **Your own shots (best for growing a real channel):** in Telegram, send the bot photos or short videos (under 20 MB) with a **caption** saying what they show, for example:
   - `iphone 18, unboxing`
   - `galaxy s26 camera`
   - `my desk setup`

   They're saved on your laptop. Whenever a video mentions those words, your shots are used first: clips as background footage, photos as product shots. Vertical phone videos get a blurred background so nothing is cropped. Send `/library` to see what you've saved.

Tip: film short 5–15 second clips of products from different angles (in hand, on the desk, close-ups of the camera or screen). A few of these make a video look like MKBHD's instead of a slideshow.

---

## Optional extras

### Background music
Download free tracks from **YouTube Studio → Audio Library** (choose "No attribution required").
On GitHub, open the folder `assets/music`, click **Add file → Upload files**, drop the MP3s in and click **Commit changes**. A random track plays quietly under each video.

### Better trending data from YouTube (free)
1. Go to **https://console.cloud.google.com**, create a project named `video-team`.
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Copy it.
4. Add it as a GitHub Secret named `YOUTUBE_API_KEY`.

### Later: fully automatic YouTube upload
Do this after your first few videos. Ask Claude to walk you through it. In short: create OAuth credentials in the same Google project, get a refresh token, add `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` as secrets, request a YouTube API audit, then set the variable `PUBLISH_MODE` to `api`.

---

## Good to know

- **Your repo is public.** Scripts, research notes and the review videos (via the download link) can be seen by anyone who finds them. Your keys are safe in Secrets.
- **Grow a channel YouTube trusts:** YouTube demonetizes mass-produced, templated AI channels. Your review notes, your real opinions and (over time) your own voice and hands-on clips are what make this a real channel. Approve fewer, better videos rather than more.
- **Facts:** the studio only scripts from its research brief and lists sources in the description, but you're the editor. Check prices, specs and dates before approving.
- **Something failed?** You'll get a ⚠️ message in Telegram. Reply `retry`. You can also look at the red ❌ run in the **Actions** tab and send the error to Claude.
- The video engine (Remotion) is free for individuals and companies of up to 3 people.
