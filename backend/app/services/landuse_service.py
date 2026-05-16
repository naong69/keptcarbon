import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from fastapi import HTTPException
from pathlib import Path
from app.core.constants import REGION_CONFIG


class LanduseService:
    def __init__(self):
        self.target_crs = "EPSG:32647"
        self._lu_registry = {}

        for p_code, cfg in REGION_CONFIG.items():
            file_path = Path(f"app/data/shp/LU/{cfg['lu_vector']}")
            if file_path.exists():
                gdf = gpd.read_file(file_path)
                if gdf.crs != self.target_crs:
                    gdf = gdf.to_crs(self.target_crs)
                self._lu_registry[p_code] = gdf
                print(f"Loaded Landuse Vector for P_CODE: {p_code}")
            else:
                print(f"Warning: Landuse vector file not found for P_CODE: {p_code}")

    # ── Existing endpoint (/api/estimate) ─────────────────────────────────────

    def find_rubber_cultivation_area(self, poly_data: dict):
        """Filter A302 rubber parcels intersecting the drawn polygon."""
        p_code = poly_data.get("province_code")
        lu_gdf = self._lu_registry.get(p_code)

        if lu_gdf is None:
            poly_data["a302_geometry"] = None
            poly_data["status"] = {
                "status": "error", "status_code": "E02",
                "message": (
                    "RUBBER PLANTATION DATA NOT AVAILABLE FOR THE SPECIFIED "
                    f"PROVINCE. (P_CODE: {p_code})"
                )
            }
            return poly_data

        try:
            plantation_geom = shape(poly_data["geometry"])
            plantation_gdf = gpd.GeoDataFrame(
                index=[0], crs="EPSG:4326", geometry=[plantation_geom]
            ).to_crs(self.target_crs)

            if lu_gdf.crs != self.target_crs:
                lu_gdf = lu_gdf.to_crs(self.target_crs)

            intersected = gpd.overlay(plantation_gdf, lu_gdf, how="intersection")
            rubber_areas = intersected[
                intersected["LU_CODE"].astype(str).str.contains("A302", na=False)
            ]

            if rubber_areas.empty:
                poly_data["a302_geometry"] = None
                poly_data["status"] = {
                    "status": "error", "status_code": "E03",
                    "message": "NO VALID RUBBER CULTIVATION AREA (A302) FOUND WITHIN THE DRAWN POLYGON."
                }
                return poly_data

            poly_data["a302_geometry"] = mapping(unary_union(rubber_areas.geometry.tolist()))
            poly_data["status"] = {
                "status": "success", "status_code": "S02",
                "message": "VALID RUBBER CULTIVATION AREA (A302) FOUND WITHIN THE DRAWN POLYGON."
            }
            return poly_data

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Landuse filtering failed: {str(e)}")

    # ── New endpoint (/api/v1/plantation-info) ────────────────────────────────

    def find_lu_class_area(self, poly_data: dict):
        """Classify all land use types within the drawn polygon using spatial indexing."""
        p_code = poly_data.get("province_code")
        lu_gdf = self._lu_registry.get(p_code)

        if lu_gdf is None:
            poly_data["lu_polygon"] = []
            poly_data["status"] = {
                "status": "error", "status_code": "E02",
                "message": f"LAND USE DATA NOT AVAILABLE FOR PROVINCE. (P_CODE: {p_code})"
            }
            return poly_data

        try:
            plantation_geom = shape(poly_data["geometry"])
            plantation_gdf = gpd.GeoDataFrame(
                index=[0], crs="EPSG:4326", geometry=[plantation_geom]
            ).to_crs(self.target_crs)

            target_geom = plantation_gdf.geometry.iloc[0]
            total_area_m2 = target_geom.area

            # Fast spatial index pre-filter then precise intersection
            possible_matches_idx = lu_gdf.sindex.query(target_geom, predicate="intersects")
            lu_candidates = lu_gdf.iloc[possible_matches_idx].copy()

            if lu_candidates.empty:
                poly_data["lu_polygon"] = []
                poly_data["total_area_m2"] = round(total_area_m2, 4)
                return poly_data

            lu_candidates["geometry"] = lu_candidates.geometry.intersection(target_geom)
            lu_candidates = lu_candidates[~lu_candidates.geometry.is_empty]

            def determine_group(row):
                l1 = str(row["LUL1_CODE"]).upper()
                if l1 in ["U", "F", "M", "W"]:
                    return l1
                if l1 == "A":
                    return str(row["LU_CODE"])
                return "OTHER"

            lu_candidates["group_key"] = lu_candidates.apply(determine_group, axis=1)
            merged_gdf = lu_candidates.dissolve(by="group_key")

            lu_classes_result = []
            for group_key, row in merged_gdf.iterrows():
                geom = row.geometry
                if group_key == "U":
                    desc_th, desc_en = "สิ่งปลูกสร้าง", "Urban/Built-up Area"
                elif group_key == "F":
                    desc_th, desc_en = "ป่าไม้", "Forest"
                elif group_key == "W":
                    desc_th, desc_en = "แหล่งน้ำผิวดิน", "Water Body"
                elif group_key == "M":
                    desc_th, desc_en = "พื้นที่อื่น ๆ", "Miscellaneous Area"
                else:
                    desc_th = row.get("LU_DES_TH", "N/A")
                    desc_en = row.get("LU_DES_EN", "N/A")

                area_m2 = geom.area
                percent = (area_m2 / total_area_m2 * 100) if total_area_m2 > 0 else 0
                lu_classes_result.append({
                    "lu_class": group_key,
                    "lu_class_desc_th": desc_th,
                    "lu_class_desc_en": desc_en,
                    "geometry": mapping(geom),
                    "area_m2": round(area_m2, 4),
                    "area_percent": round(percent, 2),
                })

            poly_data["lu_polygon"] = lu_classes_result
            poly_data["total_area_m2"] = round(total_area_m2, 4)
            poly_data["status"] = {
                "status": "success", "status_code": "S02",
                "message": "LAND USE CLASSIFICATION AND AREA CALCULATION COMPLETED."
            }
            return poly_data

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LAND USE CLASS ANALYSIS FAILED: {str(e)}")
