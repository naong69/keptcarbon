import geopandas as gpd
import shapely.geometry
from app.core.constants import DEFAULT_DENSITIES

import pyproj
from shapely.ops import transform

class SpatialUtils:
    def calculate_area_ha(self, geometry_obj) -> float:
        """Calculates metric area in hectares (EPSG:32647)."""
        # geometry_obj can be a dict or a shapely shape
        poly = shapely.geometry.shape(geometry_obj) if isinstance(geometry_obj, dict) else geometry_obj
        
        # Transform WGS84 to UTM 47N for metric accuracy
        project = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:32647", always_xy=True).transform
        poly_transformed = transform(project, poly)
        return poly_transformed.area / 10000.0

    def get_verified_tree_data(self, poly_data: dict) -> dict:

        area_ha = self.calculate_area_ha(
            poly_data["a302_geometry"]
        )

        spacing = poly_data.get("spacing_system") or "2.5x8"

        density = DEFAULT_DENSITIES.get(spacing, 500)

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