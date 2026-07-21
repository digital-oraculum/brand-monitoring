import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredTokens } from "../types.js";

export class TokenStore {
  constructor(private readonly path: string) {}

  load(): StoredTokens | null {
    const fromEnv = process.env.TOKENS_JSON;
    if (fromEnv) {
      try {
        return JSON.parse(fromEnv) as StoredTokens;
      } catch {
        return null;
      }
    }

    if (!existsSync(this.path)) {
      return null;
    }

    try {
      const raw = readFileSync(this.path, "utf-8");
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  save(tokens: StoredTokens): void {
    if (process.env.VERCEL) {
      // Na Vercel ustaw TOKENS_JSON w zmiennych środowiskowych (persist poza runtime).
      return;
    }

    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.path, JSON.stringify(tokens, null, 2), "utf-8");
  }

  clear(): void {
    if (existsSync(this.path)) {
      writeFileSync(this.path, "", "utf-8");
    }
  }

  isAuthenticated(): boolean {
    const tokens = this.load();
    return Boolean(tokens?.refreshToken);
  }
}
