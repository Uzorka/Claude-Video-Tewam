#!/usr/bin/env bash
# One-time setup of the Claude Video Team on an Ubuntu computer.
# Run with:  bash <(curl -fsSL https://raw.githubusercontent.com/Uzorka/Claude-Video-Tewam/main/scripts/setup-ubuntu.sh)
set -euo pipefail

DIR="$HOME/Claude-Video-Tewam"
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step "1/5 Installing system tools (you may be asked for your computer password)"
sudo apt-get update -qq
sudo apt-get install -y -qq curl git ffmpeg ca-certificates > /dev/null
if ! command -v node > /dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null
  sudo apt-get install -y -qq nodejs > /dev/null
fi
echo "Node $(node -v), ffmpeg OK"

step "2/5 Downloading the studio into $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only
else
  git clone -q https://github.com/Uzorka/Claude-Video-Tewam.git "$DIR"
fi
cd "$DIR"

step "3/5 Installing the studio (takes a few minutes)"
npm install --no-audit --no-fund --loglevel=error
npx playwright-core install --with-deps chromium > /dev/null
npx remotion browser ensure > /dev/null

step "4/5 Your keys (paste each one and press Enter; they stay on this computer)"
touch .env
ask() {
  local name="$1" prompt="$2" default="${3:-}" value
  if grep -q "^$name=." .env; then echo "✔ $name is already set"; return; fi
  if [ -n "$default" ]; then prompt="$prompt [$default]"; fi
  read -rp "$prompt: " value
  value="${value:-$default}"
  if [ -n "$value" ]; then echo "$name=$value" >> .env; fi
}
ask GEMINI_API_KEY "Gemini API key (starts with AIza)"
ask ELEVENLABS_API_KEY "ElevenLabs API key"
ask ELEVENLABS_VOICE_ID "ElevenLabs voice ID"
ask TELEGRAM_BOT_TOKEN "Telegram bot token (from BotFather)"
ask CHANNEL_NAME "Your channel name" "Uzorka Tech"
ask CHANNEL_NICHE "What your channel covers" "AI tools, smartphones and the tech industry"
ask CHANNEL_STYLE "How the scripts should sound" "Calm, witty, honest, like MKBHD"
ask TARGET_MINUTES "Video length in minutes (3 recommended on the free voice plan)" "3"
ask DESCRIPTION_FOOTER "Credit line for video descriptions" "Voice generated with ElevenLabs (elevenlabs.io)"
ask PIXABAY_API_KEY "Pixabay key for stock footage (just press Enter to skip)"

step "5/5 Connecting Telegram and checking everything"
grep -q "^TELEGRAM_CHAT_ID=." .env || npx tsx src/cli.ts connect-telegram
npx tsx src/cli.ts check

cat <<'DONE'

✅ All set! To start your studio any time, open a Terminal and run:

    cd ~/Claude-Video-Tewam && npm run serve

Then talk to it from Telegram: /demo, /topics, /make 1, /new your topic, /help
DONE
