var container = document.getElementById('map');
var options = {
    center: new kakao.maps.LatLng(37.3891408885668, 126.644442676851),
    level: 6
};

var map = new kakao.maps.Map(container, options);

// 행정구역 경계를 표시하기 위한 전역 변수
var regionBoundaryPolygons = [];  // 경계 폴리곤 배열 (MultiPolygon 지원)
var regionCentroidMarker = null;   // 중심점 마커

// 사이드바 토글 기능
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var sidebarToggle = document.getElementById('sidebarToggle');

    sidebar.classList.toggle('open');
    sidebarToggle.classList.toggle('sidebar-open');
}

// 사이드바 토글 버튼 이벤트 리스너
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
    // ✨ 새로 추가: 그리기 버튼 초기 상태 설정
    initializeDrawingButtonStates();
});

// 지도타입 컨트롤의 지도 또는 스카이뷰 버튼을 클릭하면 호출되어 지도타입을 바꾸는 함수입니다
function setMapType(maptype) {
    var roadmapControl = document.getElementById('btnRoadmap');
    var skyviewControl = document.getElementById('btnSkyview');
    if (maptype === 'roadmap') {
        map.setMapTypeId(kakao.maps.MapTypeId.ROADMAP);
        roadmapControl.className = 'selected_btn';
        skyviewControl.className = 'btn';
    } else {
        map.setMapTypeId(kakao.maps.MapTypeId.HYBRID);
        skyviewControl.className = 'selected_btn';
        roadmapControl.className = 'btn';
    }
}

// 지도 확대, 축소 컨트롤에서 확대 버튼을 누르면 호출되어 지도를 확대하는 함수입니다
function zoomIn() {
    map.setLevel(map.getLevel() - 1);
}

// 지도 확대, 축소 컨트롤에서 축소 버튼을 누르면 호출되어 지도를 확대하는 함수입니다
function zoomOut() {
    map.setLevel(map.getLevel() + 1);
}

var options = { // Drawing Manager를 생성할 때 사용할 옵션입니다
    map: map, // Drawing Manager로 그리기 요소를 그릴 map 객체입니다
    drawingMode: [ // Drawing Manager로 제공할 그리기 요소 모드입니다
        kakao.maps.drawing.OverlayType.CIRCLE,
        kakao.maps.drawing.OverlayType.POLYGON
    ],
    // 사용자에게 제공할 그리기 가이드 툴팁입니다
    guideTooltip: ['draw'],
    // 사용자에게 도형을 그릴때, 드래그할때, 수정할때 가이드 툴팁을 표시하도록 설정합니다
    circleOptions: {
        draggable: false,
        removable: true,
        editable: false,
        strokeColor: '#39f',
        fillColor: '#39f',
        fillOpacity: 0.5
    },
    polygonOptions: {
        draggable: false,
        removable: true,
        editable: false,
        strokeColor: '#39f',
        fillColor: '#39f',
        fillOpacity: 0.5,
        hintStrokeStyle: 'dash',
        hintStrokeOpacity: 0.5
    }
};

// 위에 작성한 옵션으로 Drawing Manager를 생성합니다
var manager = new kakao.maps.drawing.DrawingManager(options);

// 버튼 클릭 시 호출되는 핸들러 입니다
function selectOverlay(type) {
    // 그리기 중이면 그리기를 취소합니다
    manager.cancel();

    // 이미 그려진 도형을 삭제합니다
    manager.clear()

    // 현재 그리기 타입 저장
    currentDrawingType = kakao.maps.drawing.OverlayType[type];

    radiusOverlay.setMap(null);

    // 클릭한 그리기 요소 타입을 선택합니다
    manager.select(kakao.maps.drawing.OverlayType[type]);

    // ✨ 새로 추가: 버튼 상태 업데이트
    updateDrawingButtonStates(type);
}

// 반경 표시용 커스텀 오버레이
var drawingOverlay = new kakao.maps.CustomOverlay({
    xAnchor: 0,
    yAnchor: 0,
    zIndex: 1
});
// 반경정보를 표시할 커스텀 오버레이를 생성합니다
var radiusOverlay = new kakao.maps.CustomOverlay({
    xAnchor: 0,
    yAnchor: 0,
    zIndex: 1
});
var currentDrawingType = null;
var circleCenter = null;
const measureLine = new kakao.maps.Polyline()

// 거리 계산 (Haversine, meter)
function distanceMeters(a, b) {
    measureLine.setPath([a, b])
    return measureLine.getLength(); // 미터
}

// Drawing Manager 이벤트 리스너 추가
// 원 그리기 시작 시
manager.addListener('drawstart', function (data) {
    if (data.overlayType === kakao.maps.drawing.OverlayType.CIRCLE) {
        const firstPointCoords = data.coords; // W콩나물 좌표
        const firstPointLatLng = firstPointCoords.toLatLng(); // WGS84 좌표
        circleCenter = firstPointLatLng;
        currentDrawingType = data.overlayType;
    }
});

// 원 그리기 진행 중
manager.addListener('draw', function (data) {
    if (currentDrawingType === kakao.maps.drawing.OverlayType.CIRCLE) {
        
        const mousePointCoords = data.coords; // W콩나물 좌표
        const mousePointLatLng = mousePointCoords.toLatLng(); // WGS84 좌표

        var radius = distanceMeters(circleCenter, mousePointLatLng)
        content = '<div class="info">반경 <span class="number">' + Math.round(radius) + '</span>m</div>';

        // 반경 정보를 표시할 커스텀 오버레이의 좌표를 마우스커서 위치로 설정합니다
        drawingOverlay.setPosition(circleCenter);

        // 반경 정보를 표시할 커스텀 오버레이의 표시할 내용을 설정합니다
        drawingOverlay.setContent(content);

        // 그려지고 있는 원의 반경정보 커스텀 오버레이를 지도에 표시합니다
        drawingOverlay.setMap(map);
    };
});

// 원 그리기 완료 시
manager.addListener('drawend', function (data) {
    if (currentDrawingType === kakao.maps.drawing.OverlayType.CIRCLE) {
        const mousePointCoords = data.coords; // W콩나물 좌표
        const mousePointLatLng = mousePointCoords.toLatLng(); // WGS84 좌표

        var radius = distanceMeters(circleCenter, mousePointLatLng);
        content = '<div class="info">반경 <span class="number">' + Math.round(radius) + '</span>m</div>';

        radiusOverlay.setPosition(circleCenter);

        radiusOverlay.setContent(content);

        radiusOverlay.setMap(map);

        drawingOverlay.setMap(null);

        // ✨ 새로운 API 형식으로 데이터 준비
        const centerLatLng = manager.getData().circle[0].center;
        const circleData = {
            center_lng: centerLatLng.x,  // 카카오맵에서 x는 longitude
            center_lat: centerLatLng.y,  // 카카오맵에서 y는 latitude
            radius: manager.getData().circle[0].radius,
            segments: 32  // 고품질 원형
        };

        // 새로운 API로 분석 실행
        analyzeHospitalArea('circle', circleData)
            .then(result => {
                displayAnalysisResults(result, 'circle');
            })
            .catch(error => {
                showErrorMessage('분석 중 오류가 발생했습니다: ' + error.message);
            });
    } else {
        // ✨ 새로운 API 형식으로 다각형 데이터 준비
        const polygonPoints = manager.getData().polygon[0].points;
        const coordinates = polygonPoints.map(point => [point.x, point.y]); // [lng, lat] 형식

        const polygonData = {
            coordinates: coordinates
        };

        // 새로운 API로 분석 실행
        analyzeHospitalArea('polygon', polygonData)
            .then(result => {
                displayAnalysisResults(result, 'polygon');
            })
            .catch(error => {
                showErrorMessage('분석 중 오류가 발생했습니다: ' + error.message);
            });
    }
});

// 그리기 취소 시
manager.addListener('cancel', function () {
    drawingOverlay.setMap(null);
    // ✨ 새로 추가: 버튼 상태 초기화
    resetDrawingButtonStates();
});

// 그리기 삭제 시
manager.addListener('remove', function (data) {
    radiusOverlay.setMap(null);
    // ✨ 새로 추가: 버튼 상태 초기화
    resetDrawingButtonStates();
});

// ✨ 새로운 분석 API 함수들
async function analyzeHospitalArea(shapeType, shapeData) {
    try {
        showLoadingSpinner();
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: shapeType,
                data: shapeData
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('분석 요청 오류:', error);
        throw error;
    } finally {
        hideLoadingSpinner();
    }
}

// 로딩 스피너 표시/숨김 함수
function showLoadingSpinner() {
    const resultsContent = document.getElementById('resultsContent');
    resultsContent.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>분석 중입니다...</p>
        </div>
    `;
}

function hideLoadingSpinner() {
    // 결과가 표시될 때 자동으로 숨겨집니다
}

// 에러 메시지 표시 함수
function showErrorMessage(message) {
    const resultsContent = document.getElementById('resultsContent');
    resultsContent.innerHTML = `
        <div class="error-message">
            <h5>⚠️ 분석 중 오류 발생</h5>
            <p>${message}</p>
        </div>
    `;
}

// 개선된 분석 결과 표시 함수
function displayAnalysisResults(result, shapeType) {
    const resultsContent = document.getElementById('resultsContent');

    // 연령별 분포 차트 생성
    const ageDistributionHtml = createAgeDistributionChart(result.age_distribution);

    resultsContent.innerHTML = `
        <div class="analysis-results">
            <h4>${shapeType === 'circle' ? '원형' : '다각형'} 영역 분석 결과</h4>

            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">총 인구수</span>
                    <span class="stat-value">${result.total_population.toLocaleString()}명</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">총 가구수</span>
                    <span class="stat-value">${result.total_households.toLocaleString()}세대</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">분석 면적</span>
                    <span class="stat-value">${(result.analysis_area_sqm / 1000000).toFixed(2)}km²</span>
                </div>
            </div>

            ${ageDistributionHtml}

            <button onclick="exportResults()" class="export-btn">결과 내보내기</button>
        </div>
    `;

    // 테이블 선택 기능 초기화
    initializeTableSelection();
}

// 연령별 분포 차트 생성 함수
function createAgeDistributionChart(ageData) {
    const totalPopulation = Object.values(ageData).reduce((sum, count) => sum + count, 0);

    if (totalPopulation === 0) {
        return '<div class="age-distribution"><p>인구 데이터가 없습니다.</p></div>';
    }

    const sortedAges = Object.entries(ageData)
        .sort(([a], [b]) => {
            const order = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대', '100세 이상'];
            return order.indexOf(a) - order.indexOf(b);
        });

    // 각 연령대를 한 행씩 생성
    const rowsHtml = sortedAges.map(([ageGroup, count]) => {
        const percentage = (count / totalPopulation * 100).toFixed(1);
        return `
            <tr>
                <td>${ageGroup}</td>
                <td>${count.toLocaleString()}명</td>
                <td>${percentage}%</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="age-distribution">
            <h5>연령별 인구 분포</h5>
            <table class="age-distribution-table" id="ageTable">
                <thead>
                    <tr>
                        <th>연령대</th>
                        <th>인구수</th>
                        <th>비율</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <div id="tableSelectionSummary" class="table-selection-summary" style="display: none;">
                <span class="summary-label">합계:</span>
                <span id="selectionSum" class="summary-value">0</span>
            </div>
        </div>
    `;
}

// ==================== 테이블 선택 및 합계 기능 ====================

let isSelecting = false;
let selectedCells = new Set();
let startCell = null;

// 테이블 이벤트 리스너 초기화 (결과 표시 후 호출)
function initializeTableSelection() {
    const table = document.getElementById('ageTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // 마우스 다운: 선택 시작
    tbody.addEventListener('mousedown', function(e) {
        const cell = e.target.closest('td');
        if (!cell) return;

        // 텍스트 선택 방지
        e.preventDefault();

        isSelecting = true;
        selectedCells.clear();
        clearSelection();

        startCell = cell;
        cell.classList.add('selected');
        selectedCells.add(cell);

        updateSelectionSummary();
    });

    // 마우스 이동: 선택 확장
    tbody.addEventListener('mouseover', function(e) {
        if (!isSelecting) return;

        const cell = e.target.closest('td');
        if (!cell || !startCell) return;

        // 기존 선택 초기화
        clearSelection();
        selectedCells.clear();

        // 시작 셀과 현재 셀 사이의 모든 셀 선택
        const cells = Array.from(tbody.querySelectorAll('td'));
        const startIdx = cells.indexOf(startCell);
        const endIdx = cells.indexOf(cell);

        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);

        const startRow = Math.floor(minIdx / 3);
        const endRow = Math.floor(maxIdx / 3);
        const startCol = minIdx % 3;
        const endCol = maxIdx % 3;

        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        // 사각형 범위 선택
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const idx = row * 3 + col;
                if (idx < cells.length) {
                    cells[idx].classList.add('selected');
                    selectedCells.add(cells[idx]);
                }
            }
        }

        updateSelectionSummary();
    });

    // 마우스 업: 선택 종료 (선택은 유지)
    document.addEventListener('mouseup', function() {
        if (isSelecting) {
            isSelecting = false;
            // 선택은 유지, 드래그만 종료
        }
    });

    // 테이블 외부 클릭 시 선택 해제 (mousedown으로 변경하여 드래그와 구분)
    document.addEventListener('mousedown', function(e) {
        // 테이블이나 합계 표시 영역이 아닌 곳을 클릭한 경우에만 선택 해제
        const summaryDiv = document.getElementById('tableSelectionSummary');
        if (!table.contains(e.target) && !summaryDiv?.contains(e.target)) {
            clearSelection();
            selectedCells.clear();
            hideSelectionSummary();
        }
    });
}

// 선택 해제
function clearSelection() {
    const selected = document.querySelectorAll('.age-distribution-table td.selected');
    selected.forEach(cell => cell.classList.remove('selected'));
}

// 합계 계산 및 표시
function updateSelectionSummary() {
    // 선택된 셀이 0개이거나 1개만 선택된 경우 합계 숨김
    if (selectedCells.size === 0 || selectedCells.size === 1) {
        hideSelectionSummary();
        return;
    }

    let sum = 0;
    let count = 0;

    selectedCells.forEach(cell => {
        const text = cell.textContent.trim();

        // 인구수 셀인 경우 (예: "1,234명")
        if (text.includes('명')) {
            const numStr = text.replace(/,/g, '').replace('명', '');
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
                sum += num;
                count++;
            }
        }
        // 비율 셀인 경우 (예: "10.5%")
        else if (text.includes('%')) {
            const numStr = text.replace('%', '');
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
                sum += num;
                count++;
            }
        }
    });

    if (count > 1) {
        showSelectionSummary(sum, count);
    } else {
        hideSelectionSummary();
    }
}

// 합계 표시
function showSelectionSummary(sum, count) {
    const summaryDiv = document.getElementById('tableSelectionSummary');
    const sumSpan = document.getElementById('selectionSum');

    if (!summaryDiv || !sumSpan) return;

    // 숫자 포맷팅 (천단위 구분)
    const formattedSum = sum.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });

    sumSpan.textContent = `${formattedSum}`;
    summaryDiv.style.display = 'flex';
}

// 합계 숨기기
function hideSelectionSummary() {
    const summaryDiv = document.getElementById('tableSelectionSummary');
    if (summaryDiv) {
        summaryDiv.style.display = 'none';
    }
}

// 결과 내보내기 함수
function exportResults() {
    // 추후 구현
    alert('결과 내보내기 기능은 추후 구현될 예정입니다.');
}

// 새로운 기능: 선택 모드 관리 및 지역 선택
let selectionMode = 'drawing'; // 'region' | 'drawing'
let koreaAdminData = null;

// 그리기 버튼 상태 관리
let activeDrawingMode = null; // 'CIRCLE', 'POLYGON', null

// 그리기 버튼 상태 관리 함수들
function updateDrawingButtonStates(activeType) {
    const circleBtn = document.getElementById('circleBtn');
    const polygonBtn = document.getElementById('polygonBtn');

    if (!circleBtn || !polygonBtn) return; // 요소가 없으면 리턴

    // 모든 버튼을 기본(inactive) 상태로 설정
    circleBtn.classList.remove('active');
    polygonBtn.classList.remove('active');

    // 선택된 버튼만 active 상태로 설정
    if (activeType === 'CIRCLE') {
        circleBtn.classList.add('active');
        activeDrawingMode = 'CIRCLE';
    } else if (activeType === 'POLYGON') {
        polygonBtn.classList.add('active');
        activeDrawingMode = 'POLYGON';
    }

    console.log(`Drawing button state updated: ${activeType} is now active`);
}

function resetDrawingButtonStates() {
    const circleBtn = document.getElementById('circleBtn');
    const polygonBtn = document.getElementById('polygonBtn');

    if (!circleBtn || !polygonBtn) return; // 요소가 없으면 리턴

    // 모든 버튼을 기본(inactive) 상태로 설정
    circleBtn.classList.remove('active');
    polygonBtn.classList.remove('active');
    activeDrawingMode = null;

    console.log('Drawing button states reset to inactive');
}

// 초기 상태 설정 함수
function initializeDrawingButtonStates() {
    const circleBtn = document.getElementById('circleBtn');
    const polygonBtn = document.getElementById('polygonBtn');

    if (!circleBtn || !polygonBtn) return; // 요소가 없으면 리턴

    // 페이지 로드 시 모든 버튼을 기본(inactive) 상태로 설정
    circleBtn.classList.remove('active');
    polygonBtn.classList.remove('active');
    activeDrawingMode = null;

    console.log('Drawing button states initialized to inactive');
}

// 선택 모드 변경 함수
function changeSelectionMode(mode) {
    selectionMode = mode;
    const regionSection = document.getElementById('regionSection');
    const drawingSection = document.getElementById('drawingSection');

    if (mode === 'region') {
        regionSection.style.display = 'block';
        drawingSection.style.display = 'none';
        // 그리기 모드 취소
        manager.cancel();
        manager.clear();
        radiusOverlay.setMap(null);
        drawingOverlay.setMap(null);
        // ✨ 새로 추가: 버튼 상태 초기화
        resetDrawingButtonStates();
        // 지역 데이터 로드
        loadRegionData();
    } else {
        regionSection.style.display = 'none';
        drawingSection.style.display = 'block';
        // 지역 선택 모드에서 그리기 모드로 전환 시 경계 제거
        clearRegionBoundary();
        // ✨ 새로 추가: 그리기 모드로 돌아올 때도 상태 초기화
        resetDrawingButtonStates();
    }
}

// 지역 데이터 로드 함수
async function loadRegionData() {
    if (koreaAdminData) return; // 이미 로드됨

    try {
        const response = await fetch('/static/korea_admin_tree.json');
        koreaAdminData = await response.json();
        populateSidoSelect();
    } catch (error) {
        console.error('지역 데이터 로드 실패:', error);
        alert('지역 데이터를 불러올 수 없습니다.');
    }
}

// 시/도 선택 드롭다운 채우기
function populateSidoSelect() {
    const sidoSelect = document.getElementById('sidoSelect');
    sidoSelect.innerHTML = '<option value="">시/도 선택</option>';

    Object.keys(koreaAdminData).forEach(sido => {
        const option = document.createElement('option');
        option.value = sido;
        option.textContent = sido;
        sidoSelect.appendChild(option);
    });
}

// 조회 버튼 상태 업데이트 함수
function updateQueryButton() {
    const sidoSelect = document.getElementById('sidoSelect');
    const sigunguSelect = document.getElementById('sigunguSelect');
    const dongSelect = document.getElementById('dongSelect');
    const regionQueryBtn = document.getElementById('regionQueryBtn');

    const sido = sidoSelect.value;
    const sigungu = sigunguSelect.value;
    const dong = dongSelect.value;

    if (sido) {
        regionQueryBtn.disabled = false;

        // 버튼 텍스트 동적 변경
        if (dong) {
            regionQueryBtn.textContent = `${sido} ${sigungu} ${dong} 조회`;
        } else if (sigungu) {
            regionQueryBtn.textContent = `${sido} ${sigungu} 조회`;
        } else {
            regionQueryBtn.textContent = `${sido} 조회`;
        }
    } else {
        regionQueryBtn.disabled = true;
        regionQueryBtn.textContent = '조회';
    }
}

// 시/도 선택 시 호출
function onSidoChange() {
    const sidoSelect = document.getElementById('sidoSelect');
    const sigunguSelect = document.getElementById('sigunguSelect');
    const dongSelect = document.getElementById('dongSelect');

    const selectedSido = sidoSelect.value;

    // 하위 선택 초기화
    sigunguSelect.innerHTML = '<option value="">시/군/구 선택</option>';
    dongSelect.innerHTML = '<option value="">행정동 선택</option>';
    sigunguSelect.disabled = true;
    dongSelect.disabled = true;

    if (selectedSido && koreaAdminData[selectedSido]) {
        // 시/군/구 옵션 추가
        Object.keys(koreaAdminData[selectedSido]).forEach(sigungu => {
            const option = document.createElement('option');
            option.value = sigungu;
            option.textContent = sigungu;
            sigunguSelect.appendChild(option);
        });
        sigunguSelect.disabled = false;
    }

    updateQueryButton();
}

// 시/군/구 선택 시 호출
function onSigunguChange() {
    const sidoSelect = document.getElementById('sidoSelect');
    const sigunguSelect = document.getElementById('sigunguSelect');
    const dongSelect = document.getElementById('dongSelect');

    const selectedSido = sidoSelect.value;
    const selectedSigungu = sigunguSelect.value;

    // 행정동 선택 초기화
    dongSelect.innerHTML = '<option value="">행정동 선택</option>';
    dongSelect.disabled = true;

    if (selectedSido && selectedSigungu && koreaAdminData[selectedSido][selectedSigungu]) {
        // 행정동 옵션 추가
        koreaAdminData[selectedSido][selectedSigungu].forEach(dong => {
            const option = document.createElement('option');
            option.value = dong;
            option.textContent = dong;
            dongSelect.appendChild(option);
        });
        dongSelect.disabled = false;
    }

    updateQueryButton();
}

// 행정동 선택 시 호출
function onDongChange() {
    updateQueryButton();
}

// 지역 조회 함수
async function queryRegion() {
    const sidoSelect = document.getElementById('sidoSelect');
    const sigunguSelect = document.getElementById('sigunguSelect');
    const dongSelect = document.getElementById('dongSelect');
    const resultsContent = document.getElementById('resultsContent');

    const sido = sidoSelect.value;
    const sigungu = sigunguSelect.value;
    const dong = dongSelect.value;

    // 선택된 계층에 따라 데이터 구성
    let regionData = {
        sido: sido
    };

    let level = 'sido';
    let displayRegion = sido;

    if (sigungu) {
        regionData.sigungu = sigungu;
        level = 'sigungu';
        displayRegion = `${sido} ${sigungu}`;
    }

    if (dong) {
        regionData.dong = dong;
        level = 'dong';
        displayRegion = `${sido} ${sigungu} ${dong}`;
    }

    regionData.level = level;

    // 캐시 키 생성
    const cacheKey = getBoundaryCacheKey(sido, sigungu, dong, level);

    try {
        showLoadingSpinner();

        // 캐시에서 경계 데이터 확인
        const cachedBoundary = getBoundaryFromCache(cacheKey);

        let result;

        if (cachedBoundary) {
            // 캐시된 경계 데이터 사용, 인구 데이터는 항상 새로 조회
            const response = await fetch('/getRegionPop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(regionData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            result = await response.json();

            // 캐시된 경계 데이터 사용
            result.boundary = cachedBoundary;
            console.log('✓ 캐시된 경계 데이터 사용');
        } else {
            // 캐시에 없으면 전체 데이터 조회
            const response = await fetch('/getRegionPop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(regionData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            result = await response.json();

            // 경계 데이터를 캐시에 저장
            if (result.boundary) {
                saveBoundaryToCache(cacheKey, result.boundary);
            }
        }

        // 경계 데이터가 있으면 지도에 표시
        if (result.boundary) {
            displayRegionBoundary(result.boundary, level);
        }

        // 그리기 분석과 동일한 형식으로 결과 표시 (PopulationResult 형식)
        displayRegionAnalysisResults(result, displayRegion);

    } catch (error) {
        console.error('지역 조회 오류:', error);
        showErrorMessage('지역 조회 중 오류가 발생했습니다: ' + error.message);
    }
}

// 지역 분석 결과 표시 함수 (그리기 분석과 유사하지만 지역 정보 포함)
function displayRegionAnalysisResults(result, regionName) {
    const resultsContent = document.getElementById('resultsContent');
    // 연령별 분포 차트 생성 (기존 함수 재사용)
    const ageDistributionHtml = createAgeDistributionChart(result.age_distribution);

    resultsContent.innerHTML = `
        <div class="analysis-results">
            <h4>지역 조회 결과</h4>

            <div class="region-info" style="margin-bottom: 15px; padding: 10px; background-color: #f0f8ff; border-radius: 4px;">
                <p><strong>조회 지역:</strong> ${regionName}</p>
            </div>

            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">총 인구수</span>
                    <span class="stat-value">${result.total_population.toLocaleString()}명</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">총 가구수</span>
                    <span class="stat-value">${result.total_households.toLocaleString()}세대</span>
                </div>
            </div>

            ${ageDistributionHtml}

            <button onclick="exportResults()" class="export-btn">결과 내보내기</button>
        </div>
    `;

    // 테이블 선택 기능 초기화
    initializeTableSelection();
}
// ==================== 행정구역 경계 표시 함수들 ====================

/**
 * 행정구역 경계를 지도에 표시하고 중심점으로 이동
 * @param {Object} boundary - { type, coordinates, centroid } 형식의 경계 데이터
 * @param {String} level - 'sido', 'sigungu', 'dong' 중 하나
 */
function displayRegionBoundary(boundary, level) {
    // 기존 경계 및 마커 제거
    clearRegionBoundary();

    // 중심점으로 부드럽게 이동
    if (boundary.centroid) {
        moveToCentroid(boundary.centroid, level);
    }

    // 경계 표시 (Polygon 또는 MultiPolygon)
    if (boundary.type && boundary.coordinates) {
        renderBoundary(boundary);
    }
}

/**
 * 중심점으로 지도를 부드럽게 이동
 * @param {Object} centroid - { lng, lat } 형식의 중심점 좌표
 * @param {String} level - 'sido', 'sigungu', 'dong' 중 하나
 */
function moveToCentroid(centroid, level) {
    const centerPosition = new kakao.maps.LatLng(centroid.lat, centroid.lng);

    // 레벨별 줌 레벨 설정
    let zoomLevel;
    switch(level) {
        case 'sido':
            zoomLevel = 10;  // 시/도 레벨 - 넓은 범위
            break;
        case 'sigungu':
            zoomLevel = 7;   // 시/군/구 레벨 - 중간 범위
            break;
        case 'dong':
            zoomLevel = 5;   // 행정동 레벨 - 좁은 범위
            break;
        default:
            zoomLevel = 8;   // 기본값
    }

    // 줌 레벨 설정
    map.setLevel(zoomLevel);

    // 부드러운 이동 (panTo)
    map.panTo(centerPosition);
}

/**
 * 경계를 지도에 렌더링 (Polygon 및 MultiPolygon 지원)
 * @param {Object} boundary - GeoJSON 형식의 경계 데이터
 */
function renderBoundary(boundary) {
    const { type, coordinates } = boundary;

    if (type === 'Polygon') {
        // 단일 Polygon
        const polygon = createPolygonFromCoordinates(coordinates);
        if (polygon) {
            polygon.setMap(map);
            regionBoundaryPolygons.push(polygon);
        }
    } else if (type === 'ST_MultiPolygon') {
        // MultiPolygon: 여러 개의 Polygon
        coordinates.forEach(polygonCoords => {
            const polygon = createPolygonFromCoordinates(polygonCoords);
            if (polygon) {
                polygon.setMap(map);
                regionBoundaryPolygons.push(polygon);
            }
        });
    } else {
        console.warn('지원하지 않는 geometry type:', type);
    }
}

/**
 * GeoJSON 좌표 배열을 Kakao Maps Polygon 객체로 변환
 * @param {Array} coordinates - GeoJSON Polygon 좌표 배열 [[[lng, lat], ...]]
 * @returns {kakao.maps.Polygon} Kakao Maps Polygon 객체
 */
function createPolygonFromCoordinates(coordinates) {
    if (!coordinates || coordinates.length === 0) {
        console.warn('빈 좌표 배열');
        return null;
    }

    // GeoJSON Polygon은 외부 링과 내부 링(구멍)으로 구성될 수 있음
    // coordinates[0]은 외부 링, coordinates[1...]은 내부 링
    const outerRing = coordinates[0];

    if (!outerRing || outerRing.length === 0) {
        console.warn('외부 링이 없음');
        return null;
    }

    // GeoJSON 좌표 [lng, lat]를 Kakao LatLng 객체로 변환
    const path = outerRing.map(coord => {
        return new kakao.maps.LatLng(coord[1], coord[0]);  // [lng, lat] → LatLng(lat, lng)
    });

    // Polygon 생성
    const polygon = new kakao.maps.Polygon({
        path: path,
        strokeWeight: 3,
        strokeColor: '#FF6B6B',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        fillColor: '#FF6B6B',
        fillOpacity: 0.15
    });

    return polygon;
}

/**
 * 기존 경계 및 마커 제거
 */
function clearRegionBoundary() {
    // 모든 경계 폴리곤 제거
    regionBoundaryPolygons.forEach(polygon => {
        polygon.setMap(null);
    });
    regionBoundaryPolygons = [];

    // 중심점 마커 제거
    if (regionCentroidMarker) {
        regionCentroidMarker.setMap(null);
        regionCentroidMarker = null;
    }
}

// ==================== 경계 데이터 캐싱 ====================

/**
 * 경계 데이터 캐시 키 생성
 * @param {String} sido - 시/도 이름
 * @param {String} sigungu - 시/군/구 이름 (선택)
 * @param {String} dong - 행정동 이름 (선택)
 * @param {String} level - 레벨
 * @returns {String} 캐시 키
 */
function getBoundaryCacheKey(sido, sigungu, dong, level) {
    const parts = ['boundary', level, sido];
    if (sigungu) parts.push(sigungu);
    if (dong) parts.push(dong);
    return parts.join('_');
}

/**
 * SessionStorage에서 경계 데이터 가져오기
 * @param {String} cacheKey - 캐시 키
 * @returns {Object|null} 캐시된 경계 데이터 또는 null
 */
function getBoundaryFromCache(cacheKey) {
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            console.log('✓ 캐시에서 경계 데이터 로드:', cacheKey);
            return data;
        }
    } catch (error) {
        console.error('캐시 읽기 오류:', error);
    }
    return null;
}

/**
 * SessionStorage에 경계 데이터 저장
 * @param {String} cacheKey - 캐시 키
 * @param {Object} boundaryData - 경계 데이터
 */
function saveBoundaryToCache(cacheKey, boundaryData) {
    try {
        sessionStorage.setItem(cacheKey, JSON.stringify(boundaryData));
        console.log('✓ 경계 데이터를 캐시에 저장:', cacheKey);
    } catch (error) {
        console.error('캐시 저장 오류:', error);
        // SessionStorage 용량 초과 시 오래된 항목 삭제
        if (error.name === 'QuotaExceededError') {
            clearOldBoundaryCache();
            // 재시도
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(boundaryData));
            } catch (retryError) {
                console.error('캐시 저장 재시도 실패:', retryError);
            }
        }
    }
}

/**
 * 오래된 경계 캐시 데이터 삭제
 */
function clearOldBoundaryCache() {
    try {
        const keys = Object.keys(sessionStorage);
        const boundaryKeys = keys.filter(key => key.startsWith('boundary_'));
        
        // 첫 번째 절반 삭제 (간단한 LRU 전략)
        const keysToRemove = boundaryKeys.slice(0, Math.floor(boundaryKeys.length / 2));
        keysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        console.log(`✓ ${keysToRemove.length}개의 오래된 캐시 항목 삭제`);
    } catch (error) {
        console.error('캐시 정리 오류:', error);
    }
}

/**
 * 모든 경계 캐시 삭제
 */
function clearAllBoundaryCache() {
    try {
        const keys = Object.keys(sessionStorage);
        const boundaryKeys = keys.filter(key => key.startsWith('boundary_'));
        boundaryKeys.forEach(key => sessionStorage.removeItem(key));
        console.log(`✓ ${boundaryKeys.length}개의 캐시 항목 모두 삭제`);
    } catch (error) {
        console.error('캐시 전체 삭제 오류:', error);
    }
}

/**
 * 캐시 통계 정보
 */
function getBoundaryCacheStats() {
    try {
        const keys = Object.keys(sessionStorage);
        const boundaryKeys = keys.filter(key => key.startsWith('boundary_'));
        
        let totalSize = 0;
        boundaryKeys.forEach(key => {
            const item = sessionStorage.getItem(key);
            totalSize += item ? item.length : 0;
        });
        
        return {
            count: boundaryKeys.length,
            totalSize: totalSize,
            totalSizeKB: (totalSize / 1024).toFixed(2),
            keys: boundaryKeys
        };
    } catch (error) {
        console.error('캐시 통계 조회 오류:', error);
        return { count: 0, totalSize: 0, totalSizeKB: '0', keys: [] };
    }
}
