let map = {};

let storage = function(key) {
    return map[key] = map[key] || {};
};

class Storage {
    constructor(key) {
        this.storage = storage(key);
    }
}

storage.Storage = Storage;

module.exports = storage;