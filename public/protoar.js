var logXD = false,
  logWebRTC = false;

require(["jquery", "device", "camera-v3", "webrtc", "xd", "kinect2", "fabric"], true).then(function() {
  if (Device.mobile && confirm("Switch to ProtoAR App?")) {
    window.location = "./app";
  }

  $(function() {
    init();

    $("#room").val(room);
    $("#room").change(function() {
      setRoom($(this).val() || "protoar");
    });

    // arcamera toggle
    $(layer360).change(function() {
      //$(arcamera).toggle(layer360.checked);
      if (layer360.checked && hasInspector()) {
        $("#inspect").click();
      }
    });

    // a-frame toggle
    $(layer3D).change(function() {
      layer360.checked = layer3D.checked;
      $("#aframe").toggle(layer3D.checked);
      $(".3d-tools").toggle(layer3D.checked);
    });

    // fabric toggle
    $(layer2D).change(function() {
      console.log(layer2D.checked);
      if (!layer2D.checked) {
        cursor.setAttribute("visible", layer3D.checked && $("#cursor").is(".selected"));
      } else {
        cursor.setAttribute("visible", false);
      }
      $(fabricCanvasEl).parent().toggle(layer2D.checked);
      if (layer2D.checked && hasInspector()) {
        $("#inspect").click();
      }
      $(".2d-tools").toggle(layer2D.checked);
    });

    $("#layer2D, #layer3D, #layer360").change(function() {
      protoar("layers", {
        layer2D: layer2D.checked,
        layer3D: layer3D.checked,
        layer360: layer360.checked
      });
    });

    initView();
    initCapture();
    initCollect();

    initAframe();
    initFabricCanvas();

    animate();

    // disable default browser behaviors
    document.ondragover = document.oncontextmenu = function(e) {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
    }
    document.ondrop = function(e) {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      setTimeout(function() {
        console.warn("clearing chosenXXX variables");
        chosenDataURL = chosen3DObject = chosen360Capture = null;
      }, 100);
    }

    var resizeTimeout;

    $(window).on({
      load: function() {
        // load stored 2D and 3D layer
        var canvas = JSON.parse(localStorage.getItem("canvas"));
        fabricCanvas.loadFromJSON(canvas, fabricCanvas.renderAll.bind(fabricCanvas));

        // TODO uncomment this to load camera
        /*var camera = JSON.parse(localStorage.getItem("camera"));
        if (camera) {
            acamera.setAttribute("position", camera.position);
            acamera.setAttribute("rotation", camera.rotation);
        }*/

        // TODO need to load scene
      },
      beforeunload: function() {
        // store 2D and 3D layer
        try {
          localStorage.setItem("canvas", JSON.stringify(fabricCanvas));
          localStorage.setItem("camera", JSON.stringify({
            position: acamera.getAttribute("position"),
            rotation: acamera.getAttribute("rotation")
          }));

          // TODO need to store scene
        } catch (e) {
          console.error("error: ", e);
          return e.message; // custom message will probably not show, but need to return something to warn user
        }
      },
      resize: function() {
        if (resizeTimeout) return;
        resizeTimeout = setTimeout(function() {
          var stencilRatio = 1.30185;
          var w = $('#stencil').width() / stencilRatio;
          var h = $('#stencil').height() / stencilRatio;

          resizeAll(w, h);

          resizeTimeout = clearTimeout();
        }, 1000);
      },
      keydown: function(e) {
        if (isEditing()) return;
        //console.log("keydown", e.keyCode);
        // select all
        if (e.ctrlKey && (e.keyCode == 65 || e.keyCode == 97)) { // 'A' or 'a'
          setMode("select");

          selectAll();

          e.preventDefault();
          return false;
        } else {
          switch (e.keyCode) {
            case 32:
              toggleAframe();
              break;
            case 66:
              setMode("draw");
              break;
            case 86:
              setMode("select");
              break;
            case 46:
              $("#delete").click();
              break;
          }
        }
      }
    });

    $(window).resize();
  });

  var deviceId;

  var mode;

  var chosenDataURL, chosen3DObject, chosen360Capture;

  var offset = 0;

  var fcolor = hexToRgb("#ffffff");
  var ftolerance = document.getElementById("filter-tolerance");
  var bsize = document.getElementById("boundary-size");

  // video stream used for showing mobile phone camera
  var arcamera = document.querySelector("#arcamera");

  // determines whether marker tracking is used to update the 3D virtual camera or not
  var tracking = false;

  // fabric canvas used for 2D objects
  var fabricCanvasEl = document.getElementById("fcanvas");
  var fabricCanvas = new fabric.Canvas(fabricCanvasEl);

  // virtual canvas used to merge arcamera and fabricCanvas
  var viewCanvas = document.createElement("canvas");

  //
  var largeCanvas = document.createElement("canvas");

  var captureTime = 10 * 1000,
    captureFrames = 30,
    captureRate = captureTime / captureFrames;

  // capture canvas used to take snapshots and video recordings with laptop camera
  var captureCanvas = document.querySelector("#ccanvas"),
    captureContext = captureCanvas.getContext("2d"),
    captureCanvas2 = document.createElement("canvas"),
    captureContext2 = captureCanvas2.getContext("2d");

  var layer2D = document.querySelector("#layer2D"),
    layer3D = document.querySelector("#layer3D"),
    layer360 = document.querySelector("#layer360");

  var oldLayer2D, oldLayer3D, oldlayer360;

  var inspector = false;

  var filter = document.querySelector("#filter");
  var boundary = document.querySelector("#boundary");

  var cropCanvas = document.createElement("canvas");
  var bmax;
  var br;

  var recorder;
  var stream;

  var nextId = 0;

  var aframe = document.querySelector("#aframe").contentWindow;
  var ascene = aframe.document.querySelector("a-scene");
  while (ascene == null) {
    window.reload();
  }
  var acamera = ascene.querySelector("#acamera");

  var acanvas = ascene.querySelector("canvas");
  var avideo = document.createElement("video");
  avideo.setAttribute("autoplay", "");
  avideo.srcObject = acanvas.captureStream();

  var cursor = aframe.document.querySelector("#cursor");

  var ccamera;
  setCaptureCamera(0);

  var src;

  var webrtc;
  var room;

  setRoom(localStorage.getItem("room") || "protoar");

  function init() {
    if (logXD !== true) {
      XD.log = console.log;
    }

    /*XD.on("devices", function () {
        $("#brand").css("border-top", "5px solid " + XD.deviceId);
        updateDevices();
        if (!deviceId || !(deviceId in XD.devices)) {
            deviceId = XD.deviceId;
        }
        $("#device")
            .css("background", deviceId)
            .val(deviceId);
    });

    XD.on("protoar", protoarHandler);

    XD.on("kinect", function (e) {
        if (deviceId != e.deviceId) return;
        var pos = acamera.getAttribute("position");
        if (pos) {
            var dist = Kinect.getRightHand(e.bodyFrame).cameraZ * 10;
            console.log(pos.z, dist);
            pos.z = dist || pos.z;
            acamera.setAttribute("position", pos);
        }
    });*/
  }

  function initView() {
    var view = window.view = document.getElementById("view-pane");

    view.ondrop = function(e) {
      if (e.dataTransfer.files.length) {
        for (var i = 0; i < e.dataTransfer.files.length; ++i) {
          readResource(e.dataTransfer.files[i], true);
        }
      } else if (chosenDataURL) {
        if (isChosen3DObject()) {
          chosen3DObject.setAttribute("material", "");
          chosen3DObject.setAttribute("src", chosenDataURL);
        } else {
          addImage(chosenDataURL);
        }
        chosenDataURL = null;
      } else if (chosen360Capture) {
        make360Plane();

        setTimeout(update360Planes, 100);
      }
    };

    /*$("#device").change(function () {
        deviceId = $(this).val();
        $("#device").css("background", deviceId);
    });*/

    $("#tracking").click(function() {
      setTracking(!tracking);
      $(this).toggleClass("selected", tracking);
      protoar("options", {
        tracking: tracking
      });
    });

    $("#marker").click(function() {
      var marker = aframe.document.querySelector("#marker"),
        visible = marker.getAttribute("visible");
      marker.setAttribute("visible", !visible);
      $(this).toggleClass("selected");
      protoar("options", {
        marker: !visible
      });
    });

    $("#cursor").click(function() {
      var visible = cursor.getAttribute("visible");
      cursor.setAttribute("visible", !layer2D.checked && !visible);
      $(this).toggleClass("selected");
    });

    $("#screenshot").click(function() {
      addImageResource(viewCanvas.toDataURL());
    });

    $("#image").click(function() {
      addImageResource(fabricCanvas.toDataURL());
    });
  }

  var tempColor, tempOpacity;

  function initAframe() {
    aframe.AFRAME.registerComponent('cursor-listener', {
      init: function() {
        this.el.addEventListener('mouseenter', function(evt) {
          choose3DObject(this);
        });
        this.el.addEventListener('mouseleave', function(evt) {
          choose3DObject(null);
        });
      }
    });

    $(aframe).on("keydown", function(e) {
      if (isEditing()) return;
      if (e.keyCode == 32 || e.keyCode == 27) {
        toggleAframe();
      }
    });

    // check for inspector, and hide inspect button
    setInterval(function() {
      if (hasInspector() != inspector) {
        toggleInspector();
      }
    }, 500);

    // inspect button
    $("#inspect").click(function() {
      if (!$(".toggle-edit", aframe.document).length) {
        aframe.postMessage("INJECT_AFRAME_INSPECTOR", window.location);
        setTimeout(function() {
          $(".toggle-edit", aframe.document).click(toggleInspector).hide();
        }, 500);
      } else {
        $(".toggle-edit", aframe.document)[0].click();
      }
      $(this).toggleClass("selected");
    });

    $("#box").click(function() {
      var box = aframe.document.createElement("a-box");
      box.setAttribute("material", "");
      box.setAttribute("position", "0 0 0.5");
      box.setAttribute("scale", "1 1 1");
      box.setAttribute("opacity", getOpacity());
      box.setAttribute("color", getColor());
      box.setAttribute("click-drag", "");
      box.setAttribute("cursor-listener", "");
      console.log(box);
      ascene.appendChild(box);
    });

    $("#plane").click(function() {
      var plane = aframe.document.createElement("a-plane");
      plane.setAttribute("material", "");
      plane.setAttribute("position", "0 0 0.5");
      plane.setAttribute("scale", "3 3 3");
      plane.setAttribute("opacity", getOpacity());
      plane.setAttribute("color", getColor());
      plane.setAttribute("click-drag", "");
      plane.setAttribute("cursor-listener", "");
      ascene.appendChild(plane);
      console.log(plane);
    });

    acamera.addEventListener("componentchanged", function(e) {
      /*if (e.detail.name == "rotation") {
          protoar("camerachanged", {
              rotation: e.detail.newData
          });
      }
      else
      if (e.detail.name == "position") {
          protoar("camerachanged", {
              position: e.detail.newData
          });

      }*/

      update360Planes();
    });
  }

  function initFabricCanvas() {
    setMode("select");
    setColor("#000000");

    $("#select-mode").click(function() {
      setMode("select");
      console.log("test");
    });

    $("#draw-mode").click(function() {
      setMode("draw");
    });

    $("#line-mode").click(function() {
      setMode("line");
    });

    $("#rect-mode").click(function() {
      setMode("rect");
    });

    $("#text-mode").click(function() {
      setMode("text");
    });

    /* draw mode tools */
    $(".color-picker").click(function() {
      setColor(this.value);
    });

    $("#color").change(function() {
      setColor(this.value);
    });

    $("#opacity").change(function() {
      setOpacity(this.value);
    });

    /* enlarge object */
    $("#enlarge").click(function() {
      if (isChosen3DObject()) {
        // recommended to go via three.js rather than getAttribute: https://github.com/aframevr/aframe/blob/master/docs/components/scale.md
        //var scale = chosen3DObject.getAttribute("scale");
        //scale.x *= 1.1;
        //scale.y *= 1.1;
        //scale.z *= 1.1;
        chosen3DObject.object3D.scale.multiplyScalar(1.1);
      } else {
        var sel = fabricCanvas.getActiveObject();
        if (sel) {
          alert("2D object scaling not implemented yet");
        }
      }
    });

    /* shrink object */
    $("#shrink").click(function() {
      if (isChosen3DObject()) {
        // recommended to go via three.js rather than getAttribute: https://github.com/aframevr/aframe/blob/master/docs/components/scale.md
        chosen3DObject.object3D.scale.multiplyScalar(0.9);
      } else {
        var sel = fabricCanvas.getActiveObject();
        if (sel) {
          alert("2D object scaling not implemented yet");
        }
      }
    });

    /* rotate object */
    $("#rotate").click(function() {
      if (isChosen3DObject()) {
        alert("3D object texture rotation not implemented yet");
      } else {
        var sel = fabricCanvas.getActiveObject();
        if (sel) {
          var curAngle = sel.getAngle();
          sel.setAngle(curAngle + 90);
          fabricCanvas.renderAll();
        }
      }
    });

    /* select mode tools */
    $("#delete").click(function() {
      if (isChosen3DObject()) {
        ascene.removeChild(chosen3DObject);
      } else {
        if (fabricCanvas.getActiveGroup()) {
          fabricCanvas.getActiveGroup().forEachObject(function(o) {
            fabricCanvas.remove(o)
          });
          fabricCanvas.discardActiveGroup().renderAll();
        } else fabricCanvas.remove(fabricCanvas.getActiveObject());
      }
    });

    var isDown, line, rect, origX, origY;

    fabricCanvas.on('mouse:down', function(o) {
      isDown = true;
      var pointer = fabricCanvas.getPointer(o.e);
      if (mode == "line") {
        var points = [pointer.x, pointer.y, pointer.x, pointer.y];
        line = new fabric.Line(points, {
          strokeWidth: 5,
          stroke: getColor(),
          opacity: getOpacity(),
          originX: 'center',
          originY: 'center',
          selectable: false
        });
        fabricCanvas.add(line);
      } else if (mode == "rect") {
        origX = pointer.x;
        origY = pointer.y;
        var pointer = fabricCanvas.getPointer(o.e);
        rect = new fabric.Rect({
          left: origX,
          top: origY,
          originX: 'left',
          originY: 'top',
          width: pointer.x - origX,
          height: pointer.y - origY,
          fill: getColor(),
          opacity: getOpacity(),
          transparentCorners: true,
          selectable: false
        });
        fabricCanvas.add(rect);
      } else if (mode == "text") {
        var customtxt = new fabric.IText("Type Here", {
          fontFamily: "Arial",
          left: pointer.x,
          top: pointer.y,
          fontSize: 15,
          fill: getColor(),
          opacity: getOpacity(),
          cursorDuration: 500,
        });
        fabricCanvas.add(customtxt).setActiveObject(customtxt);
        fabricCanvas.renderAll();
      }
    });

    // handle fabricjs events
    fabricCanvas.on("path:created", function(e) {
      e.path.set("opacity", getOpacity());
      fabricCanvas.renderAll();
    });

    fabricCanvas.on('mouse:move', function(o) {
      if (!isDown) return;
      if (mode == "line") {
        var pointer = fabricCanvas.getPointer(o.e);
        line.set({
          x2: pointer.x,
          y2: pointer.y
        });
        fabricCanvas.renderAll();
      } else if (mode == "rect") {
        var pointer = fabricCanvas.getPointer(o.e);

        if (origX > pointer.x) {
          rect.set({
            left: Math.abs(pointer.x)
          });
        }
        if (origY > pointer.y) {
          rect.set({
            top: Math.abs(pointer.y)
          });
        }

        rect.set({
          width: Math.abs(origX - pointer.x),
          height: Math.abs(origY - pointer.y)
        });

        fabricCanvas.renderAll();
      }
    });

    fabricCanvas.on('mouse:up', function(o) {
      isDown = false;

      if (mode == "text") {
        setMode("select");
      }
    });

    fabricCanvas.on('object:selected', function(e) {
      var o = e.target;
      $("#color").prop("value", o.get("type") == "path" ? o.get("stroke") : o.get("fill"));
      $("#opacity").prop("value", o.get("opacity"));
    });

    // set up fabricCanvas using fabric.js
    fabricCanvas.freeDrawingBrush.width = 5;
    //fabric.Object.prototype.transparentCorners = false;
  }

  /*
  function updateDevices() {
      $("#device").empty();
      for (var deviceId in XD.devices) {
          var device = XD.devices[deviceId];
          if (device.type == "kinect" || device.location && device.location.startsWith(window.location)) {
              var label = deviceId == XD.deviceId ? "this device" : device.type.length > 8 ? device.type.substr(0, 8) + "..." : device.type;
              $('<option></option>', {
                      value: deviceId
                  })
                  .css("background", deviceId)
                  .text(label)
                  .appendTo("#device");
          }
      }
  }

  function addCamera(camera) {
  	return new Camera({
  		camera: camera,
  		onstream: function (stream) {
  			addStream(stream);
  			//webrtc.addStream(stream); // not streaming each camera for now
  			if (this.camera < Cameras.length - 1) {
  				addCamera(this.camera + 1);
  			}
  		}
  	});
  }

  function addStream(s) {
      var video = document.createElement("video");
      video.setAttribute("class", "stream");
      video.srcObject = s;
      video.onmousedown = function (e) {
          if (e.which != 1) {
              setCaptureSource(video);
          }
          if (e.which != 3) {
              arcamera.srcObject = s;
          }
      };
      $("#streams").append(video);
  }*/

  function make360Plane() {
    var assets = aframe.document.getElementById("assets");
    var largeCanvas = chosen360Capture.userData.largeCanvas;
    var tempCanvas = aframe.document.createElement("canvas");
    var tempId = "canvas" + nextId++;
    tempCanvas.setAttribute("id", tempId);
    tempCanvas.width = largeCanvas.userData.width;
    tempCanvas.height = largeCanvas.userData.height;
    assets.appendChild(tempCanvas);

    var plane;
    if (isChosen3DObject() && chosen3DObject.nodeName == "A-PLANE") {
      plane = chosen3DObject;
      console.log("updating plane...", plane);
    } else {
      console.log("creating new plane...");
      plane = aframe.document.createElement("a-plane");
      plane.setAttribute("id", "plane" + nextId++);
      plane.setAttribute("width", "3");
      plane.setAttribute("height", "3");
      plane.setAttribute("position", "0 0 0.5");
      plane.setAttribute("look-at", "#acamera");
      plane.setAttribute("click-drag", "");
      plane.setAttribute("cursor-listener", "");
      ascene.appendChild(plane);
    }
    plane.userData = {
      tempCanvas: tempCanvas,
      largeCanvas: largeCanvas,
      frames: largeCanvas.userData.frames,
      lastFrame: 0
    }
    plane.setAttribute("src", "#" + tempId);
    console.log("finished 360 plane", plane);
    return plane;
  }

  var update360PlanesLock = false;

  function update360Planes() {
    if (update360PlanesLock) return;
    update360PlanesLock = true;
    try {
      [].forEach.call(aframe.document.querySelectorAll("a-plane"), function(plane) {
        if (!plane.userData) return;

        var tempCanvas = plane.userData.tempCanvas,
          largeCanvas = plane.userData.largeCanvas;
        var tempContext = tempCanvas.getContext("2d");

        if (!layer360.checked) {
          tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
          return;
        }

        var t1 = plane.getAttribute("position"),
          t2 = acamera.getAttribute("position");
        var p1 = new aframe.THREE.Vector3(t1.x, t1.y, t1.z),
          p2 = new aframe.THREE.Vector3(t2.x, t2.y, t2.z);
        var normVec = (p2.clone()).sub(p1);
        var angle;
        if (normVec.x == 0 && normVec.y == 0) {
          //angle = 0;
          angle = Math.PI / 2;
        } else {
          var z = new aframe.THREE.Vector3(0, 0, 1);
          var _ = Math.sign(((z.clone()).cross(normVec)).y);
          //if (!CCW) {
          //	angle = Math.PI * 2 - (_ * z.angleTo(normVec) + (1 - _) * Math.PI);
          //}
          //else {
          angle = (_ * z.angleTo(normVec) + (1 - _) * Math.PI) + Math.PI / 2;
          //}
        }
        try {
          while (angle > Math.PI) {
            angle -= Math.PI;
          }
          var iterator = Math.floor(angle / Math.PI * plane.userData.frames);
          if (iterator != plane.userData.lastFrame) {
            console.log(iterator);
            plane.userData.lastFrame = iterator;

            // need to clear first for transparency
            tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

            // draw the corresponding frame from largeCanvas
            tempContext.drawImage(largeCanvas, 0, iterator * tempCanvas.height, tempCanvas.width, tempCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height);
            console.log(iterator * tempCanvas.height);
          }
        } catch (e) {
          console.warn(e);
        }
      });
    } finally {
      update360PlanesLock = false;
    }
  }

  function setRoom(value) {
    room = value;
    localStorage.setItem("room", room);
    $("#room").val(room);

    arcamera.srcObject = null;

    webrtc = new WebRTC({
      room: room,
      stream: viewCanvas.captureStream(),
      onstream: function(stream) {
        arcamera.srcObject = stream;
      },
      ondata: protoarHandler,
      log: logWebRTC
    });
  }

  function initCollect() {
    var collect = document.getElementById("collect-pane");

    collect.ondrop = function(e) {
      if (e.dataTransfer.files.length) {
        for (var i = 0; i < e.dataTransfer.files.length; ++i) {
          readResource(e.dataTransfer.files[i]);
        }
      } else if (chosenDataURL) {
        addImageResource(chosenDataURL);
      }
    };

    $("#capture-pane").click(function() {
      $resource = $("#resources .selected").removeClass(".selected");
    });

    $("#download").click(function() {
      var $selected = $("#resources .selected");
      if (!$selected.length) {
        $selected = $("#resources").children();
      }
      $selected.each(function(index, resource) {
        var canvas;
        if (resource.userData && resource.userData.largeCanvas) {
          canvas = resource.userData.largeCanvas;
        } else {
          canvas = document.createElement("canvas");
          canvas.width = resource.videoWidth || resource.naturalWidth;
          canvas.height = resource.videoHeight || resource.naturalHeight;
          canvas.getContext("2d").drawImage(resource, 0, 0);
        }

        canvas.toBlob(function(blob) {
          saveAs(blob, "res" + index);
        });
      });
    });

    $("#upload").on("change", function(e) {
      for (var i = 0; i < e.target.files.length; ++i) {
        readResource(e.target.files[i]);
      }
    });

    $("#remove").click(function() {
      var $resource = $("#resources .selected");
      if ($resource.length) {
        setCaptureSource(ccamera.video);
        $resource.detach();
      } else {
        if (confirm("Are you sure you want to empty the entire resource collection?")) {
          setCaptureSource(ccamera.video);
          $("#resources").empty();
        }
      }
    });
  }

  function initCapture() {
    // init cameras
    Cameras.forEach(function(device, index) {
      $("#ccamera-select").append(`<option value="${device.deviceId}">${device.label}</option>`);
    });

    $("#ccamera-select").change(function() {
      var value = $(this).val();
      if (value == "select") return;
      setCaptureCamera($("option:selected", this).index() - 1); // 0 = (camera)
      $(this).val("select");
    });

    $("#capture-view").click(function() {
      setCaptureSource(viewCanvas);
    });

    $("#capture-camera").click(function() {
      setCaptureSource(arcamera);
    });

    $("#snapshot").click(function() {
      addImageResource((boundary.checked ? cropCanvas : captureCanvas).toDataURL());
    });

    $(boundary).change(function(event) {
      var checkbox = event.target;
      if (checkbox.checked) {
        bmax = Math.min(captureCanvas.width, captureCanvas.height);
        br = bmax * parseFloat(bsize.value);
        cropCanvas.width = br * 2;
        cropCanvas.height = br * 2;
      }
    });

    $('#boundary-size').change(function(event) {
      $(boundary).prop("checked", true);
      var slider = event.target;
      bmax = Math.min(captureCanvas.width, captureCanvas.height);
      br = bmax * parseFloat(bsize.value);
      cropCanvas.width = br * 2;
      cropCanvas.height = br * 2;
    });

    var capture = $("#capture").html(),
      timeout;

    var frames = 0;

    $("#capture").click(function() {
      if ($(this).html() == capture) {
        // clear large canvas
        largeCanvas.getContext("2d").clearRect(0, 0, largeCanvas.width, largeCanvas.height);

        if (boundary.checked) {
          stream = cropCanvas.captureStream();
          largeCanvas.width = cropCanvas.width;
          largeCanvas.height = cropCanvas.height * captureFrames;
          largeCanvas.userData = {
            width: cropCanvas.width,
            height: cropCanvas.height
          };
        } else {
          stream = captureCanvas.captureStream();
          largeCanvas.width = captureCanvas.width;
          largeCanvas.height = captureCanvas.height * captureFrames;
          largeCanvas.userData = {
            width: captureCanvas.width,
            height: captureCanvas.height
          };
        }

        largeCanvas.userData.frames = captureFrames; // let's assume we're going to capture the full thing and adjust later

        var options = {
          mimeType: 'video/webm'
        };
        try {
          recorder = new MediaRecorder(stream, options);
        } catch (e0) {
          console.log('Unable to create recorder with options Object: ', e0);
          try {
            options = {
              mimeType: 'video/webm,codecs=vp9'
            };
            recorder = new MediaRecorder(stream, options);
          } catch (e1) {
            console.log('Unable to create recorder with options Object: ', e1);
            try {
              options = 'video/vp8'; // Chrome 47
              recorder = new MediaRecorder(stream, options);
            } catch (e2) {
              alert('recorder is not supported by this browser.\n\n' +
                'Try Chrome 47 or later, with Experimental Web Platform features enabled from chrome://flags.');
              console.error('Exception while creating recorder:', e2);
              return;
            }
          }
        }
        recorder.onstop = function(event) {
          console.log('recorder stopped: ', event);
        };
        recorder.ondataavailable = function(event) {
          if (event.data && event.data.size > 0) {
            add360CaptureResource(event.data);
          }
        };

        var countdown = captureTime;

        console.log("recording started");
        recorder.start();
        protoar("capture start");

        (function step() {
          $("#capture").html('<i class="fa fa-circle" style="color: #f00"></i> ' + Math.round(countdown / 1000));
          if (countdown <= 0) {
            $("#capture").click();
          } else {
            frames = Math.round((captureTime - countdown) / captureRate);
            console.log("recording frame", frames);
            if (boundary.checked) {
              largeCanvas.getContext("2d").drawImage(cropCanvas, 0, 0, cropCanvas.width, cropCanvas.height, 0, frames * cropCanvas.height, cropCanvas.width, cropCanvas.height);
            } else {
              largeCanvas.getContext("2d").drawImage(captureCanvas, 0, 0, captureCanvas.width, captureCanvas.height, 0, frames * captureCanvas.height, captureCanvas.width, captureCanvas.height);
            }
            timeout = setTimeout(step, captureRate);
          }
          countdown = Math.max(0, countdown - captureRate);
        })();
      } else {
        timeout = clearTimeout(timeout);
        console.log("recorded frames:", frames);
        if (frames < captureFrames) {
          var tempCanvas = document.createElement("canvas");
          tempCanvas.width = largeCanvas.width;
          tempCanvas.height = frames * (boundary.checked ? cropCanvas.height : captureCanvas.height);
          console.log("cropping temp canvas", tempCanvas.width, tempCanvas.height);
          tempCanvas.getContext("2d").drawImage(largeCanvas, 0, 0);
          tempCanvas.userData = largeCanvas.userData;
          tempCanvas.userData.frames = frames;
          largeCanvas = tempCanvas;
        }
        recorder.stop();
        protoar("capture stop");
        largeCanvas.toBlob(function(blob) {
          saveAs(blob);
        });
        $(this).html(capture);
        frames = 0;
      }
    });

    $("#filter-color").on("change", function() {
      fcolor = hexToRgb(this.value);
      $(filter).prop("checked", true);
    });

    $("#filter-tolerance").on("input", function() {
      $(filter).prop("checked", true);
    });

    $(captureCanvas).on({
      click: function(e) {
        $(filter).prop("checked", true);

        var color = "#ffffff",
          offset = $(this).offset(),
          x = (e.pageX - offset.left) * captureCanvas.width / captureCanvas.clientWidth, // adjust coordinates if render size different from client size
          y = (e.clientY - offset.top) * captureCanvas.height / captureCanvas.clientHeight,
          data = captureCanvas.getContext('2d').getImageData(x, y, 1, 1).data,
          color = rgbToHex(data[0], data[1], data[2]);

        $("#filter-color").prop("value", color);
        fcolor = hexToRgb(color);
      },
      dragstart: function(e) {
        chosenDataURL = (boundary.checked ? cropCanvas : captureCanvas).toDataURL();
      }
    });

    // enable dragging on capture fabricCanvas
    captureCanvas.draggable = "true";
  }

  /* protoar data channel stuff */

  function protoar(action, data) {
    /*XD.trigger(Object.assign({
        event: "protoar",
        room: room,
        action: action
    }, data));*/

    webrtc.send(Object.assign({
      event: "protoar",
      room: room,
      action: action
    }, data));
  }

  var minuspidiv2euler = new THREE.Euler(-Math.PI / 2, 0, 0);
  var minuspidiv2qua = new THREE.Quaternion();
  minuspidiv2qua.setFromEuler(minuspidiv2euler);

  function protoarHandler(e) {
    if (e.room && e.room != room) return; // only handle messages for this room
    console.log(e);
    switch (e.action) {
      case "camerachanged":
        if (!tracking || !e.position || !e.rotation) return;
        if (Math.abs(e.position.x) > 10000 || Math.abs(e.position.y) > 10000 || Math.abs(e.position.z) > 10000) return;
        acamera.setAttribute("look-controls-enabled", "false");

        //When I wrote this part, only God and I understood what I was doing
        //Now only God knows
        var pos = new THREE.Vector3(e.position.x, e.position.y, e.position.z);
        var eul = new THREE.Euler(e.rotation._x, e.rotation._y, e.rotation._z, e.rotation._order);
        var qua = new THREE.Quaternion();
        qua.setFromEuler(eul);
        qua.multiply(minuspidiv2qua);
        var reversequa = new THREE.Quaternion(-qua.x, -qua.y, qua.z, qua.w); // mirror along z-axis
        var reverseeul = new THREE.Euler();
        reverseeul.setFromQuaternion(reversequa, "XYZ");
        //			pos.x = -pos.x;
        //			pos.y = -pos.y;
        //			pos.z = -pos.z;
        //			pos.applyQuaternion(qua);
        pos.applyQuaternion(reversequa);
        pos.x = -pos.x;
        pos.y = -pos.y;
        pos.z = -pos.z;
        //				console.log("position:");
        //				console.log(e.position);
        //				console.log("rotated pos:");
        //				console.log(pos);
        //				console.log("rotation:");
        //				console.log(e.rotation);
        var rotset = {
          //					"x": e.rotation._x * 180 / Math.PI,
          //					"y": e.rotation._y * 180 / Math.PI,
          //					"z": e.rotation._z * 180 / Math.PI
          "x": reverseeul.x * 180 / Math.PI,
          "y": reverseeul.y * 180 / Math.PI,
          "z": -reverseeul.z * 180 / Math.PI // reverse an axis, something to do with rotation transformation
        };
        acamera.setAttribute("rotation", rotset);
        var tempcamera = aframe.document.querySelector('[camera]').object3D;
        var motoaxis = tempcamera.getWorldDirection();
        //console.log(tempcamera.getWorldDirection());
        var axis = new THREE.Vector3(motoaxis.x, motoaxis.y, motoaxis.z);
        pos.applyAxisAngle(axis, -2 * reverseeul.z);
        acamera.setAttribute("position", pos);
        //				if (e.rotation) {
        //				}
        //				else {
        //				}
        acamera.setAttribute("look-controls-enabled", "true");
        break;
        /*case "componentchanged":
        var target = ascene.querySelector(e.target);
        target.setAttribute("position", e.position);
        break;*/
      case "layers":
        $(layer2D).prop("checked", e.layer2D).change();
        $(layer3D).prop("checked", e.layer3D).change();
        $(layer360).prop("checked", e.layer360).change();
        break;
      case "options":
        if ("tracking" in e) {
          setTracking(e.tracking);
          $("#tracking").toggleClass("selected", tracking);
        }
        if ("marker" in e) {
          setMarker(e.marker);
          $("#marker").toggleClass("selected", e.marker);
        }
        break;
      case "snapshot":
      case "capture start":
      case "capture stop":
        //setCaptureSource(viewCanvas);
        setCaptureSource(arcamera);
        setTimeout(function() {
          $("#" + e.action.split(" ")[0]).click()
        }, 100); // give it some time to switch cameras
        break;
      default:
        console.log("unknown protoar action", e.action);
    }
  }

  /* helper functions */

  function isChosen3DObject() {
    return !layer2D.checked && chosen3DObject;
  }

  function choose3DObject(object) {
    chosen3DObject = object;
    if (isChosen3DObject()) {
      tempColor = $("#color").prop("value");
      tempOpacity = $("#opacity").prop("value");
      $("#color").prop("value", chosen3DObject.getAttribute("color"));
      $("#opacity").prop("value", chosen3DObject.getAttribute("opacity"));
    } else {
      $("#color").prop("value", tempColor);
      $("#opacity").prop("value", tempOpacity);
    }
  }

  function hasInspector() {
    var el = $(".toggle-edit", aframe.document);
    return el.length == 1 && el.text().startsWith("Back");
  }

  function toggleInspector() {
    inspector = !inspector;

    $("#arview").toggleClass("fullscreen", inspector);

    //$(".toggle-edit", aframe.document).toggle(inspector);
    $(".toggle-edit", aframe.document).hide();
    //$(".a-enter-vr-button", aframe.document).hide();

    if (inspector) {
      oldLayer2D = $(layer2D).prop("checked");
      oldLayer3D = $(layer3D).prop("checked");
      oldlayer360 = $(layer360).prop("checked");
    }

    $(layer2D).prop("checked", !inspector ? oldLayer2D : false).change(); // need to call change handler manually after prop
    $(layer3D).prop("checked", !inspector ? oldLayer3D : true).change();
    $(layer360).prop("checked", !inspector ? oldlayer360 : false).change();
  }

  function resize(el, w, h, css) {
    $(el).attr({
      width: w,
      height: h
    });
    if (css !== false) {
      $(el).css({
        width: w,
        height: h
      });
    }
  }

  /* resizes all the video and canvas elements to have the same dimension and correct aspect ratio */
  function resizeAll(w, h) {
    console.log("resize", w, h);

    resize("#arview", w, h);
    resize(viewCanvas, w, h);
    resize(arcamera, w, h);
    resize(aframe, w, h);
    //resize(ascene, w, h);
    //resize(acanvas, w, h);
    resize(fabricCanvasEl, w, h);

    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
    fabricCanvas.calcOffset();
    fabricCanvas.renderAll();
  }

  /* toggles 2D layer and focus on Aframe/main window accordingly for keyboard input */
  function toggleAframe() {
    $(document.activeElement).blur();
    $(layer2D).click();
    if (layer2D.checked) {
      setTimeout(function() {
        $(window).focus().click();
      }, 100);
    } else {
      setTimeout(function() {
        $(aframe).focus().click();
      }, 100);
    }
  }

  function setMode(value) {
    console.log("mode:", value);

    $(".specific-tools").hide();
    mode = value;
    $("#" + mode + "-tools").show();

    $(".mode.selected").removeClass("selected");
    $("#" + mode + "-mode").addClass("selected");

    // set free drawing mode
    fabricCanvas.isDrawingMode = mode === "draw";

    // set selection according to drawing mode
    fabricCanvas.selection = mode == "select";

    // unselect everything on the fabricCanvas
    selectAll(mode == "select");
    fabricCanvas.deactivateAll()
    fabricCanvas.renderAll();
  }

  function isEditing() {
    var o = fabricCanvas.getActiveObject();
    return o && o.get("type") == "i-text";
  }

  function setColor(value) {
    $("#color").prop("value", value);
    if (fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = value;
    }

    if (isChosen3DObject()) {
      chosen3DObject.setAttribute("color", value);
      chosen3DObject.setAttribute("material", "");
    } else {
      updateSelection(function(o) {
        if (!o) return;
        var attr = o.get("type") == "path" ? "stroke" : "fill";
        o.set(attr, value);
      });
    }
  }

  function getColor() {
    return $("#color").prop("value");
  }

  function setOpacity(value) {
    if (isChosen3DObject()) {
      chosen3DObject.setAttribute("opacity", value);
    } else {
      updateSelection(function(o) {
        if (!o) return;
        o.set("opacity", value);
      });
    }
  }

  function getOpacity() {
    return $("#opacity").prop("value");
  }

  function setTracking(value) {
    tracking = value;
    acamera.setAttribute("look-controls-enabled", !tracking);
    if (!tracking) {
      acamera.setAttribute("position", "0 0 5");
      acamera.setAttribute("rotation", "0 0 0");
    }
  }

  function setMarker(value) {
    var marker = aframe.document.querySelector("#marker");
    marker.setAttribute("visible", value);
  }

  function rgb2gray(r, g, b) {
    var gray = 0.299 * r + 0.587 * g + 0.114 * b;
    return gray;
  }

  function setCaptureCamera(value) {
    ccamera = new Camera({
      camera: value
    });
    ccamera.video.onloadedmetadata = function() {
      setCaptureSource(ccamera.video);
    };
  }

  function setCaptureSource(value) {
    src = value;
    var w = src.videoWidth || src.naturalWidth || src.width,
      h = src.videoHeight || src.naturalHeight || src.height;
    resize(captureCanvas, w, h, false);
    resize(captureCanvas2, w, h, false);
  }

  function addImage(data) {
    fabric.Image.fromURL(data, function(Img) {
      Img.set({
        left: offset += 10,
        top: offset,
        opacity: getOpacity()
      });
      fabricCanvas.add(Img).setActiveObject(Img).renderAll();
    });
  }

  function selectAll(selectable) {
    fabricCanvas.deactivateAll();

    var objs = fabricCanvas.getObjects().map(function(o) {
      return o.set({
        active: true,
        selectable: selectable !== undefined ? selectable : true,
      });
    });

    var group = new fabric.Group(objs, {
      originX: 'center',
      originY: 'center'
    });

    //canvas._activeObject = null;
    fabricCanvas.discardActiveObject();
    fabricCanvas.setActiveGroup(group.setCoords()).renderAll();
  }

  function updateSelection(update) {
    if (fabricCanvas.getActiveGroup()) {
      fabricCanvas.getActiveGroup().forEachObject(update);
    } else {
      update(fabricCanvas.getActiveObject());
    }
    fabricCanvas.renderAll();
  }

  var rescnt = 0;

  function readResource(f, insert) {
    var reader = new FileReader();
    reader.onload = function() {
      var fileName = f.name.split('.')[0];
      var fileType = f.name.split('.')[1];

      var isImageResource = (/\.(gif|jpg|jpeg|png)$/i).test(f.name);

      if (isImageResource) {
        var image = addImageResource(reader.result);

        if (insert) {
          if (isChosen3DObject()) {
            chosen3DObject.setAttribute("src", "#" + id);
          } else {
            addImage(reader.result);
          }
        }
      } else if (fileType == "obj") {
        var assets = aframe.document.getElementById("assets");
        var asset = aframe.document.createElement("a-asset-item");
        var id = fileName + fileType;
        asset.setAttribute("id", id);
        asset.setAttribute("src", reader.result);
        assets.appendChild(asset);

        if (insert) {
          var entity = aframe.document.createElement("a-entity");
          entity.setAttribute("obj-model", {
            obj: "#" + id
          });
          entity.setAttribute("scale", "0.1 0.1 0.1");
          //entity.setAttribute("position", "0 0 0.5");
          var tempVector = new aframe.THREE.Vector3(0, 0, -5);
          var camPos = acamera.getAttribute('position');
          var camRot = acamera.getAttribute('rotation');
          var rot = new aframe.THREE.Euler(camRot.x * Math.PI / 180, camRot.y * Math.PI / 180, camRot.z * Math.PI / 180);
          tempVector.applyEuler(rot);
          entity.setAttribute("position", (camPos.x + tempVector.x).toString() + ' ' + (camPos.y + tempVector.y).toString() + ' ' + (camPos.z + tempVector.z).toString());
          // TODO handle material
          entity.setAttribute("click-drag", "");
          entity.setAttribute("cursor-listener", "");
          ascene.appendChild(entity);
        }
      }
    }

    reader.readAsDataURL(f);
  }

  function makeResource(item) {
    var resource = $(item);
    resource.addClass("resource").click(function() {
      if (!$(this).hasClass("selected")) {
        $("#resources .selected").removeClass("selected"); // unselect old one
        $(this).addClass("selected");

        setCaptureSource(this);
      } else {
        $(this).removeClass("selected");

        setCaptureSource(ccamera.video);
      }
    }).appendTo("#resources");

    return resource;
  }

  function addImageResource(img) {
    var image = $(`<img id="${rescnt++}" src="${img}" />`);

    image.on("dragstart", function() {
      chosenDataURL = toDataURL(this);
    });

    return makeResource(image);
  }

  function add360CaptureResource(blob) {
    var buffer = new Blob([blob], {
      type: "video/webm"
    });
    var video = $(`<video id="${rescnt++}" autoplay loop muted draggable="true" src="${window.URL.createObjectURL(buffer)}"/>`);

    // TODO we copy the large canvas twice, can also do cropping in this step

    var largeCanvas2 = document.createElement("canvas");
    largeCanvas2.width = largeCanvas.width;
    largeCanvas2.height = largeCanvas.height;
    largeCanvas2.getContext("2d").drawImage(largeCanvas, 0, 0);
    largeCanvas2.userData = largeCanvas.userData;
    video[0].userData = {
      blob: buffer,
      duration: null,
      largeCanvas: largeCanvas2
    };

    video.on("dragstart", function() {
      console.log("dragging 360 capture...")
      chosen360Capture = this;
      chosen360Capture.userData.duration = this.duration;
    });

    return makeResource(video);
  }

  function toDataURL(src) {
    var canvas = document.createElement("canvas");
    canvas.width = src.videoWidth || src.naturalWidth || src.width;
    canvas.height = src.videoHeight || src.naturalHeight || src.width;

    canvas.getContext("2d").drawImage(src, 0, 0);

    return canvas.toDataURL();
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /* animate function */

  var viewContext = viewCanvas.getContext("2d");
  viewContext.fillStyle = "#000000";

  var cropContext = cropCanvas.getContext('2d');

  function animate() {
    animateVC();

    animateCC();
  }

  function animateVC() {
    requestAnimationFrame(animateVC);

    //viewContext.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
    viewContext.clearRect(0, 0, viewCanvas.width, viewCanvas.height);

    //viewContext.drawImage(arcamera, 0, 0); // doesn't work

    viewContext.drawImage(arcamera, 0, 0, arcamera.videoWidth, arcamera.videoHeight, 0, 0, viewCanvas.width, viewCanvas.height); // need this to draw the video image with the resolution of the viewCanvas (under poor streaming conditions the video may be streamed with more compression and lower resolution, which we need to counteract!)

    if (layer3D.checked) {
      viewContext.drawImage( /*acanvas*/ avideo, // for some reason can't draw acanvas, but can capture its stream on avideo and draw avideo instead
        0, 0, avideo.videoWidth, avideo.videoHeight, 0, 0, viewCanvas.width, viewCanvas.height);
    }

    if (layer2D.checked) {
      viewContext.drawImage(fabricCanvasEl, 0, 0, fabricCanvasEl.width, fabricCanvasEl.height, 0, 0, viewCanvas.width, viewCanvas.height);
    }
  }

  function animateCC() {
    requestAnimationFrame(animateCC);
    var w = captureCanvas.width,
      h = captureCanvas.height;

    // prepare captureCanvas
    captureContext.clearRect(0, 0, w, h);
    captureContext2.clearRect(0, 0, w, h);

    if (!src || !w || !h) return; // nothing to render if no capture source

    // apply the filter to the capture source (including camera video, or image and video resources)
    captureContext2.drawImage(src, 0, 0);

    var image = captureContext2.getImageData(0, 0, w, h),
      bmp = image.data;

    function within(value, target) {
      return Math.abs(value - target) <= ftolerance.value;
    }

    if (filter.checked) {
      for (var x = 0; x < captureCanvas.width; ++x) {
        for (var y = 0; y < captureCanvas.height; ++y) {
          var i = (x + y * captureCanvas.width) * 4;
          if (boundary.checked) {
            if (x < captureCanvas.width / 2 - br || x > captureCanvas.width / 2 + br || y < captureCanvas.height / 2 - br || y > captureCanvas.height / 2 + br) {
              var r = bmp[i],
                g = bmp[i + 1],
                b = bmp[i + 2];
              var gray = rgb2gray(r, g, b) / 3;
              bmp[i] = gray;
              bmp[i + 1] = gray;
              bmp[i + 2] = gray;
            } else {
              var r = bmp[i],
                g = bmp[i + 1],
                b = bmp[i + 2];

              if (within(r, fcolor.r) && within(g, fcolor.g) && within(b, fcolor.b)) {
                bmp[i + 3] = 0;
              }
            }
          } else {
            var r = bmp[i],
              g = bmp[i + 1],
              b = bmp[i + 2];

            if (within(r, fcolor.r) && within(g, fcolor.g) && within(b, fcolor.b)) {
              bmp[i + 3] = 0;
            }
          }
        }
      }
    } else if (boundary.checked) {
      for (var x = 0; x < captureCanvas.width; ++x) {
        if (x < captureCanvas.width / 2 - br || x > captureCanvas.width / 2 + br) {
          for (var y = 0; y < captureCanvas.height; ++y) {
            var idx = (x + y * captureCanvas.width) * 4;
            var r = bmp[idx],
              g = bmp[idx + 1],
              b = bmp[idx + 2];
            var gray = rgb2gray(r, g, b) / 3;
            bmp[idx] = gray;
            bmp[idx + 1] = gray;
            bmp[idx + 2] = gray;
          }
        } else {
          for (var y = 0; y < captureCanvas.height; ++y) {
            if (y < captureCanvas.height / 2 - br || y > captureCanvas.height / 2 + br) {
              var idx = (x + y * captureCanvas.width) * 4;
              var r = bmp[idx],
                g = bmp[idx + 1],
                b = bmp[idx + 2];
              var gray = rgb2gray(r, g, b) / 3;
              bmp[idx] = gray;
              bmp[idx + 1] = gray;
              bmp[idx + 2] = gray;
            }
          }
        }
      }
    }
    captureContext.putImageData(image, 0, 0);
    if (boundary.checked) {
      cropContext.clearRect(0, 0, br * 2, br * 2);
      cropContext.drawImage(captureCanvas, captureCanvas.width / 2 - br, captureCanvas.height / 2 - br, br * 2, br * 2, 0, 0, br * 2, br * 2);
    }
  }
});
