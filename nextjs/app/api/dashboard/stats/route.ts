import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [statsResult, ageResult, bucketsResult, mapResult, bboxResult] =
      await Promise.all([
        // Aggregate totals
        pool.query(`
          SELECT
            COUNT(*)::int AS total_plots,
            COALESCE(SUM(
              COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
              COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
              COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
            ), 0) AS total_area_rai,
            0 AS total_carbon
          FROM rubber_plots
        `),

        // Per-year for line chart
        pool.query(`
          SELECT
            COALESCE(rubber_age, 0)::int AS age,
            0                            AS carbon,
            COUNT(*)::int                AS plot_count
          FROM rubber_plots
          WHERE rubber_age IS NOT NULL
          GROUP BY 1
          ORDER BY 1
        `),

        // Age buckets for donut + horizontal bars
        pool.query(`
          SELECT
            CASE
              WHEN COALESCE(rubber_age, 0) BETWEEN 1 AND 5   THEN '1-5'
              WHEN COALESCE(rubber_age, 0) BETWEEN 6 AND 12  THEN '6-12'
              WHEN COALESCE(rubber_age, 0) BETWEEN 13 AND 18 THEN '13-18'
              WHEN COALESCE(rubber_age, 0) >= 19             THEN '19+'
              ELSE 'ไม่ระบุ'
            END                        AS bucket,
            COUNT(*)::int              AS plot_count,
            0                          AS carbon
          FROM rubber_plots
          GROUP BY 1
          ORDER BY MIN(COALESCE(rubber_age, 0))
        `),

        // Map polygons (limit 2000)
        pool.query(`
          SELECT
            id,
            farm_name,
            amphoe_t,
            (
              COALESCE(NULLIF(split_part(grow_area,'-',1),''),'0')::numeric +
              COALESCE(NULLIF(split_part(grow_area,'-',2),''),'0')::numeric / 4.0 +
              COALESCE(NULLIF(split_part(grow_area,'-',3),''),'0')::numeric / 400.0
            )                                       AS area_rai,
            0                                       AS carbon,
            COALESCE(rubber_age, 0)                 AS age,
            ST_AsGeoJSON(geom)::json                AS geojson
          FROM rubber_plots
          WHERE geom IS NOT NULL
          LIMIT 2000
        `),

        // Bounding box for map fitBounds
        pool.query(`
          SELECT
            ST_XMin(ST_Extent(geom))::float AS min_lng,
            ST_YMin(ST_Extent(geom))::float AS min_lat,
            ST_XMax(ST_Extent(geom))::float AS max_lng,
            ST_YMax(ST_Extent(geom))::float AS max_lat
          FROM rubber_plots
          WHERE geom IS NOT NULL
        `),
      ]);

    const s = statsResult.rows[0] ?? {};
    const totalAreaRai = parseFloat(String(s.total_area_rai ?? 0));
    const totalCarbon = parseFloat(String(s.total_carbon ?? 0));
    const avgCarbonPerRai = totalAreaRai > 0 ? totalCarbon / totalAreaRai : 0;

    const bbox = bboxResult.rows[0] ?? null;

    return NextResponse.json({
      totalPlots: s.total_plots ?? 0,
      totalAreaRai,
      totalCarbon,
      avgCarbonPerRai,
      ageData: ageResult.rows.map((r) => ({
        age: Number(r.age),
        carbon: parseFloat(String(r.carbon)),
        plotCount: Number(r.plot_count),
      })),
      ageBuckets: bucketsResult.rows.map((r) => ({
        bucket: r.bucket,
        plotCount: Number(r.plot_count),
        carbon: parseFloat(String(r.carbon)),
      })),
      mapPlots: mapResult.rows.map((r) => ({
        id: r.id,
        name: r.farm_name ?? "ไม่มีชื่อ",
        amphoe: r.amphoe_t ?? "",
        areaRai: parseFloat(String(r.area_rai)),
        carbonTotal: parseFloat(String(r.carbon)),
        age: Number(r.age),
        geojson: r.geojson,
      })),
      bbox: bbox
        ? {
            minLng: bbox.min_lng,
            minLat: bbox.min_lat,
            maxLng: bbox.max_lng,
            maxLat: bbox.max_lat,
          }
        : null,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
