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

from app.core.constants import (
    CARBON_FRACTION,
    CARBON_EQUIVALENT_FACTOR,
    REGION_CONFIG
)

class CarbonService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()
        self.age_map_svc = AgeMapService()
        self.tree_svc = TreeService()
        self.spatial_svc = SpatialUtils()
        self.lookup_file_path = Path("app/data/lookup_tables")

    def generate_carbon_profile(self, poly_data, cohorts) -> dict:

        """
        Generates a yearly carbon stock profile (tC) with 95% CI 
        by aggregating multiple age cohorts from age 0 to 35.

        Logic:
        - Selects lookup table via REGION_CONFIG based on p_code and biometric config.
        - Aggregates biomass and propagates CI bounds per year.
        """
        
        # Regional and Model Configuration
        p_code = poly_data.get("province_code")
        config = REGION_CONFIG.get(p_code)
        
        clone = poly_data.get("rubber_clone") or "RRIM 600"
        growth_model = "cubic_poly" 
        allometry = "hytonen_2018"
        
        # Direct Lookup Table retrieval from REGION_CONFIG
        table_key = (clone, growth_model, allometry)
        file_name = config["biomass_estimation_tables"].get(table_key)

        # Load the R&D validated table directly
        try:
            lookup_df = pd.read_csv(self.lookup_file_path / file_name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load lookup file: {str(e)}")
        
        current_year = datetime.now().year 
        max_age_profile = 35
        projections = []
        
        # Using max() with a generator expression
        max_age = max(cohort['age'] for cohort in cohorts)
        limit_year = current_year + (max_age_profile -  max_age) # Filter threshold

        # Spatiotemporal Aggregation: Yearly sum of all cohorts
        for year_offset in range(0, max_age_profile + 1):
            target_year = current_year + year_offset
            
            if target_year > limit_year:
                break # Exit the loop once pass year threshold

            sum_biomass_est = 0.0
            sum_biomass_lower = 0.0
            sum_biomass_upper = 0.0
            
            min_age = float('inf') # To track the minimum age in cohorts for potential profile adjustments
            
            for cohort in cohorts:
                future_age = cohort['age'] + year_offset
                
                if cohort['age'] < min_age:
                    min_age = cohort['age']

                # Check cohort eligibility within the 35-year modeled window 
                if future_age <= max_age_profile:
                    row = lookup_df[lookup_df['Age'] == future_age]
                    if not row.empty:
                        data = row.iloc[0]
                        count = cohort['tree_count']
                        
                        # Sum values scaled by tree count for the whole plantation 
                        sum_biomass_est += (data['Biomass_Est'] * count)
                        sum_biomass_lower += (data['Biomass_CI_Lower'] * count)
                        sum_biomass_upper += (data['Biomass_CI_Upper'] * count)
            
            # Convert aggregated biomass (kg) to Total Carbon (tC)
            # Formula: (Summed Biomass * Carbon Fraction 0.47) / 1000 to convert kg to tC
            #          Then convert tC to tCO2e using the equivalent factor 3.667 (44/12)
            if sum_biomass_est > 0:
                projections.append({
                    "year": target_year,
                    "total_carbon_tCO2e": round((sum_biomass_est * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_lower_tCO2e": round((sum_biomass_lower * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4),
                    "ci_upper_tCO2e": round((sum_biomass_upper * CARBON_FRACTION * CARBON_EQUIVALENT_FACTOR) / 1000.0, 4)
                })

        return  projections
        

    async def get_carbon_profile(self, poly_data) -> dict:
        # Step 1: Determines the province code (P_CODE) for the user-drawn polygon.
        poly_data = self.pro_svc.get_province(poly_data)
        if poly_data["province_code"] is None:
            # If no valid province code, return with error status
            return {
                "polygon_id": poly_data["id"],
                "status": poly_data["status"],
                "carbon_profile": None
            }

        # Step 2: Filters the user-drawn polygon to isolate only A302 rubber cultivation zones.
        poly_data = self.lu_svc.find_rubber_cultivation_area(poly_data)
        if poly_data["a302_geometry"] is None:
            # If no valid rubber cultivation area, return with error status
            return {
                "polygon_id": poly_data["id"],
                "status": poly_data["status"],
                "carbon_profile": None
            }

        # Step 3: Determines the carbon stock profile.

        # Check year of planting again raster map using the A302 zone geometry. 
        #This will also determine the reliability of the user-input year of planting, if it is provided.
        planting_year_info = self.age_map_svc.get_plantation_year_check(poly_data) # This will perform the year check 

        if planting_year_info["year"] is None: 
            # Found heterogeneous age classes with significant deviation, 
            # which means the user-input year of planting is not reliable, if it is provided
            # then egnore the user-input year of planting and use the year from age map to form the cohort and generate profile.

            cohorts = self.age_map_svc.get_plantation_age_cohorts(poly_data)

            # find 0 in chorts.
            cohorts_with_zero_age = [cohort for cohort in cohorts if cohort['age'] == 0]
            if cohorts_with_zero_age:
                # If there are cohorts with age 0, it means the age map cannot determine the year of planting for those pixels. 
                # In this case, we will generate the carbon profile using the cohorts with determined age, 
                # but we will flag the profile as potentially unreliable due to the undetermined planting year for some portion of the plantation.
                reliable_mgs_add = " (NOTE: SOME PIXELS HAVE UNDETERMINED PLANTING YEAR)"

                # Use only cohorts with determined age for profile generation
                cohorts = [c for c in cohorts if c['age'] > 0] 
            else:
                # If there are no cohorts with age 0, it means all pixels have a determined planting year, 
                # and we can proceed with profile generation as usual.
                reliable_mgs_add = ""

            
            profile = self.generate_carbon_profile(poly_data, cohorts)

            reliable_mgs = (
                    "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                    "OF PLANTING AND RELIABLE TREE COUNT." + reliable_mgs_add
                )

            return {
                "polygon_id": poly_data["id"],
                "status": {"status": "success", 
                            "status_code": "S04", 
                            "message": reliable_mgs
                            },
                "carbon_profile": profile
            }


        elif planting_year_info["year"] == 0: 
            # >80% of year pixels are 0, which means the age map cannot determine the year.
            # Assume the user-input year of planting is reliable, if it is provided, otherwise, return None with message.
            if poly_data["year_of_planting"] is None:
                # If the user has not provided a year of planting and the age map cannot determine the year, 
                # we will not be able to generate a reliable carbon profile. 
                # In this case, we will return a response indicating that the carbon profile cannot be generated due to 
                # unreliable planting year information, and the carbon_profile field will be set to None.

                reliable_mgs = "CARBON PROFILE CANNOT BE GENERATED DUE TO UNRELIABLE EXTRACTED YEAR OF PLANTING. (USER-INPUT YEAR OF PLANTING IS REQUIRED.)"

                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "error", 
                                "status_code": "E04", 
                                "message": reliable_mgs
                                },
                    "carbon_profile": None
                }
            else:
                # If year of planting is provided, consider it as reliable and proceed to tree count reliability check and profile generation.
                
                current_year = datetime.now().year
                age = current_year - poly_data["year_of_planting"]

                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                reliable_tree_count = tree_info['tree_count']  

                # Form cohorts (Age + Tree Count pairs) 
                cohorts = [{'age': age, 'tree_count': reliable_tree_count}]

                profile = self.generate_carbon_profile(poly_data, cohorts)

                if tree_info['is_reliable']:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING USER-DEFINED YEAR "
                        "OF PLANTING AND RELIABLE TREE COUNT."
                    )
                else:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING USER-DEFINED YEAR "
                        "OF PLANTING AND CALCULATED TREE COUNT."
                    )

                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "success", 
                                "status_code": "S03", 
                                "message": reliable_mgs
                                },
                    "carbon_profile": profile
                }


         else: 
            # Found majority year class with year homogeneity. check reliability of the user-input year of planting, if it is provided.
            # otherwise, use the year from age map to form the cohort and generate profile.
            if poly_data["year_of_planting"] is None:
                # If the user has not provided a year of planting, 
                # extract age cohorts from the raster and generate the profile.

                current_year = datetime.now().year
                age = current_year - planting_year_info["year"]

                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                reliable_tree_count = tree_info['tree_count']  
                
                # Form cohorts (Age + Tree Count pairs) 
                cohorts = [{'age': age, 'tree_count': reliable_tree_count}]

                profile = self.generate_carbon_profile(poly_data, cohorts)

                if tree_info['is_reliable']:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                        "OF PLANTING AND RELIABLE TREE COUNT."
                    )
                else:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING CALCULATED YEAR "
                        "OF PLANTING AND CALCULATED TREE COUNT."
                    )

                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "success", 
                                "status_code": "S03", 
                                "message": reliable_mgs
                                },
                    "carbon_profile": profile
                }

            else :
                # If the user-input year of planting is provided, assume it is reliable and use it to form the cohort and generate profile.
                
                current_year = datetime.now().year
                age = current_year - poly_data["year_of_planting"]

                tree_info = self.tree_svc.get_tree_count_user_input(poly_data)
                reliable_tree_count = tree_info['tree_count']  
                
                # Form cohorts (Age + Tree Count pairs) 
                cohorts = [{'age': age, 'tree_count': reliable_tree_count}]

                profile = self.generate_carbon_profile(poly_data, cohorts)

                if tree_info['is_reliable']:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING USER-DEFINED YEAR "
                        "OF PLANTING AND RELIABLE TREE COUNT."
                    )
                else:
                    reliable_mgs = (
                        "CARBON PROFILE GENERATED USING USER-DEFINED YEAR "
                        "OF PLANTING AND CALCULATED TREE COUNT."
                    )

                return {
                    "polygon_id": poly_data["id"],
                    "status": {"status": "success", 
                                "status_code": "S03", 
                                "message": reliable_mgs
                                },
                    "carbon_profile": profile
                }


        



