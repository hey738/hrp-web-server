# 배포 지침서: 행정구역 경계 좌표 및 중심점 기능

## 1. Supabase RPC 함수 생성

구현된 백엔드 코드가 작동하려면 먼저 Supabase에 RPC 함수를 생성해야 합니다.

### 단계:

1. Supabase 대시보드에 접속: https://vsmfqmbumthyhvvozxxb.supabase.co
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. **New query** 버튼 클릭
4. `supabase_boundary_function.sql` 파일의 내용을 복사하여 붙여넣기
5. **Run** 버튼 클릭하여 함수 생성

### 함수 테스트 (SQL Editor에서):

```sql
-- 서울특별시 경계 + 중심점 조회 테스트
SELECT get_region_boundary_wgs84('11', 'sido');

-- 서울시 종로구 경계 + 중심점 조회 테스트
SELECT get_region_boundary_wgs84('11110', 'sigungu');

-- 중심점만 조회 (선택사항)
SELECT get_region_centroid_wgs84('11', 'sido');
```

성공하면 다음과 같은 형식의 JSON 데이터가 반환됩니다:
```json
{
  "type": "Polygon",
  "coordinates": [...],
  "centroid": {
    "lng": 126.9780,
    "lat": 37.5665
  }
}
```

## 2. 데이터베이스 확인사항

### 경계 테이블 존재 확인:

```sql
-- 테이블 존재 확인
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('bnd_sido', 'bnd_sigungu', 'bnd_adm_dong');
```

### 샘플 데이터 확인:

```sql
-- 시도 테이블 샘플 확인
SELECT sido_cd, sido_nm, ST_GeometryType(geom), ST_SRID(geom)
FROM bnd_sido LIMIT 5;

-- 시군구 테이블 샘플 확인
SELECT sigungu_cd, sigungu_nm, ST_GeometryType(geom), ST_SRID(geom)
FROM bnd_sigungu LIMIT 5;

-- 행정동 테이블 샘플 확인
SELECT adm_cd, adm_nm, ST_GeometryType(geom), ST_SRID(geom)
FROM bnd_adm_dong LIMIT 5;
```

**예상 결과:**
- `ST_SRID(geom)` 값이 5179 또는 5186이어야 함 (한국 좌표계)
- 만약 NULL이거나 다른 값이면, 다음 명령으로 SRID 설정:

```sql
-- SRID 설정 (필요시)
UPDATE bnd_sido SET geom = ST_SetSRID(geom, 5179);
UPDATE bnd_sigungu SET geom = ST_SetSRID(geom, 5179);
UPDATE bnd_adm_dong SET geom = ST_SetSRID(geom, 5179);
```

## 3. 백엔드 서버 실행

```bash
cd /Users/user/Desktop/hospital_area_analaysis_main_copy
python server.py
```

서버가 `localhost:5500`에서 실행됩니다.

## 4. API 테스트

### 방법 1: curl 명령어

```bash
# 서울특별시 인구 + 경계 + 중심점 조회
curl -X POST http://localhost:5500/getRegionPop \
  -H "Content-Type: application/json" \
  -d '{
    "sido": "서울특별시",
    "level": "sido"
  }'

# 서울시 종로구 인구 + 경계 + 중심점 조회
curl -X POST http://localhost:5500/getRegionPop \
  -H "Content-Type: application/json" \
  -d '{
    "sido": "서울특별시",
    "sigungu": "종로구",
    "level": "sigungu"
  }'
```

### 방법 2: Python 테스트 스크립트

`test_boundary_api.py` 파일을 참조하세요.

```bash
python test_boundary_api.py
```

### 예상 응답 형식:

```json
{
  "total_population": 1234567,
  "total_households": 567890,
  "age_distribution": {
    "10세 미만": 123456,
    "10대": 234567,
    ...
  },
  "analysis_area_sqm": 0.0,
  "shape_type": "region",
  "boundary": {
    "type": "Polygon",
    "coordinates": [
      [
        [126.7645, 37.4123],
        [126.7890, 37.4567],
        ...
      ]
    ],
    "centroid": {
      "lng": 126.9780,
      "lat": 37.5665
    }
  },
  "error": false,
  "message": null
}
```

## 5. 중심점 활용 방법

### 용도:
1. **지도 자동 이동**: 행정구역 선택 시 해당 지역의 중심점으로 지도 이동
2. **마커 표시**: 행정구역 중심에 마커 표시
3. **초기 뷰포트 설정**: 지도 초기 로드 시 중심점 기준으로 확대/축소 레벨 결정

### 프론트엔드 예시 (Kakao Maps):

```javascript
// API 응답에서 중심점 추출
if (response.boundary && response.boundary.centroid) {
  const centroid = response.boundary.centroid;

  // 지도를 중심점으로 이동
  const moveLatLng = new kakao.maps.LatLng(centroid.lat, centroid.lng);
  map.setCenter(moveLatLng);

  // 마커 표시 (선택사항)
  const marker = new kakao.maps.Marker({
    position: moveLatLng,
    map: map
  });
}
```

## 6. 트러블슈팅

### 문제: "Function get_region_boundary_wgs84 does not exist"

**해결:** Supabase SQL Editor에서 `supabase_boundary_function.sql` 실행

### 문제: "경계 데이터가 없습니다"

**해결:**
1. SQL Editor에서 직접 쿼리 테스트
2. 지역 코드가 올바른지 확인
3. 테이블 데이터 존재 여부 확인

### 문제: "중심점 데이터 형식 오류"

**해결:**
1. RPC 함수가 최신 버전인지 확인 (centroid 필드 포함)
2. SQL Editor에서 함수 재생성
3. 서버 재시작

### 문제: 좌표계 변환 실패

**해결:**
1. PostGIS 확장 설치 확인: `CREATE EXTENSION IF NOT EXISTS postgis;`
2. SRID 설정 확인 (위 "데이터베이스 확인사항" 참조)

### 문제: "경계 조회 오류" 로그

**해결:**
- 서버 콘솔에서 상세 에러 로그 확인
- Supabase 로그 확인 (Dashboard > Logs)

## 7. 프론트엔드 연동 (향후 작업)

현재는 백엔드만 구현되었습니다. 프론트엔드에서 경계 좌표 및 중심점을 지도에 표시하려면:

### 경계 표시:

```javascript
if (response.boundary) {
  const path = response.boundary.coordinates[0].map(coord =>
    new kakao.maps.LatLng(coord[1], coord[0])  // [lng, lat] → LatLng
  );

  const polygon = new kakao.maps.Polygon({
    path: path,
    strokeWeight: 2,
    strokeColor: '#FF0000',
    fillColor: '#FF000033'
  });

  polygon.setMap(map);
}
```

### 중심점으로 지도 이동:

```javascript
if (response.boundary && response.boundary.centroid) {
  const centroid = response.boundary.centroid;
  const moveLatLng = new kakao.maps.LatLng(centroid.lat, centroid.lng);

  // 부드러운 이동 효과
  map.panTo(moveLatLng);

  // 또는 즉시 이동
  // map.setCenter(moveLatLng);
}
```

## 8. 성능 고려사항

### 중심점 계산:
- PostGIS `ST_Centroid()` 함수 사용
- 데이터베이스 레벨에서 계산하여 네트워크 전송량 최소화
- 계산된 중심점은 WGS84 좌표계로 반환

### 캐싱 권장:
- 행정구역 경계 및 중심점은 거의 변경되지 않으므로 캐싱 권장
- 프론트엔드에서 LocalStorage 또는 SessionStorage 활용
- 백엔드에서 Redis 등의 캐시 시스템 활용 (선택사항)
