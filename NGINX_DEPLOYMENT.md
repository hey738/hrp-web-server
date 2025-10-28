# Nginx + FastAPI 배포 가이드

Nginx 리버스 프록시를 추가한 프로덕션 구성 배포 가이드입니다.

## 🏗 아키텍처

```
[사용자]
   ↓ HTTPS
[CloudFront] (SSL, CDN, 엣지 캐싱)
   ↓ HTTP
[EC2:80]
   ↓
[Nginx Container:80] ← 정적 파일 직접 서빙 (빠름!)
   ├─ /static/* → Nginx가 직접 서빙 (CSS, JS, JSON)
   └─ /api/* → FastAPI로 프록시
       ↓
   [FastAPI Container:8000] ← API 처리만
```

---

## 📦 새로 추가된 파일

1. **nginx.conf** - Nginx 설정 파일
2. **Dockerfile.nginx** - Nginx 컨테이너 빌드 파일
3. **docker-compose.yml** - 멀티 컨테이너 구성 (수정됨)

---

## 🚀 배포 단계

### 1. Git에 커밋 및 푸시

```bash
# 로컬에서
cd /Users/user/Desktop/hospital_area_analaysis_main

git add nginx.conf Dockerfile.nginx docker-compose.yml
git commit -m "Add Nginx reverse proxy for production"
git push origin main
```

---

### 2. EC2에서 업데이트

```bash
# EC2에 SSH 접속
ssh -i your-key.pem ubuntu@3.39.135.89

# 프로젝트 디렉토리로 이동
cd ~/hrp-web-server

# 최신 코드 받기
git pull origin main

# 기존 컨테이너 중지
docker compose down

# 새로운 구성으로 빌드 및 실행
docker compose up --build -d

# 로그 확인
docker compose logs -f
```

---

### 3. Security Group 수정

AWS Console → EC2 → Security Groups

**변경 사항:**
- ✅ 80번 포트 추가 (HTTP)
- ⚠️ 8000번 포트 제거 (외부 접근 차단, Nginx를 통해서만 접근)

**최종 인바운드 규칙:**

| 유형 | 프로토콜 | 포트 | 소스 |
|------|----------|------|--------|
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |
| SSH | TCP | 22 | 0.0.0.0/0 |
| ~~Custom TCP~~ | ~~TCP~~ | ~~8000~~ | ~~삭제~~ |

---

### 4. 테스트

#### A. EC2에서 로컬 테스트
```bash
# Nginx 헬스체크
curl http://localhost:80/nginx-health

# FastAPI 헬스체크 (Nginx를 통해)
curl http://localhost:80/health

# 정적 파일 테스트
curl -I http://localhost:80/static/style.css
```

#### B. 외부 접속 테스트
```bash
# 브라우저에서
http://3.39.135.89

# 또는 curl로
curl http://3.39.135.89/health
```

---

### 5. CloudFront Origin 설정 변경

**Before (8000번 포트):**
```
Origin Domain: 3.39.135.89:8000
```

**After (80번 포트):**
```
Origin Domain: 3.39.135.89
Port: 80 (또는 비워두기)
```

---

## 🔍 컨테이너 상태 확인

```bash
docker compose ps
```

**예상 출력:**
```
NAME                      STATUS    PORTS
hospital-area-nginx       Up        0.0.0.0:80->80/tcp
hospital-area-analysis    Up        8000/tcp
```

**주의:**
- Nginx: `0.0.0.0:80->80/tcp` (외부 접근 가능)
- FastAPI: `8000/tcp` (포트 매핑 없음, 내부 네트워크만)

---

## 📊 성능 개선 효과

### Before (FastAPI 직접)
- 정적 파일 요청: FastAPI가 처리 (느림)
- 동시 접속: 제한적
- 압축: 없음

### After (Nginx + FastAPI)
- 정적 파일 요청: Nginx가 처리 (**10배 빠름**)
- 동시 접속: 대폭 증가
- Gzip 압축: 자동 적용 (대역폭 50% 절감)
- 캐싱: 30일 캐싱 (CDN 부하 감소)

---

## 🛠 유용한 명령어

### 로그 확인
```bash
# 모든 컨테이너 로그
docker compose logs -f

# Nginx 로그만
docker compose logs -f nginx

# FastAPI 로그만
docker compose logs -f web
```

### 컨테이너 재시작
```bash
# 전체 재시작
docker compose restart

# Nginx만 재시작
docker compose restart nginx

# FastAPI만 재시작
docker compose restart web
```

### Nginx 설정 테스트
```bash
# Nginx 설정 문법 검사
docker compose exec nginx nginx -t

# 설정 리로드 (재시작 없이)
docker compose exec nginx nginx -s reload
```

---

## 🔧 트러블슈팅

### 문제 1: "502 Bad Gateway"

**원인:** FastAPI 컨테이너가 실행되지 않음

**해결:**
```bash
# FastAPI 상태 확인
docker compose ps web

# FastAPI 로그 확인
docker compose logs web

# FastAPI 재시작
docker compose restart web
```

---

### 문제 2: 정적 파일 404

**원인:** Nginx가 static 디렉토리를 찾을 수 없음

**해결:**
```bash
# static 디렉토리 확인
ls -la static/

# Nginx 컨테이너 내부 확인
docker compose exec nginx ls -la /usr/share/nginx/html/static/

# 재빌드
docker compose down
docker compose up --build -d
```

---

### 문제 3: CORS 에러

**원인:** CloudFront 도메인이 ALLOWED_ORIGINS에 없음

**해결:**
```bash
# .env 수정
nano .env

# ALLOWED_ORIGINS에 CloudFront 도메인 추가
ALLOWED_ORIGINS=https://d111111abcdef8.cloudfront.net

# 재시작
docker compose restart web
```

---

## 📈 모니터링

### Nginx 접속 통계
```bash
# Nginx 접속 로그 확인
docker compose exec nginx tail -f /var/log/nginx/access.log

# 에러 로그 확인
docker compose exec nginx tail -f /var/log/nginx/error.log
```

### 실시간 요청 모니터링
```bash
# 실시간 로그 (모든 컨테이너)
docker compose logs -f --tail=50
```

---

## 🔒 보안 강화 (권장)

### 1. 8000번 포트 완전 차단

Security Group에서 8000번 포트 규칙 삭제

### 2. CloudFront IP만 허용

```bash
# 80번 포트 소스를 CloudFront IP 대역으로 제한
# AWS CloudFront IP 목록:
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html
```

### 3. Rate Limiting 추가

nginx.conf에 추가:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /analyze {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://fastapi_backend;
}
```

---

## 🎯 다음 단계

1. ✅ Nginx + FastAPI 구성 완료
2. ⬜ CloudFront Origin 업데이트
3. ⬜ HTTPS 인증서 추가 (CloudFront에서)
4. ⬜ 커스텀 도메인 연결
5. ⬜ 모니터링 설정 (CloudWatch)

---

## 📚 참고 자료

- [Nginx 공식 문서](https://nginx.org/en/docs/)
- [FastAPI 배포 가이드](https://fastapi.tiangolo.com/deployment/)
- [Docker Compose 문서](https://docs.docker.com/compose/)

---

**작성일:** 2024-10-27
**버전:** 2.0.0 (Nginx 추가)
