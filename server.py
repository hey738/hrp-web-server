from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import List, Union, Any, Optional, Dict
import uvicorn
import logging
import os
import json
import sys
from supabase import create_client, Client
from functools import lru_cache
from datetime import datetime
from collections import OrderedDict
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

app = FastAPI(title="Hospital Area Analysis API", version="1.0.0")

# 전역 변수: 행정구역 코드 데이터 (앱 시작 시 로드)
korea_admin_codes = None

# 캐시 설정
MAX_CACHE_SIZE = 100  # 최대 100개 항목 (약 20MB)
MAX_CACHE_MEMORY_MB = 50  # 최대 50MB

# 전역 변수: 경계 데이터 캐시 (LRU를 위해 OrderedDict 사용)
boundary_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
cache_stats = {
    'hits': 0,
    'misses': 0,
    'total_requests': 0,
    'evictions': 0  # LRU 삭제 횟수
}

def evict_lru_cache():
    """LRU 방식으로 가장 오래된 캐시 항목 삭제"""
    global boundary_cache, cache_stats

    if len(boundary_cache) > 0:
        # OrderedDict의 첫 번째 항목 (가장 오래된 항목) 삭제
        oldest_key = next(iter(boundary_cache))
        del boundary_cache[oldest_key]
        cache_stats['evictions'] += 1
        logger.info(f"✓ LRU 캐시 삭제: {oldest_key} (총 {len(boundary_cache)}개 남음)")

def get_cache_memory_usage():
    """캐시 메모리 사용량 추정 (MB)"""
    total_size = sys.getsizeof(boundary_cache)
    for key, value in boundary_cache.items():
        total_size += sys.getsizeof(key) + sys.getsizeof(value)
    return total_size / (1024 * 1024)  # MB로 변환

def check_cache_limits():
    """캐시 제한 확인 및 자동 정리"""
    global boundary_cache

    # 항목 수 제한
    while len(boundary_cache) >= MAX_CACHE_SIZE:
        logger.warning(f"캐시 항목 수 제한 도달: {len(boundary_cache)}/{MAX_CACHE_SIZE}")
        evict_lru_cache()

    # 메모리 제한 (선택적)
    memory_mb = get_cache_memory_usage()
    if memory_mb > MAX_CACHE_MEMORY_MB:
        logger.warning(f"캐시 메모리 제한 도달: {memory_mb:.2f}MB/{MAX_CACHE_MEMORY_MB}MB")
        # 10% 정도 삭제
        items_to_remove = max(1, len(boundary_cache) // 10)
        for _ in range(items_to_remove):
            evict_lru_cache()

# 로깅 설정 (CORS보다 먼저 설정하여 로그 출력 가능)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS 설정 - 환경 변수에서 허용 도메인 로드
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")

# 쉼표로 구분된 도메인 목록을 배열로 변환
if allowed_origins_env == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 환경 변수에서 Supabase 설정 로드
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# 필수 환경 변수 검증
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL 및 SUPABASE_KEY 환경 변수가 설정되지 않았습니다")
    raise ValueError("SUPABASE_URL 및 SUPABASE_KEY 환경 변수가 필요합니다. .env 파일을 확인하세요.")

logger.info(f"Supabase URL: {SUPABASE_URL}")
logger.info("Supabase 클라이언트 초기화 완료")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app.mount("/static", StaticFiles(directory="static"), name="static")

# 새로운 분석용 데이터 모델
class CircleAnalysisData(BaseModel):
    center_lng: float
    center_lat: float
    radius: float
    segments: Optional[int] = 32

    @validator('radius')
    def validate_radius(cls, v):
        if v <= 0 or v > 50000:  # 최대 50km
            raise ValueError('반지름은 0보다 크고 50km 이하여야 합니다')
        return v

class PolygonAnalysisData(BaseModel):
    coordinates: List[List[float]]  # [[lng1,lat1], [lng2,lat2], ...]

    @validator('coordinates')
    def validate_coordinates(cls, v):
        if len(v) < 3:
            raise ValueError('다각형은 최소 3개의 좌표가 필요합니다')
        return v

class DrawingObject(BaseModel):
    type: str  # "circle" | "polygon"
    data: Union[CircleAnalysisData, PolygonAnalysisData]

    @validator('type')
    def validate_type(cls, v):
        if v not in ['circle', 'polygon']:
            raise ValueError('type은 circle 또는 polygon이어야 합니다')
        return v

class Centroid(BaseModel):
    """중심점 좌표 (WGS84)"""
    lng: float  # 경도
    lat: float  # 위도

class BoundaryCoordinates(BaseModel):
    """행정구역 경계 좌표 (WGS84 GeoJSON 형식)"""
    type: str  # "Polygon" 또는 "MultiPolygon"
    coordinates: Any  # GeoJSON 좌표 배열
    centroid: Centroid  # 경계의 중심점

class PopulationResult(BaseModel):
    total_population: int
    total_households: int
    age_distribution: Dict[str, int]
    analysis_area_sqm: float
    shape_type: str
    boundary: Optional[BoundaryCoordinates] = None  # 행정구역 경계 좌표 (WGS84)
    error: Optional[bool] = None
    message: Optional[str] = None

# 기존 레거시 모델 (호환성 유지)
class CircleData(BaseModel):
    type: str
    center: Any
    radius: Any

class PolygonData(BaseModel):
    type: str
    points: Any

class RegionData(BaseModel):
    sido: str
    sigungu: Optional[str] = None
    dong: Optional[str] = None
    level: str  # "sido", "sigungu", "dong"

# 앱 시작 이벤트: korea_admin_codes.json 로드
@app.on_event("startup")
async def load_region_codes():
    """앱 시작 시 행정구역 코드 데이터를 로드합니다"""
    global korea_admin_codes
    try:
        korea_admin_codes_path = os.path.join("static", "korea_admin_codes.json")
        with open(korea_admin_codes_path, 'r', encoding='utf-8') as f:
            korea_admin_codes = json.load(f)
        logger.info(f"행정구역 코드 데이터 로드 완료: sido {len(korea_admin_codes['sido'])}개, "
                   f"sigungu {len(korea_admin_codes['sigungu'])}개, "
                   f"dong {len(korea_admin_codes['dong'])}개")
    except Exception as e:
        logger.error(f"행정구역 코드 데이터 로드 실패: {str(e)}")
        raise

# 서비스 클래스
class RegionLookupService:
    """행정구역 계층 조회 서비스"""

    def __init__(self):
        self.admin_codes = korea_admin_codes
        if not self.admin_codes:
            raise ValueError("행정구역 코드 데이터가 로드되지 않았습니다")

    def find_region_code(self, sido: str, sigungu: Optional[str], dong: Optional[str], level: str) -> str:
        """
        계층적으로 행정구역 코드를 찾습니다.
        반드시 sido -> sigungu -> dong 순으로 조회해야 합니다 (중복 이름 때문에).

        Args:
            sido: 시/도 이름
            sigungu: 시/군/구 이름 (optional)
            dong: 행정동 이름 (optional)
            level: 조회 레벨 ('sido', 'sigungu', 'dong')

        Returns:
            해당 레벨의 행정구역 코드 (str)

        Raises:
            ValueError: 지역을 찾을 수 없는 경우
        """
        # 1단계: sido 코드 찾기
        sido_code = None
        for sido_item in self.admin_codes['sido']:
            if sido_item['name'] == sido:
                sido_code = sido_item['cd']
                break

        if not sido_code:
            raise ValueError(f"시/도를 찾을 수 없습니다: {sido}")

        # sido 레벨이면 sido 코드 반환
        if level == 'sido':
            logger.info(f"지역 코드 조회 완료: {sido} = {sido_code}")
            return sido_code

        # 2단계: sigungu 코드 찾기
        if not sigungu:
            raise ValueError(f"시/군/구 이름이 필요합니다 (level: {level})")

        sigungu_code = None
        for sigungu_item in self.admin_codes['sigungu']:
            # 이름이 일치하고 parent_cd가 sido_code와 일치해야 함
            if sigungu_item['name'] == sigungu and sigungu_item['parent_cd'] == sido_code:
                sigungu_code = sigungu_item['cd']
                break

        if not sigungu_code:
            raise ValueError(f"시/군/구를 찾을 수 없습니다: {sido} > {sigungu}")

        # sigungu 레벨이면 sigungu 코드 반환
        if level == 'sigungu':
            logger.info(f"지역 코드 조회 완료: {sido} > {sigungu} = {sigungu_code}")
            return sigungu_code

        # 3단계: dong 코드 찾기
        if not dong:
            raise ValueError(f"행정동 이름이 필요합니다 (level: {level})")

        dong_code = None
        for dong_item in self.admin_codes['dong']:
            # 이름이 일치하고 parent_cd가 sigungu_code와 일치해야 함
            if dong_item['name'] == dong and dong_item['parent_cd'] == sigungu_code:
                dong_code = dong_item['cd']
                break

        if not dong_code:
            raise ValueError(f"행정동을 찾을 수 없습니다: {sido} > {sigungu} > {dong}")

        logger.info(f"지역 코드 조회 완료: {sido} > {sigungu} > {dong} = {dong_code}")
        return dong_code

# 서비스 클래스
class SpatialAnalysisService:
    def __init__(self):
        self.supabase = supabase

    async def process_drawing_object(self, drawing_obj: DrawingObject) -> PopulationResult:
        """메인 분석 함수 호출"""
        try:
            # 데이터 형식 변환
            shape_data = self._convert_to_db_format(drawing_obj)

            logger.info(f"분석 요청: {drawing_obj.type}, 데이터: {shape_data}")

            # Supabase 함수 호출
            result = self.supabase.rpc(
                'analyze_hospital_service_area',
                {
                    'shape_type': drawing_obj.type,
                    'shape_data': shape_data
                }
            ).execute()

            logger.info(f"Supabase 응답: {result.data}")
            logger.info(f"응답 데이터 타입: {type(result.data)}")

            if result.data:
                # Supabase RPC는 JSON 객체를 직접 반환
                response_data = result.data
                logger.info(f"응답 데이터: {response_data}")

                if isinstance(response_data, dict):
                    if response_data.get('error'):
                        error_msg = response_data.get('message', '알 수 없는 오류')
                        raise Exception(error_msg)
                    else:
                        return PopulationResult(**response_data)
                else:
                    raise Exception(f"예상치 못한 응답 형식: {type(response_data)} - {response_data}")
            else:
                raise Exception("빈 응답이 반환되었습니다")

        except Exception as e:
            logger.error(f"분석 오류: {str(e)}")
            return PopulationResult(
                total_population=0,
                total_households=0,
                age_distribution={},
                analysis_area_sqm=0.0,
                shape_type=drawing_obj.type,
                error=True,
                message=str(e)
            )

    def _convert_to_db_format(self, drawing_obj: DrawingObject) -> dict:
        """프론트엔드 데이터를 DB 함수 형식으로 변환"""
        if drawing_obj.type == 'circle':
            data = drawing_obj.data
            return {
                'center_lng': data.center_lng,
                'center_lat': data.center_lat,
                'radius': data.radius,
                'segments': data.segments
            }
        elif drawing_obj.type == 'polygon':
            return {
                'coordinates': drawing_obj.data.coordinates
            }

    async def get_region_boundary(
        self,
        region_code: str,
        level: str
    ) -> Optional[BoundaryCoordinates]:
        """
        행정구역 경계 좌표 및 중심점을 조회하여 WGS84로 변환 (캐싱 적용)

        Args:
            region_code: 행정구역 코드
            level: 'sido', 'sigungu', 'dong'

        Returns:
            BoundaryCoordinates (경계 좌표 + 중심점) 또는 None (경계 데이터가 없는 경우)
        """
        global boundary_cache, cache_stats

        try:
            # 캐시 키 생성
            cache_key = f"{level}:{region_code}"
            cache_stats['total_requests'] += 1

            # 캐시 확인
            if cache_key in boundary_cache:
                cache_stats['hits'] += 1
                logger.info(f"✓ 캐시에서 경계 데이터 로드: {cache_key}")

                # LRU: 접근한 항목을 맨 뒤로 이동 (최근 사용으로 표시)
                cached_data = boundary_cache[cache_key]
                boundary_cache.move_to_end(cache_key)

                return BoundaryCoordinates(**cached_data)

            cache_stats['misses'] += 1
            logger.info(f"경계 조회 요청 (캐시 미스): {region_code}, level: {level}")

            # Supabase RPC 함수 호출
            result = self.supabase.rpc(
                'get_region_boundary_wgs84',
                {
                    'p_region_code': region_code,
                    'p_level': level
                }
            ).execute()

            logger.info(f"경계 조회 응답: {result.data}")

            if result.data:
                # GeoJSON 형식 데이터 + 중심점을 BoundaryCoordinates로 변환
                geojson_data = result.data

                # 필수 필드 검증
                if (isinstance(geojson_data, dict) and
                    'type' in geojson_data and
                    'coordinates' in geojson_data and
                    'centroid' in geojson_data):

                    centroid_data = geojson_data['centroid']

                    # 중심점 데이터 검증
                    if isinstance(centroid_data, dict) and 'lng' in centroid_data and 'lat' in centroid_data:
                        boundary_data = BoundaryCoordinates(
                            type=geojson_data['type'],
                            coordinates=geojson_data['coordinates'],
                            centroid=Centroid(
                                lng=centroid_data['lng'],
                                lat=centroid_data['lat']
                            )
                        )

                        # 캐시 제한 확인 및 자동 정리
                        check_cache_limits()

                        # 캐시에 저장
                        boundary_cache[cache_key] = boundary_data.dict()
                        logger.info(f"✓ 경계 데이터를 캐시에 저장: {cache_key} (총 {len(boundary_cache)}개)")

                        return boundary_data
                    else:
                        logger.warning(f"중심점 데이터 형식 오류: {centroid_data}")
                        return None
                else:
                    logger.warning(f"예상치 못한 응답 형식: {geojson_data}")
                    return None
            else:
                logger.warning(f"경계 데이터가 없습니다: {region_code}")
                return None

        except Exception as e:
            logger.error(f"경계 조회 오류: {str(e)}")
            return None

    async def test_connection(self) -> dict:
        """연결 테스트"""
        try:
            result = self.supabase.rpc('test_coordinate_conversion', {
                'lng': 126.9780,
                'lat': 37.5665
            }).execute()
            return {'status': 'success', 'data': result.data}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def process_region_data(self, region_data: RegionData) -> PopulationResult:
        """
        행정구역 선택에 따른 인구 데이터 분석 (경계 좌표 포함)

        Args:
            region_data: 지역 선택 데이터 (sido, sigungu, dong, level)

        Returns:
            PopulationResult: 연령별 인구 분포, 총 인구수, 가구수, 경계 좌표(WGS84) 등
        """
        try:
            # 1. 행정구역 코드 조회
            lookup_service = RegionLookupService()
            region_code = lookup_service.find_region_code(
                sido=region_data.sido,
                sigungu=region_data.sigungu,
                dong=region_data.dong,
                level=region_data.level
            )

            logger.info(f"지역 코드 조회: {region_code}")

            # 2. Supabase census_region 테이블 조회
            result = self.supabase.table('census_region') \
                .select('*') \
                .eq('region_cd', region_code) \
                .execute()

            logger.info(f"Supabase 조회 결과: {result.data}")

            if not result.data or len(result.data) == 0:
                raise ValueError(f"해당 지역의 인구 데이터를 찾을 수 없습니다: {region_code}")

            census_data = result.data[0]

            # 3. 행정구역 경계 조회 (WGS84 좌표계로 변환)
            boundary_data = await self.get_region_boundary(region_code, region_data.level)

            # 4. 데이터 변환: census_region 컬럼 → PopulationResult 형식
            # Note: census_region 테이블 컬럼은 "10세 미만"이 아니라 구체적 연령 범위 컬럼입니다
            # 알고리즘 문서: "10세 미만" ~ "100세 이상" 컬럼이 있음
            age_distribution = {
                '10세 미만': int(census_data.get('10세 미만', census_data.get('10세미만', 0))),
                '10대': int(census_data.get('10대', 0)),
                '20대': int(census_data.get('20대', 0)),
                '30대': int(census_data.get('30대', 0)),
                '40대': int(census_data.get('40대', 0)),
                '50대': int(census_data.get('50대', 0)),
                '60대': int(census_data.get('60대', 0)),
                '70대': int(census_data.get('70대', 0)),
                '80대': int(census_data.get('80대', 0)),
                '90대': int(census_data.get('90대', 0)),
                '100세 이상': int(census_data.get('100세 이상', census_data.get('100세이상', 0)))
            }

            total_population = int(census_data.get('pop', census_data.get('총인구수', 0)))
            total_households = int(census_data.get('households', census_data.get('총가구수', 0)))

            logger.info(f"변환된 데이터: 총인구 {total_population}, 총가구 {total_households}, 경계 데이터: {boundary_data is not None}")

            return PopulationResult(
                total_population=total_population,
                total_households=total_households,
                age_distribution=age_distribution,
                analysis_area_sqm=0.0,  # 행정구역은 면적 정보 없음
                shape_type='region',
                boundary=boundary_data,  # WGS84 경계 좌표 추가
                error=False,
                message=None
            )

        except ValueError as e:
            logger.error(f"지역 데이터 조회 오류: {str(e)}")
            return PopulationResult(
                total_population=0,
                total_households=0,
                age_distribution={},
                analysis_area_sqm=0.0,
                shape_type='region',
                error=True,
                message=str(e)
            )
        except Exception as e:
            logger.error(f"지역 분석 오류: {str(e)}")
            return PopulationResult(
                total_population=0,
                total_households=0,
                age_distribution={},
                analysis_area_sqm=0.0,
                shape_type='region',
                error=True,
                message=f"데이터베이스 조회 중 오류 발생: {str(e)}"
            )

# 의존성 주입
def get_analysis_service() -> SpatialAnalysisService:
    return SpatialAnalysisService()

# 루트 경로에서 index.html 제공
@app.get("/")
async def read_root():
    return FileResponse("index.html")

# 새로운 분석 API 엔드포인트
@app.post("/analyze", response_model=PopulationResult)
async def analyze_hospital_area(
    drawing_data: DrawingObject,
    service: SpatialAnalysisService = Depends(get_analysis_service)
):
    """병원 서비스 영역 분석"""
    try:
        result = await service.process_drawing_object(drawing_data)

        if result.error:
            raise HTTPException(status_code=400, detail=result.message)

        return result

    except ValueError as e:
        logger.error(f"유효성 검사 오류: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"API 오류: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 내부 오류")

@app.get("/health")
async def health_check(service: SpatialAnalysisService = Depends(get_analysis_service)):
    """헬스 체크"""
    connection_test = await service.test_connection()

    return {
        "status": "healthy",
        "database": connection_test['status'],
        "database_data": connection_test.get('data'),
        "version": "1.0.0"
    }

# 기존 getPop 엔드포인트를 새로운 형식으로 업데이트
@app.post("/getPop")
async def get_population_updated(
    request_data: dict,
    service: SpatialAnalysisService = Depends(get_analysis_service)
):
    """업데이트된 인구 분석 엔드포인트 (기존 호환성 + 새 기능)"""
    try:
        logger.info(f"getPop 요청 데이터: {request_data}")

        # 새로운 형식인지 확인
        if "type" in request_data and "data" in request_data:
            # 새로운 형식으로 변환
            drawing_obj = DrawingObject(**request_data)
            result = await service.process_drawing_object(drawing_obj)

            if result.error:
                return {"error": True, "message": result.message}

            return {
                "success": True,
                "total_population": result.total_population,
                "total_households": result.total_households,
                "age_distribution": result.age_distribution,
                "analysis_area_sqm": result.analysis_area_sqm,
                "shape_type": result.shape_type
            }
        else:
            # 기존 형식 처리 (레거시)
            return {"message": "기존 형식 데이터 처리", "data": request_data}

    except Exception as e:
        logger.error(f"getPop 오류: {str(e)}")
        return {"error": True, "message": str(e)}

# 데이터 수신 엔드포인트
@app.post("/getDrawingPop")
async def receive_shape_data(data: Union[CircleData, PolygonData]):
    print(f"받은 데이터: {data}")

    if data.type == "circle":
        print(f"원형 데이터 - 중심: {data.center}, 반지름: {data.radius}")
    elif data.type == "polygon":
        print(f"다각형 데이터 - 점들: {data.points}")

    return {"status": "success", "message": "데이터를 성공적으로 받았습니다"}

# 지역 데이터 조회 엔드포인트
@app.post("/getRegionPop", response_model=PopulationResult)
async def get_region_population(
    region_data: RegionData,
    service: SpatialAnalysisService = Depends(get_analysis_service)
):
    """행정구역 선택 기반 인구 데이터 조회"""
    try:
        logger.info(f"지역 조회 요청: {region_data}")

        # 지역 데이터 분석 실행
        result = await service.process_region_data(region_data)

        if result.error:
            raise HTTPException(status_code=400, detail=result.message)

        return result

    except ValueError as e:
        logger.error(f"지역 조회 유효성 오류: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"지역 조회 API 오류: {str(e)}")
        raise HTTPException(status_code=500, detail="서버 내부 오류")

# 캐시 관리 API 엔드포인트
@app.get("/cache/stats")
async def get_cache_stats_api():
    """캐시 통계 정보 조회 (메모리 사용량 포함)"""
    hit_rate = (cache_stats['hits'] / cache_stats['total_requests'] * 100) if cache_stats['total_requests'] > 0 else 0
    memory_mb = get_cache_memory_usage()

    return {
        "total_requests": cache_stats['total_requests'],
        "cache_hits": cache_stats['hits'],
        "cache_misses": cache_stats['misses'],
        "evictions": cache_stats['evictions'],
        "hit_rate": f"{hit_rate:.2f}%",
        "cached_items": len(boundary_cache),
        "max_cache_size": MAX_CACHE_SIZE,
        "cache_utilization": f"{len(boundary_cache) / MAX_CACHE_SIZE * 100:.1f}%",
        "memory_usage_mb": f"{memory_mb:.2f}",
        "max_memory_mb": MAX_CACHE_MEMORY_MB,
        "memory_utilization": f"{memory_mb / MAX_CACHE_MEMORY_MB * 100:.1f}%",
        "cache_keys": list(boundary_cache.keys())
    }

@app.delete("/cache/clear")
async def clear_cache():
    """캐시 전체 삭제"""
    global boundary_cache, cache_stats

    cleared_count = len(boundary_cache)
    boundary_cache.clear()

    # 통계는 유지하되, 초기화 옵션 제공
    return {
        "status": "success",
        "message": f"{cleared_count}개의 캐시 항목이 삭제되었습니다",
        "cleared_count": cleared_count
    }

@app.delete("/cache/reset-stats")
async def reset_cache_stats():
    """캐시 통계 초기화"""
    global cache_stats

    cache_stats = {
        'hits': 0,
        'misses': 0,
        'total_requests': 0
    }

    return {
        "status": "success",
        "message": "캐시 통계가 초기화되었습니다"
    }

if __name__ == "__main__":
    # 환경 변수에서 호스트와 포트 설정 (기본값 제공)
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    logger.info(f"서버 시작 중... Host: {host}, Port: {port}")
    uvicorn.run(app, host=host, port=port)