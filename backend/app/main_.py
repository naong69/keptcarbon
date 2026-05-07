import os
import asyncio
import logging
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncpg

app = FastAPI()
db_pool: Optional[asyncpg.pool.Pool] = None

# Pydantic models
class CarbonProject(BaseModel):
    name: str
    location: str
    tons_offset: float
    description: Optional[str] = None

class CarbonProjectResponse(BaseModel):
    id: int
    name: str
    location: str
    tons_offset: float
    description: Optional[str] = None
    created_at: str

# In-memory storage (replace with DB queries in production)
projects_db = []
project_counter = 0


async def _create_pool_with_retries(host, port, user, password, database, max_retries=10, base_delay=1):
    """Try to create an asyncpg pool with retries and exponential backoff."""
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            pool = await asyncpg.create_pool(host=host, port=port, user=user, password=password, database=database)
            logging.info(f"Connected to DB on attempt {attempt}")
            return pool
        except Exception as e:
            last_exc = e
            logging.warning(f"DB connection attempt {attempt} failed: {e}")
            if attempt == max_retries:
                break
            # exponential backoff with a small cap
            await asyncio.sleep(min(base_delay * (2 ** (attempt - 1)), 10))
    raise last_exc


@app.on_event("startup")
async def startup():
    global db_pool
    db_host = os.getenv("DATABASE_HOST", "db")
    db_port = int(os.getenv("DATABASE_PORT", "5432"))
    user = os.getenv("DATABASE_USER", "postgres")
    password = os.getenv("DATABASE_PASSWORD", "postgres")
    database = os.getenv("DATABASE_NAME", "keptcarbon")
    db_pool = await _create_pool_with_retries(db_host, db_port, user, password, database)


@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db_version")
async def db_version():
    global db_pool
    if not db_pool:
        return {"error": "no db pool"}
    async with db_pool.acquire() as conn:
        version = await conn.fetchval("select version()")
    return {"version": version}


@app.get("/projects", response_model=list[CarbonProjectResponse])
async def list_projects(min_tons: float = 0):
    """Get all carbon projects, optionally filtered by minimum tons offset."""
    filtered = [p for p in projects_db if p["tons_offset"] >= min_tons]
    return filtered


@app.post("/projects", response_model=CarbonProjectResponse)
async def create_project(project: CarbonProject):
    """Create a new carbon offset project."""
    global project_counter
    project_counter += 1
    new_project = {
        "id": project_counter,
        "name": project.name,
        "location": project.location,
        "tons_offset": project.tons_offset,
        "description": project.description,
        "created_at": datetime.utcnow().isoformat()
    }
    projects_db.append(new_project)
    return new_project
