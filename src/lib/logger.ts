// src/utils/logger.ts

import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = logLevels[config.logLevel as LogLevel] || 1;

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (logLevels["debug"] >= currentLevel) {
      console.log(`[DEBUG] ${message}`, data ?? "");
    }
  },

  info: (message: string, data?: unknown) => {
    if (logLevels["info"] >= currentLevel) {
      console.log(`[INFO] ${message}`, data ?? "");
    }
  },

  warn: (message: string, data?: unknown) => {
    if (logLevels["warn"] >= currentLevel) {
      console.warn(`[WARN] ${message}`, data ?? "");
    }
  },

  error: (message: string, error?: unknown) => {
    if (logLevels["error"] >= currentLevel) {
      console.error(`[ERROR] ${message}`, error ?? "");
    }
  },
};
