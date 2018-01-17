'use strict';

var GeTui = require('./GT.push');
var Target = require('./getui/Target');

var APNTemplate = require('./getui/template/APNTemplate');
var BaseTemplate = require('./getui/template/BaseTemplate');
var APNPayload = require('./payload/APNPayload');
var DictionaryAlertMsg = require('./payload/DictionaryAlertMsg');
var SimpleAlertMsg = require('./payload/SimpleAlertMsg');
var NotyPopLoadTemplate = require('./getui/template/NotyPopLoadTemplate');
var LinkTemplate = require('./getui/template/LinkTemplate');
var NotificationTemplate = require('./getui/template/NotificationTemplate');
var PopupTransmissionTemplate = require('./getui/template/PopupTransmissionTemplate');
var TransmissionTemplate = require('./getui/template/TransmissionTemplate');

var SingleMessage = require('./getui/message/SingleMessage');
var AppMessage = require('./getui/message/AppMessage');
var ListMessage = require('./getui/message/ListMessage');

// http的域名
var HOST = 'http://sdk.open.api.igexin.com/apiex.htm';

//https的域名
//var HOST = 'https://api.getui.com/apiex.htm';

var APPID = 'SOf6UKrleM9XHZpUddlGS4';
var APPKEY = '1XDmCuuRa07A2tsv5RtkC1';
var MASTERSECRET = '2YGRFm6kfY5PQObiaT8g46';

class PushData {
    constructor() {
        this.title = "";
        this.content = "";
        this.logo = "";
        this.payload = {};
    }
}

class Getui {
    constructor() {
        this.getui = new GeTui(HOST, APPKEY, MASTERSECRET);
    }
    /**
     * @param {PushData} data 
     */
    message(data) {
        let { title, content, logo, payload } = data;
        data = new NotificationTemplate({
            appId: APPID,
            appKey: APPKEY,
            title: title,
            text: content,
            logo: logo,
            isRing: true,
            isVibrate: true,
            isClearable: true,
            transmissionType: 1,
            transmissionContent: typeof payload === "string" ? payload : JSON.stringify(payload)
        });
        return data;
    }
    /**
     * 
     * @param {String} clientId 
     * @param {PushData} data 
     * @return {Promise}
     */
    sendSingle(clientId, data) {
        //个推信息体
        var message = new SingleMessage({
            isOffline: true, //是否离线
            offlineExpireTime: 3600 * 12 * 1000, //离线时间
            data: this.message(data), //设置推送消息类型
            pushNetWorkType: 0 //是否wifi ，0不限，1wifi
        });

        //接收方
        var target = new Target({
            appId: APPID,
            clientId: clientId
            //        alias:'_lalala_'
        });
        return new Promise((resolve, reject) => {
            this.getui.pushMessageToSingle(message, target, function(err, res) {
                if (err) reject(err);
                else resolve(res);
            });
        });
    }
    /**
     * 
     * @param {Array} list 
     * @param {PushData} data 
     * @return {Promise}
     */
    sendList(list, data) {
        var taskGroupName = data.title || "群发";
        //个推信息体
        var message = new ListMessage({
            isOffline: true,
            offlineExpireTime: 3600 * 12 * 1000,
            data: this.message(data)
        });

        return new Promise((resolve, reject) => {
            this.getui.getContentId(message, taskGroupName, (err, res) => {
                if (err) reject(err);
                else {
                    var contentId = res;
                    var targetList = list.map(x => new Target({
                        appId: APPID,
                        clientId: x
                    }));
                    this.getui.pushMessageToList(contentId, targetList, function(err, res) {
                        if (err) reject(err);
                        else resolve(res);
                    });
                }
            });
        });
    }
}

module.exports = new Getui();