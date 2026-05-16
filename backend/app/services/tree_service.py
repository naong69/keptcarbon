"""
Tree count reliability check.
"""

from app.services.spatial_utils import SpatialUtils
from app.core.constants import (
    TREE_DENSITIES, 
    TREE_COUNT_VALIDATION_THRESHOLD,
    TREE_AGE_HOMOLOGOUS_THRESHOLD
)

class TreeService:
    def __init__(self):
        self.spatial_utils = SpatialUtils()

    def get_tree_count_user_input(self, poly_data: dict) -> dict:
        geom = poly_data.get("merged_geometry") or poly_data.get("a302_geometry")
        area_ha = self.spatial_utils.calculate_area_ha(geom)
        print(f"Calculated area (ha) for polygon {poly_data['id']}: {area_ha}")

        spacing = poly_data.get("spacing_system") or "2.5x8"
        density = TREE_DENSITIES.get(spacing, 500)

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

        if diff_percent <= TREE_COUNT_VALIDATION_THRESHOLD:
            return {
                "tree_count": user_tree_count,
                "is_reliable": True,
                "note": "USER INPUT VALIDATED AGAINST AREA."
            }

        return {
            "tree_count": calculated_count,
            "is_reliable": False,
            "note": (
                f"USER INPUT ({user_tree_count}) DEVIATED >{TREE_COUNT_VALIDATION_THRESHOLD*100}% "
                f"FROM CALCULATED ({calculated_count}). USED CALCULATED VALUE."
            )
        }

    def get_tree_count_raster_pixel(self, poly_data: dict, num_pixel: int, total_pixels: int) -> dict:
        geom = poly_data.get("merged_geometry") or poly_data.get("a302_geometry")
        area_ha = self.spatial_utils.calculate_area_ha(geom)
        
        if (num_pixel / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            # If the age map data is dominated by one age class, we will use the calculated tree count based on area 
            # and spacing without adjustment, as the age homogeneity suggests that the plantation is likely to have 
            # use user-input spacing to estimate tree density across the area or use default spacing if no user-input is provided.
            spacing = poly_data.get("spacing_system") or "2.5x8"
            density = TREE_DENSITIES.get(spacing, 500)

            calculated_count = int(area_ha * density)

        else: # if found age heterogeneity, we will use the pixel ratio to adjust the calculated tree count, 
              # which is derived from area and use default spacing, to get a more accurate estimation of tree count for the specific polygon.
            area_ha = area_ha * (num_pixel / total_pixels)
            density = 500
            calculated_count = int(area_ha * density)
        
        return {
            "tree_count": calculated_count,
            "is_reliable": False,
            "note": (
                "USE RASTER DATA TO ESTIMATE TREE COUNT."
                "THUS, USED CALCULATED TREE COUNT."
            )
        }








