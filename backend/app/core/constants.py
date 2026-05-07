# Biometric Constants [cite: 1444]
CARBON_FRACTION = 0.47 
CARBON_EQUIVALENT_FACTOR = 3.667  # CO2 to C conversion factor 44/12

# Spacing to Density Mapping [cite: 1452, 1453, 1457]
DEFAULT_DENSITIES = {
    "2.5x8": 500,  # Recommended standard for flat terrain
    "3x7": 475,    # Common for sloped areas
    "3x8": 419,
    "2.5x7": 569,
    "3x6": 556
}

# Regional Data Registry
# Maps P_CODE to local spatial files and R&D lookup tables
REGION_CONFIG = {
    "RAY": {  # Rayong Province 
        "province_name": "Rayong",
        "lu_vector": "LU_RYG_2567.gpkg",
        "plaining_year_map": "establishment_year_rayong.tif",
        "plaining_year_map_qa": "establishment_year_rayong_qa.tif",
        "biomass_estimation_tables": {
            ("RRIM 600", "cubic_poly", "hytonen_2018"): "rrim600_cubic_poly_hytonen_rayong.csv",
            ("RRIT 251", "cubic_poly", "hytonen_2018"): "rrit251_cubic_poly_hytonen_rayong.csv"
        }
    },
    "SRT": {  # Surat Thani Province
        "province_name": "Surat Thani",
        "lu_vector": "LU_SNI_2567.gpkg",
        "plaining_year_map": "establishment_year_surat.tif",
        "plaining_year_map_qa": "establishment_year_surat_qa.tif",
        "biomass_estimation_tables": {
            ("RRIM 600", "cubic_poly", "hytonen_2018"): "rrim600_cubic_poly_hytonen_surat.csv"
        }
    }
}