
    function normalizeFieldName(name) {
      return (name || "")
        .trim()
        .replace(/[\s\u00A0]+/g, "_")
        .replace(/[\/\\]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "") || "field";
    }
    
    /** True if the field name suggests contact / phone number. */
    function isPhoneContactField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      const phoneKeywords = /contact|phone|mobile|telephone|cell|fax/;
      return phoneKeywords.test(lower);
    }
    
    /** True if the field name suggests email address. */
    function isEmailField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      return /email|e-mail|e_mail/.test(lower);
    }
    
    /** True if the field name suggests time. */
    function isTimeField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      return /\btime\b/.test(lower);
    }
    
    /** True if the field name suggests date. */
    function isDateField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      return /\bdate\b/.test(lower);
    }

    /** True if the label suggests amount/currency (e.g. salary, price, cost). */
    function isAmountField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      return /\b(amount|salary|salaries|price|cost|fee|fees|payment|income|revenue|budget|total|sum|wage|compensation)\b/.test(lower);
    }

    /** True if the label suggests age. */
    function isAgeField(rawName) {
      const lower = (rawName || "").trim().toLowerCase();
      return /\bage\b/.test(lower);
    }

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

    /** When type is "text", resolve to amount/age/numberOnly/upload if the label suggests it. */
    function resolveTextSubtype(rawName, type) {
      if (type !== "text") return type;
      if (isAmountField(rawName)) return "amount";
      if (isAgeField(rawName)) return "age";
      if (isNumberOnlyField(rawName)) return "numberOnly";
      if (isUploadField(rawName)) return "upload";
      return type;
    }

    function getFieldLines() {
      return document
        .getElementById("fieldNames")
        .value
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
    }
    
    let parsedFields = [];
    
    /** Parse reference text into [{ rawName, type, options? }]. Supports (in order of preference):
     * 1) Preferred: "Label - [Text field]" or "Full Name - [Email field]" (dash before bracket).
     * 2) Run-on text (PDF-style): "Label  [Text field]  description..." and "●   Option1  ●   Option2"
     * 3) Line-based: "Label\n[Text field]" with options on following lines.
     * 4) Dash format: "Label - text field", "Label - radio: A, B, C".
     */
    function parseFormReference(text) {
      const str = (text || "").trim();
      const dashBracketResult = parseFormReferenceDashBracket(str);
      if (dashBracketResult.length > 0) return dashBracketResult;
      const typeRe = /\[(Text\s*field|Email\s*field|Radio\s*Buttons?|Date\s*Picker|Time\s*Picker|Checkbox|Amount|Age|Number\s*only|Upload)\]/gi;
      const runOnMatches = [];
      let m;
      while ((m = typeRe.exec(str)) !== null) runOnMatches.push({ index: m.index, type: m[1], full: m[0] });
      if (runOnMatches.length > 0) {
        return parseFormReferenceRunOn(str, runOnMatches);
      }
      const rawLines = str.split(/\r?\n/).map(l => l.trim());
      const result = [];
      const typeLineRe = /^\s*\[(Text\s*field|Email\s*field|Radio\s*Buttons?|Date\s*Picker|Time\s*Picker|Checkbox|Amount|Age|Number\s*only|Upload)\]\s*$/i;
      let i = 0;
      while (i < rawLines.length) {
        const line = rawLines[i];
        const typeMatch = line.match(typeLineRe);
        if (typeMatch) {
          const label = i > 0 ? rawLines[i - 1] : "";
          if (!label) { i++; continue; }
          let type = "text";
          const t = typeMatch[1].toLowerCase();
          if (/email/.test(t)) type = "email";
          else if (/radio/.test(t)) type = "radio";
          else if (/checkbox/.test(t)) type = "checkbox";
          else if (/date/.test(t)) type = "date";
          else if (/time/.test(t)) type = "time";
          else if (/^amount$/.test(t)) type = "amount";
          else if (/^age$/.test(t)) type = "age";
          else if (/number\s*only/.test(t)) type = "numberOnly";
          else if (/^upload$/.test(t)) type = "upload";
          type = resolveTextSubtype(label, type);
          let options = null;
          if (type === "radio" || type === "checkbox") {
            options = [];
            const descStartRe = /^(Select|Choose|Enter|Optional|If applicable|Used for|Provide|This person)/i;
            let j = i + 1;
            while (j < rawLines.length) {
              const ln = rawLines[j];
              if (ln.match(/^\s*\[.+\]\s*$/)) break;
              if (ln === "" && type === "radio") { j++; continue; }
              if (type === "radio" && (descStartRe.test(ln) || (ln.length > 55 && /\.\s*$/.test(ln)))) break;
              if (ln !== "") options.push(ln);
              j++;
            }
            options = options.length ? options : null;
          }
          result.push({ rawName: label, type, options: options && options.length ? options : null });
          i++;
          continue;
        }
        const dashMatch = line.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
        if (dashMatch) {
          let rawName = dashMatch[1].trim();
          let rest = dashMatch[2].trim().toLowerCase();
          let type = "text";
          let options = null;
          if (/email/.test(rest)) type = "email";
          else if (/radio/.test(rest)) {
            type = "radio";
            const colonOpts = line.match(/radio\s*[:\s]+(.+)$/i);
            if (colonOpts && colonOpts[1]) options = colonOpts[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
          } else if (/checkbox|check\s*box/.test(rest)) {
            type = "checkbox";
            const colonOpts = line.match(/checkbox\s*[:\s]+(.+)$/i) || line.match(/check\s*box\s*[:\s]+(.+)$/i);
            if (colonOpts && colonOpts[1]) options = colonOpts[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
          } else if (/date/.test(rest)) type = "date";
          else if (/time/.test(rest)) type = "time";
          else if (/^amount$/.test(rest)) type = "amount";
          else if (/^age$/.test(rest)) type = "age";
          else if (/number\s*only/.test(rest)) type = "numberOnly";
          else if (/^upload$/.test(rest)) type = "upload";
          type = resolveTextSubtype(rawName, type);
          if (rawName) result.push({ rawName, type, options });
        }
        i++;
      }
      return result;
    }
    
    /** Extract options from text after [Radio Buttons] or [Checkbox]. Supports:
     * 1) Bullet format: "● Option A\n● Option B" or "● Soccer  ● Basketball  ● Volleyball" (one line). If "● Option  Next Label" appears, only "Option" is taken.
     * 2) Options: format: "Options:\nOption A\nOption B" or "Options: (Option A\nOption B\nOther)"
     */
    function extractOptionsFromAfterText(afterText) {
      const descStartRe = /^(Select|Choose|Enter|Optional|If applicable|Used for|Provide|This person)/i;
      const trim = (s) => s.trim();
      const notInstruction = (opt) => opt.length > 0 && !descStartRe.test(opt) && !(opt.length > 55 && /\.\s*$/.test(opt));
      function takeFirstSegment(text) {
        const t = trim(text);
        if (/\s{2,}/.test(t)) return t.split(/\s{2,}/)[0].trim();
        return t;
      }
      if (/[●•]/.test(afterText)) {
        const fullAfterText = afterText;
        const lines = afterText.split(/\r?\n/);
        let lastBulletIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*[●•]/.test(lines[i])) lastBulletIdx = i;
        }
        if (lastBulletIdx >= 0) {
          afterText = lines.slice(0, lastBulletIdx + 1).join("\n");
        }
        const opts = [];
        const bulletLineRe = /^\s*[●•]\s*(.+)$/;
        afterText.split(/\r?\n/).forEach((line) => {
          const m = line.match(bulletLineRe);
          if (!m) return;
          const afterBullet = trim(m[1]);
          const parts = afterBullet.split(/\s*[●•]\s*/).map(trim).filter(Boolean);
          if (parts.length > 1) {
            parts.forEach((p) => {
              const opt = takeFirstSegment(p);
              if (opt && notInstruction(opt)) opts.push(opt);
            });
          } else {
            const opt = takeFirstSegment(afterBullet);
            if (opt && notInstruction(opt)) opts.push(opt);
          }
        });
        if (opts.length > 0) return opts;
        if (opts.length === 1 && fullAfterText.includes("\n")) {
          const nextFieldRe = /\s*-\s*\[(?:Text\s*field|Email\s*field|Radio\s*Buttons?|Date\s*Picker|Time\s*Picker|Checkbox|Amount|Age|Number\s*only|Upload)\]/i;
          const byNewline = fullAfterText.split(/\r?\n/).map(trim).filter(Boolean);
          const lineOpts = [];
          for (const line of byNewline) {
            if (nextFieldRe.test(line)) break;
            const cleaned = line.replace(/^\s*[●•]\s*/, "");
            if (cleaned.length > 0 && cleaned.length < 120 && notInstruction(cleaned)) lineOpts.push(cleaned);
          }
          if (lineOpts.length > 1) return lineOpts;
        }
      }
      const normalized = afterText.replace(/^Options:\s*/i, "").replace(/^Options:\s*\(\s*/i, "").replace(/\s*\)\s*$/, "");
      const byLine = normalized.split(/\r?\n/).map(trim).filter(line => line && line !== "(" && line !== ")");
      const opts = byLine.filter(notInstruction);
      if (opts.length > 0) return opts;
      if (afterText.length > 0 && afterText.length < 600) return [afterText.trim()];
      return null;
    }
    
    /** Preferred format: "Full Name - [Text field]" or "Primary Contact Name- [Text field]" (space before dash optional). */
    function parseFormReferenceDashBracket(str) {
      const result = [];
      const re = /\s*-\s*\[(Text\s*field|Email\s*field|Radio\s*Buttons?|Date\s*Picker|Time\s*Picker|Checkbox|Amount|Age|Number\s*only|Upload)\]/gi;
      const matches = [];
      let match;
      while ((match = re.exec(str)) !== null) {
        matches.push({ index: match.index, type: match[1], full: match[0], dashStart: match.index });
      }
      if (matches.length === 0) return result;
      for (let k = 0; k < matches.length; k++) {
        const labelEnd = matches[k].dashStart;
        const labelStart = k === 0 ? 0 : (matches[k - 1].index + matches[k - 1].full.length);
        let beforeDash = str.slice(labelStart, labelEnd).trim().replace(/\s*-\s*$/, "").trim();
        const chunks = beforeDash.split(/\s{2,}/).filter(Boolean);
        const rawName = chunks.length ? chunks[chunks.length - 1].trim() : beforeDash || "Field";
        let type = "text";
        const t = matches[k].type.toLowerCase();
        if (/email/.test(t)) type = "email";
        else if (/radio/.test(t)) type = "radio";
        else if (/checkbox/.test(t)) type = "checkbox";
        else if (/date/.test(t)) type = "date";
        else if (/time/.test(t)) type = "time";
        else if (/^amount$/.test(t)) type = "amount";
        else if (/^age$/.test(t)) type = "age";
        else if (/number\s*only/.test(t)) type = "numberOnly";
        else if (/^upload$/.test(t)) type = "upload";
        let options = null;
        if (type === "radio" || type === "checkbox") {
          const afterStart = matches[k].index + matches[k].full.length;
          const afterEnd = (k + 1 < matches.length) ? matches[k + 1].index : str.length;
          const afterText = str.slice(afterStart, afterEnd).trim();
          options = extractOptionsFromAfterText(afterText);
        }
        type = resolveTextSubtype(rawName, type);
        result.push({ rawName, type, options });
      }
      return result;
    }
    
    function parseFormReferenceRunOn(str, runOnMatches) {
      const result = [];
      for (let k = 0; k < runOnMatches.length; k++) {
        const { index, type: typeStr, full } = runOnMatches[k];
        const labelStart = k === 0 ? 0 : (runOnMatches[k - 1].index + runOnMatches[k - 1].full.length);
        const beforeBracket = str.slice(labelStart, index).trim();
        const chunks = beforeBracket.split(/\s{2,}/).filter(Boolean);
        const rawName = chunks.length ? chunks[chunks.length - 1].trim() : (beforeBracket.slice(-80).trim() || "Field");
        let type = "text";
        const t = typeStr.toLowerCase();
        if (/email/.test(t)) type = "email";
        else if (/radio/.test(t)) type = "radio";
        else if (/checkbox/.test(t)) type = "checkbox";
        else if (/date/.test(t)) type = "date";
        else if (/time/.test(t)) type = "time";
        else if (/^amount$/.test(t)) type = "amount";
        else if (/^age$/.test(t)) type = "age";
        else if (/number\s*only/.test(t)) type = "numberOnly";
        else if (/^upload$/.test(t)) type = "upload";
        let options = null;
        if (type === "radio" || type === "checkbox") {
          const afterBracketStart = index + full.length;
          const afterEnd = (k + 1 < runOnMatches.length) ? runOnMatches[k + 1].index : str.length;
          const afterText = str.slice(afterBracketStart, afterEnd).trim();
          options = extractOptionsFromAfterText(afterText);
        }
        type = resolveTextSubtype(rawName, type);
        result.push({ rawName, type, options });
      }
      return result;
    }
    
    function updateParsedPreview() {
      const el = document.getElementById("parsedPreview");
      if (!parsedFields.length) {
        el.classList.add("empty");
        el.textContent = "";
        return;
      }
      el.classList.remove("empty");
      el.innerHTML = "Using reference: <strong>" + parsedFields.length + " field(s)</strong> — " +
        parsedFields.map(f => f.rawName + " (" + f.type + (f.options ? ": " + f.options.join(", ") : "") + ")").join(", ");
    }
    
    function parseFormReferenceFromInput() {
      const text = document.getElementById("formReferenceText").value.trim();
      if (!text) {
        alert("Paste form reference text or upload a PDF/DOCX file first.");
        return;
      }
      parsedFields = parseFormReference(text);
      if (!parsedFields.length) {
        alert("No fields found. Preferred format: Full Name - [Text field], Email - [Email field], or Label - text field");
        return;
      }
      updateParsedPreview();
    }
    
    function clearFormReference() {
      parsedFields = [];
      document.getElementById("formReferenceText").value = "";
      document.getElementById("formReferenceFile").value = "";
      updateParsedPreview();
      document.getElementById("parsedPreview").classList.add("empty");
    }
    
    async function extractTextFromPdf(arrayBuffer) {
      if (typeof pdfjsLib === "undefined") return "";
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map(it => it.str).join(" ");
        fullText += line + "\n";
      }
      return fullText;
    }
    
    async function extractTextFromDocx(arrayBuffer) {
      if (typeof mammoth === "undefined") return "";
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value || "";
    }
    
    async function handleFormReferenceFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const name = (file.name || "").toLowerCase();
      const isPdf = name.endsWith(".pdf");
      const isDocx = name.endsWith(".docx");
      if (!isPdf && !isDocx) {
        alert("Please upload a PDF or DOCX file.");
        return;
      }
      const arrayBuffer = await file.arrayBuffer();
      let text = "";
      try {
        if (isPdf) text = await extractTextFromPdf(arrayBuffer);
        else text = await extractTextFromDocx(arrayBuffer);
      } catch (e) {
        alert("Could not read file: " + (e.message || "unknown error"));
        return;
      }
      document.getElementById("formReferenceText").value = text;
      parsedFields = parseFormReference(text);
      updateParsedPreview();
      if (!parsedFields.length) {
        alert("File read OK but no field lines found. Preferred format: Full Name - [Text field], Email - [Email field]");
        return;
      }
      generate("v1");
    }
    
    function toggleRadioOptions() {
      const type = document.getElementById("fieldType").value;
      const box = document.getElementById("radioOptionsBox");
      if (type === "radio" || type === "checkbox") {
        box.classList.add("visible");
      } else {
        box.classList.remove("visible");
      }
    }
    
    function copyOutput() {
      const output = document.getElementById("output");
      const copyBtn = document.getElementById("copyBtn");
      const text = output.value;
      if (!text.trim()) return alert("Nothing to copy. Generate output first.");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("copied");
          }, 1500);
        }).catch(() => fallbackCopy(text));
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
    
    let outputHistory = [];
    let mergeState = null;
    let selectedMergeCols = 2;
    
    function parseSelectionToBlocks(text) {
      const chunks = text.split(/\n\s*\n/).filter(c => c.trim());
      const blocks = [];
      let isV1 = false;
      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (trimmed.indexOf("<div class=\"form_box\">") === 0 || trimmed.indexOf('<div class="form_box">') === 0) {
          isV1 = true;
        }
        if (trimmed.indexOf("<div class=\"form_box\">") !== 0 && trimmed.indexOf('<div class="form_box">') !== 0 &&
            trimmed.indexOf("<div class=\"row g-3 mb-3\">") !== 0 && trimmed.indexOf('<div class="row g-3 mb-3">') !== 0) {
          continue;
        }
        const labelMatch = chunk.match(/\$input->label\s*\(\s*['"]([^'"]*)['"]/);
        const fieldsMatch = chunk.match(/\$input->fields\s*\(\s*['"]([^'"]*)['"]/);
        const phoneMatch = chunk.match(/\$input->phoneInput\s*\(\s*['"]([^'"]*)['"],\s*[^,]+,?\s*['"]([^'"]*)['"]/);
        const emailMatch = chunk.match(/\$input->email\s*\(\s*['"]([^'"]*)['"]/);
        let label = (labelMatch && labelMatch[1]) ? labelMatch[1] : "";
        let fieldName = (fieldsMatch && fieldsMatch[1]) ? fieldsMatch[1] : "";
        if (!fieldName && phoneMatch) fieldName = phoneMatch[2] || phoneMatch[1];
        if (!fieldName && emailMatch) fieldName = emailMatch[1];
        if (!fieldName) fieldName = label.replace(/\s+/g, "_");
        if (label || fieldName) blocks.push({ label: label || fieldName, fieldName });
      }
      return { blocks, isV1 };
    }
    
    function buildMergedHtml(blocks, numCols, isV1) {
      const n = Math.min(numCols, blocks.length);
      const baseName = (blocks[0] && blocks[0].fieldName) ? blocks[0].fieldName.replace(/_+$/, "") : "Field";
      const label = (blocks[0] && blocks[0].label) ? blocks[0].label : baseName;
      const suffixes = ["", "_", "__"];
      const esc = (s) => (s + "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      let html = "";
      if (isV1) {
        const colClass = "form_box_col" + (n === 2 ? "2" : "3");
        html += "<div class=\"form_box\">\n";
        html += "    <div class=\"" + colClass + "\">\n";
        for (let i = 0; i < n; i++) {
          const fn = baseName + suffixes[i];
          html += "        <div class=\"group\">\n";
          html += "            <?php\n";
          html += "                $input->label('" + esc(label) + "', '');\n";
          html += "                $input->fields('" + esc(fn) + "', 'form_field', '" + esc(fn) + "', 'placeholder=\"Enter " + esc(label.toLowerCase()) + " here\"');\n";
          html += "            ?>\n";
          html += "        </div>\n";
        }
        html += "    </div>\n";
        html += "</div>\n";
      } else {
        const colClass = "col-md-" + (n === 2 ? "6" : "4");
        html += "<div class=\"row g-3 mb-3\">\n";
        for (let i = 0; i < n; i++) {
          const fn = baseName + suffixes[i];
          html += "    <div class=\"" + colClass + "\">\n";
          html += "        <?php $input->fields('" + esc(fn) + "', 'form-control', '" + esc(fn) + "', ''); ?>\n";
          html += "    </div>\n";
        }
        html += "</div>\n";
      }
      return html;
    }
    
    function openMergeModal() {
      const output = document.getElementById("output");
      const start = output.selectionStart;
      const end = output.selectionEnd;
      const selectedText = (start < end) ? output.value.slice(start, end) : output.value;
      const { blocks, isV1 } = parseSelectionToBlocks(selectedText);
      if (blocks.length < 2 || blocks.length > 3) {
        alert("Select 2 or 3 field blocks in the output to merge. Highlight the HTML for 2 or 3 fields, then click Merge.");
        return;
      }
      mergeState = { selectionStart: start, selectionEnd: end, blocks, isV1 };
      document.getElementById("mergeBlockCount").textContent = blocks.length;
      selectedMergeCols = blocks.length;
      const choiceBtns = document.querySelectorAll(".merge-modal-choices button");
      choiceBtns.forEach((btn) => {
        const cols = parseInt(btn.getAttribute("data-cols"), 10);
        const allowed = cols <= blocks.length;
        btn.disabled = !allowed;
        btn.style.opacity = allowed ? "1" : "0.5";
        btn.classList.toggle("selected", cols === selectedMergeCols);
        btn.onclick = function() {
          if (!allowed) return;
          choiceBtns.forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedMergeCols = cols;
        };
      });
      document.getElementById("mergeModal").classList.add("visible");
      document.getElementById("mergeModal").setAttribute("aria-hidden", "false");
    }
    
    function closeMergeModal() {
      document.getElementById("mergeModal").classList.remove("visible");
      document.getElementById("mergeModal").setAttribute("aria-hidden", "true");
      mergeState = null;
    }

    let fileGuideEscapeHandler = null;
    function openFileGuideModal() {
      const el = document.getElementById("fileGuideModal");
      el.classList.add("visible");
      el.setAttribute("aria-hidden", "false");
      fileGuideEscapeHandler = function(e) {
        if (e.key === "Escape") closeFileGuideModal();
      };
      document.addEventListener("keydown", fileGuideEscapeHandler);
    }
    function closeFileGuideModal() {
      if (fileGuideEscapeHandler) {
        document.removeEventListener("keydown", fileGuideEscapeHandler);
        fileGuideEscapeHandler = null;
      }
      document.getElementById("fileGuideModal").classList.remove("visible");
      document.getElementById("fileGuideModal").setAttribute("aria-hidden", "true");
    }

    function applyMerge() {
      if (!mergeState) return closeMergeModal();
      const output = document.getElementById("output");
      const cols = selectedMergeCols;
      const merged = buildMergedHtml(mergeState.blocks, cols, mergeState.isV1);
      outputHistory.push(output.value);
      const before = output.value.slice(0, mergeState.selectionStart);
      const after = output.value.slice(mergeState.selectionEnd);
      output.value = before + merged + after;
      closeMergeModal();
      output.focus();
      output.setSelectionRange(mergeState.selectionStart, mergeState.selectionStart + merged.length);
    }
    
    function undoMerge() {
      if (!outputHistory.length) {
        alert("Nothing to undo.");
        return;
      }
      const output = document.getElementById("output");
      output.value = outputHistory.pop();
      output.focus();
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
    
    /** Render one field's HTML (for parsed reference). */
    function renderOneField(rawName, fieldName, type, optionsArray, version) {
      const r = escPhp(rawName);
      const f = escPhp(normalizeFieldName(fieldName));
      const rLower = escPhp((rawName || "").toLowerCase());
      const opts = optionsArray && optionsArray.length ? formatOptionsForPhp(optionsArray) : null;
      let out = "";
      if (type === "email") {
        out = version === "v1"
          ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${r}', '');
                $input->email('${r}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"', '', '', '${r}');
            ?>
        </div>
    </div>
</div>

`
          : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->email('${r}', '', '${f}', '', '', '', '${r}'); ?>
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
                $input->email('${r}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"', '', '', '${r}');
            ?>
        </div>
    </div>
</div>

`
            : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->email('${r}', '', '${f}', '', '', '', '${r}'); ?>
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
                $input->label('${r}', '');
                $input->fields('${f}', 'form_field', '${f}', 'placeholder="Enter ${rLower} here"');
            ?>
        </div>
    </div>
</div>

`
            : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->fields('${f}', 'form-control', '${f}', ''); ?>
    </div>
</div>

`;
        }
      } else if (type === "radio") {
        const optionsStr = opts || formatOptionsForPhp(["Option 1", "Option 2"]);
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
            $input->radio('${f}', array(${optionsStr}), '${f}', '', '3');
        ?>
    </div>
</div>

`;
      } else if (type === "checkbox") {
        const optionsStr = opts || formatOptionsForPhp(["Option 1", "Option 2"]);
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
            $input->chkboxVal('${f}', array(${optionsStr}), '${f}', '', '3');
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
      }
      return out;
    }
    
    /**
     * Radio/checkbox options: one option per line (newline separates).
     * Spaces and commas on the same line stay in that option.
     * Option 1\nOption 2\nOption 3 → 3 options.
     * Option 1 Option 2\nOption 3 → 2 options (first line = one option).
     */
    function getRadioOptions() {
      const raw = document.getElementById("radioOptions").value;
      const quoted = [];
      const placeholder = (i) => "\u0000Q" + i + "\u0000";
      let str = raw.replace(/"((?:[^"\\]|\\.)*)"/g, (_, content) => {
        quoted.push(content.replace(/\\"/g, '"'));
        return placeholder(quoted.length - 1);
      });
      const tokens = str
        .split(/[\r\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
      const options = tokens.map(opt => {
        const m = opt.match(/^\u0000Q(\d+)\u0000$/);
        return m ? quoted[parseInt(m[1], 10)] : opt;
      });
      return options
        .map(opt => `"${(opt + "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(", ");
    }   
    
    function generate(version) {
      let output = "";
      if (parsedFields.length > 0) {
        parsedFields.forEach(f => {
          const fieldName = normalizeFieldName(f.rawName);
          output += renderOneField(f.rawName, fieldName, f.type, f.options || null, version);
        });
        outputHistory = [];
        document.getElementById("output").value = output.trim();
        return;
      }
      const type = document.getElementById("fieldType").value;
      const fields = getFieldLines();
      if (!fields.length) return alert("Please enter at least one field name");
    
      fields.forEach(rawName => {
        const fieldName = normalizeFieldName(rawName);
    
        if (type === "text") {
          const isPhone = isPhoneContactField(rawName);
          const isEmail = isEmailField(rawName);
          const isTime = isTimeField(rawName);
          const isDate = isDateField(rawName);
          if (isPhone) {
            output += version === "v1"
              ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->phoneInput('${rawName}', 'form_field', '${fieldName}', 'placeholder="Enter ${rawName.toLowerCase()} here" onkeypress="return isNumberKey(evt)"');
            ?>
        </div>
    </div>
</div>

`
              : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->phoneInput('${rawName}', '', '${fieldName}', ''); ?>
    </div>
</div>

`;
          } else if (isEmail) {
            output += version === "v1"
              ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->email('${rawName}', 'form_field', '${fieldName}', 'placeholder="Enter ${rawName.toLowerCase()} here"', '', '', '${rawName}');
            ?>
        </div>
    </div>
</div>

`
              : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->email('${rawName}', '', '${fieldName}', '', '', '', '${rawName}'); ?>
    </div>
</div>

`;
          } else if (isTime) {
            output += version === "v1"
              ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->fields('${fieldName}', 'form_field', '${fieldName}', '');
            ?>
        </div>
    </div>
</div>

`
              : `<div class="row g-3 mb-3">
    <div class="col-md-4">
        <?php $input->time('${rawName}', '${fieldName}', ''); ?>
    </div>
</div>

`;
          } else if (isDate) {
            output += version === "v1"
              ? `<div class="form_box">
    <div class="form_box_col2">
        <div class="group">
            <?php
                $input->label('${rawName}', '*');
                $input->fields('${fieldName}', 'form_field Date', '${fieldName}', 'placeholder="Enter date here"');
            ?>
        </div>
    </div>
</div>

`
              : `<div class="row g-3 mb-3">
    <div class="col-md-4">
        <?php $input->datepicker('${fieldName}', '${fieldName}', '', 'Date1 DisableFuture', '', '${rawName}'); ?>
    </div>
</div>

`;
          } else {
            output += version === "v1"
              ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->fields('${fieldName}', 'form_field', '${fieldName}', 'placeholder="Enter ${rawName.toLowerCase()} here"');
            ?>
        </div>
    </div>
</div>

`
              : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php $input->fields('${fieldName}', 'form-control', '${fieldName}', ''); ?>
    </div>
</div>

`;
          }
        }
    
        if (type === "radio") {
          const options = getRadioOptions();
          if (!options) return alert("Please enter radio options");
    
          output += version === "v1"
            ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->radio('${fieldName}', array(${options}), '', '', '3');
            ?>
        </div>
    </div>
</div>

`
            : `<div class="row g-3 mb-3">
    <div class="col-md-12">
        <?php
            $input->label('${rawName}', '');
            $input->radio('${fieldName}', array(${options}), '${fieldName}', '', '3');
        ?>
    </div>
</div>

`;
        }

        if (type === "checkbox") {
          const options = getRadioOptions();
          if (!options) return alert("Please enter checkbox options");
    
          output += version === "v1"
            ? `<div class="form_box">
    <div class="form_box_col1">
        <div class="group">
            <?php
                $input->label('${rawName}', '');
                $input->chkboxVal('${fieldName}', array(${options}), '', '', '3');
            ?>
        </div>
    </div>
</div>

`
            : `<div class="row g-3 mb-3">
    <div class="col-md-12 group" data-limit="7">
        <?php
            $input->label('${rawName}', '');
            $input->chkboxVal('${fieldName}', array(${options}), '${fieldName}', '', '3');
        ?>
    </div>
</div>

`;
        }

        if (type === "amount") {
          output += version === "v1"
            ? `<div class="form_box">
   <div class="form_box_col1">
      <div class="group">
         <?php
            $input->label('${rawName}', '');
            $input->amount('${fieldName}', '${fieldName}', '');
         ?>
      </div>
   </div>
</div>

`
            : `<div class="row g-3 mb-3">
  <div class="col-md-3">
    <?php $input->amount('${rawName}', '${fieldName}', ''); ?>
  </div>
</div>

`;
        }

        if (type === "age") {
          output += version === "v1"
            ? `<div class="form_box">
   <div class="form_box_col1">
      <div class="group">
         <?php
            $input->label('${rawName}', '');
            $input->fields('${rawName}', 'ageOnly', '${fieldName}', '');
         ?>
      </div>
   </div>
</div>

`
            : `<div class="row g-3 mb-3">
  <div class="col-md-2">
    <?php $input->fields('${rawName}', 'ageOnly', '${fieldName}', ''); ?>
  </div>
</div>

`;
        }

        if (type === "numberOnly") {
          output += version === "v1"
            ? `<div class="form_box">
   <div class="form_box_col1">
      <div class="group">
         <?php
            $input->label('${rawName}', '');
            $input->fields('${rawName}', 'numberOnly', '${fieldName}', '');
         ?>
      </div>
   </div>
</div>

`
            : `<div class="row g-3 mb-3">
  <div class="col-md-4">
    <?php $input->fields('${rawName}', 'numberOnly', '${fieldName}', ''); ?>
  </div>
</div>

`;
        }

        if (type === "upload") {
          const uploadLabelWithHint = escPhp(rawName + ' <span style="font-style: italic; font-size: 13px; text-transform: lowercase; color:#b1b1b1;">(accepted file formats: .doc, .docx, .pdf | Max: 10MB)</span>');
          output += version === "v1"
            ? `<div class="form_box">
   <div class="form_box_col1">
      <div class="group">
         <?php
            $input->label('${rawName}', '');
         ?>
         <input type="file" name="attachment[]" id="${fieldName}" class="form_field" multiple>
      </div>
   </div>
</div>

`
            : `<div class="row g-3 mb-3">
  <div class="col-md-12">
    <?php
      $input->label('${uploadLabelWithHint}', '');
      $input->files('', '${fieldName}', '', '', 'doc,docx,pdf,zip', '10MB');
    ?>
  </div>
</div>

`;
        }
      });

      outputHistory = [];
      document.getElementById("output").value = output.trim();
    }
