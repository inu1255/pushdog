"use strict";
const mysql = require("mysql");
const config = require("./config");
const promisify = require("./promisify");
const co = require("co");

const pool = mysql.createPool(config.mysql);
var log = require("./log").getLogger("db");

/**
 * 把v转换为mysql可以接收的参数，把对象转换成json字符串
 * @param {any} v 值
 */
function val(v) {
    return (v && typeof v === "object") ? JSON.stringify(v) : v;
}

/**
 * 如果args为undefined则返回 def||[] 
 * 如果args是一个Array则返回自己
 * 如果不是则返回[args]
 * @param {any} args 
 * @param {Array|undefined} def 
 */
function arr(args, def) {
    if (args instanceof Array)
        return args;
    return args === undefined ? def || [] : [args];
}

class Raw {
    constructor(sql) {
        this.sql = sql;
    }
    toString() {
        return this.sql;
    }
}

/**
 * 用于构建sql的where语句
 */
class WhereBuilder {
    constructor(sql, args) {
        this.where_keys = sql ? [sql] : [];
        this.where_values = arr(args);
    }
    isEmpty() {
        return this.where_keys.length < 1;
    }
    toString() {
        return this.where_keys.join(" ").trim();
    }
    /**
     * 获取args: where的参数
     * query("select * from user where name=?", args)
     */
    params() {
        return this.where_values;
    }
    /**
     * 加括号，将foo=? and bar=?变成(foo=? and bar=?)
     * 之后调用and/or时，会变成(foo=? and bar=?) and/or baz=?
     */
    build() {
        if (this.where_keys.length > 1) {
            this.where_keys = ["(" + this.where_keys.join(" ").trim() + ")"];
        }
        return this;
    }
    /**
     * 使用op拼接两个where语句，wb会加括号
     * foo=? or bar=? 使用and拼接 baz=? or qux=? 变成 foo=? or bar=? and (baz=? or qux=?)
     * 可以先调用build再拼接 变成 (foo=? or bar=?) and (baz=? or qux=?)
     * @param {String} op and/or
     * @param {WhereBuilder} wb 另一个where语句
     */
    concat(op, wb) {
        if (!wb.isEmpty()) {
            if (this.where_keys.length) this.where_keys.push(op);
            this.where_keys.push(wb.build().toString());
            this.where_values = this.where_values.concat(wb.where_values);
        }
        return this;
    }
    /**
     * 参见 exports.where 和 this.concat
     * @param {WhereBuilder|String|Array|Object} key 
     * @param {String} op 
     * @param {any} value 
     */
    and(key, op, value) {
        let wb = key instanceof WhereBuilder ? key : exports.where(key, op, value);
        return this.concat("and", wb);
    }
    /**
     * 参见 exports.where 和 this.concat
     * @param {WhereBuilder|String|Array|Object} key 
     * @param {String} op 
     * @param {any} value 
     */
    or(key, op, value) {
        let wb = key instanceof WhereBuilder ? key : exports.where(key, op, value);
        return this.concat("or", wb);
    }
}

/**
 * 生成一个WhereBuilder
 * where("name","admin")
 * where("name","like","adm%")
 * where({"name":"admin"})
 * where([
 *     ["name","admin"],
 *     ["name","like","adm%"]
 * ])
 * @param {String|Array|Object} key 
 * @param {String} op 
 * @param {any} value 
 */
exports.where = function(key, op, value) {
    if (op != undefined && value != undefined) {
        if (op == "in")
            return new WhereBuilder(`${key} in (?)`, [value]);
        return new WhereBuilder(`${key} ${op} ?`, [val(value)]);
    } else if (op != undefined) {
        return new WhereBuilder(`${key}=?`, [val(op)]);
    }
    if (key instanceof Array) {
        // console.log("Array", key);
        let wb = new WhereBuilder();
        for (let item of key) {
            wb.and(exports.where.apply(null, arr(item)));
        }
        return wb;
    } else if (typeof key === "object") {
        // console.log("object", key);
        let wb = new WhereBuilder();
        for (let k in key) {
            let v = key[k];
            wb.and(k, v);
        }
        return wb;
    } else if (typeof key === "string") {
        // console.log("string", key);
        return new WhereBuilder(key);
    } else {
        // console.log("other", typeof key, key);
        return new WhereBuilder(key ? "1" : "0");
    }
};

class Sql {
    constructor(sql, args) {
        this.sql = sql || "";
        this.args = arr(args);
        this.whereBuilder = new WhereBuilder();
        this._pms;
        this._order = "";
        this._limit = "";
    }
    toString() {
        if (this.sql.startsWith("insert"))
            return this.sql;
        let where = this.whereBuilder.toString();
        let sql = this.sql + (where ? " where " + where : "");
        if (this.sql.startsWith("select"))
            sql = `${sql}${this._order}${this._limit}`;
        return sql;
    }
    params() {
        if (this.sql.startsWith("insert"))
            return this.args;
        return this.args.concat(this.whereBuilder.params());
    }
    pms() {
        if (!this._pms) {
            this._pms = new Promise((resolve, reject) => {
                if (this.whereBuilder.isEmpty() && (this.sql.startsWith("delete") || this.sql.startsWith("update"))) {
                    reject("禁止update/delete不带where语句: " + this.toString());
                } else {
                    exports.SingleSQL(this).then((rows) => {
                        if (this._limit == " limit 1") {
                            rows instanceof Array ? resolve(rows[0]) : resolve(rows);
                        } else {
                            resolve(rows);
                        }
                    }, reject);
                }
            });
        }
        return this._pms;
    }
    then(onfulfilled, onrejected) {
        return this.pms().then(onfulfilled, onrejected);
    }
    catch (onrejected) {
        return this.pms().catch(onrejected);
    }
    first() {
        this.limit();
        return this;
    }
    select(table, keys) {
        keys = arr(keys, ["*"]);
        this.sql = `select ${keys.join(",")} from ${table}`;
        this.args = [];
        this._order = "";
        this._limit = "";
        return this;
    }
    orderBy(key) {
        this._order = key ? ` order by ${key}` : "";
        return this;
    }
    limit(offset, size) {
        if (size)
            this._limit = ` limit ${offset},${size}`;
        else if (offset)
            this._limit = ` limit ${offset}`;
        else
            this._limit = " limit 1";
        return this;
    }
    insert(table, data) {
        this.sql = "";
        this.args = [];
        let keys = [];
        for (let item of arr(data)) {
            if (keys.length > 0) {
                let values = [];
                for (let k of keys) {
                    let v = item[k];
                    if (v instanceof Raw) {
                        values.push(v);
                    } else {
                        values.push("?");
                        this.args.push(val(v));
                    }
                }
                this.sql += `,(${values.join(",")})`;
            } else {
                let values = [];
                for (let k in item) {
                    let v = item[k];
                    keys.push(k);
                    if (v instanceof Raw) {
                        values.push(v);
                    } else {
                        values.push("?");
                        this.args.push(val(v));
                    }
                }
                this.sql = `insert into ${table} (${keys.join(",")}) values(${values.join(",")})`;
            }
        }
        return this;
    }
    update(table, data) {
        let keys = [];
        let args = [];
        for (let k in data) {
            let v = data[k];
            if (v instanceof Raw) {
                keys.push(k + "=" + v);
            } else {
                keys.push(k + "=?");
                args.push(val(v));
            }
        }
        if (keys.length > 0) {
            this.sql = `update ${table} set ${keys.join(",")}`;
            this.args = args;
        } else {
            this.sql = "";
            this.args = [];
        }
        return this;
    }
    delete(table) {
        this.sql = `delete from ${table}`;
        this.args = [];
        return this;
    }
    where(key, op, value) {
        this.whereBuilder.and(key, op, value);
        return this;
    }
    orWhere(key, op, value) {
        this.whereBuilder.or(key, op, value);
        return this;
    }
}

class InsertOrUpdate {
    constructor(table, data) {
        this.table = table;
        this.data = data;
        this.select = new Sql();
        this._pms;
    }
    toString() {
        return this.select.toString();
    }
    where(key, op, value) {
        this.select.where(key, op, value);
        return this;
    }
    orWhere(key, op, value) {
        this.select.orWhere(key, op, value);
        return this;
    }
    pms() {
        if (!this._pms) {
            this._pms = new Promise((resolve, reject) => {
                if (this.select.whereBuilder.isEmpty())
                    reject("insertOrUpdate need where");
                else
                    this.select.select(this.table).first().then((row) => {
                        new Sql()[row ? "update" : "insert"](this.table, this.data).where(this.select.whereBuilder).then(resolve, reject);
                    }, reject);
            });
        }
        return this._pms;
    }
    then(onfulfilled, onrejected) {
        return this.pms().then(onfulfilled, onrejected);
    }
    catch (onrejected) {
        return this.pms().catch(onrejected);
    }
}

exports.getConn = function() {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, conn) {
            if (err) {
                log.error('can\'t connect to DB: ' + err.toString());
                reject(err);
            } else {
                resolve(conn);
            }
        });
    });
};

exports.getPool = function() {
    return pool;
};

Promise.prototype.first = function() {
    return new Promise((resolve, reject) => {
        this.then(function(rows) {
            rows instanceof Array ? resolve(rows[0]) : resolve(rows);
        }, reject);
    });
};

exports.getConn().then(function(conn) {
    let coMysql = conn.constructor.prototype;
    extendsConn(coMysql);
    conn.release();
    log.info("数据库引擎启动成功");
}, function(err) {
    log.error("数据库引擎启动失败:", err);
});

function extendsConn(coMysql) {
    coMysql.beginTransactionAsync = promisify(coMysql.beginTransaction, { errorIndex: 0, resultIndex: 1 });
    coMysql.commitAsync = promisify(coMysql.commit, { errorIndex: 0, resultIndex: 1 });
    coMysql.rollbackAsync = promisify(coMysql.rollback, { errorIndex: 0, resultIndex: 1 });
    coMysql.queryAsync = promisify(coMysql.query, { errorIndex: 0, resultIndex: 1 });
    coMysql.SingleSQL = function(sql, args) {
        if (!sql) return null;
        if (sql instanceof Sql) {
            args = sql.params();
            sql = sql.toString();
        } else if (typeof sql != "string") {
            args = sql.args || args;
            sql = sql.sql;
        }
        log.debug(sql, args || "");
        return this.queryAsync(sql, args);
    };
    coMysql.execSQL = function(sqls) {
        let argu = arguments;
        let db = this;
        let autoTrans = false;
        if (sqls instanceof Array) {
            autoTrans = true;
        }
        return co(function*() {
            //:smart parse arguments
            var args = [];
            for (let x of argu) {
                if (x === sqls || null == x)
                    continue;
                switch (x.constructor) {
                    case Array:
                        args = x;
                        break;
                    case Boolean:
                    case Number:
                        autoTrans = x;
                }
            }
            if (autoTrans)
                yield db.beginTransactionAsync();
            var rows;
            try {
                for (let sql of arr(sqls))
                    rows = yield db.SingleSQL(sql, args);
            } catch (e) {
                if (autoTrans)
                    yield db.rollbackAsync();
                throw e;
            }
            if (autoTrans)
                yield db.commitAsync();
            return rows;
        });
    };
}

exports.SingleSQL = function(sql, args) {
    return new Promise(function(resolve, reject) {
        exports.getConn().then(function(conn) {
            conn.SingleSQL(sql, args).then(function(rows) {
                conn.release();
                resolve(rows);
            }, function(err) {
                conn.release();
                reject(err);
            });
        }, reject);
    });
};

exports.execSQL = function(sqls) {
    let argu = arguments;
    return new Promise(function(resolve, reject) {
        exports.getConn().then(function(conn) {
            conn.execSQL.apply(conn, argu).then(function(rows) {
                conn.release();
                resolve(rows);
            }, function(err) {
                conn.release();
                reject(err);
            });
        }, reject);
    });
};

exports.Raw = function(s) {
    return new Raw(s);
};

exports.select = function(table, keys) {
    return new Sql().select(table, keys);
};

exports.insert = function(table, data) {
    return new Sql().insert(table, data);
};

exports.update = function(table, data) {
    return new Sql().update(table, data);
};

exports.delete = function(table) {
    return new Sql().delete(table);
};

exports.insertOrUpdate = function(table, data) {
    return new InsertOrUpdate(table, data);
};

exports.setLogger = function(logger) {
    log = logger;
};