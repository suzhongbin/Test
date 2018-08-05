/*
 * 点对点音视频通话控制逻辑
 * 注：由于融合了WebRTC和Netcall两种音视频sdk，需要进行如下处理
 * 1. 分别初始化两种实例 webrtc(WebRTC) / webnet(Netcall), 注册各种事件
 * 2. 逻辑里真正调用的sdk API需要通过一个 bridge(目前名字叫netcall) 进行桥接选择当前使用的sdk，默认使用 Netcall 方式
 */
function NetcallBridge(yx) {
    this.yx = yx;
    this.$msgInput = $("#messageText");
    this.$videoRemoteBox = $("#AnyChatRemoteVideoDiv");
    this.$videoLocalBox = $("#AnyChatLocalVideoDiv");
    // Netcall 实例
    this.netcall = null;
    // 呼叫超时检查定时器
    this.callTimer = null;
    // 被呼叫超时检查定时器
    this.beCallTimer = null;
    // 音频或视频通话
    this.type = null;
    // 是否处于通话流程中
    this.netcallActive = false;
    // 通话的channelId
    this.channelId = null;
    // 通话流程的另一方账户
    this.netcallAccount = "";
    // 通话时长
    this.netcallDuration = 0;
    // 通话正式开始时间戳
    this.netcallStartTime = 0;
    // 通话时长定时器
    this.netcallDurationTimer = null;
    // 音视频流配置
    this.sessionConfig = {
        videoQuality: Netcall.CHAT_VIDEO_QUALITY_480P,
        videoFrameRate: Netcall.CHAT_VIDEO_FRAME_RATE_NORMAL,
        videoBitrate: 0,
        recordVideo: false,
        recordAudio: false,
        highAudio: false
    };
    // 是否开启摄像头输入
    this.deviceVideoInOn = true;
    // 是否开启音频输入
    this.deviceAudioInOn = true;
    // 是否开启扬声器输出
    this.deviceAudioOutOn = true;
    // 是否全屏状态
    this.isFullScreen = false;

    // 本地agent连接状态
    this.signalInited = false;
    // agent程序下载地址
    this.agentDownloadUrl = "http://yx-web.nos.netease.com/package%2FWebAgent_Setup_V2.4.0.208.zip";
    // 多人音视频的缓存对象
    this.meetingCall = {};
    // 当前视频状态，是桌面共享还是视频: video / window / screen
    this.videoType = 'video'

    this.isRtcSupported = false;
    // this.signalInited = false;

    // 通话方式选择，是WebRTC还是Netcall，每次发起通话都要进行选择, 值有: WebRTC / Netcall
    this.callMethod = "";
    // 通话方式选择，是WebRTC还是Netcall，第一次进行选择后记住选择
    this.callMethodRemember = "";

    // 真正业务调用的 API 桥, 在进行通话方式选择之后赋值对应的实例
    this.netcall = null;

    // 开始初始化
    this.init();
}

var fn = NetcallBridge.fn = NetcallBridge.prototype;

fn.init = function () {
    this.initEvent();
    this.initNetcall();
};

fn.initEvent = function () {
    var that = this;
    // 离开页面调用destroy
    window.addEventListener('beforeunload', this.beforeunload.bind(this));
};

/** 页面卸载事件 */
fn.beforeunload = function (e) {
    if (!this.netcall || !this.netcall.calling) return;

    if (this.meetingCall.channelName) {
        this.leaveChannel();
    } else {
        this.hangup();
    }

    // var confirmationMessage = "\o/";

    // e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
    // return confirmationMessage;

    /** 以下的方式在webkit浏览器不起作用
     // 开启阻止关闭模式
     event.preventDefault();
     // 弹窗提示用户
     minAlert.alert({
        type: 'error',
        msg: '当前正在通话中，确定要关闭窗口吗 ', //消息主体
        cancelBtnMsg: '取消', //取消按钮的按钮内容
        confirmBtnMsg: '关闭',
        cbConfirm: function () {
            if (this.meetingCall.channelName) {
                this.leaveChannel();
            } else {
                this.hangup();
            }
        }
    });
     **/
}

/** 初始化p2p音视频响应事件 */
fn.initNetcall = function () {
    var NIM = window.SDK.NIM;
    var Netcall = window.Netcall;
    NIM.use(Netcall);
    var that = this;
    // 初始化netcall
    window.webnet = this.webnet = Netcall.getInstance({
        debugger:true,
        nim: window.nim,
        mirror: false,
        mirrorRemote: false,
        /*kickLast: true,*/
        container: $("#AnyChatLocalVideoDiv")[0],
        remoteContainer: $("#AnyChatRemoteVideoDiv")[0]
    });

    this.initNetcallEvent();
    // 默认使用agent模式
    this.netcall = this.webnet
    this.callMethod = "webnet";
    var signalInited = false;
// 信令通道初始化完毕之后, 开发者可以启用音视频通话相关的 UI, 比如说展示呼叫别人的按钮
// 信令通道初始化失败的时候, 请展示错误并禁用所有音视频通话相关的 UI
    this.webnet
        .initSignal()
        .then(function() {
            console.log('signalInited');
            signalInited = true;
        })
        .catch(function(err) {
            console.log('initSignalError', err);
            signalInited = false;
        });
// 当信令通道断开时, 会触发 signalClosed 事件
    this.webnet.on('signalClosed', function() {
        console.log('on signalClosed');
        signalInited = false;
        this.webnet.hangup();
    });
// 初始化过程中会通过 devices 事件回传所有的设备列表
    this.webnet.on('devices', function(obj) {
        console.log('on devices', obj);
    });
};
/** 初始化netcall事件 */
fn.initNetcallEvent = function () {
    var webnet = this.webnet;
    var that = this;
    // 对方接受通话 或者 我方接受通话，都会触发
    webnet.on("callAccepted", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onCallAccepted(obj);
    }.bind(this));
    webnet.on("callRejected", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onCallingRejected(obj);
    }.bind(this));

    webnet.on('signalClosed', function () {
        if (this.callMethod !== 'webnet') return
        console.log("signal closed");
        this.signalInited = false;
        window.setTimeout(function () {
            this.beCalling = false;
            this.beCalledInfo = null;
            this.netcall.hangup();
        }, 2000)
    }.bind(this));
    webnet.on("devices", function (obj) {
        if (this.callMethod !== 'webnet') return

        console.log("on devices:", obj);
        //this.checkDeviceStateUI();
    }.bind(this));
    webnet.on("deviceStatus", function (obj) {
        if (this.callMethod !== 'webnet') return
        console.log("on deviceStatus:", obj);
    }.bind(this));
    webnet.on("beCalling", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onBeCalling(obj);
    }.bind(this));
    webnet.on("control", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onControl(obj);
    }.bind(this));
    webnet.on("hangup", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onHangup(obj);
    }.bind(this));
    webnet.on("heartBeatError", function (obj) {
        if (this.callMethod !== 'webnet') return
        console.log("heartBeatError,要重建信令啦");
    }.bind(this));
    webnet.on("callerAckSync", function (obj) {
        if (this.callMethod !== 'webnet') return
        this.onCallerAckSync(obj);
    }.bind(this));

    webnet.on("netStatus", function (obj) {
        if (this.callMethod !== 'webnet') return
        // console.log("on net status:", obj);
    }.bind(this));
    webnet.on("statistics", function (obj) {
        if (this.callMethod !== 'webnet') return
        // console.log("on statistics:", obj);
    }.bind(this));
    webnet.on("audioVolume", function (obj) {
        if (this.callMethod !== 'webnet' || (!this.beCalling && !this.calling && !this.netcallActive)) return
        // console.log("on audioVolume:", obj);
        /** 如果是群聊，转到多人脚本处理 */
        if (this.netcall.calling && this.yx.crtSessionType === 'team' && this.meetingCall.channelName) {
            this.updateVolumeBar(obj)
        }
    }.bind(this));
    webnet.on("streamResize", function () {
        if (this.callMethod !== 'webnet') return
        console.log("stream resize", arguments)
    }.bind(this))
    webnet.on('joinChannel', function (obj) {
        if (this.callMethod !== 'webnet') return
        // type多人没用
        console.log('user join', obj)
        that.onJoinChannel(obj);
    }.bind(this))
    webnet.on('leaveChannel', function (obj) {
        if (this.callMethod !== 'webnet') return
        console.log('sb leaveChannel', obj)
        that.onLeaveChannel(obj);
    }.bind(this))

}

fn.onControl = function (obj) {
    console.log("on control:", obj);

    var netcall = this.netcall;
    // 如果不是当前通话的指令, 直接丢掉
    if (netcall.notCurrentChannelId(obj)) {
        this.log("非当前通话的控制信息");
        return;
    }
    var type = obj.type;
    switch (type) {
        // NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_ON 通知对方自己打开了音频
        case Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_ON:
            this.log("对方打开了麦克风");
            break;
        // NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_OFF 通知对方自己关闭了音频
        case Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_OFF:
            this.log("对方关闭了麦克风");
            break;
        // NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_ON 通知对方自己打开了视频
        case Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_ON:
            this.log("对方打开了摄像头");
            this.$videoRemoteBox.toggleClass("empty", false).find(".message").text("");
            if (this.isRtcSupported) {
                //p2p
                if (this.yx.crtSessionType === 'p2p') {
                    return this.startRemoteStream();
                }
                // team
                this.startRemoteStreamMeeting(obj.account);
            }
            break;
        // NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_OFF 通知对方自己关闭了视频
        case Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_OFF:
            this.log("对方关闭了摄像头");
            this.$videoRemoteBox.toggleClass("empty", true).find(".message").text("对方关闭了摄像头");
            if (this.isRtcSupported) {
                //p2p
                if (this.yx.crtSessionType === 'p2p') {
                    return this.stopRemoteStream();
                }
                // team
                this.stopRemoteStreamMeeting(obj.account);
            }
            break;
        // NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO_REJECT 拒绝从音频切换到视频
        case Netcall.NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO_REJECT:
            this.log("对方拒绝从音频切换到视频通话");
            break;
        // NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO 请求从音频切换到视频
        case Netcall.NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO:
            this.log("对方请求从音频切换到视频通话");
            break;
        // NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO_AGREE 同意从音频切换到视频
        case Netcall.NETCALL_CONTROL_COMMAND_SWITCH_AUDIO_TO_VIDEO_AGREE:
            this.log("对方同意从音频切换到视频通话");
            break;
        // NETCALL_CONTROL_COMMAND_SWITCH_VIDEO_TO_AUDIO 从视频切换到音频
        case Netcall.NETCALL_CONTROL_COMMAND_SWITCH_VIDEO_TO_AUDIO:
            this.log("对方请求从视频切换为音频");
            break;
        // NETCALL_CONTROL_COMMAND_BUSY 占线
        case Netcall.NETCALL_CONTROL_COMMAND_BUSY:
            this.log("对方正在通话中");
            this.log("取消通话");
            this.netcall.hangup();
            this.clearCallTimer();
            this.isBusy = true;
            this.sendLocalMessage("对方正在通话中");
        function doEnd() {
            this.cancelCalling();
        }

            doEnd = doEnd.bind(this);
            if (this.afterPlayRingA) {
                this.afterPlayRingA = function () {
                    this.playRing("C", 3, function () {
                        window.setTimeout(function () {
                            doEnd
                        }, 2000)
                    }.bind(this));
                }.bind(this);
            } else {
                this.clearRingPlay();
                this.playRing("C", 3, function () {
                    window.setTimeout(function () {
                        doEnd
                    }, 2000)
                }.bind(this));
            }
            break;
        // NETCALL_CONTROL_COMMAND_SELF_CAMERA_INVALID 自己的摄像头不可用
        case Netcall.NETCALL_CONTROL_COMMAND_SELF_CAMERA_INVALID:
            this.log("对方摄像头不可用");
            this.$videoRemoteBox.toggleClass("empty", true).find(".message").text("对方摄像头不可用");
            if (this.isRtcSupported) {
                //p2p
                if (this.yx.crtSessionType === 'p2p') {
                    return this.stopRemoteStream();
                }
                // team
                this.stopRemoteStreamMeeting(obj.account);
            }
            break;
        // NETCALL_CONTROL_COMMAND_SELF_ON_BACKGROUND 自己处于后台
        // NETCALL_CONTROL_COMMAND_START_NOTIFY_RECEIVED 告诉发送方自己已经收到请求了（用于通知发送方开始播放提示音）
        // NETCALL_CONTROL_COMMAND_NOTIFY_RECORD_START 通知对方自己开始录制视频了
        // NETCALL_CONTROL_COMMAND_NOTIFY_RECORD_STOP 通知对方自己结束录制视频了
    }
};
fn.stopLocalStream = function () {
    this.log("停止本地流显示 stopLocalStream");
    try {
        this.netcall.stopLocalStream();
    } catch (e) {
        this.log("停止本地流失败");
        console && console.warn && console.warn(e);
    }
};
fn.stopRemoteStream = function () {
    this.log("停止远端流显示 stopRemoteStream");
    try {
        this.netcall.stopRemoteStream();
    } catch (e) {
        this.log("停止远端流失败");
        console && console.warn && console.warn(e);
    }
};
fn.startLocalStream = function (node) {
    this.log("开启本地流显示 startLocalStream");
    try {
        this.netcall.startLocalStream(node);
    } catch (e) {
        this.log("开启本地流失败");
        console && console.warn && console.warn(e);
    }
};
fn.startRemoteStream = function () {
    this.log("开启远端流显示 startRemoteStream");
    try {
        this.netcall.startRemoteStream();
    } catch (e) {
        this.log("开启远端流失败");
        console && console.warn && console.warn(e);
    }
};
/** 同意音视频通话, 兼容多人音视频 */
fn.accept = function (e) {
    // 如果在转圈的状态，忽略
    if (this.$beCallingAcceptButton.hasClass('loading')) return

    var that = this
    if (this.$beCallingAcceptButton.is(".disabled")) return;
    if (!this.beCalling) return;
    function deviceCheck(data) {

        this.callMethod = data && data.type || this.callMethod;
        this.callMethodRemember = data && data.type || this.callMethodRemember;

        this.$beCallingAcceptButton.toggleClass("loading", true);
        // webnet模式
        this.netcall = this.webnet;
        // 音视频插件检查, signal只做检测
        this.checkNetcallSupporting(function () {

            that.updateBeCallingSupportUI(true);
            this.callAcceptedResponse()

        }.bind(this), function () {
            // 平台不支持
            that.reject();
        }, function (err) {

            // 插件弹框报错
            that.showAgentNeedInstallDialog(err, deviceCheck.bind(that), function () {
                that.reject();
            })

            that.updateBeCallingSupportUI(false, null, err);
        }, true, true);

    }

};
/** 同意通话的操作 */
fn.callAcceptedResponse = function (obj) {
    this.clearBeCallTimer();
    this.log("同意对方音视频请求");
    this.beCalling = false;

    this.netcall.response({
        accepted: true,
        beCalledInfo: this.beCalledInfo,
        sessionConfig: this.sessionConfig
    }).then(function () {
        this.log("同意对方音视频请求成功");
        // 加个定时器 处理点击接听了 实际上对面杀进程了，没有callAccepted回调
        this.acceptAndWait = true;
        this.onCallAccepted(obj)
        setTimeout(function () {
            if (this.acceptAndWait) {
                this.log("通话建立过程超时");
                this.hangup()
                this.acceptAndWait = false;
            }
        }.bind(this), 45 * 1000)
    }.bind(this)).catch(function (err) {
        this.log("同意对方音视频通话失败，转为拒绝");
        console.log("error info:", err);
        this.$beCallingAcceptButton.toggleClass("loading", false);
        this.reject();
    }.bind(this));

}
/** 拒绝音视频通话, 兼容多人音视频 */
fn.reject = function () {
    if (!this.beCalling) return;
    this.clearBeCallTimer();
    this.log("拒绝对方音视频通话请求");
    var beCalledInfo = this.beCalledInfo;
    this.netcall.response({
        accepted: false,
        beCalledInfo: beCalledInfo
    }).then(function () {
        this.log("拒绝对方音视频通话请求成功");
        this.sendLocalMessage("已拒绝");
        this.beCalledInfo = null;
        this.beCalling = false;
    }.bind(this)).catch(function (err) {
        // 自己断网了
        this.log("拒绝对方音视频通话请求失败");
        console.log("error info:", err);
        this.beCalledInfo = null;
        this.beCalling = false;
    }.bind(this));

};

// 取消呼叫
fn.cancelCalling = function (isClick) {
    if (isClick === true && this.$callingHangupButton.is(".disabled")) return;

    if (!this.isBusy) {
        this.log("取消呼叫");
        this.netcall.hangup();
    }
    this.clearCallTimer();
    this.clearRingPlay();
    if (isClick === true && !this.isBusy) this.sendLocalMessage("未接通");
    this.hideAllNetcallUI();
    this.resetWhenHangup();
};
// 聊天窗口添加本地消息
fn.sendLocalMessage = function (text, to) {
    if (!to) to = this.netcallAccount;
    setTimeout(function () {
        this.yx.mysdk.sendTextMessage("p2p", to, text, true, function (error, msg) {
            this.yx.cache.addMsgs(msg);

        }.bind(this));
    }.bind(this), 100);

};
// 挂断通话过程
fn.hangup = function () {
    this.netcall.hangup();
    this.beCalledInfo = null;
    this.beCalling = false;
    this.setDeviceAudioIn(false);
    this.setDeviceAudioOut(false);
    this.setDeviceVideoIn(false);
    this.stopRemoteStream();
    this.stopLocalStream();
    /**状态重置 */
    this.resetWhenHangup();
};
// 其它端已处理
fn.onCallerAckSync = function (obj) {
    this.log("其它端已处理");
    if (this.beCalledInfo && obj.channelId === this.beCalledInfo.channelId) {
        console.log("on caller ack async:", obj);
        window.setTimeout(function () {
            this.sendLocalMessage("其它端已处理");
            this.beCalledInfo = false;
            this.beCalling = false;
        }, 2000)

    }
};
// 对方挂断通话过程
// 1. 通话中挂断
// 2. 请求通话中挂断
fn.onHangup = function (obj) {
    this.log("收到对方挂断通话消息");
    console.log("on hange up", obj);
    console.log(this.beCalling, this.beCalledInfo, this.netcallDurationTimer);
    // 是否挂断当前通话
    if (obj.account && obj.account === this.netcallAccount) {
        close.call(this);
    }
    if (this.meetingCall.channelName) {
        return this.log("挂断消息不属于当前群视频通话，忽略");
    }
    if (this.netcallDurationTimer !== null && this.netcall.notCurrentChannelId(obj)) {
        return this.log("挂断消息不属于当前活动通话，忽略1");
    }
    if (this.netcallDurationTimer === null && this.beCalling && this.beCalledInfo.channelId !== obj.channelId) {
        return this.log("挂断消息不属于当前活动通话，忽略2");
    }
    if (this.netcallDurationTimer === null && !this.beCalling) {
        return this.log("挂断消息不属于当前活动通话，忽略3，当前无通话活动");
    }
    try {
        // $("#askSwitchToVideoDialog").dialog("close");
    } catch (e) {
    }
    this.clearBeCallTimer();
    /* var tipText;
     if(this.netcallDurationTimer !== null) {
     // this.sendLocalMessage("通话拨打时长" + this.getDurationText(this.netcallDuration));
     tipText = "对方已挂断";
     } else {
     // var to = obj.account;
     tipText = "对方已挂断";
     // this.sendLocalMessage("未接听", to);
     } */

    close.call(this);

    function close() {
        window.setTimeout(function () {
            this.beCalling = false;
            this.beCalledInfo = null;

            this.setDeviceVideoIn(false);
            this.setDeviceAudioIn(false);
            this.setDeviceAudioOut(false);
        }, 2000)
        /**状态重置 */
        this.resetWhenHangup();
    }


};
/** 被呼叫，兼容多人音视频
 * @param {object} obj 主叫信息
 * @param {string} scene 是否是群视频，默认值p2p
 */
fn.onBeCalling = function (obj, scene) {
    scene = scene || 'p2p';
    this.log("收到音视频呼叫");
    console.log("on be calling:", obj);
    var channelId = obj.channelId;
    var netcall = this.netcall;
    var that = this;

    // 如果是同一通呼叫，直接丢掉
    if (obj.channelId === this.channelId) return
    // 自己正在通话或者被叫中, 通知对方忙并拒绝通话
    if (netcall.calling || this.beCalling) {
        var tmp = {command: Netcall.NETCALL_CONTROL_COMMAND_BUSY};
        if (scene === 'p2p') {
            tmp.channelId = channelId;
        }

        this.log("通知呼叫方我方不空");
        netcall.control(tmp);

        return;
    }
    //接受通话
    this.callAcceptedResponse(obj);
    // 正常发起通话请求
    this.type = obj.type;
    this.channelId = obj.channelId;
    this.beCalling = true;
    // team场景
    if (scene === 'team') {

        this.netcallActive = true;
        var tmp = obj.content;
        // this.updateBeCallingSupportUI(true, true);
        this.playRing("E", 45);

        return;
    }

    /**
     * 考虑被呼叫时，呼叫方断网，被呼叫方不能收到hangup消息，因此设置一个超时时间
     * 在通话连接建立后，停掉这个计时器
     */
    this.beCallTimer = setTimeout(function () {
        if (!this.beCallTimer) return;
        this.log("呼叫方可能已经掉线，挂断通话");
        this.beCallTimer = null;
        this.reject();
    }.bind(this), 62 * 1000)

    //p2p场景
    this.beCalledInfo = obj;
    var account = obj.account;
    this.netcallActive = true;
    this.netcallAccount = account;
    // this.updateBeCallingSupportUI(true, true);
    // checkDevice.call(this);
    this.playRing("E", 45);
};
// 对方接受通话 或者 我方接受通话，都会触发
fn.onCallAccepted = function (obj) {
    if (obj.type === Netcall.NETCALL_TYPE_VIDEO) {
        this.setDeviceAudioIn(true);
        this.setDeviceAudioOut(true);
        this.setDeviceVideoIn(true);
        this.netcall.startLocalStream();
        this.netcall.startRemoteStream();
    } else {
        this.setDeviceAudioIn(true);
        this.setDeviceAudioOut(true);
        this.setDeviceVideoIn(false);
    }
    // 设置采集和播放音量
    this.netcall.setCaptureVolume(255);
    this.netcall.setPlayVolume(255);
    // 关闭被呼叫倒计时
    this.beCallTimer = null;
};

/**
 * 对方拒绝通话, 兼容多人音视频
 * 先判断是否是群视频，如果是群视频，交给群视频的脚本处理
 */
fn.onCallingRejected = function (obj) {

    if (this.yx.crtSessionType === 'team') {
        this.onMeetingCallRejected(obj);
        return;
    }

    this.log("对方拒绝音视频通话");
    this.clearCallTimer();
    this.sendLocalMessage("对方已拒绝");
};

// 发起音视频呼叫
fn.doCalling = function (type) {
    this.log("发起音视频呼叫");
    // this.type = type;
    var netcall = this.netcall;
    var account = this.yx.crtSessionAccount;
    this.netcallAccount = account;
    this.netcallActive = true;
    var deviceType = type === Netcall.NETCALL_TYPE_VIDEO ? Netcall.DEVICE_TYPE_VIDEO : Netcall.DEVICE_TYPE_AUDIO_IN;
    this.afterPlayRingA = function () {
    };
    this.playRing("A", 1, function () {
        this.afterPlayRingA && this.afterPlayRingA();
        this.afterPlayRingA = null;
    }.bind(this));
    netcall.call({
        type: type,
        account: account,
        pushConfig: {
            enable: true,
            needBadge: true,
            needPushNick: true,
            pushContent: '',
            custom: '',
            pushPayload: '',
            sound: '',
        },
        sessionConfig: this.sessionConfig
    }).then(function (obj) {
        this.log("发起通话成功，等待对方接听");
        // 设置超时计时器
        this.callTimer = setTimeout(function () {
            if (!netcall.callAccepted) {
                this.log("超时无人接听");
                this.sendLocalMessage("无人接听");
            }
        }.bind(this), 1000 * 45);

        if (this.afterPlayRingA) {
            this.afterPlayRingA = function () {
                this.playRing("E", 45);
            }.bind(this);
        } else {
            this.playRing("E", 45);
        }

    }.bind(this)).catch(function (err) {
        console.log("发起音视频通话请求失败：", err);
        this.log("发起音视频通话请求失败");
        if (err && err.code === 11001) {
            this.log("发起音视频通话请求失败，对方不在线");
            if (this.afterPlayRingA) {
                this.afterPlayRingA = function () {
                    this.sendLocalMessage("对方不在线");
                }.bind(this);
            } else {
                this.sendLocalMessage("对方不在线");
            }
        } else {
            this.cancelCalling();
        }

    }.bind(this));
};

fn.setDeviceAudioIn = function (state) {
    this.deviceAudioInOn = !!state;
    if (state) {
        this.log("开启麦克风");
        return this.netcall.startDevice({
            // 开启麦克风输入
            type: Netcall.DEVICE_TYPE_AUDIO_IN
        }).then(function () {
            this.log("开启麦克风成功，通知对方我方开启了麦克风");
            // 通知对方自己开启了麦克风
            this.netcall.control({
                command: Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_ON
            })
        }.bind(this)).catch(function () {
            console.log("开启麦克风失败");
            this.log("开启麦克风失败");
        }.bind(this));
    } else {
        this.log("关闭麦克风");
        return this.netcall.stopDevice(Netcall.DEVICE_TYPE_AUDIO_IN) // 关闭麦克风输入
            .then(function () {
                this.log("关闭麦克风成功，通知对方我方关闭了麦克风");
                // 通知对方自己关闭了麦克风
                this.netcall.control({
                    command: Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_AUDIO_OFF
                });
            }.bind(this)).catch(function () {
                this.log("关闭麦克风失败");
            }.bind(this));
    }
};

fn.setDeviceAudioOut = function (state) {
    this.deviceAudioOutOn = !!state;
    if (state) {
        this.log("开启扬声器");
        return this.netcall.startDevice({
            type: Netcall.DEVICE_TYPE_AUDIO_OUT_CHAT
        }).then(function () {
            this.log("开启扬声器成功");
        }.bind(this)).catch(function () {
            console.log("开启扬声器失败");
            this.log("开启扬声器失败");
        }.bind(this));
    }
    else {
        this.log("关闭扬声器");
        return this.netcall.stopDevice(Netcall.DEVICE_TYPE_AUDIO_OUT_CHAT).then(function () {
            this.log("关闭扬声器成功");
        }.bind(this)).catch(function () {
            this.log("关闭扬声器失败");
        }.bind(this));
    }
};

fn.setDeviceVideoIn = function (state) {
    this.deviceVideoInOn = !!state;

    if (state) {
        this.log("开启摄像头");
        return this.netcall.startDevice({
            type: Netcall.DEVICE_TYPE_VIDEO
            /* width: this.videoCaptureSize.width,
             height: this.videoCaptureSize.height */
        }).then(function () {
            this.videoType = 'video'
            this.log("开启摄像头成功，通知对方己方开启了摄像头");
            // 通知对方自己开启了摄像头
            this.netcall.control({
                command: Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_ON
            });
        }.bind(this)).catch(function (err) {
            console.error(err)
            this.videoType = null
            // 通知对方自己的摄像头不可用
            this.log("开启摄像头失败，通知对方己方摄像头不可用", err);
            this.netcall.control({
                command: Netcall.NETCALL_CONTROL_COMMAND_SELF_CAMERA_INVALID
            });
        }.bind(this));
    } else {
        this.videoType = null;
        this.log("关闭摄像头");
        return this.netcall.stopDevice(Netcall.DEVICE_TYPE_VIDEO).then(function () {
            // 通知对方自己关闭了摄像头
            this.log("关闭摄像头成功，通知对方我方关闭了摄像头");
            this.netcall.control({
                command: Netcall.NETCALL_CONTROL_COMMAND_NOTIFY_VIDEO_OFF
            });
        }.bind(this)).catch(function (e) {
            this.videoType = null;
            this.log("关闭摄像头失败");
        }.bind(this));
    }
};
fn.clearCallTimer = function () {
    if (this.callTimer) {
        clearTimeout(this.callTimer);
        this.callTimer = null;
    }
};
fn.clearBeCallTimer = function () {
    if (this.beCallTimer) {
        clearTimeout(this.beCallTimer);
        this.beCallTimer = null;
    }
};
fn.clearRingPlay = function () {
    if (this.playRingInstance) {
        this.playRingInstance.cancel && this.playRingInstance.cancel();
        this.playRingInstance = null;
    }
};

fn.playRing = function (name, count, done) {
    done = done || function () {
        };
    this.playRingInstance = this.playRingInstance || {};
    var nameMap = {
        A: "avchat_connecting",
        B: "avchat_no_response",
        C: "avchat_peer_busy",
        D: "avchat_peer_reject",
        E: "avchat_ring"
    };
    var url = "audio/" + nameMap[name] + ".mp3";

    function doPlay(url, playDone) {
        var audio = document.createElement("audio");
        audio.autoplay = true;
        function onEnded() {

            this.playRingInstance.cancel = null;
            audio = null;
            playDone();
        }

        onEnded = onEnded.bind(this);
        audio.addEventListener("ended", onEnded);
        audio.src = url;
        this.playRingInstance.cancel = function () {
            audio.removeEventListener("ended", onEnded);
            audio.pause();
            audio = null;
        }
    }

    doPlay = doPlay.bind(this);
    var wrap = function () {
        this.playRingInstance = null
        done();
    }.bind(this);
    for (var i = 0; i < count; i++) {
        wrap = (function (wrap) {
            return function () {
                doPlay(url, wrap);
            };
        })(wrap);
    }
    wrap();
};
fn.log = function () {
    message = [].join.call(arguments, " ");
    console.log("%c" + message, "color: green;font-size:16px;");
};