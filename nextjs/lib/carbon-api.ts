/**
 * Carbon estimation API service
 * Calls the real backend API instead of using mockup calculations
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8080";

export interface PlantationPolygon {
    id: string;
    geometry: GeoJSON.Geometry;
    year_of_planting?: number | null;
    rubber_clone?: string | null;
    tree_count?: number | null;
    spacing_system?: string | null;
}

export interface StatusMessage {
    status: string;
    status_code: string;
    message: string;
}

export interface YearlyEstimate {
    year: number;
    total_carbon_tCO2e: number;
    ci_lower_tCO2e: number;
    ci_upper_tCO2e: number;
}

export interface EstimationResponse {
    polygon_id: string;
    status: StatusMessage;
    carbon_profile?: YearlyEstimate[] | null;
}

export interface LUPolygon {
    lu_class: string;
    lu_class_desc_th: string | null;
    lu_class_desc_en: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number;
    area_percent: number;
}

export interface PlantationInfoResponse {
    polygon_id: string;
    province_code: string | null;
    geometry: GeoJSON.Geometry;
    area_m2: number | null;
    status: StatusMessage;
    lu_polygon: LUPolygon[] | null;
}

/**
 * Estimate carbon for plantation polygons using the backend API
 * @param polygons Array of plantation polygons with geometry and optional parameters
 * @returns Array of estimation responses with yearly carbon profiles
 */
export async function estimateCarbon(
    polygons: PlantationPolygon[]
): Promise<EstimationResponse[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/estimate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(polygons),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `Backend API error: ${response.status} ${JSON.stringify(errorData)}`
            );
        }

        const data: EstimationResponse[] = await response.json();
        return data;
    } catch (error) {
        console.error("Carbon estimation API error:", error);
        throw error;
    }
}

/**
 * Get land use classification and province for a drawn polygon
 */
export async function getPlantationInfo(polygon: {
    id: string;
    geometry: GeoJSON.Geometry;
    project_type?: string | null;
}): Promise<PlantationInfoResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/plantation-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(polygon),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Backend API error: ${response.status} ${JSON.stringify(err)}`);
    }
    return response.json();
}

/**
 * Get the current year in Buddhist Era (BE)
 * @returns Current year in BE
 */
export function getCurrentYearBE(): number {
    return new Date().getFullYear() + 543;
}
