import { createHmac } from "node:crypto";

const getTokenHashSecret = (): string => {
  const tokenHashSecret = process.env.TOKEN_HASH_SECRET;

  if (!tokenHashSecret) {
    throw new Error("TOKEN_HASH_SECRET environment variable is not set");
  }

  return tokenHashSecret;
};

export const tokenHash = (token: string): string => {
  return createHmac("sha256", getTokenHashSecret()).update(token).digest("hex");
};
