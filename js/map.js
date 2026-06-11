// =============================================
// map.js — SVG 지도 + 핀 마커 모듈
// korea-map.svg를 fetch로 불러와 인라인 삽입
// 카드 터치 시 해당 핀 r:7→14 확대 강조
// =============================================

const Map = (() => {

  // 지역별 SVG viewBox 중심 좌표 (핀 배치 기준)
  // korea-map.svg의 실제 path와 맞춰진 값
  const REGION_BOUNDS = {
    '경기도':   { cx: 220, cy: 160 },
    '강원도':   { cx: 290, cy: 140 },
    '충청북도': { cx: 230, cy: 210 },
    '충청남도': { cx: 175, cy: 215 },
    '전라북도': { cx: 185, cy: 275 },
    '전라남도': { cx: 175, cy: 340 },
    '경상북도': { cx: 300, cy: 220 },
    '경상남도': { cx: 290, cy: 300 },
    '제주도':   { cx: 195, cy: 420 },
  };

  // 위도/경도 → SVG 좌표 변환
  // korea-map.svg viewBox="0 0 500 600" 기준
  const LAT_MAX  = 38.6;
  const LAT_MIN  = 33.0;
  const LNG_MIN  = 125.8;
  const LNG_MAX  = 130.0;
  const SVG_W    = 500;
  const SVG_H    = 600;

  function latLngToXY(lat, lng) {
    const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_W;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H;
    return { x: Math.round(x), y: Math.round(y) };
  }

  let _svgEl = null;       // 현재 삽입된 SVG 엘리먼트
  let _activePinId = null; // 현재 강조된 핀 id

  /**
   * korea-map.svg 불러와서 #map-wrap에 인라인 삽입
   */
  async function loadMap() {
    const wrap = document.getElementById('map-wrap');
    if (!wrap) return;

    try {
      const res  = await fetch('./data/korea-map.svg');
      const text = await res.text();

      // 문자열 → DOM 파싱
      const parser = new DOMParser();
      const doc    = parser.parseFromString(text, 'image/svg+xml');
      const svg    = doc.querySelector('svg');

      if (!svg) throw new Error('SVG 파싱 실패');

      // 크기 속성 초기화 (CSS로 제어)
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width  = '100%';
      svg.style.height = 'auto';

      wrap.innerHTML = '';
      wrap.appendChild(svg);
      _svgEl = svg;

    } catch (err) {
      console.error('[Map] SVG 로드 실패:', err);
      // 로드 실패 시 텍스트 대체
      wrap.innerHTML =
        '<div style="text-align:center;padding:24px;color:#888;font-size:15px;">' +
        '🗺️ 지도를 불러오는 중이에요</div>';
    }
  }

  /**
   * 명소 목록으로 핀 마커 렌더링
   * @param {Array} spots - 현재 지역 명소 배열
   */
  function renderPins(spots) {
  if (!_svgEl) return;

  // 기존 핀 제거
  const old = _svgEl.getElementById('pin-layer');
  if (old) old.remove();

  const g = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'g'
  );
  g.setAttribute('id', 'pin-layer');

  spots.forEach((spot, index) => {

    const region = REGION_BOUNDS[spot.tourist_region];
    if (!region) return;

    // 같은 지역 핀들이 겹치지 않도록 살짝 분산
    const angle  = (index * 37) * Math.PI / 180;
    const radius = 8 + (index % 4) * 6;

    const x = region.cx + Math.cos(angle) * radius;
    const y = region.cy + Math.sin(angle) * radius;

    const visited = Storage.isVisited(spot.tourist_id);

    const circle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle'
    );

    circle.setAttribute('cx', Math.round(x));
    circle.setAttribute('cy', Math.round(y));
    circle.setAttribute('r', '7');

    circle.setAttribute(
      'fill',
      visited ? '#2E7D32' : '#1A56A0'
    );

    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('data-id', spot.tourist_id);

    circle.classList.add('map-pin');
    circle.style.transition = 'r 0.3s ease, fill 0.3s ease';
    circle.style.pointerEvents = 'none';

    g.appendChild(circle);
  });

  _svgEl.appendChild(g);
}

  /**
   * 카드 터치 시 해당 핀 확대 강조 (r: 7 → 14)
   * @param {string} id - tourist_id
   */
  function highlightPin(id) {
    if (!_svgEl) return;

    // 이전 핀 원래대로
    if (_activePinId) {
      const prev = _svgEl.querySelector(`[data-id="${_activePinId}"]`);
      if (prev) prev.setAttribute('r', '7');
    }

    // 새 핀 강조
    const pin = _svgEl.querySelector(`[data-id="${id}"]`);
    if (pin) {
      pin.setAttribute('r', '14');
      _activePinId = id;
    }
  }

  /**
   * 방문 완료 시 핀 색상 초록으로 변경
   * @param {string} id - tourist_id
   */
  function markPinVisited(id) {
    if (!_svgEl) return;
    const pin = _svgEl.querySelector(`[data-id="${id}"]`);
    if (pin) pin.setAttribute('fill', '#2E7D32');
  }

  /**
   * 핀 전체 초기화 (화면 전환 시)
   */
  function resetPins() {
    if (!_svgEl) return;
    const old = _svgEl.getElementById('pin-layer');
    if (old) old.remove();
    _activePinId = null;
  }

  return { loadMap, renderPins, highlightPin, markPinVisited, resetPins };
})();