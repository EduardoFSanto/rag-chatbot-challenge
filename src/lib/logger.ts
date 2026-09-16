import "dotenv/config";

type LogLevel = "debug" | "info" | "warn" | "error";

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel = process.env.LOG_LEVEL as LogLevel | undefined;

const currentLevel =
  configuredLevel && configuredLevel in logLevels
    ? logLevels[configuredLevel]
    : logLevels.info;

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (logLevels.debug >= currentLevel) {
      console.log(`[DEBUG] ${message}`, data ?? "");
    }
  },

  info: (message: string, data?: unknown) => {
    if (logLevels.info >= currentLevel) {
      console.log(`[INFO] ${message}`, data ?? "");
    }
  },

  warn: (message: string, data?: unknown) => {
    if (logLevels.warn >= currentLevel) {
      console.warn(`[WARN] ${message}`, data ?? "");
    }
  },

  error: (message: string, error?: unknown) => {
    if (logLevels.error >= currentLevel) {
      console.error(`[ERROR] ${message}`, error ?? "");
    }
  },
};