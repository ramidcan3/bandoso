// =====================================================================
// SỰ CỐ HIỆN TRƯỜNG: MƯA BÃO, NGẬP ÚNG, SẠT LỞ (cán bộ cập nhật trực tiếp)
// Dữ liệu lưu trên Google Sheets + ảnh trên Google Drive qua Google Apps Script.
// Cấu hình địa chỉ máy chủ trong su_co_config.js.
// Dùng các biến có sẵn của index.html: map, layerControl, dtLayer, geoJsonLayer.
// =====================================================================
(function () {
    'use strict';
    const API = String(window.SUCO_API_URL || '').trim();
    const REFRESH = Math.max(20, Number(window.SUCO_REFRESH_SECONDS) || 60) * 1000;

    const LOAI = {
        ngap_ung: { t: 'Ngập úng', i: '🌊' },
        sat_lo_dat: { t: 'Sạt lở đất', i: '⛰️' },
        sat_lo_taluy: { t: 'Sạt lở taluy', i: '🏔️' },
        cay_do: { t: 'Cây đổ', i: '🌳' },
        dat_da_tran: { t: 'Đất đá tràn mặt đường', i: '🪨' },
        hu_hong_mat_duong: { t: 'Hư hỏng mặt đường', i: '🚧' },
        hu_hong_cong_trinh: { t: 'Hư hỏng công trình', i: '🌉' },
        khac: { t: 'Sự cố khác', i: '⚠️' }
    };
    const TT = {
        dang_xay_ra: { t: 'Đang xảy ra', c: '#d50000' },
        da_kiem_tra: { t: 'Đã kiểm tra', c: '#ef6c00' },
        dang_xu_ly: { t: 'Đang xử lý', c: '#f9a825' },
        da_khac_phuc: { t: 'Đã khắc phục', c: '#2e7d32' },
        da_ket_thuc: { t: 'Đã kết thúc', c: '#757575' }
    };
    const ACTIVE = ['dang_xay_ra', 'da_kiem_tra', 'dang_xu_ly'];
    const MUC_DO = { nhe: 'Nhẹ', trung_binh: 'Trung bình', nghiem_trong: 'Nghiêm trọng' };
    const GIAO_THONG = { binh_thuong: 'Lưu thông bình thường', han_che: 'Hạn chế, đi chậm', xe_lon: 'Chỉ xe lớn qua được', cam: 'Không qua được, phải phân luồng' };
    const GIAI_DOAN = { ban_dau: 'Ban đầu', dien_bien: 'Diễn biến', sau_khac_phuc: 'Sau khắc phục' };
    const VAI_TRO = { tuan_tra: 'Tuần tra', quan_ly: 'Quản lý', admin: 'Quản trị' };
    const HANH_DONG = { tao: 'Tạo sự cố', cap_nhat: 'Cập nhật thông tin', doi_trang_thai: 'Đổi trạng thái', xac_nhan: 'Xác nhận sự cố', ket_thuc: 'Kết thúc sự cố', mo_lai: 'Mở lại sự cố', them_anh: 'Bổ sung ảnh', xoa_anh: 'Xóa ảnh', xoa_su_co: 'Xóa sự cố', khoi_phuc: 'Khôi phục sự cố' };
    const FIELD_LABEL = {
        loai: 'Loại sự cố', muc_do: 'Mức độ ảnh hưởng', giao_thong: 'Tình trạng giao thông', huong_tuyen: 'Hướng tuyến, làn',
        mo_ta: 'Mô tả', tuyen: 'Tuyến đường', dia_gioi: 'Phường/xã', lat: 'Vĩ độ', lng: 'Kinh độ',
        don_vi_phu_trach: 'Đơn vị phụ trách', bien_phap_xu_ly: 'Biện pháp xử lý', bat_dau_xu_ly: 'Bắt đầu xử lý',
        ket_thuc_xu_ly: 'Kết thúc xử lý', ghi_chu_kiem_tra: 'Ghi chú kiểm tra', tai_lieu: 'Tài liệu liên quan',
        thoi_gian_phat_hien: 'Thời gian phát hiện', da_xac_nhan: 'Xác nhận'
    };

    const state = {
        incidents: [], byId: {}, markers: {}, session: loadSession(), lastHash: '', lastLoad: null,
        loading: false, error: '', filter: { tuyen: '', dia_gioi: '', loai: '', tt: 'chua_ket_thuc', tg: '' },
        picking: null, pickMarker: null
    };

    // ---------------- Tiện ích ----------------
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmt(iso) {
        if (!iso) return '';
        const d = new Date(iso); if (isNaN(d)) return esc(iso);
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    function toLocalInput(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
    function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now() + Math.random().toString(16).slice(2)); }
    function ls(k, v) {
        try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }
        catch (e) { return null; }
    }
    function loadSession() { const s = ls('sc_session'); return s && s.token && Date.parse(s.expires) > Date.now() ? s : null; }
    function statusBadge(tt) { const s = TT[tt] || (tt === 'da_xoa' ? { t: 'Đã xóa', c: '#212121' } : { t: tt, c: '#999' }); return `<span class="sc-status" style="background:${s.c}">${esc(s.t)}</span>`; }
    function toast(msg, type, ms) {
        const el = document.createElement('div');
        el.className = 'sc-toast ' + (type || 'info'); el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), ms || 4000);
    }
    function canEdit() { return !!state.session; }
    function isMgr() { return state.session && ['quan_ly', 'admin'].includes(state.session.user.vai_tro); }
    function isAdmin() { return !!(state.session && state.session.user.vai_tro === 'admin'); }

    // ---------------- Gọi máy chủ ----------------
    async function call(method, payload, timeoutMs) {
        if (!API) throw { code: 'NO_API', message: 'Chưa cấu hình máy chủ dữ liệu (su_co_config.js)' };
        if (!navigator.onLine) throw { code: 'OFFLINE', message: 'Thiết bị đang mất kết nối mạng' };
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs || 45000);
        let res;
        try {
            if (method === 'GET') {
                const q = new URLSearchParams(Object.assign({}, payload, { _: Date.now() }));
                res = await fetch(API + (API.includes('?') ? '&' : '?') + q, { signal: ctl.signal });
            } else {
                // Content-Type text/plain để không phát sinh yêu cầu CORS preflight với Apps Script
                res = await fetch(API, { method: 'POST', body: JSON.stringify(payload), signal: ctl.signal });
            }
        } catch (e) {
            throw { code: 'NETWORK', message: e.name === 'AbortError' ? 'Máy chủ phản hồi quá lâu, chưa chắc chắn đã lưu' : 'Không kết nối được máy chủ dữ liệu' };
        } finally { clearTimeout(timer); }
        let data;
        try { data = await res.json(); } catch (e) { throw { code: 'BAD_RESPONSE', message: 'Máy chủ trả về dữ liệu không hợp lệ (HTTP ' + res.status + ')' }; }
        if (!data.ok) {
            if (/^AUTH_/.test(data.code)) setSession(null);
            throw { code: data.code, message: data.message || 'Lỗi không xác định' };
        }
        return data;
    }
    const post = (body, t) => call('POST', Object.assign({ token: state.session && state.session.token }, body), t);

    function setSession(s) { state.session = s; ls('sc_session', s); renderUser(); }

    // ---------------- Lớp bản đồ ----------------
    const layer = L.layerGroup().addTo(map);
    if (typeof layerControl !== 'undefined') layerControl.addOverlay(layer, '<span style="color:#d50000">🚨</span> Sự cố hiện trường (cán bộ cập nhật)');

    function iconFor(inc) {
        const s = TT[inc.trang_thai] || TT.dang_xay_ra;
        const cls = ['sc-icon'];
        if (inc.trang_thai === 'dang_xay_ra') cls.push('pulse');
        if (inc.trang_thai === 'da_khac_phuc') cls.push('small');
        if (inc.trang_thai === 'da_ket_thuc') cls.push('small', 'ended');
        const sz = cls.includes('small') ? 24 : 30;
        return L.divIcon({
            className: cls.join(' '), iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2],
            html: `<div class="dot" style="background:${s.c};color:${s.c}">${(LOAI[inc.loai] || LOAI.khac).i}</div>`
        });
    }

    function popupHtml(inc) {
        const ph = inc.anh && inc.anh.length ? `<img src="${esc(inc.anh[inc.anh.length - 1].thumb)}" alt="Ảnh hiện trường" loading="lazy" referrerpolicy="no-referrer">` : '';
        return `<div class="sc-popup"><h4>${(LOAI[inc.loai] || LOAI.khac).i} ${esc((LOAI[inc.loai] || LOAI.khac).t)} · ${esc(inc.id)}</h4>
            ${statusBadge(inc.trang_thai)} ${inc.da_xac_nhan === 'co' ? '<span class="sc-status" style="background:#1565c0">Đã xác nhận</span>' : ''}
            <div style="margin-top:4px">${esc([inc.tuyen, inc.dia_gioi].filter(Boolean).join(' · '))}</div>
            <div>Mức độ: <b>${esc(MUC_DO[inc.muc_do] || '')}</b> · Giao thông: <b>${esc(GIAO_THONG[inc.giao_thong] || '')}</b></div>
            <div>Phát hiện: ${fmt(inc.thoi_gian_phat_hien)} · Cập nhật: ${fmt(inc.thoi_gian_cap_nhat)}</div>
            ${ph}
            <button class="sc-btn blue full" data-sc-open="${esc(inc.id)}" style="margin-top:4px">Xem hồ sơ${canEdit() && inc.trang_thai !== 'da_ket_thuc' ? ' / Cập nhật' : ''}</button></div>`;
    }

    function matchFilter(inc) {
        const f = state.filter;
        if (f.tuyen && (inc.tuyen || '(Không thuộc tuyến)') !== f.tuyen) return false;
        if (f.dia_gioi && (inc.dia_gioi || '(Chưa xác định)') !== f.dia_gioi) return false;
        if (f.loai && inc.loai !== f.loai) return false;
        if (f.tt === 'dang_dien_ra' && !ACTIVE.includes(inc.trang_thai)) return false;
        if (f.tt === 'chua_ket_thuc' && inc.trang_thai === 'da_ket_thuc') return false;
        if (TT[f.tt] && inc.trang_thai !== f.tt) return false;
        if (f.tg) {
            const t = Date.parse(inc.thoi_gian_phat_hien || inc.thoi_gian_tao);
            if (!isFinite(t) || Date.now() - t > Number(f.tg) * 3600000) return false;
        }
        return true;
    }

    function render() {
        layer.clearLayers(); state.markers = {};
        const shown = state.incidents.filter(matchFilter).sort((a, b) => {
            const pa = ACTIVE.includes(a.trang_thai) ? 0 : 1, pb = ACTIVE.includes(b.trang_thai) ? 0 : 1;
            return pa - pb || String(b.thoi_gian_cap_nhat).localeCompare(String(a.thoi_gian_cap_nhat));
        });
        shown.forEach(inc => {
            if (!isFinite(inc.lat) || !isFinite(inc.lng)) return;
            const m = L.marker([inc.lat, inc.lng], { icon: iconFor(inc), zIndexOffset: ACTIVE.includes(inc.trang_thai) ? 1000 : 0, title: inc.id })
                .bindPopup(() => popupHtml(inc), { maxWidth: 300 });
            m.addTo(layer); state.markers[inc.id] = m;
        });
        const nActive = state.incidents.filter(i => ACTIVE.includes(i.trang_thai)).length;
        const badge = document.getElementById('sc-badge');
        if (badge) { badge.textContent = nActive; badge.style.display = nActive ? '' : 'none'; }
        const sum = document.getElementById('sc-summary');
        if (sum) sum.innerHTML = API
            ? `Hiển thị <b>${shown.length}</b>/${state.incidents.length} sự cố · <b style="color:#d50000">${nActive}</b> đang diễn ra`
            : '';
        const ul = document.getElementById('sc-list');
        if (ul) ul.innerHTML = shown.map(inc => `<li data-id="${esc(inc.id)}">${(LOAI[inc.loai] || LOAI.khac).i} <b>${esc((LOAI[inc.loai] || LOAI.khac).t)}</b> ${statusBadge(inc.trang_thai)}
            <br><span class="meta">${esc(inc.id)} · ${esc(inc.tuyen || 'Không thuộc tuyến')}${inc.dia_gioi ? ' · ' + esc(inc.dia_gioi) : ''} · ${fmt(inc.thoi_gian_phat_hien)}</span></li>`).join('')
            || (API && state.lastLoad ? '<li class="meta">Không có sự cố phù hợp bộ lọc</li>' : '');
        fillFilterOptions();
    }

    function fillFilterOptions() {
        const setOpts = (id, values, allLabel) => {
            const sel = document.getElementById(id); if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
            sel.value = values.includes(cur) ? cur : '';
        };
        const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'vi'));
        setOpts('sc-f-tuyen', uniq(state.incidents.map(i => i.tuyen || '(Không thuộc tuyến)')), '-- Tất cả tuyến --');
        setOpts('sc-f-diagioi', uniq(state.incidents.map(i => i.dia_gioi || '(Chưa xác định)')), '-- Tất cả phường/xã --');
    }

    async function load(opts) {
        if (!API || state.loading) return;
        state.loading = true; setStatus('Đang tải…', 'info');
        try {
            const data = await call('GET', { action: 'list', all: state.filter.tt === 'all' || state.filter.tt === 'da_ket_thuc' ? '1' : '0' }, 30000);
            const hash = JSON.stringify(data.incidents);
            state.incidents = data.incidents; state.byId = {};
            data.incidents.forEach(i => state.byId[i.id] = i);
            state.lastLoad = new Date(); state.error = '';
            if (hash !== state.lastHash || (opts && opts.force)) { state.lastHash = hash; render(); }
            setStatus('Cập nhật lúc ' + fmt(state.lastLoad.toISOString()), 'ok');
        } catch (e) {
            state.error = e.message; setStatus('Không tải được dữ liệu: ' + e.message, 'err');
        } finally { state.loading = false; }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('sc-status');
        if (el) { el.className = 'sc-msg ' + type; el.textContent = msg; }
    }

    // ---------------- Bảng điều khiển ----------------
    const Panel = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const narrow = window.innerWidth < 600;
            const div = L.DomUtil.create('div', 'sc-panel' + (narrow ? ' collapsed' : ''));
            div.id = 'sc-panel';
            div.innerHTML = `
                <div class="sc-head" id="sc-head"><span>🚨 Sự cố hiện trường <span class="sc-badge" id="sc-badge" style="display:none">0</span></span><span id="sc-tog">${narrow ? '▸' : '▾'}</span></div>
                <div class="sc-body">
                    <div class="sc-user" id="sc-user"></div>
                    <button class="sc-btn red full" id="sc-new">＋ Báo sự cố mới</button>
                    <div id="sc-status" class="sc-msg info" style="display:${API ? '' : 'none'}"></div>
                    ${API ? '' : '<div class="sc-msg err">Chưa cấu hình máy chủ dữ liệu. Xem hướng dẫn HUONG_DAN_SU_CO.md, điền địa chỉ vào su_co_config.js.</div>'}
                    <div class="sc-row"><select id="sc-f-tt">
                        <option value="chua_ket_thuc">Chưa kết thúc</option>
                        <option value="dang_dien_ra">Đang diễn ra</option>
                        ${Object.keys(TT).map(k => `<option value="${k}">${TT[k].t}</option>`).join('')}
                        <option value="all">Tất cả (cả lịch sử)</option></select>
                        <select id="sc-f-tg"><option value="">Mọi thời gian</option><option value="24">24 giờ qua</option><option value="72">3 ngày qua</option><option value="168">7 ngày qua</option><option value="720">30 ngày qua</option></select></div>
                    <select id="sc-f-loai"><option value="">-- Tất cả loại sự cố --</option>${Object.keys(LOAI).map(k => `<option value="${k}">${LOAI[k].i} ${LOAI[k].t}</option>`).join('')}</select>
                    <div class="sc-row"><select id="sc-f-tuyen"></select><select id="sc-f-diagioi"></select></div>
                    <div id="sc-summary"></div>
                    <ul class="sc-list" id="sc-list"></ul>
                    <div style="display:flex;justify-content:space-between;margin-top:6px">
                        <button class="sc-link" id="sc-reload">⟳ Tải lại</button>
                        <button class="sc-link" id="sc-csv">⬇ Xuất danh sách (CSV)</button></div>
                    <div class="sc-note">Dữ liệu do cán bộ cập nhật từ hiện trường. Hệ thống <b>chưa tích hợp</b> dữ liệu khí tượng hay cảnh báo tự động.<br>
                        <span style="color:${TT.dang_xay_ra.c}">●</span> Đang xảy ra (nhấp nháy) <span style="color:${TT.da_kiem_tra.c}">●</span> Đã kiểm tra
                        <span style="color:${TT.dang_xu_ly.c}">●</span> Đang xử lý <span style="color:${TT.da_khac_phuc.c}">●</span> Đã khắc phục <span style="color:${TT.da_ket_thuc.c}">●</span> Đã kết thúc</div>
                </div>`;
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            return div;
        }
    });
    new Panel().addTo(map);

    const $ = id => document.getElementById(id);
    $('sc-head').addEventListener('click', () => {
        const p = $('sc-panel'); p.classList.toggle('collapsed');
        $('sc-tog').textContent = p.classList.contains('collapsed') ? '▸' : '▾';
    });
    $('sc-new').addEventListener('click', () => startReport());
    $('sc-reload').addEventListener('click', () => load({ force: true }));
    $('sc-csv').addEventListener('click', exportCsv);
    ['sc-f-tt', 'sc-f-tg', 'sc-f-loai', 'sc-f-tuyen', 'sc-f-diagioi'].forEach(id => $(id).addEventListener('change', () => {
        const prevAll = state.filter.tt === 'all' || state.filter.tt === 'da_ket_thuc';
        state.filter = { tt: $('sc-f-tt').value, tg: $('sc-f-tg').value, loai: $('sc-f-loai').value, tuyen: $('sc-f-tuyen').value, dia_gioi: $('sc-f-diagioi').value };
        const nowAll = state.filter.tt === 'all' || state.filter.tt === 'da_ket_thuc';
        if (nowAll !== prevAll) load({ force: true }); else render();
    }));
    $('sc-list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) focusIncident(li.dataset.id); });
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-sc-open]');
        if (b) { map.closePopup(); openDetail(b.getAttribute('data-sc-open')); }
    });
    window.addEventListener('offline', () => setStatus('Thiết bị mất kết nối mạng: không lưu được dữ liệu cho đến khi có mạng lại', 'err'));
    window.addEventListener('online', () => load({ force: true }));

    function renderUser() {
        const el = $('sc-user'); if (!el) return;
        if (!API) { el.innerHTML = ''; $('sc-new').disabled = true; return; }
        if (state.session) {
            const u = state.session.user;
            el.innerHTML = `<span>👤 <b>${esc(u.ho_ten)}</b> (${esc(VAI_TRO[u.vai_tro] || u.vai_tro)})</span><span>${u.vai_tro === 'admin' ? '<button class="sc-link" id="sc-admin">⚙ Quản trị</button> · ' : ''}<button class="sc-link" id="sc-logout">Đăng xuất</button></span>`;
            $('sc-logout').onclick = () => { setSession(null); toast('Đã đăng xuất'); };
            if ($('sc-admin')) $('sc-admin').onclick = () => openAdmin('users');
        } else {
            el.innerHTML = `<span>Chưa đăng nhập (chỉ xem)</span><button class="sc-link" id="sc-login">Đăng nhập</button>`;
            $('sc-login').onclick = () => openLogin();
        }
    }

    function focusIncident(id) {
        const inc = state.byId[id]; if (!inc) return;
        const m = state.markers[id];
        map.setView([inc.lat, inc.lng], Math.max(map.getZoom(), 16));
        if (m) m.openPopup(); else openDetail(id);
        if (window.innerWidth < 600) { $('sc-panel').classList.add('collapsed'); $('sc-tog').textContent = '▸'; }
    }

    // ---------------- Hộp thoại chung ----------------
    function modal(title, bodyHtml, footerHtml) {
        closeModal();
        const bg = document.createElement('div');
        bg.className = 'sc-modal-bg'; bg.id = 'sc-modal-bg';
        bg.innerHTML = `<div class="sc-modal" role="dialog" aria-label="${esc(title)}"><header><span>${title}</span><button aria-label="Đóng" id="sc-x">×</button></header>
            <div class="content">${bodyHtml}</div>${footerHtml ? `<footer>${footerHtml}</footer>` : ''}</div>`;
        document.body.appendChild(bg);
        $('sc-x').onclick = closeModal;
        L.DomEvent.disableClickPropagation(bg);
        return bg;
    }
    function closeModal() { const m = $('sc-modal-bg'); if (m) m.remove(); }
    function msgBox(id, text, type) { const el = $(id); if (el) { el.className = 'sc-msg ' + type; el.textContent = text; el.style.display = text ? '' : 'none'; } }
    function chips(name, opts, val) {
        return `<div class="sc-chips" data-chips="${name}">` + Object.keys(opts).map(k =>
            `<span class="sc-chip${k === val ? ' on' : ''}" data-v="${k}" role="button" tabindex="0">${esc(typeof opts[k] === 'string' ? opts[k] : opts[k].i + ' ' + opts[k].t)}</span>`).join('') + '</div>';
    }
    function bindChips(root) {
        root.querySelectorAll('[data-chips]').forEach(g => g.addEventListener('click', e => {
            const c = e.target.closest('.sc-chip'); if (!c) return;
            g.querySelectorAll('.sc-chip').forEach(x => x.classList.remove('on')); c.classList.add('on');
            g.dispatchEvent(new Event('change', { bubbles: true }));
        }));
    }
    const chipVal = (root, name) => { const c = root.querySelector(`[data-chips="${name}"] .sc-chip.on`); return c ? c.dataset.v : ''; };

    // ---------------- Đăng nhập ----------------
    function openLogin(after) {
        if (!API) { toast('Chưa cấu hình máy chủ dữ liệu', 'err'); return; }
        const bg = modal('Đăng nhập cập nhật sự cố', `
            <label for="sc-u">Tên đăng nhập</label><input type="text" id="sc-u" autocomplete="username" autocapitalize="none">
            <label for="sc-p">Mật khẩu</label><input type="password" id="sc-p" autocomplete="current-password">
            <div id="sc-login-msg" class="sc-msg" style="display:none"></div>
            <div class="sc-note">Tài khoản do quản trị viên cấp trong Google Sheet. Mỗi người dùng một tài khoản riêng, không dùng chung.</div>`,
            `<button class="sc-btn" id="sc-cancel">Hủy</button><button class="sc-btn blue" id="sc-do-login">Đăng nhập</button>`);
        $('sc-cancel').onclick = closeModal;
        const go = async () => {
            const b = $('sc-do-login'); b.disabled = true; msgBox('sc-login-msg', 'Đang kiểm tra…', 'info');
            try {
                const r = await call('POST', { action: 'login', username: $('sc-u').value, password: $('sc-p').value }, 30000);
                setSession({ token: r.token, expires: r.expires, user: r.user });
                closeModal(); toast('Xin chào ' + r.user.ho_ten, 'ok');
                if (after) after();
            } catch (e) { msgBox('sc-login-msg', e.message, 'err'); b.disabled = false; }
        };
        $('sc-do-login').onclick = go;
        $('sc-p').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        setTimeout(() => $('sc-u').focus(), 50);
        return bg;
    }

    // ---------------- Xác định tuyến, phường/xã tự động ----------------
    function distToLine(lat, lng, coords) {
        const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
        let best = Infinity;
        for (let i = 0; i < coords.length - 1; i++) {
            const ax = (coords[i][0] - lng) * kx, ay = (coords[i][1] - lat) * ky;
            const bx = (coords[i + 1][0] - lng) * kx, by = (coords[i + 1][1] - lat) * ky;
            const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
            best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
        return best;
    }
    function roadName(n) { return String(n || '').replace(/^Quốc Lộ\s*/i, 'QL.').replace(/^DT\./, 'ĐT.'); }
    function nearestRoad(lat, lng) {
        if (typeof dtLayer === 'undefined' || !dtLayer) return { name: '', d: Infinity };
        let best = { name: '', d: Infinity };
        dtLayer.eachLayer(l => {
            const g = l.feature && l.feature.geometry; if (!g) return;
            const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
            lines.forEach(c => { const d = distToLine(lat, lng, c); if (d < best.d) best = { name: roadName(l.feature.properties.name), d }; });
        });
        return best;
    }
    function inRing(lat, lng, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }
    function findWard(lat, lng) {
        if (typeof geoJsonLayer === 'undefined' || !geoJsonLayer) return '';
        let name = '';
        geoJsonLayer.eachLayer(l => {
            if (name) return;
            const g = l.feature && l.feature.geometry; if (!g) return;
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
            if (polys.some(p => inRing(lat, lng, p[0]) && !p.slice(1).some(h => inRing(lat, lng, h)))) {
                const p = l.feature.properties; name = ((p.loai ? p.loai + ' ' : '') + (p.ten_xa || p.name || '')).trim();
            }
        });
        return name;
    }

    // ---------------- Chọn vị trí ----------------
    function startReport() {
        if (!API) { toast('Chưa cấu hình máy chủ dữ liệu', 'err'); return; }
        if (!state.session) { openLogin(startReport); return; }
        startPick(loc => openReportForm(loc));
    }

    function startPick(done) {
        stopPick();
        const bar = document.createElement('div');
        bar.className = 'sc-pickbar'; bar.id = 'sc-pickbar';
        bar.innerHTML = `<b>Vị trí sự cố:</b> <button class="sc-btn blue" id="sc-gps">📍 Dùng GPS của thiết bị</button>
            <span>hoặc chạm lên bản đồ</span><button class="sc-btn" id="sc-pick-cancel">Hủy</button><span id="sc-gps-msg" style="width:100%;font-size:12px"></span>`;
        document.body.appendChild(bar);
        L.DomEvent.disableClickPropagation(bar);
        map.getContainer().classList.add('sc-picking');
        if (window.innerWidth < 600) { $('sc-panel').classList.add('collapsed'); $('sc-tog').textContent = '▸'; const pp = document.getElementById('pctt-panel'); if (pp) pp.classList.add('collapsed'); }
        // Bắt sự kiện ở pha capture để chạm lên bất kỳ lớp nào (điểm PCTT, ranh giới…) cũng chọn được vị trí
        const el = map.getContainer();
        let down = null;
        const onDown = ev => { down = { x: ev.clientX, y: ev.clientY }; };
        const onClick = ev => {
            if (ev.target.closest('.leaflet-control, .sc-pickbar')) return;
            if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return; // đang kéo bản đồ
            ev.stopPropagation(); ev.preventDefault();
            const ll = map.mouseEventToLatLng(ev);
            stopPick(); map.closePopup();
            done({ lat: ll.lat, lng: ll.lng, src: 'Chọn trên bản đồ' });
        };
        el.addEventListener('pointerdown', onDown, true);
        el.addEventListener('click', onClick, true);
        state.picking = () => { el.removeEventListener('pointerdown', onDown, true); el.removeEventListener('click', onClick, true); };
        $('sc-pick-cancel').onclick = stopPick;
        $('sc-gps').onclick = () => {
            if (!navigator.geolocation) { $('sc-gps-msg').textContent = 'Thiết bị không hỗ trợ GPS, hãy chạm lên bản đồ.'; return; }
            $('sc-gps-msg').textContent = 'Đang lấy vị trí GPS…';
            navigator.geolocation.getCurrentPosition(p => {
                stopPick();
                done({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), src: 'GPS thiết bị' });
            }, err => {
                $('sc-gps-msg').textContent = 'Không lấy được GPS (' + (err.code === 1 ? 'chưa cho phép truy cập vị trí' : 'tín hiệu yếu hoặc quá thời gian') + '). Hãy chạm lên bản đồ để chọn.';
            }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
        };
    }
    function stopPick() {
        if (state.picking) { state.picking(); state.picking = null; }
        const b = $('sc-pickbar'); if (b) b.remove();
        map.getContainer().classList.remove('sc-picking');
    }

    // ---------------- Ảnh: nén trước khi tải ----------------
    function readAsDataUrl(blob) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); }); }
    async function compress(file) {
        try {
            const url = URL.createObjectURL(file);
            const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
            const max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
            if (blob) return { blob, mime: 'image/jpeg' };
        } catch (e) { /* không giải mã được (ví dụ HEIC trên máy tính): gửi nguyên bản */ }
        return { blob: file, mime: file.type || 'image/jpeg' };
    }

    function photoPicker(prefix) {
        return `<div class="sc-row" style="gap:8px">
            <label class="sc-btn" style="text-align:center;margin:0;font-weight:bold">📷 Chụp ảnh<input type="file" accept="image/*" capture="environment" id="${prefix}-cam" hidden></label>
            <label class="sc-btn" style="text-align:center;margin:0;font-weight:bold">🖼 Chọn ảnh có sẵn<input type="file" accept="image/*" multiple id="${prefix}-file" hidden></label></div>
            <div class="sc-photos" id="${prefix}-list"></div>`;
    }
    function bindPhotos(prefix, list) {
        const draw = () => {
            $(prefix + '-list').innerHTML = list.map((p, i) => `<div class="sc-photo"><img src="${p.preview}" alt="">
                <button class="x" data-i="${i}" ${p.fileId ? 'disabled title="Đã tải lên"' : ''}>×</button>
                <div class="st ${p.fileId ? 'ok' : p.err ? 'err' : ''}">${p.fileId ? '✓ Đã tải' : p.err ? 'Lỗi tải' : p.busy ? 'Đang tải…' : 'Chờ gửi'}</div></div>`).join('');
        };
        const add = files => { [...files].forEach(f => { if (/^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name)) list.push({ file: f, preview: URL.createObjectURL(f) }); }); draw(); };
        $(prefix + '-cam').onchange = e => { add(e.target.files); e.target.value = ''; };
        $(prefix + '-file').onchange = e => { add(e.target.files); e.target.value = ''; };
        $(prefix + '-list').onclick = e => { const b = e.target.closest('button.x'); if (b && !b.disabled) { list.splice(Number(b.dataset.i), 1); draw(); } };
        draw();
        return draw;
    }
    async function uploadAll(list, draw, incidentId, onProgress) {
        let fail = 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.fileId) continue;
            p.busy = true; p.err = ''; draw(); onProgress && onProgress(i + 1, list.length);
            try {
                const { blob, mime } = await compress(p.file);
                if (blob.size > 8 * 1024 * 1024) throw { message: 'Ảnh quá lớn' };
                const dataUrl = await readAsDataUrl(blob);
                const r = await post({ action: 'upload', incidentId: incidentId || '', filename: p.file.name || 'anh.jpg', mime, data: dataUrl.split(',')[1] }, 90000);
                p.fileId = r.fileId;
            } catch (e) { p.err = e.message || 'Lỗi'; fail++; if (e.code && /^AUTH_/.test(e.code)) { p.busy = false; draw(); throw e; } }
            p.busy = false; draw();
        }
        return fail;
    }

    // ---------------- Báo sự cố mới ----------------
    function openReportForm(loc, restore) {
        const road = nearestRoad(loc.lat, loc.lng);
        const draft = restore || {};
        const st = {
            loc, photos: [], reqId: draft.reqId || uuid(),
            tuyen: draft.tuyen !== undefined ? draft.tuyen : (road.d <= 250 ? road.name : ''),
            dia_gioi: draft.dia_gioi !== undefined ? draft.dia_gioi : findWard(loc.lat, loc.lng)
        };
        const old = ls('sc_draft');
        const hasDraft = !restore && old && Date.now() - old.saved < 24 * 3600000;
        const roadNames = [];
        if (typeof dtLayer !== 'undefined' && dtLayer) dtLayer.eachLayer(l => l.feature && l.feature.properties.name && roadNames.push(roadName(l.feature.properties.name)));
        const bg = modal('🚨 Báo sự cố hiện trường', `
            ${hasDraft ? `<div class="sc-msg info">Có bản nháp chưa gửi lúc ${fmt(new Date(old.saved).toISOString())}. <button class="sc-link" id="sc-restore">Dùng lại bản nháp</button></div>` : ''}
            <label>Vị trí</label>
            <div class="sc-loc">📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} <span style="color:#777">(${esc(loc.src)}${loc.acc ? ', sai số khoảng ' + loc.acc + ' m' : ''})</span>
                <button class="sc-link" id="sc-repick">Chọn lại</button></div>
            <div class="sc-row" style="gap:8px">
                <div><label for="sc-tuyen">Tuyến đường</label><input type="text" id="sc-tuyen" list="sc-roads" value="${esc(st.tuyen)}" placeholder="Tự nhận diện, có thể sửa"></div>
                <div><label for="sc-dg">Phường/xã</label><input type="text" id="sc-dg" value="${esc(st.dia_gioi)}" placeholder="Tự nhận diện"></div></div>
            <datalist id="sc-roads">${[...new Set(roadNames)].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            ${road.d <= 250 ? `<div class="sc-note">Cách tim tuyến ${esc(road.name)} khoảng ${Math.round(road.d)} m</div>` : '<div class="sc-note">Không có tuyến QL/ĐT nào trong phạm vi 250 m, nhập tên đường nếu cần</div>'}
            <label>Loại sự cố *</label>${chips('loai', LOAI, draft.loai || '')}
            <label>Mức độ ảnh hưởng</label>${chips('muc_do', MUC_DO, draft.muc_do || 'trung_binh')}
            <label>Tình trạng giao thông</label>${chips('giao_thong', GIAO_THONG, draft.giao_thong || 'han_che')}
            <label for="sc-huong">Hướng tuyến, làn đường (không bắt buộc)</label><input type="text" id="sc-huong" value="${esc(draft.huong_tuyen || '')}" placeholder="VD: hướng Hội An – Đà Nẵng, làn phải">
            <label for="sc-mota">Mô tả tình hình</label><textarea id="sc-mota" placeholder="VD: nước ngập khoảng 30 cm, dài 100 m, xe máy đi khó khăn">${esc(draft.mo_ta || '')}</textarea>
            <label for="sc-tg">Thời gian phát hiện</label><input type="datetime-local" id="sc-tg" value="${draft.tg || toLocalInput(new Date())}">
            <label>Ảnh hiện trường (có thể nhiều ảnh)</label>${photoPicker('sc-ph')}
            <div class="sc-note">Người cập nhật: <b>${esc(state.session.user.ho_ten)}</b> – ${esc(state.session.user.don_vi || '')}</div>
            <div id="sc-form-msg" class="sc-msg" style="display:none"></div>`,
            `<button class="sc-btn" id="sc-cancel">Hủy</button><button class="sc-btn red" id="sc-send">Gửi báo cáo</button>`);
        bindChips(bg);
        const draw = bindPhotos('sc-ph', st.photos);
        const collect = () => ({
            loai: chipVal(bg, 'loai'), muc_do: chipVal(bg, 'muc_do'), giao_thong: chipVal(bg, 'giao_thong'),
            tuyen: $('sc-tuyen').value.trim(), dia_gioi: $('sc-dg').value.trim(), huong_tuyen: $('sc-huong').value.trim(),
            mo_ta: $('sc-mota').value.trim(), tg: $('sc-tg').value
        });
        const saveDraft = () => ls('sc_draft', Object.assign(collect(), { loc, reqId: st.reqId, saved: Date.now() }));
        bg.addEventListener('input', saveDraft); bg.addEventListener('change', saveDraft);
        if (hasDraft) $('sc-restore').onclick = () => openReportForm(old.loc, old);
        $('sc-cancel').onclick = closeModal;
        $('sc-repick').onclick = () => { saveDraft(); closeModal(); startPick(l => openReportForm(l, Object.assign(collect(), { reqId: st.reqId, tuyen: undefined, dia_gioi: undefined }))); };
        $('sc-send').onclick = async () => {
            const v = collect();
            if (!v.loai) { msgBox('sc-form-msg', 'Chọn loại sự cố', 'err'); return; }
            const btn = $('sc-send'); btn.disabled = true;
            try {
                if (st.photos.length) {
                    const fail = await uploadAll(st.photos, draw, '', (i, n) => msgBox('sc-form-msg', `Đang tải ảnh ${i}/${n}…`, 'info'));
                    if (fail) { msgBox('sc-form-msg', `Tải ảnh thất bại ${fail}/${st.photos.length}. Chưa lưu sự cố. Bấm "Gửi báo cáo" để thử lại (ảnh đã tải xong không phải tải lại), hoặc bấm × để bỏ ảnh lỗi.`, 'err'); btn.disabled = false; return; }
                }
                msgBox('sc-form-msg', 'Đang lưu sự cố…', 'info');
                const r = await post({
                    action: 'create', clientRequestId: st.reqId,
                    data: { lat: loc.lat, lng: loc.lng, loai: v.loai, muc_do: v.muc_do, giao_thong: v.giao_thong, tuyen: v.tuyen, dia_gioi: v.dia_gioi, huong_tuyen: v.huong_tuyen, mo_ta: v.mo_ta, thoi_gian_phat_hien: v.tg ? new Date(v.tg).toISOString() : '' },
                    photos: st.photos.filter(p => p.fileId).map(p => ({ fileId: p.fileId, giai_doan: 'ban_dau' }))
                }, 60000);
                ls('sc_draft', null);
                closeModal();
                upsert(r.incident);
                toast(`Đã lưu sự cố ${r.incident.id}${r.duplicate ? ' (đã lưu từ lần gửi trước)' : ''}`, 'ok', 5000);
                focusIncident(r.incident.id);
            } catch (e) {
                const unsure = e.code === 'NETWORK';
                msgBox('sc-form-msg', 'CHƯA LƯU: ' + e.message + '. Nội dung vẫn giữ trong biểu mẫu' + (unsure ? '; bấm "Gửi báo cáo" để gửi lại, hệ thống không tạo trùng nếu lần trước đã lưu.' : '.'), 'err');
                btn.disabled = false;
                if (e.code && /^AUTH_/.test(e.code)) openLoginKeep(() => $('sc-send') && $('sc-send').click());
            }
        };
    }

    // Đăng nhập lại khi hết phiên mà không mất biểu mẫu đang nhập
    function openLoginKeep(after) {
        const formBg = $('sc-modal-bg'); if (formBg) formBg.style.display = 'none';
        const keep = formBg; if (keep) keep.id = 'sc-modal-keep';
        const bg = openLogin(() => { const k = $('sc-modal-keep'); if (k) { k.id = 'sc-modal-bg'; k.style.display = ''; } after && after(); });
        const restore = () => { const k = $('sc-modal-keep'); if (k && !$('sc-modal-bg')) { k.id = 'sc-modal-bg'; k.style.display = ''; } };
        if (bg) { $('sc-x').addEventListener('click', restore); $('sc-cancel').addEventListener('click', restore); }
    }

    function removeLocal(id) {
        delete state.byId[id];
        state.incidents = state.incidents.filter(x => x.id !== id);
        state.lastHash = ''; render();
    }

    function upsert(inc) {
        state.byId[inc.id] = inc;
        const i = state.incidents.findIndex(x => x.id === inc.id);
        if (i >= 0) state.incidents[i] = inc; else state.incidents.unshift(inc);
        state.lastHash = ''; render();
    }

    // ---------------- Hồ sơ sự cố ----------------
    function row(label, val, raw) { return val ? `<tr><td>${esc(label)}</td><td>${raw ? val : esc(val)}</td></tr>` : ''; }
    function gallery(photos, canDelete) {
        if (!photos || !photos.length) return '<div class="sc-note">Chưa có ảnh</div>';
        return Object.keys(GIAI_DOAN).map(g => {
            const ps = photos.filter(p => (p.giai_doan || 'dien_bien') === g);
            return ps.length ? `<div style="margin:6px 0 2px;font-weight:bold;font-size:13px">${GIAI_DOAN[g]} (${ps.length})</div><div class="sc-gallery">` +
                ps.map(p => `<div style="position:relative"><a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc((p.nguoi || '') + ' · ' + fmt(p.thoi_gian))}"><img src="${esc(p.thumb)}" alt="Ảnh ${esc(GIAI_DOAN[g])}" loading="lazy" referrerpolicy="no-referrer"></a>${canDelete ? `<button class="sc-del-photo" data-del-photo="${esc(p.id)}" title="Xóa ảnh này" aria-label="Xóa ảnh">🗑</button>` : ''}</div>`).join('') + '</div>' : '';
        }).join('');
    }
    function changeText(c) {
        return Object.keys(c || {}).map(k => {
            let v = c[k];
            if (k === 'loai') v = (LOAI[v] || {}).t || v; else if (k === 'muc_do') v = MUC_DO[v] || v; else if (k === 'giao_thong') v = GIAO_THONG[v] || v;
            else if (/xu_ly$|phat_hien$/.test(k) && v) v = fmt(v); else if (k === 'da_xac_nhan') v = 'Có'; else if (k === 'anh_da_xoa') return 'Đã xóa ' + (v || []).length + ' ảnh';
            return `${FIELD_LABEL[k] || k}: ${v}`;
        }).join('; ');
    }

    async function openDetail(id) {
        let inc = state.byId[id];
        if (!inc) { await load({ force: true }); inc = state.byId[id]; }
        if (!inc) { toast('Không tìm thấy sự cố ' + id, 'err'); return; }
        const ended = inc.trang_thai === 'da_ket_thuc';
        const u = state.session && state.session.user;
        let actions = `<button class="sc-btn" id="sc-cancel">Đóng</button>`;
        if (!state.session && API) actions += `<button class="sc-btn blue" id="sc-d-login">Đăng nhập để cập nhật</button>`;
        if (state.session && !ended) {
            actions += `<button class="sc-btn blue" id="sc-d-upd">Cập nhật tình hình</button>`;
            if (isMgr() && inc.da_xac_nhan !== 'co') actions += `<button class="sc-btn green" id="sc-d-confirm">Xác nhận</button>`;
            if (isMgr()) actions += `<button class="sc-btn grey" id="sc-d-end">Kết thúc sự cố</button>`;
        }
        if (u && u.vai_tro === 'admin' && ended) actions += `<button class="sc-btn blue" id="sc-d-reopen">Mở lại</button>`;
        if (isAdmin()) actions += `<button class="sc-btn red" id="sc-d-del">🗑 Xóa sự cố</button>`;
        const L0 = LOAI[inc.loai] || LOAI.khac;
        modal(`${L0.i} ${esc(inc.id)} · ${esc(L0.t)}`, `<div class="sc-detail">
            <div>${statusBadge(inc.trang_thai)} ${inc.da_xac_nhan === 'co' ? `<span class="sc-status" style="background:#1565c0">Đã xác nhận bởi ${esc(inc.nguoi_xac_nhan)}</span>` : '<span class="sc-status" style="background:#9e9e9e">Chưa xác nhận</span>'}</div>
            <table>
                ${row('Vị trí', `${inc.lat.toFixed(6)}, ${inc.lng.toFixed(6)} · <a href="https://www.google.com/maps?q=${inc.lat},${inc.lng}" target="_blank" rel="noopener">Chỉ đường</a>`, true)}
                ${row('Tuyến đường', inc.tuyen)}${row('Phường/xã', inc.dia_gioi)}${row('Hướng tuyến, làn', inc.huong_tuyen)}
                ${row('Mức độ ảnh hưởng', MUC_DO[inc.muc_do])}${row('Tình trạng giao thông', GIAO_THONG[inc.giao_thong])}
                ${row('Mô tả', inc.mo_ta)}
                ${row('Thời gian phát hiện', fmt(inc.thoi_gian_phat_hien))}
                ${row('Người báo', [inc.ho_ten_nguoi_tao, inc.don_vi_nguoi_tao].filter(Boolean).join(' – ') + ' · ' + fmt(inc.thoi_gian_tao))}
                ${row('Cập nhật gần nhất', (inc.ho_ten_nguoi_cap_nhat || '') + ' · ' + fmt(inc.thoi_gian_cap_nhat) + ' · ' + inc.so_lan_cap_nhat + ' lần')}
                ${row('Đơn vị phụ trách', inc.don_vi_phu_trach)}${row('Biện pháp xử lý', inc.bien_phap_xu_ly)}
                ${row('Bắt đầu xử lý', fmt(inc.bat_dau_xu_ly))}${row('Kết thúc xử lý', fmt(inc.ket_thuc_xu_ly))}
                ${row('Ghi chú kiểm tra', inc.ghi_chu_kiem_tra)}${row('Tài liệu liên quan', inc.tai_lieu)}
                ${row('Thời điểm kết thúc sự cố', fmt(inc.thoi_gian_ket_thuc))}
            </table>
            <h4>Ảnh hiện trường</h4>${gallery(inc.anh, isAdmin())}
            <h4>Lịch sử cập nhật</h4><div id="sc-hist" class="sc-note">Đang tải lịch sử…</div>
            <div class="sc-src">Nguồn: ${esc(inc.nguon || 'Cán bộ cập nhật hiện trường')}. Dữ liệu lưu trên Google Sheets, ảnh lưu trên Google Drive.</div>
            <div id="sc-d-msg" class="sc-msg" style="display:none"></div></div>`, actions);
        $('sc-cancel').onclick = closeModal;
        if ($('sc-d-login')) $('sc-d-login').onclick = () => openLogin(() => openDetail(id));
        if ($('sc-d-upd')) $('sc-d-upd').onclick = () => openUpdateForm(inc);
        if ($('sc-d-confirm')) $('sc-d-confirm').onclick = () => quickAction(inc, { confirm: true }, 'Xác nhận sự cố', 'Ghi chú xác nhận (không bắt buộc)');
        if ($('sc-d-end')) $('sc-d-end').onclick = () => quickAction(inc, { status: 'da_ket_thuc' }, 'Kết thúc sự cố', 'Kết quả, ghi chú khi kết thúc (khuyến nghị nhập)');
        if ($('sc-d-reopen')) $('sc-d-reopen').onclick = () => quickAction(inc, { reopen: true, status: 'dang_xu_ly' }, 'Mở lại sự cố', 'Lý do mở lại');
        if ($('sc-d-del')) $('sc-d-del').onclick = () => quickAction(inc, {}, 'Xóa sự cố', 'Lý do xóa (bắt buộc), ví dụ: báo trùng, báo nhầm, dữ liệu thử', { action: 'delete_incident', required: true, danger: true });
        document.querySelectorAll('[data-del-photo]').forEach(b => b.onclick = ev => {
            ev.preventDefault();
            quickAction(inc, { fileId: b.dataset.delPhoto }, 'Xóa ảnh', 'Lý do xóa ảnh (bắt buộc), ví dụ: ảnh mờ, chụp nhầm, chứa thông tin cá nhân', { action: 'delete_photo', required: true, danger: true });
        });
        try {
            const h = await call('GET', { action: 'history', id }, 30000);
            const el = $('sc-hist'); if (!el) return;
            el.className = '';
            el.innerHTML = h.items.length ? '<ul class="sc-timeline">' + h.items.slice().reverse().map(it => `<li>
                <div class="t">${fmt(it.thoi_gian)} · ${esc(it.ho_ten || it.nguoi)} (${esc(VAI_TRO[it.vai_tro] || it.vai_tro)})</div>
                <b>${esc(HANH_DONG[it.hanh_dong] || it.hanh_dong)}</b>
                ${it.trang_thai_truoc !== it.trang_thai_sau && it.trang_thai_sau ? ` · ${it.trang_thai_truoc ? statusBadge(it.trang_thai_truoc) + ' → ' : ''}${statusBadge(it.trang_thai_sau)}` : ''}
                ${Object.keys(it.noi_dung || {}).length ? `<div>${esc(changeText(it.noi_dung))}</div>` : ''}
                ${it.ghi_chu ? `<div>📝 ${esc(it.ghi_chu)}</div>` : ''}
                ${it.anh && it.anh.length ? `<div class="sc-gallery" style="margin-top:4px">${it.anh.map(p => p.da_xoa ? `<div class="sc-photo-gone">Ảnh đã xóa</div>` : `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join('')}</div>` : ''}
            </li>`).join('') + '</ul>' : '<div class="sc-note">Chưa có lịch sử</div>';
        } catch (e) { const el = $('sc-hist'); if (el) { el.className = 'sc-msg err'; el.textContent = 'Không tải được lịch sử: ' + e.message; } }
    }

    function quickAction(inc, extra, title, noteLabel, opt) {
        opt = opt || {};
        const reqId = uuid();
        modal(`${esc(title)} · ${esc(inc.id)}`, `<label for="sc-qa-note">${esc(noteLabel)}</label><textarea id="sc-qa-note"></textarea>
            <div id="sc-qa-msg" class="sc-msg" style="display:none"></div>`,
            `<button class="sc-btn" id="sc-cancel">Quay lại</button><button class="sc-btn ${opt.danger ? 'red' : extra.status === 'da_ket_thuc' ? 'grey' : 'green'}" id="sc-qa-go">${esc(title)}</button>`);
        $('sc-cancel').onclick = () => openDetail(inc.id);
        $('sc-qa-go').onclick = async () => {
            const note = $('sc-qa-note').value.trim();
            if (opt.required && !note) { msgBox('sc-qa-msg', 'Cần nhập lý do', 'err'); return; }
            const b = $('sc-qa-go'); b.disabled = true; msgBox('sc-qa-msg', 'Đang lưu…', 'info');
            try {
                const r = await post(Object.assign({ action: opt.action || 'update', id: inc.id, clientRequestId: reqId, note }, extra), 60000);
                if (opt.action === 'delete_incident') { removeLocal(inc.id); closeModal(); toast(`Đã xóa sự cố ${inc.id} (khôi phục được trong ⚙ Quản trị)`, 'ok', 5000); return; }
                upsert(r.incident);
                toast(opt.action === 'delete_photo' ? `Đã xóa ảnh${r.trashed ? ' (ảnh nằm trong Thùng rác Google Drive 30 ngày)' : ''}` : `${title}: đã lưu ${r.incident.id}`, 'ok', 5000);
                openDetail(r.incident.id);
            } catch (e) { msgBox('sc-qa-msg', 'CHƯA LƯU: ' + e.message, 'err'); b.disabled = false; }
        };
    }

    // ---------------- Cập nhật tình hình ----------------
    function openUpdateForm(inc) {
        const mgr = isMgr();
        const reqId = uuid();
        const photos = [];
        const statusOpts = Object.keys(TT).filter(k => k !== 'da_ket_thuc');
        const localDT = iso => iso ? toLocalInput(new Date(iso)) : '';
        const own = state.session && state.session.user.username === inc.nguoi_tao;
        const canGoc = mgr || own;
        const bg = modal(`Cập nhật ${esc(inc.id)}`, `
            <label for="sc-u-tt">Trạng thái</label>
            <select id="sc-u-tt">${statusOpts.map(k => `<option value="${k}"${k === inc.trang_thai ? ' selected' : ''}>${TT[k].t}</option>`).join('')}</select>
            <div class="sc-note">Kết thúc sự cố do cán bộ quản lý thực hiện bằng nút "Kết thúc sự cố" trong hồ sơ.</div>
            <label>Mức độ ảnh hưởng</label>${chips('muc_do', MUC_DO, inc.muc_do)}
            <label>Tình trạng giao thông</label>${chips('giao_thong', GIAO_THONG, inc.giao_thong)}
            <label for="sc-u-note">Nội dung cập nhật</label><textarea id="sc-u-note" placeholder="Diễn biến mới, kết quả kiểm tra, biện pháp đã làm…"></textarea>
            <label>Ảnh bổ sung</label>
            <select id="sc-u-gd">${Object.keys(GIAI_DOAN).filter(k => k !== 'ban_dau').map(k => `<option value="${k}"${(k === 'sau_khac_phuc') === (inc.trang_thai === 'da_khac_phuc') ? ' selected' : ''}>Ảnh ${GIAI_DOAN[k].toLowerCase()}</option>`).join('')}</select>
            ${photoPicker('sc-u-ph')}
            ${canGoc ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold;color:#0026FF">✏️ Sửa thông tin ban đầu${mgr ? '' : ' (người báo)'}</summary>
                <label>Loại sự cố</label>${chips('loai', LOAI, inc.loai)}
                <div class="sc-row" style="gap:8px"><div><label for="sc-u-tuyen">Tuyến đường</label><input type="text" id="sc-u-tuyen" value="${esc(inc.tuyen)}"></div>
                <div><label for="sc-u-dg">Phường/xã</label><input type="text" id="sc-u-dg" value="${esc(inc.dia_gioi)}"></div></div>
                <label for="sc-u-huong">Hướng tuyến, làn</label><input type="text" id="sc-u-huong" value="${esc(inc.huong_tuyen)}">
                <label for="sc-u-mota">Mô tả</label><textarea id="sc-u-mota">${esc(inc.mo_ta)}</textarea>
                ${mgr ? `<label for="sc-u-tgph">Thời gian phát hiện</label><input type="datetime-local" id="sc-u-tgph" value="${localDT(inc.thoi_gian_phat_hien)}">
                <div class="sc-row" style="gap:8px"><div><label for="sc-u-lat">Vĩ độ</label><input type="text" id="sc-u-lat" value="${inc.lat}"></div>
                <div><label for="sc-u-lng">Kinh độ</label><input type="text" id="sc-u-lng" value="${inc.lng}"></div></div>` : ''}
            </details>` : ''}
            ${mgr ? `<h4 style="margin:14px 0 4px;color:#0026FF">Thông tin xử lý (cán bộ quản lý)</h4>
                <label for="sc-u-dv">Đơn vị phụ trách</label><input type="text" id="sc-u-dv" value="${esc(inc.don_vi_phu_trach)}">
                <label for="sc-u-bp">Biện pháp xử lý</label><textarea id="sc-u-bp">${esc(inc.bien_phap_xu_ly)}</textarea>
                <div class="sc-row" style="gap:8px"><div><label for="sc-u-bd">Bắt đầu xử lý</label><input type="datetime-local" id="sc-u-bd" value="${localDT(inc.bat_dau_xu_ly)}"></div>
                <div><label for="sc-u-kt">Kết thúc xử lý</label><input type="datetime-local" id="sc-u-kt" value="${localDT(inc.ket_thuc_xu_ly)}"></div></div>
                <label for="sc-u-gc">Ghi chú kiểm tra</label><textarea id="sc-u-gc">${esc(inc.ghi_chu_kiem_tra)}</textarea>
                <label for="sc-u-tl">Tài liệu liên quan (số văn bản, đường link)</label><input type="text" id="sc-u-tl" value="${esc(inc.tai_lieu)}">` : ''}
            <div id="sc-u-msg" class="sc-msg" style="display:none"></div>`,
            `<button class="sc-btn" id="sc-cancel">Quay lại</button><button class="sc-btn blue" id="sc-u-send">Lưu cập nhật</button>`);
        bindChips(bg);
        const draw = bindPhotos('sc-u-ph', photos);
        $('sc-u-tt').onchange = () => { if ($('sc-u-tt').value === 'da_khac_phuc') $('sc-u-gd').value = 'sau_khac_phuc'; };
        $('sc-cancel').onclick = () => openDetail(inc.id);
        $('sc-u-send').onclick = async () => {
            const btn = $('sc-u-send'); btn.disabled = true;
            const data = {};
            const setIf = (k, v) => { if (String(v) !== String(inc[k] || '')) data[k] = v; };
            setIf('muc_do', chipVal(bg, 'muc_do')); setIf('giao_thong', chipVal(bg, 'giao_thong'));
            if (canGoc) {
                setIf('loai', chipVal(bg, 'loai')); setIf('tuyen', $('sc-u-tuyen').value.trim()); setIf('dia_gioi', $('sc-u-dg').value.trim());
                setIf('huong_tuyen', $('sc-u-huong').value.trim()); setIf('mo_ta', $('sc-u-mota').value.trim());
                if (mgr) {
                    const tg = $('sc-u-tgph').value; if (tg !== localDT(inc.thoi_gian_phat_hien)) data.thoi_gian_phat_hien = tg ? new Date(tg).toISOString() : '';
                    const la = Number($('sc-u-lat').value), lo = Number($('sc-u-lng').value);
                    if (!isFinite(la) || !isFinite(lo)) { msgBox('sc-u-msg', 'Tọa độ không hợp lệ', 'err'); btn.disabled = false; return; }
                    if (Math.abs(la - inc.lat) > 1e-7) data.lat = la; if (Math.abs(lo - inc.lng) > 1e-7) data.lng = lo;
                }
            }
            if (mgr) {
                setIf('don_vi_phu_trach', $('sc-u-dv').value.trim()); setIf('bien_phap_xu_ly', $('sc-u-bp').value.trim());
                setIf('ghi_chu_kiem_tra', $('sc-u-gc').value.trim()); setIf('tai_lieu', $('sc-u-tl').value.trim());
                const bd = $('sc-u-bd').value, kt = $('sc-u-kt').value;
                if (bd !== localDT(inc.bat_dau_xu_ly)) data.bat_dau_xu_ly = bd ? new Date(bd).toISOString() : '';
                if (kt !== localDT(inc.ket_thuc_xu_ly)) data.ket_thuc_xu_ly = kt ? new Date(kt).toISOString() : '';
            }
            const status = $('sc-u-tt').value;
            const note = $('sc-u-note').value.trim();
            if (!Object.keys(data).length && status === inc.trang_thai && !note && !photos.length) {
                msgBox('sc-u-msg', 'Chưa có nội dung nào thay đổi', 'err'); btn.disabled = false; return;
            }
            try {
                if (photos.length) {
                    const fail = await uploadAll(photos, draw, inc.id, (i, n) => msgBox('sc-u-msg', `Đang tải ảnh ${i}/${n}…`, 'info'));
                    if (fail) { msgBox('sc-u-msg', `Tải ảnh thất bại ${fail}/${photos.length}. Chưa lưu cập nhật. Bấm "Lưu cập nhật" để thử lại.`, 'err'); btn.disabled = false; return; }
                }
                msgBox('sc-u-msg', 'Đang lưu…', 'info');
                const gd = $('sc-u-gd').value;
                const r = await post({ action: 'update', id: inc.id, clientRequestId: reqId, data, status, note, photos: photos.map(p => ({ fileId: p.fileId, giai_doan: gd })) }, 60000);
                upsert(r.incident); toast(`Đã lưu cập nhật ${r.incident.id}`, 'ok'); openDetail(r.incident.id);
            } catch (e) {
                msgBox('sc-u-msg', 'CHƯA LƯU: ' + e.message + (e.code === 'NETWORK' ? '. Bấm "Lưu cập nhật" để gửi lại, hệ thống không ghi trùng.' : ''), 'err');
                btn.disabled = false;
                if (e.code && /^AUTH_/.test(e.code)) openLoginKeep();
            }
        };
    }

    // ---------------- Quản trị viên ----------------
    async function openAdmin(tab, editUser) {
        if (!isAdmin()) return;
        const tabs = `<div class="sc-row" style="margin-bottom:10px"><button class="sc-btn ${tab === 'users' ? 'blue' : ''}" id="sc-ad-t1">👥 Tài khoản</button><button class="sc-btn ${tab === 'deleted' ? 'blue' : ''}" id="sc-ad-t2">🗑 Sự cố đã xóa</button></div>`;
        modal('⚙ Quản trị hệ thống', tabs + '<div id="sc-ad-body" class="sc-note">Đang tải…</div><div id="sc-ad-msg" class="sc-msg" style="display:none"></div>', '<button class="sc-btn" id="sc-cancel">Đóng</button>');
        $('sc-cancel').onclick = closeModal;
        $('sc-ad-t1').onclick = () => openAdmin('users');
        $('sc-ad-t2').onclick = () => openAdmin('deleted');
        const body = $('sc-ad-body');
        try {
            if (tab === 'users' && editUser !== undefined) return userForm(body, editUser);
            if (tab === 'users') {
                const r = await post({ action: 'admin_users' }, 30000);
                state.adminUsers = r.users;
                body.className = '';
                body.innerHTML = `<button class="sc-btn green" id="sc-ad-new">＋ Thêm tài khoản</button>
                    <div style="overflow-x:auto;margin-top:8px"><table class="sc-utable"><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Đơn vị</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr>
                    ${r.users.map((u, i) => `<tr${u.trang_thai !== 'hoat_dong' ? ' style="opacity:.55"' : ''}><td>${esc(u.username)}</td><td>${esc(u.ho_ten)}</td><td>${esc(u.don_vi)}</td>
                        <td><b>${esc(VAI_TRO[u.vai_tro] || u.vai_tro)}</b></td><td>${u.trang_thai === 'hoat_dong' ? 'Hoạt động' : '🔒 Đã khóa'}</td>
                        <td><button class="sc-link" data-edit-user="${i}">Sửa</button></td></tr>`).join('')}</table></div>
                    <div class="sc-note">Quyền: <b>Tuần tra</b> báo và cập nhật sự cố · <b>Quản lý</b> thêm xác nhận, giao xử lý, kết thúc · <b>Quản trị</b> toàn quyền: xóa ảnh, xóa/khôi phục sự cố, quản lý tài khoản.</div>`;
                $('sc-ad-new').onclick = () => openAdmin('users', null);
                body.querySelectorAll('[data-edit-user]').forEach(b => b.onclick = () => openAdmin('users', state.adminUsers[Number(b.dataset.editUser)]));
            } else {
                const r = await post({ action: 'admin_deleted' }, 30000);
                body.className = '';
                body.innerHTML = r.incidents.length ? '<ul class="sc-list" style="max-height:none">' + r.incidents.map(i => `<li style="cursor:default">${(LOAI[i.loai] || LOAI.khac).i} <b>${esc(i.id)}</b> · ${esc((LOAI[i.loai] || LOAI.khac).t)}
                    <br><span class="meta">${esc(i.tuyen || '')} ${esc(i.dia_gioi || '')} · báo lúc ${fmt(i.thoi_gian_tao)} · xóa lúc ${fmt(i.thoi_gian_cap_nhat)} bởi ${esc(i.ho_ten_nguoi_cap_nhat)}</span>
                    <br><button class="sc-btn green" data-restore="${esc(i.id)}" style="margin-top:4px">Khôi phục</button></li>`).join('') + '</ul>'
                    : '<div class="sc-note">Không có sự cố nào bị xóa.</div>';
                body.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
                    b.disabled = true;
                    try { const x = await post({ action: 'restore_incident', id: b.dataset.restore, clientRequestId: uuid() }, 30000); upsert(x.incident); toast('Đã khôi phục ' + x.incident.id, 'ok'); openAdmin('deleted'); }
                    catch (e) { msgBox('sc-ad-msg', e.message, 'err'); b.disabled = false; }
                });
            }
        } catch (e) { body.className = 'sc-msg err'; body.textContent = 'Lỗi: ' + e.message; }
    }

    function userForm(body, u) {
        const isNew = !u;
        u = u || { username: '', ho_ten: '', don_vi: '', vai_tro: 'tuan_tra', trang_thai: 'hoat_dong' };
        const self = state.session.user.username === u.username;
        body.className = '';
        body.innerHTML = `<h4 style="margin:0 0 6px">${isNew ? 'Thêm tài khoản mới' : 'Sửa tài khoản ' + esc(u.username)}</h4>
            <label for="sc-uf-u">Tên đăng nhập (không dấu, viết thường)</label><input type="text" id="sc-uf-u" value="${esc(u.username)}" ${isNew ? '' : 'disabled'} autocapitalize="none">
            <label for="sc-uf-h">Họ và tên</label><input type="text" id="sc-uf-h" value="${esc(u.ho_ten)}">
            <label for="sc-uf-d">Đơn vị</label><input type="text" id="sc-uf-d" value="${esc(u.don_vi)}">
            <label for="sc-uf-r">Vai trò</label><select id="sc-uf-r" ${self ? 'disabled' : ''}>${Object.keys(VAI_TRO).map(k => `<option value="${k}"${k === u.vai_tro ? ' selected' : ''}>${VAI_TRO[k]}</option>`).join('')}</select>
            <label for="sc-uf-s">Trạng thái</label><select id="sc-uf-s" ${self ? 'disabled' : ''}><option value="hoat_dong">Hoạt động</option><option value="khoa"${u.trang_thai === 'khoa' ? ' selected' : ''}>Khóa (không đăng nhập được)</option></select>
            <label for="sc-uf-p">${isNew ? 'Mật khẩu (tối thiểu 6 ký tự)' : 'Mật khẩu mới (để trống nếu không đổi)'}</label><input type="password" id="sc-uf-p" autocomplete="new-password">
            ${self ? '<div class="sc-note">Không thể tự hạ quyền hoặc tự khóa tài khoản đang dùng.</div>' : ''}
            <div class="sc-row" style="margin-top:10px"><button class="sc-btn" id="sc-uf-back">Quay lại</button><button class="sc-btn blue" id="sc-uf-save">Lưu tài khoản</button></div>`;
        $('sc-uf-back').onclick = () => openAdmin('users');
        $('sc-uf-save').onclick = async () => {
            const b = $('sc-uf-save'); b.disabled = true;
            const data = { username: $('sc-uf-u').value.trim().toLowerCase(), ho_ten: $('sc-uf-h').value.trim(), don_vi: $('sc-uf-d').value.trim(), vai_tro: $('sc-uf-r').value, trang_thai: $('sc-uf-s').value };
            const pw = $('sc-uf-p').value; if (pw) data.password = pw;
            try {
                const r = await post({ action: 'admin_user_save', user: data }, 30000);
                toast('Đã lưu tài khoản ' + r.user.username, 'ok'); openAdmin('users');
            } catch (e) { msgBox('sc-ad-msg', e.message, 'err'); b.disabled = false; }
        };
    }

    // ---------------- Xuất CSV ----------------
    function exportCsv() {
        const cols = [['id', 'Mã'], ['trang_thai', 'Trạng thái'], ['loai', 'Loại'], ['muc_do', 'Mức độ'], ['giao_thong', 'Giao thông'], ['tuyen', 'Tuyến'], ['dia_gioi', 'Phường/xã'],
            ['huong_tuyen', 'Hướng tuyến'], ['mo_ta', 'Mô tả'], ['thoi_gian_phat_hien', 'Thời gian phát hiện'], ['ho_ten_nguoi_tao', 'Người báo'], ['don_vi_nguoi_tao', 'Đơn vị người báo'],
            ['thoi_gian_cap_nhat', 'Cập nhật gần nhất'], ['don_vi_phu_trach', 'Đơn vị phụ trách'], ['bien_phap_xu_ly', 'Biện pháp xử lý'], ['bat_dau_xu_ly', 'Bắt đầu xử lý'],
            ['ket_thuc_xu_ly', 'Kết thúc xử lý'], ['da_xac_nhan', 'Đã xác nhận'], ['thoi_gian_ket_thuc', 'Kết thúc sự cố'], ['lat', 'Vĩ độ'], ['lng', 'Kinh độ'], ['anh', 'Số ảnh']];
        const val = (inc, k) => {
            const v = inc[k];
            if (k === 'trang_thai') return (TT[v] || {}).t || v; if (k === 'loai') return (LOAI[v] || {}).t || v;
            if (k === 'muc_do') return MUC_DO[v] || v; if (k === 'giao_thong') return GIAO_THONG[v] || v;
            if (k === 'anh') return (v || []).length; if (k === 'da_xac_nhan') return v === 'co' ? 'Có' : '';
            if (/thoi_gian|xu_ly$/.test(k) && v) return fmt(v);
            return v;
        };
        const rows = state.incidents.filter(matchFilter).map(i => cols.map(c => val(i, c[0])));
        const csv = '﻿' + [cols.map(c => c[1])].concat(rows).map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'su_co_hien_truong_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------------- Khởi động ----------------
    renderUser();
    render();
    if (API) {
        load({ force: true }).then(() => {
            const q = new URLSearchParams(location.search).get('suco');
            if (q) { const i = state.byId[q]; if (i) map.setView([i.lat, i.lng], 16); openDetail(q); }
        });
        setInterval(() => { if (document.visibilityState === 'visible' && !$('sc-modal-bg')) load(); }, REFRESH);
        if (state.session) post({ action: 'me' }).then(r => { state.session.user = r.user; setSession(state.session); }).catch(() => { });
    }
    window.SuCo = { reload: () => load({ force: true }), state };
})();
