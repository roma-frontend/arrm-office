import { createWorker } from "tesseract.js";
import fs from "fs";

const pdfPath = "C:/Users/User/Downloads/Scanned Document.pdf";
const pdfData = fs.readFileSync(pdfPath);

const jpegStart = pdfData.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
const jpegEnd = pdfData.lastIndexOf(Buffer.from([0xff, 0xd9]));
const jpegData = pdfData.subarray(jpegStart, jpegEnd + 2);
fs.writeFileSync("page_1.jpg", jpegData);

const worker = await createWorker("eng+rus");

// Try different PSM modes
const modes = [
  { psm: 3, name: "Auto (PSM3)" },
  { psm: 6, name: "Block (PSM6)" },
  { psm: 11, name: "Sparse (PSM11)" },
];

for (const mode of modes) {
  console.log(`\n=== ${mode.name} ===`);
  await worker.setParameters({
    tessedit_pageseg_mode: String(mode.psm),
  });
  const { data: { text } } = await worker.recognize("page_1.jpg");
  console.log(text);
}

await worker.terminate();
