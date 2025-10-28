# 경계 데이터 캐싱 가이드

## 개요

행정구역 경계 데이터는 거의 변하지 않는 정적 데이터이므로, 프론트엔드와 백엔드 양쪽에서 캐싱을 구현하여 성능을 대폭 향상시켰습니다.

## 캐싱 구조

### 1. 프론트엔드 캐싱 (SessionStorage)

- **저장소**: 브라우저 SessionStorage
- **생명주기**: 브라우저 탭이 열려 있는 동안 유지
- **용량**: 일반적으로 5-10MB
- **전략**: 첫 조회 시 저장, 이후 동일 지역 조회 시 캐시 사용

#### 캐시 키 형식
```
boundary_{level}_{sido}[_{sigungu}][_{dong}]
```

예시:
- `boundary_sido_서울특별시`
- `boundary_sigungu_서울특별시_종로구`
- `boundary_dong_서울특별시_종로구_청운효자동`

#### 주요 함수

**`getBoundaryCacheKey(sido, sigungu, dong, level)`**
- 캐시 키 생성

**`getBoundaryFromCache(cacheKey)`**
- SessionStorage에서 경계 데이터 조회
- 캐시 히트 시 콘솔에 `✓ 캐시에서 경계 데이터 로드` 출력

**`saveBoundaryToCache(cacheKey, boundaryData)`**
- SessionStorage에 경계 데이터 저장
- 용량 초과 시 자동으로 오래된 항목 삭제

**`clearAllBoundaryCache()`**
- 모든 경계 캐시 삭제

**`getBoundaryCacheStats()`**
- 캐시 통계 조회 (항목 수, 총 용량 등)

#### 브라우저 콘솔에서 캐시 관리

```javascript
// 캐시 통계 확인
console.log(getBoundaryCacheStats());

// 모든 캐시 삭제
clearAllBoundaryCache();

// 특정 캐시 확인
const cacheKey = getBoundaryCacheKey('서울특별시', null, null, 'sido');
console.log(getBoundaryFromCache(cacheKey));
```

### 2. 백엔드 캐싱 (Python 메모리)

- **저장소**: Python 딕셔너리 (메모리)
- **생명주기**: 서버가 실행되는 동안 유지
- **용량**: 메모리 허용 범위 내 무제한
- **전략**: 첫 조회 시 저장, 이후 동일 지역 조회 시 캐시 반환

#### 캐시 키 형식
```
{level}:{region_code}
```

예시:
- `sido:11` (서울특별시)
- `sigungu:11110` (종로구)
- `dong:1111051` (청운효자동)

#### 캐시 통계 API

**`GET /cache/stats`**
```bash
curl http://localhost:5500/cache/stats
```

응답 예시:
```json
{
  "total_requests": 50,
  "cache_hits": 35,
  "cache_misses": 15,
  "hit_rate": "70.00%",
  "cached_items": 15,
  "cache_keys": ["sido:11", "sigungu:11110", "dong:1111051"]
}
```

**`DELETE /cache/clear`**
```bash
curl -X DELETE http://localhost:5500/cache/clear
```

응답 예시:
```json
{
  "status": "success",
  "message": "15개의 캐시 항목이 삭제되었습니다",
  "cleared_count": 15
}
```

**`DELETE /cache/reset-stats`**
```bash
curl -X DELETE http://localhost:5500/cache/reset-stats
```

## 성능 개선 효과

### 캐시 미스 (첫 번째 조회)
```
사용자 요청 → 프론트엔드 (캐시 없음) → 백엔드 (캐시 없음) → Supabase RPC
→ PostGIS 좌표 변환 → 백엔드 캐시 저장 → 프론트엔드 캐시 저장 → 응답
```
**시간**: ~500-1000ms (Supabase 쿼리 + 네트워크)

### 캐시 히트 (두 번째 이후 조회)

#### 프론트엔드 캐시 히트
```
사용자 요청 → 프론트엔드 (캐시 있음) → 즉시 표시
```
**시간**: ~1-5ms (메모리 읽기)

#### 백엔드 캐시 히트
```
사용자 요청 → 프론트엔드 (캐시 없음) → 백엔드 (캐시 있음) → 응답
```
**시간**: ~50-100ms (네트워크만)

### 성능 향상
- 프론트엔드 캐시 히트: **99.5% 속도 향상** (500ms → 2ms)
- 백엔드 캐시 히트: **90% 속도 향상** (500ms → 50ms)

## 캐싱 전략

### 언제 캐시를 사용하는가?

#### 캐시 사용 O
- 동일한 행정구역 재조회
- 인구 데이터는 최신이지만 경계는 동일
- 같은 세션 내에서 반복 조회

#### 캐시 사용 X
- 브라우저 새로고침 (SessionStorage 초기화)
- 서버 재시작 (메모리 캐시 초기화)
- 다른 브라우저/탭에서 조회

### 캐시 무효화 시점

경계 데이터는 거의 변하지 않으므로 일반적으로 무효화가 필요 없습니다. 다만 다음과 같은 경우 캐시를 삭제할 수 있습니다:

1. **행정구역 개편** (매우 드뭄)
   - 백엔드: `DELETE /cache/clear` 호출
   - 프론트엔드: 사용자에게 새로고침 안내

2. **메모리 부족**
   - 프론트엔드: 자동으로 오래된 항목 삭제 (LRU 전략)
   - 백엔드: 필요시 수동으로 `/cache/clear` 호출

3. **개발/디버깅**
   - 브라우저 콘솔: `clearAllBoundaryCache()`
   - API: `DELETE /cache/clear`

## 모니터링

### 프론트엔드 모니터링

브라우저 개발자 도구 → 콘솔:
```javascript
// 캐시 통계 확인
const stats = getBoundaryCacheStats();
console.table({
  '캐시 항목 수': stats.count,
  '총 용량 (KB)': stats.totalSizeKB
});

// 캐시 키 목록
console.log(stats.keys);
```

### 백엔드 모니터링

```bash
# 캐시 통계 확인
curl http://localhost:5500/cache/stats | jq

# 실시간 로그 확인
tail -f server_log.txt | grep "캐시"
```

### 로그 예시

```
INFO:__main__:경계 조회 요청 (캐시 미스): 11, level: sido
INFO:__main__:✓ 경계 데이터를 캐시에 저장: sido:11
INFO:__main__:✓ 캐시에서 경계 데이터 로드: sido:11
INFO:__main__:✓ 캐시에서 경계 데이터 로드: sido:11
```

## 베스트 프랙티스

### 1. 프론트엔드
- ✅ SessionStorage 사용 (세션 단위 유지)
- ✅ 용량 초과 시 자동 정리
- ✅ 에러 발생 시 캐시 무시하고 API 호출
- ✅ 캐시 히트/미스 로그 출력

### 2. 백엔드
- ✅ 메모리 캐시 사용 (빠른 읽기)
- ✅ 캐시 통계 추적 (hit rate 계산)
- ✅ API로 캐시 관리 기능 제공
- ✅ 캐시 키에 level 포함 (명확한 식별)

### 3. 운영
- ✅ 정기적으로 캐시 통계 확인
- ✅ Hit rate 70% 이상 유지 권장
- ✅ 메모리 사용량 모니터링
- ✅ 행정구역 개편 시 캐시 삭제

## 트러블슈팅

### 문제: 캐시가 작동하지 않음

**프론트엔드 확인:**
```javascript
// SessionStorage 지원 확인
console.log('SessionStorage 지원:', typeof(Storage) !== 'undefined');

// 현재 캐시 상태
console.log(getBoundaryCacheStats());
```

**백엔드 확인:**
```bash
# 캐시 통계 확인
curl http://localhost:5500/cache/stats
```

### 문제: SessionStorage 용량 초과

**해결:**
```javascript
// 모든 캐시 삭제
clearAllBoundaryCache();

// 또는 브라우저 Storage 전체 삭제
sessionStorage.clear();
```

### 문제: 오래된 경계 데이터 표시

**해결:**
```bash
# 백엔드 캐시 삭제
curl -X DELETE http://localhost:5500/cache/clear

# 프론트엔드: 브라우저 새로고침 (F5)
```

### 문제: Hit rate가 너무 낮음 (< 50%)

**원인:**
- 너무 다양한 지역 조회
- 캐시가 자주 삭제됨
- 세션이 자주 종료됨

**해결:**
- 사용자 패턴 분석
- 캐시 용량 증가 (백엔드)
- LocalStorage 사용 고려 (프론트엔드)

## 향후 개선 방안

### 1. LocalStorage 지원 (프론트엔드)
- 브라우저 종료 후에도 캐시 유지
- 더 긴 생명주기

### 2. Redis 캐시 (백엔드)
- 서버 재시작 후에도 캐시 유지
- 분산 환경 지원
- TTL 설정 가능

### 3. 선제적 캐싱 (Prefetching)
- 자주 조회되는 지역 미리 캐싱
- 서버 시작 시 주요 지역 로드

### 4. 압축
- 경계 좌표 압축하여 저장
- 용량 50-70% 절감 가능

### 5. 캐시 워밍업 (Cache Warming)
```python
@app.on_event("startup")
async def warm_up_cache():
    """서버 시작 시 주요 지역 캐시 로드"""
    major_regions = [
        ('11', 'sido'),      # 서울
        ('26', 'sido'),      # 부산
        ('27', 'sido'),      # 대구
        # ...
    ]
    for region_code, level in major_regions:
        await get_region_boundary(region_code, level)
```

## 참고 자료

- [MDN: SessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [FastAPI: Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Python: functools.lru_cache](https://docs.python.org/3/library/functools.html#functools.lru_cache)
