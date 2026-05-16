"""
Province detection via spatial index (sindex) — faster than full overlay.
"""
import geopandas as gpd
from shapely.geometry import shape
from fastapi import HTTPException
from pathlib import Path


class ProvinceService:
    def __init__(self):
        self.file_path = Path("app/data/shp/TH_PROVINCE.gpkg")
        self.target_crs = "EPSG:32647"

        if self.file_path.exists():
            try:
                self._provinces_gdf = gpd.read_file(self.file_path).to_crs(self.target_crs)
            except Exception as e:
                self._provinces_gdf = None
                raise HTTPException(
                    status_code=500,
                    detail=f"FAILED TO LOAD PROVINCE BOUNDARIES: {str(e)}"
                )
        else:
            self._provinces_gdf = None
            print("Warning: Provincial boundary file not found.")

    def get_province(self, poly_data: dict):
        if self._provinces_gdf is None:
            raise HTTPException(status_code=500, detail="PROVINCE BOUNDARY FILE NOT FOUND.")

        try:
            plantation_geom = shape(poly_data["geometry"])
            plantation_gdf = gpd.GeoDataFrame(
                index=[0], crs="EPSG:4326", geometry=[plantation_geom]
            ).to_crs(self.target_crs)

            target_geom = plantation_gdf.geometry.iloc[0]
            poly_data["total_area_m2"] = round(target_geom.area, 4)

            # Fast spatial index query — only evaluate precise intersection on candidates
            possible_matches_index = self._provinces_gdf.sindex.query(
                target_geom, predicate="intersects"
            )
            candidates = self._provinces_gdf.iloc[possible_matches_index]

            if candidates.empty:
                poly_data["province_code"] = None
                poly_data["status"] = {
                    "status": "error", "status_code": "E01",
                    "message": "DRAWN POLYGON DOES NOT INTERSECT WITH ANY SUPPORTED THAI PROVINCES."
                }
                return poly_data

            # Pick the province with the largest intersection area
            best_match = None
            max_intersect_area = 0.0
            for _, prov_row in candidates.iterrows():
                inter_geom = target_geom.intersection(prov_row.geometry)
                if not inter_geom.is_empty and inter_geom.area > max_intersect_area:
                    max_intersect_area = inter_geom.area
                    best_match = prov_row

            if best_match is None:
                poly_data["province_code"] = None
                poly_data["status"] = {
                    "status": "error", "status_code": "E01",
                    "message": "NO VALID INTERSECTION FOUND."
                }
                return poly_data

            poly_data["province_code"] = str(best_match["P_CODE"])
            poly_data["status"] = {
                "status": "success", "status_code": "S01",
                "message": f"EXTRACT P_CODE: {poly_data['province_code']} SUCCESSFULLY."
            }
            return poly_data

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"PROVINCE IDENTIFICATION FAILED: {str(e)}"
            )
