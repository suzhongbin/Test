/////////////////////////////////初始化音视频通话///////////////////////////////
NIM.use(Netcall);
NIM.use(WhiteBoard);
var netcall = Netcall.getInstance({
	debug: true,
    nim: window.nim,
    mirror: false,
    mirrorRemote: false,
    container: document.getElementById('AnyChatLocalVideoDiv'),
    remoteContainer: $("#AnyChatRemoteVideoDiv")[0]
})

	


/////////////////////////////////初始化信令///////////////////////////////
var signalInited = false;
// 信令通道初始化完毕之后, 开发者可以启用音视频通话相关的 UI, 比如说展示呼叫别人的按钮
// 信令通道初始化失败的时候, 请展示错误并禁用所有音视频通话相关的 UI
netcall.initSignal().then(function () {
    console.log('signalInited');
    signalInited = true
}).catch(function (err) {
    console.log('initSignalError', err);
    signalInited = false
})
// 当信令通道断开时, 会触发 signalClosed 事件
netcall.on('signalClosed', function () {
    console.log('on signalClosed')
    signalInited = false
    hangup()
})
// 初始化过程中会通过 devices 事件回传所有的设备列表
netcall.on('devices', function (obj) {
    console.log('on devices', obj)
})

