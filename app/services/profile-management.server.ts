export type ProfileAddressType = "primary" | "secondary";

export type ProfileAddress = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
};

export type UserProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addresses: Partial<Record<ProfileAddressType, ProfileAddress>>;
};

export type ProfileUpdateResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

type ProfileInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addresses: Record<ProfileAddressType, ProfileAddress>;
};

export async function getUserProfile(db: D1Database, userId: number): Promise<UserProfile | null> {
  const user = await db.prepare(
    `SELECT first_name AS firstName, last_name AS lastName, email, phone
     FROM users WHERE id = ?`,
  ).bind(userId).first<{ firstName: string | null; lastName: string | null; email: string; phone: string | null }>();
  if (!user) return null;

  const { results } = await db.prepare(
    `SELECT address_type AS addressType, address_line_1 AS addressLine1,
            address_line_2 AS addressLine2, city, state, postal_code AS postalCode
     FROM user_addresses WHERE user_id = ? AND address_type IN ('primary', 'secondary')`,
  ).bind(userId).all<{ addressType: ProfileAddressType; addressLine1: string; addressLine2: string | null; city: string; state: string; postalCode: string }>();

  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    phone: user.phone ?? "",
    addresses: Object.fromEntries(results.map((address) => [address.addressType, {
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
    }])) as UserProfile["addresses"],
  };
}

export function profileInputFromForm(form: FormData): ProfileInput {
  return {
    firstName: text(form, "firstName"),
    lastName: text(form, "lastName"),
    email: text(form, "email").toLowerCase(),
    phone: text(form, "phone"),
    addresses: {
      primary: addressFromForm(form, "primary"),
      secondary: addressFromForm(form, "secondary"),
    },
  };
}

export async function updateUserProfile(
  db: D1Database,
  input: ProfileInput,
  user: { id: number; authUserId: string; email: string },
): Promise<ProfileUpdateResult> {
  const errors = validate(input);
  if (errors.length > 0) return { ok: false, errors };

  const identity = await db.prepare('SELECT id FROM "user" WHERE id = ?').bind(user.authUserId).first<{ id: string }>();
  if (!identity) return { ok: false, errors: ["Your linked sign-in identity is unavailable. Contact an administrator."] };

  const duplicateApplicationUser = await db.prepare(
    "SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?",
  ).bind(input.email, user.id).first<{ id: number }>();
  if (duplicateApplicationUser) return { ok: false, errors: ["That email address is already used by another account."] };

  const duplicateIdentity = await db.prepare(
    'SELECT id FROM "user" WHERE LOWER(email) = LOWER(?) AND id != ?',
  ).bind(input.email, user.authUserId).first<{ id: string }>();
  if (duplicateIdentity) return { ok: false, errors: ["That email address is already used by another account."] };

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?`,
    ).bind(input.firstName, input.lastName, input.email, input.phone || null, user.id),
    db.prepare(
      'UPDATE "user" SET name = ?, email = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(`${input.firstName} ${input.lastName}`, input.email, user.authUserId),
    ...addressStatements(db, user.id, input.addresses),
  ];

  // The application user, Better Auth identity, and addresses commit together.
  await db.batch(statements);
  return { ok: true, message: "Your profile has been saved." };
}

function addressStatements(db: D1Database, userId: number, addresses: Record<ProfileAddressType, ProfileAddress>) {
  return (Object.entries(addresses) as Array<[ProfileAddressType, ProfileAddress]>).map(([type, address]) => {
    if (!hasAddress(address)) {
      return db.prepare("DELETE FROM user_addresses WHERE user_id = ? AND address_type = ?").bind(userId, type);
    }
    return db.prepare(
      `INSERT INTO user_addresses (user_id, address_type, address_line_1, address_line_2, city, state, postal_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, address_type) DO UPDATE SET
         address_line_1 = excluded.address_line_1,
         address_line_2 = excluded.address_line_2,
         city = excluded.city,
         state = excluded.state,
         postal_code = excluded.postal_code,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(userId, type, address.addressLine1, address.addressLine2 || null, address.city, address.state, address.postalCode);
  });
}

function validate(input: ProfileInput) {
  const errors: string[] = [];
  if (!input.firstName) errors.push("First name is required.");
  if (!input.lastName) errors.push("Last name is required.");
  if (!/^\S+@\S+\.\S+$/.test(input.email)) errors.push("Enter a valid email address.");
  for (const [type, address] of Object.entries(input.addresses)) {
    if (hasAddress(address) && (!address.addressLine1 || !address.city || !address.state || !address.postalCode)) {
      errors.push(`${type === "primary" ? "Primary" : "Secondary"} address needs a line 1, city, state, and ZIP/postal code.`);
    }
  }
  return errors;
}

function hasAddress(address: ProfileAddress) {
  return Object.values(address).some(Boolean);
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function addressFromForm(form: FormData, prefix: ProfileAddressType): ProfileAddress {
  return {
    addressLine1: text(form, `${prefix}AddressLine1`),
    addressLine2: text(form, `${prefix}AddressLine2`),
    city: text(form, `${prefix}City`),
    state: text(form, `${prefix}State`),
    postalCode: text(form, `${prefix}PostalCode`),
  };
}
