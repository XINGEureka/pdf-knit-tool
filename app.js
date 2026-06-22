const STORAGE_KEY = "knittingRowMarkerStateV2";
const OLD_STORAGE_KEY = "knittingRowMarkerState";

const projectSelect = document.querySelector("#projectSelect");
const projectNameInput = document.querySelector("#projectNameInput");
const newProjectButton = document.querySelector("#newProjectButton");
const deleteProjectButton = document.querySelector("#deleteProjectButton");
const exportButton = document.querySelector("#exportButton");
const importFileInput = document.querySelector("#importFileInput");
const patternInput = document.querySelector("#patternInput");
const generateButton = document.querySelector("#generateButton");
const clearAllButton = document.querySelector("#clearAllButton");
const rowList = document.querySelector("#rowList");
const emptyState = document.querySelector("#emptyState");
const pdfViewer = document.querySelector("#pdfViewer");
const pdfFrame = document.querySelector("#pdfFrame");
const pdfCanvasStack = document.querySelector("#pdfCanvasStack");
const pdfRuler = document.querySelector("#pdfRuler");
const currentLine = document.querySelector("#currentLine");
const totalLines = document.querySelector("#totalLines");
const progressLabel = document.querySelector("#progressLabel");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const resetButton = document.querySelector("#resetButton");
const stitchCount = document.querySelector("#stitchCount");
const stitchMinusButton = document.querySelector("#stitchMinusButton");
const stitchPlusButton = document.querySelector("#stitchPlusButton");
const stitchResetButton = document.querySelector("#stitchResetButton");
const saveStatus = document.querySelector("#saveStatus");

let state = {
  activeProjectId: "",
  projects: []
};
let pdfRenderToken = 0;
let resizeTimer = 0;

const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  console.log("PDF.js worker 已设置：", PDFJS_WORKER_URL);
} else {
  console.log("PDF.js 未加载，PDF canvas 渲染不可用。");
}

function createProject(name = "未命名项目") {
  return {
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    input: "",
    rows: [],
    pdfDataUrl: "",
    pdfRulerTop: 120,
    currentIndex: 0,
    stitchCount: 0,
    updatedAt: new Date().toISOString()
  };
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function ensureProject() {
  if (state.projects.length === 0) {
    const project = createProject("毛衣前片");
    state.projects.push(project);
    state.activeProjectId = project.id;
  }

  if (!getActiveProject()) {
    state.activeProjectId = state.projects[0].id;
  }
}

function normalizeProject(project) {
  return {
    id: typeof project.id === "string" ? project.id : `project-${Date.now()}`,
    name: typeof project.name === "string" && project.name.trim() ? project.name.trim() : "未命名项目",
    input: typeof project.input === "string" ? project.input : "",
    pdfDataUrl: typeof project.pdfDataUrl === "string" ? project.pdfDataUrl : "",
    pdfRulerTop: Number.isFinite(project.pdfRulerTop) ? project.pdfRulerTop : 120,
    rows: Array.isArray(project.rows)
      ? project.rows.map((row) => {
          if (typeof row === "string") {
            return { text: row, note: "" };
          }

          return {
            text: typeof row.text === "string" ? row.text : "",
            note: typeof row.note === "string" ? row.note : ""
          };
        }).filter((row) => row.text.trim().length > 0)
      : [],
    currentIndex: Number.isInteger(project.currentIndex) ? project.currentIndex : 0,
    stitchCount: Number.isInteger(project.stitchCount) && project.stitchCount > 0 ? project.stitchCount : 0,
    updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : new Date().toISOString()
  };
}

function migrateOldState() {
  const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);

  if (!oldSaved) {
    return null;
  }

  try {
    const oldState = JSON.parse(oldSaved);
    const project = createProject("毛衣前片");
    project.input = typeof oldState.input === "string" ? oldState.input : "";
    project.rows = Array.isArray(oldState.rows)
      ? oldState.rows.map((text) => ({ text: String(text), note: "" })).filter((row) => row.text.trim())
      : [];
    project.currentIndex = Number.isInteger(oldState.currentIndex) ? oldState.currentIndex : 0;
    project.stitchCount = 0;
    localStorage.removeItem(OLD_STORAGE_KEY);
    return {
      activeProjectId: project.id,
      projects: [project]
    };
  } catch {
    localStorage.removeItem(OLD_STORAGE_KEY);
    return null;
  }
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    state = migrateOldState() || state;
    ensureProject();
    normalizeActiveIndex();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    state = {
      activeProjectId: typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : "",
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : []
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  ensureProject();
  normalizeActiveIndex();
}

function saveState(message = "已自动保存") {
  const project = getActiveProject();

  if (project) {
    project.updatedAt = new Date().toISOString();
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveStatus.textContent = message;
  } catch {
    saveStatus.textContent = "PDF 过大，无法完整保存";
    window.alert("PDF 文件较大，浏览器本地保存空间不足。当前页面可以继续使用，但刷新后可能需要重新导入 PDF。");
  }
}

function persistStateSilently() {
  const project = getActiveProject();

  if (project) {
    project.updatedAt = new Date().toISOString();
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 页面关闭时不弹窗，避免打断浏览器自己的关闭流程。
  }
}

function normalizeActiveIndex() {
  const project = getActiveProject();

  if (!project) {
    return;
  }

  if (project.pdfDataUrl && project.rows.length === 0) {
    project.currentIndex = Math.max(project.currentIndex, 0);
    return;
  }

  if (project.rows.length === 0) {
    if (project) {
      project.currentIndex = 0;
    }
    return;
  }

  project.currentIndex = Math.min(Math.max(project.currentIndex, 0), project.rows.length - 1);
}

function normalizePatternText(text) {
  return String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .replace(/\t/g, " ");
}

function parseRows(text, oldRows = []) {
  return normalizePatternText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      text: line,
      note: oldRows[index] && typeof oldRows[index].note === "string" ? oldRows[index].note : ""
    }));
}

function isStepStart(line) {
  return /^第\s*[\d一二三四五六七八九十百千]+\s*[行圈轮]/.test(line) ||
    /^(行|圈|轮)\s*\d+/.test(line) ||
    /^(R|Row|Rnd|Round)\s*\d+/i.test(line) ||
    /^\d+\s*[\.\)、）]/.test(line) ||
    /^\d+\s*[行圈轮]/.test(line);
}

function compactPdfText(text) {
  const lines = normalizePatternText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.filter(isStepStart).length < 2) {
    return compactPdfLooseLines(lines);
  }

  const compacted = [];

  lines.forEach((line) => {
    const lastIndex = compacted.length - 1;

    if (compacted.length === 0 || isStepStart(line)) {
      compacted.push(line);
      return;
    }

    compacted[lastIndex] = `${compacted[lastIndex]} ${line}`.replace(/\s+/g, " ").trim();
  });

  return compacted.join("\n");
}

function compactPdfLooseLines(lines) {
  const compacted = [];
  let current = "";

  lines.forEach((line) => {
    current = current ? `${current} ${line}`.replace(/\s+/g, " ").trim() : line;

    if (/[。！？；;:]$/.test(line) || current.length >= 80) {
      compacted.push(current);
      current = "";
    }
  });

  if (current) {
    compacted.push(current);
  }

  return compacted.join("\n");
}

function generateChart() {
  const project = getActiveProject();
  project.input = patternInput.value;
  project.rows = parseRows(project.input, project.rows);
  project.currentIndex = 0;
  render();
  saveState("图解已生成");
}

function setCurrentIndex(index) {
  const project = getActiveProject();

  if (!project || (project.rows.length === 0 && !project.pdfDataUrl)) {
    return;
  }

  project.currentIndex = project.pdfDataUrl
    ? Math.max(index, 0)
    : Math.min(Math.max(index, 0), project.rows.length - 1);
  project.stitchCount = 0;
  render();
  saveState();

  if (!project.pdfDataUrl) {
    scrollCurrentRowIntoView();
  }
}

function setStitchCount(count) {
  const project = getActiveProject();

  if (!project) {
    return;
  }

  project.stitchCount = Math.max(0, count);
  renderStitchCounter(project);
  saveState();
}

function setPdfRulerTop(top) {
  const project = getActiveProject();

  if (!project || !project.pdfDataUrl) {
    return;
  }

  const maxTop = Math.max(0, pdfViewer.clientHeight - pdfRuler.offsetHeight);
  project.pdfRulerTop = Math.min(Math.max(top, 0), maxTop);
  pdfRuler.style.top = `${project.pdfRulerTop}px`;
  saveState();
}

function scrollCurrentRowIntoView() {
  const currentRow = rowList.querySelector(".is-current");

  if (currentRow) {
    currentRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function switchProject(projectId) {
  state.activeProjectId = projectId;
  normalizeActiveIndex();
  render();
  saveState();
}

function addProject() {
  const name = window.prompt("请输入新项目名称：", "袖子");

  if (!name || !name.trim()) {
    return;
  }

  const project = createProject(name.trim());
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  render();
  saveState("新项目已创建");
}

function deleteProject() {
  const project = getActiveProject();

  if (!project) {
    return;
  }

  const shouldDelete = window.confirm(`确定要删除“${project.name}”吗？此操作不会影响已导出的文件。`);

  if (!shouldDelete) {
    return;
  }

  state.projects = state.projects.filter((item) => item.id !== project.id);
  ensureProject();
  render();
  saveState("项目已删除");
}

function exportProject() {
  const project = getActiveProject();

  if (!project) {
    return;
  }

  const content = JSON.stringify({
    type: "毛线编织行数标注器",
    version: 2,
    exportedAt: new Date().toISOString(),
    project
  }, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "-") || "编织图解";
  const downloadUrl = URL.createObjectURL(blob);

  link.href = downloadUrl;
  link.download = `${safeName}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  saveState("图解文件已导出");
}

function importProjectData(importedProject) {
  const project = normalizeProject({
    ...importedProject,
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${importedProject.name || "导入项目"}`
  });

  state.projects.unshift(project);
  state.activeProjectId = project.id;
  render();
  saveState("图解文件已导入");
}

function importTextAsProject(text, fileName, options = {}) {
  const cleanText = (options.compactPdf ? compactPdfText(text) : normalizePatternText(text)).trim();

  if (!cleanText) {
    throw new Error("没有提取到可用文字");
  }

  const projectName = fileName.replace(/\.[^.]+$/, "") || "导入项目";
  const project = createProject(projectName);
  project.input = cleanText;
  project.rows = parseRows(cleanText);
  importProjectData(project);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("PDF 文件读取失败。")));
    reader.readAsDataURL(file);
  });
}

async function importPdfAsProject(file) {
  const projectName = (file.name || "PDF 图解").replace(/\.[^.]+$/, "") || "PDF 图解";
  const project = createProject(projectName);

  console.log("开始读取 PDF 文件：", file.name, file.size);
  project.pdfDataUrl = await readFileAsDataUrl(file);
  console.log("PDF 文件读取完成，DataURL 长度：", project.pdfDataUrl.length);
  project.pdfRulerTop = 120;
  project.rows = [];
  project.input = "";
  importProjectData(project);
}

async function readUtf8File(file) {
  const buffer = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

async function readImportedFile(file) {
  const fileName = file.name || "导入项目";
  const extension = fileName.split(".").pop().toLowerCase();

  try {
    if (extension === "json") {
      const parsed = JSON.parse(normalizePatternText(await readUtf8File(file)));
      importProjectData(parsed.project ? parsed.project : parsed);
      return;
    }

    if (extension === "txt" || extension === "md") {
      importTextAsProject(await readUtf8File(file), fileName);
      return;
    }

    if (extension === "docx") {
      importTextAsProject(await extractDocxText(await file.arrayBuffer()), fileName);
      return;
    }

    if (extension === "pdf") {
      await importPdfAsProject(file);
      return;
    }

    if (extension === "doc") {
      window.alert("暂不支持老式 .doc 文件。请在 Word 或 WPS 中另存为 .docx，或复制文字粘贴到左侧输入框。");
      return;
    }

    window.alert("暂不支持这种文件格式。建议使用 .docx、.pdf、.txt 或本工具导出的 .json。");
  } catch (error) {
    window.alert(`导入失败：${error.message || "没有读取到可用文字"}`);
  } finally {
    importFileInput.value = "";
  }
}

function bytesToBinary(bytes) {
  let result = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return result;
}

async function inflateBytes(bytes, format = "deflate-raw") {
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持解压缩导入内容，请升级浏览器后再试。");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(bytes) {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index;
    }
  }

  return -1;
}

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

async function inflateZipBytes(bytes) {
  try {
    return await inflateBytes(bytes, "deflate-raw");
  } catch {
    return inflateBytes(bytes, "deflate");
  }
}

async function unzipDocxEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(bytes);

  if (eocdOffset < 0) {
    throw new Error("这个 .docx 文件结构无法识别。");
  }

  const entryCount = readUInt16(bytes, eocdOffset + 10);
  let centralOffset = readUInt32(bytes, eocdOffset + 16);
  const entries = new Map();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (readUInt32(bytes, centralOffset) !== 0x02014b50) {
      break;
    }

    const method = readUInt16(bytes, centralOffset + 10);
    const compressedSize = readUInt32(bytes, centralOffset + 20);
    const fileNameLength = readUInt16(bytes, centralOffset + 28);
    const extraLength = readUInt16(bytes, centralOffset + 30);
    const commentLength = readUInt16(bytes, centralOffset + 32);
    const localOffset = readUInt32(bytes, centralOffset + 42);
    const fileName = new TextDecoder("utf-8").decode(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));
    const localNameLength = readUInt16(bytes, localOffset + 26);
    const localExtraLength = readUInt16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(fileName, compressedData);
    } else if (method === 8) {
      entries.set(fileName, await inflateZipBytes(compressedData));
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function extractDocxText(arrayBuffer) {
  const entries = await unzipDocxEntries(arrayBuffer);
  const documentXml = entries.get("word/document.xml");

  if (!documentXml) {
    throw new Error("没有在 .docx 中找到正文内容。");
  }

  const xml = new TextDecoder("utf-8").decode(documentXml);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = Array.from(doc.getElementsByTagName("w:p")).map((paragraph) => {
    return Array.from(paragraph.childNodes).map((node) => collectDocxText(node)).join("").trim();
  }).filter(Boolean);

  return paragraphs.join("\n");
}

function collectDocxText(node) {
  if (node.nodeType !== 1) {
    return "";
  }

  const name = node.nodeName;

  if (name === "w:t") {
    return node.textContent;
  }

  if (name === "w:tab") {
    return " ";
  }

  if (name === "w:br") {
    return "\n";
  }

  return Array.from(node.childNodes).map((child) => collectDocxText(child)).join("");
}

async function extractPdfText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const raw = bytesToBinary(bytes);
  const streamTexts = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamPattern.exec(raw)) !== null) {
    const dictionary = match[1];
    const streamContent = match[2];
    let streamBytes = Uint8Array.from(streamContent, (char) => char.charCodeAt(0) & 255);

    try {
      if (/FlateDecode/.test(dictionary)) {
        streamBytes = await inflateBytes(streamBytes, "deflate");
      }

      streamTexts.push(extractPdfTextOperators(bytesToBinary(streamBytes)));
    } catch {
      streamTexts.push(extractPdfTextOperators(streamContent));
    }
  }

  const extracted = streamTexts.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (extracted) {
    return extracted;
  }

  const fallback = extractPdfTextOperators(raw).trim();

  if (fallback) {
    return fallback;
  }

  throw new Error("没有从 PDF 中提取到文字。如果这是扫描图片版 PDF，请先 OCR 或复制文字粘贴。");
}

function extractPdfTextOperators(content) {
  const pieces = [];
  const textPattern = /\((?:\\.|[^\\)])*\)\s*Tj|\[(.*?)\]\s*TJ/g;
  let match;

  while ((match = textPattern.exec(content)) !== null) {
    const token = match[0];

    if (token.endsWith("Tj")) {
      pieces.push(decodePdfString(token.slice(0, token.lastIndexOf(")")) + ")"));
    } else if (match[1]) {
      const parts = match[1].match(/\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>/g) || [];
      pieces.push(parts.map((part) => part.startsWith("(") ? decodePdfString(part) : decodePdfHexString(part)).join(""));
    }

    pieces.push("\n");
  }

  return pieces.join("").replace(/\n{3,}/g, "\n\n");
}

function decodePdfString(value) {
  return value
    .slice(1, -1)
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePdfHexString(value) {
  const hex = value.slice(1, -1).replace(/\s/g, "");
  const bytes = [];

  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2).padEnd(2, "0"), 16));
  }

  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function clearAll() {
  const shouldClear = window.confirm("确定要清空所有项目、输入内容、备注和当前进度吗？");

  if (!shouldClear) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(OLD_STORAGE_KEY);
  state = {
    activeProjectId: "",
    projects: []
  };
  ensureProject();
  render();
  saveStatus.textContent = "已清空";
}

function updateProjectOptions(project) {
  projectSelect.innerHTML = "";

  state.projects.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    projectSelect.appendChild(option);
  });

  projectSelect.value = project.id;
  projectNameInput.value = project.name;
  deleteProjectButton.disabled = state.projects.length <= 1;
}

function renderRows(project) {
  rowList.innerHTML = "";
  const hasPdf = Boolean(project.pdfDataUrl);

  pdfViewer.classList.toggle("is-hidden", !hasPdf);
  rowList.hidden = hasPdf;
  emptyState.classList.toggle("is-hidden", hasPdf || project.rows.length > 0);

  if (hasPdf) {
    renderPdfViewer(project);
    return;
  }

  pdfFrame.removeAttribute("src");
  pdfCanvasStack.innerHTML = "";

  project.rows.forEach((row, index) => {
    const item = document.createElement("li");
    const number = document.createElement("span");
    const body = document.createElement("div");
    const content = document.createElement("span");
    const noteToggle = document.createElement("button");
    const notePreview = document.createElement("div");
    const noteEditor = document.createElement("textarea");

    item.className = "row-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `跳转到第 ${index + 1} 行`);

    if (index < project.currentIndex) {
      item.classList.add("is-complete");
    }

    if (index === project.currentIndex && project.rows.length > 0) {
      item.classList.add("is-current");
      item.setAttribute("aria-current", "step");
    }

    number.className = "row-number";
    number.textContent = `第 ${index + 1} 行`;
    body.className = "row-body";
    content.className = "row-text";
    content.textContent = row.text;

    noteToggle.className = "note-toggle";
    noteToggle.type = "button";
    noteToggle.textContent = row.note ? "编辑备注" : "添加备注";
    noteToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      noteEditor.hidden = !noteEditor.hidden;
      noteEditor.focus();
    });

    notePreview.className = "note-preview";
    notePreview.textContent = row.note ? `备注：${row.note}` : "";
    notePreview.hidden = !row.note;

    noteEditor.className = "note-editor";
    noteEditor.placeholder = "给这一行添加备注，例如：这里换 4.0mm 针";
    noteEditor.value = row.note;
    noteEditor.hidden = true;
    noteEditor.addEventListener("click", (event) => event.stopPropagation());
    noteEditor.addEventListener("keydown", (event) => event.stopPropagation());
    noteEditor.addEventListener("input", () => {
      row.note = noteEditor.value;
      noteToggle.textContent = row.note ? "编辑备注" : "添加备注";
      notePreview.textContent = row.note ? `备注：${row.note}` : "";
      notePreview.hidden = !row.note;
      saveState();
    });

    body.append(content, noteToggle, notePreview, noteEditor);
    item.append(number, body);
    item.addEventListener("click", () => setCurrentIndex(index));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setCurrentIndex(index);
      }
    });

    rowList.appendChild(item);
  });
}

function renderPdfViewer(project) {
  pdfFrame.removeAttribute("src");
  renderPdfCanvases(project);

  const maxTop = Math.max(0, pdfViewer.clientHeight - pdfRuler.offsetHeight);
  const top = Math.min(Math.max(project.pdfRulerTop || 120, 0), maxTop);

  project.pdfRulerTop = top;
  pdfRuler.style.top = `${top}px`;
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function renderPdfCanvases(project) {
  if (!project.pdfDataUrl) {
    return;
  }

  if (!window.pdfjsLib) {
    console.log("PDF 渲染失败：PDF.js 未加载。");
    return;
  }

  const token = ++pdfRenderToken;
  const viewportWidth = Math.max(280, pdfViewer.clientWidth || window.innerWidth);

  console.log("开始渲染 PDF，viewport 宽度：", viewportWidth);
  pdfCanvasStack.innerHTML = "";

  try {
    const pdf = await window.pdfjsLib.getDocument({ data: dataUrlToUint8Array(project.pdfDataUrl) }).promise;
    console.log("PDF 加载成功，页数：", pdf.numPages);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (token !== pdfRenderToken) {
        console.log("PDF 渲染被新的 resize 或项目切换中断。");
        return;
      }

      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(0.1, (viewportWidth - 24) / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      pdfCanvasStack.appendChild(canvas);
      await page.render({ canvasContext: context, viewport }).promise;
      console.log(`PDF 第 ${pageNumber} 页渲染成功：`, canvas.width, canvas.height);
    }
  } catch (error) {
    console.log("PDF 渲染失败：", error);
  }
}

function renderCounter(project) {
  if (project.pdfDataUrl) {
    currentLine.textContent = String(project.currentIndex + 1);
    totalLines.textContent = "PDF";
    progressLabel.textContent = "当前标记行 / PDF";
    prevButton.disabled = project.currentIndex === 0;
    nextButton.disabled = false;
    resetButton.disabled = project.currentIndex === 0;
    return;
  }

  const total = project.rows.length;
  progressLabel.textContent = "当前行 / 总行数";
  currentLine.textContent = total === 0 ? "0" : String(project.currentIndex + 1);
  totalLines.textContent = String(total);

  prevButton.disabled = total === 0 || project.currentIndex === 0;
  nextButton.disabled = total === 0 || project.currentIndex === total - 1;
  resetButton.disabled = total === 0;
}

function renderStitchCounter(project) {
  stitchCount.textContent = String(project.stitchCount || 0);
  stitchMinusButton.disabled = (project.stitchCount || 0) === 0;
  stitchResetButton.disabled = (project.stitchCount || 0) === 0;
}

function render() {
  ensureProject();
  normalizeActiveIndex();

  const project = getActiveProject();
  document.body.classList.toggle("pdf-mode", Boolean(project.pdfDataUrl));
  updateProjectOptions(project);
  patternInput.value = project.input;
  renderRows(project);
  renderCounter(project);
  renderStitchCounter(project);
}

projectSelect.addEventListener("change", () => {
  switchProject(projectSelect.value);
});

projectNameInput.addEventListener("input", () => {
  const project = getActiveProject();
  const name = projectNameInput.value.trim() || "未命名项目";
  project.name = name;
  updateProjectOptions(project);
  saveState();
});

newProjectButton.addEventListener("click", addProject);
deleteProjectButton.addEventListener("click", deleteProject);
exportButton.addEventListener("click", exportProject);

importFileInput.addEventListener("click", () => {
  importFileInput.value = "";
});

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files && importFileInput.files[0];

  console.log("文件选择 change 事件触发：", file ? file.name : "未选择文件");

  if (file) {
    readImportedFile(file);
  }
});

generateButton.addEventListener("click", generateChart);

patternInput.addEventListener("input", () => {
  const project = getActiveProject();
  project.input = patternInput.value;
  saveState();
});

prevButton.addEventListener("click", () => {
  const project = getActiveProject();
  setCurrentIndex(project.currentIndex - 1);
});

nextButton.addEventListener("click", () => {
  const project = getActiveProject();
  setCurrentIndex(project.currentIndex + 1);
});

resetButton.addEventListener("click", () => {
  setCurrentIndex(0);
});

stitchMinusButton.addEventListener("click", () => {
  const project = getActiveProject();
  setStitchCount((project.stitchCount || 0) - 1);
});

stitchPlusButton.addEventListener("click", () => {
  const project = getActiveProject();
  setStitchCount((project.stitchCount || 0) + 1);
});

stitchResetButton.addEventListener("click", () => {
  setStitchCount(0);
});

pdfRuler.addEventListener("pointerdown", (event) => {
  const startY = event.clientY;
  const project = getActiveProject();
  const startTop = project ? project.pdfRulerTop || 0 : 0;

  pdfRuler.setPointerCapture(event.pointerId);

  function handleMove(moveEvent) {
    setPdfRulerTop(startTop + moveEvent.clientY - startY);
  }

  function handleUp() {
    pdfRuler.removeEventListener("pointermove", handleMove);
    pdfRuler.removeEventListener("pointerup", handleUp);
    pdfRuler.removeEventListener("pointercancel", handleUp);
  }

  pdfRuler.addEventListener("pointermove", handleMove);
  pdfRuler.addEventListener("pointerup", handleUp);
  pdfRuler.addEventListener("pointercancel", handleUp);
});

pdfRuler.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return;
  }

  const project = getActiveProject();
  const step = event.shiftKey ? 20 : 6;

  event.preventDefault();
  setPdfRulerTop((project.pdfRulerTop || 0) + (event.key === "ArrowDown" ? step : -step));
});

clearAllButton.addEventListener("click", clearAll);

window.addEventListener("pagehide", persistStateSilently);

window.addEventListener("resize", () => {
  const project = getActiveProject();

  if (!project || !project.pdfDataUrl) {
    return;
  }

  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    console.log("窗口尺寸变化，重新渲染 PDF。");
    renderPdfViewer(project);
  }, 180);
});

loadState();
render();
