/*
 * @Author: 消息逻辑
 */

'use strict'

YX.fn.message = function () {
    this.$sendBtn = $('#SendMsg');
    this.$messageText = $('#MessageInput');
    this.$sendBtn.on('click', this.sendTextMessage.bind(this));
    this.$messageText.on('keydown', this.inputMessage.bind(this));
}
/**
 * 处理收到的消息
 * @param  {Object} msg
 * @return
 */
YX.fn.doMsg = function (msg) {
    var that = this,
        who = msg.to === userUID ? msg.from : msg.to;
    console.log(msg);

}
YX.fn.sendTextMessage = function () {
    var scene = this.crtSessionType,
        to = this.crtSessionAccount,
        text = this.$messageText.val().trim()
    if (!!to && !!text) {
        if (text.length > 500) {
            alert('消息长度最大为500字符')
        } else if (text.length === 0) {
            return
        } else {
            this.mysdk.sendTextMessage(scene, to, text, false, this.sendMsgDone.bind(this))
        }
    }
}
/**
 * 发送消息完毕后的回调
 * @param error：消息发送失败的原因
 * @param msg：消息主体，类型分为文本、文件、图片、地理位置、语音、视频、自定义消息，通知等
 */
YX.fn.sendMsgDone = function (error, msg) {
    if (error && error.code === 7101) {
        alert('被拉黑')
        msg.blacked = true
    }
    this.cache.addMsgs(msg)
    this.$messageText.val('')
    this.$chatContent.find('.no-msg').remove()
    var msgHtml = appUI.updateChatContentUI(msg, this.cache)
    this.$chatContent.append(msgHtml).scrollTop(99999)
    $('#uploadForm').get(0).reset()
}

YX.fn.inputMessage = function (e) {
    var ev = e || window.event
    if ($.trim(this.$messageText.val()).length > 0) {
        if (ev.keyCode === 13 && ev.ctrlKey) {
            this.$messageText.val(this.$messageText.val() + '\r\n')
        } else if (ev.keyCode === 13 && !ev.ctrlKey) {
            this.sendTextMessage()
        }
    }
}
// 重发
YX.fn.doResend = function (evt) {
    var $node
    if (evt.target.tagName.toLowerCase() === 'span') {
        $node = $(evt.target)
    } else {
        $node = $(evt.target.parentNode)
    }
    var sessionId = $node.data("session")
    var idClient = $node.data("id")
    var msg = this.cache.findMsg(sessionId, idClient)
    this.mysdk.resendMsg(msg, function (err, data) {
        if (err) {
            alert(err.message || '发送失败')
        } else {
            this.cache.setMsg(sessionId, idClient, data)
            var msgHtml = appUI.buildChatContentUI(sessionId, this.cache)
            this.$chatContent.html(msgHtml).scrollTop(99999)
            $('#uploadForm').get(0).reset()
        }
    }.bind(this))
}