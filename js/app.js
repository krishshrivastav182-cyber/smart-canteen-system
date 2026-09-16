/**
 * Smart Canteen System - Main Application Logic
 * MGM College of Engineering & Technology, Navi Mumbai
 */

(function () {
    'use strict';

    // --- State Management ---
    const state = {
        cart: JSON.parse(localStorage.getItem('mgm_canteen_cart') || '[]'),
        activeCategory: 'all',
        dietaryFilter: 'all', // 'all', 'veg', 'jain', 'spicy'
        searchQuery: '',
        sortBy: 'popular',
        pickupType: 'counter', // 'counter' or 'table'
        tableNumber: 'Table 04',
        studentDetails: JSON.parse(localStorage.getItem('mgm_student_details') || '{"name":"Aditya Verma","prn":"21MGMCE048","phone":"9820198201"}'),
        appliedCoupon: null,
        activeOrders: JSON.parse(localStorage.getItem('mgm_canteen_orders') || '[]'),
        currentCrowd: CANTEEN_DATA.crowdStatus.currentLevel,
        theme: localStorage.getItem('mgm_canteen_theme') || 'dark'
    };

    // --- Web Audio API (Chime Generator) ---
    function playChime(type = 'add') {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            if (type === 'ready') {
                // Success Fanfare (Ready for pickup)
                const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
                notes.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(ctx.currentTime + idx * 0.1);
                    osc.stop(ctx.currentTime + idx * 0.1 + 0.35);
                });
            } else if (type === 'order') {
                // Order placed confirmation chime
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            } else {
                // Subtle pop/click for add-to-cart
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            }
        } catch (e) {
            console.log('Audio disabled or blocked by browser policy:', e);
        }
    }

    // --- Toast Notifications ---
    function showToast(message, icon = '✨') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // --- Theme Controller ---
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('mgm_canteen_theme', theme);
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.innerHTML = theme === 'light' ? '🌙' : '☀️';
            themeBtn.setAttribute('title', `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`);
        }
    }

    // --- Cart Methods ---
    function saveCart() {
        localStorage.setItem('mgm_canteen_cart', JSON.stringify(state.cart));
        updateCartBadge();
        renderCartDrawer();
        renderMenuGrid();
        renderCombos();
    }

    function addToCart(itemId, customNote = '') {
        const item = CANTEEN_DATA.menuItems.find(i => i.id === itemId);
        if (!item || !item.inStock) {
            showToast('Sorry, this item is temporarily sold out!', '⚠️');
            return;
        }

        const existing = state.cart.find(c => c.id === itemId);
        if (existing) {
            existing.qty += 1;
        } else {
            state.cart.push({
                id: item.id,
                name: item.name,
                price: item.price,
                isVeg: item.isVeg,
                image: item.image,
                qty: 1,
                note: customNote
            });
        }
        playChime('add');
        showToast(`Added ${item.name} to tray`, '🛒');
        saveCart();
    }

    function updateQty(itemId, delta) {
        const index = state.cart.findIndex(c => c.id === itemId);
        if (index === -1) return;

        state.cart[index].qty += delta;
        if (state.cart[index].qty <= 0) {
            const removedItem = state.cart[index].name;
            state.cart.splice(index, 1);
            showToast(`Removed ${removedItem}`, '🗑️');
        }
        playChime('add');
        saveCart();
    }

    function getCartTotals() {
        const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        let discount = 0;

        if (state.appliedCoupon) {
            if (state.appliedCoupon.discountPercent) {
                discount = Math.round((subtotal * state.appliedCoupon.discountPercent) / 100);
            } else if (state.appliedCoupon.discountFlat) {
                discount = state.appliedCoupon.discountFlat;
            }
        }

        const canteenTechFee = subtotal > 0 ? 2 : 0; // ₹2 nominal digital maintenance fee
        const finalTotal = Math.max(0, subtotal - discount + canteenTechFee);

        return { subtotal, discount, fee: canteenTechFee, finalTotal };
    }

    function updateCartBadge() {
        const totalItems = state.cart.reduce((sum, i) => sum + i.qty, 0);
        const badges = document.querySelectorAll('.cart-count');
        badges.forEach(b => {
            b.textContent = totalItems;
            b.classList.remove('pulse-badge');
            void b.offsetWidth; // trigger reflow
            b.classList.add('pulse-badge');
        });

        // Update mobile bottom bar total if present
        const mobileTotalEl = document.getElementById('mobile-cart-total');
        if (mobileTotalEl) {
            const { finalTotal } = getCartTotals();
            mobileTotalEl.textContent = `₹${finalTotal} (${totalItems} items)`;
        }
    }

    // --- Crowd Status Manager ---
    function renderCrowdStatus() {
        const crowdInfo = CANTEEN_DATA.crowdStatus.levels[state.currentCrowd];
        if (!crowdInfo) return;

        const badge = document.getElementById('rush-status-badge');
        const waitTimeEl = document.getElementById('rush-wait-time');
        const tablesFreeEl = document.getElementById('rush-tables-free');
        const descEl = document.getElementById('rush-desc');
        const progressFill = document.getElementById('rush-progress-fill');

        if (badge) {
            badge.className = `rush-badge ${crowdInfo.badgeClass}`;
            badge.innerHTML = `<span>●</span> ${crowdInfo.label}`;
        }
        if (waitTimeEl) waitTimeEl.textContent = crowdInfo.waitTime;
        if (tablesFreeEl) tablesFreeEl.textContent = crowdInfo.tablesFree;
        if (descEl) descEl.textContent = crowdInfo.description;

        if (progressFill) {
            let width = '30%';
            if (state.currentCrowd === 'moderate') width = '60%';
            if (state.currentCrowd === 'peak') width = '92%';
            progressFill.style.width = width;
        }
    }

    // --- Render Combos ---
    function renderCombos() {
        const container = document.getElementById('combos-grid');
        if (!container) return;

        const combos = CANTEEN_DATA.menuItems.filter(item => item.category === 'combos');
        container.innerHTML = combos.map(item => {
            const cartItem = state.cart.find(c => c.id === item.id);
            const qty = cartItem ? cartItem.qty : 0;

            return `
                <div class="combo-card" data-id="${item.id}">
                    <div class="card-media">
                        <img src="${item.image}" alt="${item.name}" loading="lazy" />
                        <span class="card-deal-badge">SAVE ₹${item.originalPrice - item.price}</span>
                        <span class="prep-time-badge">⏱️ ${item.prepTime}</span>
                    </div>
                    <div class="card-content">
                        <div class="card-title-row">
                            <h3 class="dish-name">${item.name}</h3>
                            <span class="dietary-icon ${item.isVeg ? 'veg' : 'nonveg'}" title="${item.isVeg ? 'Pure Veg' : 'Non-Veg'}"></span>
                        </div>
                        <p class="dish-desc">${item.description}</p>
                        <div class="card-meta-row">
                            <span class="card-rating">★ ${item.rating}</span>
                            <span>(${item.reviewsCount} orders)</span>
                            <span>•</span>
                            <span>🔥 ${item.calories}</span>
                        </div>
                        <div class="card-footer">
                            <div class="price-wrap">
                                <span class="current-price">₹${item.price}</span>
                                <span class="original-price">₹${item.originalPrice}</span>
                            </div>
                            ${qty === 0 ? `
                                <button class="btn-add-cart" onclick="window.SmartCanteen.addToCart(${item.id})">
                                    <span>+</span> Add Combo
                                </button>
                            ` : `
                                <div class="qty-control">
                                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, -1)">−</button>
                                    <span class="qty-number">${qty}</span>
                                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, 1)">+</button>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Render Main Menu Grid ---
    function renderMenuGrid() {
        const container = document.getElementById('menu-grid');
        if (!container) return;

        let filtered = CANTEEN_DATA.menuItems.filter(item => {
            // Category filter
            if (state.activeCategory !== 'all' && item.category !== state.activeCategory) {
                return false;
            }
            // Dietary filter
            if (state.dietaryFilter === 'veg' && !item.isVeg) return false;
            if (state.dietaryFilter === 'jain' && !item.isJain) return false;
            if (state.dietaryFilter === 'spicy' && !item.isSpicy) return false;

            // Search query
            if (state.searchQuery.trim() !== '') {
                const q = state.searchQuery.toLowerCase();
                return item.name.toLowerCase().includes(q) ||
                    item.description.toLowerCase().includes(q) ||
                    item.category.toLowerCase().includes(q);
            }
            return true;
        });

        // Sorting
        if (state.sortBy === 'price-low') {
            filtered.sort((a, b) => a.price - b.price);
        } else if (state.sortBy === 'price-high') {
            filtered.sort((a, b) => b.price - a.price);
        } else if (state.sortBy === 'rating') {
            filtered.sort((a, b) => b.rating - a.rating);
        } else if (state.sortBy === 'time') {
            filtered.sort((a, b) => parseInt(a.prepTime) - parseInt(b.prepTime));
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="no-results-box">
                    <h3>No Canteen Items Found 🍽️</h3>
                    <p>We couldn't find anything matching "${state.searchQuery || state.dietaryFilter}". Try another filter or search keyword!</p>
                    <button class="btn-primary" onclick="window.SmartCanteen.resetFilters()">Show Full Menu</button>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => {
            const cartItem = state.cart.find(c => c.id === item.id);
            const qty = cartItem ? cartItem.qty : 0;

            return `
                <div class="combo-card" data-id="${item.id}">
                    <div class="card-media">
                        <img src="${item.image}" alt="${item.name}" loading="lazy" />
                        ${item.isPopular ? '<span class="card-deal-badge" style="background: linear-gradient(135deg, #FF6600 0%, #E65100 100%)">⭐ BESTSELLER</span>' : ''}
                        <span class="prep-time-badge">⏱️ ${item.prepTime}</span>
                    </div>
                    <div class="card-content">
                        <div class="card-title-row">
                            <h3 class="dish-name">${item.name}</h3>
                            <span class="dietary-icon ${item.isVeg ? 'veg' : 'nonveg'}" title="${item.isVeg ? 'Pure Veg' : 'Non-Veg'}"></span>
                        </div>
                        <p class="dish-desc">${item.description}</p>
                        <div class="card-meta-row">
                            <span class="card-rating">★ ${item.rating}</span>
                            <span>(${item.reviewsCount})</span>
                            <span>•</span>
                            <span>${item.calories}</span>
                            ${item.isJain ? '<span>• <strong style="color:var(--jain-color)">Jain</strong></span>' : ''}
                        </div>
                        <div class="card-footer">
                            <div class="price-wrap">
                                <span class="current-price">₹${item.price}</span>
                                ${item.originalPrice > item.price ? `<span class="original-price">₹${item.originalPrice}</span>` : ''}
                            </div>
                            ${qty === 0 ? `
                                <button class="btn-add-cart" onclick="window.SmartCanteen.addToCart(${item.id})">
                                    <span>+</span> Add
                                </button>
                            ` : `
                                <div class="qty-control">
                                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, -1)">−</button>
                                    <span class="qty-number">${qty}</span>
                                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, 1)">+</button>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Render Category Pills ---
    function renderCategoryPills() {
        const container = document.getElementById('category-pills-row');
        if (!container) return;

        container.innerHTML = CANTEEN_DATA.categories.map(cat => `
            <button class="cat-pill ${state.activeCategory === cat.id ? 'active' : ''}" 
                    onclick="window.SmartCanteen.setCategory('${cat.id}')">
                <span>${cat.icon}</span> ${cat.name}
            </button>
        `).join('');
    }

    // --- Render Cart Drawer ---
    function renderCartDrawer() {
        const itemsList = document.getElementById('cart-items-list');
        const emptyNotice = document.getElementById('cart-empty-notice');
        const checkoutBtn = document.getElementById('btn-checkout-submit');
        const billBreakdown = document.getElementById('cart-bill-breakdown');

        if (!itemsList) return;

        if (state.cart.length === 0) {
            if (emptyNotice) emptyNotice.style.display = 'block';
            itemsList.innerHTML = '';
            if (billBreakdown) billBreakdown.style.display = 'none';
            if (checkoutBtn) checkoutBtn.disabled = true;
            return;
        }

        if (emptyNotice) emptyNotice.style.display = 'none';
        if (billBreakdown) billBreakdown.style.display = 'flex';
        if (checkoutBtn) checkoutBtn.disabled = false;

        itemsList.innerHTML = state.cart.map(item => `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">₹${item.price} × ${item.qty} = <strong>₹${item.price * item.qty}</strong></div>
                </div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, -1)">−</button>
                    <span class="qty-number">${item.qty}</span>
                    <button class="qty-btn" onclick="window.SmartCanteen.updateQty(${item.id}, 1)">+</button>
                </div>
            </div>
        `).join('');

        // Update bill values
        const { subtotal, discount, fee, finalTotal } = getCartTotals();
        document.getElementById('bill-subtotal').textContent = `₹${subtotal}`;
        document.getElementById('bill-discount').textContent = `-₹${discount}`;
        document.getElementById('bill-fee').textContent = `₹${fee}`;
        document.getElementById('bill-final-total').textContent = `₹${finalTotal}`;
        document.getElementById('checkout-pay-amt').textContent = `₹${finalTotal}`;
    }

    // --- Order Tracker Renderer ---
    function renderActiveTrackerBanner() {
        const banner = document.getElementById('active-tracker-banner');
        if (!banner) return;

        const latestOrder = state.activeOrders.find(o => o.status !== 'collected');
        if (!latestOrder) {
            banner.style.display = 'none';
            return;
        }

        banner.style.display = 'flex';
        document.getElementById('banner-token-num').textContent = latestOrder.token;
        document.getElementById('banner-order-desc').textContent = `${latestOrder.items.length} items (${latestOrder.pickupType === 'counter' ? 'Counter Pickup' : latestOrder.tableNumber})`;

        let statusTitle = 'Order Received by Kitchen';
        let stepIdx = 1;
        if (latestOrder.status === 'preparing') {
            statusTitle = '👨‍🍳 Chef is Preparing Your Food';
            stepIdx = 2;
        } else if (latestOrder.status === 'ready') {
            statusTitle = '🔔 Ready for Pickup at MGM Counter!';
            stepIdx = 3;
        }

        document.getElementById('banner-status-text').textContent = statusTitle;

        // Mini step dots
        const steps = banner.querySelectorAll('.mini-step');
        steps.forEach((step, idx) => {
            step.className = 'mini-step';
            if (idx + 1 < stepIdx) step.classList.add('completed');
            if (idx + 1 === stepIdx) step.classList.add('active');
        });
    }

    // --- Open Order Status Modal ---
    function openOrderModal(orderId) {
        let order = state.activeOrders.find(o => o.id === orderId);
        if (!order) {
            order = state.activeOrders[state.activeOrders.length - 1];
        }
        if (!order) return;

        const modal = document.getElementById('order-status-modal');
        if (!modal) return;

        document.getElementById('modal-token-display').textContent = order.token;
        document.getElementById('modal-order-id').textContent = order.id;
        document.getElementById('modal-student-info').textContent = `${order.student.name} • ${order.student.prn}`;
        document.getElementById('modal-delivery-mode').textContent = order.pickupType === 'counter' ? 'Self Counter Pickup' : order.tableNumber;
        document.getElementById('modal-order-total').textContent = `₹${order.total}`;

        // Timeline steps
        const step1 = document.getElementById('track-step-1');
        const step2 = document.getElementById('track-step-2');
        const step3 = document.getElementById('track-step-3');
        const step4 = document.getElementById('track-step-4');

        [step1, step2, step3, step4].forEach(s => s && (s.className = 'timeline-step'));

        if (order.status === 'placed') {
            step1.classList.add('active');
        } else if (order.status === 'preparing') {
            step1.classList.add('completed');
            step2.classList.add('active');
        } else if (order.status === 'ready') {
            step1.classList.add('completed');
            step2.classList.add('completed');
            step3.classList.add('active');
        } else if (order.status === 'collected') {
            step1.classList.add('completed');
            step2.classList.add('completed');
            step3.classList.add('completed');
            step4.classList.add('active');
        }

        // Action button
        const actionBtn = document.getElementById('btn-collect-order');
        if (actionBtn) {
            if (order.status === 'ready') {
                actionBtn.style.display = 'block';
                actionBtn.textContent = '✅ Mark as Collected / Received';
                actionBtn.onclick = () => window.SmartCanteen.advanceOrderStatus(order.id, 'collected');
            } else if (order.status === 'collected') {
                actionBtn.style.display = 'block';
                actionBtn.textContent = 'Order Completed ✨';
                actionBtn.disabled = true;
            } else {
                actionBtn.style.display = 'none';
            }
        }

        modal.classList.add('open');
    }

    // --- Place Order Logic ---
    function placeOrder(paymentMethod = 'UPI') {
        const { finalTotal } = getCartTotals();
        if (state.cart.length === 0) return;

        const nameInput = document.getElementById('student-name-input').value.trim() || state.studentDetails.name;
        const prnInput = document.getElementById('student-prn-input').value.trim() || state.studentDetails.prn;
        const phoneInput = document.getElementById('student-phone-input').value.trim() || state.studentDetails.phone;

        state.studentDetails = { name: nameInput, prn: prnInput, phone: phoneInput };
        localStorage.setItem('mgm_student_details', JSON.stringify(state.studentDetails));

        // Generate dynamic token like #MGM-314
        const tokenNumber = `#MGM-${Math.floor(100 + Math.random() * 900)}`;
        const orderId = `ORD-${Date.now().toString().slice(-6)}`;

        const newOrder = {
            id: orderId,
            token: tokenNumber,
            timestamp: new Date().toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }),
            status: 'placed', // 'placed', 'preparing', 'ready', 'collected'
            items: [...state.cart],
            total: finalTotal,
            pickupType: state.pickupType,
            tableNumber: state.tableNumber,
            student: state.studentDetails,
            paymentMethod: paymentMethod
        };

        state.activeOrders.unshift(newOrder);
        localStorage.setItem('mgm_canteen_orders', JSON.stringify(state.activeOrders));

        // Clear cart
        state.cart = [];
        state.appliedCoupon = null;
        saveCart();

        // Close Drawer & UPI modal
        window.SmartCanteen.closeDrawer();
        window.SmartCanteen.closeModal('upi-modal');

        // Play order chime
        playChime('order');
        showToast(`Order Placed! Token ${tokenNumber} Generated`, '🎉');

        renderActiveTrackerBanner();
        openOrderModal(newOrder.id);

        // Auto-simulation for demonstration:
        // Placed -> Preparing in 15 seconds -> Ready in 35 seconds
        setTimeout(() => {
            advanceOrderStatus(orderId, 'preparing');
        }, 12000);

        setTimeout(() => {
            advanceOrderStatus(orderId, 'ready');
        }, 28000);
    }

    // --- Order Status Advancement ---
    function advanceOrderStatus(orderId, nextStatus) {
        const order = state.activeOrders.find(o => o.id === orderId);
        if (!order) return;

        order.status = nextStatus;
        localStorage.setItem('mgm_canteen_orders', JSON.stringify(state.activeOrders));

        if (nextStatus === 'ready') {
            playChime('ready');
            showToast(`🔔 Token ${order.token} is READY for pickup at Counter!`, '✨');
        } else if (nextStatus === 'preparing') {
            showToast(`Chef started preparing Token ${order.token}`, '🍳');
        }

        renderActiveTrackerBanner();
        renderStaffDashboard();

        const currentModal = document.getElementById('order-status-modal');
        if (currentModal && currentModal.classList.contains('open')) {
            openOrderModal(orderId);
        }
    }

    // --- Render Staff Dashboard ---
    function renderStaffDashboard() {
        const queueContainer = document.getElementById('staff-orders-queue');
        if (!queueContainer) return;

        if (state.activeOrders.length === 0) {
            queueContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:2rem;">No pending campus orders right now.</p>';
            return;
        }

        queueContainer.innerHTML = state.activeOrders.map(ord => {
            let nextActionBtn = '';
            if (ord.status === 'placed') {
                nextActionBtn = `<button class="btn-advance-status" onclick="window.SmartCanteen.advanceOrderStatus('${ord.id}', 'preparing')">Start Preparing 🍳</button>`;
            } else if (ord.status === 'preparing') {
                nextActionBtn = `<button class="btn-advance-status" style="background:#10B981;" onclick="window.SmartCanteen.advanceOrderStatus('${ord.id}', 'ready')">Mark Ready 🔔</button>`;
            } else if (ord.status === 'ready') {
                nextActionBtn = `<button class="btn-advance-status" style="background:#3B82F6;" onclick="window.SmartCanteen.advanceOrderStatus('${ord.id}', 'collected')">Mark Collected ✅</button>`;
            } else {
                nextActionBtn = `<span style="font-size:0.75rem; color:var(--veg-color);">✓ Completed</span>`;
            }

            return `
                <div class="staff-order-box">
                    <div class="staff-order-header">
                        <span class="staff-order-token">${ord.token}</span>
                        <span style="font-size:0.75rem; color:var(--text-muted);">${ord.timestamp}</span>
                    </div>
                    <div style="font-size:0.85rem; font-weight:700;">
                        ${ord.student.name} (${ord.student.prn})
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-secondary);">
                        ${ord.pickupType === 'counter' ? 'Counter Pickup' : ord.tableNumber} • <strong>₹${ord.total}</strong>
                    </div>
                    <div style="font-size:0.8rem; border-top:1px dashed var(--border-color); padding-top:4px;">
                        ${ord.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                    </div>
                    ${nextActionBtn}
                </div>
            `;
        }).join('');
    }

    // --- Expose Public API to Window ---
    window.SmartCanteen = {
        state,

        // Cart Actions
        addToCart,
        updateQty,
        openDrawer: () => {
            document.getElementById('cart-drawer-overlay').classList.add('open');
            document.getElementById('cart-drawer').classList.add('open');
        },
        closeDrawer: () => {
            document.getElementById('cart-drawer-overlay').classList.remove('open');
            document.getElementById('cart-drawer').classList.remove('open');
        },

        // Category & Filters
        setCategory: (catId) => {
            state.activeCategory = catId;
            renderCategoryPills();
            renderMenuGrid();
        },
        setDietaryFilter: (diet) => {
            state.dietaryFilter = diet;
            const pills = document.querySelectorAll('.diet-pill');
            pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-diet') === diet));
            renderMenuGrid();
        },
        setSortBy: (sortVal) => {
            state.sortBy = sortVal;
            renderMenuGrid();
        },
        handleSearch: (val) => {
            state.searchQuery = val;
            renderMenuGrid();
        },
        resetFilters: () => {
            state.activeCategory = 'all';
            state.dietaryFilter = 'all';
            state.searchQuery = '';
            const searchInput = document.getElementById('menu-search-input');
            if (searchInput) searchInput.value = '';
            renderCategoryPills();
            state.dietaryFilter = 'all';
            const pills = document.querySelectorAll('.diet-pill');
            pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-diet') === 'all'));
            renderMenuGrid();
        },

        // Pickup Switcher
        setPickupType: (type) => {
            state.pickupType = type;
            document.getElementById('pickup-counter-btn').classList.toggle('active', type === 'counter');
            document.getElementById('pickup-table-btn').classList.toggle('active', type === 'table');
            const tableField = document.getElementById('table-select-group');
            if (tableField) tableField.style.display = type === 'table' ? 'block' : 'none';
        },
        setTableNumber: (num) => {
            state.tableNumber = num;
        },

        // Coupons
        applyCoupon: () => {
            const input = document.getElementById('coupon-input');
            if (!input) return;
            const code = input.value.trim().toUpperCase();
            const coupon = CANTEEN_DATA.coupons[code];

            if (!coupon) {
                showToast('Invalid Coupon Code. Try MGM10!', '❌');
                return;
            }

            const { subtotal } = getCartTotals();
            if (subtotal < coupon.minOrder) {
                showToast(`Minimum order of ₹${coupon.minOrder} required for ${code}`, '⚠️');
                return;
            }

            state.appliedCoupon = coupon;
            showToast(`Coupon applied! ${coupon.description}`, '🏷️');
            renderCartDrawer();
        },

        // Checkout & Payment Modals
        proceedToCheckout: () => {
            if (state.cart.length === 0) return;
            const upiModal = document.getElementById('upi-modal');
            const { finalTotal } = getCartTotals();
            document.getElementById('upi-modal-amount').textContent = `₹${finalTotal}`;
            upiModal.classList.add('open');
        },
        confirmUpiPayment: () => {
            placeOrder('UPI (PhonePe/GPay)');
        },
        payCashCounter: () => {
            placeOrder('Pay Cash at Canteen Counter');
        },

        // Order Tracker & Modals
        openActiveOrderModal: () => {
            openOrderModal();
        },
        advanceOrderStatus,

        // Staff Dashboard
        openStaffModal: () => {
            renderStaffDashboard();
            document.getElementById('staff-modal').classList.add('open');
        },
        setCrowdLevel: (level) => {
            state.currentCrowd = level;
            renderCrowdStatus();
            showToast(`Canteen rush level updated to ${level.toUpperCase()}`, '⚡');
        },

        // Generic Modal Closer
        closeModal: (modalId) => {
            const m = document.getElementById(modalId);
            if (m) m.classList.remove('open');
        },

        // Theme Toggle
        toggleTheme: () => {
            const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
            state.theme = nextTheme;
            applyTheme(nextTheme);
        },

        // Testimonial Submit
        submitReview: (e) => {
            e.preventDefault();
            const name = document.getElementById('rev-name').value;
            const dept = document.getElementById('rev-dept').value;
            const msg = document.getElementById('rev-msg').value;

            CANTEEN_DATA.testimonials.unshift({
                name: name,
                role: dept,
                avatar: '🎓',
                comment: msg,
                rating: 5
            });

            renderTestimonials();
            showToast('Thank you for rating MGM Canteen!', '❤️');
            e.target.reset();
        }
    };

    // --- Render Testimonials ---
    function renderTestimonials() {
        const container = document.getElementById('testimonials-grid');
        if (!container) return;

        container.innerHTML = CANTEEN_DATA.testimonials.map(t => `
            <div class="testi-card">
                <div class="testi-header">
                    <div class="testi-avatar">${t.avatar}</div>
                    <div class="testi-info">
                        <h4>${t.name}</h4>
                        <p>${t.role}</p>
                    </div>
                </div>
                <div style="color:#F59E0B; font-size:0.9rem; margin-bottom:8px;">
                    ${'★'.repeat(t.rating)}
                </div>
                <p class="testi-comment">"${t.comment}"</p>
            </div>
        `).join('');
    }

    // --- App Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(state.theme);
        renderCrowdStatus();
        renderCombos();
        renderCategoryPills();
        renderMenuGrid();
        renderCartDrawer();
        updateCartBadge();
        renderActiveTrackerBanner();
        renderTestimonials();

        // Populate student inputs if stored
        const nameInput = document.getElementById('student-name-input');
        const prnInput = document.getElementById('student-prn-input');
        const phoneInput = document.getElementById('student-phone-input');
        if (nameInput) nameInput.value = state.studentDetails.name;
        if (prnInput) prnInput.value = state.studentDetails.prn;
        if (phoneInput) phoneInput.value = state.studentDetails.phone;

        // Auto-refresh crowd meter simulation slightly every 3 minutes
        setInterval(() => {
            const levels = ['low', 'moderate', 'peak'];
            const randomLevel = levels[Math.floor(Math.random() * levels.length)];
            state.currentCrowd = randomLevel;
            renderCrowdStatus();
        }, 180000);
    });

})();
/* FINAL WORKING LOGIN PATCH */
window.SmartCanteen = window.SmartCanteen || {};

window.SmartCanteen.handleLogin = function (event) {
    if (event) event.preventDefault();

    const uid = document.getElementById("login-uid").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const errorAlert = document.getElementById("login-error-alert");
    const errorMsg = document.getElementById("login-error-msg");

    if (!uid || !password) {
        errorMsg.textContent = "Please enter your UID No. and Password.";
        errorAlert.style.display = "flex";
        return false;
    }

    // Demo login validation
    if (password !== "mgm@2026" && password !== "123456") {
        errorMsg.textContent =
            "Invalid demo password. Use mgm@2026 or 123456.";
        errorAlert.style.display = "flex";
        return false;
    }

    errorAlert.style.display = "none";

    sessionStorage.setItem("smartCanteenLoggedIn", "true");
    sessionStorage.setItem("smartCanteenUID", uid);

    // Correctly switch views
    document.getElementById("login-view").style.display = "none";
    document.getElementById("dashboard-view").style.display = "block";

    // Update logged-in UID in navbar
    const navUserName = document.getElementById("nav-user-name");
    if (navUserName) navUserName.textContent = uid;

    window.scrollTo(0, 0);
    return false;
};

window.SmartCanteen.togglePasswordVisibility = function () {
    const passwordInput = document.getElementById("login-password");
    const icon = document.getElementById("pwd-toggle-icon");

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        if (icon) icon.textContent = "🙈";
    } else {
        passwordInput.type = "password";
        if (icon) icon.textContent = "👁️";
    }
};

window.SmartCanteen.demoFillLogin = function () {
    document.getElementById("login-uid").value = "21MGMCE048";
    document.getElementById("login-password").value = "mgm@2026";

    const errorAlert = document.getElementById("login-error-alert");
    if (errorAlert) errorAlert.style.display = "none";
};

window.SmartCanteen.openForgotPasswordModal = function () {
    const modal = document.getElementById("forgot-pwd-modal");
    if (modal) modal.classList.add("open");
};

window.SmartCanteen.handleLogout = function () {
    sessionStorage.removeItem("smartCanteenLoggedIn");
    sessionStorage.removeItem("smartCanteenUID");

    document.getElementById("dashboard-view").style.display = "none";
    document.getElementById("login-view").style.display = "flex";

    document.getElementById("login-uid").value = "";
    document.getElementById("login-password").value = "";
};
/* FINAL PROCEED TO PAY FIX */
window.SmartCanteen.proceedToCheckout = function () {
    const paymentModal = document.getElementById("payment-modal");

    if (!paymentModal) {
        alert("Payment section not found.");
        return;
    }

    // Read visible total from the cart
    const totalText = [...document.querySelectorAll("body *")]
        .map(el => el.textContent.trim())
        .find(text => /^Total Amount:\s*₹/.test(text));

    const amountElement = document.getElementById("pay-modal-amount");

    if (amountElement) {
        const totalMatch = totalText?.match(/₹\s*[\d,]+/);
        amountElement.textContent = totalMatch
            ? totalMatch[0]
            : "₹0";
    }

    const summaryItems = document.getElementById("pay-summary-items");
    if (summaryItems) {
        summaryItems.textContent = "Selected food items";
    }

    paymentModal.classList.add("open");
};
/* PAYMENT METHODS FIX */
window.SmartCanteen.setPaymentMethod = function (method) {
    const methods = ["upi", "phonepe", "qr", "card"];

    methods.forEach(function (item) {
        const panel = document.getElementById("pay-panel-" + item);
        const tab = document.getElementById("pay-tab-" + item);

        if (panel) panel.classList.toggle("active", item === method);
        if (tab) tab.classList.toggle("active", item === method);
    });

    window.SmartCanteen.selectedPaymentMethod = method;

    const error = document.getElementById("payment-error-alert");
    if (error) error.style.display = "none";
};

window.SmartCanteen.appendUpiHandle = function (handle) {
    const input = document.getElementById("pay-upi-id");

    if (input) {
        input.value = input.value.split("@")[0] + handle;
        input.focus();
    }
};

window.SmartCanteen.submitPayment = function () {
    const method =
        window.SmartCanteen.selectedPaymentMethod || "upi";

    const errorAlert = document.getElementById("payment-error-alert");
    const errorMessage = document.getElementById("payment-error-msg");

    function showError(message) {
        if (errorMessage) errorMessage.textContent = message;
        if (errorAlert) errorAlert.style.display = "flex";
    }

    if (method === "upi") {
        const upi = document.getElementById("pay-upi-id")?.value.trim();

        if (!upi || !upi.includes("@")) {
            showError("Please enter a valid UPI ID, e.g. name@upi.");
            return;
        }
    }

    if (method === "phonepe") {
        const mobile =
            document.getElementById("pay-phonepe-mobile")?.value.trim();

        if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
            showError("Please enter a valid 10-digit PhonePe mobile number.");
            return;
        }
    }

    if (method === "card") {
        const cardPanel = document.getElementById("pay-panel-card");
        const fields = cardPanel
            ? [...cardPanel.querySelectorAll("input")]
            : [];

        if (fields.some(field => !field.value.trim())) {
            showError("Please fill in all debit card details.");
            return;
        }
    }

    if (errorAlert) errorAlert.style.display = "none";

    const button = document.getElementById("btn-pay-submit");
    const label = document.getElementById("pay-btn-label");

    if (button) button.disabled = true;
    if (label) label.textContent = "Processing Payment...";

    setTimeout(function () {
        alert("Demo payment successful! Your canteen token is being generated.");

        if (window.SmartCanteen.confirmUpiPayment) {
            window.SmartCanteen.confirmUpiPayment();
        }

        if (button) button.disabled = false;
        if (label) label.textContent = "Payment Completed";
    }, 900);
};
