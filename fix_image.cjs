const { Jimp } = require('jimp');

async function makeTransparent() {
  const imagePath = 'src/assets/meteor/meteor_01.png';
  try {
    const image = await Jimp.read(imagePath);
    // Replace white-ish colors with transparent
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const red   = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue  = this.bitmap.data[idx + 2];
      const alpha = this.bitmap.data[idx + 3];

      // If the pixel is close to white, make it fully transparent
      if (red > 240 && green > 240 && blue > 240) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0
      } else if (red > 200 && green > 200 && blue > 200) {
        // Semi-transparent for edges
        this.bitmap.data[idx + 3] = 128;
      }
    });

    await image.write(imagePath);
    console.log('Image background removed successfully.');
  } catch (err) {
    console.error(err);
  }
}

makeTransparent();
