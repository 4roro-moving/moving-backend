import { randomBytes, timingSafeEqual } from "node:crypto";

const OAUTH_STATE_BYTE_LENGTH = 32;

/*
 * OAuth CSRF 방어를 위한 state를 생성한다.
 */
export const createOAuthState = (): string => {
  return randomBytes(OAUTH_STATE_BYTE_LENGTH).toString("base64url");
};

/*
 * OAuth state가 일치하는지 검증한다.
 */
export const validateOAuthState = (
  receivedState: string,
  storedState: string | undefined,
): boolean => {
  if (!storedState) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedState);
  const storedBuffer = Buffer.from(storedState);

  if (receivedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, storedBuffer);
};
