import { describe, expect, it } from "vitest";
import { canonicalSkill, normalizeSkillExact } from "../../src/services/skillNormalizer";
import { detectSkills } from "../../src/services/skillDetection";

describe("skill normalization", () => {
  it.each([
    ["React", "react"], ["React.js", "react"], ["ReactJS", "react"],
    ["Node", "nodejs"], ["Node.js", "nodejs"], ["NodeJS", "nodejs"],
    ["Mongo", "mongodb"], ["MongoDB", "mongodb"],
    ["Express", "expressjs"], ["Express.js", "expressjs"],
    ["Python", "python"], ["Python 3", "python"],
    ["REST API", "restapi"], ["RESTful APIs", "restapi"],
  ])("%s -> %s", (raw, canon) => {
    expect(canonicalSkill(raw)).toBe(canon);
  });
  it("is case/whitespace insensitive", () => {
    expect(canonicalSkill("  NODE.JS ")).toBe("nodejs");
  });
  it("gives unknown skills a stable slug and no exact match", () => {
    expect(normalizeSkillExact("Frobnicator")).toBeNull();
    expect(canonicalSkill("Frobnicator X")).toBe("frobnicatorx");
  });
});

describe("skill detection in free text", () => {
  it("finds skills with word boundaries", () => {
    expect(detectSkills("React-based ecommerce frontend using Node.js and MongoDB")).toEqual(
      expect.arrayContaining(["react", "nodejs", "mongodb"]),
    );
  });
  it("does not match inside other words or ambiguous short aliases", () => {
    expect(detectSkills("We reacted to the go-getter attitude")).toEqual([]);
  });
});
