import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, '../public/muffle.svg');
const publicDir = path.join(__dirname, '../public');

async function generateIcons() {
  console.log('Generating icons from muffle.svg...');
  const svgBuffer = fs.readFileSync(svgPath);

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
    console.log(`  Generated icon-${size}.png`);
  }

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon.png'));
  console.log('  Generated icon.png (512x512)');

  console.log('Icon generation complete!');
}

generateIcons().catch(console.error);
