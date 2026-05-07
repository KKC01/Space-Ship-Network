FROM node:20-bookworm

# Install system libraries required to compile the canvas native addon from source.
# These are the development headers/libs that node-gyp links against during
# the `npm install` postCreateCommand when canvas.node is rebuilt for Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libpng-dev \
    wget \
    gnupg \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

# Claude Code をグローバルインストール（コンテナイメージに焼き込むことで Rebuild 後も利用可能にする）
RUN npm install -g @anthropic-ai/claude-code

# Magic MCP（@21st-dev/magic）をグローバルインストール
# Rebuild 後に消えるのを防ぐためイメージに焼き込む。.mcp.json は npx フォールバックも持つ
RUN npm install -g @21st-dev/magic

# The rest of the dev workflow (npm install, dev server) is handled
# by postCreateCommand in devcontainer.json — no CMD needed here.
