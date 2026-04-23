// Run: node extension/create-icons.cjs
// Creates the required PNG icon files for the Chrome extension.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function makePNG(size) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 4);
    raw[offset] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 4;
      // Pipa purple: #6366f1
      raw[px] = 99;
      raw[px + 1] = 102;
      raw[px + 2] = 241;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (let i = 0; i < typeData.length; i++) {
      crc ^= typeData[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, typeData, crcBuf]);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(__dirname, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach((size) => {
  const filepath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filepath, makePNG(size));
  console.log(`Created ${filepath} (${size}x${size})`);
});

console.log("Done! Icons ready.");
