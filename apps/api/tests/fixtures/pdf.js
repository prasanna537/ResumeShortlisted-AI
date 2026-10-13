"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeText = resumeText;
exports.makePdf = makePdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
function resumeText(r) {
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
function makePdf(text) {
    return new Promise((resolve) => {
        const doc = new pdfkit_1.default();
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.fontSize(11).text(text);
        doc.end();
    });
}
