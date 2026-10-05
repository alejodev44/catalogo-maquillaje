
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SUPABASE_URL = "https://yfixlfxpqcjkjdhqahze.supabase.co";
const LLAVE_PUBLICA = "sb_publishable_4LbIF3KriW-P3N6cnFNQ0Q_la6G_QWD";
const SITIO = "https://alejodev44.github.io/catalogo-maquillaje/";
const SALIDA = process.argv[2] || ".";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

const decodificar = (s) => String(s ?? "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

const dinero = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

async function leerCatalogo() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/catalogo_publico?select=id,nombre,marca,imagen,descripcion_corta,mi_precio,categoria_tienda&order=id&offset=${desde}&limit=1000`;
    const res = await fetch(url, { headers: { apikey: LLAVE_PUBLICA, Authorization: `Bearer ${LLAVE_PUBLICA}` } });
    if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${await res.text()}`);
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

function paginaProducto(p) {
  const nombre = decodificar(p.nombre).trim();
  const marca = p.marca && p.marca !== "Sin marca" ? decodificar(p.marca) : "";
  const precio = Number(p.mi_precio) > 0 ? Number(p.mi_precio) : 0;
  const descLarga = decodificar(p.descripcion_corta).replace(/\s+/g, " ").trim();
  const descripcion = descLarga.length > 160 ? descLarga.slice(0, 157).replace(/\s+\S*$/, "") + "…" : descLarga;
  const destino = `${SITIO}index.html?producto=${encodeURIComponent(p.id)}`;
  const propia = `${SITIO}p/${p.id}.html`;
  const imagen = /^https:\/\//i.test(p.imagen || "") ? p.imagen : `${SITIO}assets/og-image.jpg`;
  const resumen = [precio ? dinero(precio) : "Consulta el precio", marca, "Pide por WhatsApp · Entregas en Bogotá"].filter(Boolean).join(" · ");
  const datos = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: nombre,
    image: [imagen],
    ...(descripcion ? { description: descripcion } : {}),
    ...(marca ? { brand: { "@type": "Brand", name: marca } } : {}),
    ...(p.categoria_tienda ? { category: p.categoria_tienda } : {}),
    ...(precio ? {
      offers: {
        "@type": "Offer",
        url: destino,
        priceCurrency: "COP",
        price: precio,
        availability: "https://schema.org/InStock",
        seller: { "@type": "Organization", name: "Malía Cosmetics" },
      },
    } : {}),
  };

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(nombre)} | Malía Cosmetics</title>
<meta name="description" content="${esc(descripcion ? `${resumen}. ${descripcion}` : resumen)}">
<link rel="canonical" href="${esc(propia)}">
<link rel="icon" type="image/png" href="../assets/favicon.png">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Malía Cosmetics">
<meta property="og:locale" content="es_CO">
<meta property="og:url" content="${esc(propia)}">
<meta property="og:title" content="${esc(nombre)}">
<meta property="og:description" content="${esc(resumen)}">
<meta property="og:image" content="${esc(imagen)}">
<meta name="twitter:card" content="summary_large_image">
${precio ? `<meta property="product:price:amount" content="${precio}">\n<meta property="product:price:currency" content="COP">\n` : ""}<script type="application/ld+json">${JSON.stringify(datos).replace(/</g, "\\u003c")}</script>
<script>location.replace(${JSON.stringify(destino)});</script>
<style>body{font-family:Montserrat,system-ui,sans-serif;background:#FAF7F3;color:#171416;max-width:520px;margin:40px auto;padding:0 16px;text-align:center}img{max-width:100%;border-radius:12px}a{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:999px;background:#8F183D;color:#fff;text-decoration:none;font-weight:700}</style>
</head>
<body>
<img src="${esc(imagen)}" alt="${esc(nombre)}" width="400">
<h1>${esc(nombre)}</h1>
<p>${esc(resumen)}</p>
<a href="${esc(destino)}">Ver en la tienda</a>
</body>
</html>
`;
}

async function main() {
  const productos = (await leerCatalogo()).filter((p) => /^[a-z0-9-]+$/i.test(p.id) && p.nombre);
  if (productos.length < 500) {
    throw new Error(`Solo llegaron ${productos.length} productos; no se generan páginas para no borrar las existentes.`);
  }
  const carpeta = join(SALIDA, "p");
  await mkdir(carpeta, { recursive: true });

  const vigentes = new Set();
  for (const p of productos) {
    const archivo = `${p.id}.html`;
    vigentes.add(archivo);
    await writeFile(join(carpeta, archivo), paginaProducto(p));
  }
  let borradas = 0;
  for (const archivo of await readdir(carpeta)) {
    if (archivo.endsWith(".html") && !vigentes.has(archivo)) {
      await rm(join(carpeta, archivo));
      borradas++;
    }
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const urls = [`${SITIO}index.html`, `${SITIO}terminos.html`, ...productos.map((p) => `${SITIO}p/${p.id}.html`)];
  await writeFile(join(SALIDA, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${hoy}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`);

  console.log(`Páginas: ${productos.length} · borradas: ${borradas} · sitemap: ${urls.length} URLs`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
