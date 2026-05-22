/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const pngToIco = require("png-to-ico");

const root = path.join(__dirname, "..");
const srcPath = path.join(root, "assets", "icon.png");
const icoPath = path.join(root, "assets", "icon.ico");

async function main() {
  if (!fs.existsSync(srcPath)) {
    console.error("missing:", srcPath);
    process.exit(1);
  }
  const img = await Jimp.read(srcPath);
  const pngBuf = await img.getBufferAsync(Jimp.MIME_PNG);
  const buf = await pngToIco(pngBuf);
  fs.writeFileSync(icoPath, buf);
  console.log("wrote", icoPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
