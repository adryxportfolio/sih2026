/**
 * POST /functions/v1/admin-users
 *
 * Administrator provisioning of officer accounts.
 *
 * WHY OFFICERS DO NOT SELF-REGISTER
 * ─────────────────────────────────────────────────────────────────────────
 * This is an internal government workforce system. Anyone with the APK must
 * not be able to create themselves an account and appear in a ministry's
 * competency statistics. An administrator creates the account against a
 * verified employee ID, so every competency record is tied to a real post
 * from the first login rather than to whoever typed an email address.
 *
 * Accounts are created pre-confirmed — there is no verification email. In a
 * department, the admin handing over credentials IS the verification step,
 * and waiting on an inbox that may be a shared departmental address is a
 * reliable way to block a training rollout.
 *
 * SECURITY
 * The service-role key can create any user and read any row, so the first
 * thing this function does — before touching a single input — is verify from
 * the caller's own JWT that they hold the admin role. The role is read
 * server-side from the database, never from anything the client sent.
 *
 * actions: create · list · reset_password · deactivate · reactivate
 */
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { adminClient, userClient, requireUser } from "../_shared/supabase.ts";

/** Reject anyone who is not an admin. Role comes from the DB, not the request. */
async function requireAdmin(req: Request): Promise<{ id: string; orgId: string | null }> {
  const user = await requireUser(req);
  const admin = adminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw new Response(JSON.stringify({ error: "Profile not found" }), { status: 403 });
  }
  if (data.role !== "admin") {
    throw new Response(
      JSON.stringify({ error: "Administrator role required for this operation." }),
      { status: 403 },
    );
  }
  return { id: user.id, orgId: data.organization_id ?? null };
}

/** Readable, typeable, unambiguous. No 0/O or 1/l/I. */
function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const caller = await requireAdmin(req);
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list");

    // ── LIST ────────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data, error } = await admin
        .from("v_admin_officer_overview")
        .select("*")
        .order("presence", { ascending: true })
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(Number(body.limit) || 200);

      if (error) return errorResponse("Could not list officers", 500, error.message);
      return jsonResponse({ officers: data ?? [] });
    }

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const employeeCode = String(body.employee_code ?? "").trim().toUpperCase();
      const designation = body.designation ? String(body.designation).trim() : null;
      const jobRoleCode = body.job_role_code ? String(body.job_role_code).trim() : null;
      const yearsOfService = body.years_of_service != null ? Number(body.years_of_service) : null;
      const role = ["learner", "trainer", "nodal_officer", "admin"].includes(String(body.role))
        ? String(body.role) : "learner";

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return errorResponse("A valid email address is required.", 400);
      }
      if (fullName.length < 2) {
        return errorResponse("Full name is required.", 400);
      }
      if (!employeeCode) {
        return errorResponse("Employee ID is required — it is how the officer is identified in the department.", 400);
      }

      // Employee ID must be unique; catching it here gives a usable message
      // instead of a raw constraint violation.
      const { data: clash } = await admin
        .from("profiles").select("id, full_name")
        .eq("employee_code", employeeCode).maybeSingle();
      if (clash) {
        return errorResponse(
          `Employee ID ${employeeCode} is already assigned to ${clash.full_name ?? "another officer"}.`,
          409,
        );
      }

      const password = body.password ? String(body.password) : generatePassword();
      if (password.length < 8) {
        return errorResponse("Password must be at least 8 characters.", 400);
      }

      // Pre-confirmed: the admin handing over credentials is the verification.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, employee_code: employeeCode },
      });

      if (createErr || !created?.user) {
        const msg = createErr?.message ?? "User creation failed";
        return errorResponse(
          /already/i.test(msg) ? `An account already exists for ${email}.` : msg,
          /already/i.test(msg) ? 409 : 500,
        );
      }

      // Resolve the FRAC role so the competency profile is live immediately.
      let jobRoleId: string | null = null;
      if (jobRoleCode) {
        const { data: jr } = await admin
          .from("job_roles").select("id").eq("code", jobRoleCode).maybeSingle();
        jobRoleId = jr?.id ?? null;
      }

      // handle_new_user() already inserted the profile row; fill in the rest.
      const { error: profileErr } = await admin
        .from("profiles")
        .update({
          full_name: fullName,
          employee_code: employeeCode,
          designation,
          job_role_id: jobRoleId,
          years_of_service: Number.isFinite(yearsOfService) ? yearsOfService : null,
          organization_id: body.organization_id ?? caller.orgId,
          role,
          must_change_password: !body.password,
          provisioned_by: caller.id,
          provisioned_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", created.user.id);

      if (profileErr) {
        // Don't leave a half-created account behind.
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        return errorResponse("Could not complete the officer profile", 500, profileErr.message);
      }

      // Gap seeding is handled by the profiles_seed_gaps trigger, which fires
      // on any path that assigns a FRAC role — provisioning, onboarding, or a
      // later transfer. Doing it here instead would leave the other two paths
      // producing officers with no measurable profile.

      return jsonResponse({
        created: true,
        user_id: created.user.id,
        email,
        employee_code: employeeCode,
        // Returned once, here, so the admin can hand it over. Never stored in
        // plaintext and never retrievable again.
        temporary_password: body.password ? null : password,
        must_change_password: !body.password,
      });
    }

    // ── RESET PASSWORD ──────────────────────────────────────────────────────
    if (action === "reset_password") {
      const userId = String(body.user_id ?? "");
      if (!userId) return errorResponse("user_id is required", 400);

      const password = generatePassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return errorResponse("Password reset failed", 500, error.message);

      await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
      return jsonResponse({ reset: true, temporary_password: password });
    }

    // ── DEACTIVATE / REACTIVATE ─────────────────────────────────────────────
    if (action === "deactivate" || action === "reactivate") {
      const userId = String(body.user_id ?? "");
      if (!userId) return errorResponse("user_id is required", 400);
      if (userId === caller.id) {
        return errorResponse("You cannot deactivate your own administrator account.", 400);
      }

      const active = action === "reactivate";
      const { error } = await admin
        .from("profiles").update({ is_active: active }).eq("id", userId);
      if (error) return errorResponse("Update failed", 500, error.message);

      // Ban rather than delete — the competency history is a service record
      // and must survive the account being switched off.
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : "876000h",
      }).catch(() => {});

      return jsonResponse({ user_id: userId, is_active: active });
    }

    return errorResponse(`Unknown action "${action}".`, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin-users] unhandled", err);
    return errorResponse("Admin operation failed", 500, (err as Error)?.message);
  }
});
