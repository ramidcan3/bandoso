/**
 * MÁY CHỦ DỮ LIỆU SỰ CỐ HIỆN TRƯỜNG (MƯA BÃO, NGẬP ÚNG, SẠT LỞ)
 * Nền tảng: Google Apps Script gắn với 1 Google Sheet; ảnh lưu trên Google Drive.
 *
 * Cài đặt (chi tiết trong HUONG_DAN_SU_CO.md):
 *  1. Tạo Google Sheet mới → Tiện ích mở rộng → Apps Script → dán toàn bộ file này.
 *  2. Chạy hàm khoiTaoHeThong() một lần (cấp quyền khi được hỏi).
 *  3. Xem Nhật ký thực thi: mở đường link bảng dữ liệu được in ra. Nhập tài khoản vào trang
 *     "TaoTaiKhoan" rồi chạy hàm taoTaiKhoan() (hoặc dùng menu "🗺 Bản đồ sự cố" trong Sheet).
 *  4. Triển khai → Tạo bản triển khai mới → Ứng dụng web
 *       Thực thi dưới quyền: Tôi | Người có quyền truy cập: Bất kỳ ai
 *  5. Dán URL ứng dụng web (đuôi /exec) vào file su_co_config.js trên GitHub.
 */

var CFG = {
  VERSION: '1.1',
  TZ: 'Asia/Ho_Chi_Minh',
  SHEET_SUCO: 'SuCo',
  SHEET_LICHSU: 'LichSu',
  SHEET_USER: 'NguoiDung',
  FOLDER_NAME: 'AnhHienTruong_SuCo',
  TOKEN_DAYS: 30,                 // thời hạn đăng nhập (ngày)
  MAX_PHOTO_BYTES: 8 * 1024 * 1024,
  MAX_FAIL: 5,                    // số lần sai mật khẩu trước khi khóa tạm
  LOCK_MINUTES: 10,
  ENDED_DAYS_DEFAULT: 30          // danh sách mặc định trả về sự cố đã kết thúc trong N ngày gần nhất
};

var LOAI = ['ngap_ung', 'sat_lo_dat', 'sat_lo_taluy', 'cay_do', 'dat_da_tran', 'hu_hong_mat_duong', 'hu_hong_cong_trinh', 'khac'];
var TRANG_THAI = ['dang_xay_ra', 'da_kiem_tra', 'dang_xu_ly', 'da_khac_phuc', 'da_ket_thuc'];
var MUC_DO = ['nhe', 'trung_binh', 'nghiem_trong'];
var GIAO_THONG = ['binh_thuong', 'han_che', 'xe_lon', 'cam'];
var GIAI_DOAN = ['ban_dau', 'dien_bien', 'sau_khac_phuc'];
var VAI_TRO = ['tuan_tra', 'quan_ly', 'admin'];

var COLS_SUCO = ['id', 'trang_thai', 'loai', 'muc_do', 'giao_thong', 'lat', 'lng', 'tuyen', 'dia_gioi', 'huong_tuyen',
  'mo_ta', 'thoi_gian_phat_hien', 'thoi_gian_tao', 'nguoi_tao', 'ho_ten_nguoi_tao', 'don_vi_nguoi_tao',
  'thoi_gian_cap_nhat', 'nguoi_cap_nhat', 'ho_ten_nguoi_cap_nhat', 'don_vi_phu_trach', 'bien_phap_xu_ly',
  'bat_dau_xu_ly', 'ket_thuc_xu_ly', 'ghi_chu_kiem_tra', 'tai_lieu', 'da_xac_nhan', 'nguoi_xac_nhan',
  'thoi_gian_xac_nhan', 'thoi_gian_ket_thuc', 'anh', 'nguon', 'so_lan_cap_nhat'];
var COLS_LICHSU = ['ma_cap_nhat', 'ma_su_co', 'thoi_gian', 'nguoi', 'ho_ten', 'vai_tro', 'hanh_dong',
  'trang_thai_truoc', 'trang_thai_sau', 'noi_dung', 'ghi_chu', 'anh', 'client_request_id'];
var COLS_USER = ['ten_dang_nhap', 'ho_ten', 'don_vi', 'vai_tro', 'salt', 'mat_khau_hash', 'trang_thai', 'ngay_tao'];

// Tình hình hiện trường: mọi người đăng nhập được cập nhật
var FIELDS_TUAN_TRA = ['muc_do', 'giao_thong'];
// Thông tin ban đầu: người tạo sự cố, quản lý, quản trị được sửa
var FIELDS_GOC = ['loai', 'huong_tuyen', 'mo_ta', 'tuyen', 'dia_gioi'];
// Trường quản lý xử lý (quản lý / admin)
var FIELDS_QUAN_LY = ['don_vi_phu_trach', 'bien_phap_xu_ly', 'bat_dau_xu_ly', 'ket_thuc_xu_ly', 'ghi_chu_kiem_tra', 'tai_lieu', 'lat', 'lng', 'thoi_gian_phat_hien'];

// ======================= HTTP =======================
function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    var action = p.action || 'ping';
    if (action === 'ping') return { ok: true, version: CFG.VERSION, time: nowIso_() };
    if (action === 'list') return listIncidents_(p.all === '1');
    if (action === 'history') return getHistory_(String(p.id || ''));
    throw err_('UNKNOWN_ACTION', 'Thao tác không hợp lệ');
  });
}

function doPost(e) {
  return handle_(function () {
    var body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (x) { throw err_('BAD_JSON', 'Dữ liệu gửi lên không hợp lệ'); }
    var action = body.action;
    if (action === 'login') return login_(body.username, body.password);
    var user = auth_(body.token);
    if (action === 'me') return { ok: true, user: publicUser_(user) };
    if (action === 'upload') return uploadPhoto_(user, body);
    if (action === 'create') return createIncident_(user, body);
    if (action === 'update') return updateIncident_(user, body);
    // ---- Chỉ quản trị viên ----
    if (['delete_photo', 'delete_incident', 'restore_incident', 'admin_deleted', 'admin_users', 'admin_user_save'].indexOf(action) >= 0) {
      if (user.vai_tro !== 'admin') throw err_('FORBIDDEN', 'Chỉ quản trị viên được thực hiện thao tác này');
      if (action === 'delete_photo') return deletePhoto_(user, body);
      if (action === 'delete_incident') return deleteIncident_(user, body);
      if (action === 'restore_incident') return restoreIncident_(user, body);
      if (action === 'admin_deleted') return { ok: true, incidents: readSheet_(CFG.SHEET_SUCO, COLS_SUCO).filter(function (r) { return r.trang_thai === 'da_xoa'; }).map(toClient_) };
      if (action === 'admin_users') return { ok: true, users: readSheet_(CFG.SHEET_USER, COLS_USER).map(function (u) { return { username: u.ten_dang_nhap, ho_ten: u.ho_ten, don_vi: u.don_vi, vai_tro: u.vai_tro, trang_thai: u.trang_thai, ngay_tao: u.ngay_tao }; }) };
      if (action === 'admin_user_save') return adminSaveUser_(user, body);
    }
    throw err_('UNKNOWN_ACTION', 'Thao tác không hợp lệ');
  });
}

function handle_(fn) {
  var out;
  try { out = fn(); }
  catch (x) {
    out = { ok: false, code: x.code || 'SERVER_ERROR', message: x.code ? x.message : ('Lỗi máy chủ: ' + (x && x.message)) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function err_(code, message) { var e = new Error(message); e.code = code; return e; }

// ======================= ĐĂNG NHẬP, PHÂN QUYỀN =======================
function login_(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!username || !password) throw err_('BAD_LOGIN', 'Nhập tên đăng nhập và mật khẩu');
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= CFG.MAX_FAIL) throw err_('LOCKED', 'Sai mật khẩu quá ' + CFG.MAX_FAIL + ' lần. Thử lại sau ' + CFG.LOCK_MINUTES + ' phút.');
  var u = findUser_(username);
  if (!u || u.trang_thai !== 'hoat_dong' || hash_(u.salt, password) !== u.mat_khau_hash) {
    cache.put(failKey, String(fails + 1), CFG.LOCK_MINUTES * 60);
    throw err_('BAD_LOGIN', 'Sai tên đăng nhập hoặc mật khẩu');
  }
  cache.remove(failKey);
  var exp = Date.now() + CFG.TOKEN_DAYS * 86400000;
  var payload = u.ten_dang_nhap + '|' + exp;
  var token = Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
  return { ok: true, token: token, expires: new Date(exp).toISOString(), user: publicUser_(u) };
}

function auth_(token) {
  if (!token) throw err_('AUTH_REQUIRED', 'Cần đăng nhập để thực hiện thao tác này');
  var parts = String(token).split('.');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); }
  catch (x) { throw err_('AUTH_INVALID', 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại'); }
  if (parts.length !== 2 || sign_(payload) !== parts[1]) throw err_('AUTH_INVALID', 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại');
  var bits = payload.split('|');
  if (Number(bits[1]) < Date.now()) throw err_('AUTH_EXPIRED', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  var u = findUser_(bits[0]);
  if (!u || u.trang_thai !== 'hoat_dong') throw err_('AUTH_INVALID', 'Tài khoản không còn hoạt động');
  return u;
}

function sign_(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!secret) throw err_('NOT_SETUP', 'Hệ thống chưa được khởi tạo (chạy khoiTaoHeThong)');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

function hash_(salt, password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function publicUser_(u) { return { username: u.ten_dang_nhap, ho_ten: u.ho_ten, don_vi: u.don_vi, vai_tro: u.vai_tro }; }
function isManager_(u) { return u.vai_tro === 'quan_ly' || u.vai_tro === 'admin'; }

function findUser_(username) {
  var rows = readSheet_(CFG.SHEET_USER, COLS_USER);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].ten_dang_nhap).toLowerCase() === String(username).toLowerCase()) return rows[i];
  return null;
}

// ======================= ẢNH =======================
function uploadPhoto_(user, body) {
  var data = String(body.data || '');
  var mime = String(body.mime || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) throw err_('BAD_PHOTO', 'Chỉ nhận file ảnh (JPEG, PNG, WEBP, HEIC)');
  var bytes;
  try { bytes = Utilities.base64Decode(data); } catch (x) { throw err_('BAD_PHOTO', 'Dữ liệu ảnh bị lỗi'); }
  if (!bytes.length) throw err_('BAD_PHOTO', 'Ảnh rỗng');
  if (bytes.length > CFG.MAX_PHOTO_BYTES) throw err_('PHOTO_TOO_LARGE', 'Ảnh quá lớn (tối đa 8 MB)');
  var root = getRootFolder_();
  var sub = body.incidentId ? getSubFolder_(root, String(body.incidentId)) : getSubFolder_(root, '_cho_gan_su_co');
  var name = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmmss') + '_' + user.ten_dang_nhap + '_' + String(body.filename || 'anh.jpg').replace(/[^\w.\-]/g, '_');
  var file = sub.createFile(Utilities.newBlob(bytes, mime, name));
  var shared = true;
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (x) { shared = false; }
  var id = file.getId();
  return { ok: true, fileId: id, url: 'https://drive.google.com/file/d/' + id + '/view', thumb: thumb_(id), shared: shared };
}

function thumb_(id) { return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000'; }

function getRootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) { } }
  var f = DriveApp.createFolder(CFG.FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('FOLDER_ID', f.getId());
  return f;
}

function getSubFolder_(root, name) {
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function moveFilesToIncident_(fileIds, incidentId) {
  if (!fileIds.length) return;
  var sub = getSubFolder_(getRootFolder_(), incidentId);
  fileIds.forEach(function (id) { try { DriveApp.getFileById(id).moveTo(sub); } catch (x) { } });
}

function cleanPhotos_(photos, user) {
  var out = [];
  (photos || []).forEach(function (p) {
    var id = String((p && p.fileId) || '');
    if (!/^[\w-]{10,}$/.test(id)) return;
    out.push({ id: id, giai_doan: GIAI_DOAN.indexOf(p.giai_doan) >= 0 ? p.giai_doan : 'dien_bien', thoi_gian: nowIso_(), nguoi: user.ho_ten || user.ten_dang_nhap });
  });
  return out.slice(0, 20);
}

// ======================= SỰ CỐ =======================
function createIncident_(user, body) {
  var d = body.data || {};
  var lat = Number(d.lat), lng = Number(d.lng);
  if (!isFinite(lat) || !isFinite(lng) || lat < 8 || lat > 24 || lng < 102 || lng > 118) throw err_('BAD_LOCATION', 'Tọa độ không hợp lệ');
  if (LOAI.indexOf(d.loai) < 0) throw err_('BAD_DATA', 'Chưa chọn loại sự cố');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dup = findByRequestId_(body.clientRequestId);
    if (dup) return { ok: true, duplicate: true, incident: getIncident_(dup.ma_su_co) };
    var now = nowIso_();
    var photos = cleanPhotos_(body.photos, user).map(function (p) { p.giai_doan = 'ban_dau'; return p; });
    var inc = {
      id: nextId_(), trang_thai: 'dang_xay_ra', loai: d.loai,
      muc_do: MUC_DO.indexOf(d.muc_do) >= 0 ? d.muc_do : 'trung_binh',
      giao_thong: GIAO_THONG.indexOf(d.giao_thong) >= 0 ? d.giao_thong : 'han_che',
      lat: lat.toFixed(6), lng: lng.toFixed(6), tuyen: str_(d.tuyen, 120), dia_gioi: str_(d.dia_gioi, 120),
      huong_tuyen: str_(d.huong_tuyen, 200), mo_ta: str_(d.mo_ta, 2000),
      thoi_gian_phat_hien: isoOr_(d.thoi_gian_phat_hien, now), thoi_gian_tao: now,
      nguoi_tao: user.ten_dang_nhap, ho_ten_nguoi_tao: user.ho_ten, don_vi_nguoi_tao: user.don_vi,
      thoi_gian_cap_nhat: now, nguoi_cap_nhat: user.ten_dang_nhap, ho_ten_nguoi_cap_nhat: user.ho_ten,
      don_vi_phu_trach: '', bien_phap_xu_ly: '', bat_dau_xu_ly: '', ket_thuc_xu_ly: '', ghi_chu_kiem_tra: '', tai_lieu: '',
      da_xac_nhan: '', nguoi_xac_nhan: '', thoi_gian_xac_nhan: '', thoi_gian_ket_thuc: '',
      anh: JSON.stringify(photos), nguon: 'Cán bộ cập nhật hiện trường', so_lan_cap_nhat: '1'
    };
    appendRow_(CFG.SHEET_SUCO, COLS_SUCO, inc);
    addHistory_(inc.id, user, 'tao', '', 'dang_xay_ra', pick_(inc, ['loai', 'muc_do', 'giao_thong', 'tuyen', 'dia_gioi', 'huong_tuyen', 'mo_ta', 'lat', 'lng']), '', photos, body.clientRequestId);
    moveFilesToIncident_(photos.map(function (p) { return p.id; }), inc.id);
    return { ok: true, incident: toClient_(inc) };
  } finally { lock.releaseLock(); }
}

function updateIncident_(user, body) {
  var id = String(body.id || '');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dup = findByRequestId_(body.clientRequestId);
    if (dup) return { ok: true, duplicate: true, incident: getIncident_(dup.ma_su_co) };
    var sh = sheet_(CFG.SHEET_SUCO, COLS_SUCO);
    var rows = readSheet_(CFG.SHEET_SUCO, COLS_SUCO);
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) { idx = i; break; }
    if (idx < 0) throw err_('NOT_FOUND', 'Không tìm thấy sự cố ' + id);
    var inc = rows[idx];
    var before = inc.trang_thai;
    var mgr = isManager_(user);
    var action = 'cap_nhat';
    var changes = {};

    if (before === 'da_ket_thuc' && !(body.reopen && user.vai_tro === 'admin')) throw err_('CLOSED', 'Sự cố đã kết thúc, chỉ quản trị viên được mở lại');

    if (inc.trang_thai === 'da_xoa') throw err_('DELETED', 'Sự cố đã bị xóa');
    var d = body.data || {};
    var allowed = FIELDS_TUAN_TRA.concat(mgr || inc.nguoi_tao === user.ten_dang_nhap ? FIELDS_GOC : [], mgr ? FIELDS_QUAN_LY : []);
    Object.keys(d).forEach(function (k) {
      if (allowed.indexOf(k) < 0) return;
      var v = d[k];
      if (k === 'loai' && LOAI.indexOf(v) < 0) return;
      if (k === 'muc_do' && MUC_DO.indexOf(v) < 0) return;
      if (k === 'giao_thong' && GIAO_THONG.indexOf(v) < 0) return;
      if (k === 'lat' || k === 'lng') { v = Number(v); if (!isFinite(v)) return; v = v.toFixed(6); }
      else if (k === 'bat_dau_xu_ly' || k === 'ket_thuc_xu_ly' || k === 'thoi_gian_phat_hien') v = v ? isoOr_(v, '') : '';
      else v = str_(v, k === 'mo_ta' || k === 'ghi_chu_kiem_tra' || k === 'bien_phap_xu_ly' ? 2000 : 300);
      if (String(inc[k]) !== String(v)) { changes[k] = v; inc[k] = v; }
    });

    var newStatus = body.status;
    if (body.reopen && user.vai_tro === 'admin' && before === 'da_ket_thuc') {
      newStatus = newStatus && newStatus !== 'da_ket_thuc' ? newStatus : 'dang_xu_ly';
      action = 'mo_lai';
    }
    if (newStatus && newStatus !== inc.trang_thai) {
      if (TRANG_THAI.indexOf(newStatus) < 0) throw err_('BAD_STATUS', 'Trạng thái không hợp lệ');
      if (newStatus === 'da_ket_thuc' && !mgr) throw err_('FORBIDDEN', 'Chỉ cán bộ quản lý được kết thúc sự cố');
      inc.trang_thai = newStatus;
      if (action !== 'mo_lai') action = newStatus === 'da_ket_thuc' ? 'ket_thuc' : 'doi_trang_thai';
      if (newStatus === 'da_ket_thuc') { inc.thoi_gian_ket_thuc = nowIso_(); if (!inc.ket_thuc_xu_ly) inc.ket_thuc_xu_ly = inc.thoi_gian_ket_thuc; }
      if (newStatus === 'dang_xu_ly' && !inc.bat_dau_xu_ly) inc.bat_dau_xu_ly = nowIso_();
      if (newStatus === 'da_khac_phuc' && !inc.ket_thuc_xu_ly) inc.ket_thuc_xu_ly = nowIso_();
      if (action === 'mo_lai') inc.thoi_gian_ket_thuc = '';
    }
    if (body.confirm) {
      if (!mgr) throw err_('FORBIDDEN', 'Chỉ cán bộ quản lý được xác nhận sự cố');
      if (inc.da_xac_nhan !== 'co') {
        inc.da_xac_nhan = 'co'; inc.nguoi_xac_nhan = user.ho_ten || user.ten_dang_nhap; inc.thoi_gian_xac_nhan = nowIso_();
        if (action === 'cap_nhat') action = 'xac_nhan';
        changes.da_xac_nhan = 'co';
      }
    }
    var photos = cleanPhotos_(body.photos, user);
    if (photos.length) {
      var all = parseJson_(inc.anh, []);
      inc.anh = JSON.stringify(all.concat(photos));
      if (action === 'cap_nhat' && !Object.keys(changes).length) action = 'them_anh';
    }
    var note = str_(body.note, 2000);
    if (!Object.keys(changes).length && !photos.length && !note && inc.trang_thai === before && !body.confirm) {
      throw err_('NO_CHANGE', 'Chưa có nội dung cập nhật');
    }
    inc.thoi_gian_cap_nhat = nowIso_();
    inc.nguoi_cap_nhat = user.ten_dang_nhap;
    inc.ho_ten_nguoi_cap_nhat = user.ho_ten;
    inc.so_lan_cap_nhat = String(Number(inc.so_lan_cap_nhat || 1) + 1);

    var rowValues = [COLS_SUCO.map(function (c) { return safe_(inc[c]); })];
    sh.getRange(idx + 2, 1, 1, COLS_SUCO.length).setValues(rowValues);
    addHistory_(inc.id, user, action, before, inc.trang_thai, changes, note, photos, body.clientRequestId);
    moveFilesToIncident_(photos.map(function (p) { return p.id; }), inc.id);
    return { ok: true, incident: toClient_(inc) };
  } finally { lock.releaseLock(); }
}

function listIncidents_(all) {
  var rows = readSheet_(CFG.SHEET_SUCO, COLS_SUCO);
  var cutoff = Date.now() - CFG.ENDED_DAYS_DEFAULT * 86400000;
  var out = rows.filter(function (r) {
    if (!r.id || r.trang_thai === 'da_xoa') return false;
    if (all || r.trang_thai !== 'da_ket_thuc') return true;
    var t = Date.parse(r.thoi_gian_ket_thuc || r.thoi_gian_cap_nhat);
    return !isFinite(t) || t >= cutoff;
  }).map(toClient_);
  return { ok: true, incidents: out, serverTime: nowIso_(), endedDays: all ? null : CFG.ENDED_DAYS_DEFAULT };
}

function getIncident_(id) {
  var rows = readSheet_(CFG.SHEET_SUCO, COLS_SUCO);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return toClient_(rows[i]);
  return null;
}

function getHistory_(id) {
  if (!id) throw err_('BAD_DATA', 'Thiếu mã sự cố');
  var rows = readSheet_(CFG.SHEET_LICHSU, COLS_LICHSU).filter(function (r) { return r.ma_su_co === id; });
  var removed = {};
  rows.forEach(function (r) { if (r.hanh_dong === 'xoa_anh') (parseJson_(r.noi_dung, {}).anh_da_xoa || []).forEach(function (x) { removed[x] = true; }); });
  return {
    ok: true, id: id, items: rows.map(function (r) {
      return {
        ma_cap_nhat: r.ma_cap_nhat, thoi_gian: r.thoi_gian, nguoi: r.nguoi, ho_ten: r.ho_ten, vai_tro: r.vai_tro,
        hanh_dong: r.hanh_dong, trang_thai_truoc: r.trang_thai_truoc, trang_thai_sau: r.trang_thai_sau,
        noi_dung: parseJson_(r.noi_dung, {}), ghi_chu: r.ghi_chu,
        anh: parseJson_(r.anh, []).map(function (p) { p.thumb = thumb_(p.id); p.url = 'https://drive.google.com/file/d/' + p.id + '/view'; if (removed[p.id]) p.da_xoa = true; return p; })
      };
    })
  };
}

function toClient_(r) {
  var o = {};
  COLS_SUCO.forEach(function (c) { o[c] = r[c] === undefined ? '' : String(r[c]); });
  o.lat = Number(o.lat); o.lng = Number(o.lng);
  o.so_lan_cap_nhat = Number(o.so_lan_cap_nhat || 1);
  o.anh = parseJson_(o.anh, []).map(function (p) { p.thumb = thumb_(p.id); p.url = 'https://drive.google.com/file/d/' + p.id + '/view'; return p; });
  return o;
}

function addHistory_(id, user, action, before, after, changes, note, photos, reqId) {
  appendRow_(CFG.SHEET_LICHSU, COLS_LICHSU, {
    ma_cap_nhat: 'CN-' + Utilities.getUuid().slice(0, 8), ma_su_co: id, thoi_gian: nowIso_(),
    nguoi: user.ten_dang_nhap, ho_ten: user.ho_ten, vai_tro: user.vai_tro, hanh_dong: action,
    trang_thai_truoc: before || '', trang_thai_sau: after || '', noi_dung: JSON.stringify(changes || {}),
    ghi_chu: note || '', anh: JSON.stringify(photos || []), client_request_id: str_(reqId, 80)
  });
}

function findByRequestId_(reqId) {
  if (!reqId) return null;
  var rows = readSheet_(CFG.SHEET_LICHSU, COLS_LICHSU);
  for (var i = rows.length - 1; i >= 0; i--) if (rows[i].client_request_id === String(reqId)) return rows[i];
  return null;
}

function nextId_() {
  var day = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd');
  var prefix = 'SC-' + day + '-';
  var max = 0;
  readSheet_(CFG.SHEET_SUCO, COLS_SUCO).forEach(function (r) {
    if (String(r.id).indexOf(prefix) === 0) max = Math.max(max, Number(String(r.id).slice(prefix.length)) || 0);
  });
  return prefix + ('00' + (max + 1)).slice(-3);
}

// ======================= SHEET TIỆN ÍCH =======================
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw err_('NOT_SETUP', 'Hệ thống chưa được khởi tạo (chạy hàm khoiTaoHeThong trong Apps Script)');
  return ss;
}

function sheet_(name, cols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1000, cols.length).setNumberFormat('@');
  }
  return sh;
}

// ======================= QUẢN TRỊ VIÊN =======================
function findIncidentRow_(id) {
  var rows = readSheet_(CFG.SHEET_SUCO, COLS_SUCO);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return { idx: i, inc: rows[i] };
  throw err_('NOT_FOUND', 'Không tìm thấy sự cố ' + id);
}
function saveIncidentRow_(idx, inc, user) {
  inc.thoi_gian_cap_nhat = nowIso_(); inc.nguoi_cap_nhat = user.ten_dang_nhap; inc.ho_ten_nguoi_cap_nhat = user.ho_ten;
  inc.so_lan_cap_nhat = String(Number(inc.so_lan_cap_nhat || 1) + 1);
  sheet_(CFG.SHEET_SUCO, COLS_SUCO).getRange(idx + 2, 1, 1, COLS_SUCO.length).setValues([COLS_SUCO.map(function (c) { return safe_(inc[c]); })]);
}

function deletePhoto_(user, body) {
  var note = str_(body.note, 500);
  if (!note) throw err_('BAD_DATA', 'Nhập lý do xóa ảnh');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = findIncidentRow_(String(body.id || '')), inc = f.inc;
    var fid = String(body.fileId || '');
    var photos = parseJson_(inc.anh, []);
    var keep = photos.filter(function (p) { return p.id !== fid; });
    if (keep.length === photos.length) throw err_('NOT_FOUND', 'Ảnh không còn trong hồ sơ');
    inc.anh = JSON.stringify(keep);
    var trashed = true;
    try { DriveApp.getFileById(fid).setTrashed(true); } catch (x) { trashed = false; }
    saveIncidentRow_(f.idx, inc, user);
    addHistory_(inc.id, user, 'xoa_anh', inc.trang_thai, inc.trang_thai, { anh_da_xoa: [fid] }, note, [], body.clientRequestId);
    return { ok: true, trashed: trashed, incident: toClient_(inc) };
  } finally { lock.releaseLock(); }
}

function deleteIncident_(user, body) {
  var note = str_(body.note, 500);
  if (!note) throw err_('BAD_DATA', 'Nhập lý do xóa sự cố');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = findIncidentRow_(String(body.id || '')), inc = f.inc;
    if (inc.trang_thai === 'da_xoa') throw err_('DELETED', 'Sự cố đã bị xóa trước đó');
    var before = inc.trang_thai;
    inc.trang_thai = 'da_xoa';
    saveIncidentRow_(f.idx, inc, user);
    addHistory_(inc.id, user, 'xoa_su_co', before, 'da_xoa', {}, note, [], body.clientRequestId);
    return { ok: true, id: inc.id };
  } finally { lock.releaseLock(); }
}

function restoreIncident_(user, body) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = findIncidentRow_(String(body.id || '')), inc = f.inc;
    if (inc.trang_thai !== 'da_xoa') throw err_('BAD_STATUS', 'Sự cố không ở trạng thái đã xóa');
    var prev = 'dang_xu_ly';
    readSheet_(CFG.SHEET_LICHSU, COLS_LICHSU).forEach(function (r) { if (r.ma_su_co === inc.id && r.hanh_dong === 'xoa_su_co' && TRANG_THAI.indexOf(r.trang_thai_truoc) >= 0) prev = r.trang_thai_truoc; });
    inc.trang_thai = prev;
    saveIncidentRow_(f.idx, inc, user);
    addHistory_(inc.id, user, 'khoi_phuc', 'da_xoa', prev, {}, str_(body.note, 500), [], body.clientRequestId);
    return { ok: true, incident: toClient_(inc) };
  } finally { lock.releaseLock(); }
}

function adminSaveUser_(admin, body) {
  var u = body.user || {};
  var name = String(u.username || '').trim().toLowerCase();
  var existing = findUser_(name);
  if (name === admin.ten_dang_nhap && ((u.vai_tro && u.vai_tro !== 'admin') || (u.trang_thai && u.trang_thai !== 'hoat_dong'))) {
    throw err_('FORBIDDEN', 'Không tự hạ quyền hoặc tự khóa tài khoản quản trị của chính mình');
  }
  if (u.trang_thai && ['hoat_dong', 'khoa'].indexOf(u.trang_thai) < 0) throw err_('BAD_DATA', 'Trạng thái không hợp lệ');
  if (!existing) {
    if (!u.password) throw err_('BAD_DATA', 'Tài khoản mới cần mật khẩu');
    themNguoiDung(name, u.password, str_(u.ho_ten, 100), str_(u.don_vi, 150), u.vai_tro);
  } else {
    var pw = u.password ? String(u.password) : null;
    var vt = u.vai_tro || existing.vai_tro;
    if (VAI_TRO.indexOf(vt) < 0) throw err_('BAD_DATA', 'Vai trò phải là tuan_tra, quan_ly hoặc admin');
    if (pw !== null && pw.length < 6) throw err_('BAD_DATA', 'Mật khẩu tối thiểu 6 ký tự');
    var rows = readSheet_(CFG.SHEET_USER, COLS_USER);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].ten_dang_nhap !== name) continue;
      var r = rows[i];
      r.ho_ten = u.ho_ten !== undefined ? str_(u.ho_ten, 100) : r.ho_ten;
      r.don_vi = u.don_vi !== undefined ? str_(u.don_vi, 150) : r.don_vi;
      r.vai_tro = vt;
      r.trang_thai = u.trang_thai || r.trang_thai;
      if (pw !== null) { r.salt = Utilities.getUuid(); r.mat_khau_hash = hash_(r.salt, pw); }
      sheet_(CFG.SHEET_USER, COLS_USER).getRange(i + 2, 1, 1, COLS_USER.length).setValues([COLS_USER.map(function (c) { return safe_(r[c]); })]);
      break;
    }
  }
  var saved = findUser_(name);
  return { ok: true, user: { username: saved.ten_dang_nhap, ho_ten: saved.ho_ten, don_vi: saved.don_vi, vai_tro: saved.vai_tro, trang_thai: saved.trang_thai } };
}

function readSheet_(name, cols) {
  var sh = sheet_(name, cols);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
  return vals.map(function (row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] === null || row[i] === undefined ? '' : row[i]); });
    return o;
  });
}

function appendRow_(name, cols, obj) {
  var sh = sheet_(name, cols);
  var row = sh.getLastRow() + 1;
  var rng = sh.getRange(row, 1, 1, cols.length);
  rng.setNumberFormat('@');
  rng.setValues([cols.map(function (c) { return safe_(obj[c]); })]);
}

// Chống chèn công thức vào bảng tính
function safe_(v) {
  var s = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function str_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 300); }
function nowIso_() { return new Date().toISOString(); }
function isoOr_(v, fallback) { var t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : fallback; }
function parseJson_(s, fb) { try { var v = JSON.parse(s); return v === null || v === undefined ? fb : v; } catch (x) { return fb; } }
function pick_(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== '' && o[k] !== undefined) r[k] = o[k]; }); return r; }

// ======================= QUẢN TRỊ (chạy trong Google Sheet) =======================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🗺 Bản đồ sự cố')
    .addItem('1. Khởi tạo hệ thống', 'khoiTaoHeThong')
    .addItem('2. Thêm / đặt lại mật khẩu người dùng', 'menuThemNguoiDung')
    .addItem('3. Khóa / mở khóa người dùng', 'menuKhoaNguoiDung')
    .addItem('4. Tạo tài khoản từ trang TaoTaiKhoan', 'taoTaiKhoan')
    .addToUi();
}

function khoiTaoHeThong() {
  var props = PropertiesService.getScriptProperties();
  // Tìm bảng tính chứa dữ liệu: bảng tính đang gắn với mã > bảng tính đã tạo trước đó > tạo mới
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (x) { ss = null; }
  var oldId = props.getProperty('SHEET_ID');
  if (!ss && oldId) { try { ss = SpreadsheetApp.openById(oldId); } catch (x) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.create('Du lieu su co hien truong');
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  sheet_(CFG.SHEET_SUCO, COLS_SUCO);
  sheet_(CFG.SHEET_LICHSU, COLS_LICHSU);
  sheet_(CFG.SHEET_USER, COLS_USER);
  var tk = sheet_(SHEET_TAO, COLS_TAO);
  if (tk.getLastRow() < 2) tk.getRange(2, 1, 1, COLS_TAO.length).setValues([['vi_du.tuantra', '(nhập mật khẩu)', 'Nguyễn Văn A', 'Đội tuần đường số 1', 'tuan_tra', '← Dòng mẫu: sửa lại hoặc xóa đi']]);
  var folder = getRootFolder_();
  var msg = 'ĐÃ KHỞI TẠO XONG.\n' +
    'Bảng dữ liệu (mở link này): ' + ss.getUrl() + '\n' +
    'Thư mục ảnh trên Google Drive: ' + folder.getUrl();
  Logger.log(msg); console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (x) { }
  return msg;
}

// Tạo tài khoản hàng loạt: nhập vào trang tính "TaoTaiKhoan" rồi chạy hàm này trong Apps Script.
// Mật khẩu được mã hóa vào trang NguoiDung và XÓA khỏi trang TaoTaiKhoan ngay sau khi tạo.
var SHEET_TAO = 'TaoTaiKhoan';
var COLS_TAO = ['ten_dang_nhap', 'mat_khau', 'ho_ten', 'don_vi', 'vai_tro', 'ket_qua'];
function taoTaiKhoan() {
  var sh = sheet_(SHEET_TAO, COLS_TAO);
  var rows = readSheet_(SHEET_TAO, COLS_TAO);
  var log = [];
  rows.forEach(function (r, i) {
    if (!r.ten_dang_nhap || !r.mat_khau || r.mat_khau === '(nhập mật khẩu)') return;
    var kq;
    try { kq = themNguoiDung(r.ten_dang_nhap, r.mat_khau, r.ho_ten, r.don_vi, String(r.vai_tro).trim()); }
    catch (x) { kq = 'LỖI: ' + x.message; }
    if (kq.indexOf('LỖI') !== 0) sh.getRange(i + 2, 2).setValue('(đã mã hóa, đã xóa)');
    sh.getRange(i + 2, 6).setValue(kq);
    log.push(kq);
  });
  var msg = log.length ? log.join('\n') : 'Chưa có dòng nào cần tạo. Nhập tên đăng nhập và mật khẩu vào trang TaoTaiKhoan.';
  Logger.log(msg); console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (x) { }
  return msg;
}

/** Tạo hoặc đặt lại mật khẩu người dùng (gọi từ menu hoặc từ hàm khác). */
function themNguoiDung(tenDangNhap, matKhau, hoTen, donVi, vaiTro) {
  tenDangNhap = String(tenDangNhap || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(tenDangNhap)) throw new Error('Tên đăng nhập 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch');
  if (String(matKhau || '').length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
  if (VAI_TRO.indexOf(vaiTro) < 0) throw new Error('Vai trò phải là: tuan_tra, quan_ly hoặc admin');
  var sh = sheet_(CFG.SHEET_USER, COLS_USER);
  var rows = readSheet_(CFG.SHEET_USER, COLS_USER);
  var salt = Utilities.getUuid();
  var rec = { ten_dang_nhap: tenDangNhap, ho_ten: hoTen || tenDangNhap, don_vi: donVi || '', vai_tro: vaiTro, salt: salt, mat_khau_hash: hash_(salt, matKhau), trang_thai: 'hoat_dong', ngay_tao: nowIso_() };
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].ten_dang_nhap === tenDangNhap) {
      sh.getRange(i + 2, 1, 1, COLS_USER.length).setValues([COLS_USER.map(function (c) { return safe_(rec[c]); })]);
      return 'Đã cập nhật người dùng ' + tenDangNhap;
    }
  }
  appendRow_(CFG.SHEET_USER, COLS_USER, rec);
  return 'Đã tạo người dùng ' + tenDangNhap;
}

function menuThemNguoiDung() {
  var ui = SpreadsheetApp.getUi();
  var ask = function (t) { var r = ui.prompt(t, ui.ButtonSet.OK_CANCEL); if (r.getSelectedButton() !== ui.Button.OK) throw new Error('Đã hủy'); return r.getResponseText().trim(); };
  try {
    var u = ask('Tên đăng nhập (không dấu, ví dụ: nva.tuantra):');
    var p = ask('Mật khẩu (tối thiểu 6 ký tự):');
    var h = ask('Họ và tên:');
    var d = ask('Đơn vị (ví dụ: Đội tuần đường số 1):');
    var v = ask('Vai trò: gõ  tuan_tra  hoặc  quan_ly  hoặc  admin');
    ui.alert(themNguoiDung(u, p, h, d, v));
  } catch (x) { ui.alert(String(x.message || x)); }
}

function menuKhoaNguoiDung() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Tên đăng nhập cần khóa/mở khóa:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var name = r.getResponseText().trim().toLowerCase();
  var sh = sheet_(CFG.SHEET_USER, COLS_USER);
  var rows = readSheet_(CFG.SHEET_USER, COLS_USER);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].ten_dang_nhap === name) {
      var nv = rows[i].trang_thai === 'hoat_dong' ? 'khoa' : 'hoat_dong';
      sh.getRange(i + 2, COLS_USER.indexOf('trang_thai') + 1).setValue(nv);
      ui.alert('Người dùng ' + name + ': ' + (nv === 'khoa' ? 'đã khóa' : 'đã mở khóa'));
      return;
    }
  }
  ui.alert('Không tìm thấy người dùng ' + name);
}
