
function normalizeFieldName(name) {
  return (name || "")
    .trim()
    // Convert "A / B" into "A_or_B"
    .replace(/\s*\/\s*/g, "_or_")
    // Replace all remaining spaces (including non‑breaking) with underscores
    .replace(/[\s\u00A0]+/g, "_")
    // Replace remaining forward/back slashes with underscores
    .replace(/[\/\\]+/g, "_")
    // Escape single quotes so Child's Name → Child\'s_Name
    .replace(/'/g, "\\'")
    // Collapse multiple underscores and trim from ends
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "field";
}

function isPhoneContactField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /contact|phone|mobile|telephone|cell|fax/.test(lower);
}

function isEmailField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /email|e-mail|e_mail/.test(lower);
}

function isTimeField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\btime\b/.test(lower);
}

function isDateField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\bdate\b/.test(lower);
}

function isAmountField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\b(amount|salary|salaries|price|cost|fee|fees|payment|income|revenue|budget|total|sum|wage|compensation)\b/.test(lower);
}

function isAgeField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\bage\b/.test(lower);
}

/** True if the label suggests number-only (e.g. quantity, count). */













/** True if the label suggests number-only (e.g. quantity, count). */
function isNumberOnlyField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\b(number|quantity|quantities|count|qty|numeric|no\.?\s*of|number\s*of)\b/.test(lower);
}

/** True if the label suggests file upload (e.g. attach, upload, resume, document). */
function isUploadField(rawName) {
  const lower = (rawName || "").trim().toLowerCase();
  return /\b(upload|attach|attachment|file|document|resume|cv|curriculum|portfolio|proof|supporting\s*document)\b/.test(lower);
}

/** When type is "text", resolve to amount/age/numberOnly/upload if the label suggests it. Phone/cell stay as text so they render as phoneInput. */
function resolveTextSubtype(rawName, type) {
  if (type !== "text") return type;
  if (isAmountField(rawName)) return "amount";
  if (isAgeField(rawName)) return "age";
  if (isPhoneContactField(rawName)) return type;
  if (isNumberOnlyField(rawName)) return "numberOnly";
  if (isUploadField(rawName)) return "upload";
  return type;
}

function getFieldLines() {
  const el = document.getElementById("fieldNames");
  if (!el) return [];
  return el.value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

/** Return array of { rawName, fieldName } with unique field names: first occurrence no suffix, then _, __, etc. */
function makeUniqueFieldNames(rawNames) {
  const baseCount = {};
  return rawNames.map((raw) => {
    const base = normalizeFieldName(raw);
    const key = base.replace(/_+$/, "");
    const n = baseCount[key] = (baseCount[key] ?? 0);
    baseCount[key]++;
    const fieldName = n > 0 ? key + "_".repeat(n) : base;
    return { rawName: raw, fieldName };
  });
}


const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "email", label: "Email" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "amount", label: "Amount" },
  { value: "age", label: "Age" },
  { value: "numberOnly", label: "Number" },
  { value: "upload", label: "Attachment" },
  { value: "header", label: "Header" }
];
const OPTION_TYPES = { radio: true, checkbox: true, select: true };
const MAX_ROW_COLS = 3;

let workspaceVersion = "v2";
let formFields = [];
let canvasRows = [];
let canvasHistory = [];
let uidSeq = 0;
let dragFieldId = null;
let nameSyncTimer = null;
let statusTimer = null;

function uid(prefix) {
  uidSeq += 1;
  return (prefix || "id") + "_" + uidSeq;
}

function snapshotCanvas() {
  canvasHistory.push(JSON.stringify({
    formFields: formFields.map((f) => ({ ...f, options: (f.options || []).slice() })),
    canvasRows: canvasRows.map((r) => ({ id: r.id, fieldIds: r.fieldIds.slice() })),
    workspaceVersion
  }));
  if (canvasHistory.length > 40) canvasHistory.shift();
}

function restoreCanvasState(state) {
  formFields = (state.formFields || []).map((f) => ({ ...f, options: (f.options || []).slice() }));
  canvasRows = (state.canvasRows || []).map((r) => ({ id: r.id, fieldIds: r.fieldIds.slice() }));
  workspaceVersion = state.workspaceVersion === "v1" ? "v1" : "v2";
}

function defaultTypeForName(rawName) {
  try {
    if (isEmailField(rawName)) return "email";
    if (isDateField(rawName)) return "date";
    if (isTimeField(rawName)) return "time";
    return resolveTextSubtype(rawName, "text");
  } catch (err) {
    console.error(err);
    return "text";
  }
}

function fieldById(id) {
  return formFields.find((f) => f.id === id);
}

function needsOptions(type) {
  return !!OPTION_TYPES[type];
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHeaderType(fieldId) {
  const f = fieldById(fieldId);
  return !!(f && f.type === "header");
}

function rowContainsHeader(row) {
  return row.fieldIds.some(isHeaderType);
}

function findRowIndexForField(fieldId) {
  return canvasRows.findIndex((r) => r.fieldIds.includes(fieldId));
}

function removeFieldFromRows(fieldId) {
  canvasRows.forEach((row) => {
    row.fieldIds = row.fieldIds.filter((id) => id !== fieldId);
  });
  canvasRows = canvasRows.filter((row) => row.fieldIds.length);
}

function syncVersionButtons() {
  document.querySelectorAll(".version-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-version") === workspaceVersion);
  });
}

function setWorkspaceVersion(version) {
  const next = version === "v1" ? "v1" : "v2";
  if (next === workspaceVersion) {
    generateFromWorkspace();
    return;
  }
  snapshotCanvas();
  workspaceVersion = next;
  syncVersionButtons();
  generateFromWorkspace();
}

function undoCanvas() {
  if (!canvasHistory.length) {
    alert("Nothing to undo.");
    return;
  }
  restoreCanvasState(JSON.parse(canvasHistory.pop()));
  syncVersionButtons();
  syncNamesTextarea();
  renderWorkspace();
}

function syncNamesTextarea() {
  const el = document.getElementById("fieldNames");
  if (!el) return;
  const next = formFields.map((f) => f.rawName).join("\n");
  if (el.value !== next) el.value = next;
}



function syncFromNameInput() {
  const namesEl = document.getElementById("fieldNames");
  if (!namesEl) return;
  const lines = getFieldLines();
  const uniquePairs = makeUniqueFieldNames(lines);
  const used = new Set();
  const nextFields = uniquePairs.map(({ rawName, fieldName }) => {
    const existing = formFields.find((f) => f.rawName === rawName && !used.has(f.id));
    if (existing) {
      used.add(existing.id);
      return { ...existing, fieldName, options: (existing.options || []).slice() };
    }
    return {
      id: uid("fld"),
      rawName,
      fieldName,
      type: defaultTypeForName(rawName),
      options: [],
      required: false
    };
  });
  const keep = new Set(nextFields.map((f) => f.id));
  canvasRows = canvasRows
    .map((row) => ({ id: row.id, fieldIds: row.fieldIds.filter((id) => keep.has(id)) }))
    .filter((row) => row.fieldIds.length);
  const inCanvas = new Set(canvasRows.flatMap((r) => r.fieldIds));
  nextFields.forEach((f) => {
    if (!inCanvas.has(f.id)) canvasRows.push({ id: uid("row"), fieldIds: [f.id] });
  });
  formFields = nextFields;
  renderWorkspace();
}

function renderWorkspace() {
  renderTypeList();
  renderCanvas();
  generateFromWorkspace();
  updateDashStats();
}

function updateDashStats() {
  const fieldsEl = document.getElementById("statFields");
  if (fieldsEl) fieldsEl.textContent = String(formFields.length);
  const layoutEl = document.getElementById("statLayout");
  if (!layoutEl) return;
  const maxCols = canvasRows.reduce(function (m, r) { return Math.max(m, r.fieldIds.length); }, 0);
  layoutEl.textContent = maxCols <= 1 ? "1 col" : maxCols + " col";
}

function renderTypeList() {
  const root = document.getElementById("fieldTypesList");
  if (!root) return;
  if (!formFields.length) {
    root.innerHTML = '<p class="empty-hint">Enter field names to configure a type for each generated field.</p>';
    return;
  }
  root.innerHTML = formFields.map((f) => {
    const radios = FIELD_TYPE_OPTIONS.map((opt) => {
      const checked = f.type === opt.value ? " checked" : "";
      return `<label class="type-radio"><input type="radio" name="type_${f.id}" value="${opt.value}"${checked}><span>${opt.label}</span></label>`;
    }).join("");
    const showOpts = needsOptions(f.type);
    const optsVal = (f.options || []).join("\n");
    return `<div class="type-row" data-field-id="${f.id}">
      <div class="type-row-main">
        <code class="gen-name">${escapeHtml(f.fieldName)}</code>
        <div class="type-radios">${radios}</div>
      </div>
      <div class="type-row-extra">
        <label class="req-toggle"><input type="checkbox" data-role="required"${f.required ? " checked" : ""}><span>Required</span></label>
        ${showOpts ? `<textarea class="field-options" data-role="options" rows="2" placeholder="Options — one per line">${escapeHtml(optsVal)}</textarea>` : ""}
      </div>
    </div>`;
  }).join("");
}

function canvasPreviewMarkup(f) {
  const label = escapeHtml(f.rawName);
  if (f.type === "header") {
    return `<p class="canvas-header-label">${label}</p>`;
  }
  if (f.type === "textarea") {
    return `<label class="canvas-label">${label}</label><div class="canvas-bar canvas-bar-tall"></div>`;
  }
  if (f.type === "radio" || f.type === "checkbox") {
    const opts = (f.options && f.options.length ? f.options : ["Option 1", "Option 2", "Option 3"]).slice(0, 6);
    const markClass = f.type === "radio" ? "radio" : "checkbox";
    const items = opts.map((o) => `<span class="canvas-choice"><i class="choice-mark ${markClass}" aria-hidden="true"></i>${escapeHtml(o)}</span>`).join("");
    return `<div class="canvas-choice-stack">
      <label class="canvas-label">${label}</label>
      <div class="canvas-choices">${items}</div>
    </div>`;
  }
  if (f.type === "select") {
    return `<label class="canvas-label">${label}</label><div class="canvas-bar canvas-select">Select…</div>`;
  }
  if (f.type === "upload") {
    return `<label class="canvas-label">${label}</label><div class="canvas-bar canvas-upload">Attachment</div>`;
  }
  return `<label class="canvas-label">${label}</label><div class="canvas-bar"></div>`;
}

function renderCanvasField(fieldId) {
  const f = fieldById(fieldId);
  if (!f) return "";
  const typeLabel = (FIELD_TYPE_OPTIONS.find((o) => o.value === f.type) || { label: f.type }).label;
  return `<article class="canvas-field type-${escapeHtml(f.type)}" draggable="true" data-field-id="${f.id}" data-drop="onto">
    <div class="canvas-field-meta">
      <span class="canvas-grab" aria-hidden="true"></span>
      <span class="canvas-type-badge">${escapeHtml(typeLabel)}</span>
      ${f.required ? '<span class="canvas-req">*</span>' : ""}
    </div>
    ${canvasPreviewMarkup(f)}
  </article>`;
}

function renderCanvas() {
  const canvas = document.getElementById("freeCanvas");
  if (!canvas) return;
  if (!formFields.length) {
    canvas.innerHTML = '<div class="drop-placeholder"><span class="drop-plus" aria-hidden="true">+</span><p>Drag fields here</p><p class="empty-hint">Type names on the left to add fields. Drop beside another field to merge columns.</p></div>';
    return;
  }
  let html = "";
  canvasRows.forEach((row, ri) => {
    html += `<div class="canvas-gap" data-drop="row" data-index="${ri}"></div>`;
    const cols = row.fieldIds.length;
    html += `<div class="canvas-row cols-${cols}" data-row-id="${row.id}">`;
    row.fieldIds.forEach((fid, ci) => {
      html += `<div class="canvas-col-gap" data-drop="col" data-row-id="${row.id}" data-index="${ci}"></div>`;
      html += renderCanvasField(fid);
    });
    if (cols < MAX_ROW_COLS) {
      html += `<div class="canvas-col-gap canvas-col-gap-end" data-drop="col" data-row-id="${row.id}" data-index="${cols}"></div>`;
    }
    if (cols > 1) {
      html += `<button type="button" class="canvas-split" data-row-id="${row.id}" title="Separate into single columns">Split</button>`;
    }
    html += `</div>`;
  });
  html += `<div class="canvas-gap" data-drop="row" data-index="${canvasRows.length}"></div>`;
  canvas.innerHTML = html;
}

function insertFieldAsNewRow(fieldId, index) {
  const from = findRowIndexForField(fieldId);
  removeFieldFromRows(fieldId);
  let insertAt = index;
  if (from !== -1 && from < index) insertAt = Math.max(0, index - 1);
  insertAt = Math.max(0, Math.min(insertAt, canvasRows.length));
  canvasRows.splice(insertAt, 0, { id: uid("row"), fieldIds: [fieldId] });
}

function insertFieldInRow(fieldId, rowId, colIndex) {
  const row = canvasRows.find((r) => r.id === rowId);
  if (!row) return;
  if (isHeaderType(fieldId) || rowContainsHeader(row)) {
    const ri = canvasRows.indexOf(row);
    insertFieldAsNewRow(fieldId, ri + 1);
    return;
  }
  if (row.fieldIds.includes(fieldId)) {
    const from = row.fieldIds.indexOf(fieldId);
    row.fieldIds.splice(from, 1);
    let to = colIndex;
    if (to > from) to -= 1;
    to = Math.max(0, Math.min(to, row.fieldIds.length));
    row.fieldIds.splice(to, 0, fieldId);
    return;
  }
  if (row.fieldIds.length >= MAX_ROW_COLS) {
    const ri = canvasRows.indexOf(row);
    insertFieldAsNewRow(fieldId, ri + 1);
    return;
  }
  removeFieldFromRows(fieldId);
  const row2 = canvasRows.find((r) => r.id === rowId);
  if (!row2) {
    canvasRows.push({ id: uid("row"), fieldIds: [fieldId] });
    return;
  }
  const to = Math.max(0, Math.min(colIndex, row2.fieldIds.length));
  row2.fieldIds.splice(to, 0, fieldId);
}

function mergeFieldOnto(fieldId, targetId) {
  const targetRow = canvasRows.find((r) => r.fieldIds.includes(targetId));
  if (!targetRow) return;
  const col = targetRow.fieldIds.indexOf(targetId) + 1;
  insertFieldInRow(fieldId, targetRow.id, col);
}

function splitRow(rowId) {
  const row = canvasRows.find((r) => r.id === rowId);
  if (!row || row.fieldIds.length < 2) return;
  snapshotCanvas();
  const index = canvasRows.indexOf(row);
  const newRows = row.fieldIds.map((id) => ({ id: uid("row"), fieldIds: [id] }));
  canvasRows.splice(index, 1, ...newRows);
  renderWorkspace();
}

function resetCanvasColumns() {
  if (!formFields.length) return;
  snapshotCanvas();
  const order = canvasRows.flatMap((r) => r.fieldIds);
  canvasRows = order.map((id) => ({ id: uid("row"), fieldIds: [id] }));
  renderWorkspace();
}

function pairCanvasColumns() {
  if (!formFields.length) return;
  snapshotCanvas();
  const order = canvasRows.flatMap((r) => r.fieldIds);
  const next = [];
  let i = 0;
  while (i < order.length) {
    const a = order[i];
    const b = order[i + 1];
    if (b && !isHeaderType(a) && !isHeaderType(b)) {
      next.push({ id: uid("row"), fieldIds: [a, b] });
      i += 2;
    } else {
      next.push({ id: uid("row"), fieldIds: [a] });
      i += 1;
    }
  }
  canvasRows = next;
  renderWorkspace();
}

function getColumnInner(html, version) {
  const trimmed = (html || "").trim();
  if (!trimmed) return "";
  if (version === "v1") {
    if (/form_box/.test(trimmed)) return extractBlockInner(trimmed, true);
    return trimmed;
  }
  if (/<div class="row/.test(trimmed)) return extractBlockInner(trimmed, false);
  return `<div class="col-md-12">\n${trimmed}\n</div>`;
}

function generateFromWorkspace() {
  const outputEl = document.getElementById("output");
  if (!outputEl) return;
  if (!formFields.length) {
    outputEl.value = "";
    updatePhpStatus();
    return;
  }
  const version = workspaceVersion;
  let output = "";
  canvasRows.forEach((row) => {
    const fields = row.fieldIds.map(fieldById).filter(Boolean);
    if (!fields.length) return;
    if (fields.length === 1) {
      const f = fields[0];
      output += renderOneField(f.rawName, f.fieldName, f.type, f.options, version, f.required);
      return;
    }
    const inners = fields.map((f) => {
      const html = renderOneField(f.rawName, f.fieldName, f.type, f.options, version, f.required);
      return { inner: getColumnInner(html, version) };
    });
    output += buildMergedHtml(inners, fields.length, version === "v1") + "\n";
  });
  outputEl.value = output.trim();
  updatePhpStatus();
}

function onTypeListChange(e) {
  const row = e.target.closest(".type-row");
  if (!row) return;
  const field = fieldById(row.getAttribute("data-field-id"));
  if (!field) return;
  if (e.target.matches("input[type='radio']")) {
    snapshotCanvas();
    field.type = e.target.value;
    if (!needsOptions(field.type)) field.options = [];
    renderWorkspace();
    return;
  }
  if (e.target.matches('input[data-role="required"]')) {
    snapshotCanvas();
    field.required = e.target.checked;
    renderCanvas();
    generateFromWorkspace();
  }
}

function onTypeListOptionsInput(e) {
  if (!e.target.matches('textarea[data-role="options"]')) return;
  const row = e.target.closest(".type-row");
  if (!row) return;
  const field = fieldById(row.getAttribute("data-field-id"));
  if (!field) return;
  field.options = e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  renderCanvas();
  generateFromWorkspace();
}

function dropZoneFromEvent(e) {
  const gap = e.target.closest(".canvas-gap, .canvas-col-gap");
  if (gap) return gap;
  const onto = e.target.closest(".canvas-field");
  if (onto) return onto;
  return e.target.closest("[data-drop]");
}

function onCanvasDragStart(e) {
  if (e.target.closest(".canvas-split")) {
    e.preventDefault();
    return;
  }
  const fieldEl = e.target.closest(".canvas-field");
  if (!fieldEl) return;
  dragFieldId = fieldEl.getAttribute("data-field-id");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragFieldId);
  fieldEl.classList.add("is-dragging");
  const canvas = document.getElementById("freeCanvas");
  if (canvas) canvas.classList.add("is-dragging");
}

function onCanvasDragEnd() {
  dragFieldId = null;
  const canvas = document.getElementById("freeCanvas");
  if (canvas) canvas.classList.remove("is-dragging");
  document.querySelectorAll(".is-dragging, .drag-over").forEach((el) => {
    el.classList.remove("is-dragging", "drag-over");
  });
}

function onCanvasDragOver(e) {
  if (!dragFieldId) return;
  const zone = dropZoneFromEvent(e);
  if (!zone) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  zone.classList.add("drag-over");
}

function onCanvasDragLeave(e) {
  const zone = e.target.closest("[data-drop]");
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
}

function onCanvasDrop(e) {
  const zone = dropZoneFromEvent(e);
  if (!zone || !dragFieldId) return;
  e.preventDefault();
  const fieldId = dragFieldId;
  const kind = zone.getAttribute("data-drop");
  let changed = false;
  if (kind === "row") {
    snapshotCanvas();
    insertFieldAsNewRow(fieldId, parseInt(zone.getAttribute("data-index"), 10) || 0);
    changed = true;
  } else if (kind === "col") {
    snapshotCanvas();
    insertFieldInRow(fieldId, zone.getAttribute("data-row-id"), parseInt(zone.getAttribute("data-index"), 10) || 0);
    changed = true;
  } else if (kind === "onto") {
    const targetId = zone.getAttribute("data-field-id");
    if (targetId && targetId !== fieldId) {
      snapshotCanvas();
      mergeFieldOnto(fieldId, targetId);
      changed = true;
    }
  }
  onCanvasDragEnd();
  if (changed) renderWorkspace();
}

function onCanvasClick(e) {
  const split = e.target.closest(".canvas-split");
  if (!split) return;
  splitRow(split.getAttribute("data-row-id"));
}

function initWorkspaceUi() {
  const names = document.getElementById("fieldNames");
  if (names) {
    names.addEventListener("input", () => {
      clearTimeout(nameSyncTimer);
      nameSyncTimer = setTimeout(syncFromNameInput, 120);
    });
    names.addEventListener("change", syncFromNameInput);
    names.addEventListener("paste", () => setTimeout(syncFromNameInput, 0));
  }
  const types = document.getElementById("fieldTypesList");
  if (types) {
    types.addEventListener("change", onTypeListChange);
    types.addEventListener("input", onTypeListOptionsInput);
  }
  const canvas = document.getElementById("freeCanvas");
  if (canvas) {
    canvas.addEventListener("dragstart", onCanvasDragStart);
    canvas.addEventListener("dragend", onCanvasDragEnd);
    canvas.addEventListener("dragover", onCanvasDragOver);
    canvas.addEventListener("dragleave", onCanvasDragLeave);
    canvas.addEventListener("drop", onCanvasDrop);
    canvas.addEventListener("click", onCanvasClick);
  }
  const output = document.getElementById("output");
  if (output) {
    output.addEventListener("input", () => {
      clearTimeout(statusTimer);
      statusTimer = setTimeout(updatePhpStatus, 180);
    });
  }
  const statusToggle = document.getElementById("phpStatusToggle");
  if (statusToggle) {
    statusToggle.addEventListener("click", togglePhpStatusList);
  }
  syncVersionButtons();
  renderWorkspace();
}

function copyOutput() {
  const output = document.getElementById("output");
  const copyBtn = document.getElementById("copyBtn");
  const copyBtnText = document.getElementById("copyBtnText");
  const text = output.value;
  if (!text.trim()) return alert("Nothing to copy. Generate output first.");
  const showCopied = () => {
    if (copyBtnText) copyBtnText.textContent = "Copied!";
    else copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "Copy";
      else copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    alert("Copied to clipboard.");
  } catch (e) {
    alert("Could not copy. Please select and copy manually.");
  }
  document.body.removeChild(ta);
}

function clearOutput() {
  const output = document.getElementById("output");
  output.value = "";
  outputHistory = [];
  updatePhpStatus();
  output.focus();
}

let outputHistory = [];

const VOID_HTML_TAGS = {
  area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
  link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1
};

function checkPhpStructure() {
  updatePhpStatus({ expand: true });
}

function togglePhpStatusList() {
  const list = document.getElementById("phpStatusList");
  const btn = document.getElementById("phpStatusToggle");
  if (!list || !btn) return;
  const open = list.hidden;
  list.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
}

function updatePhpStatus(opts) {
  const outputEl = document.getElementById("output");
  const box = document.getElementById("phpStatus");
  const labelEl = document.getElementById("phpStatusLabel");
  const metaEl = document.getElementById("phpStatusMeta");
  const listEl = document.getElementById("phpStatusList");
  const toggle = document.getElementById("phpStatusToggle");
  if (!outputEl || !box || !labelEl || !metaEl || !listEl) return;

  const markup = outputEl.value || "";
  const result = analyzePhpStructure(markup);
  const state = result.state;
  const issues = result.issues;

  box.classList.remove("is-idle", "is-ok", "is-warning", "is-error");
  box.classList.add("is-" + state);
  box.setAttribute("data-state", state);

  if (state === "idle") {
    labelEl.textContent = "Waiting";
    metaEl.textContent = formFields.length
      ? "Canvas has fields, but markup is empty"
      : "Markup will be checked as you build";
  } else if (state === "ok") {
    labelEl.textContent = "Good to go";
    metaEl.textContent = "Divs, names, and layout look correct";
  } else if (state === "warning") {
    const n = issues.length;
    labelEl.textContent = "Warning";
    metaEl.textContent = n === 1 ? "1 warning to review" : n + " warnings to review";
  } else {
    const errors = issues.filter((i) => i.level === "error").length;
    const warns = issues.filter((i) => i.level === "warning").length;
    labelEl.textContent = errors ? "Error" : "Problem";
    const parts = [];
    if (errors) parts.push(errors === 1 ? "1 error" : errors + " errors");
    if (warns) parts.push(warns === 1 ? "1 warning" : warns + " warnings");
    metaEl.textContent = parts.join(", ");
  }

  if (!issues.length && state === "ok") {
    listEl.innerHTML = '<li class="is-ok">No duplicates, balanced tags, and layout wrappers look correct.</li>';
  } else if (!issues.length) {
    listEl.innerHTML = "";
  } else {
    listEl.innerHTML = issues.map((issue) =>
      `<li class="is-${issue.level}">${escapeHtml(issue.message)}</li>`
    ).join("");
  }

  if (opts && opts.expand && issues.length) {
    listEl.hidden = false;
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  } else if (state === "idle" || state === "ok") {
    listEl.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  } else {
    listEl.hidden = false;
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }
}

function analyzePhpStructure(markup) {
  const issues = [];
  const trimmed = (markup || "").trim();
  if (!trimmed) {
    if (formFields.length) {
      issues.push({
        level: "error",
        message: "Markup is empty but the canvas still has " + formFields.length + " field" + (formFields.length === 1 ? "" : "s") + "."
      });
      return { state: "error", issues };
    }
    return { state: "idle", issues };
  }

  checkPhpBlocks(trimmed, issues);
  checkHtmlTags(stripPhpBlocks(trimmed), issues);
  checkDuplicates(trimmed, issues);
  checkLayoutStructure(stripPhpBlocks(trimmed), issues);
  checkCanvasAlignment(trimmed, issues);
  checkOptionPlaceholders(trimmed, issues);

  const errors = issues.filter((i) => i.level === "error");
  const state = errors.length ? "error" : (issues.length ? "warning" : "ok");
  return { state, issues };
}

function stripPhpBlocks(markup) {
  return (markup || "").replace(/<\?php[\s\S]*?\?>/g, "");
}

function checkPhpBlocks(markup, issues) {
  const leftover = markup.replace(/<\?php[\s\S]*?\?>/g, "");
  const danglingOpen = (leftover.match(/<\?php/g) || []).length;
  const danglingClose = (leftover.match(/\?>/g) || []).length;
  if (danglingOpen) {
    issues.push({
      level: "error",
      message: danglingOpen === 1
        ? "Unclosed PHP block — a <?php is missing its ?>."
        : danglingOpen + " unclosed PHP blocks are missing ?>."
    });
  }
  if (danglingClose) {
    issues.push({
      level: "error",
      message: "Extra PHP closer — ?> found without a matching <?php."
    });
  }
}

function checkHtmlTags(html, issues) {
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/g;
  const stack = [];
  let extraClose = 0;
  let wrongClose = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    const name = m[1].toLowerCase();
    const isClose = m[0].startsWith("</");
    const selfClosing = !!VOID_HTML_TAGS[name] || /\/\s*>$/.test(m[0]);
    if (selfClosing && !isClose) continue;
    if (isClose) {
      if (!stack.length) {
        extraClose += 1;
        continue;
      }
      const last = stack.pop();
      if (last !== name) {
        wrongClose += 1;
        issues.push({
          level: "error",
          message: "Wrong closing tag: expected </" + last + "> but found </" + name + ">."
        });
      }
    } else {
      stack.push(name);
    }
  }
  if (extraClose) {
    issues.push({
      level: "error",
      message: extraClose === 1
        ? "Extra closing tag with no matching opening tag."
        : extraClose + " extra closing tags with no matching opening tags."
    });
  }
  if (stack.length) {
    const counts = {};
    stack.forEach((name) => { counts[name] = (counts[name] || 0) + 1; });
    Object.keys(counts).forEach((name) => {
      issues.push({
        level: "error",
        message: counts[name] === 1
          ? "Missing closing </" + name + ">."
          : counts[name] + " unclosed <" + name + "> tags."
      });
    });
  }
}

function collectQuoted(markup, regex) {
  const out = [];
  let m;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((m = re.exec(markup))) out.push(m[1]);
  return out;
}

function checkDuplicates(markup, issues) {
  const names = [];
  eachInputCall(markup, (method, args) => {
    if (method === "label") return;
    const name = pickCallFieldName(method, args);
    if (name) names.push(name);
  });
  collectQuoted(markup, /<input\b[^>]*\bname="([^"]+)"/i).forEach((n) => names.push(n));

  const nameCounts = {};
  names.forEach((n) => {
    if (!n) return;
    nameCounts[n] = (nameCounts[n] || 0) + 1;
  });
  Object.keys(nameCounts).forEach((n) => {
    if (nameCounts[n] > 1) {
      issues.push({
        level: "error",
        message: "Duplicate field name `" + n + "` appears " + nameCounts[n] + " times."
      });
    }
  });

  const labels = [];
  eachInputCall(markup, (method, args) => {
    if (method !== "label") return;
    const label = unquotePhp(args[0] || "");
    if (label) labels.push(label);
  });
  const labelCounts = {};
  labels.forEach((n) => {
    const key = n.replace(/<[^>]+>/g, "").trim();
    if (!key) return;
    labelCounts[key] = (labelCounts[key] || 0) + 1;
  });
  Object.keys(labelCounts).forEach((n) => {
    if (labelCounts[n] > 1) {
      issues.push({
        level: "warning",
        message: "Duplicate label `" + n + "` appears " + labelCounts[n] + " times."
      });
    }
  });

  const rawCounts = {};
  formFields.forEach((f) => {
    const key = (f.rawName || "").trim().toLowerCase();
    if (!key) return;
    rawCounts[key] = (rawCounts[key] || 0) + 1;
  });
  Object.keys(rawCounts).forEach((key) => {
    if (rawCounts[key] > 1) {
      issues.push({
        level: "warning",
        message: "Duplicate canvas label `" + key + "` — generated names were uniquified, but the labels repeat."
      });
    }
  });
}

function eachInputCall(markup, fn) {
  const startRe = /\$input->([a-zA-Z]+)\s*\(/g;
  let m;
  while ((m = startRe.exec(markup))) {
    const method = m[1];
    const open = m.index + m[0].length;
    let i = open;
    let depth = 1;
    let quote = "";
    while (i < markup.length && depth) {
      const ch = markup[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = "";
        i += 1;
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    fn(method, splitPhpArgs(markup.slice(open, i - 1)));
  }
}

function splitPhpArgs(inner) {
  const args = [];
  let cur = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && i + 1 < inner.length) {
        cur += inner[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      cur += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function unquotePhp(value) {
  const s = String(value || "").trim();
  const m = s.match(/^'(.*)'$/) || s.match(/^"(.*)"$/);
  return m ? m[1] : s;
}

function pickCallFieldName(method, args) {
  const arg = (i) => unquotePhp(args[i] || "");
  if (method === "amount" || method === "time" || method === "files") return arg(1);
  if (method === "email" || method === "phoneInput") return arg(2);
  const third = arg(2);
  if (third && /^[A-Za-z_][A-Za-z0-9_]*$/.test(third)) return third;
  return arg(0);
}

function parseDivTree(html) {
  const tokens = [];
  const re = /<\/?div\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const classMatch = attrs.match(/class\s*=\s*"([^"]*)"/i);
    tokens.push({
      close: m[0].slice(0, 2) === "</",
      className: classMatch ? classMatch[1] : ""
    });
  }
  function build(start, end) {
    const nodes = [];
    let i = start;
    while (i < end) {
      const token = tokens[i];
      if (token.close) break;
      let depth = 1;
      let j = i + 1;
      while (j < end && depth) {
        if (tokens[j].close) depth -= 1;
        else depth += 1;
        if (depth) j += 1;
      }
      const children = depth === 0 ? build(i + 1, j) : [];
      nodes.push({ className: token.className, children });
      i = depth === 0 ? j + 1 : end;
    }
    return nodes;
  }
  return build(0, tokens.length);
}

function classListHas(className, token) {
  return new RegExp("(^|\\s)" + token + "(\\s|$)").test(className || "");
}

function checkLayoutStructure(html, issues) {
  const version = workspaceVersion;
  if (version === "v2" && /\bform_box\b/.test(html)) {
    issues.push({
      level: "warning",
      message: "Version 1 `form_box` wrappers found in Bootstrap output."
    });
  }
  if (version === "v1" && /\brow\b/.test(html) && /\bg-3\b/.test(html)) {
    issues.push({
      level: "warning",
      message: "Bootstrap `row g-3` wrappers found in Version 1 output."
    });
  }

  const tree = parseDivTree(html);
  walkLayoutNodes(tree, issues, version, false);
}

function walkLayoutNodes(nodes, issues, version, insideRow, insideFormBox) {
  (nodes || []).forEach((node) => {
    const cls = node.className || "";
    const isRow = classListHas(cls, "row");
    const isFormBox = classListHas(cls, "form_box") && !/form_box_col/.test(cls);
    const colMatch = cls.match(/\bcol-md-(\d+)\b/);
    const v1ColMatch = cls.match(/\bform_box_col(\d+)\b/);

    if (colMatch && !insideRow && version === "v2") {
      issues.push({
        level: "error",
        message: "Wrong div: `col-md-" + colMatch[1] + "` is outside a Bootstrap row."
      });
    }
    if (v1ColMatch && !insideFormBox) {
      issues.push({
        level: "error",
        message: "Wrong div: `form_box_col" + v1ColMatch[1] + "` is outside a `form_box`."
      });
    }

    if (isRow) {
      const cols = node.children.filter((child) => /\bcol-md-\d+\b/.test(child.className || ""));
      const widths = cols.map((child) => {
        const hit = (child.className || "").match(/\bcol-md-(\d+)\b/);
        return hit ? parseInt(hit[1], 10) : 0;
      });
      const sum = widths.reduce((a, b) => a + b, 0);
      if (cols.length >= 2 && widths.indexOf(12) !== -1) {
        issues.push({
          level: "error",
          message: "Off layout: `col-md-12` cannot share a row with other columns."
        });
      } else if (cols.length >= 2 && sum !== 12) {
        issues.push({
          level: "warning",
          message: "Off layout: a Bootstrap row’s columns add up to " + sum + "/12 (" + widths.map((n) => "col-md-" + n).join(" + ") + ")."
        });
      }
      if (version === "v1") {
        issues.push({
          level: "warning",
          message: "A Bootstrap row wrapper is inside Version 1 markup."
        });
      }
      walkLayoutNodes(node.children, issues, version, true, insideFormBox);
      return;
    }

    if (isFormBox) {
      const colWrap = node.children.find((child) => /\bform_box_col\d+\b/.test(child.className || ""));
      if (!colWrap) {
        issues.push({
          level: "error",
          message: "Wrong div: a `form_box` is missing its `form_box_col` wrapper."
        });
      } else {
        const expected = parseInt((colWrap.className.match(/\bform_box_col(\d+)\b/) || [])[1], 10);
        const groups = countGroups(colWrap);
        if (expected && groups && groups !== expected) {
          issues.push({
            level: "warning",
            message: "Off layout: `form_box_col" + expected + "` holds " + groups + " field group" + (groups === 1 ? "" : "s") + "."
          });
        }
      }
      walkLayoutNodes(node.children, issues, version, insideRow, true);
      return;
    }

    if (v1ColMatch && version === "v2") {
      issues.push({
        level: "warning",
        message: "Version 1 column div `form_box_col" + v1ColMatch[1] + "` found in Bootstrap output."
      });
    }

    walkLayoutNodes(node.children, issues, version, insideRow, insideFormBox);
  });
}

function countGroups(node) {
  if (!node) return 0;
  let n = 0;
  (node.children || []).forEach((child) => {
    if (classListHas(child.className, "group")) n += 1;
    n += countGroups(child);
  });
  return n;
}

function checkCanvasAlignment(markup, issues) {
  canvasRows.forEach((row, index) => {
    const fields = row.fieldIds.map(fieldById).filter(Boolean);
    const headers = fields.filter((f) => f.type === "header");
    if (headers.length && fields.length > 1) {
      issues.push({
        level: "error",
        message: "Off layout: a header is sharing row " + (index + 1) + " with other fields. Headers should be full width."
      });
    }
  });

  formFields.forEach((f) => {
    const needle = f.fieldName;
    if (!needle) return;
    const inPhp = markup.indexOf("'" + needle + "'") !== -1 || markup.indexOf('name="' + needle + '"') !== -1;
    if (!inPhp) {
      issues.push({
        level: "warning",
        message: "Canvas field `" + needle + "` is missing from the PHP markup."
      });
    }
  });
}

function checkOptionPlaceholders(markup, issues) {
  formFields.forEach((f) => {
    if (!needsOptions(f.type)) return;
    if (!(f.options || []).length) {
      issues.push({
        level: "warning",
        message: (f.type === "select" ? "Select" : f.type === "checkbox" ? "Checkbox" : "Radio") +
          " `" + f.rawName + "` is using placeholder options. Add real choices."
      });
    }
  });
  if (/\barray\s*\(\s*\)/.test(markup)) {
    issues.push({
      level: "warning",
      message: "An empty PHP array() was found — a radio, checkbox, or select has no options."
    });
  }
}

/** Extract the inner column/group content from a single block so we can merge without changing field names. */
function extractBlockInner(chunk, isV1) {
  const lines = chunk.trim().split(/\r?\n/);
  if (isV1) {
    const colIdx = lines.findIndex(l => /<div class="form_box_col\d+">/i.test(l));
    if (colIdx === -1) return lines.slice(2, -2).join("\n").trim();
    const closeIdx = lines.findIndex((l, i) => i > colIdx && /^\s*<\/div>\s*$/.test(l));
    // Include the first </div> (group's closing tag) so merged output has complete <div class="group">...</div>
    if (closeIdx !== -1) return lines.slice(colIdx + 1, closeIdx + 1).join("\n").trim();
    return lines.slice(2, -2).join("\n").trim();
  }
  const colIdx = lines.findIndex(l => /<div class="col-md-\d+">/i.test(l));
  if (colIdx === -1) return chunk.trim().replace(/^\s*<div class="row[^"]*"[^>]*>\s*\n?/i, "").replace(/\n\s*<\/div>\s*$/, "").trim();
  const closeIdx = lines.findIndex((l, i) => i > colIdx && /^\s*<\/div>\s*$/.test(l));
  if (closeIdx !== -1) return lines.slice(colIdx, closeIdx + 1).join("\n").trim();
  return lines.slice(1, -1).join("\n").trim();
}



function buildMergedHtml(blocks, numCols, isV1) {
  const n = Math.min(numCols, blocks.length);
  const colClass = isV1 ? ("form_box_col" + (n === 2 ? "2" : "3")) : ("col-md-" + (n === 2 ? "6" : "4"));
  let html = "";
  if (isV1) {
    html += "<div class=\"form_box\">\n";
    html += "   <div class=\"" + colClass + "\">\n";
    for (let i = 0; i < n; i++) {
      const inner = blocks[i].inner;
      html += inner + "\n";
    }
    html += "   </div>\n";
    html += "</div>\n";
  } else {
    html += "<div class=\"row g-3 mb-3\">\n";
    for (let i = 0; i < n; i++) {
      let inner = blocks[i].inner;
      inner = inner.replace(/\bcol-md-\d+\b/, colClass);
      html += inner + "\n";
    }
    html += "</div>\n";
  }
  return html;
}












function escPhp(s) {
  return (s + "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Format options array for PHP array(...) */
function formatOptionsForPhp(optionsArray) {
  if (!optionsArray || !optionsArray.length) return "";
  return optionsArray
    .map(opt => `"${(opt + "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(", ");
}

/** Render one field's HTML (for parsed reference). fieldName is used as-is (may include _ suffix for uniqueness). */
function renderOneField(rawName, fieldName, type, optionsArray, version, required) {
  const r = escPhp(rawName);
  // fieldName is already normalized and has single quotes escaped as \'
  // so we can use it directly in PHP single‑quoted strings.
  const f = fieldName;
  const rLower = escPhp((rawName || "").toLowerCase());
  const reqLabel = required ? "*" : "";
  const reqAttr = required ? "required" : "";
  const opts = optionsArray && optionsArray.length ? formatOptionsForPhp(optionsArray) : null;
  let out = "";
  if (type === "email") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->email('${r}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"', '', '', '${f}');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php $input->email('${r}', '', '${f}', '${reqAttr}', '', '', '${f}'); ?>
</div>
</div>

`;
    return out;
  }
  if (type === "date") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col2">
    <div class="group">
        <?php
            $input->label('${r}', '*');
            $input->fields('${f}', 'form_field Date', '${f}', 'placeholder="Enter date here"');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-4">
    <?php $input->datepicker('${f}', '${f}', '', 'Date1 DisableFuture', '', '${r}'); ?>
</div>
</div>

`;
    return out;
  }
  if (type === "time") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->fields('${f}', 'form_field', '${f}', '');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-4">
    <?php $input->time('${r}', '${f}', ''); ?>
</div>
</div>

`;
    return out;
  }
  if (type === "text") {
    const isPhone = isPhoneContactField(rawName);
    const isEmail = isEmailField(rawName);
    const isTime = isTimeField(rawName);
    const isDate = isDateField(rawName);
    if (isPhone) {
      out = version === "v1"
        ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->phoneInput('${r}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here" onkeypress="return isNumberKey(evt)"');
        ?>
    </div>
</div>
</div>

`
        : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php $input->phoneInput('${r}', '', '${f}', ''); ?>
</div>
</div>

`;
    } else if (isEmail) {
      out = version === "v1"
        ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->email('${r}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"', '', '', '${f}');
        ?>
    </div>
</div>
</div>

`
        : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php $input->email('${r}', '', '${f}', '${reqAttr}', '', '', '${f}'); ?>
</div>
</div>

`;
    } else if (isTime) {
      out = version === "v1"
        ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->fields('${f}', 'form_field', '${f}', '');
        ?>
    </div>
</div>
</div>

`
        : `<div class="row g-3 mb-3">
<div class="col-md-4">
    <?php $input->time('${r}', '${f}', ''); ?>
</div>
</div>

`;
    } else if (isDate) {
      out = version === "v1"
        ? `<div class="form_box">
<div class="form_box_col2">
    <div class="group">
        <?php
            $input->label('${r}', '*');
            $input->fields('${f}', 'form_field Date', '${f}', 'placeholder="Enter date here"');
        ?>
    </div>
</div>
</div>

`
        : `<div class="row g-3 mb-3">
<div class="col-md-4">
    <?php $input->datepicker('${f}', '${f}', '', 'Date1 DisableFuture', '', '${r}'); ?>
</div>
</div>

`;
    } else {
      out = version === "v1"
        ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '${reqLabel}');
            $input->fields('${f}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"');
        ?>
    </div>
</div>
</div>

`
        : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php $input->fields('${f}', 'form-control', '${f}', '${reqAttr}'); ?>
</div>
</div>

`;
    }
  } else if (type === "textarea") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '${reqLabel}');
            $input->textarea('${f}', 'text form_field', '${f}', 'placeholder="Enter your ${rLower} here"');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php
        $input->textarea('${f}', 'form-control', '${f}', 'style="height: 100px;"', '', ' ', '${r}');
    ?>
</div>
</div>

`;
  } else if (type === "radio") {
    const optionsStr = opts || formatOptionsForPhp(["Option 1", "Option 2", "Option 3"]);
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->radio('${f}', array(${optionsStr}), '', '', '3');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php
        $input->label('${r}', '');
        $input->radio('${f}', array(${optionsStr}), '${f}', '${reqAttr}', '3');
    ?>
</div>
</div>

`;
  } else if (type === "checkbox") {
    const optionsStr = opts || formatOptionsForPhp(["Option 1", "Option 2", "Option 3"]);
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->chkboxVal('${f}', array(${optionsStr}), '', '', '3');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12 group" data-limit="7">
    <?php
        $input->label('${r}', '');
        $input->chkboxVal('${f}', array(${optionsStr}), '${f}', '${reqAttr}', '3');
    ?>
</div>
</div>

`;
  } else if (type === "select") {
    const optionsStr = opts || formatOptionsForPhp(["Option 1", "Option 2"]);
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('${r}', '');
            $input->select('${f}', 'form_field', array(${optionsStr}), '${f}');
        ?>
    </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12">
    <?php
        $input->select('${r}', 'form-select', array(${optionsStr}), '${r}', '', '${r}', '${reqAttr}', '${r}', '');
    ?>
</div>
</div>

`;
  } else if (type === "amount") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
  <div class="group">
     <?php
        $input->label('${r}', '');
        $input->amount('${f}', '${f}', '');
     ?>
  </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-3">
<?php $input->amount('${r}', '${f}', ''); ?>
</div>
</div>

`;
  } else if (type === "age") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
  <div class="group">
     <?php
        $input->label('${r}', '');
        $input->fields('${r}', 'ageOnly', '${f}', '');
     ?>
  </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-2">
<?php $input->fields('${r}', 'ageOnly', '${f}', ''); ?>
</div>
</div>

`;
  } else if (type === "numberOnly") {
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
  <div class="group">
     <?php
        $input->label('${r}', '');
        $input->fields('${r}', 'numberOnly', '${f}', '');
     ?>
  </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-4">
<?php $input->fields('${r}', 'numberOnly', '${f}', ''); ?>
</div>
</div>

`;
  } else if (type === "upload") {
    const uploadLabelWithHint = escPhp((rawName || "") + ' <span style="font-style: italic; font-size: 13px; text-transform: lowercase; color:#b1b1b1;">(accepted file formats: .doc, .docx, .pdf | Max: 10MB)</span>');
    out = version === "v1"
      ? `<div class="form_box">
<div class="form_box_col1">
  <div class="group">
     <?php
        $input->label('${r}', '');
     ?>
     <input type="file" name="attachment[]" id="${f}" class="form_field" multiple>
  </div>
</div>
</div>

`
      : `<div class="row g-3 mb-3">
<div class="col-md-12">
<?php
  $input->label('${uploadLabelWithHint}', '');
  $input->files('', '${f}', '', '', 'doc,docx,pdf,zip', '10MB');
?>
</div>
</div>

`;
  } else if (type === "header") {
    if (version === "v1") {
      return `<p class="fieldheader">${rawName}</p>
<input type="hidden" name="${fieldName}" value=":" />

`;
    }
    return `<p class="fieldheader text-center text-uppercase fw-bold py-2 mb-3">${rawName}</p>
<input type="hidden" name="${fieldName}" value=":" />

`;
  }
  return out;
}

   

function generate(version) {
  if (version) {
    workspaceVersion = version === "v1" ? "v1" : "v2";
    syncVersionButtons();
  }
  if (!formFields.length) syncFromNameInput();
  else generateFromWorkspace();
  if (!formFields.length) return alert("Please enter at least one field name");
}

(function initWorkspace() {
  initWorkspaceUi();
})();
