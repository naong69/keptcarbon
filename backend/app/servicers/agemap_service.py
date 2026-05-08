import rasterio
from rasterio.mask import mask
from shapely.geometry import shape
from collections import Counter
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from app.core.constants import (REGION_CONFIG, TREE_AGE_HOMOLOGOUS_THRESHOLD)
from app.services.tree_service import TreeService

class AgeMapService:
    def __init__(self):
        self.base_path = Path("app/data/rasters")
        self.tree_svc = TreeService()
        self.target_crs = "EPSG:32647"

    def get_plantation_age_count(self, poly_data: dict) -> list:
        p_code = poly_data.get("province_code")
        config = REGION_CONFIG.get(p_code)

        if config is None:
            raise HTTPException(
                status_code=400,
                detail=f"NO REGION CONFIG FOUND FOR PROVINCE: {p_code}"
            )

        raster_file = config.get("age_raster")
        raster_path = self.base_path / raster_file

        if not raster_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"AGE RASTER NOT FOUND FOR PROVINCE: {p_code}"
            )

        try:
            # GeoJSON geometry dict -> Shapely geometry
            plantation_geom = shape(poly_data["a302_geometry"])

            # Create plantation GeoDataFrame
            plantation_gdf = gpd.GeoDataFrame(
                index=[0],
                crs=self.target_crs,
                geometry=[plantation_geom]
            )

            # Ensure geometry is in raster CRS
            plantation_gdf = plantation_gdf.to_crs(self.target_crs)  

            with rasterio.open(raster_path) as src:
                out_image, out_transform = mask(
                    src,
                    [plantation_gdf.geometry[0]],
                    crop=True,
                    filled=True,
                    nodata=-9999
                )

                data = out_image[0]

                valid_pixels = data[
                    (data != -9999) &
                    (data != src.nodata) &
                    (data >= 1988) &
                    (data <= datetime.now().year + 1)
                ]
                
                # Converting 1 to 0 which mean cannot determine the age, and valid age pixels remain unchanged. 
                # This way, we can count the valid age pixels without including the undetermined ones.
                valid_pixels = valid_pixels.copy()
                valid_pixels[valid_pixels == 1] = 0

                counts = Counter(valid_pixels.flatten())

            return counts

         except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Raster extraction failed: {str(e)}"
            )


    def get_plantation_age_cohorts(self, poly_data: dict) -> list:

        counts = self.get_plantation_age_count(poly_data)
        total_pixels = sum(counts.values())

        current_year = datetime.now().year
        most_common_year, max_count = counts.most_common(1)[0]

        if (max_count / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            tree_info = self.tree_svc.get_tree_count_raster_pixel(poly_data, int(max_count), total_pixels)
            reliable_tree_count = tree_info['tree_count']

            return [{
                "age": int(current_year - most_common_year),
                "tree_count": reliable_tree_count
            }]

        result = []
        for yr, count in counts.most_common():
            tree_info = self.tree_svc.get_tree_count_raster_pixel(poly_data, int(count), total_pixels)
            reliable_tree_count = tree_info['tree_count']
            result.append({
                "age": int(current_year - yr),
                "tree_count": reliable_tree_count
            })

        return result

    def get_plantation_year_check(self, poly_data: dict) -> list:

        counts = self.get_plantation_age_count(poly_data)
        total_pixels = sum(counts.values())

        current_year = datetime.now().year
        most_common_year, max_count = counts.most_common(1)[0]

        if (max_count / total_pixels) > TREE_AGE_HOMOLOGOUS_THRESHOLD:
            return {
                "year": most_common_year,
                "is_reliable": True,
                "note": "AGE MAP DATA IS DOMINATED BY ONE AGE CLASS; USED MOST COMMON AGE."
             }

        return {
            "year": None,
            "is_reliable": False,
            "note": (
                "AGE MAP DATA SHOWS HIGH VARIABILITY; "
                "CANNOT RELIABLY DETERMINE AGE. "
                "CONSIDER USING USER-INPUT AGE OR OTHER METHODS."
