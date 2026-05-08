"""
This class uses geopandas to perform a spatial intersection between 
the user-drawn polygon and the provincial boundaries.
"""
import geopandas as gpd
from shapely.geometry import shape
from fastapi import HTTPException
from pathlib import Path


class ProvinceService:
    def __init__(self):
        self.file_path = Path("app/data/shp/TH_PROVINCE.gpkg")
        self.target_crs = "EPSG:32647"

    def get_province(self, poly_data: dict):
        if not self.file_path.exists():
            raise HTTPException(
                status_code=500,
                detail="PROVINCE BOUNDARY FILE NOT FOUND."
            )

        try:
            provinces_gdf = gpd.read_file(self.file_path)

            # GeoJSON geometry dict -> Shapely geometry
            plantation_geom = shape(poly_data["geometry"])

            # Create plantation GeoDataFrame
            plantation_gdf = gpd.GeoDataFrame(
                index=[0],
                crs="EPSG:4326",
                geometry=[plantation_geom]
            )

            # Convert CRS
            plantation_gdf = plantation_gdf.to_crs(self.target_crs)

            intersections = gpd.overlay(
                plantation_gdf,
                provinces_gdf,
                how="intersection"
            )

            if intersections.empty:
                poly_data["province_code"] = None
                poly_data["status"] = {
                    "status": "error",
                    "status_code": "E01",
                    "message": "DRAWN POLYGON DOES NOT INTERSECT WITH ANY SUPPORTED THAI PROVINCES."
                }
                return poly_data

            if len(intersections) > 1:
                intersections["inter_area"] = intersections.geometry.area
                best_match = intersections.sort_values(
                    by="inter_area",
                    ascending=False
                ).iloc[0]
            else:
                best_match = intersections.iloc[0]

            poly_data["province_code"] = str(best_match["P_CODE"])
            poly_data["status"] = {
                "status": "success",
                "status_code": "S01",
                "message": f"EXTRACT P_CODE: {poly_data['province_code']} SUCCESSFULLY."
            }

            return poly_data

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"PROVINCE IDENTIFICATION FAILED: {str(e)}"
            )