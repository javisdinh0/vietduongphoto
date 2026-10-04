// Zoom / kéo ảnh trong lightbox: chụm 2 ngón (phóng/thu quanh điểm giữa hai ngón + kéo bằng 2 ngón), kéo 1 ngón khi đã phóng,
// chạm đúp để phóng/thu quanh điểm chạm, vuốt ngang để chuyển ảnh khi chưa phóng, lăn chuột / chụm trên trackpad quanh con trỏ,
// click chuột để phóng (máy tính). Phép biến đổi: translate(x,y) scale(s) quanh TÂM ảnh (lúc chưa zoom).
const MIN = 1; const MAX = 6; const DOUBLE_TAP_SCALE = 2.5; const RUBBER_MIN = 0.85; // cho phép thu nhẹ dưới 1 khi đang chụm rồi bật về 1
const TAP_MS = 300; const TAP_SLOP = 10; const DOUBLE_SLOP = 40; const SWIPE_PX = 60;

export function createZoom({ stage, img, onSwipe = () => {}, onBackdropTap = () => {}, onZoomIn = () => {} }) {
  let s = 1; let x = 0; let y = 0;
  const pointers = new Map(); // id -> {x, y}
  let g = null; // cử chỉ hiện tại: {kind:'pinch'|'pan', ...}
  let lastTap = null; let lastDragged = false; let lastType = 'mouse'; let notified = false; let smoothTimer = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // tâm bố cục của ảnh (trước translate): tâm hộp hiện tại trừ phần dịch
  const center = () => { const r = img.getBoundingClientRect(); return { x: r.left + r.width / 2 - x, y: r.top + r.height / 2 - y }; };
  const limits = (scale) => { // biên kéo: ảnh phóng to hơn khung nhìn thì kéo tối đa tới mép; nhỏ hơn thì giữ ở giữa
    const cs = getComputedStyle(stage); const vw = stage.clientWidth; const vh = stage.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    return { mx: Math.max(0, (img.offsetWidth * scale - vw) / 2), my: Math.max(0, (img.offsetHeight * scale - vh) / 2) };
  };
  function apply(s1, x1, y1, { smooth = false, gesture = false } = {}) {
    s = s1; const L = limits(s); x = clamp(x1, -L.mx, L.mx); y = clamp(y1, -L.my, L.my);
    img.style.transform = s === 1 && x === 0 && y === 0 ? '' : `translate(${x}px,${y}px) scale(${s})`;
    img.classList.toggle('zoomed', s > 1.001);
    img.classList.toggle('gesturing', gesture);
    clearTimeout(smoothTimer); img.classList.toggle('zoom-smooth', smooth);
    if (smooth) smoothTimer = setTimeout(() => img.classList.remove('zoom-smooth'), 260);
    if (s > 1.5 && !notified) { notified = true; onZoomIn(); } // người dùng muốn xem chi tiết → yêu cầu bản nét hơn
  }
  // phóng tới scale s1 sao cho điểm ảnh đang nằm dưới (fx, fy) (toạ độ so với tâm) vẫn nằm dưới (tx, ty)
  const zoomAbout = (s1, fx, fy, tx, ty, opts) => { const px = (fx - x) / s; const py = (fy - y) / s; apply(s1, tx - s1 * px, ty - s1 * py, opts); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function reset() { pointers.clear(); g = null; lastTap = null; notified = false; clearTimeout(smoothTimer); apply(1, 0, 0); }
  function toggleAt(cx, cy) { // chạm đúp / click: về 1 nếu đang phóng, ngược lại phóng 2,5x quanh điểm chạm
    const C = center();
    if (s > 1.05) apply(1, 0, 0, { smooth: true });
    else zoomAbout(DOUBLE_TAP_SCALE, cx - C.x, cy - C.y, cx - C.x, cy - C.y, { smooth: true });
  }

  stage.addEventListener('pointerdown', (e) => {
    lastType = e.pointerType || 'mouse';
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // bắt đầu chụm
      const [a, b] = [...pointers.values()]; const C = center(); const m = mid(a, b);
      g = { kind: 'pinch', d0: dist(a, b) || 1, s0: s, px: (m.x - C.x - x) / s, py: (m.y - C.y - y) / s, C };
      lastTap = null;
    } else if (pointers.size === 1) {
      g = { kind: 'pan', x0: e.clientX, y0: e.clientY, tx: x, ty: y, moved: false, t0: performance.now() };
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]; const m = mid(a, b); const s1 = clamp(g.s0 * (dist(a, b) / g.d0), RUBBER_MIN, MAX);
      const fx = m.x - g.C.x; const fy = m.y - g.C.y; // điểm giữa hiện tại (so với tâm): kéo 2 ngón cũng làm ảnh dịch theo
      apply(s1, fx - s1 * g.px, fy - s1 * g.py, { gesture: true });
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
      if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) g.moved = true;
      if (s > 1.001) apply(s, g.tx + dx, g.ty + dy, { gesture: true });
    }
  });

  function end(e) {
    const had = pointers.get(e.pointerId); const wasPinch = g && g.kind === 'pinch';
    pointers.delete(e.pointerId);
    if (!had) return;
    if (wasPinch) {
      if (pointers.size === 1) { // nhấc một ngón: chuyển thành kéo bằng ngón còn lại, không bị giật
        const p = [...pointers.values()][0]; g = { kind: 'pan', x0: p.x, y0: p.y, tx: x, ty: y, moved: true, fromPinch: true, t0: performance.now() };
      } else if (pointers.size === 0) { g = null; if (s < 1.02) apply(1, 0, 0, { smooth: true }); else apply(s, x, y); }
      return;
    }
    if (pointers.size > 0 || !g) return;
    const d = g; g = null; const dx = e.clientX - d.x0; const dy = e.clientY - d.y0;
    img.classList.remove('gesturing');
    if (s < 1.02 && (s !== 1 || x !== 0 || y !== 0)) apply(1, 0, 0, { smooth: true }); // chụm nhỏ dưới 1x rồi nhấc ngón lần lượt: bật về 1x ở ngón cuối
    lastDragged = !!d.moved;
    if (s <= 1.001 && !d.fromPinch) { // chưa phóng: vuốt ngang để chuyển ảnh
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) { lastTap = null; onSwipe(dx < 0 ? 1 : -1); return; }
    }
    // chạm (không kéo): chạm đúp trên màn hình cảm ứng
    const isTap = !d.moved && performance.now() - d.t0 < TAP_MS && (e.type === 'pointerup');
    if (isTap && lastType !== 'mouse') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_SLOP && e.target === img) { lastTap = null; toggleAt(e.clientX, e.clientY); }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // chuột: click vào ảnh để phóng/thu (chạm trên cảm ứng đã dùng chạm đúp ở trên)
  img.addEventListener('click', (e) => { if (lastType !== 'mouse') return; if (lastDragged) { lastDragged = false; return; } toggleAt(e.clientX, e.clientY); });
  stage.addEventListener('click', (e) => { if (e.target === stage && s <= 1.001) onBackdropTap(); });

  // lăn chuột / chụm trên trackpad (ctrl + wheel): phóng liên tục quanh con trỏ
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.012 : 0.0025; const s1 = clamp(s * Math.exp(-e.deltaY * k), MIN, MAX); const C = center();
    if (s1 < 1.02) apply(1, 0, 0, { smooth: true }); else zoomAbout(s1, e.clientX - C.x, e.clientY - C.y, e.clientX - C.x, e.clientY - C.y);
  }, { passive: false });

  // Safari iOS: chặn thu phóng cả trang khi chụm trong lightbox
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => stage.addEventListener(t, (e) => e.preventDefault()));

  return { reset, scale: () => s, state: () => ({ s, x, y }) };
}
