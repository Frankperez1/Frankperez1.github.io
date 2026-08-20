const KEY = 'inventario-trabajador-v1';
const STORAGE_DB = 'inventario-trabajador-db';
const states = ['Bueno', 'Regular', 'Malo'];
const $ = (id) => document.getElementById(id);
let scanner;
let editingRoomId = null;

const seed = {
  areas: [{ id: 'a1', name: 'Ciudad Universitaria' }],
  locals: [{ id: 'l1', areaId: 'a1', name: 'Facultad de Arquitectura' }],
  rooms: [{ id: 'r1', localId: 'l1', name: 'Oficina de Grados y Títulos' }, { id: 'r2', localId: 'l1', name: 'Aula 304' }],
  assets: [
    { id: 'b1', code: '001-2026-0001', type: 'Escritorio', detail: 'Madera, 2 cajones', roomId: 'r1', state: 'Bueno' },
    { id: 'b2', code: '001-2026-0002', type: 'Silla', detail: 'Giratoria, color negro', roomId: 'r1', state: 'Regular' },
    { id: 'b3', code: '001-2026-0003', type: 'Computadora', detail: 'Core i5, 8 GB RAM', roomId: 'r2', state: 'Bueno' }
  ],
  selected: { areaId: 'a1', localId: 'l1', roomId: 'r1' }
};

let db = seed;
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
const setMessage = (text, error = false) => { const el = $('scan-message'); el.textContent = text; el.classList.toggle('error', error); };
const safe = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const text = (value) => String(value ?? '').trim();
const header = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function options(select, data, selectedId) {
  select.innerHTML = data.map((x) => `<option value="${safe(x.id)}" ${x.id === selectedId ? 'selected' : ''}>${safe(x.name)}</option>`).join('');
}
function renderSelectors() {
  options($('area-select'), db.areas, db.selected.areaId);
  const locals = db.locals.filter((x) => x.areaId === db.selected.areaId);
  if (!locals.some((x) => x.id === db.selected.localId)) db.selected.localId = locals[0]?.id;
  options($('local-select'), locals, db.selected.localId);
  const rooms = db.rooms.filter((x) => x.localId === db.selected.localId);
  if (!rooms.some((x) => x.id === db.selected.roomId)) db.selected.roomId = rooms[0]?.id;
  options($('room-select'), rooms, db.selected.roomId);
  save(); renderAssets();
}
function renderAssets() {
  const assets = db.assets.filter((x) => x.registered && x.roomId === db.selected.roomId);
  $('inventory-body').innerHTML = assets.map((asset, index) => `<tr class="${asset.areaMismatch ? 'mismatch-row' : ''}"><td>${index + 1}</td><td>${safe(asset.code)}</td><td>${safe(asset.type)}</td><td>${safe(asset.detail)}${asset.areaMismatch ? '<br><strong>⚠ Bien de otra área</strong>' : ''}</td><td><select data-asset-id="${safe(asset.id)}">${states.map((state) => `<option ${state === asset.state ? 'selected' : ''}>${state}</option>`).join('')}</select></td><td><button class="button delete-button" data-delete-asset-id="${safe(asset.id)}" type="button">Eliminar</button></td></tr>`).join('');
  $('empty-message').hidden = assets.length > 0;
}
function moveRoom(direction) {
  const rooms = db.rooms.filter((x) => x.localId === db.selected.localId);
  const index = rooms.findIndex((x) => x.id === db.selected.roomId);
  db.selected.roomId = rooms[(index + direction + rooms.length) % rooms.length].id;
  renderSelectors();
}
function registerCode(code) {
  code = code.trim();
  if (!code) return setMessage('Digite o escanee un código patrimonial.', true);
  const asset = db.assets.find((x) => x.code.toLowerCase() === code.toLowerCase());
  if (!asset) return setMessage(`El código ${code} no está registrado.`, true);
  const currentArea = db.areas.find((area) => area.id === db.selected.areaId)?.name || '';
  asset.areaMismatch = Boolean(asset.sourceArea && header(asset.sourceArea) !== header(currentArea));
  asset.roomId = db.selected.roomId; asset.registered = true;
  save(); renderAssets();
  setMessage(asset.areaMismatch ? `Alerta: ${asset.code} pertenece a ${asset.sourceArea}, no a ${currentArea}.` : `${asset.code}: ${asset.type} registrado en ${selectedRoom().name}.`, asset.areaMismatch);
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
    'Ítem': i + 1, 'Código patrimonial': x.code, 'Tipo de bien': x.type, 'Detalle técnico': x.detail, Estado: x.state, Alerta: x.areaMismatch ? `Bien de otra área: ${x.sourceArea}` : '',
    ...(x.sourceData || {})
  }));
}
function exportExcel() {
  if (!window.XLSX) return setMessage('La exportación Excel no está disponible.', true);
  const rows = exportRows();
  if (!rows.length) return setMessage('No hay bienes escaneados para exportar.', true);
  const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new();
  sheet['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 34 }, { wch: 58 }, { wch: 14 }, { wch: 34 }];
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
  const areasByName = new Map(db.areas.map((area) => [area.name.toLowerCase(), area]));
  const localsByName = new Map(db.locals.map((local) => [`${local.areaId}|${local.name.toLowerCase()}`, local]));
  const roomsByName = new Map(db.rooms.map((room) => [`${room.localId}|${room.name.toLowerCase()}`, room]));
  rows.forEach((row) => {
    const code = valueFrom(row, codeHeaders);
    if (!code) { omitted++; return; }
    const areaName = valueFrom(row, ['area']) || db.areas.find((x) => x.id === db.selected.areaId)?.name;
    const areaKey = areaName.toLowerCase();
    let area = areasByName.get(areaKey);
    if (!area) { area = { id: uid(), name: areaName }; db.areas.push(area); areasByName.set(areaKey, area); }
    const localName = valueFrom(row, ['local', 'nombrel', 'sede', 'edificio']) || db.locals.find((x) => x.id === db.selected.localId)?.name;
    const localKey = `${area.id}|${localName.toLowerCase()}`;
    let local = localsByName.get(localKey);
    if (!local) { local = { id: uid(), areaId: area.id, name: localName }; db.locals.push(local); localsByName.set(localKey, local); }
    const roomName = valueFrom(row, ['ambiente', 'oficina', 'nombreoficina', 'aula', 'ambienteoficina']) || selectedRoom()?.name;
    const roomKey = `${local.id}|${roomName.toLowerCase()}`;
    let room = roomsByName.get(roomKey);
    if (!room) { room = { id: uid(), localId: local.id, name: roomName }; db.rooms.push(room); roomsByName.set(roomKey, room); }
    const stateRaw = valueFrom(row, ['estadobien', 'estado']).toLowerCase();
    const state = states.find((x) => x.toLowerCase() === stateRaw) || 'Bueno';
    const data = {
      code,
      type: valueFrom(row, ['denominacionbien', 'tipodebien', 'denominacion', 'descripcion', 'tipo']) || 'Sin especificar',
      detail: technicalDetail(row) || valueFrom(row, ['detalletecnico', 'detalle', 'caracteristicas', 'observaciones']) || 'Sin detalle',
      roomId: room.id,
      state, registered: false, fromExcel: true, sourceArea: areaName,
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
  if (db.sourceAreasRestored || !db.assets.some((asset) => !asset.sourceArea)) return;
  try {
    const response = await fetch('./inventario.xlsx');
    if (!response.ok) return;
    const book = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    const matrix = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: false });
    const headerIndex = matrix.findIndex((row) => row.some((cell) => matchesColumn(cell, codeHeaders)));
    if (headerIndex < 0) return;
    const headers = matrix[headerIndex].map(header);
    const codeIndex = headers.findIndex((name) => codeHeaders.includes(name)); const areaIndex = headers.findIndex((name) => name.includes('area'));
    if (codeIndex < 0 || areaIndex < 0) return;
    const assetsByCode = new Map(db.assets.map((asset) => [asset.code.toLowerCase(), asset]));
    matrix.slice(headerIndex + 1).forEach((row) => { const asset = assetsByCode.get(text(row[codeIndex]).toLowerCase()); if (asset && !asset.sourceArea) asset.sourceArea = text(row[areaIndex]); });
    const currentArea = db.areas.find((area) => area.id === db.selected.areaId)?.name || '';
    db.assets.forEach((asset) => { if (asset.registered) asset.areaMismatch = Boolean(asset.sourceArea && header(asset.sourceArea) !== header(currentArea)); });
    db.sourceAreasRestored = true; save(); renderAssets();
  } catch { /* El inventario seguirá funcionando; la alerta se activa al volver a importar. */ }
}
function loadLogo() {
  return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = 'logo-uncp.png'; });
}
async function exportPdf() {
  if (!window.jspdf) return setMessage('La exportación PDF no está disponible.', true);
  const rows = exportRows();
  if (!rows.length) return setMessage('No hay bienes escaneados para exportar.', true);
  const logo = await loadLogo(); const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: 'landscape' }); const width = pdf.internal.pageSize.getWidth();
  const area = db.areas.find(x => x.id === db.selected.areaId)?.name || ''; const local = db.locals.find(x => x.id === db.selected.localId)?.name || '';
  pdf.setFillColor(11, 92, 171); pdf.rect(0, 0, width, 31, 'F'); if (logo) pdf.addImage(logo, 'PNG', 12, 3, 24, 24); pdf.setTextColor(255, 255, 255); pdf.setFontSize(15); pdf.text('INVENTARIO DE BIENES PATRIMONIALES', 42, 13); pdf.setFontSize(9); pdf.text('Universidad Nacional del Centro del Perú · Módulo de trabajador', 42, 21);
  pdf.setTextColor(20, 33, 61); pdf.setFontSize(9); pdf.text(`Área: ${area}`, 14, 35); pdf.text(`Local: ${local}`, 14, 41); pdf.text(`Ambiente: ${selectedRoom().name}`, 14, 47); pdf.text(`Fecha de registro: ${new Date().toLocaleDateString('es-PE')}`, width - 72, 41);
  pdf.autoTable({ startY: 54, head: [['Ítem', 'Código patrimonial', 'Tipo de bien', 'Detalle técnico', 'Estado', 'Alerta']], body: rows.map((x) => [x['Ítem'], x['Código patrimonial'], x['Tipo de bien'], x['Detalle técnico'], x.Estado, x.Alerta]), theme: 'grid', headStyles: { fillColor: [11, 92, 171], textColor: 255 }, alternateRowStyles: { fillColor: [242, 247, 252] }, styles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 36 }, 2: { cellWidth: 50 }, 3: { cellWidth: 100 }, 4: { cellWidth: 20 }, 5: { cellWidth: 48 } }, didParseCell: (data) => { if (data.section === 'body' && data.row.raw[5]) { data.cell.styles.fillColor = [253, 236, 234]; data.cell.styles.textColor = [180, 35, 24]; data.cell.styles.fontStyle = 'bold'; } }, didDrawPage: () => { pdf.setFontSize(8); pdf.setTextColor(90, 107, 125); pdf.text('Generado por el sistema de inventario', 14, pdf.internal.pageSize.getHeight() - 8); } });
  pdf.save(`inventario-${selectedRoom().name.replaceAll(' ', '-')}.pdf`);
}

$('area-select').onchange = (e) => { db.selected.areaId = e.target.value; renderSelectors(); };
$('local-select').onchange = (e) => { db.selected.localId = e.target.value; renderSelectors(); };
$('room-select').onchange = (e) => { db.selected.roomId = e.target.value; renderSelectors(); };
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
  save(); renderAssets(); setMessage(`Inventario de ${room.name} finalizado y limpiado.`);
};
$('clear-excel-button').onclick = () => {
  if (!confirm('¿Borrar todos los datos del Excel actual? Luego podrá cargar otro archivo.')) return;
  db = structuredClone(seed); db.assets = []; db.projectInventoryLoaded = true; db.inventoryModeV2 = true;
  save(); renderSelectors(); setMessage('Datos Excel eliminados. Seleccione Importar Excel para cargar otro archivo.');
};
$('import-excel-button').onclick = () => $('excel-import-input').click();
$('excel-import-input').onchange = (e) => { const file = e.target.files[0]; if (file) importExcel(file); e.target.value = ''; };
$('new-room-button').onclick = () => { editingRoomId = null; $('dialog-title').textContent = 'Nuevo ambiente'; $('room-name-input').value = ''; $('room-dialog').showModal(); };
$('edit-room-button').onclick = () => { const room = selectedRoom(); editingRoomId = room.id; $('dialog-title').textContent = 'Editar ambiente'; $('room-name-input').value = room.name; $('room-dialog').showModal(); };
$('cancel-room').onclick = () => $('room-dialog').close();
$('room-form').onsubmit = () => { const name = $('room-name-input').value.trim(); if (!name) return; if (editingRoomId) db.rooms.find((x) => x.id === editingRoomId).name = name; else { const room = { id: uid(), localId: db.selected.localId, name }; db.rooms.push(room); db.selected.roomId = room.id; } save(); renderSelectors(); };
async function initialize() {
  try {
    db = await readSavedData() || JSON.parse(localStorage.getItem(KEY)) || seed;
  } catch { db = JSON.parse(localStorage.getItem(KEY)) || seed; }
  if (!db.inventoryModeV2) {
    db.assets.forEach((asset) => { asset.registered = false; asset.fromExcel = true; });
    db.inventoryModeV2 = true; save();
  }
  renderSelectors(); $('code-input').focus();
  loadProjectInventory(); restoreSourceAreas();
}
initialize();
