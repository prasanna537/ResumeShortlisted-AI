CREATE INDEX "Evidence_embedding_hnsw" ON "Evidence" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "ResumeClaim_embedding_hnsw" ON "ResumeClaim" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "JobRequirement_embedding_hnsw" ON "JobRequirement" USING hnsw ("embedding" vector_cosine_ops);
