// â”€â”€â”€ ConfiguraciÃ³n Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPABASE_URL = "https://yfixlfxpqcjkjdhqahze.supabase.co";
const SUPABASE_KEY = "sb_publishable_4LbIF3KriW-P3N6cnFNQ0Q_la6G_QWD";

let _supabase = null;
function getClient() {
  if (_supabase) return _supabase;
  if (!window.supabase) throw new Error("Supabase SDK no cargado.");
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

// â”€â”€â”€ Productos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchProducts({ soloVisibles = false } = {}) {
  const db = getClient();
  const PAGE_SIZE = 1000;
  let all = [];
  let from = 0;

  while (true) {
    let query = db.from("productos").select("*")
      .order("marca", { ascending: true })
      .order("nombre", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (soloVisibles) {
      query = query.eq("mostrar_en_catalogo", true).eq("disponible_proveedor", true);
    }
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

async function saveProduct({ id, mi_precio, precio_referencia, mostrar_en_catalogo, notas }) {
  const db = getClient();
  const { error } = await db.from("productos")
    .update({ mi_precio, precio_referencia, mostrar_en_catalogo, notas })
    .eq("id", id);
  if (error) throw error;
}

async function saveAllProducts(products) {
  const db = getClient();
  const rows = products.map(p => ({
    id: p.id,
    mi_precio: p.mi_precio || 0,
    precio_referencia: p.precio_referencia || 0,
    mostrar_en_catalogo: p.mostrar_en_catalogo || false,
    notas: p.notas || ""
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("productos")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }
}

// â”€â”€â”€ Variaciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Carga las variaciones de un producto (o todos si no se pasa id) */
async function fetchVariaciones(producto_id = null) {
  const db = getClient();
  let query = db.from("variaciones").select("*").order("tono", { ascending: true });
  if (producto_id) query = query.eq("producto_id", producto_id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Carga variaciones de mÃºltiples productos de una sola vez */
async function fetchVariacionesBatch(producto_ids) {
  const ids = [...new Set((producto_ids || []).filter(Boolean))];
  if (!ids.length) return [];
  const db = getClient();
  const BATCH = 200;
  let all = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data, error } = await db.from("variaciones")
      .select("*")
      .in("producto_id", slice)
      .order("tono", { ascending: true });
    if (error) throw error;
    all = all.concat(data || []);
  }

  return all;
}

// â”€â”€â”€ SincronizaciÃ³n Kroma â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function sincronizarKroma() {
  const db = getClient();

  const { data: actuales } = await db.from("productos").select("id, proveedor_id");
  const existentes = new Map((actuales || []).map(p => [String(p.proveedor_id), p.id]));

  const BASE = "https://kromaspace.com/wp-json/wc/store/v1/products";
  let pagina = 1, totalPaginas = 1;
  const nuevos = [], actualizaciones = [];

  // 1. Sincronizar productos principales
  while (pagina <= totalPaginas) {
    const res = await fetch(`${BASE}?per_page=100&page=${pagina}`);
    if (!res.ok) throw new Error(`Kroma respondiÃ³ ${res.status}`);
    totalPaginas = Number(res.headers.get("X-WP-TotalPages") || 1);
    const items = await res.json();

    for (const item of items) {
      const disponible = item.is_in_stock !== false;
      const stock = item.stock_quantity ?? null;
      const imagen = item.images?.[0]?.src || "";
      const precio = Math.round(parseFloat(item.prices?.price || "0") / 100);
      const row = {
        id: `kroma-${item.id}`,
        proveedor_id: String(item.id),
        sku: item.sku || "",
        nombre: item.name || "",
        marca: item.brands?.[0]?.name || extraerMarca(item) || "Sin marca",
        categoria: item.categories?.[0]?.name || "General",
        imagen,
        precio_mayorista: precio,
        disponible_proveedor: disponible,
        stock_proveedor: stock,
        stock_texto: stock !== null ? `${stock} disponibles` : (disponible ? "Disponible" : "Sin stock"),
        link_proveedor: item.permalink || "",
        descripcion_corta: limpiarHtml(item.short_description || ""),
        fecha_importacion: new Date().toISOString().slice(0, 10)
      };
      if (existentes.has(String(item.id))) actualizaciones.push(row);
      else nuevos.push({ ...row, mi_precio: 0, precio_referencia: 0, mostrar_en_catalogo: false, notas: "Pendiente de precio" });
    }
    pagina++;
  }

  const BATCH = 200;
  for (let i = 0; i < actualizaciones.length; i += BATCH) {
    const { error } = await db.from("productos").upsert(actualizaciones.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }
  for (let i = 0; i < nuevos.length; i += BATCH) {
    const { error } = await db.from("productos").insert(nuevos.slice(i, i + BATCH));
    if (error) throw error;
  }

  // 2. Sincronizar variaciones (tonos)
  const varResult = await sincronizarVariaciones(existentes);

  return {
    actualizados: actualizaciones.length,
    nuevos: nuevos.length,
    variaciones: varResult
  };
}

async function sincronizarVariaciones(existentes) {
  const db = getClient();
  const BASE = "https://kromaspace.com/wp-json/wc/store/v1/products";
  let pagina = 1, totalPaginas = 1;
  const variaciones = [];

  while (pagina <= totalPaginas) {
    const res = await fetch(`${BASE}?type=variation&per_page=100&page=${pagina}`);
    if (!res.ok) break; // Si Kroma no tiene este endpoint habilitado, salimos sin error
    totalPaginas = Number(res.headers.get("X-WP-TotalPages") || 1);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      // El parent_id conecta la variaciÃ³n con el producto padre
      const parentId = item.parent_id ? `kroma-${item.parent_id}` : null;
      if (!parentId) continue;

      const tono = item.variation || item.attributes?.map(a => a.value).join(" / ") || item.name || "";
      const disponible = item.is_in_stock !== false;
      const stock = item.stock_quantity ?? null;

      variaciones.push({
        id: `kroma-var-${item.id}`,
        producto_id: parentId,
        proveedor_id: String(item.id),
        tono,
        sku: item.sku || "",
        imagen: item.images?.[0]?.src || "",
        precio_mayorista: Math.round(parseFloat(item.prices?.price || "0") / 100),
        disponible,
        stock: stock,
        stock_texto: stock !== null ? `${stock} disponibles` : (disponible ? "Disponible" : "Sin stock"),
        fecha_sync: new Date().toISOString().slice(0, 10)
      });
    }
    pagina++;
  }

  if (variaciones.length === 0) return { sincronizadas: 0 };

  const BATCH = 200;
  for (let i = 0; i < variaciones.length; i += BATCH) {
    const { error } = await db.from("variaciones")
      .upsert(variaciones.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }

  return { sincronizadas: variaciones.length };
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function limpiarHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() || "";
}

function extraerMarca(item) {
  const atributos = item.attributes || [];
  const marcaAttr = atributos.find(a => a.name?.toLowerCase().includes("marca") || a.name?.toLowerCase().includes("brand"));
  return marcaAttr?.options?.[0] || marcaAttr?.value || "";
}

// â”€â”€â”€ Exportar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.SupabaseDB = {
  fetchProducts,
  saveProduct,
  saveAllProducts,
  fetchVariaciones,
  fetchVariacionesBatch,
  sincronizarKroma,
  getClient
};

