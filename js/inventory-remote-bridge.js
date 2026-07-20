/**
 * When Supabase is configured, inventory getAll/getItem/setItem/mergeInventoryIntoPlants
 * use the remote DB so inventory is shared for all visitors.
 */
(function (global) {
    'use strict';
    var inv = global.inventoryDb;
    var sup = global.supabaseDb;
    if (!inv || !sup || !sup.isConfigured()) return;

    inv.getAll = function () { return sup.getInventory(); };
    inv.getItem = function (plantId) { return sup.getInventoryItem(plantId); };
    inv.setItem = function (plantId, data) { return sup.setInventoryRow(plantId, data); };
    inv.deleteItem = function (plantId) { return sup.deleteInventoryRow(plantId); };

    // Stock writes require staff JWT (RLS). Guest checkout uses
    // /.netlify/functions/complete-order (service role) instead.
    inv.decrementStock = function (plantId, quantity) {
        return sup.getInventoryItem(plantId).then(function (row) {
            if (!row || row.quantityInStock == null) return;
            var next = Math.max(0, Number(row.quantityInStock) - Number(quantity));
            return sup.setInventoryRow(plantId, { quantityInStock: next });
        });
    };

    inv.mergeInventoryIntoPlants = function (plants) {
        if (!plants || !plants.length) return Promise.resolve();
        return sup.getInventory().then(function (rows) {
            var byId = {};
            rows.forEach(function (r) { byId[r.plantId] = r; });
            plants.forEach(function (p) {
                var invRow = byId[p.id];
                if (invRow) {
                    if (invRow.price != null) p.price = invRow.price;
                    // costPrice only present for staff sessions (full inventory read)
                    if (invRow.costPrice != null) p.costPrice = invRow.costPrice;
                    else delete p.costPrice;
                    p.stockQuantity = invRow.quantityInStock != null ? invRow.quantityInStock : 0;
                    if (invRow.reorderLevel != null) p.reorderLevel = invRow.reorderLevel;
                    if (invRow.size !== undefined && invRow.size !== null) p.size = invRow.size;
                    if (invRow.unit !== undefined && invRow.unit !== null) p.unit = invRow.unit;
                    if ('description' in invRow) p.description = invRow.description;
                    if (typeof invRow.hidden === 'boolean') p.hidden = invRow.hidden;
                    if (invRow.category != null && invRow.category !== '') p.category = invRow.category;
                    if (Array.isArray(invRow.images) && invRow.images.length) p.images = invRow.images;
                    if (invRow.imageUrl != null && invRow.imageUrl !== '') p.imageUrl = invRow.imageUrl;
                } else {
                    p.stockQuantity = 0;
                }
            });
        });
    };
})(typeof window !== 'undefined' ? window : this);
