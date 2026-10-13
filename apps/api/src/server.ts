import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { logger } from "./utils/logger";

const env = loadEnv();
createApp().listen(env.API_PORT, () => logger.info(`API listening on :${env.API_PORT}`));
