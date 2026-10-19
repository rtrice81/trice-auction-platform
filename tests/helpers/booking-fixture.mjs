import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";

// Execute the actual services and SQL against an isolated SQLite database.
// The adapter supplies D1's API and transactional batch semantics.
const moduleUrls = new Map();
export async function moduleUrl(url) {
  if (moduleUrls.has(url.href)) return moduleUrls.get(url.href);
  let code = transpileModule(await readFile(url, "utf8"), {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX },
  }).outputText;
  for (const match of [...code.matchAll(/from "([^"]+)"/g)]) {
    if (!match[1].startsWith(".")) {
      code = code.replace(match[0], `from "${import.meta.resolve(match[1])}"`);
      continue;
    }
    let dependency = new URL(match[1], url);
    if (!/\.(js|tsx?)$/.test(dependency.pathname)) {
      const extension = [".ts", ".tsx", ".js"].find(extension => existsSync(new URL(`${match[1]}${extension}`, url)));
      dependency = new URL(`${match[1]}${extension}`, url);
    }
    const resolved = /\.tsx?$/.test(dependency.pathname) ? await moduleUrl(dependency) : dependency.href;
    code = code.replace(match[0], `from "${resolved}"`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  moduleUrls.set(url.href, result);
  return result;
}

const { createBooking, validateBooking, promoteWaitlistedAppointment } = await import(await moduleUrl(new URL("../../app/services/booking.server.ts", import.meta.url)));
const { getAppointmentOverrideHistory, recordAppointmentOverrideAudit } = await import(await moduleUrl(new URL("../../app/services/appointment-override-audit.server.ts", import.meta.url)));
const { getCustomerBookingEvents } = await import(await moduleUrl(new URL("../../app/services/booking-event.server.ts", import.meta.url)));
const migrationsUrl = new URL("../../migrations/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationsUrl)).filter(name => name.endsWith(".sql")).sort().map(name => readFile(new URL(name, migrationsUrl), "utf8")));
export const appointmentDate = `${new Date().getUTCFullYear() + 1}-10-07`;
export const override = { allowCapacityOverride: true, actorUserId: 1 };

export function fixture(t, { dailyCapacity = 20, areaCapacity = 20, overflow = 20 } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  for (const migration of migrations) sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO users (id, email) VALUES (1, 'admin@example.test'), (2, 'customer@example.test'), (3, 'other@example.test'), (4, 'manager@example.test'), (5, 'employee@example.test');
    INSERT INTO user_roles (user_id, role) VALUES (1, 'admin'), (2, 'consignor'), (3, 'consignor'), (4, 'manager'), (5, 'employee');
    UPDATE settings SET value = '10' WHERE key = 'monthly_booking_limit';
    INSERT INTO booking_events (id, name, opens_at, closes_at, active, timestamp_storage_version)
      VALUES (1, 'Test signup', '2000-01-01T00:00:00Z', '2099-01-01T00:00:00Z', 1, 2);
  `);
  sqlite.prepare("INSERT INTO dropoff_days (id, dropoff_date, capacity_points, is_open, visibility) VALUES (1, ?, ?, 1, 'public')").run(appointmentDate, dailyCapacity);
  sqlite.exec("INSERT INTO booking_event_dropoff_dates (booking_event_id, dropoff_day_id) VALUES (1, 1)");
  sqlite.prepare("UPDATE item_areas SET normal_capacity_points = ?, overflow_allowance_points = ?").run(areaCapacity, overflow);

  const db = {
    sqlite,
    beforeBatch: null,
    prepare(sql) {
      let parameters = [];
      const statement = {
        bind(...values) { parameters = values; return this; },
        execute() {
          const prepared = sqlite.prepare(sql);
          if (prepared.columns().length) return { results: prepared.all(...parameters), meta: { changes: 0 } };
          const result = prepared.run(...parameters);
          return { results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
        async first() { return this.execute().results[0] ?? null; },
        async all() { return this.execute(); },
        async run() { return this.execute(); },
      };
      return statement;
    },
    async batch(statements) {
      this.beforeBatch?.();
      this.beforeBatch = null;
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  function addAppointment(status = "waitlisted", points = 10, userId = 2, date = appointmentDate) {
    const loadType = sqlite.prepare("SELECT id FROM dropoff_types WHERE capacity_points = ?").get(points);
    const result = sqlite.prepare(`INSERT INTO appointments
      (user_id, appointment_date, appointment_time, dropoff_type_id, description, status, admin_notes, waitlisted_at, waitlist_reason)
      VALUES (?, ?, '10:30', ?, 'Furniture and boxes', ?, 'Keep these notes', '2026-09-01 12:00:00', 'Original waitlist reason')`).run(userId, date, loadType.id, status);
    const id = Number(result.lastInsertRowid);
    sqlite.prepare("INSERT INTO appointment_area_allocations VALUES (?, 1, 100, ?), (?, 2, 0, 0), (?, 3, 0, 0)").run(id, points, id, id);
    return id;
  }
  function input(appointmentId) {
    return { userId: 2, appointmentId, appointmentDate, dropoffTypeId: 1, description: "Furniture and boxes", allocations: [{ itemAreaId: 1, percentage: 100 }, { itemAreaId: 2, percentage: 0 }, { itemAreaId: 3, percentage: 0 }] };
  }
  function snapshot(id) {
    return {
      appointment: { ...sqlite.prepare("SELECT * FROM appointments WHERE id = ?").get(id) },
      allocations: sqlite.prepare("SELECT * FROM appointment_area_allocations WHERE appointment_id = ? ORDER BY item_area_id").all(id).map(row => ({ ...row })),
    };
  }
  return { db, sqlite, addAppointment, input, snapshot };
}


export { createBooking, validateBooking, promoteWaitlistedAppointment, getAppointmentOverrideHistory, recordAppointmentOverrideAudit, getCustomerBookingEvents };
