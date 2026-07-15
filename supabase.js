const SUPABASE_URL = "https://yfixlfxpqcjkjdhqahze.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4LbIF3KriW-P3N6cnFNQ0Q_la6G_QWD";
const PAGE_SIZE = 1000;

let client = null;

export function getClient() {
  if (!client) {
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS no esta cargado.");
    }

    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );
  }

  return client;
}

async function fetchPaged(queryFactory) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await queryFactory(from, to);

    if (error) throw error;
    if (data?.length) rows.push(...data);
    if (!data || data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return rows;
}

export async function fetchProducts({ soloVisibles = false } = {}) {
  const supabase = getClient();

  return fetchPaged((from, to) => {
    let query = supabase
      .from("productos")
      .select("*")
      .order("nombre", { ascending: true })
      .range(from, to);

    if (soloVisibles) {
      query = query
        .eq("mostrar_en_catalogo", true)
        .eq("disponible_proveedor", true);
    }

    return query;
  });
}

export async function fetchVariacionesBatch(productoIds = []) {
  const supabase = getClient();
  const ids = [...new Set(productoIds.filter(Boolean))];
  const rows = [];
  const chunkSize = 100;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const data = await fetchPaged((from, to) =>
      supabase
        .from("variaciones")
        .select("*")
        .in("producto_id", chunk)
        .order("tono", { ascending: true })
        .range(from, to)
    );

    rows.push(...data);
  }

  return rows;
}

export async function saveAllProducts(products = []) {
  const supabase = getClient();
  const saved = [];

  for (const product of products) {
    if (!product?.id) continue;

    const payload = {
      marca: product.marca || null,
      mi_precio: product.mi_precio === "" ? null : product.mi_precio,
      precio_referencia:
        product.precio_referencia === "" ? null : product.precio_referencia,
      mostrar_en_catalogo: product.mostrar_en_catalogo === true,
      notas: product.notas || null
    };

    const { data, error } = await supabase
      .from("productos")
      .update(payload)
      .eq("id", product.id)
      .select("id")
      .single();

    if (error) throw error;
    saved.push(data);
  }

  return saved;
}

export async function getCurrentSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function invokeKromaSync(body) {
  const session = await getCurrentSession();

  if (!session?.access_token) {
    throw new Error("Debes iniciar sesion para sincronizar.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/sincronizar-kroma`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo ejecutar la funcion.");
  }

  return payload;
}
