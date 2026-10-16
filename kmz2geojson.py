"""Chuyển dữ liệu PCTT (bão lũ) từ KMZ sang GeoJSON cho hệ thống bản đồ Leaflet.

Cách dùng:  python3 kmz2geojson.py <file.kmz | doc.kml> <PCTT_BaoLu.geojson> [DT.geojson]

- Giữ nguyên văn bản gốc trong bảng mô tả KMZ (thuộc tính "thong_tin").
- Không suy diễn: trường chưa có dữ liệu để trống.
- Ghi báo cáo đối soát ra stdout.
"""
import json, re, sys, zipfile, math, os
from collections import OrderedDict, Counter
from lxml import etree, html

SRC, OUT = sys.argv[1], sys.argv[2]
DT_GEOJSON = sys.argv[3] if len(sys.argv) > 3 else None

if SRC.lower().endswith('.kmz'):
    with zipfile.ZipFile(SRC) as z:
        kml_name = [n for n in z.namelist() if n.lower().endswith('.kml')][0]
        root = etree.fromstring(z.read(kml_name))
else:
    root = etree.parse(SRC).getroot()
NS = {'k': root.nsmap.get(None)}
SRC_LABEL = os.environ.get('KMZ_LABEL') or SRC.replace('\\', '/').split('/')[-1]


def txt(e, tag):
    v = e.findtext('k:' + tag, namespaces=NS)
    return v.strip() if v else ''


def folder_path(e):
    p = []
    while e is not None:
        if etree.QName(e).localname in ('Folder', 'Document'):
            n = e.find('k:name', NS)
            p.append(n.text.strip() if n is not None and n.text else '')
        e = e.getparent()
    return list(reversed(p[:-1]))  # bỏ Document gốc


ROUTE_RE = re.compile(r'^(QL|ĐT|DT)\s*\.?\s*(\d+[A-Za-z]?)$')


def norm_route(name):
    s = re.sub(r'\s+', ' ', name).strip()
    m = ROUTE_RE.match(s)
    if m:
        kind = 'QL' if m.group(1) == 'QL' else 'ĐT'
        return f'{kind}.{m.group(2).upper()}'
    return s


def norm_key(s):
    s = s.lower().replace('–', '-').replace('—', '-')
    s = re.sub(r'^đoạn\s+', '', s.strip())
    s = re.sub(r'\s+', '', s)
    return s


def coords_of(pm):
    c = pm.findtext('.//k:coordinates', namespaces=NS) or ''
    out = []
    for t in c.split():
        v = t.split(',')
        if len(v) >= 2:
            out.append([round(float(v[0]), 7), round(float(v[1]), 7)])
    return out


def parse_table(d):
    t = html.fromstring(d)
    kv = OrderedDict()
    for tr in t.xpath('//tr'):
        tds = tr.xpath('./td')
        if len(tds) >= 2:
            kv[tds[0].text_content().strip()] = re.sub(r'\s+', ' ', tds[1].text_content()).strip()
    return kv


def classify(path):
    leaf = ' / '.join(path).lower()
    if path and path[0].startswith('Ghi chú'):
        return None
    if 'ghi chú vị trí' in leaf:
        return None
    if 'cọc hiện trạng' in leaf:
        return 'coc_h'
    if 'điểm nguy hiểm' in leaf:
        return 'nguy_hiem'
    if path[-1].lower().endswith('.kmz'):
        return 'tuyen_chinh'   # tuyến chính (kể cả "Tuyến tránh Tiên Kỳ.kmz" là tuyến đường, không phải phương án phân luồng)
    if 'tập kết' in leaf:
        return 'tap_ket'
    if 'tuyến tránh' in leaf:
        return 'tuyen_tranh'
    if 'tuyến chính' in leaf or leaf.endswith('.kmz') or True:
        return 'tuyen_chinh'


def route_of(path, section):
    # path[0] = 'Bão Lũ Theo Tuyến' (mục chính)  hoặc  'Cọc H...' / 'Bão Lũ (Cọc H...)' / 'Bão Lũ Theo Tuyến'
    p = path[1:] if section == 'main' else path[3:]
    if not p:
        return ''
    if p[0].startswith('Các tuyến Nội thị'):
        if len(p) > 1 and 'tập kết' not in p[1].lower():
            return norm_route(p[1])
        return 'Các tuyến nội thị'
    return norm_route(p[0])


features = []
report = Counter()
hazard_index = {}   # (route, key) -> feature
pending_lines = []
main_lines = []
seen = set()

for pm in root.findall('.//k:Placemark', NS):
    path = folder_path(pm)
    if not path:
        continue
    section = 'coc' if path[0].startswith('Cọc H') else 'main'
    group = classify(path)
    if group is None:
        report['bo_qua_chu_giai'] += 1
        continue
    name = re.sub(r'\s+', ' ', txt(pm, 'name'))
    desc = pm.findtext('k:description', namespaces=NS) or ''
    is_point = pm.find('.//k:Point', NS) is not None
    coords = coords_of(pm)
    route = route_of(path, section)
    if not coords:
        report['khong_toa_do'] += 1
        continue

    if group == 'tuyen_chinh':
        main_lines.append((route, name, coords))
        continue

    # Khử trùng lặp giữa mục chính và mục "Cọc H" (cùng tên + cùng tọa độ)
    sig = (group if group != 'coc_h' else 'x', name, tuple(map(tuple, coords[:2])))
    if sig in seen:
        report['trung_lap_bo_qua'] += 1
        continue
    seen.add(sig)

    props = OrderedDict()
    props['nhom'] = group
    props['tuyen'] = route
    props['ten'] = name
    if group == 'nguy_hiem' and section == 'coc' and '<table' not in desc:
        # điểm tham chiếu thực tế (ví dụ "CS 85 ĐT 602 thực tế") nằm trong mục cọc H nội thị
        props['nhom'] = group = 'coc_h'

    if group == 'nguy_hiem' and not is_point and 'tuyến tránh' in name.lower():
        # tuyến tránh được đặt trong thư mục "Điểm nguy hiểm" (các tuyến nội thị)
        props['nhom'] = group = 'tuyen_tranh'

    if group == 'nguy_hiem':
        if section == 'coc':
            report['nguy_hiem_chi_co_o_muc_coc_H'] += 1
            print('  [!] Điểm nguy hiểm chỉ có ở mục Cọc H:', route, name)
        if is_point or '<table' in desc:
            kv = parse_table(desc) if '<table' in desc else OrderedDict()
            parts = [x.strip() for x in name.split('|')]
            props['ly_trinh'] = kv.get('Lý trình', parts[0])
            props['phan_loai'] = kv.get('Phân loại') or (parts[1] if len(parts) > 1 else '')
            if props['phan_loai'] == 'Sạc lở':
                props['phan_loai'] = 'Sạt lở'
            props['danh_gia_nguy_co'] = kv.get('Đánh giá nguy cơ', '')
            props['dia_phuong'] = kv.get('Địa phương', '')
            props['thong_tin'] = kv          # nguyên văn bảng mô tả KMZ
            # Các trường quản lý xử lý ngập úng: để trống, chỉ điền khi có hồ sơ
            props['giai_phap_de_xuat'] = ''
            props['ket_qua_xac_nhan'] = ''
            props['ho_so_lien_quan'] = ''
            props['ngay_cap_nhat'] = ''
            props['nguon'] = f'{SRC_LABEL} › ' + ' › '.join(path)
            geom = {'type': 'Point', 'coordinates': coords[0]} if is_point else {'type': 'LineString', 'coordinates': coords}
            f = {'type': 'Feature', 'properties': props, 'geometry': geom}
            features.append(f)
            hazard_index[(route, norm_key(parts[0]))] = f
            report['diem_nguy_hiem'] += 1
        else:
            pending_lines.append((route, name, coords, path))
        continue

    props['mo_ta'] = re.sub(r'\s+', ' ', html.fromstring(desc).text_content()).strip() if desc.strip() else ''
    props['nguon'] = f'{SRC_LABEL} › ' + ' › '.join(path)
    geom = {'type': 'Point', 'coordinates': coords[0]} if is_point else {'type': 'LineString', 'coordinates': coords}
    features.append({'type': 'Feature', 'properties': props, 'geometry': geom})
    report[group + ('_diem' if is_point else '_duong')] += 1

# Gán mã cho điểm nguy hiểm theo tuyến
counter = Counter()
for f in features:
    p = f['properties']
    if p['nhom'] == 'nguy_hiem':
        counter[p['tuyen']] += 1
        code = re.sub(r'[^A-Z0-9]', '', p['tuyen'].upper().replace('Đ', 'D'))[:10] or 'NT'
        p['ma'] = f"{code}-NH{counter[p['tuyen']]:02d}"
        # đưa 'ma' lên đầu
        f['properties'] = OrderedDict([('ma', p.pop('ma'))] + list(p.items()))

# Liên kết đoạn nguy hiểm (đường) với điểm nguy hiểm cùng lý trình
unmatched = []
for route, name, coords, path in pending_lines:
    key = norm_key(name.split('|')[0])
    f = hazard_index.get((route, key))
    props = OrderedDict([('nhom', 'doan_nguy_hiem'), ('tuyen', route), ('ten', name)])
    if f:
        props['ma_diem'] = f['properties']['ma']
        props['phan_loai'] = f['properties']['phan_loai']
        props['danh_gia_nguy_co'] = f['properties']['danh_gia_nguy_co']
    else:
        props['ma_diem'] = ''
        props['phan_loai'] = (name.split('|')[1].strip() if '|' in name else '')
        props['danh_gia_nguy_co'] = ''
        unmatched.append((route, name))
    props['nguon'] = f'{SRC_LABEL} › ' + ' › '.join(path)
    features.append({'type': 'Feature', 'properties': props,
                     'geometry': {'type': 'LineString', 'coordinates': coords}})
    report['doan_nguy_hiem'] += 1

# Thứ tự: đoạn/tuyến tránh trước (vẽ bên dưới), điểm sau
order = {'tuyen_tranh': 0, 'doan_nguy_hiem': 1, 'tap_ket': 2, 'coc_h': 3, 'nguy_hiem': 4}
features.sort(key=lambda f: order[f['properties']['nhom']])

fc = OrderedDict([
    ('type', 'FeatureCollection'),
    ('name', 'PCTT_BaoLu'),
    ('metadata', OrderedDict([
        ('nguon', SRC_LABEL),
        ('ten_tai_lieu_trong_kmz', txt(root.find('k:Document', NS), 'name') if root.find('k:Document', NS) is not None else ''),
        ('he_toa_do', 'WGS84 (EPSG:4326), kinh độ - vĩ độ'),
        ('ghi_chu', 'Thuộc tính "thong_tin" giữ nguyên văn bảng mô tả trong KMZ. '
                    'Các trường giai_phap_de_xuat, ket_qua_xac_nhan, ho_so_lien_quan, ngay_cap_nhat để trống, '
                    'chỉ điền khi có hồ sơ chứng minh.'),
    ])),
    ('features', features),
])
with open(OUT, 'w', encoding='utf-8') as fo:
    json.dump(fc, fo, ensure_ascii=False, indent=1)

print('== Thống kê ==')
for k, v in sorted(report.items()):
    print(f'  {k}: {v}')
print('  tong_feature:', len(features))
print('== Đoạn nguy hiểm chưa khớp điểm ==')
for u in unmatched:
    print('  ', u)
print('== Phân loại điểm nguy hiểm ==')
print('  ', Counter(f['properties'].get('phan_loai') for f in features if f['properties']['nhom'] == 'nguy_hiem'))
print('  ', Counter(f['properties'].get('danh_gia_nguy_co') for f in features if f['properties']['nhom'] == 'nguy_hiem'))
print('== Số điểm nguy hiểm theo tuyến ==')
print('  ', Counter(f['properties']['tuyen'] for f in features if f['properties']['nhom'] == 'nguy_hiem'))

if DT_GEOJSON:
    dt = json.load(open(DT_GEOJSON, encoding='utf-8'))
    names = {norm_route(f['properties'].get('name', '')): f for f in dt['features'] if f.get('geometry')}
    print('== Đối chiếu tuyến chính KMZ với DT.geojson ==')
    for route, name, coords in main_lines:
        key = norm_route(name.replace('Tuyến chính ', '')).replace('QL.', 'QL.')
        cand = [k for k in names if k.replace(' ', '').lower() in (key.replace(' ', '').lower(), key.replace('QL', 'Quốc Lộ ').replace('.', '').lower())]
        g = None
        for k, f in names.items():
            kk = k.lower().replace(' ', '').replace('quốclộ', 'ql.').replace('đt.', 'dt.')
            tk = key.lower().replace(' ', '').replace('đt.', 'dt.')
            if kk == tk:
                g = f
        if g is None:
            print(f'   {route:28s} {name:24s} -> KHÔNG có trong DT.geojson ({len(coords)} đỉnh)')
        else:
            gc = g['geometry']['coordinates']
            same = len(gc) == len(coords) and all(abs(a[0]-b[0]) < 1e-6 and abs(a[1]-b[1]) < 1e-6 for a, b in zip(gc, coords))
            print(f'   {route:28s} {name:24s} -> {g["properties"]["name"]:14s} {"TRÙNG KHỚP" if same else "KHÁC (" + str(len(gc)) + " vs " + str(len(coords)) + " đỉnh)"}')
