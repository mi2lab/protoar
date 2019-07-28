require(["jquery", "camera-v3", "webrtc-v3", "xd"]).then(init);

function init() {
    var arcamera = document.querySelector("video");

    if (!arcamera) {
        // still waiting on AR.js
        setTimeout(init, 500);
        return;
    }

    console.log("AR.js is ready");

    var w = 640,
        h = 480;

    arcamera.addEventListener("click", function () {
        console.log("arcamera click");
        XD.trigger({
            event: "protoar",
            snapshot: camera.snapshot(),
            width: camera.width,
            height: camera.height
        });
    });

    var room;
    while (!room || !room.trim()) {
        room = prompt("Enter room name:", localStorage.getItem("room") || "protoar");
    }
    localStorage.setItem("room", room);

    var webrtc = new WebRTC({
        video: arcamera, // if we get a stream from protoar it should contain the camera view
        room: room
    });

    var ascene = document.getElementById("ascene");
    var acamera = document.getElementById("acamera");

    /*var camera = new Camera({
        camera: -1, // try to pick rear camera
        video: false,
        videoWidth: w,
        videoHeight: h,
        onstream: function (stream) {
            webrtc.addStream(stream);
        },
        onupdate: function (update) {
            // check if camera video dimensions have changed
            if (update.width || update.height) {
                XD.trigger("protoar", update);
            }
        }
    });*/

    // just stream AR.js camera
    webrtc.addStream(arcamera.srcObject);

    XD.on("devices", function () {
        $("body").css("border-top", "10px solid " + XD.deviceId);
    });

    $(function () {
        // hide the enter fullscreen/VR button
        $(".a-enter-vr").addClass("a-hidden");
    });
}

console.log = function (msg) {
    alert(msg);
}

console.error = function (msg) {
    alert("Error: " + msg);
}