export function formatMoney(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number.isFinite(number) ? number : 0);
}

export function normalizeProduct(raw = {}) {
  return {
    ...raw,
    id: String(raw.id || ""),
    proveedor_id: raw.proveedor_id || "",
    sku: raw.sku || "",
    nombre: raw.nombre || "Producto sin nombre",
    marca: raw.marca || "Sin marca",
    categoria: raw.categoria || "Sin categoria",
    imagen: raw.imagen || "",
    precio_mayorista: numberOrNull(raw.precio_mayorista),
    precio_referencia: numberOrNull(raw.precio_referencia),
    mi_precio: numberOrNull(raw.mi_precio),
    disponible_proveedor: raw.disponible_proveedor === true,
    stock_proveedor: Number(raw.stock_proveedor || 0),
    stock_texto: raw.stock_texto || "",
    mostrar_en_catalogo: raw.mostrar_en_catalogo === true,
    link_proveedor: raw.link_proveedor || "",
    descripcion_corta: stripHtml(raw.descripcion_corta || ""),
    notas: raw.notas || "",
    fecha_importacion: raw.fecha_importacion || ""
  };
}

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getSalePrice(product) {
  return numberOrNull(product?.mi_precio) ?? numberOrNull(product?.precio_referencia) ?? 0;
}

export function stripHtml(value = "") {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent?.trim() || "";
}

function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

export function toCSV(products = []) {
  const headers = [
    "id",
    "proveedor_id",
    "sku",
    "nombre",
    "marca",
    "categoria",
    "imagen",
    "precio_mayorista",
    "precio_referencia",
    "mi_precio",
    "disponible_proveedor",
    "stock_proveedor",
    "stock_texto",
    "mostrar_en_catalogo",
    "link_proveedor",
    "descripcion_corta",
    "notas",
    "fecha_importacion"
  ];

  return [
    headers.join(","),
    ...products.map((product) =>
      headers.map((header) => escapeCSV(product[header])).join(",")
    )
  ].join("\n");
}

export function parseCSV(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...records] = rows;

  return records
    .filter((record) => record.some(Boolean))
    .map((record) =>
      headers.reduce((item, header, index) => {
        item[header] = record[index] ?? "";
        return item;
      }, {})
    );
}

export function download(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function debounce(callback, delay = 250) {
  let timer = null;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
