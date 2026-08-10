import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";

import express, { type RequestHandler } from "express";

import { AppError } from "../lib/app-error";

import errorHandler from "./error-handler";
import {
  adminLoginAccountRateLimiter,
  adminLoginIpRateLimiter,
  userLoginAccountRateLimiter,
  userLoginIpRateLimiter,
} from "./auth-rate-limit.middleware";

type LoginResponseBody = {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
};

type LoginAttemptResult = {
  status: number;
  body: LoginResponseBody;
};

const SUCCESS_PASSWORD = "correct-password";
const FAILURE_PASSWORD = "wrong-password";

let ipCounter = 1;

/**
 * 테스트마다 고유한 IPv4 주소를 순차적으로 생성한다.
 *
 * Rate Limiter의 MemoryStore가 테스트 간 유지되므로
 * 랜덤 IP 충돌로 이전 테스트의 카운터를 상속하지 않도록 한다.
 */
function createUniqueIpv4(): string {
  const ip = `203.0.113.${ipCounter}`;

  ipCounter += 1;

  return ip;
}

function createMockLoginHandler(): RequestHandler {
  return (req, res) => {
    if (req.body?.password === SUCCESS_PASSWORD) {
      res.status(200).json({ success: true });
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      },
    });
  };
}

function createRateLimitTestApp(ipLimiter: RequestHandler, accountLimiter: RequestHandler) {
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json());
  app.post("/login", ipLimiter, accountLimiter, createMockLoginHandler());
  app.use(errorHandler);

  return app;
}

async function startServer(
  app: express.Express,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));

    instance.on("error", reject);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "테스트 서버 주소를 확인할 수 없습니다.",
    });
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function attemptLogin(
  baseUrl: string,
  options: {
    ip: string;
    email: string;
    password?: string;
  },
): Promise<LoginAttemptResult> {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": options.ip,
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password ?? FAILURE_PASSWORD,
    }),
  });

  const body = (await response.json()) as LoginResponseBody;

  return {
    status: response.status,
    body,
  };
}

async function repeatFailedLogins(
  baseUrl: string,
  options: {
    ip: string;
    count: number;
    email?: string | ((index: number) => string);
  },
): Promise<LoginAttemptResult[]> {
  const results: LoginAttemptResult[] = [];

  for (let index = 0; index < options.count; index += 1) {
    const email =
      typeof options.email === "function"
        ? options.email(index)
        : (options.email ?? `user-${randomUUID()}@example.com`);

    results.push(
      await attemptLogin(baseUrl, {
        ip: options.ip,
        email,
      }),
    );
  }

  return results;
}

describe("auth rate limit middleware", () => {
  describe("admin login account rate limit (IP + normalized email)", () => {
    let baseUrl = "";
    let closeServer: (() => Promise<void>) | undefined;

    before(async () => {
      const app = createRateLimitTestApp(adminLoginIpRateLimiter, adminLoginAccountRateLimiter);
      const server = await startServer(app);

      baseUrl = server.baseUrl;
      closeServer = server.close;
    });

    after(async () => {
      await closeServer?.();
    });

    it("returns auth failure responses until the limit, then TOO_MANY_REQUESTS", async () => {
      const ip = createUniqueIpv4();
      const email = `admin-${randomUUID()}@example.com`;

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const result = await attemptLogin(baseUrl, {
          ip,
          email,
        });

        assert.equal(result.status, 401, `attempt ${attempt} should remain an auth failure`);
        assert.equal(result.body.error?.code, "UNAUTHORIZED");
      }

      const blocked = await attemptLogin(baseUrl, {
        ip,
        email,
      });

      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
    });

    it("treats trimmed and differently cased emails as the same account key", async () => {
      const ip = createUniqueIpv4();
      const emailVariants = [
        "  Admin.User@Example.COM  ",
        "admin.user@example.com",
        "ADMIN.USER@EXAMPLE.COM",
        " admin.user@example.com ",
        "Admin.User@Example.com",
      ];

      for (const email of emailVariants) {
        const result = await attemptLogin(baseUrl, {
          ip,
          email,
        });

        assert.equal(result.status, 401);
        assert.equal(result.body.error?.code, "UNAUTHORIZED");
      }

      const blocked = await attemptLogin(baseUrl, {
        ip,
        email: "admin.user@example.com",
      });

      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
    });

    it("does not share account counters across different emails on the same IP", async () => {
      const ip = createUniqueIpv4();
      const firstEmail = `admin-first-${randomUUID()}@example.com`;
      const secondEmail = `admin-second-${randomUUID()}@example.com`;

      const firstEmailResults = await repeatFailedLogins(baseUrl, {
        ip,
        count: 5,
        email: firstEmail,
      });

      assert.equal(
        firstEmailResults.every((result) => result.status === 401),
        true,
      );

      const blockedForFirstEmail = await attemptLogin(baseUrl, {
        ip,
        email: firstEmail,
      });

      assert.equal(blockedForFirstEmail.status, 429);
      assert.equal(blockedForFirstEmail.body.error?.code, "TOO_MANY_REQUESTS");

      const secondEmailFirstAttempt = await attemptLogin(baseUrl, {
        ip,
        email: secondEmail,
      });

      assert.equal(secondEmailFirstAttempt.status, 401);
      assert.equal(secondEmailFirstAttempt.body.error?.code, "UNAUTHORIZED");
    });

    it("does not count successful login attempts toward the account limit", async () => {
      const ip = createUniqueIpv4();
      const email = `admin-success-${randomUUID()}@example.com`;

      for (let index = 0; index < 10; index += 1) {
        const success = await attemptLogin(baseUrl, {
          ip,
          email,
          password: SUCCESS_PASSWORD,
        });

        assert.equal(success.status, 200);
        assert.equal(success.body.success, true);
      }

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const failure = await attemptLogin(baseUrl, {
          ip,
          email,
        });

        assert.equal(failure.status, 401, `failed attempt ${attempt} should still be allowed`);
        assert.equal(failure.body.error?.code, "UNAUTHORIZED");
      }

      const blocked = await attemptLogin(baseUrl, {
        ip,
        email,
      });

      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
    });
  });

  describe("admin login IP rate limit", () => {
    it("returns TOO_MANY_REQUESTS after 20 failed requests from the same IP", async () => {
      const app = createRateLimitTestApp(adminLoginIpRateLimiter, adminLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();

      try {
        const failures = await repeatFailedLogins(server.baseUrl, {
          ip,
          count: 20,
          email: (index) => `admin-ip-${index}-${randomUUID()}@example.com`,
        });

        assert.equal(
          failures.every((result) => result.status === 401),
          true,
        );

        const blocked = await attemptLogin(server.baseUrl, {
          ip,
          email: `admin-ip-blocked-${randomUUID()}@example.com`,
        });

        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
      } finally {
        await server.close();
      }
    });
  });

  describe("user login account rate limit (IP + normalized email)", () => {
    it("returns TOO_MANY_REQUESTS after 10 failed requests for the same IP and email", async () => {
      const app = createRateLimitTestApp(userLoginIpRateLimiter, userLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();
      const email = `user-${randomUUID()}@example.com`;

      try {
        const failures = await repeatFailedLogins(server.baseUrl, {
          ip,
          count: 10,
          email,
        });

        assert.equal(
          failures.every((result) => result.status === 401),
          true,
        );

        const blocked = await attemptLogin(server.baseUrl, {
          ip,
          email,
        });

        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
      } finally {
        await server.close();
      }
    });

    it("treats trimmed and differently cased emails as the same account key", async () => {
      const app = createRateLimitTestApp(userLoginIpRateLimiter, userLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();

      try {
        for (let index = 0; index < 10; index += 1) {
          const email = index % 2 === 0 ? "  User@Example.COM  " : "user@example.com";

          const result = await attemptLogin(server.baseUrl, {
            ip,
            email,
          });

          assert.equal(result.status, 401);
        }

        const blocked = await attemptLogin(server.baseUrl, {
          ip,
          email: "USER@example.com",
        });

        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
      } finally {
        await server.close();
      }
    });

    it("does not share account counters across different emails on the same IP", async () => {
      const app = createRateLimitTestApp(userLoginIpRateLimiter, userLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();
      const firstEmail = `user-first-${randomUUID()}@example.com`;
      const secondEmail = `user-second-${randomUUID()}@example.com`;

      try {
        await repeatFailedLogins(server.baseUrl, {
          ip,
          count: 10,
          email: firstEmail,
        });

        const blockedForFirstEmail = await attemptLogin(server.baseUrl, {
          ip,
          email: firstEmail,
        });

        assert.equal(blockedForFirstEmail.status, 429);

        const secondEmailFirstAttempt = await attemptLogin(server.baseUrl, {
          ip,
          email: secondEmail,
        });

        assert.equal(secondEmailFirstAttempt.status, 401);
        assert.equal(secondEmailFirstAttempt.body.error?.code, "UNAUTHORIZED");
      } finally {
        await server.close();
      }
    });

    it("does not count successful login attempts toward the account limit", async () => {
      const app = createRateLimitTestApp(userLoginIpRateLimiter, userLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();
      const email = `user-success-${randomUUID()}@example.com`;

      try {
        for (let index = 0; index < 10; index += 1) {
          const success = await attemptLogin(server.baseUrl, {
            ip,
            email,
            password: SUCCESS_PASSWORD,
          });

          assert.equal(success.status, 200);
        }

        const failures = await repeatFailedLogins(server.baseUrl, {
          ip,
          count: 10,
          email,
        });

        assert.equal(
          failures.every((result) => result.status === 401),
          true,
        );

        const blocked = await attemptLogin(server.baseUrl, {
          ip,
          email,
        });

        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
      } finally {
        await server.close();
      }
    });
  });

  describe("user login IP rate limit", () => {
    it("returns TOO_MANY_REQUESTS after 50 failed requests from the same IP", async () => {
      const app = createRateLimitTestApp(userLoginIpRateLimiter, userLoginAccountRateLimiter);
      const server = await startServer(app);
      const ip = createUniqueIpv4();

      try {
        const failures = await repeatFailedLogins(server.baseUrl, {
          ip,
          count: 50,
          email: (index) => `user-ip-${index}-${randomUUID()}@example.com`,
        });

        assert.equal(
          failures.every((result) => result.status === 401),
          true,
        );

        const blocked = await attemptLogin(server.baseUrl, {
          ip,
          email: `user-ip-blocked-${randomUUID()}@example.com`,
        });

        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error?.code, "TOO_MANY_REQUESTS");
      } finally {
        await server.close();
      }
    });
  });
});
