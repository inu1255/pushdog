const mock = require("mockjs");
const Request = require("../common/request.js");
const co = require("co");

function compare(name, password) {
    let request = new Request("http://127.0.0.1:3000");
    return co(function*() {
        let data = yield request.postForm("/user/login", {
            READONLY: 1,
        });
        console.log(data);
    });
}

co(function*() {
    compare("@@040", "123456");
});