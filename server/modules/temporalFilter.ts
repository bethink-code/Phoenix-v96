// PRD §4.3 Temporal Filter — session/day-of-week gating. Pure functions.
// Consumed by the strategy engine before entries are evaluated.

export type Session = "asia" | "london" | "newyork" | "none";

interface SessionWindow {
  session: Session;
  startUtcHour: number;
  endUtcHour: number;
}

// Approximate session boundaries in UTC. Configurable per tenant via
// tenant_configs.temporal_rules; these are the engine defaults.
const DEFAULT_SESSIONS: SessionWindow[] = [
  { session: "asia", startUtcHour: 0, endUtcHour: 8 },
  { session: "london", startUtcHour: 7, endUtcHour: 16 },
  { session: "newyork", startUtcHour: 13, endUtcHour: 21 },
];

export function currentSession(now = new Date()): Session {
  const hour = now.getUTCHours();
  const match = DEFAULT_SESSIONS.find(
    (s) => hour >= s.startUtcHour && hour < s.endUtcHour
  );
  return match?.session ?? "none";
}

export interface TemporalRules {
  enabledSessions: Session[];
  enabledDaysOfWeek: number[]; // 0=Sun..6=Sat
  weekendMode: "off" | "restricted" | "full";
}

export const DEFAULT_TEMPORAL_RULES: TemporalRules = {
  enabledSessions: ["london", "newyork"],
  enabledDaysOfWeek: [1, 2, 3, 4, 5],
  weekendMode: "off",
};

export function temporalFilterOpen(
  rules: TemporalRules,
  now = new Date()
): { open: boolean; reason?: string } {
  const day = now.getUTCDay();
  const session = currentSession(now);

  if (!rules.enabledDaysOfWeek.includes(day)) {
    return { open: false, reason: `day_${day}_not_enabled` };
  }
  if ((day === 0 || day === 6) && rules.weekendMode === "off") {
    return { open: false, reason: "weekend_mode_off" };
  }
  if (!rules.enabledSessions.includes(session)) {
    return { open: false, reason: `session_${session}_not_enabled` };
  }
  return { open: true };
}
