import { createHash } from "node:crypto";
import { canonico } from "./legal.ts";

export function hashDocumento(body: string) {
  return createHash("sha256").update(canonico(body), "utf8").digest("hex");
}
