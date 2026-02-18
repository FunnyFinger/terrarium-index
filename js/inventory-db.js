/**
 * Inventory database (IndexedDB via Dexie) for POS: stock, prices, sales.
 * Single source of truth for inventory; storefront merges this over plant data.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'TerrariumInventory';
    var DB_VERSION = 3;
    var db = null;

    function getDb() {
        if (db) return db;
        if (typeof global.Dexie === 'undefined') {
            console.warn('Inventory DB: Dexie not loaded. Include Dexie before inventory-db.js');
            return null;
        }
        db = new global.Dexie(DB_NAME);
        db.version(1).stores({
            inventory: 'plantId, price, quantityInStock, updatedAt',
            sales: '++id, plantId, createdAt'
        });
        db.version(2).stores({
            inventory: 'plantId, price, costPrice, quantityInStock, updatedAt',
            sales: '++id, plantId, createdAt'
        });
        db.version(3).stores({
            inventory: 'plantId, price, costPrice, quantityInStock, updatedAt',
            sales: '++id, plantId, createdAt',
            orders: '++id, createdAt, status'
        });
        return db;
    }

    /**
     * Get one inventory row by plantId.
     * @returns {Promise<{ plantId: number, name?: string, scientificName?: string, price?: number, quantityInStock?: number, reorderLevel?: number, updatedAt?: number }|undefined>}
     */
    function getItem(plantId) {
        var database = getDb();
        if (!database) return Promise.resolve(undefined);
        return database.inventory.get(Number(plantId));
    }

    /**
     * Get all inventory rows.
     * @returns {Promise<Array>}
     */
    function getAll() {
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.inventory.toArray();
    }

    /**
     * Set or update inventory for a plant.
     * @param {number} plantId
     * @param {{ name?: string, scientificName?: string, price?: number, costPrice?: number, quantityInStock?: number, reorderLevel?: number }} data
     */
    function setItem(plantId, data) {
        var database = getDb();
        if (!database) return Promise.resolve();
        var id = Number(plantId);
        var now = Date.now();
        var row = {
            plantId: id,
            name: data.name,
            scientificName: data.scientificName,
            price: data.price,
            costPrice: data.costPrice,
            quantityInStock: data.quantityInStock,
            reorderLevel: data.reorderLevel,
            updatedAt: now
        };
        if (data.size !== undefined) row.size = data.size;
        row.description = data.description;
        return database.inventory.put(row);
    }

    /**
     * Record a sale (for history and optional stock decrement).
     * @param {number} plantId
     * @param {number} quantity
     * @param {number} amount - total line amount
     * @param {string} [scientificName] - plant scientific name for display
     */
    function recordSale(plantId, quantity, amount, scientificName) {
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.sales.add({
            plantId: Number(plantId),
            quantity: quantity,
            amount: amount,
            scientificName: scientificName || null,
            createdAt: Date.now()
        });
    }

    /**
     * Decrement stock by quantity. Call after recording sale if you track stock.
     */
    function decrementStock(plantId, quantity) {
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.inventory.get(Number(plantId)).then(function (row) {
            if (!row || row.quantityInStock == null) return;
            var next = Math.max(0, (row.quantityInStock || 0) - quantity);
            return database.inventory.update(Number(plantId), {
                quantityInStock: next,
                updatedAt: Date.now()
            });
        });
    }

    /**
     * Get recent sales (e.g. last 100).
     */
    function getRecentSales(limit) {
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.sales.orderBy('createdAt').reverse().limit(limit || 50).toArray();
    }

    /**
     * Save a full order (customer + items + total). Returns the new order id.
     * @param {{ customer: { name?, email?, phone?, address? }, items: Array<{ plantId, name, scientificName?, quantity, price, lineTotal }>, totalAmount: number }} order
     * @returns {Promise<number>} new order id
     */
    function saveOrder(order) {
        var database = getDb();
        if (!database) return Promise.resolve(0);
        var now = Date.now();
        return database.orders.add({
            customer: order.customer || {},
            items: order.items || [],
            totalAmount: order.totalAmount != null ? order.totalAmount : 0,
            status: order.status || 'confirmed',
            paymentMethod: order.paymentMethod || null,
            createdAt: now
        }).then(function (id) { return id; });
    }

    /**
     * Get recent orders (newest first).
     */
    function getOrders(limit) {
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.orders.orderBy('createdAt').reverse().limit(limit || 50).toArray();
    }

    /**
     * Get orders for a customer email (e.g. for "My orders" on profile). Matches customer.email (case-insensitive).
     */
    function getOrdersByCustomerEmail(email, limit) {
        if (!email || !String(email).trim()) return Promise.resolve([]);
        var database = getDb();
        if (!database) return Promise.resolve([]);
        var emailLo = String(email).toLowerCase().trim();
        return database.orders.orderBy('createdAt').reverse().limit(limit || 200).toArray().then(function (orders) {
            return orders.filter(function (o) {
                var c = o.customer || {};
                var em = (c.email || '').toLowerCase().trim();
                return em === emailLo;
            });
        });
    }

    /**
     * Clear all sales history. Does not affect inventory stock.
     */
    function clearSales() {
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.sales.clear();
    }

    /**
     * Clear all orders history.
     */
    function clearOrders() {
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.orders.clear();
    }

    /**
     * Get a single order by id.
     */
    function getOrder(id) {
        var database = getDb();
        if (!database) return Promise.resolve(undefined);
        return database.orders.get(Number(id));
    }

    /**
     * Update order status (e.g. 'confirmed' -> 'paid' after Stripe success).
     */
    function updateOrderStatus(orderId, status) {
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.orders.update(Number(orderId), { status: status });
    }

    /**
     * Merge inventory into an array of plants (mutates each plant with price/quantityInStock/reorderLevel when present).
     * @param {Array<{ id: number, name?: string, scientificName?: string }>} plants
     * @returns {Promise<void>}
     */
    function mergeInventoryIntoPlants(plants) {
        if (!plants || !plants.length) return Promise.resolve();
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.inventory.toArray().then(function (rows) {
            var byId = {};
            rows.forEach(function (r) {
                byId[r.plantId] = r;
            });
            plants.forEach(function (p) {
                var inv = byId[p.id];
                if (inv) {
                    if (inv.price != null) p.price = inv.price;
                    if (inv.costPrice != null) p.costPrice = inv.costPrice;
                    p.stockQuantity = inv.quantityInStock != null ? inv.quantityInStock : 0;
                    if (inv.reorderLevel != null) p.reorderLevel = inv.reorderLevel;
                    if (inv.size !== undefined && inv.size !== null) p.size = inv.size;
                    if ('description' in inv) p.description = inv.description;
                } else {
                    p.stockQuantity = 0;
                }
            });
        });
    }

    global.inventoryDb = {
        getDb: getDb,
        getItem: getItem,
        getAll: getAll,
        setItem: setItem,
        recordSale: recordSale,
        decrementStock: decrementStock,
        getRecentSales: getRecentSales,
        clearSales: clearSales,
        saveOrder: saveOrder,
        getOrders: getOrders,
        getOrdersByCustomerEmail: getOrdersByCustomerEmail,
        getOrder: getOrder,
        updateOrderStatus: updateOrderStatus,
        clearOrders: clearOrders,
        mergeInventoryIntoPlants: mergeInventoryIntoPlants
    };
})(typeof window !== 'undefined' ? window : this);
