import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { demoSessionMiddleware } from "./surgeair/demo-session";

const app: Express = express();
// Exactly one trusted reverse-proxy hop; do not trust arbitrary client-sent IP headers.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(demoSessionMiddleware);

app.use("/api", router);

// Never serialize framework exceptions, provider errors or stack traces to visitors.
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  logger.warn({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Demo request failed");
  const badInput = error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
  response.status(badInput ? 400 : 503).json({
    error: badInput ? "Please check your request and try again." : "The demo is temporarily unavailable. Please try again later.",
  });
});

export default app;
