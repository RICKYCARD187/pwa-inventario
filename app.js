// ============================================
// CONFIGURACIÓN GLOBAL
// ============================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyw-DBn98DuOtV1KyAzl2S4xfPjLoPFM48Rf0aCDac4A6vk-_uWD97T-yAputy5ECM/exec';

// ============================================
// ESTADO DE LA APLICACIÓN
// ============================================
let appState = {
    inventory: [],
    cart: [],
    orders: [],
    currentView: 'catalog',
    theme: 'light'
};

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    applyTheme();
    registerServiceWorker();
    setupEventListeners();
    fetchInventory();
    fetchOrders();
    updateCartBadge();
});

// ============================================
// SERVICE WORKER
// ============================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registrado:', registration.scope);
            })
            .catch(error => {
                console.log('Error al registrar Service Worker:', error);
            });
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Navegación por pestañas
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view;
            switchView(view);
        });
    });

    // Badge del carrito
    document.getElementById('btn-cart-badge').addEventListener('click', () => {
        switchView('cart');
    });

    // Cambio de tema
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);

    // Actualizar inventario
    document.getElementById('btn-refresh').addEventListener('click', fetchInventory);

    // Actualizar pedidos
    document.getElementById('btn-refresh-orders').addEventListener('click', fetchOrders);

    // Vaciar carrito
    document.getElementById('btn-clear-cart').addEventListener('click', () => {
        if (appState.cart.length === 0) return;
        openModal('Vaciar carrito', '¿Estás seguro de que deseas vaciar todo el carrito?', () => {
            appState.cart = [];
            saveStateToStorage();
            renderCart();
            updateCartBadge();
            showToast('Carrito vaciado', 'info');
        });
    });

    // Enviar pedido
    document.getElementById('btn-submit-order').addEventListener('click', submitOrder);

    // Búsqueda
    document.getElementById('input-search').addEventListener('input', (e) => {
        renderCatalog(e.target.value);
    });
}

// ============================================
// NAVEGACIÓN ENTRE VISTAS
// ============================================
function switchView(viewName) {
    appState.currentView = viewName;

    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view-${viewName}`).classList.add('active');

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Refrescar datos al cambiar de vista
    if (viewName === 'cart') renderCart();
    if (viewName === 'admin') fetchOrders();
    if (viewName === 'catalog') renderCatalog();
}

// ============================================
// TEMA CLARO / OSCURO
// ============================================
function toggleTheme() {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveStateToStorage();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', appState.theme);
}

// ============================================
// ALMACENAMIENTO LOCAL
// ============================================
function saveStateToStorage() {
    try {
        localStorage.setItem('pwa_inventory_state', JSON.stringify({
            cart: appState.cart,
            theme: appState.theme
        }));
    } catch (e) {
        console.warn('No se pudo guardar en LocalStorage:', e);
    }
}

function loadStateFromStorage() {
    try {
        const saved = localStorage.getItem('pwa_inventory_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            appState.cart = parsed.cart || [];
            appState.theme = parsed.theme || 'light';
        }
    } catch (e) {
        console.warn('No se pudo cargar desde LocalStorage:', e);
    }
}

// ============================================
// PETICIONES AL SERVIDOR (APPS SCRIPT)
// ============================================

// Obtener inventario
async function fetchInventory() {
    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = `
        <div class="loading-state" style="grid-column: 1 / -1;">
            <div class="spinner"></div>
            <p>Cargando inventario...</p>
        </div>
    `;

    try {
        const url = `${SCRIPT_URL}?action=getStock`;
        console.log('🔍 Haciendo petición a:', url);
        
        const response = await fetch(url);
        console.log('📡 Respuesta recibida, status:', response.status);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
        }

        const responseText = await response.text();
        console.log('📄 Respuesta cruda:', responseText);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ No se pudo parsear JSON:', responseText);
            throw new Error('La respuesta no es JSON válido');
        }

        console.log('✅ Datos parseados:', data);

        // ADAPTADO: Tu Apps Script devuelve {result: "ok", data: [...]}
        if ((data.result === 'ok' || data.success === true) && data.data) {
            // Mapear los campos para que coincidan con la estructura esperada
            appState.inventory = data.data.map(item => ({
                codigo: item.codigo,
                nombre: item.producto || item.nombre || 'Sin nombre',
                precio: parseFloat(item.precio) || 0,
                stock: parseInt(item.stock) || 0,
                talla: item.talla || '',
                color: item.color || ''
            }));
            
            console.log('📦 Inventario cargado:', appState.inventory.length, 'productos');
            renderCatalog();
            showToast(`✅ ${appState.inventory.length} productos cargados`, 'success');
        } else {
            throw new Error('Formato de respuesta inesperado');
        }
    } catch (error) {
        console.error('❌ Error completo:', error);
        grid.innerHTML = `
            <div class="error-state" style="grid-column: 1 / -1;">
                <p>⚠️ Error al cargar el inventario</p>
                <p style="font-size: 0.875rem; margin-top: 8px; color: var(--color-danger);">${error.message}</p>
                <button class="btn-primary mt-md" onclick="fetchInventory()">Reintentar</button>
            </div>
        `;
        showToast('Error: ' + error.message, 'error');
    }
}
// Enviar pedido
async function submitOrder() {
    if (appState.cart.length === 0) {
        showToast('El carrito está vacío', 'error');
        return;
    }

    // Validar datos del cliente
    const cliente = document.getElementById('input-cliente')?.value.trim();
    const telefono = document.getElementById('input-telefono')?.value.trim();
    const direccion = document.getElementById('input-direccion')?.value.trim();
    const ciudad = document.getElementById('input-ciudad')?.value.trim();

    if (!cliente || !telefono || !direccion || !ciudad) {
        showToast('⚠️ Completa todos los datos del cliente', 'error');
        return;
    }

    openModal(
        'Confirmar Pedido',
        `Se generará un pedido para ${cliente} con ${appState.cart.length} producto(s). ¿Deseas continuar?`,
        async () => {
            const btnSubmit = document.getElementById('btn-submit-order');
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Procesando...';

            try {
                const orderData = {
                    action: 'saveOrder',
                    cliente: cliente,
                    telefono: telefono,
                    direccion: direccion,
                    ciudad: ciudad,
                    items: appState.cart.map(item => ({
                        codigo: item.codigo,
                        producto: item.nombre,
                        talla: item.talla || '',
                        color: item.color || '',
                        precio: item.precio,
                        cantidad: item.cantidad
                    })),
                    total: calculateCartTotal(),
                    fecha: new Date().toLocaleDateString('es-ES'),
                    hora: new Date().toLocaleTimeString('es-ES')
                };

                // SOLUCIÓN CORS: Enviar como text/plain para evitar preflight
                const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    },
                    body: JSON.stringify(orderData)
                });

                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }

                const result = await response.json();

                if (result.success || result.result === 'ok') {
                    appState.cart = [];
                    saveStateToStorage();
                    
                    // Limpiar formulario de cliente
                    document.getElementById('input-cliente').value = '';
                    document.getElementById('input-telefono').value = '';
                    document.getElementById('input-direccion').value = '';
                    document.getElementById('input-ciudad').value = '';
                    
                    renderCart();
                    updateCartBadge();
                    showToast('✅ Pedido registrado correctamente', 'success');
                    switchView('admin');
                    fetchOrders();
                } else {
                    throw new Error(result.message || 'Error al registrar el pedido');
                }
            } catch (error) {
                console.error('Error al enviar pedido:', error);
                showToast('❌ Error: ' + error.message, 'error');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = '✅ Confirmar Pedido';
            }
        }
    );
}

// Confirmar pago
async function approvePayment(orderId) {
    openModal(
        'Confirmar Pago',
        `¿Confirmas el pago del pedido #${orderId}? El estado cambiará a PAGADO.`,
        async () => {
            try {
                const payload = {
                    action: 'confirmPayment',
                    orderId: orderId
                };

                // SOLUCIÓN CORS: Enviar como text/plain
                const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }

                const result = await response.json();

                if (result.success || result.result === 'ok') {
                    showToast('✅ Pago confirmado correctamente', 'success');
                    fetchOrders();
                } else {
                    throw new Error(result.message || 'Error al confirmar el pago');
                }
            } catch (error) {
                console.error('Error al confirmar pago:', error);
                showToast('❌ Error: ' + error.message, 'error');
            }
        }
    );
}

// Obtener pedidos
async function fetchOrders() {
    const list = document.getElementById('orders-list');

    // Solo mostrar loading si la vista está activa
    if (appState.currentView === 'admin') {
        list.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Cargando pedidos...</p>
            </div>
        `;
    }

    try {
        const url = `${SCRIPT_URL}?action=getOrders`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
            appState.orders = data.data;
            if (appState.currentView === 'admin') {
                renderOrders();
            }
        } else {
            // Si no existe la acción getOrders, mostrar estado vacío
            appState.orders = [];
            if (appState.currentView === 'admin') {
                renderOrders();
            }
        }
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        if (appState.currentView === 'admin') {
            list.innerHTML = `
                <div class="error-state">
                    <p>⚠️ Error al cargar los pedidos</p>
                    <p style="font-size: 0.875rem; margin-top: 8px;">${error.message}</p>
                    <button class="btn-primary mt-md" onclick="fetchOrders()">Reintentar</button>
                </div>
            `;
        }
    }
}

// ============================================
// RENDERIZADO DE CATÁLOGO
// ============================================
function renderCatalog(searchTerm = '') {
    const grid = document.getElementById('catalog-grid');
    const term = searchTerm.toLowerCase().trim();

    let items = appState.inventory;
    if (term) {
        items = items.filter(item =>
            item.codigo?.toLowerCase().includes(term) ||
            item.nombre?.toLowerCase().includes(term) ||
            item.talla?.toLowerCase().includes(term) ||
            item.color?.toLowerCase().includes(term)
        );
    }

    if (items.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span class="empty-icon">🔍</span>
                <p>${term ? 'No se encontraron productos' : 'No hay productos en el inventario'}</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map(item => {
        const stock = parseInt(item.stock) || 0;
        const price = parseFloat(item.precio) || 0;
        let stockClass = 'stock-available';
        let stockText = `Stock: ${stock}`;

        if (stock === 0) {
            stockClass = 'stock-out';
            stockText = 'Agotado';
        } else if (stock <= 5) {
            stockClass = 'stock-low';
            stockText = `Stock bajo: ${stock}`;
        }

        const cartItem = appState.cart.find(c => c.codigo === item.codigo);
        const currentQty = cartItem ? cartItem.cantidad : 1;

        // Construir información adicional (talla y color)
        const extraInfo = [];
        if (item.talla) extraInfo.push(`Talla: ${item.talla}`);
        if (item.color) extraInfo.push(`Color: ${item.color}`);
        const extraInfoHtml = extraInfo.length > 0 
            ? `<div class="product-extra-info">${extraInfo.join(' • ')}</div>` 
            : '';

        return `
            <div class="product-card" data-code="${item.codigo}">
                <span class="product-code">${item.codigo || 'S/C'}</span>
                <h3 class="product-name">${item.nombre || 'Sin nombre'}</h3>
                ${extraInfoHtml}
                <div class="product-price">$${price.toFixed(2)}</div>
                <div class="product-stock">
                    <span class="stock-badge ${stockClass}">${stockText}</span>
                </div>
                <div class="product-actions">
                    <div class="quantity-control">
                        <button onclick="changeQty('${item.codigo}', -1)" ${stock === 0 ? 'disabled' : ''}>−</button>
                        <input type="number" id="qty-${item.codigo}" value="${currentQty}" min="1" max="${stock}" onchange="validateQty('${item.codigo}', ${stock})">
                        <button onclick="changeQty('${item.codigo}', 1)" ${stock === 0 ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="btn-primary btn-sm" onclick="addToCart('${item.codigo}')" ${stock === 0 ? 'disabled' : ''}>
                        ${cartItem ? '🔄 Actualizar' : '🛒 Agregar'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function changeQty(code, delta) {
    const input = document.getElementById(`qty-${code}`);
    const item = appState.inventory.find(i => i.codigo === code);
    if (!item) return;

    const maxStock = parseInt(item.stock) || 0;
    let newVal = parseInt(input.value) + delta;
    if (newVal < 1) newVal = 1;
    if (newVal > maxStock) newVal = maxStock;
    input.value = newVal;
}

function validateQty(code, maxStock) {
    const input = document.getElementById(`qty-${code}`);
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > maxStock) val = maxStock;
    input.value = val;
}

// ============================================
// GESTIÓN DEL CARRITO
// ============================================
function addToCart(code) {
    const item = appState.inventory.find(i => i.codigo === code);
    if (!item) return;

    const qtyInput = document.getElementById(`qty-${code}`);
    const quantity = parseInt(qtyInput?.value) || 1;
    const maxStock = parseInt(item.stock) || 0;

    if (quantity > maxStock) {
        showToast(`Stock insuficiente. Máximo: ${maxStock}`, 'error');
        return;
    }

    const existingIndex = appState.cart.findIndex(c => c.codigo === code);

    if (existingIndex >= 0) {
        appState.cart[existingIndex].cantidad = quantity;
        showToast(`Actualizado: ${item.nombre}`, 'info');
    } else {
        appState.cart.push({
            codigo: item.codigo,
            nombre: item.nombre,
            precio: parseFloat(item.precio) || 0,
            cantidad: quantity
        });
        showToast(`Agregado: ${item.nombre}`, 'success');
    }

    saveStateToStorage();
    updateCartBadge();
    renderCatalog(document.getElementById('input-search').value);
}

function removeFromCart(code) {
    appState.cart = appState.cart.filter(item => item.codigo !== code);
    saveStateToStorage();
    renderCart();
    updateCartBadge();
    showToast('Producto eliminado del carrito', 'info');
}

function updateCartItemQty(code, newQty) {
    const item = appState.cart.find(c => c.codigo === code);
    if (!item) return;

    const inventoryItem = appState.inventory.find(i => i.codigo === code);
    const maxStock = inventoryItem ? parseInt(inventoryItem.stock) || 0 : 999;

    if (newQty < 1) {
        removeFromCart(code);
        return;
    }
    if (newQty > maxStock) {
        showToast(`Stock máximo: ${maxStock}`, 'error');
        newQty = maxStock;
    }

    item.cantidad = newQty;
    saveStateToStorage();
    renderCart();
    updateCartBadge();
}

function calculateCartTotal() {
    return appState.cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
}

function updateCartBadge() {
    const count = appState.cart.reduce((sum, item) => sum + item.cantidad, 0);
    document.getElementById('cart-count').textContent = count;
}

function renderCart() {
    const content = document.getElementById('cart-content');
    const summary = document.getElementById('cart-summary');

    if (appState.cart.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🛒</span>
                <p>Tu carrito está vacío</p>
                <button class="btn-primary mt-md" onclick="switchView('catalog')">Ir al Catálogo</button>
            </div>
        `;
        summary.classList.add('hidden');
        return;
    }

    content.innerHTML = appState.cart.map(item => {
        const subtotal = item.precio * item.cantidad;
        const inventoryItem = appState.inventory.find(i => i.codigo === item.codigo);
        const maxStock = inventoryItem ? parseInt(inventoryItem.stock) || 0 : 999;

        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nombre}</div>
                    <div class="cart-item-code">${item.codigo}</div>
                    <div class="cart-item-price">$${item.precio.toFixed(2)} c/u</div>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-control">
                        <button onclick="updateCartItemQty('${item.codigo}', ${item.cantidad - 1})">−</button>
                        <input type="number" value="${item.cantidad}" min="1" max="${maxStock}"
                            onchange="updateCartItemQty('${item.codigo}', parseInt(this.value))">
                        <button onclick="updateCartItemQty('${item.codigo}', ${item.cantidad + 1})">+</button>
                    </div>
                    <div class="cart-item-subtotal">$${subtotal.toFixed(2)}</div>
                    <button class="btn-remove" onclick="removeFromCart('${item.codigo}')" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }).join('');

    const subtotal = calculateCartTotal();
    document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('cart-total').textContent = `$${subtotal.toFixed(2)}`;
    summary.classList.remove('hidden');
}

// ============================================
// RENDERIZADO DE PEDIDOS
// ============================================
function renderOrders() {
    const list = document.getElementById('orders-list');

    if (!appState.orders || appState.orders.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📋</span>
                <p>No hay pedidos registrados</p>
            </div>
        `;
        return;
    }

    list.innerHTML = appState.orders.map(order => {
        const status = (order.estado || 'PENDIENTE').toUpperCase();
        const statusClass = status === 'PAGADO' ? 'status-pagado' : 'status-pendiente';
        const items = order.items || [];
        const total = parseFloat(order.total) || items.reduce((s, i) => s + (parseFloat(i.precio) * parseInt(i.cantidad)), 0);

        // Información del cliente
        const clientInfo = order.cliente ? `
            <div class="order-client-info">
                <div class="client-row"><strong>👤 Cliente:</strong> ${order.cliente}</div>
                <div class="client-row"><strong>📞 Teléfono:</strong> ${order.telefono || 'N/A'}</div>
                <div class="client-row"><strong>📍 Dirección:</strong> ${order.direccion || 'N/A'}</div>
                <div class="client-row"><strong>🏙️ Ciudad:</strong> ${order.ciudad || 'N/A'}</div>
            </div>
        ` : '';

        const itemsHtml = items.map(item => `
            <div class="order-item-row">
                <div>
                    <strong>${item.producto || item.nombre || item.codigo}</strong>
                    <div class="item-details">
                        ${item.talla ? `Talla: ${item.talla}` : ''} 
                        ${item.color ? `• Color: ${item.color}` : ''}
                        ${item.codigo ? `• Código: ${item.codigo}` : ''}
                    </div>
                </div>
                <div class="item-qty-price">
                    <div>Cant: ${item.cantidad}</div>
                    <div>Bs ${((parseFloat(item.precio) || 0) * parseInt(item.cantidad)).toFixed(2)}</div>
                </div>
            </div>
        `).join('');

        const actionButton = status === 'PENDIENTE' ? `
            <div class="order-actions">
                <button class="btn-success" onclick="approvePayment('${order.id || order.orderId}')">
                    💰 Confirmar Pago
                </button>
            </div>
        ` : '';

        return `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <div class="order-id">Pedido #${order.id || order.orderId || 'N/A'}</div>
                        <div class="order-date">
                            📅 ${order.fecha || 'Sin fecha'} 
                            ${order.hora ? `• 🕐 ${order.hora}` : ''}
                        </div>
                    </div>
                    <span class="status-badge ${statusClass}">${status}</span>
                </div>
                
                ${clientInfo}
                
                <div class="order-items">
                    <h4>📦 Productos:</h4>
                    ${itemsHtml || '<p style="color: var(--color-text-secondary); font-size: 0.875rem;">Sin detalle de productos</p>'}
                </div>
                
                <div class="order-total">
                    <span>Total:</span>
                    <span>Bs ${total.toFixed(2)}</span>
                </div>
                
                ${actionButton}
            </div>
        `;
    }).join('');
}

// ============================================
// MODAL
// ============================================
function openModal(title, message, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-overlay').classList.remove('hidden');

    const confirmBtn = document.getElementById('modal-confirm');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.id = 'modal-confirm';
    newBtn.addEventListener('click', () => {
        closeModal();
        if (onConfirm) onConfirm();
    });
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
        closeModal();
    }
});

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
