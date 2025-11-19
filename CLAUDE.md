# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hospital Area Analysis - A geospatial web application for analyzing population demographics within hospital service areas. Users can draw circles/polygons on a Kakao Map or select administrative regions to query census data and visualize age distribution statistics.

## Architecture

**Stack**: FastAPI (Python) + Vanilla JavaScript + Supabase (PostgreSQL/PostGIS)

- **Backend**: FastAPI server handling geospatial analysis via Supabase RPC calls
- **Frontend**: Single-page application with no build process (vanilla JS/HTML/CSS)
- **Database**: Supabase with PostGIS extension for geospatial operations
- **Map Engine**: Kakao Maps JavaScript SDK v2 with Drawing libraries
- **Deployment**: Docker + Docker Compose, designed for AWS EC2 + CloudFront

### Key Technical Characteristics

- **No frontend build process** - Direct file editing and browser refresh workflow
- **Grid-based population analysis** - 100m grid cells with 1km parent grids for age distribution
- **Hierarchical region lookup** - Requires parent_cd traversal due to duplicate region names
- **In-memory data loading** - Administrative codes loaded at server startup (~348KB)
- **Dual caching strategy** - Server-side (OrderedDict LRU) + client-side (SessionStorage) for boundary data

## Development Commands

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Start development server (runs on port 8000)
python server.py

# Access application
open http://localhost:8000
```

**Critical**: Server requires `.env` file with `SUPABASE_URL` and `SUPABASE_KEY`. On startup, it loads `static/korea_admin_codes.json` into memory - missing file will cause startup failure.

### Docker Development

```bash
# Build and run with Docker Compose
docker compose up --build -d

# View logs
docker compose logs -f

# Stop containers
docker compose down

# Rebuild after code changes
docker compose up --build -d
```

### Debugging

```bash
# Check health endpoint
curl http://localhost:8000/health

# View cache statistics
curl http://localhost:8000/cache/stats

# Clear server-side cache
curl -X DELETE http://localhost:8000/cache/clear

# Check diagnostics
docker compose ps
docker compose logs web
```

## Critical Implementation Details

### 1. Administrative Region Lookup Algorithm

**Problem**: Region names are not unique (e.g., multiple "중구" districts exist).

**Solution**: Hierarchical lookup using `parent_cd` field (`RegionLookupService.find_region_code()` in server.py:206-272).

```python
# MUST traverse in order: sido → sigungu → dong
# Each level checks both name AND parent_cd match
# Example: Finding "중구" in Seoul
sido_code = find_by_name("서울특별시")  # Returns "11"
sigungu_code = find_by_name_and_parent("중구", parent_cd="11")  # Not just name!
```

**Files**:
- `static/korea_admin_codes.json` - Backend lookup (loaded into memory at startup)
- `static/korea_admin_tree.json` - Frontend dropdown population

### 2. Grid-Based Population Analysis

**Two-level grid system**:
1. **100m grids** (`census_grid_100m`) - Fine-grained population/household counts
2. **1km grids** (`grid_1km_age_ratio`) - Age distribution ratios stored as JSON

**Analysis flow** (executed in Supabase RPC `analyze_hospital_service_area`):
```sql
1. ST_Intersection(drawn_shape, 100m_grid) → Calculate overlap ratios
2. Group by parent_cd (1km grid) → Aggregate weighted populations
3. JOIN with grid_1km_age_ratio → Apply age distribution
4. Return total population + age breakdown
```

### 3. Boundary Caching Architecture

**Server-side** (server.py:357-432):
- OrderedDict LRU cache with configurable limits (MAX_CACHE_SIZE=100, MAX_CACHE_MEMORY_MB=50)
- Automatic eviction when limits reached
- Cache key format: `"{level}:{region_code}"`

**Client-side** (app.js:1501-1591):
- SessionStorage for boundary GeoJSON data
- Cache key format: `"boundary_{level}_{sido}_{sigungu}_{dong}"`
- Quota exceeded handling with LRU cleanup

**Important**: Population data is NEVER cached (always fresh from DB), only boundary geometries.

### 4. Coordinate System Standards

**All coordinates use WGS84 (EPSG:4326)**:
- Longitude first, then latitude (GeoJSON standard)
- Circle data: `{center_lng, center_lat, radius}` (radius in meters)
- Polygon data: `{coordinates: [[lng, lat], [lng, lat], ...]}`
- Kakao Maps uses LatLng(lat, lng) but data is stored as [lng, lat]

### 5. Cache Busting Strategy

Frontend files use versioned filenames to prevent browser caching issues:
- CSS: `/static/app.css` (referenced in index.html:7)
- JS: `/static/app.js` (referenced in index.html:148)

**When deploying**: Change filenames (e.g., `app_v2.js`) to force cache invalidation.

## API Endpoints

### Analysis Endpoints

```
POST /analyze
  Body: {type: "circle"|"polygon", data: {...}}
  Returns: PopulationResult with age_distribution

POST /getRegionPop
  Body: {sido, sigungu?, dong?, level: "sido"|"sigungu"|"dong"}
  Returns: PopulationResult with boundary coordinates

POST /getHospitals
  Body: {sw_lat, sw_lng, ne_lat, ne_lng, department?, has_specialist?}
  Returns: Hospital list with pagination (1000 per page)

GET /getHospitalDetail/{ykiho}
  Returns: Detailed hospital info (basic, departments, equipment, hours)

GET /getDepartments
  Returns: Hardcoded list of 47 medical departments
```

### Utility Endpoints

```
GET /health
  Returns: {status, database, version}

GET /cache/stats
  Returns: Cache hit rate, memory usage, item count

DELETE /cache/clear
  Clears server-side boundary cache
```

## Database Schema (Supabase)

### Core Tables

**Administrative Boundaries** (PostGIS geometry):
- `bnd_sido`, `bnd_sigungu`, `bnd_adm_dong` - Geometry columns in SRID 5179 (Korean TM)

**Population Data**:
- `census_grid_100m` - Columns: region_cd, parent_cd (→1km), pop, households
- `grid_1km_age_ratio` - Columns: grid_id, age_ratios (JSONB)
- `census_region` - Columns: region_cd, pop, households, "10세 미만"..."100세 이상"

**Hospital Data**:
- `hospital_basic` - Columns: ykiho (PK), yadmnm (name), xpos (lng), ypos (lat)
- `hospital_departments` - Columns: ykiho, dgsbjtcdnm (dept name), dgsbjtprsdrcnt (specialist count)
- `hospital_medical_equipment` - Columns: ykiho, oftcdnm (equipment), oftcnt (count)
- `hospital_detail` - Columns: ykiho, trmtmonstart...trmtsunend (hours), parkxpnsyn, parkqty

### Key RPC Functions

```sql
analyze_hospital_service_area(shape_type text, shape_data json)
  -- Main analysis function (grid intersection + age distribution)

get_region_boundary_wgs84(p_region_code text, p_level text)
  -- Returns GeoJSON boundary + centroid in WGS84
```

## Frontend Architecture

### Map Integration

**Drawing Manager** (app.js:538-710):
- Modes: CIRCLE, POLYGON only
- Non-draggable, non-editable after creation
- Displays live radius overlay during circle drawing
- Auto-triggers analysis on `drawend` event

**Region Selection** (app.js:1086-1328):
- Hierarchical dropdowns: sido → sigungu → dong
- Dynamic query button text based on selection depth
- Displays boundary polygons with centroid markers

**Hospital Search** (app.js:122-258):
- Searches current map bounds with filters
- Pagination handles 1000+ results per page
- Detail panel slides in from right with full hospital info

### UI Components

**Sidebar** (index.html:28-122):
- Toggles with animation (CSS transform)
- Two tabs: "인구수" (population) and "병원" (hospital)
- Contains region selection, drawing tools, and results display

**Hospital Detail Panel** (index.html:125-132):
- Separate from sidebar (can coexist)
- Displays: departments with specialist counts, equipment, hours, parking

### Data Visualization

**Age Distribution Table** (app.js:804-851):
- Interactive cell selection with drag-to-select
- Real-time sum calculation for selected cells
- Supports both population counts and percentages

## Environment Variables

Required in `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key  # NEVER expose to frontend!

HOST=0.0.0.0
PORT=8000

ALLOWED_ORIGINS=*  # Use specific domains in production
```

## Deployment

### Docker Deployment (Recommended)

See README.md for full AWS EC2 + CloudFront deployment guide.

**Key steps**:
1. Build with Docker Compose: `docker compose up --build -d`
2. Nginx serves static files, proxies API to FastAPI container
3. Configure CloudFront origin to EC2:8000
4. Update `ALLOWED_ORIGINS` to CloudFront domain

**Docker Compose Architecture**:
- `nginx` service: Reverse proxy on port 80
- `web` service: FastAPI backend on port 8000 (internal only)
- Shared `app-network` bridge network

### Health Checks

Both containers include health checks:
- Nginx: `wget http://localhost:80/nginx-health`
- FastAPI: `curl http://localhost:8000/health`

## Code Style & Patterns

### Backend (server.py)

- **Service classes**: `SpatialAnalysisService`, `RegionLookupService`
- **Dependency injection**: FastAPI `Depends()` for service instantiation
- **Pydantic validation**: All API inputs validated (e.g., radius 0-50000m)
- **Error handling**: Returns `{error: true, message: "..."}` or HTTPException
- **Logging**: INFO level with context (cache hits/misses, SQL queries)

### Frontend (app.js)

- **Global state**: `selectionMode`, `koreaAdminData`, `hospitalMarkers`, `currentSelectedHospital`
- **Async/await**: All API calls use fetch with try/catch
- **Event-driven**: Kakao Maps event listeners for drawing, clicks, hovers
- **No frameworks**: Pure JavaScript with DOM manipulation

## Common Development Tasks

### Adding a New Administrative Region

1. Update `static/korea_admin_codes.json` with new region codes and parent_cd
2. Update `static/korea_admin_tree.json` for frontend dropdowns
3. Insert region into appropriate Supabase boundary table
4. Add census data to `census_region` table
5. Restart server to reload in-memory codes

### Adding a New Analysis Type

1. Define Pydantic model in server.py (inherit from BaseModel)
2. Add RPC function in Supabase
3. Create endpoint in server.py (POST /analyze_new_type)
4. Add frontend UI controls in index.html
5. Implement analysis trigger in app.js
6. Display results using existing `displayAnalysisResults()` pattern

### Modifying Cache Strategy

**Server-side**:
- Adjust `MAX_CACHE_SIZE` and `MAX_CACHE_MEMORY_MB` in server.py:27-28
- Modify `check_cache_limits()` for custom eviction logic

**Client-side**:
- Edit `clearOldBoundaryCache()` in app.js:1564-1577 for LRU strategy
- Change SessionStorage key prefix in `getBoundaryCacheKey()`

## Performance Considerations

- **Startup time**: ~2-3 seconds (loads korea_admin_codes.json)
- **Analysis latency**: 500ms-2s depending on grid overlap complexity
- **Cache hit rate**: Typically 60-80% for region boundaries after warmup
- **Hospital search**: Paginated queries handle 10,000+ hospitals efficiently
- **Memory footprint**: ~100MB base + ~50MB boundary cache = ~150MB total

## Known Limitations

1. **Single-threaded backend**: Uvicorn runs single worker (use Gunicorn for production)
2. **No authentication**: Service role key has full DB access (OK for internal use)
3. **Hardcoded departments list**: `/getDepartments` returns static array (not from DB)
4. **SessionStorage limits**: Browser limits ~5-10MB (boundary cache cleanup handles this)
5. **Korean language only**: UI text, region names, age labels all in Korean

## Troubleshooting

### Server won't start
- Check `.env` file exists and has SUPABASE_URL/KEY
- Verify `static/korea_admin_codes.json` exists
- Check port 8000 not in use: `lsof -i :8000`

### Analysis returns 0 population
- Verify drawn shape intersects land (not ocean)
- Check Supabase RPC function exists: `analyze_hospital_service_area`
- Review server logs for SQL errors

### Region boundary not displaying
- Check browser console for cache errors
- Verify region code exists in bnd_* tables
- Clear SessionStorage: `sessionStorage.clear()`

### Docker containers unhealthy
- View logs: `docker compose logs -f`
- Check health endpoints manually inside container
- Verify .env mounted correctly: `docker compose exec web env | grep SUPABASE`
