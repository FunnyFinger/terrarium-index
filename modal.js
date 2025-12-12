(function () {
'use strict';

let dependencies = {};

function init(deps = {}) {
    dependencies = deps;
}

function showPlantModal(plant) {
    return dependencies.showPlantModal(plant);
}

window.modalUtils = { init, showPlantModal };
})();



