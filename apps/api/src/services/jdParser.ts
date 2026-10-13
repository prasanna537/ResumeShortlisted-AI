import { generateStructured } from "../ai/gemini";
import { jdExtractionPrompt, SAFETY } from "../ai/prompts";
import { jdSchema, type ParsedJd } from "../ai/schemas";

export async function parseJobDescription(text: string): Promise<ParsedJd> {
  const parsed = await generateStructured(jdSchema, jdExtractionPrompt(text.slice(0, 20_000)), SAFETY);
  const lower = new Set(parsed.requiredSkills.map((s) => s.toLowerCase()));
  // A skill cannot be both required and preferred.
  parsed.preferredSkills = parsed.preferredSkills.filter((s) => !lower.has(s.toLowerCase()));
  return parsed;
}
