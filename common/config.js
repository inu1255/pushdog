/**
 * Created Date: 2017-09-27 14:35:00
 * Author: inu1255
 * E-Mail: 929909260@qq.com
 */
const appname = "pushdog";

module.exports = {
    appname,
    title: "云签签",
    apiDir: "api",
    port: getPort(3000),
    mysql: {
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '199337',
        database: appname,		 
        connectionLimit: 50,		 
        supportBigNumbers: true,		 
        bigNumberStrings: false
    },
    dev: process.argv.indexOf("--dev") >= 0,
    error: {
        "400": "非法的参数值、格式或类型",
        "401": "您尚未登录",
        "402": "不能重复添加",
        "403": "没有权限"
    }
};

function getPort(port) {
    let index = process.argv.indexOf("--port");
    if (index >= 0) {
        port = process.argv[index + 1] || port;
    }
    return port;
}