import type { Role } from "./auth.server";

export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };

export type AppointmentOverrideAuditInput = {
  appointmentId: number;
  actorUserId: number;
  actorRole: Extract<Role, "manager" | "admin">;
  occurredAt?: string;
  reason: string;
  violatedRules: string[];
  previousValues: AuditJson;
  requestedValues: AuditJson;
  capacityContext: AuditJson;
};

export type AppointmentOverrideAuditEntry = {
  id: number;
  appointmentId: number;
  actorUserId: number;
  actorRole: Extract<Role, "manager" | "admin">;
  occurredAt: string;
  reason: string;
  violatedRules: string[];
  previousValues: AuditJson;
  requestedValues: AuditJson;
  capacityContext: AuditJson;
};

type AuditRow = Omit<AppointmentOverrideAuditEntry, "violatedRules" | "previousValues" | "requestedValues" | "capacityContext"> & {
  violatedRulesJson: string;
  previousValuesJson: string;
  requestedValuesJson: string;
  capacityContextJson: string;
};

export async function recordAppointmentOverrideAudit(
  db: D1Database,
  input: AppointmentOverrideAuditInput,
): Promise<number> {
  const result = await createAppointmentOverrideAuditStatement(db, input).run();
  return Number(result.meta.last_row_id);
}

export function createAppointmentOverrideAuditStatement(
  db: D1Database,
  input: AppointmentOverrideAuditInput,
): D1PreparedStatement {
  if (!Number.isInteger(input.appointmentId) || input.appointmentId < 1) {
    throw new Error("A valid appointment ID is required for an override audit entry.");
  }
  if (!Number.isInteger(input.actorUserId) || input.actorUserId < 1) {
    throw new Error("A valid actor user ID is required for an override audit entry.");
  }
  if (!input.reason.trim()) {
    throw new Error("An override audit reason is required.");
  }

  return db
    .prepare(
      `INSERT INTO appointment_override_audits (
        appointment_id,
        actor_user_id,
        actor_role,
        occurred_at,
        reason,
        violated_rules_json,
        previous_values_json,
        requested_values_json,
        capacity_context_json
      ) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.appointmentId,
      input.actorUserId,
      input.actorRole,
      input.occurredAt ?? null,
      input.reason.trim(),
      JSON.stringify(input.violatedRules),
      JSON.stringify(input.previousValues),
      JSON.stringify(input.requestedValues),
      JSON.stringify(input.capacityContext),
    );
}

export async function getAppointmentOverrideHistory(
  db: D1Database,
  appointmentId: number,
): Promise<AppointmentOverrideAuditEntry[]> {
  if (!Number.isInteger(appointmentId) || appointmentId < 1) {
    throw new Error("A valid appointment ID is required to read override history.");
  }

  const { results } = await db
    .prepare(
      `SELECT
        id,
        appointment_id AS appointmentId,
        actor_user_id AS actorUserId,
        actor_role AS actorRole,
        occurred_at AS occurredAt,
        reason,
        violated_rules_json AS violatedRulesJson,
        previous_values_json AS previousValuesJson,
        requested_values_json AS requestedValuesJson,
        capacity_context_json AS capacityContextJson
      FROM appointment_override_audits
      WHERE appointment_id = ?
      ORDER BY occurred_at DESC, id DESC`,
    )
    .bind(appointmentId)
    .all<AuditRow>();

  return results.map(parseAuditRow);
}

function parseAuditRow(row: AuditRow): AppointmentOverrideAuditEntry {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    occurredAt: row.occurredAt,
    reason: row.reason,
    violatedRules: parseJson(row.violatedRulesJson, [] as string[]) as string[],
    previousValues: parseJson(row.previousValuesJson, {}),
    requestedValues: parseJson(row.requestedValuesJson, {}),
    capacityContext: parseJson(row.capacityContextJson, {}),
  };
}

function parseJson(value: string, fallback: AuditJson): AuditJson {
  try {
    return JSON.parse(value) as AuditJson;
  } catch {
    return fallback;
  }
}
