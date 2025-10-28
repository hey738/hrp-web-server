# 프론트엔드 구현: 행정구역 경계 및 중심점 표시

## 구현된 기능

### 1. 중심점으로 부드러운 이동
- Kakao Maps `panTo()` 메서드 사용
- 지역 선택 시 자동으로 해당 지역 중심으로 이동
- 중심점에 마커 표시

### 2. 행정구역 경계 표시
- **Polygon 지원**: 단일 폴리곤 렌더링
- **MultiPolygon 지원**: 여러 개의 폴리곤 렌더링 (섬이 있는 지역 등)
- GeoJSON 좌표를 Kakao Maps LatLng 객체로 자동 변환
- 빨간색 경계선과 반투명 채우기

### 3. 추가된 전역 변수

```javascript
var regionBoundaryPolygons = [];  // 경계 폴리곤 배열 (MultiPolygon 지원)
var regionCentroidMarker = null;   // 중심점 마커
```

### 4. 추가된 함수

#### `displayRegionBoundary(boundary)`
- 메인 함수: 경계 표시 및 중심점 이동 처리
- API 응답의 `boundary` 객체를 받아 처리

#### `moveToCentroid(centroid)`
- 중심점으로 지도를 부드럽게 이동
- 중심점에 마커 표시

#### `renderBoundary(boundary)`
- Polygon 또는 MultiPolygon 타입에 따라 렌더링 분기
- MultiPolygon의 경우 각 Polygon을 개별 렌더링

#### `createPolygonFromCoordinates(coordinates)`
- GeoJSON 좌표 배열을 Kakao Maps Polygon 객체로 변환
- 좌표 순서 변환: `[lng, lat]` → `LatLng(lat, lng)`

#### `clearRegionBoundary()`
- 기존 경계 폴리곤 및 마커 제거
- 모드 전환 시 자동 호출

## 사용 방법

### 1. 서버 실행

```bash
cd /Users/user/Desktop/hospital_area_analaysis_main_copy
python server.py
```

### 2. 브라우저에서 테스트

1. `http://localhost:5500` 접속
2. 사이드바에서 "지역 선택" 라디오 버튼 선택
3. 시/도 → 시/군/구 → 행정동 순서로 선택
4. "조회" 버튼 클릭
5. **결과 확인:**
   - 지도가 선택한 지역 중심으로 부드럽게 이동
   - 행정구역 경계가 빨간색으로 표시
   - 중심점에 마커 표시
   - 사이드바에 인구 통계 표시

### 3. 테스트 케이스

#### 테스트 1: 시/도 레벨 (Polygon)
- 시/도: 서울특별시
- 레벨: sido
- 예상: 서울시 전체 경계 표시

#### 테스트 2: 시/군/구 레벨
- 시/도: 서울특별시
- 시/군/구: 종로구
- 예상: 종로구 경계 표시 + 종로구 중심으로 이동

#### 테스트 3: 행정동 레벨
- 시/도: 서울특별시
- 시/군/구: 종로구
- 행정동: 청운효자동
- 예상: 청운효자동 경계 표시 + 좁은 영역으로 이동

#### 테스트 4: MultiPolygon (섬 포함 지역)
- 시/도: 인천광역시
- 시/군/구: 옹진군
- 예상: 여러 개의 섬이 각각 폴리곤으로 표시

## 코드 플로우

```
사용자가 지역 선택 후 "조회" 버튼 클릭
    ↓
queryRegion() 함수 실행
    ↓
POST /getRegionPop API 호출
    ↓
서버에서 인구 데이터 + 경계 데이터 반환
    ↓
if (result.boundary) {
    displayRegionBoundary(result.boundary)
        ↓
        ├─ clearRegionBoundary() - 기존 경계 제거
        ├─ moveToCentroid() - 중심점으로 이동 + 마커 표시
        └─ renderBoundary() - 경계 렌더링
            ↓
            ├─ if Polygon → createPolygonFromCoordinates() 1회 호출
            └─ if MultiPolygon → createPolygonFromCoordinates() N회 호출
}
    ↓
displayRegionAnalysisResults() - 인구 통계 표시
```

## 스타일링

경계 폴리곤 스타일:
```javascript
{
    strokeWeight: 3,           // 경계선 두께
    strokeColor: '#FF6B6B',    // 경계선 색상 (빨간색)
    strokeOpacity: 0.8,        // 경계선 투명도
    strokeStyle: 'solid',      // 경계선 스타일
    fillColor: '#FF6B6B',      // 채우기 색상
    fillOpacity: 0.15          // 채우기 투명도 (반투명)
}
```

**커스터마이징:**
- `createPolygonFromCoordinates()` 함수에서 스타일 수정 가능
- 색상, 투명도, 두께 등을 원하는 대로 조정

## 주의사항

### 1. MultiPolygon 처리
- 일부 행정구역은 MultiPolygon 타입 (섬이 있는 지역 등)
- `renderBoundary()` 함수에서 자동으로 처리
- 각 Polygon은 개별 Kakao Maps Polygon 객체로 생성

### 2. 좌표 순서
- GeoJSON: `[경도(lng), 위도(lat)]`
- Kakao Maps LatLng: `LatLng(위도, 경도)`
- `createPolygonFromCoordinates()`에서 자동 변환

### 3. 성능 고려
- MultiPolygon의 경우 여러 개의 Polygon 객체 생성
- 복잡한 경계의 경우 좌표 개수가 많을 수 있음
- 필요시 좌표 간소화 알고리즘 적용 고려 (Douglas-Peucker 등)

### 4. 모드 전환
- "그리기로 선택" 모드로 전환 시 자동으로 경계 제거
- `changeSelectionMode()` 함수에서 `clearRegionBoundary()` 호출

## 디버깅

### 콘솔 로그 확인
```javascript
// displayRegionBoundary 함수에 로그 추가 예시
console.log('경계 타입:', boundary.type);
console.log('중심점:', boundary.centroid);
console.log('좌표 개수:', boundary.coordinates[0]?.length);
```

### 일반적인 문제

**문제 1: 경계가 표시되지 않음**
- 브라우저 콘솔에서 에러 확인
- API 응답에 `boundary` 필드가 있는지 확인
- Supabase RPC 함수가 생성되었는지 확인

**문제 2: 좌표가 이상한 위치에 표시됨**
- 좌표 순서 확인 (lng/lat vs lat/lng)
- SRID 변환이 올바르게 되었는지 확인 (EPSG:5179 → EPSG:4326)

**문제 3: MultiPolygon이 제대로 표시되지 않음**
- `renderBoundary()` 함수에서 MultiPolygon 분기 확인
- 각 Polygon의 좌표 배열 구조 확인

## 향후 개선 사항

### 1. 지도 확대 레벨 자동 조정
```javascript
// moveToCentroid() 함수에 추가
function moveToCentroid(centroid) {
    const centerPosition = new kakao.maps.LatLng(centroid.lat, centroid.lng);
    map.panTo(centerPosition);

    // 경계에 맞게 자동 확대/축소
    if (regionBoundaryPolygons.length > 0) {
        const bounds = new kakao.maps.LatLngBounds();
        regionBoundaryPolygons.forEach(polygon => {
            const path = polygon.getPath();
            path.forEach(latLng => bounds.extend(latLng));
        });
        map.setBounds(bounds);
    }
}
```

### 2. 경계 클릭 이벤트
```javascript
// 경계 클릭 시 정보 표시
polygon.addListener('click', function() {
    alert('클릭된 행정구역 정보');
});
```

### 3. 애니메이션 효과
- 경계가 서서히 나타나는 효과
- 중심점 마커 바운스 애니메이션

### 4. 스타일 테마
- 낮/밤 모드에 따라 경계 색상 변경
- 인구 밀도에 따라 색상 그라데이션

## 관련 파일

- [static/script.js](static/script.js) - 프론트엔드 JavaScript 로직
- [server.py](server.py) - 백엔드 API
- [supabase_boundary_function.sql](supabase_boundary_function.sql) - Supabase RPC 함수
- [DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md) - 배포 가이드
