export type Customer = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  phone: string | null;
  consignorNumber: string | null;
  active: boolean;
  authUserId: string | null;
};

export function customerInputFromForm(form: FormData) {
  const submittedRoles = form.getAll("roles").map(String);
  return {
    firstName: String(form.get("firstName") ?? "").trim(),
    lastName: String(form.get("lastName") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    phone: String(form.get("phone") ?? "").trim(),
    // This remains text so identifiers such as 001234 retain their leading zeroes.
    consignorNumber: String(form.get("consignorNumber") ?? "").trim(),
    active: form.has("active"),
    // Inline appointment creation is always for a consignor and predates the
    // role chooser; preserve that workflow while the user form offers all roles.
    roles: submittedRoles.length ? submittedRoles : ["consignor"],
    temporaryPassword: String(form.get("temporaryPassword") ?? ""),
  };
}

export function validateNewCustomer(input: ReturnType<typeof customerInputFromForm>) {
  const errors: string[] = [];
  if (!input.firstName) errors.push("First name is required.");
  if (!input.lastName) errors.push("Last name is required.");
  if (!/^\S+@\S+\.\S+$/.test(input.email)) errors.push("Enter a valid email address.");
  if (!input.phone) errors.push("Phone number is required.");
  if (input.temporaryPassword.length < 8) errors.push("Temporary password must be at least 8 characters.");
  if (!input.roles.length || !input.roles.every((role) => ["consignor", "employee", "manager", "admin", "bidder"].includes(role))) errors.push("Choose at least one supported role.");
  return errors;
}

export async function getCustomerByEmail(db: D1Database, email: string) {
  return db.prepare(customerSelectSql("WHERE LOWER(email) = LOWER(?)")).bind(email).first<CustomerRow>().then(toCustomer);
}

export async function getCustomerById(db: D1Database, id: number) {
  return db.prepare(customerSelectSql("WHERE id = ?")).bind(id).first<CustomerRow>().then(toCustomer);
}

export async function searchCustomers(db: D1Database, query: string) {
  const value = query.trim();
  const pattern = `%${value}%`;
  const { results } = await db.prepare(customerSelectSql(`WHERE ? = '' OR LOWER(email) LIKE LOWER(?) OR LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) LIKE LOWER(?) OR phone LIKE ? OR LOWER(COALESCE(consignor_id, '')) LIKE LOWER(?) ORDER BY name COLLATE NOCASE ASC LIMIT 50`)).bind(value, pattern, pattern, pattern, pattern).all<CustomerRow>();
  return results.map(toCustomer).filter((customer): customer is Customer => customer !== null);
}

export async function createCustomerApplicationUser(
  db: D1Database,
  input: Omit<ReturnType<typeof customerInputFromForm>, "temporaryPassword">,
  authUserId: string,
) {
  const result = await db.prepare(
    `INSERT INTO users (email, first_name, last_name, phone, consignor_id, role, auth_user_id, active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 'customer', ?, ?, 1)`,
  ).bind(input.email, input.firstName, input.lastName, input.phone, input.consignorNumber || null, authUserId, input.active ? 1 : 0).run();
  const userId = Number(result.meta.last_row_id);
  await db.batch([...new Set(input.roles)].map((role) => db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").bind(userId, role)));
  return userId;
}

type CustomerRow = Omit<Customer, "active"> & { active: number };

function customerSelectSql(where: string) {
  return `SELECT id, first_name AS firstName, last_name AS lastName,
    COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name,
    email, phone, consignor_id AS consignorNumber, active, auth_user_id AS authUserId
    FROM users ${where}`;
}

function toCustomer(row: CustomerRow | null): Customer | null {
  return row ? { ...row, active: row.active === 1 } : null;
}
