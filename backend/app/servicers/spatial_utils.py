import geopandas as gpd
import shapely.geometry
from app.core.constants import DEFAULT_DENSITIES


class SpatialUtils:

    @staticmethod
    def calculate_area_ha(geometry: dict) -> float:
        """
        Calculates area in hectares from GeoJSON geometry.
        Ensures geometry is in EPSG:32647.
        """

        geom = shapely.geometry.shape(geometry)

        gdf = gpd.GeoDataFrame(
            index=[0],
            geometry=[geom],
            crs="EPSG:32647"
        )

        # Ensure CRS
        gdf = gdf.to_crs("EPSG:32647")

        area_m2 = gdf.geometry.area.iloc[0]

        return area_m2 / 10000.0

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