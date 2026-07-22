FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    nodejs \
    npm \
    docker.io \
    jq \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Google Chrome（.mcp.json の playwright MCP がブラウザ操作に使用する）
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Antigravity CLI（agy）。Go製の単一バイナリ。/root配下は名前付きボリューム外で
# 再構築のたびに失われるため、ここに焼き込んで恒久化する。
# 公式インストーラがSHA512検証付きで ~/.local/bin/agy を配置する。
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

# 非対話シェルでも agy を解決できるようPATHを通す。
ENV PATH="/root/.local/bin:${PATH}"

# ---------------------------------------------------------------------------
# ここから下にプロジェクト固有の依存関係を追加する。
# 例:
#   RUN apt-get update && apt-get install -y ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
#   RUN pip install --no-cache-dir pillow numpy requests
#
# .mcp.json の gemini サーバー（.devcontainer/mcp/gemini-image-mcp.js）を使う場合、
# 依存の canvas パッケージのネイティブビルドに以下が必要:
#   RUN apt-get update && apt-get install -y --no-install-recommends \
#       build-essential pkg-config libcairo2-dev libpango1.0-dev \
#       libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev libpng-dev \
#       && rm -rf /var/lib/apt/lists/*
#   RUN npm install --prefix .devcontainer/mcp
# ---------------------------------------------------------------------------

WORKDIR /workspace
