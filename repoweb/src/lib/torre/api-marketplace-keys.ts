import { createHash, randomBytes } from "node:crypto";

export function generarKeyPrefix(): string {
  return "mk_live_" + randomBytes(4).toString("hex");
}

export function generarApiKey(): {
  keyPlano: string;
  keyHash: string;
  keyPrefix: string;
} {
  const keyPlano = "mk_" + randomBytes(32).toString("base64url");
  const keyHash = createHash("sha256").update(keyPlano).digest("hex");
  const keyPrefix = keyPlano.slice(0, 12) + "...";
  return { keyPlano, keyHash, keyPrefix };
}
