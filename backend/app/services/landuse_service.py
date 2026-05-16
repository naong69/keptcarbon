import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from fastapi import HTTPException
from pathlib import Path
from app.core.constants import REGION_CONFIG
from app.services.spatial_utils import SpatialUtils


class LanduseService:
    def __init__(self):
        """
        Initializes the Landuse service.
        The Land Development Department (LDD) LULC code for rubber is A302.
        """
        self.target_crs = "EPSG:32647"
        self._lu_registry = {}
        self.spatial_svc = SpatialUtils()

        # Initialize all regional vectors into memory
        for p_code, cfg in REGION_CONFIG.items():
            file_path = Path(f"app/data/shp/LU/{cfg['lu_vector']}")
            if file_path.exists():
                gdf = gpd.read_file(file_path)
                if gdf.crs != self.target_crs:
                    gdf = gdf.to_crs(self.target_crs)
                self._lu_registry[p_code] = gdf
                print(f"Loaded Landuse Vector for P_CODE: {p_code}")
            else:
                print(f"Warning: Landuse vector file not found for P_CODE: {p_code}")
    """
    def find_rubber_cultivation_area(self, poly_data: dict):

        p_code = poly_data.get("province_code")
        lu_gdf = self._lu_registry.get(p_code)

        if lu_gdf is None:
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

        try:

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
    """

    def find_lu_class_area(self, poly_data: dict):
        p_code = poly_data.get("province_code")
        lu_gdf = self._lu_registry.get(p_code)

        if lu_gdf is None:
            # ... keep your existing error handling ...
            return poly_data

        try:
            plantation_geom = shape(poly_data["geometry"])
            plantation_gdf = gpd.GeoDataFrame(
                index=[0], crs="EPSG:4326", geometry=[plantation_geom]
            ).to_crs(self.target_crs)
            
            target_geom = plantation_gdf.geometry.iloc[0]
            total_intersected_area_m2 = target_geom.area

            # FAST SPATIAL FILTERING USING STRtree INDEX
            # Isolate only the specific landuse rows touching our target bounding box
            possible_matches_idx = lu_gdf.sindex.query(target_geom, predicate="intersects")
            lu_candidates = lu_gdf.iloc[possible_matches_idx].copy()

            if lu_candidates.empty:
                poly_data["lu_polygon"] = []
                poly_data["total_area_m2"] = round(total_intersected_area_m2, 4)
                return poly_data

            # Compute precise geometry intersections only on bounded features
            lu_candidates["geometry"] = lu_candidates.geometry.intersection(target_geom)
            # Remove empty intersections
            lu_candidates = lu_candidates[~lu_candidates.geometry.is_empty]

            # 3. Dynamic Grouping Definition
            def determine_group(row):
                l1 = str(row['LUL1_CODE']).upper()
                if l1 in ["U", "F", "M", "W"]:
                    return l1
                if l1 == "A":
                    return str(row['LU_CODE'])
                return "OTHER"

            lu_candidates['group_key'] = lu_candidates.apply(determine_group, axis=1)

            # 4. Dissolve on the localized subset
            merged_gdf = lu_candidates.dissolve(by='group_key')

            # 5. Extract Metrics & Descriptions
            lu_classes_result = []
            for group_key, row in merged_gdf.iterrows():
                geom = row.geometry

                if group_key == "U":
                    row_lu_code_dec_th, row_lu_code_dec_en = "สิ่งปลูกสร้าง", "Urban/Built-up Area"
                elif group_key == "F":
                    row_lu_code_dec_th, row_lu_code_dec_en = "ป่าไม้", "Forest"
                elif group_key == "W":  
                    row_lu_code_dec_th, row_lu_code_dec_en = "แหล่งน้ำผิวดิน", "Water Body"
                elif group_key == "M":
                    row_lu_code_dec_th, row_lu_code_dec_en = "พื้นที่อื่น ๆ", "Miscellaneous Area"
                else : 
                    row_lu_code_dec_th = row.get("LU_DES_TH", "N/A")
                    row_lu_code_dec_en = row.get("LU_DES_EN", "N/A")

                area_m2 = geom.area  # Avoid utility overhead, compute directly from UTM projected geometry
                percent = (area_m2 / total_intersected_area_m2 * 100) if total_intersected_area_m2 > 0 else 0

                lu_classes_result.append({
                    "lu_class": group_key,
                    "lu_class_desc_th": row_lu_code_dec_th,
                    "lu_class_desc_en": row_lu_code_dec_en,
                    "geometry": mapping(geom),
                    "area_m2": round(area_m2, 4),
                    "area_percent": round(percent, 2)
                })

            poly_data["lu_polygon"] = lu_classes_result
            poly_data["total_area_m2"] = round(total_intersected_area_m2, 4)
            poly_data["status"] = {
                "status": "success", "status_code": "S02",
                "message": "LAND USE CLASSIFICATION AND AREA CALCULATION COMPLETED."
            }
            return poly_data

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LAND USE CLASS ANALYSIS FAILED: {str(e)}")


            