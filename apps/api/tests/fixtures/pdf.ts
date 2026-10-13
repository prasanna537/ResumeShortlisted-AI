import PDFDocument from "pdfkit";
import type { ParsedResume } from "../../src/ai/schemas";

export function resumeText(r: ParsedResume): string {
  return [
    r.name ?? "",
    r.email ?? "",
    "SKILLS: " + r.skills.join(", "),
    ...r.experience.map((e) => `EXPERIENCE: ${e.title} at ${e.company} (${e.startDate} - ${e.endDate}). ${e.description}`),
    ...r.projects.map((p) => `PROJECT ${p.name}: ${p.description}. Technologies: ${p.technologies.join(", ")}`),
    ...r.education.map((e) => `EDUCATION: ${e.degree} ${e.field}, ${e.institution}, ${e.year}`),
    r.githubUrl ? `GitHub: ${r.githubUrl}` : "",
  ].join("\n");
}

export function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(11).text(text);
    doc.end();
  });
}
