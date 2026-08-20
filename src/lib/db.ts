import { sql } from '@vercel/postgres';

export async function logUsageTelemetry(
  department: string,
  course: string,
  toggles: any,
  wishList: string,
  degradation: boolean
) {
  try {
    const result = await sql`
      INSERT INTO usage_statistics (department_name, course_code, policy_toggles, anonymized_wish_list, degradation_triggered)
      VALUES (${department}, ${course}, ${JSON.stringify(toggles)}, ${wishList}, ${degradation})
      RETURNING id;
    `;
    return result.rows[0];
  } catch (error) {
    console.error("Telemetry Logging Error:", error);
    // Suppress error in local dev if DB isn't linked yet
    return { id: "local-dev-id" };
  }
}