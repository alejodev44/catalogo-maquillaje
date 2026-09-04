// ─── HERRAMIENTA DE BÚSQUEDA DE PRECIOS ────────────────────────────────────────
// Abre un modal para buscar y establecer precios de productos sin precio
// Integración: Agregar en admin.html antes de </body>
// <script src="./price-search-tool.js"></script>

(function() {
  'use strict';

  let currentProductId = null;
  let productossinPrecio = [];

  // Crear HTML del modal
  const modalHTML = `
    <!-- MODAL DE BÚSQUEDA DE PRECIOS -->
    <div class="price-search-overlay" id="priceSearchOverlay" hidden>
      <div class="price-search-modal">
        <div class="price-search-header">
          <h2>Buscar precios · Productos sin precio</h2>
          <button type="button" class="close-btn" id="closeSearchBtn" aria-label="Cerrar">✕</button>
        </div>
        
        <div class="price-search-body">
          <!-- FILTRO Y ORDENAMIENTO -->
          <div class="search-controls">
            <input 
              type="text" 
              id="searchProductInput" 
              placeholder="Buscar por nombre o marca..." 
              class="search-input"
            >
            <select id="sortProducts" class="sort-select">
              <option value="nombre">Ordenar: Nombre</option>
              <option value="proveedor">Ordenar: Proveedor</option>
              <option value="categoria">Ordenar: Categoría</option>
            </select>
          </div>

          <!-- LISTA DE PRODUCTOS SIN PRECIO -->
          <div class="products-list" id="productsWithoutPrice">
            <div class="loading-state">Cargando productos sin precio...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL PARA ESTABLECER PRECIO DE UN PRODUCTO -->
    <div class="set-price-overlay" id="setPriceOverlay" hidden>
      <div class="set-price-modal">
        <div class="set-price-header">
          <h2 id="setPriceTitle">Establecer precio</h2>
          <button type="button" class="close-btn" id="closePriceBtn" aria-label="Cerrar">✕</button>
        </div>

        <div class="set-price-body">
          <div class="product-info">
            <img id="priceProductImage" src="" alt="Producto" class="product-thumbnail">
            <div>
              <h3 id="priceProductName"></h3>
              <p id="priceProductBrand"></p>
              <p id="priceProductCategory" class="help"></p>
            </div>
          </div>

          <!-- INFORMACIÓN DE COSTO -->
          <div class="price-info-grid">
            <div class="price-info-item">
              <span class="label">Costo mayorista</span>
              <strong id="priceMayorista">$0</strong>
            </div>
            <div class="price-info-item">
              <span class="label">Precio referencia (si existe)</span>
              <strong id="priceReferencia">—</strong>
            </div>
          </div>

          <!-- BÚSQUEDA EN LÍNEA -->
          <div class="search-links">
            <h4>Buscar precio en línea:</h4>
            <div class="search-buttons">
              <button type="button" class="search-btn" id="googleSearchBtn">
                🔍 Google Shopping
              </button>
              <button type="button" class="search-btn" id="mercadoLibreBtn">
                🛒 Mercado Libre
              </button>
              <button type="button" class="search-btn" id="amazonBtn">
                📦 Amazon.co
              </button>
              <button type="button" class="search-btn" id="instagramBtn">
                📸 Instagram Marcas
              </button>
            </div>
          </div>

          <!-- INGRESO DE PRECIO -->
          <div class="price-input-section">
            <h4>Establecer precio de venta:</h4>
            <div class="price-input-group">
              <div class="input-field">
                <label for="priceInput">Mi precio (COP)</label>
                <input 
                  type="number" 
                  id="priceInput" 
                  placeholder="Ej: 25000" 
                  min="0" 
                  step="100"
                  class="price-input"
                >
              </div>
              <div class="input-field">
                <label for="priceNotes">Notas (opcional)</label>
                <input 
                  type="text" 
                  id="priceNotes" 
                  placeholder="Ej: Precio de Amazon" 
                  class="price-notes"
                >
              </div>
            </div>

            <!-- SUGERENCIAS DE MARGEN -->
            <div class="margin-suggestions">
              <span class="label">Sugerencias de margen:</span>
              <div class="margin-buttons">
                <button type="button" class="margin-btn" data-margin="1.85">+85%</button>
                <button type="button" class="margin-btn" data-margin="2.0">+100%</button>
                <button type="button" class="margin-btn" data-margin="2.25">+125%</button>
                <button type="button" class="margin-btn" data-margin="2.5">+150%</button>
              </div>
            </div>
          </div>

          <!-- ACCIONES -->
          <div class="price-actions">
            <button type="button" class="button ghost" id="skipProductBtn">Omitir</button>
            <button type="button" class="button primary" id="savePriceBtn">Guardar precio</button>
          </div>
        </div>
      </div>
    </div>

    <style>
      /* OVERLAY Y MODALES */
      .price-search-overlay,
      .set-price-overlay {
        position: fixed;
        inset: 0;
        background: rgba(20, 10, 14, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 300;
        padding: 20px;
      }

      .price-search-overlay[hidden],
      .set-price-overlay[hidden] {
        display: none;
      }

      .price-search-modal,
      .set-price-modal {
        background: #fff;
        border-radius: 14px;
        max-width: 700px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(50, 24, 28, 0.15);
      }

      /* HEADER */
      .price-search-header,
      .set-price-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #eadfe1;
      }

      .price-search-header h2,
      .set-price-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #211a1d;
        font-family: "Playfair Display", serif;
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6f6265;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: background 0.2s, color 0.2s;
      }

      .close-btn:hover {
        background: #f3f4f6;
        color: #211a1d;
      }

      /* BODY */
      .price-search-body,
      .set-price-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
      }

      /* CONTROLES DE BÚSQUEDA */
      .search-controls {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }

      .search-input,
      .sort-select {
        padding: 10px 12px;
        border: 1px solid #eadfe1;
        border-radius: 8px;
        font-size: 14px;
        font-family: "Montserrat", sans-serif;
      }

      .search-input {
        flex: 1;
      }

      .sort-select {
        min-width: 160px;
      }

      /* LISTA DE PRODUCTOS */
      .products-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .product-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        border: 1px solid #eadfe1;
        border-radius: 10px;
        background: #fffafd;
        cursor: pointer;
        transition: all 0.2s;
      }

      .product-item:hover {
        background: #fff;
        border-color: #c9a66b;
        box-shadow: 0 4px 12px rgba(50, 24, 28, 0.08);
      }

      .product-item img {
        width: 60px;
        height: 60px;
        object-fit: cover;
        border-radius: 6px;
        background: #f3f4f6;
      }

      .product-item-info {
        flex: 1;
      }

      .product-item-name {
        font-weight: 600;
        color: #211a1d;
        margin: 0 0 4px;
        font-size: 14px;
      }

      .product-item-brand {
        font-size: 12px;
        color: #6f6265;
        margin: 0 0 4px;
      }

      .product-item-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #6f6265;
      }

      .loading-state {
        text-align: center;
        padding: 40px 20px;
        color: #6f6265;
        font-size: 14px;
      }

      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #6f6265;
      }

      .empty-state strong {
        display: block;
        font-size: 18px;
        margin: 8px 0;
        color: #211a1d;
      }

      /* SET PRICE MODAL */
      .product-info {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
        padding: 16px;
        background: #fffafd;
        border-radius: 10px;
      }

      .product-thumbnail {
        width: 100px;
        height: 100px;
        object-fit: cover;
        border-radius: 8px;
        background: #f3f4f6;
      }

      .product-info h3 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: #211a1d;
      }

      .product-info p {
        margin: 0 0 4px;
        font-size: 13px;
        color: #6f6265;
      }

      .price-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 20px;
      }

      .price-info-item {
        padding: 12px;
        background: #fffafd;
        border-radius: 8px;
        border: 1px solid #eadfe1;
      }

      .price-info-item .label {
        display: block;
        font-size: 12px;
        color: #6f6265;
        margin-bottom: 6px;
      }

      .price-info-item strong {
        display: block;
        font-size: 16px;
        color: #8f183d;
      }

      /* BÚSQUEDA EN LÍNEA */
      .search-links {
        margin-bottom: 20px;
      }

      .search-links h4 {
        margin: 0 0 12px;
        font-size: 13px;
        font-weight: 600;
        color: #211a1d;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .search-buttons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .search-btn {
        padding: 10px 12px;
        border: 1px solid #eadfe1;
        background: #fff;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        color: #211a1d;
      }

      .search-btn:hover {
        background: #fdf2f8;
        border-color: #c9a66b;
      }

      /* INPUT DE PRECIO */
      .price-input-section {
        margin-bottom: 20px;
      }

      .price-input-section h4 {
        margin: 0 0 12px;
        font-size: 13px;
        font-weight: 600;
        color: #211a1d;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .price-input-group {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
      }

      .input-field {
        display: flex;
        flex-direction: column;
      }

      .input-field label {
        font-size: 12px;
        font-weight: 600;
        color: #211a1d;
        margin-bottom: 6px;
      }

      .price-input,
      .price-notes {
        padding: 10px 12px;
        border: 1px solid #eadfe1;
        border-radius: 8px;
        font-size: 14px;
        font-family: "Montserrat", sans-serif;
      }

      .price-input:focus,
      .price-notes:focus {
        outline: none;
        border-color: #8f183d;
        box-shadow: 0 0 0 3px rgba(143, 24, 61, 0.1);
      }

      /* SUGERENCIAS DE MARGEN */
      .margin-suggestions {
        padding: 12px;
        background: #fffafd;
        border-radius: 8px;
        border: 1px solid #eadfe1;
      }

      .margin-suggestions .label {
        display: block;
        font-size: 12px;
        color: #6f6265;
        margin-bottom: 10px;
      }

      .margin-buttons {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }

      .margin-btn {
        padding: 8px;
        border: 1px solid #eadfe1;
        background: #fff;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        color: #8f183d;
      }

      .margin-btn:hover {
        background: #8f183d;
        color: #fff;
        border-color: #8f183d;
      }

      /* ACCIONES */
      .price-actions {
        display: flex;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid #eadfe1;
      }

      .price-actions button {
        flex: 1;
      }

      /* RESPONSIVE */
      @media (max-width: 640px) {
        .price-search-modal,
        .set-price-modal {
          max-width: 100%;
          max-height: 100%;
        }

        .search-buttons {
          grid-template-columns: 1fr;
        }

        .margin-buttons {
          grid-template-columns: repeat(2, 1fr);
        }

        .price-input-group {
          grid-template-columns: 1fr;
        }

        .product-item {
          flex-direction: column;
        }

        .product-item img {
          width: 100%;
          height: auto;
        }
      }
    </style>
  `;

  // Agregar HTML al documento
  function initModal() {
    if (!document.querySelector('#priceSearchOverlay')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      setupEventListeners();
    }
  }

  // Event listeners
  function setupEventListeners() {
    document.getElementById('closeSearchBtn').addEventListener('click', () => {
      document.getElementById('priceSearchOverlay').hidden = true;
    });

    document.getElementById('closePriceBtn').addEventListener('click', () => {
      document.getElementById('setPriceOverlay').hidden = true;
      currentProductId = null;
    });

    document.getElementById('searchProductInput').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const filtered = productossinPrecio.filter(p =>
        p.nombre.toLowerCase().includes(query) || 
        (p.marca && p.marca.toLowerCase().includes(query))
      );
      renderizarProductosSinPrecio(filtered);
    });

    // Botones de búsqueda en línea
    document.getElementById('googleSearchBtn')?.addEventListener('click', () => {
      if (!currentProductId) return;
      const prod = productossinPrecio.find(p => p.id === currentProductId);
      if (!prod) return;
      const query = encodeURIComponent(`${prod.nombre} ${prod.marca} precio`);
      window.open(`https://www.google.com/search?q=${query}`, '_blank');
    });

    document.getElementById('mercadoLibreBtn')?.addEventListener('click', () => {
      if (!currentProductId) return;
      const prod = productossinPrecio.find(p => p.id === currentProductId);
      if (!prod) return;
      const query = encodeURIComponent(prod.nombre);
      window.open(`https://listado.mercadolibre.com.co/_CustId_${query}`, '_blank');
    });

    document.getElementById('amazonBtn')?.addEventListener('click', () => {
      if (!currentProductId) return;
      const prod = productossinPrecio.find(p => p.id === currentProductId);
      if (!prod) return;
      const query = encodeURIComponent(prod.nombre);
      window.open(`https://www.amazon.com.co/s?k=${query}`, '_blank');
    });

    document.getElementById('instagramBtn')?.addEventListener('click', () => {
      if (!currentProductId) return;
      const prod = productossinPrecio.find(p => p.id === currentProductId);
      if (!prod) return;
      const query = encodeURIComponent(prod.marca);
      window.open(`https://www.instagram.com/explore/tags/${query}/`, '_blank');
    });

    // Botones de margen
    document.querySelectorAll('.margin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const margin = parseFloat(e.target.dataset.margin);
        const prod = productossinPrecio.find(p => p.id === currentProductId);
        const mayorista = prod?.precio_mayorista || 0;
        const precio = Math.round(mayorista * margin);
        document.getElementById('priceInput').value = precio;
      });
    });

    document.getElementById('skipProductBtn').addEventListener('click', () => {
      document.getElementById('setPriceOverlay').hidden = true;
      currentProductId = null;
    });

    document.getElementById('savePriceBtn').addEventListener('click', guardarPrecio);
  }

  // Renderizar productos sin precio
  function renderizarProductosSinPrecio(productos) {
    const container = document.getElementById('productsWithoutPrice');
    if (productos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>¡Sin productos pendientes!</strong>
          <p>Todos tus productos tienen precio asignado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = productos
      .map(p => `
        <div class="product-item" onclick="window.PriceSearchTool.abrirSetPriceModal('${p.id}')">
          <img src="${p.imagen || 'https://via.placeholder.com/60?text=Sin+img'}" alt="${p.nombre}">
          <div class="product-item-info">
            <h3 class="product-item-name">${p.nombre}</h3>
            <p class="product-item-brand">${p.marca || 'Sin marca'}</p>
            <div class="product-item-meta">
              <span>${p.categoria || 'General'}</span>
              <span>Costo: $${p.precio_mayorista || 0}</span>
            </div>
          </div>
        </div>
      `)
      .join('');
  }

  // Abrir modal de establecer precio
  async function cargarProductosSinPrecio() {
    const container = document.getElementById('productsWithoutPrice');
    container.innerHTML = '<div class="loading-state">Cargando...</div>';

    try {
      if (!window.SupabaseDB) throw new Error('SupabaseDB no disponible');
      
      // Esto es un mock - en producción, debería traer desde Supabase
      // Por ahora, cargamos los productos globales (desde index.html)
      if (window.CatalogData && window.CatalogData.products) {
        const productos = await window.CatalogData.loadProducts({ mode: "admin" });
        productossinPrecio = productos.filter(p => !p.mi_precio || p.mi_precio === 0);
      } else {
        throw new Error('CatalogData no disponible');
      }

      if (productossinPrecio.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <strong>¡Sin productos pendientes!</strong>
            <p>Todos tus productos tienen precio asignado.</p>
          </div>
        `;
        return;
      }

      renderizarProductosSinPrecio(productossinPrecio);
    } catch (error) {
      console.error('Error cargando productos:', error);
      container.innerHTML = `<div class="empty-state"><strong>Error</strong><p>${error.message}</p></div>`;
    }
  }

  function abrirSetPriceModal(productId) {
    currentProductId = productId;
    const producto = productossinPrecio.find(p => p.id === productId);

    if (!producto) return;

    document.getElementById('setPriceTitle').textContent = `Establecer precio: ${producto.nombre}`;
    document.getElementById('priceProductImage').src = producto.imagen || 'https://via.placeholder.com/100?text=Sin+img';
    document.getElementById('priceProductName').textContent = producto.nombre;
    document.getElementById('priceProductBrand').textContent = producto.marca || 'Sin marca';
    document.getElementById('priceProductCategory').textContent = `Categoría: ${producto.categoria || 'General'}`;
    document.getElementById('priceMayorista').textContent = `$${producto.precio_mayorista || 0}`;
    document.getElementById('priceReferencia').textContent = producto.precio_referencia 
      ? `$${producto.precio_referencia}` 
      : '—';

    document.getElementById('priceInput').value = '';
    document.getElementById('priceNotes').value = '';

    document.getElementById('setPriceOverlay').hidden = false;
  }

  async function guardarPrecio() {
    const precioInput = document.getElementById('priceInput').value;
    const notas = document.getElementById('priceNotes').value;

    if (!precioInput || parseFloat(precioInput) <= 0) {
      alert('Por favor ingresa un precio válido');
      return;
    }

    const precio = parseInt(precioInput);

    try {
      if (!window.SupabaseDB) throw new Error('SupabaseDB no disponible');
      
      await window.SupabaseDB.saveProduct({
        id: currentProductId,
        mi_precio: precio,
        notas: notas || '',
        precio_referencia: 0,
        mostrar_en_catalogo: true,
        disponible_proveedor: true
      });

      alert('✅ Precio guardado correctamente');
      document.getElementById('setPriceOverlay').hidden = true;
      
      // Recargar y mostrar siguiente
      productossinPrecio = productossinPrecio.filter(p => p.id !== currentProductId);
      renderizarProductosSinPrecio(productossinPrecio);
      currentProductId = null;

      if (productossinPrecio.length === 0) {
        alert('¡Listo! Todos los productos tienen precio.');
        document.getElementById('priceSearchOverlay').hidden = true;
      }
    } catch (error) {
      console.error('Error guardando precio:', error);
      alert('Error al guardar: ' + error.message);
    }
  }

  // API pública
  window.PriceSearchTool = {
    init: initModal,
    abrirBuscador: function() {
      initModal();
      document.getElementById('priceSearchOverlay').hidden = false;
      cargarProductosSinPrecio();
    },
    abrirSetPriceModal: abrirSetPriceModal
  };

})();
