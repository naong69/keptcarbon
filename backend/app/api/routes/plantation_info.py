from fastapi import APIRouter, HTTPException
from app.schemas.plantation import PlantationInfoPolygon, PlantationInfoResponse
from app.services.plantation_service import PlantationService

router = APIRouter()

service = PlantationService()


@router.post("/plantation-info", response_model=PlantationInfoResponse)
async def get_info(polygon: PlantationInfoPolygon):
    try:
        poly_data = polygon.model_dump()
        result = await service.get_plantation_info(poly_data)
        return result
    except Exception as e:
        print(f"Error processing plantation info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process plantation info: {str(e)}"
        )
