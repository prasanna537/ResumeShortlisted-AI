/** Writes the 5 sample resumes as PDFs to tests/fixtures/pdfs for manual upload testing: npm run samples:pdf */
import fs from "fs";
import path from "path";
import { candidates } from "./candidates";
import { makePdf, resumeText } from "./pdf";

(async () => {
  const dir = path.resolve(__dirname, "pdfs");
  fs.mkdirSync(dir, { recursive: true });
  for (const c of candidates) {
    fs.writeFileSync(path.join(dir, `${c.key}.pdf`), await makePdf(resumeText(c.resume)));
    console.log("wrote", `${c.key}.pdf`, "-", c.label);
  }
})();
