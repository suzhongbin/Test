/////////////////////////////////初始化音视频通话///////////////////////////////
NIM.use(WebRTC);
const Netcall = WebRTC;
var netcall = Netcall.getInstance({
	debug: true,
    nim: window.nim,
    mirror: false,
    mirrorRemote: false,
    //container: document.getElementById('AnyChatRemoteVideoDiv'),
    //remoteContainer: document.getElementById("AnyChatRemoteVideoDiv")
})

// 初始化过程中会通过 devices 事件回传所有的设备列表
netcall.on('devices', function (obj) {
    console.log('on devices', obj)
})

