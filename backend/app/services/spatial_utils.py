import geopandas as gpd
from shapely.geometry import shape
from app.core.constants import TREE_DENSITIES

import pyproj
from shapely.ops import transform

class SpatialUtils:
    def calculate_area(self, geometry_obj) -> float:
        """Calculates metric area in hectares (EPSG:32647)."""
        # GeoJSON geometry dict -> Shapely geometry
        poly_geom = shape(geometry_obj) if isinstance(geometry_obj, dict) else geometry_obj

        # Create plantation GeoDataFrame
        poly_gdf = gpd.GeoDataFrame(
            index=[0],
            crs="EPSG:32647",
            geometry=[poly_geom]
        )
        
        area_m2 = poly_gdf.geometry[0].area
        return float(area_m2)

    def calculate_area_ha(self, geometry_obj) -> float:
        area_m2 = self.calculate_area(geometry_obj)
        # Convert to hectares
        return float(area_m2 / 10000.0) 


    def get_verified_tree_data(self, poly_data: dict) -> dict:

        area_ha = self.calculate_area_ha(
            poly_data["merged_geometry"]
        )

        spacing = poly_data.get("spacing_system") or "2.5x8"

        density = TREE_DENSITIES.get(spacing, 500)

        calculated_count = int(area_ha * density)

        user_tree_count = poly_data.get("tree_count")

        if user_tree_count is None:
            return {
                "tree_count": calculated_count,
                "is_reliable": True,
                "note": "Calculated from area and spacing."
            }

        if calculated_count == 0:
            return {
                "tree_count": user_tree_count,
                "is_reliable": False,
                "note": "Calculated tree count is zero; used user input."
            }

        diff_percent = abs(user_tree_count - calculated_count) / calculated_count

        if diff_percent <= 0.05:
            return {
                "tree_count": user_tree_count,
                "is_reliable": True,
                "note": "User input validated against area."
            }

        return {
            "tree_count": calculated_count,
            "is_reliable": False,
            "note": (
                f"User input ({user_tree_count}) deviated >5% "
                f"from calculated ({calculated_count}). Used calculated value."
            )
        }