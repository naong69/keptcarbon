"""
Tree count reliability check.
"""

from app.services.spatial_utils import SpatialUtils
from app.core.constants import DEFAULT_DENSITIES

class TreeService:
    def __init__(self):
        self.spatial_utils = SpatialUtils()

    def get_tree_count_user_input(self, poly_data: dict) -> dict:


        area_ha = self.spatial_utils.calculate_area_ha(
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
                "note": "CALCULATED FROM AREA AND SPACING."
            }

        if calculated_count == 0:
            return {
                "tree_count": user_tree_count,
                "is_reliable": False,
                "note": "CALCULATED TREE COUNT IS ZERO; USED USER INPUT."
            }

        diff_percent = abs(user_tree_count - calculated_count) / calculated_count

        if diff_percent <= 0.05:
            return {
                "tree_count": user_tree_count,
                "is_reliable": True,
                "note": "USER INPUT VALIDATED AGAINST AREA."
            }

        return {
            "tree_count": calculated_count,
            "is_reliable": False,
            "note": (
                f"USER INPUT ({user_tree_count}) DEVIATED >5% "
                f"FROM CALCULATED ({calculated_count}). USED CALCULATED VALUE."
            )
        }

    def get_tree_count_raster_pixel(self, poly_data: dict, num_pixel: int, total_pixels: int) -> dict:

        area_ha = self.spatial_utils.calculate_area_ha(
            poly_data["a302_geometry"]
        )
        
        if not (max_count / total_pixels) > 0.8:
            area_ha = area_ha * (num_pixel / total_pixels)

        spacing = poly_data.get("spacing_system") or "2.5x8"
        density = DEFAULT_DENSITIES.get(spacing, 500)

        calculated_count = int(area_ha * density)

        return {
            "tree_count": calculated_count,
            "is_reliable": False,
            "note": (
                "USE RASTER DATA TO ESTIMATE TREE COUNT."
                "THUS, USED CALCULATED TREE COUNT."
            )
        }








