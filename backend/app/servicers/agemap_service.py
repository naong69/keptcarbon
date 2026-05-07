import rasterio
from rasterio.mask import mask
from shapely.geometry import shape
from collections import Counter
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from app.core.constants import REGION_CONFIG


class AgeMapService:
    def __init__(self):
        self.base_path = Path("app/data/rasters")
        self.target_crs = "EPSG:32647"

    def get_plantation_age_cohorts(self, poly_data: dict) -> list:
        p_code = poly_data.get("province_code")
        config = REGION_CONFIG.get(p_code)

        if config is None:
            raise HTTPException(
                status_code=400,
                detail=f"No region config found for province {p_code}"
            )

        raster_file = config.get("age_raster")
        raster_path = self.base_path / raster_file

        if not raster_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Age raster not found for province {p_code}"
            )

        try:
            # GeoJSON geometry dict -> Shapely geometry
            plantation_geom = shape(poly_data["a302_geometry"])
            # Ensure geometry is in raster CRS
            plantation_geom = plantation_geom.to_crs(self.target_crs)  

            with rasterio.open(raster_path) as src:
                out_image, out_transform = mask(
                    src,
                    [plantation_geom],
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


                counts = Counter(valid_pixels.flatten())
                total_pixels = sum(counts.values())

                current_year = datetime.now().year
                most_common_year, max_count = counts.most_common(1)[0]

                if (max_count / total_pixels) > 0.8:
                    tree_info = get_tree_count_raster_pixel(poly_data)
                    reliable_tree_count = tree_info['tree_count']

                    return [{
                        "age": int(current_year - most_common_year),
                        "tree_count": reliable_tree_count
                    }]

                result = []
                for yr, count in counts.most_common():
                    tree_info = get_tree_count_raster_pixel(poly_data, int(count), total_pixels)
                    reliable_tree_count = tree_info['tree_count']
                    result.append({
                        "age": int(current_year - yr),
                        "tree_count": reliable_tree_count
                    })

                return result

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Raster extraction failed: {str(e)}"
            )