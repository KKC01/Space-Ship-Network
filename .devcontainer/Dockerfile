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
  && rm -rf /var/lib/apt/lists/*

# The rest of the dev workflow (npm install, dev server) is handled
# by postCreateCommand in devcontainer.json — no CMD needed here.
