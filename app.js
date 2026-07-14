// ─── Helpers de formato ───────────────────────────────────────────────────────
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

function formatMoney(value) {
  return money.format(Number(value || 0));
}

// ─── Normalización ────────────────────────────────────────────────────────────
function normalizeProduct(raw, index = 0) {
  return {
    id: String(raw.id || raw.sku || `producto-${index + 1}`),
    proveedor_id: String(raw.proveedor_id || ""),
    sku: String(raw.sku || ""),
    nombre: String(raw.nombre || raw.name || "Producto sin nombre"),
    marca: String(raw.marca || raw.brand || "Sin marca"),
    categoria: String(raw.categoria || raw.category || "General"),
    imagen: String(raw.imagen || raw.image || raw.foto || ""),
    precio_mayorista: Number(raw.precio_mayorista || 0),
    precio_referencia: Number(raw.precio_referencia || 0),
    mi_precio: Number(raw.mi_precio || 0),
    disponible_proveedor: Boolean(raw.disponible_proveedor ?? true),
    stock_proveedor: raw.stock_proveedor ?? null,
    stock_texto: String(raw.stock_texto || ""),
    mostrar_en_catalogo: Boolean(raw.mostrar_en_catalogo ?? false),
    link_proveedor: String(raw.link_proveedor || ""),
    descripcion_corta: String(raw.descripcion_corta || ""),
    notas: String(raw.notas || "")
  };
}

// ─── Carga de productos ───────────────────────────────────────────────────────
// Modo: "public" (solo visibles) o "admin" (todos)
async function loadProducts({ mode = "public" } = {}) {
  // Si Supabase está disponible, úsalo
  if (window.SupabaseDB) {
    const soloVisibles = mode === "public";
    const data = await window.SupabaseDB.fetchProducts({ soloVisibles });
    return data.map(normalizeProduct);
  }

  // Fallback: archivo local (para cuando no hay conexión)
  const STORAGE_KEY = "catalogo-maquillaje-productos";
  const cachedRaw = localStorage.getItem(STORAGE_KEY);
  if (cachedRaw) return JSON.parse(cachedRaw).map(normalizeProduct);

  let sourceProducts = window.CATALOG_PRODUCTS;
  if (!Array.isArray(sourceProducts)) {
    const response = await fetch(`./products.json?v=${Date.now()}`);
    sourceProducts = await response.json();
  }
  return sourceProducts.map(normalizeProduct);
}

// ─── Guardado de productos ────────────────────────────────────────────────────
async function saveProducts(products) {
  if (window.SupabaseDB) {
    await window.SupabaseDB.saveAllProducts(products);
    return;
  }
  // Fallback localStorage
  localStorage.setItem("catalogo-maquillaje-productos", JSON.stringify(products.map(normalizeProduct)));
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCSV(products) {
  const headers = [
    "id","nombre","marca","categoria","imagen",
    "precio_mayorista","precio_referencia","mi_precio",
    "disponible_proveedor","stock_proveedor","stock_texto",
    "mostrar_en_catalogo","link_proveedor","descripcion_corta","notas"
  ];
  const rows = products.map(p => headers.map(h => csvEscape(p[h])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function parseCSV(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted && c === '"' && next === '"') { value += '"'; i++; }
    else if (c === '"') { quoted = !quoted; }
    else if (!quoted && c === ',') { row.push(value); value = ""; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && next === '\n') i++;
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = []; value = "";
    } else { value += c; }
  }
  row.push(value);
  if (row.some(c => c.trim())) rows.push(row);
  const [headers, ...dataRows] = rows;
  return dataRows.map((cells, index) => {
    const item = {};
    headers.forEach((h, ci) => {
      const key = h.trim();
      const raw = cells[ci] ?? "";
      if (["precio_mayorista","precio_referencia","mi_precio"].includes(key)) {
        item[key] = Number(raw);
      } else if (["disponible_proveedor","mostrar_en_catalogo"].includes(key)) {
        item[key] = ["true","1","si","sí","yes"].includes(String(raw).trim().toLowerCase());
      } else {
        item[key] = raw;
      }
    });
    return normalizeProduct(item, index);
  });
}

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Exportar ─────────────────────────────────────────────────────────────────
window.CatalogData = {
  loadProducts,
  saveProducts,
  normalizeProduct,
  formatMoney,
  toCSV,
  parseCSV,
  download
};
// ── SINCRONIZACIÓN KROMA ──────────────────────────────────────────────────
window.SupabaseSync = {
  async sincronizar(modo) {
    const res = await fetch("https://yfixlfxpqcjkjdhqahze.supabase.co/functions/v1/sincronizar-kroma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo })
    });
    
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error desconocido");
    return data;
  }
};
