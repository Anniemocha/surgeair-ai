import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  createSurgeAirStore,
  type SurgeAirStore,
} from "./domain";

declare global {
  namespace Express {
    interface Request {
      surgeAirStore: SurgeAirStore;
    }
  }
}

const SESSION_COOKIE = "surgeair_demo_session";
const sessions = new Map<string, SurgeAirStore>();
const processSecret = randomBytes(32).toString("base64url");

function secret() {
  return process.env.SESSION_SECRET?.trim() || processSecret;
}

function sign(id: string) {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

function validSession(value: string | undefined) {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = sign(id);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return id;
}

function newSessionId() {
  return randomBytes(32).toString("base64url");
}

function readCookie(request: Request) {
  const header = request.get("cookie");
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return validSession(value);
}

function setCookie(response: Response, id: string) {
  const attributes = [
    `${SESSION_COOKIE}=${id}.${sign(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", `${attributes.join("; ")};`);
}

export function demoSessionMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  let id = readCookie(request);
  let store = id ? sessions.get(id) : undefined;
  if (!id || !store) {
    id = newSessionId();
    store = createSurgeAirStore();
    sessions.set(id, store);
    setCookie(response, id);
  }
  request.surgeAirStore = store;

  response.once("finish", () => {
    sessions.set(id!, store!);
  });
  next();
}

export function isSameOriginRequest(request: Request) {
  const origin = request.get("origin");
  const referer = request.get("referer");
  if (!origin && !referer) return true;
  const forwardedProtocol =
    request.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    request.protocol;
  const expectedOrigin = `${forwardedProtocol}://${request.get("host")}`;
  if (origin) return origin === expectedOrigin;
  try {
    return new URL(referer!).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function resetDemoSessionsForTests() {
  sessions.clear();
}
