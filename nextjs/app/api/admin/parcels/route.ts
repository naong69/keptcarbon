import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

async function isAdmin(request: NextRequest) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) return false;
    const payload = verifyToken(token);
    if (!payload) return false;
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [payload.userId]);
    return result.rows[0]?.role === "admin";
}

/**
 * GET /api/admin/parcels
 * Query params:
 *   province, amphoe_t, tambon (optional text filters)
 *   grow_year_min, grow_year_max (optional year range)
 *   limit (max 2000, default 500)
 *   offset (default 0)
 */
export async function GET(request: NextRequest) {
    if (!(await isAdmin(request))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const province = sp.get("province")?.trim() || null;
    const amphoe_t = sp.get("amphoe_t")?.trim() || null;
    const tambon = sp.get("tambon")?.trim() || null;
    const growYearMin = sp.get("grow_year_min") ? Number(sp.get("grow_year_min")) : null;
    const growYearMax = sp.get("grow_year_max") ? Number(sp.get("grow_year_max")) : null;
    const limit = Math.min(Number(sp.get("limit") ?? 500), 2000);
    const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (province) {
        params.push(province);
        conditions.push(`province ILIKE $${params.length}`);
    }
    if (amphoe_t) {
        params.push(amphoe_t);
        conditions.push(`amphoe_t ILIKE $${params.length}`);
    }
    if (tambon) {
        params.push(tambon);
        conditions.push(`tambon ILIKE $${params.length}`);
    }
    if (growYearMin !== null && !isNaN(growYearMin)) {
        params.push(growYearMin);
        conditions.push(`grow_year >= $${params.length}`);
    }
    if (growYearMax !== null && !isNaN(growYearMax)) {
        params.push(growYearMax);
        conditions.push(`grow_year <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM rubber_plots ${where}`,
            params,
        );
        const total: number = countResult.rows[0]?.total ?? 0;

        params.push(limit, offset);
        const dataResult = await pool.query(
            `SELECT id, farm_name, farm_idc, app_no, land_seq,
              tambon, amphoe_t, province,
              grow_year, rip_type, rubber_age, grow_area,
              ST_AsGeoJSON(geom)::json AS geometry
       FROM rubber_plots
       ${where}
       ORDER BY province, amphoe_t, tambon, id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params,
        );

        const features = dataResult.rows.map((row: Record<string, unknown>) => {
            const { geometry: g, ...properties } = row;
            const geometry = typeof g === "string" ? JSON.parse(g) : g;
            return { type: "Feature" as const, geometry, properties };
        });

        return NextResponse.json({ features, total, limit, offset });
    } catch (err) {
        console.error("Admin parcels list error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * GET /api/admin/parcels/filters  — distinct values for filter dropdowns
 * Handled via separate searchParams key to avoid route conflict.
 */
