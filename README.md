# Hospital Area Analysis - 배포 가이드

병원 서비스 영역 분석 웹 애플리케이션의 AWS EC2 + CloudFront 배포 가이드입니다.

## 📋 목차

- [시스템 아키텍처](#시스템-아키텍처)
- [사전 요구사항](#사전-요구사항)
- [배포 단계](#배포-단계)
- [환경 변수 설정](#환경-변수-설정)
- [CloudFront 연결](#cloudfront-연결)
- [트러블슈팅](#트러블슈팅)
- [유지보수](#유지보수)

---

## 🏗 시스템 아키텍처

```
[사용자]
   ↓ HTTPS
[AWS CloudFront] (SSL 처리, CDN, 캐싱)
   ↓ HTTP
[AWS EC2 Ubuntu:8000]
   ↓
[Docker Container]
   └─ FastAPI Application
      ├─ index.html
      ├─ static/ (CSS, JS, JSON)
      └─ Supabase 연결
```

---

## ✅ 사전 요구사항

### 로컬 개발 환경
- Git
- SSH 클라이언트 (EC2 접속용)

### AWS EC2 인스턴스
- ✅ Ubuntu (이미 설치됨)
- ✅ Docker (이미 설치됨)
- ✅ Docker Compose (이미 설치됨)
- Security Group: 8000번 포트 오픈 필요

### Supabase
- Supabase 프로젝트 생성 완료
- Service Role Key 발급 완료

---

## 🚀 배포 단계

### 1. EC2 Security Group 설정

EC2 인스턴스의 Security Group에서 8000번 포트를 열어야 합니다.

```bash
# AWS Console에서 설정
EC2 → Security Groups → 해당 Security Group 선택
→ Inbound Rules → Edit inbound rules

Type: Custom TCP
Port: 8000
Source: 0.0.0.0/0 (임시 테스트용) 또는 CloudFront IP 대역
```

**보안 강화 (권장):**
CloudFront만 허용하려면 [AWS CloudFront IP 대역](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html)을 Source에 추가하세요.

---

### 2. 프로젝트 파일을 EC2로 전송

#### 방법 A: Git Clone (권장)

```bash
# EC2에 SSH 접속
ssh -i your-key.pem ubuntu@your-ec2-ip

# 프로젝트 클론
cd ~
git clone https://github.com/yourusername/hospital_area_analysis.git
cd hospital_area_analysis
```

#### 방법 B: 직접 파일 전송

```bash
# 로컬에서 실행
scp -i your-key.pem -r /path/to/hospital_area_analaysis_main ubuntu@your-ec2-ip:~/
```

---

### 3. 환경 변수 설정

**중요:** `.env` 파일은 Git에 포함되지 않으므로 수동으로 생성해야 합니다.

#### 옵션 A: 로컬에서 EC2로 전송

```bash
# 로컬에서 실행 (.env 파일이 있는 경우)
scp -i your-key.pem .env ubuntu@your-ec2-ip:~/hospital_area_analysis/
```

#### 옵션 B: EC2에서 직접 생성

```bash
# EC2에서 실행
cd ~/hospital_area_analysis
nano .env
```

`.env` 파일 내용:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-service-role-key-here

# Server Configuration
HOST=0.0.0.0
PORT=8000

# CORS Configuration
# CloudFront 배포 후 도메인으로 변경하세요
# 예: ALLOWED_ORIGINS=https://d111111abcdef8.cloudfront.net
ALLOWED_ORIGINS=*
```

**저장:** `Ctrl + X` → `Y` → `Enter`

---

### 4. Docker 컨테이너 빌드 및 실행

```bash
# EC2에서 실행
cd ~/hospital_area_analysis

# Docker Compose로 빌드 및 실행
docker compose up --build -d

# 로그 확인
docker compose logs -f

# 정상 실행 확인 (Ctrl + C로 종료)
```

**예상 로그 출력:**

```
INFO:     Supabase URL: https://vsmfqmbumthyhvvozxxb.supabase.co
INFO:     Supabase 클라이언트 초기화 완료
INFO:     ⚠️  CORS: 모든 도메인 허용 (*) - 프로덕션 환경에서는 권장하지 않습니다
INFO:     서버 시작 중... Host: 0.0.0.0, Port: 8000
INFO:     Application startup complete.
```

---

### 5. 로컬에서 테스트

```bash
# 브라우저에서 접속
http://your-ec2-ip:8000

# 또는 curl로 테스트
curl http://your-ec2-ip:8000/health
```

**예상 응답:**

```json
{
  "status": "healthy",
  "database": "success",
  "version": "1.0.0"
}
```

---

## ☁️ CloudFront 연결

### 1. CloudFront Distribution 생성

AWS Console → CloudFront → Create Distribution

**Origin Settings:**
- Origin Domain: `your-ec2-ip:8000` (EC2 Public IP 입력)
- Protocol: `HTTP only`
- Origin Path: 비워두기

**Default Cache Behavior:**
- Viewer Protocol Policy: `Redirect HTTP to HTTPS`
- Allowed HTTP Methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
- Cache Policy: `CachingDisabled` (API 응답 캐싱 방지)
- Origin Request Policy: `AllViewer`

**설정 완료 후:**
- CloudFront 도메인 확인: `https://d111111abcdef8.cloudfront.net`

### 2. CORS 설정 업데이트

CloudFront 도메인을 받은 후 `.env` 파일 업데이트:

```bash
# EC2에서 실행
cd ~/hospital_area_analysis
nano .env

# ALLOWED_ORIGINS 수정
ALLOWED_ORIGINS=https://d111111abcdef8.cloudfront.net

# 저장 후 컨테이너 재시작
docker compose restart
```

### 3. CloudFront에서 테스트

```bash
# 브라우저에서 접속
https://d111111abcdef8.cloudfront.net

# Health check
curl https://d111111abcdef8.cloudfront.net/health
```

---

## 🔧 유용한 Docker 명령어

```bash
# 컨테이너 상태 확인
docker compose ps

# 로그 실시간 확인
docker compose logs -f

# 컨테이너 재시작
docker compose restart

# 컨테이너 중지
docker compose down

# 컨테이너 중지 및 이미지 삭제
docker compose down --rmi all

# 코드 변경 후 재빌드
docker compose up --build -d

# 컨테이너 내부 접속 (디버깅)
docker compose exec web bash
```

---

## 🛠 트러블슈팅

### 문제 1: "SUPABASE_URL 환경 변수가 설정되지 않았습니다"

**원인:** `.env` 파일이 없거나 경로가 잘못됨

**해결:**
```bash
# .env 파일 확인
ls -la .env

# 파일이 없으면 생성
nano .env
```

---

### 문제 2: CloudFront에서 접속하면 CORS 에러

**원인:** `ALLOWED_ORIGINS`에 CloudFront 도메인이 등록되지 않음

**해결:**
```bash
# .env 수정
nano .env

# ALLOWED_ORIGINS를 CloudFront 도메인으로 변경
ALLOWED_ORIGINS=https://d111111abcdef8.cloudfront.net

# 재시작
docker compose restart
```

---

### 문제 3: 포트 8000에 접속 불가

**원인:** Security Group에서 8000번 포트가 열리지 않음

**해결:**
```bash
# AWS Console에서
EC2 → Security Groups → Inbound Rules 확인
→ 8000번 포트가 0.0.0.0/0 또는 CloudFront IP에 열려 있는지 확인
```

---

### 문제 4: "행정구역 코드 데이터 로드 실패"

**원인:** `static/korea_admin_codes.json` 파일이 없음

**해결:**
```bash
# 파일 확인
ls -la static/korea_admin_codes.json

# 없으면 Git에서 다시 클론
git pull origin main
```

---

### 문제 5: Docker 빌드 실패

**원인:** 디스크 공간 부족 또는 이전 이미지/컨테이너 충돌

**해결:**
```bash
# 미사용 Docker 리소스 정리
docker system prune -a

# 재빌드
docker compose up --build -d
```

---

## 🔄 유지보수

### 코드 업데이트

```bash
# EC2에서 실행
cd ~/hospital_area_analysis

# Git에서 최신 코드 가져오기
git pull origin main

# 컨테이너 재빌드 및 재시작
docker compose up --build -d

# 로그 확인
docker compose logs -f
```

### 환경 변수 변경

```bash
# .env 파일 수정
nano .env

# 변경 후 재시작 (재빌드 불필요)
docker compose restart
```

### 로그 확인

```bash
# 최근 100줄 확인
docker compose logs --tail=100

# 실시간 확인
docker compose logs -f

# 특정 시간대 확인
docker compose logs --since 2024-01-01T10:00:00
```

### 서버 재부팅 후 자동 시작

Docker Compose의 `restart: unless-stopped` 설정으로 자동 재시작됩니다.

```bash
# 확인
docker compose ps

# 수동 시작이 필요한 경우
docker compose up -d
```

---

## 🚀 성능 향상 (선택사항)

### Nginx 리버스 프록시 추가

성능 향상이 필요한 경우 Nginx를 추가하세요.

**장점:**
- 정적 파일 서빙 속도 10배 향상
- Gzip 압축
- 캐싱 제어
- 로드 밸런싱

**추가 파일:**
- `Dockerfile.nginx`
- `nginx.conf`
- `docker-compose.yml` 수정

자세한 가이드는 별도 문서 참조.

---

## 📞 문제 발생 시

1. **로그 확인:** `docker compose logs -f`
2. **헬스체크:** `curl http://localhost:8000/health`
3. **환경 변수 확인:** `docker compose exec web env | grep SUPABASE`
4. **Security Group 확인:** AWS Console
5. **Supabase 연결 확인:** Supabase Dashboard

---

## 📚 참고 자료

- [Docker Compose 공식 문서](https://docs.docker.com/compose/)
- [AWS CloudFront 문서](https://docs.aws.amazon.com/cloudfront/)
- [FastAPI 문서](https://fastapi.tiangolo.com/)
- [Supabase 문서](https://supabase.com/docs)

---

**작성일:** 2024-10-27
**버전:** 1.0.0
**라이선스:** MIT
