var useViewCanvasStream = false,
  logXD = false,
  logWebRTC = false;

console.error = function(msg) {
  alert("Error: " + msg);
}

require(["jquery", "webrtc", "xd"], true).then(init);

function init() {

  var tracking = false;

  /* AR.js stuff */

  var arToolKit = initArToolKit();
  console.log(arToolKit);

  // get the camera from ARToolKit
  var webrtc,
    webcam = arToolKit.source.domElement;

  webcam.onloadedmetadata = function() {
    webrtc = new WebRTC({
      video: useViewCanvasStream ? viewCanvasStream : undefined,
      room: room,
      stream: webcam.srcObject,
      onstream: function() {
        // hide camera to make things faster when using viewCanvasStream
        if (useViewCanvasStream) {
          webcam.style.display = "none";
        }

        // switch over to stream
        animate();
      },
      ondata: protoarHandler,
      log: logWebRTC
    });

  }

  /* aframe stuff */

  //	var acamera = document.querySelector("#acamera");
  //
  //	acamera.addEventListener("componentchanged", function (e) {
  //		console.log(e);
  //		if (e.detail.name == "rotation") {
  //			protoar("camerachanged", {
  //				rotation: e.detail.newData
  //			});
  //		}
  //
  //		else if (e.detail.name == "position") {
  //			protoar("camerachanged", {
  //				position: e.detail.newData
  //			});
  //		}
  //	});

  /* room stuff */

  var room;
  while (!room || !room.trim()) {
    room = prompt("Enter room name:", localStorage.getItem("room") || "protoar");
  }
  localStorage.setItem("room", room);

  /* canvas stuff */

  // canvas used for rendering video with all layers
  var viewCanvas = document.querySelector("#vcanvas");

  // video used for receiving stream with all layers
  var viewCanvasStream = document.createElement("video");
  viewCanvasStream.setAttribute("autoplay", "");
  viewCanvasStream.onloadedmetadata = function() {
    viewCanvas.width = viewCanvasStream.videoWidth;
    viewCanvas.height = viewCanvasStream.videoHeight;
  };

  /* XD stuff */

  if (logXD) {
    XD.log = console.log;
  }

  /*XD.on("devices", function () {
      $("#menu").css("background-color", XD.deviceId);
  });

  XD.on("protoar", protoarHandler);*/

  /* protoar data channel stuff */

  function protoar(action, data) {
    /*XD.trigger(Object.assign({
        event: "protoar",
        room: room,
        action: action
    }, data));*/

    if (!webrtc) {
      console.warn("webrtc not yet available");
      return;
    }

    webrtc.send(Object.assign({
      event: "protoar",
      room: room,
      action: action
    }, data));
  }

  function protoarHandler(e) {
    console.log(e);
    if (e.room && e.room != room) return; // only handle messages for this room
    switch (e.action) {
      /*case "camerachanged":
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
          break;*/
      case "layers":
        $("#layer2D").toggleClass("selected", e.layer2D);
        $("#layer3D").toggleClass("selected", e.layer3D);
        $("#layer360").toggleClass("selected", e.layer360);
        break;
      case "options":
        if ("tracking" in e) {
          tracking = e.tracking;
          $("#tracking").toggleClass("selected", tracking);
        }
        if ("marker" in e) {
          $("#marker").toggleClass("selected", e.marker);
        }
        break;
      case "capture start":
      case "capture stop":
        $("#capture").html(e.action.split(" ")[1] == "start" ? recordingHtml : captureHtml);
        break;
      default:
        console.log("unknown protoar action", e.action);
    }
  }

  /* menu stuff */

  $("#reload").click(function() {
    window.location.reload();
  });

  $("#layer2D, #layer3D, #layer360").click(function() {
    $(this).toggleClass("selected");
    protoar("layers", {
      layer2D: $("#layer2D").is(".selected"),
      layer3D: $("#layer3D").is(".selected"),
      layer360: $("#layer360").is(".selected")
    });
  });

  $("#tracking, #marker").click(function() {
    $(this).toggleClass("selected");
    tracking = $("#tracking").is(".selected");
    protoar("options", {
      tracking: tracking,
      marker: $("#marker").is(".selected")
    });
  })

  $("#snapshot").click(function() {
    protoar("snapshot");
  });

  var captureHtml = $("#capture").html(),
    recordingHtml = '<i class="fa fa-circle" style="color: #f00"></i>',
    timeout;

  var captureTime = 10,
    captureRate = 1000;

  $("#capture").click(function() {
    if (timeout && $("#capture").html() != recordingHtml) {
      $("#capture").html(captureHtml);
      timeout = clearTimeout(timeout);
      return;
    }
    if ($("#capture").html() == captureHtml) {
      $("#capture").html("3");
      // countdown 3 secs for preparation
      timeout = setTimeout(function() {
        $("#capture").html("2");
        timeout = setTimeout(function() {
          $("#capture").html("1");
          timeout = setTimeout(function() {
            protoar("capture start");

            var countdown = captureTime;

            (function step() {
              if (countdown <= 0) {
                $("#capture").html().click();
                recordingHtml = '<i class="fa fa-circle" style="color: #f00"></i>';
              } else {
                recordingHtml = '<i class="fa fa-circle" style="color: #f00"></i> ' + countdown--;
              }
              $("#capture").html(recordingHtml);
              timeout = setTimeout(step, captureRate);
            })();
          }, 1000);
        }, 1000);
      }, 1000);
    } else {
      timeout = clearTimeout(timeout);
      protoar("capture stop");
    }
  });

  /* animate function */

  var viewContext = viewCanvas.getContext("2d");

  function animate() {
    requestAnimationFrame(animate);

    //viewContext.drawImage(viewCanvasStream, 0, 0); // becomes too small when video stream is using lower resolution for bandwidth

    viewContext.drawImage(viewCanvasStream, 0, 0, viewCanvasStream.videoWidth, viewCanvasStream.videoHeight, 0, 0, viewCanvas.width, viewCanvas.height);
  }

  /////////////////////////////////////////////////
  /////////////////////////////////////////////////
  /////////////////////////////////////////////////
  function initArToolKit() {
    THREEx.ArToolkitContext.baseURL = '';
    // array of functions for the rendering loop
    var onRenderFcts = [];

    // init scene and camera
    var threeScene = new THREE.Scene();

    /////////////////////////////////////////////////
    //		Initialize a basic camera
    /////////////////////////////////////////////////

    // Create a camera
    var threeCamera = new THREE.Camera();
    threeScene.add(threeCamera);
    /////////////////////////////////////////////////
    //          handle arToolkitSource
    /////////////////////////////////////////////////

    var arToolkitSource = new THREEx.ArToolkitSource({
      // to read from the webcam
      sourceType: 'webcam',
    });
    arToolkitSource.init(function onReady() {
      onResize()
    });
    // handle resize
    window.addEventListener('resize', function() {
      onResize()
    });

    function onResize() {
      arToolkitSource.onResize();
      if (arToolkitContext.arController !== null) {
        arToolkitSource.copySizeTo(arToolkitContext.arController.canvas);
      }
    }
    //////////////////////////////////////////////
    //          initialize arToolkitContext
    //////////////////////////////////////////////
    // create atToolkitContext
    var arToolkitContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: THREEx.ArToolkitContext.baseURL + 'data/camera_para.dat',
      detectionMode: 'mono',
      maxDetectionRate: 30,
      canvasWidth: 80 * 3,
      canvasHeight: 60 * 3,
    });
    // initialize it
    arToolkitContext.init(function onCompleted() {
      // copy projection matrix to camera
      threeCamera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    // update artoolkit on every frame
    onRenderFcts.push(function() {
      if (arToolkitSource.ready === false) return;

      arToolkitContext.update(arToolkitSource.domElement)
    });
    /////////////////////////////////////////////
    //          Create a ArMarkerControls
    /////////////////////////////////////////////
    var markerRoot = new THREE.Group;
    threeScene.add(markerRoot)
    var artoolkitMarker = new THREEx.ArMarkerControls(arToolkitContext, markerRoot, {
      type: 'pattern',
      patternUrl: THREEx.ArToolkitContext.baseURL + 'data/hiro.patt'
      // patternUrl : THREEx.ArToolkitContext.baseURL + '../data/data/patt.kanji'
    });

    // build a smoothedControls
    var smoothedRoot = new THREE.Group()
    threeScene.add(smoothedRoot)
    var smoothedControls = new THREEx.ArSmoothedControls(smoothedRoot, {
      lerpPosition: 0.4,
      lerpQuaternion: 0.3,
      lerpScale: 1,
    });

    /*setInterval(function () {
        smoothedControls.update(markerRoot);

        protoar("camerachanged", {
            position: markerRoot.position,
            rotation: markerRoot.rotation
        });
    }, 1000 / 60);*/

    onRenderFcts.push(function(delta) {
      smoothedControls.update(markerRoot);

      //console.log(markerRoot.rotation);
      //console.log(markerRoot.rotation);

      if (tracking) {
        protoar("camerachanged", {
          position: markerRoot.position,
          rotation: markerRoot.rotation
        });
      }
    });

    // run the rendering loop
    var lastTimeMsec = null;
    requestAnimationFrame(function animate(nowMsec) {
      // keep looping
      requestAnimationFrame(animate);
      // measure time
      lastTimeMsec = lastTimeMsec || nowMsec - 1000 / 60
      var deltaMsec = Math.min(200, nowMsec - lastTimeMsec);
      lastTimeMsec = nowMsec;
      // call each update function
      onRenderFcts.forEach(function(onRenderFct) {
        onRenderFct(deltaMsec / 1000, nowMsec / 1000)
      });
    });

    return {
      source: arToolkitSource,
      context: arToolkitContext,
      camera: threeCamera,
      scene: threeScene
    }
  }
}
/////////////////////////////////////////////////
/////////////////////////////////////////////////
/////////////////////////////////////////////////