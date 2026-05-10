const { Jimp } = require('jimp');

async function removeBackground() {
  const imagePath = 'src/assets/meteor/meteor_01.png';
  try {
    const image = await Jimp.read(imagePath);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const data = image.bitmap.data;

    // We will do a BFS flood fill from all 4 corners.
    // We consider a pixel "background" if it's mostly grey/white (R~G~B) and not too dark.
    // The meteor might have grey, but it's separated from the corners.

    const isBackground = (idx) => {
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      // Check if it's a shade of grey/white (difference between max and min is small)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Checkerboard is usually white and light grey.
      // Let's say if it's > 100 and difference < 30, it might be background.
      // But actually, we can just say if it's > 120 and diff < 40.
      if (max > 120 && (max - min) < 40) return true;
      // Also, if it was already made transparent by previous script:
      if (data[idx+3] === 0) return true;
      return false;
    };

    const visited = new Uint8Array(w * h);
    const queue = [];

    const push = (x, y) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      if (visited[y * w + x]) return;
      const idx = (y * w + x) * 4;
      if (isBackground(idx)) {
        visited[y * w + x] = 1;
        queue.push({x, y});
      }
    };

    // start from corners
    push(0, 0);
    push(w-1, 0);
    push(0, h-1);
    push(w-1, h-1);

    let head = 0;
    while (head < queue.length) {
      const {x, y} = queue[head++];
      // make transparent
      const idx = (y * w + x) * 4;
      data[idx + 0] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0; // alpha 0

      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }

    await image.write(imagePath);
    console.log('Flood fill background removal complete. Processed', head, 'pixels.');
  } catch (err) {
    console.error(err);
  }
}

removeBackground();
