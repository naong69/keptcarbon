from datetime import datetime
from typing import List, Dict
from pathlib import Path
import pandas as pd
from fastapi import HTTPException
from app.services.province_service import ProvinceService
from app.services.landuse_service import LanduseService
from app.services.tree_service import TreeService
from app.services.agemap_service import AgeMapService
from app.services.spatial_utils import SpatialUtils

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

from app.core.constants import (
    CARBON_FRACTION,
    CARBON_EQUIVALENT_FACTOR,
    REGION_CONFIG,
    GROWTH_MODEL_YEAR,
    MAX_TREE_AGE
)

class CarbonService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()
        self.age_map_svc = AgeMapService()
        self.tree_svc = TreeService()
        self.spatial_svc = SpatialUtils()
        self.lookup_file_path = Path("app/data/lookup_tables")

    @staticmethod
    def merge_all_lu_geometries(poly_data: dict):
        """Merge all lu_polygon geometries into one unified MultiPolygon."""
        lu_list = poly_data.get("lu_polygon", [])
        print(f"Number of LU polygons to merge: {len(lu_list)}")
        all_geoms = [shape(item["geometry"]) for item in lu_list]

        if not all_geoms:
            poly_data["merged_geometry"] = None
            poly_data["status"] = {
                "status": "error",
                "status_code": "E04",
                "message": "NO VALID MERGED POLYGON."
            }
            return poly_data

        unified_geom = unary_union(all_geoms)
        poly_data["merged_geometry"] = mapping(unified_geom)
        poly_data["status"] = {
            "status": "success",
            "status_code": "S04",
            "message": "MERGING ALL POLYGONS SUCCESSFUL."
        }
        return poly_data

    def generate_carbon_profile(self, poly_data, cohorts) -> list:
        """
        Generates a yearly carbon stock profile (tCO2e) with 95% CI
        by aggregating multiple age cohorts from age 0 to GROWTH_MODEL_YEAR.
        """
        p_code = poly_data.get("province_code")
        config = REGION_CONFIG.get(p_code)
        if config is None:
            raise HTTPException(
                status_code=422,
                detail=f"Province code '{p_code}' is not supported. Supported: {list(REGION_CONFIG.keys())}"
            )

        clone = poly_data.get("rubber_clone") or "RRIM 600"
        growth_model = config.get("model_used", "cubic_poly")
        allometry = config.get("biomass_estimation_method", "hytonen_2018")

        table_key = (clone, growth_model, allometry)
        file_name = config["biomass_estimation_tables"].get(table_key)
        if file_name is None:
            available = list(config["biomass_estimation_tables"].keys())
            raise HTTPException(
                status_code=422,
                detail=f"No lookup table for clone='{clone}', model='{growth_model}', allometry='{allometry}'. "
                       f"Available combinations: {available}"
            )

        try:
            lookup_df = pd.read_csv(self.lookup_file_path / file_name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load lookup file: {str(e)}")

        if not cohorts:
            return []

        current_year = datetime.now().year
        max_age_profile = GROWTH_MODEL_YEAR
        projections = []

        max_age = max(cohort['age'] for cohort in cohorts)
        limit_year = current_year + (max_age_profile - max_age)
        print(f"Max cohort age: {max_age}, Profile limit year: {limit_year}")

        for year_offset in range(0, max_age_profile + 1):
            target_year = current_year + year_offset

            if target_year > limit_year:
                break

            sum_biomass_est = 0.0
            sum_biomass_lower = 0.0
            sum_biomass_upper = 0.0
            min_age = float('inf')

            for cohort in cohorts:
                future_age = cohort['age'] + year_offset

                if cohort['age'] < min_age:
                    min_age = cohort['age']

                if future_age <= max_age_profile:
                    row = lookup_df[lookup_df['Age'] == future_age]
                    if not row.empty:
                        data = row.iloc[0]
                        count = cohort['tree_count']
                        sum_biomass_est += data['Biomass_Est'] * count
                        sum_biomass_lower += data['Biomass_CI_Lower'] * count
                        sum_biomass_upper += data['Biomass_CI_Upper'] * count

            if sum_biomass_est > 0:
                projections.append({
                    "year": target_year,
                    "total_carbon_tCO2e": round((sum_biomass_est * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_lower_tCO2e": round((sum_biomass_lower * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_upper_tCO2e": round((sum_biomass_upper * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
                })

        return projections


    async def get_carbon_profile(self, poly_data) -> dict:
        # Step 1: Determine province code, skip if already set
        print(f"Initial province code in poly_data: {poly_data.get('province_code')}")
        if poly_data.get("province_code") is None:
            poly_data = self.pro_svc.get_province(poly_data)
            print(f"Province code determined: {poly_data.get('province_code')}")

        if poly_data.get("province_code") is None:
            print(f"Error: No valid province code found. Status: {poly_data['status']}")
            return {
                "polygon_id": poly_data.get("id"),
                "status": poly_data.get("status"),
                "carbon_profile": None
            }

        # Step 2: Merge all lu_polygon geometries (new flow)
        # Falls back to find_rubber_cultivation_area for backward compatibility
        if poly_data.get("lu_polygon"):
            poly_data = self.merge_all_lu_geometries(poly_data)
            if poly_data["merged_geometry"] is None:
                print(f"Error: No valid merged geometry found. Status: {poly_data['status']}")
                return {
                    "polygon_id": poly_data.get("id"),
                    "status": poly_data.get("status"),
                    "carbon_profile": None
                }
        else:
            poly_data = self.lu_svc.find_rubber_cultivation_area(poly_data)
            if poly_data["a302_geometry"] is None:
                print(f"Error: No valid rubber data found. Status: {poly_data['status']}")
                return {
                    "polygon_id": poly_data["id"],
                    "status": poly_data["status"],
                    "carbon_profile": None
                }

        # Step 3: Check planting year via raster
        planting_year_info = self.age_map_svc.get_plantation_year_check(poly_data)
        print(f"Planting year info: {planting_year_info}")

        if planting_year_info["year"] is None:
            # Heterogeneous age classes — use all cohorts from raster
            cohorts = self.age_map_svc.get_plantation_age_cohorts(poly_data)
            print(f"Extracted age cohorts: {cohorts}")

            cohorts_with_null_age = [c for c in cohorts if c['age'] > MAX_TREE_AGE]
            print(f"Cohorts with null age: {cohorts_with_null_age}")
            if cohorts_with_null_age:
                reliable_mgs_add = " (NOTE: SOME PIXELS HAVE UNDETERMINED PLANTING YEAR)"
                cohorts = [c for c in cohorts if c['age'] <= MAX_TREE_AGE]
            else:
                reliable_mgs_add = ""

            if not cohorts:
                reliable_mgs = (
                    "CARBON PROFILE CANNOT BE GENERATED DUE TO UNRELIABLE EXTRACTED YEAR OF PLANTING."
                    " (SOME PIXELS HAVE UNDETERMINED PLANTING YEAR AND/OR TREE AGE IS OVER 28 YEARS.)"
                )
                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "error", "status_code": "E05", "message": reliable_mgs},
                    "carbon_profile": None
                }

            print(f"Final cohorts used for profile generation: {cohorts}")
            profile = self.generate_carbon_profile(poly_data, cohorts)

            reliable_mgs = (
                "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                "OF PLANTING AND RELIABLE TREE COUNT." + reliable_mgs_add
            )
            return {
                "polygon_id": poly_data["id"],
                "status": {"status": "success", "status_code": "S04", "message": reliable_mgs},
                "carbon_profile": profile
            }

        elif planting_year_info["year"] == 0:
            # Raster pixels all 0 — year undetermined
            if poly_data.get("year_of_planting") is None:
                reliable_mgs = (
                    "CARBON PROFILE CANNOT BE GENERATED DUE TO UNRELIABLE EXTRACTED YEAR OF PLANTING."
                    " (USER-INPUT YEAR OF PLANTING IS REQUIRED.)"
                )
                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "error", "status_code": "E04", "message": reliable_mgs},
                    "carbon_profile": None
                }
            else:
                current_year = datetime.now().year
                age = current_year - poly_data["year_of_planting"]
                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                cohorts = [{'age': age, 'tree_count': tree_info['tree_count']}]
                profile = self.generate_carbon_profile(poly_data, cohorts)

                reliable_mgs = (
                    "CARBON PROFILE GENERATED USING USER-DEFINED YEAR OF PLANTING AND "
                    + ("RELIABLE" if tree_info['is_reliable'] else "CALCULATED") + " TREE COUNT."
                )
                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "success", "status_code": "S03", "message": reliable_mgs},
                    "carbon_profile": profile
                }

        else:
            # Majority year class found — use raster year or user-provided year
            current_year = datetime.now().year
            if poly_data.get("year_of_planting") is None:
                age = current_year - planting_year_info["year"]
            else:
                print(f"User-input year of planting provided: {poly_data['year_of_planting']}. Using it for profile generation.")
                age = current_year - poly_data["year_of_planting"]

            tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
            print(f"Tree count info: {tree_info}")
            cohorts = [{'age': age, 'tree_count': tree_info['tree_count']}]
            profile = self.generate_carbon_profile(poly_data, cohorts)

            reliable_mgs = (
                "CARBON PROFILE GENERATED USING USER-DEFINED YEAR OF PLANTING AND "
                + ("RELIABLE" if tree_info['is_reliable'] else "CALCULATED") + " TREE COUNT."
            )
            return {
                "polygon_id": poly_data["id"],
                "status": {"status": "success", "status_code": "S03", "message": reliable_mgs},
                "carbon_profile": profile
            }
