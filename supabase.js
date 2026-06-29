// ─── Configuración Supabase ───────────────────────────────────────────────────
const SUPABASE_URL = "https://yfixlfxpqcjkjdhqahze.supabase.co";
const SUPABASE_KEY = "sb_publishable_4LbIF3KriW-P3N6cnFNQ0Q_la6G_QWD";

// ─── Cliente Supabase (via CDN, sin npm) ─────────────────────────────────────
let _supabase = null;

function getClient() {
  if (_supabase) return _supabase;
  if (!window.supabase) throw new Error("Supabase SDK no cargado.");
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

// ─── Operaciones de productos ─────────────────────────────────────────────────

/**
 * Carga todos los productos desde Supabase.
 * El catálogo público solo ve los visibles; el admin ve todos.
 */
async function fetchProducts({ soloVisibles = false } = {}) {
  const db = getClient();
  let query = db
    .from("productos")
    .select("*")
    .order("marca", { ascending: true })
    .order("nombre", { ascending: true });

  if (soloVisibles) {
    query = query
      .eq("mostrar_en_catalogo", true)
      .eq("disponible_proveedor", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Guarda un producto individual (upsert por id).
 * Solo toca los campos manuales: mi_precio, precio_referencia, mostrar_en_catalogo, notas.
 */
async function saveProduct({ id, mi_precio, precio_referencia, mostrar_en_catalogo, notas }) {
  const db = getClient();
  const { error } = await db
    .from("productos")
    .update({ mi_precio, precio_referencia, mostrar_en_catalogo, notas })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Guarda múltiples productos a la vez (batch update de campos manuales).
 */
async function saveAllProducts(products) {
  const db = getClient();
  const rows = products.map(p => ({
    id: p.id,
    mi_precio: p.mi_precio || 0,
    precio_referencia: p.precio_referencia || 0,
    mostrar_en_catalogo: p.mostrar_en_catalogo || false,
    notas: p.notas || ""
  }));

  // Supabase upsert en lotes de 500 para no superar límites
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from("productos")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw error;
  }
}

/**
 * Sincroniza productos desde Kroma (API pública).
 * Actualiza precio_mayorista, disponible_proveedor, stock, imagen.
 * Nunca sobreescribe mi_precio, mostrar_en_catalogo ni notas.
 */
async function sincronizarKroma() {
  const db = getClient();

  // Obtenemos los IDs actuales para saber qué hay que actualizar vs insertar
  const { data: actuales, error: errActuales } = await db
    .from("productos")
    .select("id, proveedor_id");
  if (errActuales) throw errActuales;

  const existentes = new Set(actuales.map(p => String(p.proveedor_id)));

  // Llamamos al endpoint de Kroma (WooCommerce REST API pública)
  const BASE = "https://kromaspace.com/wp-json/wc/store/v1/products";
  let pagina = 1;
  let totalPaginas = 1;
  const nuevos = [];
  const actualizaciones = [];

  while (pagina <= totalPaginas) {
    const res = await fetch(`${BASE}?per_page=100&page=${pagina}&status=publish`);
    if (!res.ok) throw new Error(`Kroma respondió ${res.status}`);
    totalPaginas = Number(res.headers.get("X-WP-TotalPages") || 1);
    const items = await res.json();

    for (const item of items) {
      const disponible = item.is_in_stock !== false;
      const stock = item.stock_quantity ?? null;
      const stockTexto = stock !== null ? `${stock} disponibles` : (disponible ? "Disponible" : "Sin stock");
      const imagen = item.images?.[0]?.src || "";
      const precio = Math.round(parseFloat(item.prices?.price || "0") / 100); // Kroma retorna en centavos

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
        stock_texto: stockTexto,
        link_proveedor: item.permalink || "",
        descripcion_corta: limpiarHtml(item.short_description || ""),
        fecha_importacion: new Date().toISOString().slice(0, 10)
      };

      if (existentes.has(String(item.id))) {
        actualizaciones.push(row);
      } else {
        nuevos.push({ ...row, mi_precio: 0, precio_referencia: 0, mostrar_en_catalogo: false, notas: "Pendiente de precio" });
      }
    }
    pagina++;
  }

  // Upsert actualizaciones (no toca campos manuales porque la columna mi_precio no viene)
  const BATCH = 200;
  for (let i = 0; i < actualizaciones.length; i += BATCH) {
    const { error } = await db
      .from("productos")
      .upsert(actualizaciones.slice(i, i + BATCH), {
        onConflict: "id",
        ignoreDuplicates: false
      });
    if (error) throw error;
  }

  // Insert productos nuevos
  for (let i = 0; i < nuevos.length; i += BATCH) {
    const { error } = await db
      .from("productos")
      .insert(nuevos.slice(i, i + BATCH));
    if (error) throw error;
  }

  return { actualizados: actualizaciones.length, nuevos: nuevos.length };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function limpiarHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() || "";
}

function extraerMarca(item) {
  // Kroma a veces pone la marca en atributos
  const atributos = item.attributes || [];
  const marcaAttr = atributos.find(a => a.name?.toLowerCase().includes("marca") || a.name?.toLowerCase().includes("brand"));
  return marcaAttr?.options?.[0] || marcaAttr?.value || "";
}

// ─── Exportar ─────────────────────────────────────────────────────────────────
window.SupabaseDB = {
  fetchProducts,
  saveProduct,
  saveAllProducts,
  sincronizarKroma,
  getClient
};
