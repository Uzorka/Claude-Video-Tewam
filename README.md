# 🎬 Claude Video Team

An AI production team for a tech/AI YouTube channel. Every day it finds what's trending, researches it, writes a script, records the voice-over in your cloned voice, edits a motion-graphics video with stock footage and captions, and sends it to you on Telegram. You reply `approve` or send notes, and it fixes and re-sends.

👉 **New here? Start with [SETUP.md](SETUP.md).** You can test it for free (Gemini + ElevenLabs free plan), no card needed.

## The team

| Role | File | Tool |
|---|---|---|
| Trend scout | `src/pipeline/trends.ts` | Hacker News, Reddit, Google News, Google Trends, YouTube trending → the AI ranks them |
| Researcher | `src/pipeline/research.ts`, `src/pipeline/sources.ts` | Claude + live web search, or (free mode) Gemini reading articles the studio downloads |
| Writer & director | `src/pipeline/script.ts` | The AI (Claude or Gemini) writes the script and plans every scene |
| Voice | `src/pipeline/voice.ts` | ElevenLabs (your cloned voice) with word-level timing |
| B-roll & captures | `src/pipeline/visuals.ts` | Pixabay/Pexels stock video, Playwright web-page captures, music |
| Editor | `src/video/*` | Remotion (React): kinetic titles, stats, lists, comparisons, captions, transitions, thumbnail |
| Producer | `src/produce.ts` | Runs the steps, saves files to GitHub Releases, sends the review |
| Review desk | `src/inbox.ts` | Reads your Telegram replies: approve / notes / commands |
| Publisher | `src/publish.ts` | Upload kit for YouTube Studio, or automatic upload (`PUBLISH_MODE=api`) |

The schedule lives in `.github/workflows/studio.yml`. Job records (research, scripts, timelines) are saved in `jobs/`; rendered videos are attached to GitHub Releases.

## Run it on a computer

Ubuntu one-liner (installs everything, asks for your keys): see **SETUP.md → Run it on your Ubuntu laptop**. Then `npm run serve` keeps the studio running and answering Telegram.

Manual setup:

```bash
npm install
cp .env.example .env     # fill in your keys
npm run check            # test keys
npm run demo             # render a sample video into out/
npm run make             # full pipeline on today's top topic
npx tsx src/cli.ts make --topic "Your topic"
npm run preview          # open the Remotion editor to tweak the visual style
```

Requires Node 20+ and ffmpeg.
