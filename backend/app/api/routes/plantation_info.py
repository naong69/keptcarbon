from fastapi import APIRouter, HTTPException
from app.schemas.plantation import PlantationInfoPolygon, PlantationInfoResponse
from app.services.plantation_service import PlantationService

router = APIRouter()

# Initialize service once to leverage pre-loaded spatial data
service = PlantationService()

@router.post("/plantation-info", response_model=PlantationInfoResponse)
async def get_info(polygon: PlantationInfoPolygon):
    """
    Endpoint to validate a polygon's location and rubber area 
    before performing carbon estimation.
    """
    try:
        # Convert Pydantic model to dict for processing
        poly_data = polygon.model_dump()
        
        # Execute spatial preprocessing
        result = await service.get_plantation_info(poly_data)
        
        # Return the enriched data (including province_code and a302_geometry)
        return result

    except Exception as e:
        print(f"Error processing plantation info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process plantation info: {str(e)}"
        )