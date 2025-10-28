# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a hospital area analysis web application that uses the Kakao Maps API to visualize and analyze hospital service areas through interactive map drawing tools. It consists of a frontend web interface and a Python FastAPI backend that integrates with Supabase for geospatial population analysis.

## Architecture

- **Hybrid Architecture**: Frontend web application with Python FastAPI backend
- **Frontend**: Pure HTML/CSS/JavaScript with no build process
- **Backend**: FastAPI server with Supabase integration for geospatial data processing
- **Database**: Supabase (PostgreSQL with PostGIS) storing census data and administrative boundaries
- **Kakao Maps SDK**: Uses Kakao Maps JavaScript API v2 with drawing libraries
- **Drawing functionality**: Implements circle and polygon drawing tools for area analysis
- **Region Selection**: Administrative region hierarchy (sido → sigungu → dong) for census data queries
- **Responsive design**: Includes a collapsible sidebar for tools and controls

## Development Commands

### Running the Application
```bash
# Start the FastAPI development server
python server.py
```
The server runs on `localhost:5500` and serves the application at `http://localhost:5500`

**Important**: On startup, the server automatically loads `static/korea_admin_codes.json` into memory. If this file is missing or corrupted, the server will fail to start.

### Development Workflow
- **Frontend changes**: Edit files in `/static/` directory and refresh browser
- **Backend changes**: Restart the Python server to apply changes
- **No build process**: Direct file editing for frontend development

### Debugging
- Backend uses Python's standard `logging` module at INFO level
- Check server console output for request/response logs
- API errors return structured JSON with `error: true` flag

## Key Components

### Frontend
- `index.html`: Main HTML structure with Kakao Maps container and UI controls
- `static/script.js`: Core JavaScript functionality including map initialization, Drawing Manager, region selection UI, and HTTP clients for backend communication
- `static/style.css`: Styling for sidebar, map controls, and responsive layout
- `static/korea_admin_codes.json`: Hierarchical administrative region codes (sido/sigungu/dong) with parent relationships
- `static/korea_admin_tree.json`: Tree structure of Korean administrative regions

### Backend ([server.py](server.py))
- **SpatialAnalysisService**: Service class handling geospatial analysis via Supabase RPC calls
- **RegionLookupService**: Service class for hierarchical administrative region code lookups (loaded from memory at startup)
- **API Endpoints**:
  - `GET /`: Serves the main HTML file
  - `POST /analyze`: New endpoint for drawing-based population analysis (returns `PopulationResult`)
  - `POST /getPop`: Legacy/hybrid endpoint for backward compatibility
  - `POST /getRegionPop`: Administrative region-based population queries (returns `PopulationResult`)
  - `POST /getDrawingPop`: Legacy endpoint for receiving shape data
  - `GET /health`: Health check with database connection test
- **Data Models**: Pydantic models for circles, polygons, regions, and population results
- **Startup Event**: `@app.on_event("startup")` loads `korea_admin_codes.json` into global memory

### Database (Supabase)
See [database.md](database.md) for full schema. Key tables:
- `bnd_adm_dong`, `bnd_sigungu`, `bnd_sido`: Administrative boundary geometries (PostGIS geometry columns)
- `grid_100m`: 100m grid cells with geometries
- `census_grid_100m`: Population and household counts per 100m grid (includes `parent_cd` linking to 1km grid)
- `grid_1km_age_ratio`: Age distribution ratios per 1km grid (JSON column `age_ratios`)
- `census_region`: Age-specific population by administrative region code (contains columns like "10세 미만", "10대", etc.)

**Key RPC Function**:
- `analyze_hospital_service_area(shape_type, shape_data)`: Main geospatial analysis function that processes circles/polygons and returns population data

### Algorithm Documentation
- `격자 선정 알고리즘.md`: Grid selection algorithm for drawing-based analysis
- `지역 선택 부분 알고리즘.md`: Administrative region selection workflow

## Data Flow

### Drawing-based Analysis (Circles/Polygons)
1. User draws shapes on map using Drawing Manager
2. Frontend captures shape data (center/radius for circles, coordinate arrays for polygons)
3. Data sent to backend via `POST /analyze` or `POST /getPop`
4. Backend calls Supabase RPC function `analyze_hospital_service_area` with shape parameters
5. Supabase performs geospatial intersection with 100m grid cells:
   - Calculates overlap ratio between drawn shape and each grid cell
   - Aggregates population/households by parent 1km grid (using `parent_cd`)
   - Applies age distribution ratios from `grid_1km_age_ratio`
   - Returns total population, households, and age-specific breakdowns
6. Results displayed in sidebar with age distribution charts

### Region-based Analysis (Sido/Sigungu/Dong)
1. User selects administrative region from hierarchical dropdown (populated from `korea_admin_tree.json`)
2. Frontend sends region data to `POST /getRegionPop` with `{sido, sigungu, dong, level}`
3. Backend performs hierarchical lookup via `RegionLookupService`:
   - Uses in-memory `korea_admin_codes.json` (loaded at startup)
   - Must traverse sido → sigungu → dong in order due to name duplicates
   - Uses `parent_cd` to ensure correct region resolution (e.g., sigungu must match both name AND parent sido code)
   - Query stops at specified `level` ("sido", "sigungu", or "dong")
   - Returns the administrative region code as a string
4. Retrieved region code queries `census_region` table in Supabase (`region_cd` column)
5. Backend transforms database columns to `PopulationResult` format
6. Returns age-specific population counts, total households, and average household size
7. Results displayed in sidebar similar to drawing-based analysis

## External Dependencies

### Frontend
- Kakao Maps JavaScript SDK v2 (loaded via CDN)
- Kakao Maps Drawing libraries extension
- Kakao Maps API Key: `8d14685beb674db45953e6e3f0d85a92`

### Backend
- FastAPI (web framework)
- Uvicorn (ASGI server)
- Pydantic (data validation)
- supabase-py (Supabase client)

### Database
- Supabase URL: `https://vsmfqmbumthyhvvozxxb.supabase.co`
- Uses service role key for backend access
- PostGIS extension for geospatial operations

## Technical Implementation Details

### Geospatial Processing
- **Coordinate Systems**: WGS84 (EPSG:4326) for all geospatial data
- **Grid-based Analysis**: 100m grid cells with 1km parent grids for age distribution
- **Overlap Calculation**: PostGIS `ST_Intersection` and `ST_Area` for precise population weighting
- **Distance Calculations**: Haversine formula via Kakao Maps API

### Administrative Region Hierarchy
- **3-tier hierarchy**: sido (시/도) → sigungu (시/군/구) → dong (행정동)
- **Hierarchical lookup required**: Names alone are ambiguous; must use `parent_cd` to traverse correctly
  - Example: Multiple regions can have same sigungu name (e.g., "중구"), so must check `parent_cd` matches sido code
  - `RegionLookupService.find_region_code()` implements this logic in [server.py:120-186](server.py#L120-L186)
- **Region codes**: Numeric codes matching Korean administrative standards
- **Two JSON files**:
  - `korea_admin_codes.json`: Backend lookup (loaded into memory, ~348KB)
  - `korea_admin_tree.json`: Frontend dropdown population (~76KB)

### API Patterns
- **Dual endpoint strategy**: `/analyze` (new clean API) and `/getPop` (hybrid legacy support)
- **RPC-based analysis**: Heavy geospatial logic handled in Supabase database functions
- **Error handling**: Returns structured error responses with `error: true` flag
- **Dependency Injection**: FastAPI `Depends()` used for service instantiation
- **Validation**: Pydantic models validate all input data (e.g., radius must be 0-50000m)

## Important Implementation Notes

### Drawing Manager Integration
- Frontend uses Kakao Maps Drawing Manager (`kakao.maps.drawing.DrawingManager`)
- Drawing modes: `CIRCLE` and `POLYGON` only
- All overlays are non-draggable and non-editable after creation (`draggable: false, editable: false`)
- Overlays are removable by user (`removable: true`)
- When switching drawing modes, previous drawings are cleared (`manager.clear()`)

### Coordinate Systems and Precision
- All coordinates use WGS84 (EPSG:4326) latitude/longitude
- Circle data: `{center_lng, center_lat, radius}` where radius is in meters
- Polygon data: `{coordinates: [[lng1, lat1], [lng2, lat2], ...]}` as array of [longitude, latitude] pairs
- Coordinate order: **longitude first, then latitude** (GeoJSON standard)

### Service Role Key Security
- **CRITICAL**: `SUPABASE_KEY` in [server.py:33](server.py#L33) is the service role key (full database access)
- This key should **never** be exposed to frontend clients
- Frontend makes requests to backend API only; backend handles all Supabase communication

### Age Distribution Column Names
- Census data uses Korean age range labels: "10세 미만", "10대", "20대", ..., "100세 이상"
- Backend handles both formats in column names (e.g., both "10세 미만" and "10세미만")
- Consistent mapping is critical for `PopulationResult.age_distribution` dictionary keys