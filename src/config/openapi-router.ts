import type { Router } from "express";
import type { ZodObject } from "zod";

import { VALIDATION_SCHEMAS } from "../middlewares/validate";
import type { SchemaCarrier, ValidationSchemas } from "../middlewares/validate";
import { registry } from "./openapi";

export type EndpointDoc = {
  summary: string;
  description?: string;
  responses?: Record<number, string>;
};

type RegisterOptions = {
  basePath: string;
  tag: string;
  endpoints: Record<string, EndpointDoc>;
  headers?: ZodObject;
  commonResponses?: Record<number, string>;
};

const SUPPORTED_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

type ExtractedRoute = {
  method: SupportedMethod;
  routePath: string;
  schemas: ValidationSchemas;
};

function isSupportedMethod(value: string): value is SupportedMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(value);
}

type RouteLayerHandler = {
  method?: string;
  handle: SchemaCarrier;
};

type RouteLayer = {
  route?: {
    path: string;
    stack: RouteLayerHandler[];
  };
};

function extractRoutes(router: Router): ExtractedRoute[] {
  const stack = (router as unknown as { stack?: RouteLayer[] }).stack ?? [];
  const routes: ExtractedRoute[] = [];

  for (const layer of stack) {
    const route = layer.route;

    if (!route) {
      continue;
    }

    const schemasByMethod = new Map<SupportedMethod, ValidationSchemas>();
    const methodsSeen = new Set<SupportedMethod>();

    for (const entry of route.stack) {
      const method = entry.method;

      if (method === undefined || !isSupportedMethod(method)) {
        continue;
      }

      methodsSeen.add(method);

      const schemas = entry.handle[VALIDATION_SCHEMAS];

      if (schemas) {
        schemasByMethod.set(method, schemas);
      }
    }

    for (const method of methodsSeen) {
      routes.push({
        method,
        routePath: route.path,
        schemas: schemasByMethod.get(method) ?? {},
      });
    }
  }

  return routes;
}

function toOpenApiPath(basePath: string, routePath: string): string {
  const joined = routePath === "/" ? basePath : `${basePath}${routePath}`;

  return joined.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function registerRouterDocs(router: Router, options: RegisterOptions): void {
  const { basePath, tag, endpoints, headers, commonResponses = {} } = options;

  const routes = extractRoutes(router);
  const documented = new Set<string>();

  for (const route of routes) {
    const key = `${route.method.toUpperCase()} ${route.routePath}`;
    const doc = endpoints[key];

    if (!doc) {
      console.warn(`[openapi] 문서 설명이 없어 건너뜁니다: ${tag} ${key}`);

      continue;
    }

    documented.add(key);

    const responses: Record<number, { description: string }> = {};

    for (const [status, description] of Object.entries({
      ...commonResponses,
      ...doc.responses,
    })) {
      responses[Number(status)] = { description };
    }

    registry.registerPath({
      method: route.method,
      path: toOpenApiPath(basePath, route.routePath),
      tags: [tag],
      summary: doc.summary,
      ...(doc.description !== undefined && { description: doc.description }),
      request: {
        ...(headers !== undefined && { headers }),
        ...(route.schemas.params !== undefined && { params: route.schemas.params }),
        ...(route.schemas.query !== undefined && { query: route.schemas.query }),
        ...(route.schemas.body !== undefined && {
          body: {
            required: true,
            content: {
              "application/json": { schema: route.schemas.body },
            },
          },
        }),
      },
      responses,
    });
  }

  for (const key of Object.keys(endpoints)) {
    if (!documented.has(key)) {
      console.warn(`[openapi] 라우터에 없는 경로입니다: ${tag} ${key}`);
    }
  }
}
