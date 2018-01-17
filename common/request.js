const fetch = require("node-fetch");

class Request {
    constructor(host, option) {
        this.host = host || Request.host;
        this.option = option || Request.option;
        this.cookies = {};
    }
    getCookie() {
        let cookie = [];
        for (let k in this.cookies) {
            let v = this.cookies[k];
            cookie.push(`${k}=${v}`);
        }
        return cookie.length > 0 ? cookie.join("; ") : undefined;
    }
    request(uri, data, method, headers) {
        var option = Object.assign({}, this.option);
        option.method = method || (data ? "POST" : "GET");
        if (data) {
            option.body = data;
        }
        if (headers) {
            option.headers = Object.assign({ cookie: this.getCookie() }, headers);
        }
        return new Promise((resolve, reject) => {
            fetch(this.host + uri, option).then((res) => {
                let cookies = res.headers.getAll("set-cookie");
                for (let cookie of cookies) {
                    let ss = cookie.split(";")[0].split("=");
                    this.cookies[ss[0]] = ss[1];
                }
                if (res.ok) return res.json();
            }, err => reject(err)).then((data) => {
                resolve(data);
            }, err => reject(err));
        });
    }
    postForm(uri, data, headers) {
        if (typeof data === "object") {
            let li = [];
            for (let k in data) {
                let v = data[k];
                li.push(`${k}=${v}`);
            }
            data = li.join("&");
        }
        return this.request(uri, data, "POST", Object.assign({
            "content-type": "application/x-www-form-urlencoded"
        }, headers));
    }
    postJson(uri, data, headers) {
        if (typeof data === "object") data = JSON.stringify(data);
        return this.request(uri, data, "POST", Object.assign({
            "content-type": "application/json"
        }, headers));
    }
    get(uri, data, headers) {
        if (typeof data === "object") {
            let li = [];
            for (let k in data) {
                let v = data[k];
                li.push(`${k}=${v}`);
            }
            data = li.join("&");
        }
        if (data) {
            uri += (uri.indexOf("?") < 0 ? "?" : "&") + data;
        }
        return this.request(uri, false, "GET", headers);
    }
}

Request.host = "http://112.74.23.97:8000";
Request.option = {
    // credentials: "include",
    headers: {}
};

module.exports = Request;