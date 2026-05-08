import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from fastapi import HTTPException
from pathlib import Path
from app.core.constants import REGION_CONFIG


class LanduseService:
    def __init__(self):
        """
        Initializes the Landuse service.
        The Land Development Department (LDD) LULC code for rubber is A302.
        """
        self.target_crs = "EPSG:32647"

    def find_rubber_cultivation_area(self, poly_data: dict):

        p_code = poly_data.get("province_code")

        config = REGION_CONFIG.get(p_code)

        if config is None:
            poly_data["a302_geometry"] = None
            poly_data["status"] = {
                "status": "error",
                "status_code": "E02",
                "message": (
                    "RUBBER PLANTATION DATA NOT AVAILABLE FOR THE SPECIFIED "
                    f"PROVINCE. (P_CODE: {p_code})"
                )
            }
            return poly_data

        self.file_path = Path(f"app/data/shp/LU/{config['lu_vector']}")

        if not self.file_path.exists():
            raise HTTPException(
                status_code=500,
                detail="LANDUSE VECTOR FILE NOT FOUND."
            )

        try:
            # Load LULC data
            lu_gdf = gpd.read_file(self.file_path)

            # GeoJSON geometry -> Shapely geometry
            plantation_geom = shape(poly_data["geometry"])

            # Create plantation GeoDataFrame
            plantation_gdf = gpd.GeoDataFrame(
                index=[0],
                crs="EPSG:4326",
                geometry=[plantation_geom]
            )

            # Convert CRS
            plantation_gdf = plantation_gdf.to_crs(self.target_crs)

            if lu_gdf.crs != self.target_crs:
                lu_gdf = lu_gdf.to_crs(self.target_crs)

            # Spatial intersection
            intersected = gpd.overlay(
                plantation_gdf,
                lu_gdf,
                how="intersection"
            )

            # Filter A302 rubber plantation
            rubber_areas = intersected[
                intersected["LU_CODE"].astype(str).str.contains("A302", na=False)
            ]

            if rubber_areas.empty:
                poly_data["a302_geometry"] = None
                poly_data["status"] = {
                    "status": "error",
                    "status_code": "E03",
                    "message": (
                        "NO VALID RUBBER CULTIVATION AREA (A302) "
                        "FOUND WITHIN THE DRAWN POLYGON."
                    )
                }

                return poly_data

            # Merge polygons
            multipart_geom = unary_union(rubber_areas.geometry.tolist())

            # Store as GeoJSON geometry
            poly_data["a302_geometry"] = mapping(multipart_geom)

            poly_data["status"] = {
                "status": "success",
                "status_code": "S02",
                "message": (
                    "VALID RUBBER CULTIVATION AREA (A302) "
                    "FOUND WITHIN THE DRAWN POLYGON."
                )
            }

            return poly_data

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Landuse filtering failed: {str(e)}"
            )