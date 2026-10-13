-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('SKILL', 'EXPERIENCE', 'PROJECT', 'EDUCATION', 'CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('VERIFIED', 'PARTIAL', 'UNVERIFIED', 'CONTRADICTED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('RESUME', 'GITHUB', 'LINKEDIN', 'LEETCODE');

-- CreateEnum
CREATE TYPE "ProfileProvider" AS ENUM ('GITHUB', 'LINKEDIN', 'LEETCODE');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('OFFICIAL_API', 'CANDIDATE_PROVIDED', 'EXPORT');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('REQUIRED', 'PREFERRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('UPLOADED', 'PARSING', 'EXTRACTING_CLAIMS', 'COLLECTING_EVIDENCE', 'GENERATING_EMBEDDINGS', 'VERIFYING', 'MATCHING_JD', 'CALCULATING_SCORE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShortlistDecision" AS ENUM ('SHORTLISTED', 'REJECTED', 'REVIEW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "experienceYears" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "education" TEXT,
    "responsibilities" TEXT[],
    "keywords" TEXT[],
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequirement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "skill" TEXT NOT NULL,
    "canonicalSkill" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "recruiterNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "structuredData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeClaim" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "sourceLocation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "canonicalSkill" TEXT,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "sourceUrl" TEXT,
    "evidenceType" TEXT NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "canonicalSkill" TEXT,
    "metadata" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "githubRepoId" TEXT,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalProfile" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "provider" "ProfileProvider" NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT,
    "origin" "DataOrigin" NOT NULL DEFAULT 'CANDIDATE_PROVIDED',
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "rawData" JSONB,
    "collectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubProfile" (
    "id" TEXT NOT NULL,
    "externalProfileId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "bio" TEXT,
    "publicRepos" INTEGER NOT NULL,
    "followers" INTEGER,
    "accountCreatedAt" TIMESTAMP(3),
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubRepository" (
    "id" TEXT NOT NULL,
    "githubProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "languages" JSONB,
    "topics" TEXT[],
    "readmeExcerpt" TEXT,
    "isFork" BOOLEAN NOT NULL DEFAULT false,
    "repoCreatedAt" TIMESTAMP(3),
    "repoPushedAt" TIMESTAMP(3),
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvidence" (
    "verificationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION,

    CONSTRAINT "VerificationEvidence_pkey" PRIMARY KEY ("verificationId","evidenceId")
);

-- CreateTable
CREATE TABLE "CandidateScore" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "components" JSONB NOT NULL,
    "weightsUsed" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "ShortlistDecision" NOT NULL DEFAULT 'SHORTLISTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'UPLOADED',
    "error" TEXT,
    "warnings" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");

-- CreateIndex
CREATE INDEX "JobRequirement_jobId_idx" ON "JobRequirement"("jobId");

-- CreateIndex
CREATE INDEX "JobRequirement_canonicalSkill_idx" ON "JobRequirement"("canonicalSkill");

-- CreateIndex
CREATE INDEX "Candidate_userId_idx" ON "Candidate"("userId");

-- CreateIndex
CREATE INDEX "Candidate_jobId_idx" ON "Candidate"("jobId");

-- CreateIndex
CREATE INDEX "Resume_candidateId_idx" ON "Resume"("candidateId");

-- CreateIndex
CREATE INDEX "ResumeClaim_candidateId_idx" ON "ResumeClaim"("candidateId");

-- CreateIndex
CREATE INDEX "ResumeClaim_resumeId_idx" ON "ResumeClaim"("resumeId");

-- CreateIndex
CREATE INDEX "ResumeClaim_canonicalSkill_idx" ON "ResumeClaim"("canonicalSkill");

-- CreateIndex
CREATE INDEX "Evidence_candidateId_idx" ON "Evidence"("candidateId");

-- CreateIndex
CREATE INDEX "Evidence_source_idx" ON "Evidence"("source");

-- CreateIndex
CREATE INDEX "Evidence_canonicalSkill_idx" ON "Evidence"("canonicalSkill");

-- CreateIndex
CREATE INDEX "ExternalProfile_candidateId_idx" ON "ExternalProfile"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProfile_candidateId_provider_key" ON "ExternalProfile"("candidateId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProfile_externalProfileId_key" ON "GithubProfile"("externalProfileId");

-- CreateIndex
CREATE INDEX "GithubProfile_username_idx" ON "GithubProfile"("username");

-- CreateIndex
CREATE INDEX "GithubRepository_githubProfileId_idx" ON "GithubRepository"("githubProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_claimId_key" ON "VerificationResult"("claimId");

-- CreateIndex
CREATE INDEX "VerificationResult_candidateId_idx" ON "VerificationResult"("candidateId");

-- CreateIndex
CREATE INDEX "VerificationResult_verdict_idx" ON "VerificationResult"("verdict");

-- CreateIndex
CREATE INDEX "VerificationEvidence_evidenceId_idx" ON "VerificationEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "CandidateScore_candidateId_idx" ON "CandidateScore"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateScore_jobId_idx" ON "CandidateScore"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Shortlist_candidateId_key" ON "Shortlist"("candidateId");

-- CreateIndex
CREATE INDEX "Shortlist_userId_idx" ON "Shortlist"("userId");

-- CreateIndex
CREATE INDEX "AnalysisJob_candidateId_idx" ON "AnalysisJob"("candidateId");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeClaim" ADD CONSTRAINT "ResumeClaim_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeClaim" ADD CONSTRAINT "ResumeClaim_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "GithubRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalProfile" ADD CONSTRAINT "ExternalProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProfile" ADD CONSTRAINT "GithubProfile_externalProfileId_fkey" FOREIGN KEY ("externalProfileId") REFERENCES "ExternalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_githubProfileId_fkey" FOREIGN KEY ("githubProfileId") REFERENCES "GithubProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ResumeClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "VerificationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateScore" ADD CONSTRAINT "CandidateScore_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
