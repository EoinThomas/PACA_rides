// ═══════════════════════════════════════════════════
//  Alpes-Maritimes MTB Trails — Application Logic
//  Full-screen map + floating trail picker + video card
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── State ──────────────────────────────────────────
  let map = null;
  let activeTrailId = null;
  const mapPolylines = {};
  const mapMarkers = {};
  let hoverMarker = null;

  // ── Difficulty helpers ──────────────────────────────
  const DIFF_COLORS = {
    Easy:         '#10b981',
    Intermediate: '#3b82f6',
    Advanced:     '#ef4444',
    Expert:       '#a855f7'
  };

  function diffClass(d) {
    return d ? d.toLowerCase().replace(' ', '-') : '';
  }

  function diffColor(d) {
    return DIFF_COLORS[d] || '#ffffff';
  }

  // ── Map Init ────────────────────────────────────────
  function initMap() {
    map = L.map('map', {
      center: [44.1, 7.1],
      zoom: 10,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Tile layers
    const terrainDark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }
    );

    const topo = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17
      }
    );

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS',
        maxZoom: 20
      }
    );

    // Default to topographic map layer
    topo.addTo(map);

    L.control.layers({
      '🏔 Topo Map': topo,
      '🗺 Dark Map': terrainDark,
      '🛰 Satellite': satellite
    }, {}, { position: 'bottomright', collapsed: true }).addTo(map);

    return map;
  }

  // ── Custom marker icon ──────────────────────────────
  function makeMarkerIcon(trail, isActive = false) {
    const cls = diffClass(trail.difficulty);
    const color = diffColor(trail.difficulty);
    const html = `
      <div class="custom-marker-icon ${cls} ${isActive ? 'active' : ''}">
        <div class="marker-pin"></div>
        <div class="marker-icon-inner">
          <i class="fas fa-mountain" style="color:${color}; font-size:10px; transform:rotate(45deg)"></i>
        </div>
      </div>`;
    return L.divIcon({
      html,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      tooltipAnchor: [0, -30]
    });
  }

  // ── Plot trails on map ──────────────────────────────
  function plotTrails() {
    trailsData.forEach(trail => {
      const color = diffColor(trail.difficulty);
      const coords = trail.coordinates;
      const startCoord = coords[0];

      const polyline = L.polyline(coords, {
        color,
        weight: 3.5,
        opacity: 0.7,
        smoothFactor: 1.5
      });

      polyline.on('mouseover', () => {
        if (activeTrailId !== trail.id) {
          polyline.setStyle({ weight: 5.5, opacity: 1 });
          polyline.bindTooltip(trail.name, { className: 'custom-tooltip', sticky: true });
          polyline.openTooltip();
        }
      });

      polyline.on('mouseout', () => {
        if (activeTrailId !== trail.id) {
          polyline.setStyle({ weight: 3.5, opacity: 0.7 });
          polyline.closeTooltip();
          polyline.unbindTooltip();
        }
      });

      polyline.on('click', () => selectTrail(trail.id));

      polyline.addTo(map);
      mapPolylines[trail.id] = polyline;

      const marker = L.marker([startCoord[0], startCoord[1]], {
        icon: makeMarkerIcon(trail),
        title: trail.name
      });

      marker.on('click', () => selectTrail(trail.id));
      marker.bindTooltip(trail.name, { className: 'custom-tooltip', direction: 'top' });
      marker.addTo(map);
      mapMarkers[trail.id] = marker;
    });
  }

  // ── Floating trail menu ─────────────────────────────
  function buildMenu() {
    const menu = document.getElementById('floating-trail-menu');
    menu.innerHTML = '';

    trailsData.forEach(trail => {
      const cls = diffClass(trail.difficulty);
      const color = diffColor(trail.difficulty);
      const item = document.createElement('div');
      item.className = 'menu-trail-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-id', trail.id);
      item.innerHTML = `
        <div class="menu-diff-dot" style="background:${color}"></div>
        <div class="menu-trail-info">
          <div class="menu-trail-name">${trail.name}</div>
          <div class="menu-trail-meta">${trail.region} &bull; ${trail.distance} km &bull; ▼ ${trail.elevationLoss} m</div>
        </div>
        <span class="menu-diff-badge ${cls}">${trail.difficulty}</span>
      `;
      item.addEventListener('click', () => {
        selectTrail(trail.id);
        toggleMenu(false);
      });
      menu.appendChild(item);
    });
  }

  function toggleMenu(force) {
    const btn = document.getElementById('menu-toggle-btn');
    const menu = document.getElementById('floating-trail-menu');
    const isOpen = force !== undefined ? force : menu.classList.contains('hidden');
    if (isOpen) {
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  document.getElementById('menu-toggle-btn').addEventListener('click', () => toggleMenu());

  // Close menu when clicking elsewhere on map
  document.getElementById('map').addEventListener('click', () => {
    const menu = document.getElementById('floating-trail-menu');
    if (!menu.classList.contains('hidden')) toggleMenu(false);
  });

  // ── Trail selection ─────────────────────────────────
  function selectTrail(id) {
    const trail = trailsData.find(t => t.id === id);
    if (!trail) return;

    // Deactivate previous
    if (activeTrailId && activeTrailId !== id) {
      const prevTrail = trailsData.find(t => t.id === activeTrailId);
      if (mapPolylines[activeTrailId]) {
        mapPolylines[activeTrailId].setStyle({
          weight: 3.5,
          opacity: 0.7,
          color: diffColor(prevTrail.difficulty)
        });
      }
      if (mapMarkers[activeTrailId]) {
        mapMarkers[activeTrailId].setIcon(makeMarkerIcon(prevTrail, false));
      }
    }

    activeTrailId = id;

    // Highlight polyline
    mapPolylines[id].setStyle({ weight: 5.5, opacity: 1, color: diffColor(trail.difficulty) });
    mapMarkers[id].setIcon(makeMarkerIcon(trail, true));

    // Fly to trail
    const bounds = L.latLngBounds(trail.coordinates);
    map.flyToBounds(bounds, { padding: [60, 420], duration: 0.9 });

    // Update active state in menu
    document.querySelectorAll('.menu-trail-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });

    populateDrawer(trail);
    openDrawer();
  }

  // ── Drawer ──────────────────────────────────────────
  function openDrawer() {
    const drawer = document.getElementById('details-drawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    const drawer = document.getElementById('details-drawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');

    // Stop video when drawer closes
    document.getElementById('trail-video-iframe').src = '';

    // Deactivate active trail visuals
    if (activeTrailId) {
      const trail = trailsData.find(t => t.id === activeTrailId);
      if (trail) {
        mapPolylines[activeTrailId].setStyle({ weight: 3.5, opacity: 0.7 });
        mapMarkers[activeTrailId].setIcon(makeMarkerIcon(trail, false));
      }
      activeTrailId = null;
    }
  }

  document.getElementById('close-drawer-btn').addEventListener('click', closeDrawer);

  // ── Populate drawer with trail data ─────────────────
  function populateDrawer(trail) {
    // ── Video: autoplay at previewStart ──
    // Using youtube-nocookie.com + mute=1 to avoid error 153 (embedding restriction)
    // and to satisfy browser autoplay policies (autoplay requires mute)
    const vid = document.getElementById('trail-video-iframe');
    const startParam = trail.previewStart ? `&start=${trail.previewStart}` : '';
    vid.src = `https://www.youtube-nocookie.com/embed/${trail.previewVideoId}?autoplay=1&mute=1&rel=0&modestbranding=1${startParam}`;

    // ── POV link ──
    const pov = document.getElementById('btn-pov');
    if (trail.povVideoUrl) {
      pov.href = trail.povVideoUrl;
      pov.style.display = 'flex';
    } else {
      pov.style.display = 'none';
    }

    // ── Text ──
    document.getElementById('drawer-title').textContent = trail.name;
    document.getElementById('drawer-region').textContent = trail.region;

    const badge = document.getElementById('drawer-difficulty-badge');
    badge.textContent = trail.difficulty;
    badge.className = `trail-badge ${diffClass(trail.difficulty)}`;

    document.getElementById('stat-dist').textContent = `${trail.distance} km`;
    document.getElementById('stat-gain').textContent = `${trail.elevationGain} m`;
    document.getElementById('stat-loss').textContent = `${trail.elevationLoss} m`;
    document.getElementById('stat-max').textContent = `${trail.maxElevation} m`;
    document.getElementById('stat-time').textContent = trail.duration;
    document.getElementById('drawer-desc').textContent = trail.description;

    // ── Links ──
    document.getElementById('btn-gpx').href = trail.gpxPath;
    document.getElementById('btn-strava').href = trail.stravaUrl || 'https://www.strava.com/athletes/6837889';

    // ── Elevation chart ──
    renderElevationSVG(trail);
    render3DOrbit(trail);

    // ── Reset to 2D tab ──
    switchTab('2d');
  }

  // ── Elevation SVG Chart ─────────────────────────────
  function renderElevationSVG(trail) {
    const container = document.getElementById('chart-container');
    container.innerHTML = '';

    const path = trail.path;
    if (!path || path.length < 2) return;

    const W = 380, H = 110;
    const PAD = { top: 10, right: 14, bottom: 30, left: 42 };
    const iW = W - PAD.left - PAD.right;
    const iH = H - PAD.top - PAD.bottom;

    const dists = path.map(p => p.dist);
    const eles = path.map(p => p.ele);
    const minDist = dists[0];
    const maxDist = dists[dists.length - 1];
    const minEle = Math.min(...eles) - 20;
    const maxEle = Math.max(...eles) + 20;

    const xScale = d => PAD.left + ((d - minDist) / (maxDist - minDist)) * iW;
    const yScale = e => PAD.top + (1 - (e - minEle) / (maxEle - minEle)) * iH;

    // Gradient fills
    const gradId = 'elev-grad-' + trail.id;
    const lineColor = diffColor(trail.difficulty);

    let polyPts = path.map(p => `${xScale(p.dist).toFixed(1)},${yScale(p.ele).toFixed(1)}`).join(' ');
    const firstX = xScale(dists[0]).toFixed(1);
    const lastX = xScale(dists[dists.length - 1]).toFixed(1);
    const baseY = (PAD.top + iH).toFixed(1);
    const areaPoints = `${firstX},${baseY} ${polyPts} ${lastX},${baseY}`;

    // SVG grid Y values
    const gridTicks = 3;
    const gridLines = Array.from({ length: gridTicks + 1 }, (_, i) => minEle + (i / gridTicks) * (maxEle - minEle));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Elevation profile for ${trail.name}`);

    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines.map(e => {
        const y = yScale(e).toFixed(1);
        return `
        <line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4,3"/>
        <text x="${PAD.left - 5}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.35)" font-size="9" font-family="Inter,sans-serif">${Math.round(e)}m</text>`;
      }).join('')}
      <polygon points="${areaPoints}" fill="url(#${gradId})"/>
      <polyline points="${polyPts}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${xScale(minDist)}" y="${H - 6}" text-anchor="start" fill="rgba(255,255,255,0.35)" font-size="9" font-family="Inter,sans-serif">0</text>
      <text x="${xScale(maxDist)}" y="${H - 6}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="9" font-family="Inter,sans-serif">${maxDist.toFixed(1)} km</text>
    `;

    // Hover scrubber
    const scrubLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    scrubLine.setAttribute('stroke', 'rgba(255,255,255,0.5)');
    scrubLine.setAttribute('stroke-width', '1');
    scrubLine.setAttribute('y1', PAD.top);
    scrubLine.setAttribute('y2', PAD.top + iH);
    scrubLine.style.display = 'none';
    svg.appendChild(scrubLine);

    const scrubDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    scrubDot.setAttribute('r', '4');
    scrubDot.setAttribute('fill', lineColor);
    scrubDot.setAttribute('stroke', 'white');
    scrubDot.setAttribute('stroke-width', '1.5');
    scrubDot.style.display = 'none';
    svg.appendChild(scrubDot);

    const liveEl = document.getElementById('elevation-live-data');

    svg.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const dist = minDist + xRatio * (maxDist - minDist);
      const nearest = path.reduce((a, b) => Math.abs(b.dist - dist) < Math.abs(a.dist - dist) ? b : a);
      const sx = xScale(nearest.dist).toFixed(1);
      const sy = yScale(nearest.ele).toFixed(1);
      scrubLine.setAttribute('x1', sx);
      scrubLine.setAttribute('x2', sx);
      scrubLine.style.display = 'block';
      scrubDot.setAttribute('cx', sx);
      scrubDot.setAttribute('cy', sy);
      scrubDot.style.display = 'block';
      liveEl.textContent = `${nearest.dist.toFixed(1)} km | ${nearest.ele} m`;
      liveEl.classList.add('active');

      if (hoverMarker) map.removeLayer(hoverMarker);
      hoverMarker = L.circleMarker([nearest.lat, nearest.lng], {
        radius: 6,
        fillColor: lineColor,
        color: 'white',
        weight: 2,
        fillOpacity: 1
      }).addTo(map);
    });

    svg.addEventListener('mouseleave', () => {
      scrubLine.style.display = 'none';
      scrubDot.style.display = 'none';
      liveEl.classList.remove('active');
      if (hoverMarker) { map.removeLayer(hoverMarker); hoverMarker = null; }
    });

    container.appendChild(svg);
  }

  // ── 3D Orbit ────────────────────────────────────────
  function render3DOrbit(trail) {
    const canvas = document.getElementById('profile-3d-canvas');
    const ctx = canvas.getContext('2d');
    const pts = trail.path;
    if (!pts || pts.length < 2) return;

    canvas.width = canvas.parentElement.clientWidth || 380;
    canvas.height = 110;

    const W = canvas.width, H = canvas.height;
    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    const eles = pts.map(p => p.ele);

    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minEle = Math.min(...eles), maxEle = Math.max(...eles);

    let rotY = -0.3, rotX = 0.4;
    let isDragging = false, lastX = 0, lastY = 0;

    const normX = lng => (lng - minLng) / Math.max(maxLng - minLng, 0.001) - 0.5;
    const normY = lat => (lat - minLat) / Math.max(maxLat - minLat, 0.001) - 0.5;
    const normZ = ele => (ele - minEle) / Math.max(maxEle - minEle, 0.001);

    function project(x, y, z) {
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const ry = y * cosX - rz * sinX;
      const rz2 = y * sinX + rz * cosX;
      const fov = 1.5;
      const scale = fov / (fov + rz2 + 0.1);
      return [W / 2 + rx * W * 0.7 * scale, H / 2 - ry * H * 1.1 * scale];
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const lineColor = diffColor(trail.difficulty);

      // Ground grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 5; i++) {
        const xi = i / 5 - 0.5;
        for (let j = 0; j <= 5; j++) {
          const xj = j / 5 - 0.5;
          const [x1, y1] = project(xi, -0.2, xj);
          const [x2, y2] = project(xi + 0.2, -0.2, xj);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }

      // Trail line
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [px, py] = project(normX(p.lng), normY(p.lat), normZ(p.ele) * 0.7);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Trail shadow on ground
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [px, py] = project(normX(p.lng), normY(p.lat), 0);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Droplines
      pts.filter((_, i) => i % 10 === 0).forEach(p => {
        const [px, py] = project(normX(p.lng), normY(p.lat), normZ(p.ele) * 0.7);
        const [gx, gy] = project(normX(p.lng), normY(p.lat), 0);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(gx, gy);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      // Start / End dots
      const firstPt = pts[0], lastPt = pts[pts.length - 1];
      const [sx, sy] = project(normX(firstPt.lng), normY(firstPt.lat), normZ(firstPt.ele) * 0.7);
      const [ex, ey] = project(normX(lastPt.lng), normY(lastPt.lat), normZ(lastPt.ele) * 0.7);
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444'; ctx.fill();
    }

    draw();

    canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      rotY += (e.clientX - lastX) * 0.01;
      rotX += (e.clientY - lastY) * 0.008;
      rotX = Math.max(-0.8, Math.min(0.8, rotX));
      lastX = e.clientX; lastY = e.clientY;
      draw();
    });

    // Touch support
    canvas.addEventListener('touchstart', e => { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; });
    window.addEventListener('touchend', () => { isDragging = false; });
    window.addEventListener('touchmove', e => {
      if (!isDragging) return;
      rotY += (e.touches[0].clientX - lastX) * 0.01;
      rotX += (e.touches[0].clientY - lastY) * 0.008;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      draw();
    });
  }

  // ── Tab Switching ───────────────────────────────────
  function switchTab(tab) {
    const is2D = tab === '2d';
    document.getElementById('chart-container').style.display = is2D ? 'block' : 'none';
    document.getElementById('canvas-container').style.display = is2D ? 'none' : 'block';
    document.getElementById('tab-2d').classList.toggle('active', is2D);
    document.getElementById('tab-3d').classList.toggle('active', !is2D);
    document.getElementById('tab-2d').setAttribute('aria-selected', is2D ? 'true' : 'false');
    document.getElementById('tab-3d').setAttribute('aria-selected', is2D ? 'false' : 'true');
  }

  document.getElementById('tab-2d').addEventListener('click', () => switchTab('2d'));
  document.getElementById('tab-3d').addEventListener('click', () => switchTab('3d'));

  // ── Boot ────────────────────────────────────────────
  initMap();
  plotTrails();
  buildMenu();
});
