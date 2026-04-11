import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { startBotRunner } from "./modules/botRunner";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const isProd = process.env.NODE_ENV === "production";

// Accept APP_URL with or without www so CORS doesn't reject one variant.
const appUrl = process.env.APP_URL ?? "";
const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:5173",
  appUrl,
  appUrl.includes("://www.") ? appUrl.replace("://www.", "://") : appUrl.replace("://", "://www."),
].filter((s) => s && s.length > 0) as string[];

app.use(
  helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

if (isProd) {
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS blocked"));
      },
      credentials: true,
    })
  );
} else {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api",
  rateLimit({
    // 1000 req per 15 min per IP. Generous enough for an active dev
    // session with multiple polling tabs (Dashboard + Experiments +
    // Autoresearch all poll their endpoints), tight enough that a
    // malicious actor still can't flood.
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

setupAuth(app);
registerRoutes(app);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV,
    paperTrading: process.env.PAPER_TRADING_MODE === "true",
  });
});

app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[error]", err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: isProd ? "internal_error" : err.message,
    });
  }
);

app.listen(PORT, () => {
  console.log(`[phoenix-v96] server listening on :${PORT}`);
  console.log(
    `[phoenix-v96] paper-trading=${process.env.PAPER_TRADING_MODE} env=${process.env.NODE_ENV}`
  );
  startBotRunner();
});
