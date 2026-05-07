from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class PlantationPolygon(BaseModel):
    id: str = Field(..., description="Unique ID from the frontend map")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Polygon or MultiPolygon")

    year_of_planting: Optional[int] = Field(None, description="Manual year. If None, extract from raster.")
    rubber_clone: Optional[str] = Field(None, description="Clone type for growth coefficients")

    tree_count: Optional[int] = Field(None, description="User-defined count. If None, calculate using area and spacing.")
    spacing_system: Optional[str] = Field(None, description="Standard spacing, e.g. '2.5x8' = 500 trees/ha")


class StatusMessage(BaseModel):
    status: str
    status_code: str
    message: str


class YearlyEstimate(BaseModel):
    year: int
    total_carbon_tCO2e: float
    ci_lower_tCO2e: float
    ci_upper_tCO2e: float


class EstimationResponse(BaseModel):
    polygon_id: str
    status: StatusMessage
    carbon_profile: Optional[List[YearlyEstimate]] = None