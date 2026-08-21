const KEY = 'inventario-trabajador-v1';
const STORAGE_DB = 'inventario-trabajador-db';
const states = ['Bueno', 'Regular', 'Malo'];
const $ = (id) => document.getElementById(id);
let scanner;
let editingRoomId = null;
let session = { active: false, encargados: '' };

// Jerarquía: Local (más amplio, ej. "Ciudad Universitaria") > Área (ej. una Facultad) > Ambiente (una oficina/aula/laboratorio).
const seed = {
  locals: [{ id: 'lo1', name: 'Ciudad Universitaria' }],
  areas: [{ id: 'a1', localId: 'lo1', name: 'Facultad de Arquitectura' }],
  rooms: [{ id: 'r1', areaId: 'a1', name: 'Oficina de Grados y Títulos' }, { id: 'r2', areaId: 'a1', name: 'Aula 304' }],
  assets: [
    { id: 'b1', code: '001-2026-0001', type: 'Escritorio', detail: 'Madera, 2 cajones', roomId: 'r1', state: 'Bueno' },
    { id: 'b2', code: '001-2026-0002', type: 'Silla', detail: 'Giratoria, color negro', roomId: 'r1', state: 'Regular' },
    { id: 'b3', code: '001-2026-0003', type: 'Computadora', detail: 'Core i5, 8 GB RAM', roomId: 'r2', state: 'Bueno' }
  ],
  selected: { localId: 'lo1', areaId: 'a1', roomId: 'r1' },
  hierarchyV2: true
};

let db = seed;

// Convierte datos guardados con la jerarquía antigua (Área > Local > Ambiente) a la nueva (Local > Área > Ambiente).
function migrateHierarchy(data) {
  if (!data) return data;
  if (data.hierarchyV2) return data;
  const oldShape = Array.isArray(data.areas) && Array.isArray(data.locals) && data.locals.length && 'areaId' in data.locals[0];
  if (oldShape) {
    const newLocals = data.areas.map((a) => ({ id: a.id, name: a.name }));
    const newAreas = data.locals.map((l) => ({ id: l.id, localId: l.areaId, name: l.name }));
    const newRooms = data.rooms.map((r) => ({ id: r.id, areaId: r.localId, name: r.name }));
    data.locals = newLocals; data.areas = newAreas; data.rooms = newRooms;
    data.selected = { localId: data.selected?.areaId, areaId: data.selected?.localId, roomId: data.selected?.roomId };
  }
  data.hierarchyV2 = true;
  return data;
}

function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readSavedData() {
  const storage = await openStorage();
  return new Promise((resolve, reject) => {
    const request = storage.transaction('data').objectStore('data').get(KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const save = async () => {
  try {
    const storage = await openStorage();
    storage.transaction('data', 'readwrite').objectStore('data').put(db, KEY);
  } catch { setMessage('No se pudieron guardar los cambios en este navegador.', true); }
};
const uid = () => crypto.randomUUID();
const selectedRoom = () => db.rooms.find((room) => room.id === db.selected.roomId);
const selectedArea = () => db.areas.find((area) => area.id === db.selected.areaId);
const selectedLocal = () => db.locals.find((local) => local.id === db.selected.localId);
const setMessage = (text, error = false) => { const el = $('scan-message'); el.textContent = text; el.classList.toggle('error', error); };
const setSessionMessage = (text) => { $('session-message').textContent = text; };
const safe = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const text = (value) => String(value ?? '').trim();
const header = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cierra la sesión de escaneo activa; el trabajador debe volver a pulsar "Iniciar inventario" e indicar encargados.
function resetSession() {
  session = { active: false, encargados: '' };
  $('scan-card').hidden = true;
  setSessionMessage('');
}

function options(select, data, selectedId) {
  select.innerHTML = data.map((x) => `<option value="${safe(x.id)}" ${x.id === selectedId ? 'selected' : ''}>${safe(x.name)}</option>`).join('');
}
function renderSelectors() {
  options($('local-select'), [...db.locals].sort((a, b) => a.name.localeCompare(b.name, 'es')), db.selected.localId);
  const areas = db.areas.filter((x) => x.localId === db.selected.localId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!areas.some((x) => x.id === db.selected.areaId)) db.selected.areaId = areas[0]?.id;
  options($('area-select'), areas, db.selected.areaId);
  const rooms = db.rooms.filter((x) => x.areaId === db.selected.areaId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!rooms.some((x) => x.id === db.selected.roomId)) db.selected.roomId = rooms[0]?.id;
  options($('room-select'), rooms, db.selected.roomId);
  save(); renderAssets();
}
function renderAssets() {
  const assets = db.assets.filter((x) => x.registered && x.roomId === db.selected.roomId);
  $('inventory-body').innerHTML = assets.map((asset, index) => {
    const mismatch = asset.areaMismatch;
    const origin = mismatch
      ? [asset.sourceArea, asset.sourceRoom].filter(Boolean).join(' — ') || asset.sourceRoom || '-'
      : (asset.sourceRoom || selectedRoom()?.name || '-');
    return `<tr class="${mismatch ? 'mismatch-row' : ''}"><td>${index + 1}</td><td>${safe(asset.code)}</td><td>${safe(asset.type)}</td><td>${safe(asset.detail)}</td><td>${safe(origin)}${mismatch ? ' ⚠' : ''}</td><td><select data-asset-id="${safe(asset.id)}">${states.map((state) => `<option ${state === asset.state ? 'selected' : ''}>${state}</option>`).join('')}</select></td><td><button class="button delete-button" data-delete-asset-id="${safe(asset.id)}" type="button">Eliminar</button></td></tr>`;
  }).join('');
  $('empty-message').hidden = assets.length > 0;
}
function moveRoom(direction) {
  const rooms = db.rooms.filter((x) => x.areaId === db.selected.areaId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const index = rooms.findIndex((x) => x.id === db.selected.roomId);
  db.selected.roomId = rooms[(index + direction + rooms.length) % rooms.length].id;
  resetSession(); renderSelectors();
}
function registerCode(code) {
  code = code.trim();
  if (!code) return setMessage('Digite o escanee un código patrimonial.', true);
  const asset = db.assets.find((x) => x.code.toLowerCase() === code.toLowerCase());
  if (!asset) return setMessage(`El código ${code} no está registrado.`, true);
  const currentArea = selectedArea()?.name || '';
  const currentRoom = selectedRoom()?.name || '';
  asset.areaMismatch = Boolean(asset.sourceArea && header(asset.sourceArea) !== header(currentArea));
  asset.roomId = db.selected.roomId; asset.registered = true;
  if (session.active) asset.encargados = session.encargados;
  save(); renderAssets();
  const alerts = [];
  if (asset.areaMismatch) {
    const fullOrigin = [asset.sourceArea, asset.sourceRoom].filter(Boolean).join(' — ');
    alerts.push(`es de otra área: ${fullOrigin || asset.sourceArea}`);
  }
  setMessage(alerts.length ? `Alerta: ${asset.code} ${alerts.join(', ')}.` : `${asset.code}: ${asset.type} registrado en ${currentRoom}.`, alerts.length > 0);
  $('code-input').value = ''; $('code-input').focus();
}
async function toggleCamera() {
  const reader = $('reader');
  if (scanner) { await scanner.stop(); scanner.clear(); scanner = null; reader.hidden = true; $('camera-button').textContent = 'Abrir cámara'; return; }
  if (!window.Html5Qrcode) return setMessage('El lector de cámara aún no está disponible. Use digitación manual.', true);
  reader.hidden = false; scanner = new Html5Qrcode('reader');
  try {
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 160 } }, (text) => { registerCode(text); toggleCamera(); });
    $('camera-button').textContent = 'Cerrar cámara';
  } catch { scanner = null; reader.hidden = true; setMessage('No se pudo abrir la cámara. Revise el permiso o digite el código.', true); }
}
function exportRows() {
  return db.assets.filter((x) => x.registered && x.roomId === db.selected.roomId).map((x, i) => ({
    'Ítem': i + 1, 'Código patrimonial': x.code, 'Tipo de bien': x.type, 'Detalle técnico': x.detail,
    'Ubicación registrada': x.areaMismatch
      ? ([x.sourceArea, x.sourceRoom].filter(Boolean).join(' — ') || x.sourceRoom || '')
      : (x.sourceRoom || selectedRoom()?.name || ''),
    Estado: x.state, 'Encargado(s)': x.encargados || session.encargados || '',
    Alerta: x.areaMismatch ? `Bien de otra área: ${[x.sourceArea, x.sourceRoom].filter(Boolean).join(' — ')}` : '',
    ...(x.sourceData || {})
  }));
}
function exportExcel() {
  if (!window.XLSX) return setMessage('La exportación Excel no está disponible.', true);
  const rows = exportRows();
  if (!rows.length) return setMessage('No hay bienes escaneados para exportar.', true);
  const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new();
  sheet['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 30 }, { wch: 46 }, { wch: 30 }, { wch: 12 }, { wch: 26 }, { wch: 34 }];
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(rows[0]).length - 1)}${rows.length + 1}` };
  Object.keys(rows[0]).forEach((_, index) => { const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })]; if (cell) cell.s = { fill: { fgColor: { rgb: '0B5CAB' } }, font: { color: { rgb: 'FFFFFF' }, bold: true } }; });
  rows.forEach((row, rowIndex) => { if (!row.Alerta) return; Object.keys(row).forEach((_, columnIndex) => { const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })]; if (cell) cell.s = { fill: { fgColor: { rgb: 'FDECEA' } }, font: { color: { rgb: 'B42318' }, bold: true } }; }); });
  XLSX.utils.book_append_sheet(book, sheet, 'Inventario');
  XLSX.writeFile(book, `inventario-${selectedRoom().name.replaceAll(' ', '-')}.xlsx`);
}
function matchesColumn(column, names) {
  const normalized = header(column);
  return names.some((name) => normalized === name || (name !== 'codigo' && normalized.includes(name)));
}
function valueFrom(row, names) {
  const key = Object.keys(row).find((column) => matchesColumn(column, names));
  return key === undefined ? '' : text(row[key]);
}
const codeHeaders = ['codigopatrimonial', 'codigopatrim', 'codigopat', 'codpatrimonial', 'codigo', 'codigodelbien', 'codigoactivo', 'codigoinventario', 'numeropatrimonial', 'nropatrimonial'];
function technicalDetail(row) {
  return [
    ['Marca', valueFrom(row, ['marca'])],
    ['Modelo', valueFrom(row, ['modelo'])],
    ['Tipo', valueFrom(row, ['tipo'])],
    ['Color', valueFrom(row, ['color'])],
    ['Serie', valueFrom(row, ['serie'])]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(' | ');
}
function importRows(rows) {
  let imported = 0; let updated = 0; let omitted = 0;
  const keepSourceData = rows.length < 5000;
  const assetsByCode = new Map(db.assets.map((asset) => [asset.code.toLowerCase(), asset]));
  const localsByName = new Map(db.locals.map((local) => [local.name.toLowerCase(), local]));
  const areasByName = new Map(db.areas.map((area) => [`${area.localId}|${area.name.toLowerCase()}`, area]));
  const roomsByName = new Map(db.rooms.map((room) => [`${room.areaId}|${room.name.toLowerCase()}`, room]));
  rows.forEach((row) => {
    const code = valueFrom(row, codeHeaders);
    if (!code) { omitted++; return; }
    const localName = valueFrom(row, ['local', 'nombrel', 'sede', 'edificio']) || selectedLocal()?.name || 'Sin local';
    const localKey = localName.toLowerCase();
    let local = localsByName.get(localKey);
    if (!local) { local = { id: uid(), name: localName }; db.locals.push(local); localsByName.set(localKey, local); }
    const areaName = valueFrom(row, ['area']) || selectedArea()?.name || 'Sin área';
    const areaKey = `${local.id}|${areaName.toLowerCase()}`;
    let area = areasByName.get(areaKey);
    if (!area) { area = { id: uid(), localId: local.id, name: areaName }; db.areas.push(area); areasByName.set(areaKey, area); }
    const roomName = valueFrom(row, ['ambiente', 'oficina', 'nombreoficina', 'aula', 'ambienteoficina']) || selectedRoom()?.name || 'Sin ambiente';
    const roomKey = `${area.id}|${roomName.toLowerCase()}`;
    let room = roomsByName.get(roomKey);
    if (!room) { room = { id: uid(), areaId: area.id, name: roomName }; db.rooms.push(room); roomsByName.set(roomKey, room); }
    const stateRaw = valueFrom(row, ['estadobien', 'estado']).toLowerCase();
    const state = states.find((x) => x.toLowerCase() === stateRaw) || 'Bueno';
    const data = {
      code,
      type: valueFrom(row, ['denominacionbien', 'tipodebien', 'denominacion', 'descripcion', 'tipo']) || 'Sin especificar',
      detail: technicalDetail(row) || valueFrom(row, ['detalletecnico', 'detalle', 'caracteristicas', 'observaciones']) || 'Sin detalle',
      roomId: room.id,
      state, registered: false, fromExcel: true, sourceArea: areaName, sourceRoom: roomName,
      ...(keepSourceData ? { sourceData: { ...row } } : {})
    };
    const asset = assetsByCode.get(code.toLowerCase());
    if (asset) { Object.assign(asset, data); updated++; } else { const created = { id: uid(), ...data }; db.assets.push(created); assetsByCode.set(code.toLowerCase(), created); imported++; }
  });
  if (!imported && !updated) return setMessage('No se encontraron códigos patrimoniales para importar. Revise los encabezados.', true);
  save(); renderSelectors();
  setMessage(`Importación terminada: ${imported} bienes nuevos, ${updated} actualizados${omitted ? `, ${omitted} filas omitidas` : ''}.`);
}
async function importExcel(file) {
  if (!window.XLSX) return setMessage('La importación Excel aún no está disponible.', true);
  try {
    const data = await file.arrayBuffer();
    const book = XLSX.read(data, { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    const headerIndex = matrix.findIndex((row) => row.some((cell) => matchesColumn(cell, codeHeaders)));
    if (headerIndex < 0) {
      const detected = matrix.slice(0, 8).flat().map(text).filter(Boolean).slice(0, 12);
      return setMessage(`No se encontró la columna Código patrimonial. Encabezados detectados: ${detected.join(', ') || 'ninguno'}.`, true);
    }
    const headers = matrix[headerIndex].map(text);
    const rows = matrix.slice(headerIndex + 1)
      .filter((row) => row.some((cell) => text(cell)))
      .map((row) => Object.fromEntries(headers.map((name, index) => [name, row[index] ?? ''])));
    if (!rows.length) return setMessage('No hay filas de datos debajo de los encabezados del archivo.', true);
    importRows(rows);
  } catch { setMessage('No se pudo leer el archivo. Seleccione un Excel o CSV válido.', true); }
}
async function loadProjectInventory() {
  if (db.projectInventoryLoaded) return;
  try {
    setMessage('Cargando el inventario base; este proceso se realiza una sola vez…');
    const response = await fetch('./inventario.xlsx');
    if (!response.ok) throw new Error('Archivo no encontrado');
    const data = await response.arrayBuffer();
    const book = XLSX.read(data, { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    const headerIndex = matrix.findIndex((row) => row.some((cell) => matchesColumn(cell, codeHeaders)));
    if (headerIndex < 0) throw new Error('Encabezados no encontrados');
    const headers = matrix[headerIndex].map(text);
    const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => text(cell))).map((row) => Object.fromEntries(headers.map((name, index) => [name, row[index] ?? ''])));
    importRows(rows);
    db.projectInventoryLoaded = true;
    save();
  } catch { setMessage('No se pudo cargar inventario.xlsx. Abra la app desde un servidor web (no con doble clic al archivo).', true); }
}
async function restoreSourceAreas() {
  if (db.sourceAreasRestored || !db.assets.some((asset) => !asset.sourceArea || !asset.sourceRoom)) return;
  try {
    const response = await fetch('./inventario.xlsx');
    if (!response.ok) return;
    const book = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    const matrix = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: false });
    const headerIndex = matrix.findIndex((row) => row.some((cell) => matchesColumn(cell, codeHeaders)));
    if (headerIndex < 0) return;
    const headers = matrix[headerIndex].map(header);
    const codeIndex = headers.findIndex((name) => codeHeaders.includes(name));
    const areaIndex = headers.findIndex((name) => name.includes('area'));
    const roomIndex = headers.findIndex((name) => name.includes('ambiente') || name.includes('oficina') || name.includes('aula'));
    if (codeIndex < 0 || (areaIndex < 0 && roomIndex < 0)) return;
    const assetsByCode = new Map(db.assets.map((asset) => [asset.code.toLowerCase(), asset]));
    matrix.slice(headerIndex + 1).forEach((row) => {
      const asset = assetsByCode.get(text(row[codeIndex]).toLowerCase());
      if (!asset) return;
      if (areaIndex >= 0 && !asset.sourceArea) asset.sourceArea = text(row[areaIndex]);
      if (roomIndex >= 0 && !asset.sourceRoom) asset.sourceRoom = text(row[roomIndex]);
    });
    const currentArea = selectedArea()?.name || '';
    db.assets.forEach((asset) => {
      if (!asset.registered) return;
      asset.areaMismatch = Boolean(asset.sourceArea && header(asset.sourceArea) !== header(currentArea));
    });
    db.sourceAreasRestored = true; save(); renderAssets();
  } catch { /* El inventario seguirá funcionando; la alerta se activa al volver a importar. */ }
}
async function exportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) return setMessage('La exportación PDF no está disponible: no cargaron las librerías (jsPDF). Revise su conexión a internet y recargue la página.', true);
  if (typeof window.jspdf.jsPDF.API?.autoTable !== 'function') return setMessage('La exportación PDF no está disponible: no cargó el complemento de tablas (autoTable). Revise su conexión a internet y recargue la página.', true);
  const rows = exportRows();
  if (!rows.length) return setMessage('No hay bienes escaneados para exportar.', true);
  try {
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: 'landscape' }); const width = pdf.internal.pageSize.getWidth();
    const local = selectedLocal()?.name || ''; const area = selectedArea()?.name || '';
    pdf.setFillColor(11, 92, 171); pdf.rect(0, 0, width, 31, 'F');
    let logoWarning = '';
    if (window.LOGO_DATA_URI) {
      try { pdf.addImage(window.LOGO_DATA_URI, 'PNG', 12, 3, 24, 24); }
      catch (logoErr) { console.error('No se pudo dibujar el logo:', logoErr); logoWarning = ' (aviso: no se pudo incluir el logo)'; }
    } else {
      logoWarning = ' (aviso: no se encontró el logo — revise que logo-data.js esté cargado)';
    }
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(15); pdf.text('INVENTARIO DE BIENES PATRIMONIALES', 42, 13); pdf.setFontSize(9); pdf.text('Universidad Nacional del Centro del Perú · Módulo de trabajador', 42, 21);
    pdf.setTextColor(20, 33, 61); pdf.setFontSize(9);
    pdf.text(`Local: ${local}`, 14, 35); pdf.text(`Área: ${area}`, 14, 41); pdf.text(`Ambiente: ${selectedRoom().name}`, 14, 47);
    pdf.text(`Encargado(s): ${session.encargados || '—'}`, width - 90, 35); pdf.text(`Fecha de registro: ${new Date().toLocaleDateString('es-PE')}`, width - 90, 41);
    pdf.autoTable({ startY: 54, head: [['Ítem', 'Código patrimonial', 'Tipo de bien', 'Detalle técnico', 'Ubicación registrada', 'Estado', 'Encargado(s)', 'Alerta']], body: rows.map((x) => [x['Ítem'], x['Código patrimonial'], x['Tipo de bien'], x['Detalle técnico'], x['Ubicación registrada'], x.Estado, x['Encargado(s)'], x.Alerta]), theme: 'grid', headStyles: { fillColor: [11, 92, 171], textColor: 255 }, alternateRowStyles: { fillColor: [242, 247, 252] }, styles: { fontSize: 7.5, cellPadding: 2.6 }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 28 }, 2: { cellWidth: 34 }, 3: { cellWidth: 62 }, 4: { cellWidth: 40 }, 5: { cellWidth: 16 }, 6: { cellWidth: 32 }, 7: { cellWidth: 36 } }, didParseCell: (data) => { if (data.section === 'body' && data.row.raw[7]) { data.cell.styles.fillColor = [253, 236, 234]; data.cell.styles.textColor = [180, 35, 24]; data.cell.styles.fontStyle = 'bold'; } }, didDrawPage: () => { pdf.setFontSize(8); pdf.setTextColor(90, 107, 125); pdf.text('Generado por el sistema de inventario', 14, pdf.internal.pageSize.getHeight() - 8); } });
    pdf.save(`inventario-${selectedRoom().name.replaceAll(' ', '-')}.pdf`);
    setMessage(`PDF generado y descargado correctamente.${logoWarning}`);
  } catch (err) {
    console.error(err);
    setMessage(`No se pudo generar el PDF: ${err?.message || 'error desconocido'}. Revise la consola del navegador (F12) para más detalle.`, true);
  }
}

$('local-select').onchange = (e) => { db.selected.localId = e.target.value; resetSession(); renderSelectors(); };
$('area-select').onchange = (e) => { db.selected.areaId = e.target.value; resetSession(); renderSelectors(); };
$('room-select').onchange = (e) => { db.selected.roomId = e.target.value; resetSession(); renderSelectors(); };
$('previous-room').onclick = () => moveRoom(-1); $('next-room').onclick = () => moveRoom(1);
$('camera-button').onclick = toggleCamera;
$('code-form').onsubmit = (e) => { e.preventDefault(); registerCode($('code-input').value); };
$('inventory-body').onchange = (e) => { if (!e.target.matches('[data-asset-id]')) return; db.assets.find((x) => x.id === e.target.dataset.assetId).state = e.target.value; save(); setMessage('Estado actualizado y guardado.'); $('code-input').focus(); };
$('inventory-body').onclick = (e) => {
  const button = e.target.closest('[data-delete-asset-id]');
  if (!button) return;
  const asset = db.assets.find((x) => x.id === button.dataset.deleteAssetId);
  if (!asset) return;
  asset.registered = false;
  save(); renderAssets(); setMessage(`${asset.code} fue eliminado.`);
};
$('excel-button').onclick = exportExcel; $('pdf-button').onclick = exportPdf;
$('finish-inventory-button').onclick = () => {
  const room = selectedRoom();
  const registered = db.assets.filter((asset) => asset.registered && asset.roomId === room.id);
  const count = registered.length;
  if (!count) return setMessage('No hay bienes registrados para finalizar.', true);
  if (!confirm(`¿Finalizar el inventario de ${room.name} y limpiar sus ${count} bienes escaneados?`)) return;
  registered.forEach((asset) => { asset.registered = false; });
  save(); renderAssets(); resetSession(); setMessage(`Inventario de ${room.name} finalizado y limpiado.`);
};
$('clear-excel-button').onclick = () => {
  if (!confirm('¿Borrar todos los datos del Excel actual? Luego podrá cargar otro archivo.')) return;
  db = structuredClone(seed); db.assets = []; db.projectInventoryLoaded = true; db.inventoryModeV2 = true; db.hierarchyV2 = true;
  save(); resetSession(); renderSelectors(); setMessage('Datos Excel eliminados. Seleccione Importar Excel para cargar otro archivo.');
};
$('import-excel-button').onclick = () => $('excel-import-input').click();
$('excel-import-input').onchange = (e) => { const file = e.target.files[0]; if (file) importExcel(file); e.target.value = ''; };
$('new-room-button').onclick = () => { editingRoomId = null; $('dialog-title').textContent = 'Nuevo ambiente'; $('room-name-input').value = ''; $('room-dialog').showModal(); };
$('edit-room-button').onclick = () => { const room = selectedRoom(); editingRoomId = room.id; $('dialog-title').textContent = 'Editar ambiente'; $('room-name-input').value = room.name; $('room-dialog').showModal(); };
$('cancel-room').onclick = () => $('room-dialog').close();
$('room-form').onsubmit = () => { const name = $('room-name-input').value.trim(); if (!name) return; if (editingRoomId) db.rooms.find((x) => x.id === editingRoomId).name = name; else { const room = { id: uid(), areaId: db.selected.areaId, name }; db.rooms.push(room); db.selected.roomId = room.id; resetSession(); } save(); renderSelectors(); };

$('start-inventory-button').onclick = () => {
  if (!selectedRoom()) return setSessionMessage('Seleccione Local, Área y Ambiente antes de iniciar.');
  $('encargados-input').value = session.encargados || '';
  $('encargados-dialog').showModal();
};
$('cancel-encargados').onclick = () => $('encargados-dialog').close();
$('encargados-form').onsubmit = () => {
  const names = $('encargados-input').value.trim();
  if (!names) return;
  session = { active: true, encargados: names };
  $('scan-card').hidden = false;
  setSessionMessage(`Inventario iniciado por: ${names}`);
  setMessage('');
  $('code-input').focus();
};

async function initialize() {
  try {
    db = migrateHierarchy(await readSavedData() || JSON.parse(localStorage.getItem(KEY)) || seed);
  } catch { db = migrateHierarchy(JSON.parse(localStorage.getItem(KEY)) || seed); }
  if (!db.inventoryModeV2) {
    db.assets.forEach((asset) => { asset.registered = false; asset.fromExcel = true; });
    db.inventoryModeV2 = true; save();
  }
  resetSession();
  renderSelectors();
  loadProjectInventory(); restoreSourceAreas();
}
initialize();
