function isOtherOption(option) {
  return String(option || "").trim().toLowerCase() === "other";
}

function htmlNameFromField(fieldName) {
  return String(fieldName || "").replace(/\\'/g, "'");
}

function cssHash(id) {
  let out = "";
  const text = String(id);
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if ((i === 0 && /[0-9]/.test(ch)) || !/[a-zA-Z0-9_-]/.test(ch)) out += "\\" + ch;
    else out += ch;
  }
  return "#" + out;
}

function jsSingleQuoted(value) {
  return "'" + String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n") + "'";
}

function otherOptionHits(options) {
  const hits = [];
  (options || []).forEach((opt, i) => {
    if (!isOtherOption(opt)) return;
    hits.push({ index: i + 1, value: String(opt).trim() });
  });
  return hits;
}

function takeOtherInputName(usedNames) {
  let name = "Other";
  let n = 1;
  while (usedNames.has(name)) {
    n += 1;
    name = "Other" + n;
  }
  usedNames.add(name);
  return name;
}

/** Checkbox and radio fields whose options include Other, in canvas order. */
function collectConditionalOthers() {
  const usedNames = new Set((formFields || []).map((f) => htmlNameFromField(f.fieldName)));
  const checkboxes = [];
  const radios = [];
  const byFieldId = {};

  (canvasRows || []).forEach((row) => {
    (row.fieldIds || []).forEach((id) => {
      const field = fieldById(id);
      if (!field || (field.type !== "checkbox" && field.type !== "radio")) return;
      const hits = otherOptionHits(field.options);
      if (!hits.length) return;
      const base = htmlNameFromField(field.fieldName);
      hits.forEach((hit) => {
        const inputName = takeOtherInputName(usedNames);
        let entry;
        if (field.type === "checkbox") {
          const n = checkboxes.length + 1;
          entry = {
            kind: "checkbox",
            trigger: cssHash(base + "_" + hit.index),
            targetId: n === 1 ? "ifOther" : "ifOther" + n,
            inputName: inputName,
            value: hit.value,
            index: hit.index
          };
          checkboxes.push(entry);
        } else {
          const n = radios.length + 1;
          entry = {
            kind: "radio",
            groupName: base,
            targetId: "OtherField" + n,
            inputName: inputName,
            value: hit.value
          };
          radios.push(entry);
        }
        if (!byFieldId[field.id]) byFieldId[field.id] = [];
        byFieldId[field.id].push(entry);
      });
    });
  });

  return { checkboxes: checkboxes, radios: radios, byFieldId: byFieldId };
}

function renderConditionalOtherMarkup(version, entry) {
  const name = escPhp(entry.inputName);
  const id = entry.targetId;
  if (version === "v1") {
    return `<div class="form_box" id="${id}">
<div class="form_box_col1">
    <div class="group">
        <?php
            $input->label('Other', '');
            $input->fields('${name}', 'form_field', '${name}', '');
        ?>
    </div>
</div>
</div>

`;
  }
  return `<div class="row g-3 mb-3" id="${id}">
<div class="col-md-12">
    <?php $input->fields('Other', 'form-control', '${name}', ''); ?>
</div>
</div>

`;
}

function buildConditionalScript(model) {
  if (!model) return "";
  const parts = [];
  const checks = model.checkboxes || [];
  const radios = model.radios || [];

  if (checks.length) {
    const rows = checks.map((entry) => {
      return "    { trigger: " + jsSingleQuoted(entry.trigger) + ", target: " + jsSingleQuoted("#" + entry.targetId) + " }";
    });
    parts.push(
      "function initConditionalField(triggerSelector, targetSelector) {\n" +
      "    var $target = $(targetSelector);\n" +
      "\n" +
      "    $target.hide().find(':input').prop('disabled', true);\n" +
      "\n" +
      "    $(triggerSelector).on('change', function () {\n" +
      "        var show = $(this).is(':checked');\n" +
      "        $target.find(':input').prop('disabled', !show);\n" +
      "        $target[show ? 'fadeIn' : 'fadeOut']();\n" +
      "    });\n" +
      "}\n" +
      "\n" +
      "[\n" +
      rows.join(",\n") + "\n" +
      "].forEach(function (field) {\n" +
      "    initConditionalField(field.trigger, field.target);\n" +
      "});"
    );
  }

  if (radios.length) {
    const rows = radios.map((entry) => {
      const escapedName = String(entry.groupName).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const group = "\"input[name='" + escapedName + "']\"";
      return "    { group: " + group + ", value: " + jsSingleQuoted(entry.value) + ", target: " + jsSingleQuoted("#" + entry.targetId) + " }";
    });
    parts.push(
      "function initConditionalFieldRadio(groupSelector, triggerValue, targetSelector) {\n" +
      "    var $target = $(targetSelector);\n" +
      "    function toggle() {\n" +
      "        var show = $(groupSelector + ':checked').val() === triggerValue;\n" +
      "        $target.find(':input').prop('disabled', !show);\n" +
      "        $target[show ? 'fadeIn' : 'fadeOut']();\n" +
      "    }\n" +
      "    $target.hide().find(':input').prop('disabled', true);\n" +
      "    $(groupSelector).on('change', toggle);\n" +
      "    toggle();\n" +
      "}\n" +
      "[\n" +
      rows.join(",\n") + "\n" +
      "].forEach(function (field) {\n" +
      "    initConditionalFieldRadio(field.group, field.value, field.target);\n" +
      "});"
    );
  }

  return parts.join("\n\n");
}

function renderConditionalScript(model) {
  const el = document.getElementById("jsOutput");
  const meta = document.getElementById("jsStatusMeta");
  if (!el) return;
  const script = buildConditionalScript(model);
  el.value = script;
  if (!meta) return;
  const checks = (model && model.checkboxes) ? model.checkboxes.length : 0;
  const radios = (model && model.radios) ? model.radios.length : 0;
  if (!checks && !radios) {
    meta.textContent = "Appears when a checkbox or radio includes Other";
    return;
  }
  const bits = [];
  if (checks) bits.push(checks + (checks === 1 ? " checkbox" : " checkboxes"));
  if (radios) bits.push(radios + (radios === 1 ? " radio" : " radios"));
  meta.textContent = bits.join(", ");
}
