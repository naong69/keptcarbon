from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.plantation import PlantationPolygon, EstimationResponse
from app.services.carbon_service import CarbonService

router = APIRouter()


@router.post("/estimate", response_model=List[EstimationResponse])
async def estimate_carbon(polygons: List[PlantationPolygon]):
    service = CarbonService()
    results = []

    for poly in polygons:
        try:
            # Convert Pydantic model -> dict
            poly_data = poly.model_dump()

            # Run full workflow
            report = await service.get_carbon_profile(poly_data)

            results.append(report)

        except Exception as e:
            polygon_id = getattr(poly, "id", "unknown")
            raise HTTPException(
                status_code=500,
                detail=f"Error processing {polygon_id}: {str(e)}"
            )

    return results