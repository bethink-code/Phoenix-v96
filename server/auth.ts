import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "./db";
import { storage } from "./storage";
import { audit } from "./auditLog";

const PgStore = connectPgSimple(session);

export function setupAuth(app: Express) {
  const required = [
    "SESSION_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "APP_URL",
  ];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`${k} not set`);
  }

  const isProd = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: `${process.env.APP_URL}/auth/callback`,
      },
      async (_access, _refresh, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: "no_email" });

          const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
          const isSeedAdmin = email === adminEmail;

          if (!isSeedAdmin) {
            const invited = await storage.isEmailInvited(email);
            if (!invited) {
              audit({
                action: "login_denied",
                resourceType: "user",
                resourceId: email,
                outcome: "denied",
                detail: { reason: "not_invited" },
              });
              return done(null, false, { message: "not_invited" });
            }
          }

          const user = await storage.upsertUserFromGoogle({
            email,
            firstName: profile.name?.givenName,
            lastName: profile.name?.familyName,
            profileImageUrl: profile.photos?.[0]?.value,
          });

          if (user.isSuspended) {
            audit({
              userId: user.id,
              action: "login_denied",
              outcome: "denied",
              detail: { reason: "suspended" },
            });
            return done(null, false, { message: "suspended" });
          }

          audit({
            userId: user.id,
            action: "login",
            outcome: "success",
          });
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err as Error);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());

  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  // In dev, the React app lives on the Vite dev server (5173); in prod it's
  // served from the same origin as the API, so "/" is correct.
  const clientBase = isProd ? "/" : "http://localhost:5173/";
  app.get(
    "/auth/callback",
    passport.authenticate("google", {
      failureRedirect: `${clientBase}?error=auth_failed`,
    }),
    (_req, res) => res.redirect(clientBase)
  );

  app.post("/auth/logout", (req, res, next) => {
    const uid = (req.user as any)?.id;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        audit({ userId: uid, action: "logout", outcome: "success" });
        res.json({ ok: true });
      });
    });
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ error: "unauthorized" });
}

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (user?.isAdmin) return next();
  return res.status(403).json({ error: "forbidden" });
}
