# KeptCarbon Platform

Carbon stock estimation system for Thai rubber plantations.

## Services

| Service | URL | Description |
|---|---|---|
| Next.js frontend | http://localhost:3000 | Web app + Next.js API routes |
| FastAPI backend | http://localhost:8080 | Carbon estimation engine |
| PostGIS | localhost:4533 | Spatial database |

## API Reference

See [api.http](api.http) for runnable request examples.

---

### Backend — FastAPI (`http://localhost:8080`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/v1/estimate` | Carbon stock estimation for one or more rubber plantation polygons |
| `POST` | `/api/v1/plantation-info` | Province detection + land use classification for a drawn polygon |

#### `POST /api/v1/estimate` — key fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier from the frontend map |
| `geometry` | GeoJSON | yes | Polygon or MultiPolygon (EPSG:4326) |
| `year_of_planting` | int | no | CE year — extracted from raster if null |
| `rubber_clone` | string | no | `"RRIM 600"` (default) or `"RRIT 251"` |
| `tree_count` | int | no | User-defined count — calculated from area + spacing if null |
| `spacing_system` | string | no | `"2.5x8"` (default), `"3x7"`, `"3x8"`, `"2.5x7"`, `"3x6"` |

#### `POST /api/v1/plantation-info` — key fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier |
| `geometry` | GeoJSON | yes | Polygon or MultiPolygon (EPSG:4326) |
| `project_type` | string | no | e.g. `"replanting"`, `"existing"` |

`lu_class` values in response: `A302` rubber, `F` forest, `U` urban, `W` water, `M` miscellaneous, `OTHER`

---

### Next.js API Routes (`http://localhost:3000`)

Authentication uses an HttpOnly JWT cookie (`auth_token`). Log in first via `/api/auth/login` or `/api/auth/register`, then include the cookie on subsequent requests.

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Create a new local account (`email`, `password`, `fullname`, `phone?`) |
| `POST` | `/api/auth/login` | — | Login with email or username (`login`, `password`) — sets JWT cookie |
| `GET` | `/api/auth/me` | cookie | Return the current authenticated user |
| `POST` | `/api/auth/logout` | cookie | Clear the JWT cookie |
| `GET` | `/api/auth/line` | — | Redirect to LINE OAuth (browser only) |

#### User

| Method | Path | Auth | Description |
|---|---|---|---|
| `PUT` | `/api/profile/update` | cookie | Update `firstname`, `lastname`, `phone` for the current user |

#### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | cookie | Aggregate stats, age chart data, map plots, bounding box |

#### Parcels

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/parcels/search` | cookie | Find A302 rubber parcels intersecting a drawn polygon (max 2000, clipped to boundary) |

`relation` param: `"intersects"` (default), `"touches"`, `"contains"`

#### Admin — Users (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List all users |
| `PATCH` | `/api/admin/users` | Update `role`, `fullname`, or `phone` for a user |
| `DELETE` | `/api/admin/users` | Delete a user by `id` |

#### Admin — Parcels (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/parcels` | List `rubber_plots` rows with filters: `province`, `amphoe_t`, `tambon`, `grow_year_min`, `grow_year_max`, `limit`, `offset` |
| `GET` | `/api/admin/parcels/filters` | Distinct province list; add `?province=X` for district list |
| `PATCH` | `/api/admin/rubber-age` | Bulk-update `rubber_age`, `gee_plant_year`, `gee_age`, `gee_confidence` for plot IDs |

#### Admin — Rubber Age Detection (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rubber-age/bfast` | Run BFAST-based planting-year detection on a set of plots via the GEE service |
| `POST` | `/api/rubber-age/bfast-raster/generate` | Generate a rubber-age raster tile over a region using the GEE service |
| `POST` | `/api/rubber-age/from-raster` | Extract per-plot rubber age from a pre-generated raster and bulk-write results |

---

## Quick Start

```bash
# Start all services
docker compose up -d

# Backend logs
docker logs keptcarbon-backend-1 -f

# Run backend tests
docker exec keptcarbon-backend-1 pytest tests/ -v

# Run frontend tests
cd nextjs && npm test
```
