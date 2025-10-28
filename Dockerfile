# Python 3.11 slim 이미지 사용 (경량화)
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 업데이트 및 필수 도구 설치
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 파일 복사 및 설치
# (캐시 활용을 위해 먼저 복사)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 파일 복사
COPY server.py .
COPY index.html .
COPY static/ ./static/

# 환경 변수 기본값 설정 (.env 파일이 우선)
ENV HOST=0.0.0.0
ENV PORT=8000

# 포트 노출
EXPOSE 8000

# 헬스체크 설정 (Docker가 컨테이너 상태 모니터링)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 애플리케이션 실행
CMD ["python", "server.py"]
