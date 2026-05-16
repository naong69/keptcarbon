from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import plantation_info, estimate

def create_application() -> FastAPI:
    """
    Initializes the FastAPI app with GeoAI configurations.
    """
    application = FastAPI(
        title="Rubber Plantation Carbon Estimator",
        description="Backend API for spatiotemporal mapping of biomass and carbon stocks",
        version="1.0.0",
    )

    # Configure CORS for the frontend web map to interact with the API
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, replace with specific frontend domains
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include the estimation routes
    application.include_router(
        estimate.router, 
        prefix="/api/v1", 
        tags=["Carbon Estimation"]
    )

    # Include the plantation info routes
    application.include_router(
        plantation_info.router,
        prefix="/api/v1",
        tags=["Plantation Management"]
    )

    return application

app = create_application()

@app.get("/")
async def root():
    """
    Health check endpoint.
    """
    return {
        "message": "GeoAI Backend Dev: Carbon Estimation System is Online",
        "status": "active"
    }