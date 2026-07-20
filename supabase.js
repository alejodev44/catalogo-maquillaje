// ─── Configuración Supabase ───────────────────────────────────────────────────
const SUPABASE_URL = "https://yfixlfxpqcjkjdhqahze.supabase.co";
const SUPABASE_KEY = "sb_publishable_4LbIF3KriW-P3N6cnFNQ0Q_la6G_QWD";

let _supabase = null;
function getClient() {
  if (_supabase) return _supabase;
  if (!window.supabase) throw new Error("Supabase SDK no cargado.");
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

// ─── Productos ────────────────────────────────────────────────────────────────
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

async function saveProduct({ id, mi_precio, precio_referencia, mostrar_en_catalogo, notas, disponible_proveedor }) {
  const db = getClient();
  const { error } = await db.from("productos")
    .update({ mi_precio, precio_referencia, mostrar_en_catalogo, notas, disponible_proveedor })
    .eq("id", id);
  if (error) throw error;
}

async function saveAllProducts(products) {
  const db = getClient();
  // Actualizar de a 1 producto a la vez para garantizar que no se pierda nada
  // Solo tocamos los campos manuales — los de Kroma los maneja la Edge Function
  const BATCH = 50;
  for (let i = 0; i < products.length; i += BATCH) {
    const lote = products.slice(i, i + BATCH);
    await Promise.all(lote.map(async p => {
      const { error } = await db.from("productos")
        .update({
          marca: p.marca || "",
          mi_precio: p.mi_precio || 0,
          precio_referencia: p.precio_referencia || 0,
          mostrar_en_catalogo: p.mostrar_en_catalogo || false,
          notas: p.notas || "",
          disponible_proveedor: p.disponible_proveedor ?? true
        })
        .eq("id", p.id);
      if (error) console.error(`Error guardando ${p.id}:`, error.message);
    }));
  }
}

// ─── Variaciones ──────────────────────────────────────────────────────────────

/** Carga las variaciones de un producto (o todos si no se pasa id) */
async function fetchVariaciones(producto_id = null) {
  const db = getClient();
  let query = db.from("variaciones").select("*").order("tono", { ascending: true });
  if (producto_id) query = query.eq("producto_id", producto_id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Carga variaciones de múltiples productos de una sola vez (en chunks para no romper la URL) */
async function fetchVariacionesBatch(producto_ids) {
  if (!producto_ids.length) return [];
  const db = getClient();
  const CHUNK = 150;
  let all = [];
  for (let i = 0; i < producto_ids.length; i += CHUNK) {
    const lote = producto_ids.slice(i, i + CHUNK);
    const { data, error } = await db.from("variaciones")
      .select("*")
      .in("producto_id", lote)
      .order("tono", { ascending: true });
    if (error) throw error;
    all = all.concat(data || []);
  }
  return all;
}

// ─── Sincronización Kroma ─────────────────────────────────────────────────────

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
    if (!res.ok) throw new Error(`Kroma respondió ${res.status}`);
    totalPaginas = Number(res.headers.get("X-WP-TotalPages") || 1);
    const items = await res.json();

    for (const item of items) {
      // Con stock (is_in_stock true y, si viene cantidad numérica, > 0) → disponible.
      // El precio nunca decide disponibilidad, es un dato opcional.
      let disponible = item.is_in_stock === true;
      const stock = item.stock_quantity ?? null;
      if (typeof stock === "number") disponible = disponible && stock > 0;
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
      // Producto nuevo: visible automáticamente si tiene stock, sin importar el precio.
      // El precio es un dato opcional y nunca decide si el producto se muestra.
      else nuevos.push({ ...row, mi_precio: 0, precio_referencia: 0, mostrar_en_catalogo: disponible, notas: "" });
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
      // El parent_id conecta la variación con el producto padre
      const parentId = item.parent_id ? `kroma-${item.parent_id}` : null;
      if (!parentId) continue;

      const tono = item.variation || item.attributes?.map(a => a.value).join(" / ") || item.name || "";
      let disponible = item.is_in_stock === true;
      const stock = item.stock_quantity ?? null;
      if (typeof stock === "number") disponible = disponible && stock > 0;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Pedidos ──────────────────────────────────────────────────────────────────
async function crearPedido({ nombre, telefono, ciudad, direccion, notas, items, total }) {
  const db = getClient();
  const { data, error } = await db
    .from("pedidos")
    .insert([{ nombre, telefono, ciudad, direccion, notas, items, total }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fetchPedidos() {
  const db = getClient();
  const { data, error } = await db
    .from("pedidos")
    .select("*")
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function actualizarEstadoPedido(id, estado) {
  const db = getClient();
  const { error } = await db.from("pedidos").update({ estado }).eq("id", id);
  if (error) throw error;
}

// ─── Exportar ─────────────────────────────────────────────────────────────────
window.SupabaseDB = {
  fetchProducts,
  saveProduct,
  saveAllProducts,
  fetchVariaciones,
  fetchVariacionesBatch,
  sincronizarKroma,
  crearPedido,
  fetchPedidos,
  actualizarEstadoPedido,
  getClient
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
