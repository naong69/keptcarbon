from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class LUPolygon(BaseModel):
    lu_class: str
    lu_class_desc_th: Optional[str] = None
    lu_class_desc_en: Optional[str] = None
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")
    area_m2: float = Field(..., description="Area in square meters")  
    area_percent: float = Field(..., description="Percentage of area")
    

class PlantationEstimatePolygon(BaseModel):
    id: str = Field(..., description="Unique ID from the frontend map")
    province_code: Optional[str] = Field(None, description="Province code if polygon is within a province")

    lu_polygon: List[LUPolygon] = Field(..., description="List of selected land use polygons to be included in the estimation")

    project_type: Optional[str] = Field(None, description="Type of project, e.g. 'replanting', 'existing', etc.")

    year_of_planting: Optional[int] = Field(None, description="Manual year. If None, extract from raster.")
    rubber_clone: Optional[str] = Field(None, description="Clone type for growth coefficients")

    tree_count: Optional[int] = Field(None, description="User-defined count. If None, calculate using area and spacing.")
    spacing_system: Optional[str] = Field(None, description="Standard spacing, e.g. '2.5x8' = 500 trees/ha")


class PlantationInfoPolygon(BaseModel):
    id: str = Field(..., description="Unique ID from the frontend map")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")

    project_type: Optional[str] = Field(None, description="Type of project, e.g. 'replanting', 'existing', etc.")  

class StatusMessage(BaseModel):
    status: str
    status_code: str
    message: str


class YearlyEstimate(BaseModel):
    year: int
    total_carbon_tCO2e: float
    ci_lower_tCO2e: float
    ci_upper_tCO2e: float


class PlantationEstimationResponse(BaseModel):
    polygon_id: str
    status: StatusMessage
    carbon_profile: Optional[List[YearlyEstimate]] = None


class PlantationInfoResponse(BaseModel):
    polygon_id: str
    province_code: Optional[str] = Field(None, description="Province code if polygon is within a province")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")
    area_m2: Optional[float] = Field(None, description="Area in square meters")
    status: StatusMessage
    lu_polygon: Optional[List[LUPolygon]] = None  