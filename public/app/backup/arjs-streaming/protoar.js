var hideArjsWebcamOnStream = false;

console.error = function (msg) {
    alert("Error: " + msg);
}

require(["jquery", "webrtc-v3", "xd"], true).then(init);

function init() {
    XD.log = console.log;

    var aframe = document.querySelector("#aframe").contentWindow,
        camera, ascene, acanvas, ready = false;
    try {
        camera = aframe.document.querySelector("video");
        ascene = aframe.document.querySelector("a-scene");
        acanvas = ascene.querySelector("canvas");
    }
    catch (e) {
        // ignore
    }
    finally {
        ready = aframe && camera && ascene && acanvas;
    }

    if (!ready) {
        // still waiting on AR.js
        setTimeout(init, 500);
        return;
    }

    console.log("AR.js is ready");

    // room used for streaming
    var room;
    while (!room || !room.trim()) {
        room = prompt("Enter room name:", localStorage.getItem("room") || "protoar");
    }
    localStorage.setItem("room", room);

    // canvas used for capturing environment camera and AR scene
    var cc = document.createElement("canvas");
    cc.width = camera.videoWidth;
    cc.height = camera.videoHeight;

    // video used for streaming AR scene
    var acanvasVideo = document.createElement("video");
    acanvasVideo.setAttribute("autoplay", "");
    acanvasVideo.srcObject = acanvas.captureStream();

    // video used for receiving stream with all layers
    var vcVideo = document.createElement("video");
    vcVideo.setAttribute("autoplay", "");
    vcVideo.onloadedmetadata = function () {
        vc.width = vcVideo.videoWidth;
        vc.height = vcVideo.videoHeight;
    };

    // canvas used for rendering video with all layers
    var vc = document.querySelector("#arview");

    var webrtc = new WebRTC({
        video: vcVideo,
        room: room,
        stream: cc.captureStream(),
        onstream: function () {
            if (hideArjsWebcamOnStream) {
                $(camera).hide(); // hide AR.js camera for performance
            }

            // switch over to stream
            animate();
        }
    });

    /* menu stuff */

    $("#snapshot").click(function () {
        protoar("snapshot");
    });

    var record = $("#record").html(),
        recording = '<i class="fa fa-circle" style="color: #f00"></i>',
        timeout;
    $("#record").click(function () {
        if (timeout) {
            $("#record").html(record);
            timeout = clearTimeout(timeout);
            return;
        }
        if ($("#record").html() == record) {
            $("#record").html("3");
            // countdown 3 secs for preparation
            timeout = setTimeout(function () {
                $("#record").html("2");
                timeout = setTimeout(function () {
                    $("#record").html("1");
                    timeout = setTimeout(function () {
                        protoar("record");
                        $("#record").html(recording);
                        timeout = clearTimeout(timeout);
                    }, 1000);
                }, 1000);
            }, 1000);
        }
        else {
            protoar("record");
        }
    });

    $("#reload").click(function () {
        window.location.reload();
    });

    /* aframe stuff */

    var acamera = document.querySelector("#acamera");

    acamera.addEventListener("componentchanged", function (e) {
        if (e.detail.name == "rotation") {
            protoar("camerachanged", {
                rotation: e.detail.newData
            });
        }
        else if (e.detail.name == "position") {
            protoar("camerachanged", {
                position: e.detail.newData
            });
        }
    });

    /* XD stuff */

    XD.on("devices", function () {
        $("#menu").css("background-color", XD.deviceId);
    });

    XD.on("protoar", function (e) {
        if (e.room && e.room != room) return; // only handle messages for this room
        switch (e.action) {
        case "camerachanged":
            if (e.rotation) {
                acamera.setAttribute("rotation", e.rotation);
            }
            else {
                acamera.setAttribute("position", e.position);
            }
            break;
        case "componentchanged":
            var target = ascene.querySelector(e.target); // changes AR scene!!
            target.setAttribute("position", e.position);
            break;
        case "start":
            $("#record").html(recording);
            break;
        case "stop":
            $("#record").html(record);
            break;
        case "blob":
            //TODO
            /* 
            	aframe-ar.html
            	add a plane with the texture of that video
            */
            console.log(e.data);
            break;
        default:
            console.log("unknown protoar action", e.action);
        }
    });

    /* helper functions */

    function protoar(action, data) {
        XD.trigger(Object.assign({
            event: "protoar",
            room: room,
            action: action
        }, data));
    }

    /* animate function */

    var ccctx = cc.getContext("2d"),
        vcctx = vc.getContext("2d");

    function animate() {
        requestAnimationFrame(animate);

        ccctx.drawImage(camera, 0, 0, camera.videoWidth, camera.videoHeight, 0, 0, camera.videoWidth / cc.width * cc.width, camera.videoHeight / cc.height * cc.height);
        ccctx.drawImage(acanvasVideo, 0, 0, cc.width / acanvasVideo.videoWidth, acanvasVideo.videoHeight, 0, 0, cc.width, cc.height);

        vcctx.drawImage(vcVideo, 0, 0);
    }
}