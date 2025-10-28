# 메모리 관리 가이드

## 개요

백엔드 캐시는 **LRU (Least Recently Used)** 알고리즘과 **크기 제한**을 사용하여 메모리를 효율적으로 관리합니다.

## 메모리 사용량

### 실제 측정 결과

| 행정구역 타입 | 평균 크기 | 예시 |
|--------------|----------|------|
| 시/도 (sido) | ~500KB | 서울특별시 |
| 시/군/구 (sigungu) | ~200KB | 종로구 |
| 행정동 (dong) | ~50KB | 청운효자동 |

### 현실적인 시나리오

```
주요 조회 지역 (상위 20% - 파레토 법칙):
- 5개 시/도 × 500KB = 2.5MB
- 50개 시/군/구 × 200KB = 10MB
- 200개 행정동 × 50KB = 10MB
==========================================
총 약 22.5MB (100개 항목 기준)
```

## 캐시 설정

### 기본 설정 (server.py)

```python
MAX_CACHE_SIZE = 100  # 최대 100개 항목
MAX_CACHE_MEMORY_MB = 50  # 최대 50MB
```

### 설정 조정 가이드

#### 소규모 서비스 (< 1,000 사용자/일)
```python
MAX_CACHE_SIZE = 50
MAX_CACHE_MEMORY_MB = 25
```
- 예상 메모리: ~10MB
- 클라우드 추가 비용: ~$0.08/월

#### 중규모 서비스 (1,000-10,000 사용자/일)
```python
MAX_CACHE_SIZE = 100  # 기본값
MAX_CACHE_MEMORY_MB = 50  # 기본값
```
- 예상 메모리: ~20MB
- 클라우드 추가 비용: ~$0.16/월

#### 대규모 서비스 (10,000+ 사용자/일)
```python
MAX_CACHE_SIZE = 500
MAX_CACHE_MEMORY_MB = 200
```
- 예상 메모리: ~100MB
- 클라우드 추가 비용: ~$0.80/월
- **권장**: Redis 등 별도 캐시 시스템 사용

## LRU 동작 방식

### LRU (Least Recently Used)

가장 오랫동안 사용되지 않은 항목을 삭제하는 전략입니다.

```python
# OrderedDict 사용
boundary_cache = OrderedDict()

# 접근 시: 맨 뒤로 이동 (최근 사용)
boundary_cache.move_to_end(cache_key)

# 삭제 시: 맨 앞 항목 제거 (오래된 항목)
oldest_key = next(iter(boundary_cache))
del boundary_cache[oldest_key]
```

### 예시

```
초기 상태 (MAX_CACHE_SIZE = 3):
Cache: []

1. 서울 조회 → Cache: [서울]
2. 부산 조회 → Cache: [서울, 부산]
3. 대구 조회 → Cache: [서울, 부산, 대구]

4. 서울 재조회 → Cache: [부산, 대구, 서울]  # 서울이 맨 뒤로
5. 인천 조회 (캐시 가득) → Cache: [대구, 서울, 인천]  # 부산 삭제 (LRU)
```

## 자동 관리 기능

### 1. 항목 수 제한

```python
while len(boundary_cache) >= MAX_CACHE_SIZE:
    evict_lru_cache()  # 가장 오래된 항목 삭제
```

로그 예시:
```
WARNING: 캐시 항목 수 제한 도달: 100/100
INFO: ✓ LRU 캐시 삭제: sido:42 (총 99개 남음)
```

### 2. 메모리 제한

```python
if memory_mb > MAX_CACHE_MEMORY_MB:
    # 10% 정도 삭제
    items_to_remove = max(1, len(boundary_cache) // 10)
    for _ in range(items_to_remove):
        evict_lru_cache()
```

로그 예시:
```
WARNING: 캐시 메모리 제한 도달: 52.34MB/50MB
INFO: ✓ LRU 캐시 삭제: sigungu:11110 (총 90개 남음)
```

## 캐시 통계 API

### GET /cache/stats

```bash
curl http://localhost:5500/cache/stats
```

응답 예시:
```json
{
  "total_requests": 500,
  "cache_hits": 425,
  "cache_misses": 75,
  "evictions": 23,
  "hit_rate": "85.00%",
  "cached_items": 97,
  "max_cache_size": 100,
  "cache_utilization": "97.0%",
  "memory_usage_mb": "18.45",
  "max_memory_mb": 50,
  "memory_utilization": "36.9%",
  "cache_keys": ["sido:11", "sigungu:11110", ...]
}
```

### 주요 지표 설명

| 지표 | 설명 | 권장 범위 |
|------|------|----------|
| `hit_rate` | 캐시 히트율 | 70%+ |
| `cache_utilization` | 캐시 공간 사용률 | 80-95% |
| `memory_utilization` | 메모리 사용률 | < 80% |
| `evictions` | LRU 삭제 횟수 | 낮을수록 좋음 |

## 클라우드 비용 분석

### AWS EC2 예시 (서울 리전)

```
t3.micro (1GB RAM): $8.47/월

캐시 메모리 사용량:
- 소규모 (50개): ~10MB → $0.08/월
- 중규모 (100개): ~20MB → $0.16/월
- 대규모 (500개): ~100MB → $0.80/월

Supabase 절감액: $50-75/월

순 이득: $49-75/월
ROI: 6,000-9,000% 🎉
```

### 다른 클라우드 서비스

**Google Cloud Run**:
- 메모리는 컨테이너당 과금
- 256MB 단위로 증가
- 캐시 20MB는 256MB 범위 내 → 추가 비용 없음

**Azure App Service**:
- Basic 플랜에 1.75GB RAM 포함
- 캐시 20MB는 무시할 수준 → 추가 비용 없음

**Heroku**:
- Standard-1X: 512MB RAM 포함
- 캐시 20MB는 4% 사용 → 추가 비용 없음

**결론**: 대부분의 플랫폼에서 추가 비용 거의 없음! ✅

## 모니터링

### 로그 확인

```bash
# 캐시 관련 로그만 필터링
tail -f server_log.txt | grep "캐시"
```

예시 출력:
```
INFO: ✓ 캐시에서 경계 데이터 로드: sido:11
INFO: 경계 조회 요청 (캐시 미스): 26, level: sido
INFO: ✓ 경계 데이터를 캐시에 저장: sido:26 (총 45개)
WARNING: 캐시 항목 수 제한 도달: 100/100
INFO: ✓ LRU 캐시 삭제: sido:42 (총 99개 남음)
```

### Python 코드로 모니터링

```python
import requests

# 캐시 통계 조회
response = requests.get("http://localhost:5500/cache/stats")
stats = response.json()

print(f"히트율: {stats['hit_rate']}")
print(f"메모리 사용: {stats['memory_usage_mb']}MB / {stats['max_memory_mb']}MB")
print(f"캐시 항목: {stats['cached_items']} / {stats['max_cache_size']}")
print(f"LRU 삭제 횟수: {stats['evictions']}")
```

### 경고 조건

다음과 같은 경우 주의가 필요합니다:

1. **히트율 < 50%**
   - 원인: 너무 다양한 지역 조회
   - 해결: `MAX_CACHE_SIZE` 증가

2. **LRU 삭제 빈번 (evictions > requests / 2)**
   - 원인: 캐시 크기 부족
   - 해결: `MAX_CACHE_SIZE` 증가

3. **메모리 사용률 > 90%**
   - 원인: 예상보다 큰 데이터
   - 해결: `MAX_CACHE_MEMORY_MB` 증가 또는 `MAX_CACHE_SIZE` 감소

## 베스트 프랙티스

### 1. 적절한 캐시 크기 설정

```python
# 사용자 수 기반 설정
if daily_users < 1000:
    MAX_CACHE_SIZE = 50
elif daily_users < 10000:
    MAX_CACHE_SIZE = 100
else:
    MAX_CACHE_SIZE = 500
```

### 2. 정기적인 통계 확인

```bash
# cron으로 매시간 통계 저장
0 * * * * curl http://localhost:5500/cache/stats >> cache_stats.log
```

### 3. 알람 설정

```python
# 히트율이 낮으면 알람
if hit_rate < 50:
    send_alert("캐시 히트율 낮음: {hit_rate}%")

# 메모리 사용률이 높으면 알람
if memory_utilization > 90:
    send_alert("캐시 메모리 사용률 높음: {memory_utilization}%")
```

### 4. 서버 재시작 시 워밍업 (선택)

```python
@app.on_event("startup")
async def cache_warmup():
    """주요 지역 미리 캐싱"""
    major_regions = [
        ('11', 'sido'),   # 서울
        ('26', 'sido'),   # 부산
        ('27', 'sido'),   # 대구
    ]

    service = SpatialAnalysisService()
    for region_code, level in major_regions:
        await service.get_region_boundary(region_code, level)
        logger.info(f"✓ 워밍업: {region_code}")
```

## 트러블슈팅

### 문제: 메모리 사용량이 예상보다 높음

**진단**:
```bash
curl http://localhost:5500/cache/stats | jq '.memory_usage_mb'
```

**해결**:
1. `MAX_CACHE_SIZE` 감소
2. 일부 캐시 삭제: `curl -X DELETE http://localhost:5500/cache/clear`
3. 서버 재시작

### 문제: 캐시가 자주 삭제됨 (evictions 높음)

**진단**:
```bash
curl http://localhost:5500/cache/stats | jq '.evictions'
```

**해결**:
1. `MAX_CACHE_SIZE` 증가
2. 메모리 여유 있으면 `MAX_CACHE_MEMORY_MB` 증가

### 문제: 히트율이 낮음

**진단**:
```bash
curl http://localhost:5500/cache/stats | jq '.hit_rate'
```

**원인**:
- 사용자가 매우 다양한 지역 조회
- 캐시가 너무 작음

**해결**:
1. `MAX_CACHE_SIZE` 증가 (100 → 200 → 500)
2. 사용 패턴 분석 (`cache_keys` 확인)

## 요약

### ✅ 장점

1. **자동 메모리 관리**: LRU로 자동 정리
2. **낮은 비용**: 월 $0.16-0.80 추가 비용
3. **높은 효율**: Supabase 비용 $50-75/월 절감
4. **확장 가능**: 설정으로 쉽게 조정

### ⚠️ 주의사항

1. 캐시 크기를 너무 크게 설정하지 마세요
2. 정기적으로 통계를 모니터링하세요
3. 서버 메모리를 고려하여 설정하세요
4. 대규모 서비스는 Redis 사용 고려

### 📊 권장 설정 (재정리)

| 사용자/일 | MAX_CACHE_SIZE | 메모리 | 추가 비용 | ROI |
|----------|----------------|--------|----------|-----|
| < 1,000 | 50 | ~10MB | $0.08/월 | 625배 |
| 1k-10k | 100 | ~20MB | $0.16/월 | 312배 |
| > 10k | 500 | ~100MB | $0.80/월 | 62배 |

**모든 경우에 압도적인 이득!** 🚀
