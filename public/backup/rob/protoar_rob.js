var logXD = false,
	logWebRTC = false;

require(["jquery", "device", "camera-v3", "webrtc", "xd", "kinect2", "fabric"], true).then(function () {
	if (Device.mobile && confirm("Switch to ProtoAR App?")) {
		window.location = "./app";
	}

	var drawingCrop = false;
	var draggingCrop = false;
	var cropTopLeft = {x: undefined, y: undefined};
	var cropBottomRight = {x: undefined, y: undefined};
	var draggingCropStart = {x: undefined, y: undefined};

	$(function () {
		init();

		// dragging crop box

		$(document).on('mousedown', '#cropBox', function(event) {
			event.stopPropagation();
			event.preventDefault();

			[draggingCropStart.x, draggingCropStart.y] = [event.clientX, event.clientY];
			draggingCrop = true;
			console.log('dragging!');
		});

		$(document).on('mousemove', '#cropBox', function(event) {
			if(draggingCrop) {
				event.stopPropagation();
				event.preventDefault();

				var deltaX, deltaY;
				[deltaX, deltaY] = [event.clientX - draggingCropStart.x, event.clientY - draggingCropStart.y];

				$('#cropBox').offset({ left: $('#cropBox').offset().left + deltaX, top: $('#cropBox').offset().top + deltaY });
				[draggingCropStart.x, draggingCropStart.y] = [event.clientX, event.clientY];
			}
		});

		$(document).on('mouseup', '#cropBox', function() {
			event.stopPropagation();
			event.preventDefault();

			draggingCrop = false;
		});

		// drawing crop box

		$('#ccanvas').on('mousedown',function(event) {
			event.stopPropagation();
			event.preventDefault();

			$('#cropBox').remove();
			drawingCrop = true;
			cropTopLeft.x = event.clientX;
			cropTopLeft.y = event.clientY;
			$('body').append(`<div id="cropBox" style="pointer-events:none;background-color:rgba(0,0,0,.5);position:fixed;top:${cropTopLeft.y}px;left:${cropTopLeft.x}px;"></div>`);
		});

		$('#ccanvas').on('mousemove',function(event) {
			if(drawingCrop) {
				cropBottomRight.x = event.clientX;
				cropBottomRight.y = event.clientY;

				var left = ((cropBottomRight.x - cropTopLeft.x < 0) ? cropBottomRight.x : cropTopLeft.x);
				var top = ((cropBottomRight.y - cropTopLeft.y < 0) ? cropBottomRight.y : cropTopLeft.y);

				$('#cropBox').offset({ top: top, left: left});
				$('#cropBox').width(Math.abs(cropBottomRight.x - cropTopLeft.x));
				$('#cropBox').height(Math.abs(cropBottomRight.y - cropTopLeft.y));
			}
		});

		$('#ccanvas').on('mouseup',function() {
			event.stopPropagation();
			event.preventDefault();
			drawingCrop = false;
			$('#cropBox').css('pointer-events','auto');
		});



		$("#room").val(room);
		$("#room").change(function () {
			setRoom($(this).val() || "protoar");
		});

		// arcamera toggle
		$(layerAR).change(function () {
			$(arcamera).toggle(layerAR.checked);
		});

		// a-frame toggle
		$(layer3D).change(function () {
			$("#aframe").toggle(layer3D.checked);
		});

		// fabric toggle
		$(layer2D).change(function () {
			$("#fcanvas").parent().toggle(layer2D.checked);
		});

		initView();
		initCapture();
		initResources();

		initAframe();
		initFcanvas();

		animate();

		// disable default browser behaviors
		document.ondragover = document.oncontextmenu = function (e) {
			if (e && e.preventDefault) {
				e.preventDefault();
			}
		}
		document.ondrop = function (e) {
			if (e && e.preventDefault) {
				e.preventDefault();
			}
			setTimeout(function () {
				chosenObj = captureDataUrl = videoDragged = null;
				console.log('temporary files deleted');
			}, 100);
		}

		$(window).on({
			load: function () {
				// load stored 2D and 3D layer
				var canvas = JSON.parse(localStorage.getItem("canvas"));
				fcanvas.loadFromJSON(canvas, fcanvas.renderAll.bind(fcanvas));

				// TODO uncomment this to load camera
				/*var camera = JSON.parse(localStorage.getItem("camera"));
				if (camera) {
				    acamera.setAttribute("position", camera.position);
				    acamera.setAttribute("rotation", camera.rotation);
				}*/

				// TODO need to load scene
			},
			beforeunload: function () {
				// store 2D and 3D layer
				try {
					localStorage.setItem("canvas", JSON.stringify(fcanvas));
					localStorage.setItem("camera", JSON.stringify({
						position: acamera.getAttribute("position"),
						rotation: acamera.getAttribute("rotation")
					}));

					// TODO need to store scene
				}
				catch (e) {
					console.error("error: ", e);
					return e.message; // custom message will probably not show, but need to return something to warn user
				}
			},
			resize: function () {
				var stencilRatio = 1.30185;
				var w = $('#stencil').width() / stencilRatio;
				var h = $('#stencil').height() / stencilRatio;

				resizeAll(w, h);
			},
			keydown: function (e) {
				if (isEditing()) return;
				//console.log("keydown", e.keyCode);
				// select all
				if (e.ctrlKey && (e.keyCode == 65 || e.keyCode == 97)) { // 'A' or 'a'
					setMode("select");

					selectAll();

					e.preventDefault();
					return false;
				}
				else {
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

	var chosenObj, videoDragged, captureDataUrl;

	var offset = 0;

	var fcolor = hexToRgb("#ffffff");

	var bsize = document.getElementById("boundary-size");
	var ftolerance = document.getElementById("filter-tolerance");

	// video stream used for showing mobile phone camera
	var arcamera = document.querySelector("#arcamera");

	// determines whether marker tracking is used to update the 3D virtual camera or not
	var tracking = true;

	// fabric canvas used for 2D objects
	var fcanvasEl = document.getElementById("fcanvas");
	var fcanvas = new fabric.Canvas(fcanvasEl);

	// virtual canvas used to merge arcamera and fcanvas
	var vc = document.createElement("canvas");

	// capture canvas used to take snapshots and video recordings with laptop camera
	var cc = document.querySelector("#ccanvas"),
		ccctx = cc.getContext("2d"),
		cc2 = document.createElement("canvas"),
		cc2ctx = cc2.getContext("2d");

	var layer2D = document.querySelector("#layer2D"),
		layer3D = document.querySelector("#layer3D"),
		layerAR = document.querySelector("#layerAR");

	var oldLayer2D, oldLayer3D, oldLayerAR;

	var filter = document.querySelector("#filter");
	var boundary = document.querySelector("#boundary");

	var bc = document.createElement("canvas");
	var bmax;
	var br;

	var mediaRecorder;
	var stream;

	var aframe = document.querySelector("#aframe").contentWindow;
	var ascene = aframe.document.querySelector("a-scene");
	var acamera = ascene.querySelector("#acamera");

	var acanvas = ascene.querySelector("canvas");
	var avideo = document.createElement("video");
	avideo.setAttribute("autoplay", "");
	avideo.srcObject = acanvas.captureStream();

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
		    $("#device-select")
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
		/*$("#device-select").change(function () {
		    deviceId = $(this).val();
		    $("#device-select").css("background", deviceId);
		});*/

		$("#tracking").click(function () {
			var selected = $(this).is(".selected");
			tracking = !selected;
			if (!tracking) {
				acamera.setAttribute("position", "0 0 5");
				acamera.setAttribute("rotation", "0 0 0");
			}
			$(this).toggleClass("selected");
		});

		$("#cursor").click(function () {
			var cursor = aframe.document.querySelector("#cursor"),
				visible = cursor.getAttribute("visible");
			cursor.setAttribute("visible", !visible);
			$(this).toggleClass("selected");
		});

		$("#marker").click(function () {
			var marker = aframe.document.querySelector("#marker"),
				visible = marker.getAttribute("visible");
			marker.setAttribute("visible", !visible);
			$(this).toggleClass("selected");
		});

		$("#screenshot").click(function () {
			addImageResource(vc.toDataURL());
		});

		var view = document.getElementById("view");

		var nextId = 0;

		view.ondrop = function (e) {
			console.log("drop", e);
			console.log(e.target);
			if (captureDataUrl) {
				if (chosenObj) {
					chosenObj.setAttribute("material", "");
					chosenObj.setAttribute("src", captureDataUrl);
				}
				else {
					addImage(captureDataUrl);
					//addImageResource(captureDataUrl);
				}
				captureDataUrl = null;
			}
			else if (videoDragged) {
				console.log('gonna insert a plane');
				var assets = aframe.document.getElementById("assets");
				var tempId = "canvas" + nextId++;
				var tempCanvas = aframe.document.createElement("canvas");
				tempCanvas.setAttribute("id", tempId);
				assets.appendChild(tempCanvas);
				var tempContext = tempCanvas.getContext('2d');
				var updateTempCanvas = function () {
					console.log(tempVideo.currentTime);
					tempContext.drawImage(tempVideo, 0, 0, tempVideo.videoWidth, tempVideo.videoHeight, 0, 0, tempCanvas.width, tempCanvas.height);
				};
				var buffer = new Blob([videoDragged.userData.blob], {
					type: 'video/webm'
				});
				var tempVideo = document.createElement("video");
				tempVideo.setAttribute("muted", ""); // let's mute the video, just in case
				tempVideo.src = window.URL.createObjectURL(buffer);
				console.log(videoDragged.userData);
				tempVideo.userData = {
					duration: videoDragged.userData.duration,
					plane: null,
					largeCanvas: videoDragged.userData.largeCanvas
				};
				tempVideo.onloadedmetadata = function () {
					tempCanvas.width = tempVideo.videoWidth;
					tempCanvas.height = tempVideo.videoHeight;
				};
				tempVideo.onloadeddata = function () {
					console.log("Loaded the video's data!");
					updateTempCanvas(); // draw the first frame
					var newPlane = aframe.document.createElement('a-plane');
					newPlane.userData = {
						vid: tempVideo,
						lastFrame: 0
					};
					tempVideo.userData.plane = newPlane;
					/*tempVideo.onseeked = function () {
					    //tempContext.drawImage(video, video.videoWidth / 2 - 60, video.videoHeight / 2 - 60, 120, 120, 0, 0, 200, 200);
					    tempContext.drawImage(tempVideo, 0, 0, tempVideo.videoWidth, tempVideo.videoHeight, 0, 0, tempCanvas.width, tempCanvas.height);

					    var canvasData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

					    tempContext.putImageData(canvasData, 0, 0);
					    var dataURL = tempCanvas.toDataURL();
					    this.userData.plane.setAttribute('src', dataURL);
					};*/
					tempVideo.onseeked = updateTempCanvas;
					var tempVector = new aframe.THREE.Vector3(0, 0, -5);
					var camPos = acamera.getAttribute('position');
					var camRot = acamera.getAttribute('rotation');
					var rot = new aframe.THREE.Euler(camRot.x * Math.PI / 180, camRot.y * Math.PI / 180, camRot.z * Math.PI / 180);
					tempVector.applyEuler(rot);
					newPlane.setAttribute("position", (camPos.x + tempVector.x).toString() + ' ' + (camPos.y /* + tempVector.y*/ ).toString() + ' ' + (camPos.z + tempVector.z).toString());
					//newPlane.setAttribute('position', '0 1.6 -3');
					newPlane.setAttribute("click-drag", "");
					newPlane.setAttribute("src", "#" + tempId);
					ascene.appendChild(newPlane);
					newPlane.setAttribute("look-at", "#acamera");
					newPlane.userData.vid.currentTime = 0;
				};
			}
			else {
				console.log(e.dataTransfer);
				for (var i = 0; i < e.dataTransfer.files.length; ++i) {
					console.log(e.dataTransfer.files[i]);
					reader(e.dataTransfer.files[i]);
				}
			}
		};

		function reader(f) {
			var reader = new FileReader();
			reader.onload = function () {
				var fileName = f.name.split('.')[0];
				var fileType = f.name.split('.')[1];

				if (fileType == "obj" || chosenObj && (/\.(gif|jpg|jpeg|png)$/i).test(f.name)) {
					var asset = aframe.document.createElement("a-asset-item");
					var id = fileType + "-" + fileName;
					asset.setAttribute("id", id);
					asset.setAttribute("src", reader.result);
					var assets = aframe.document.getElementById("assets");
					assets.appendChild(asset);

					if (fileType == "obj") {
						var entity = aframe.document.createElement("a-entity");
						entity.setAttribute("obj-model", {
							obj: "#" + id
						});
						var tempVector = new aframe.THREE.Vector3(0, 0, -5);
						var camPos = acamera.getAttribute('position');
						var camRot = acamera.getAttribute('rotation');
						var rot = new aframe.THREE.Euler(camRot.x * Math.PI / 180, camRot.y * Math.PI / 180, camRot.z * Math.PI / 180);
						tempVector.applyEuler(rot);
						entity.setAttribute("position", (camPos.x + tempVector.x).toString() + ' ' + (camPos.y + tempVector.y).toString() + ' ' + (camPos.z + tempVector.z).toString());
						entity.setAttribute("material", "color: red");
						entity.setAttribute("click-drag", '');
						entity.setAttribute("cursor-listener", '');
						ascene.appendChild(entity);
					}
					else {
						if (chosenObj) {
							chosenObj.setAttribute('material', {
								src: "#" + id
							});
						}
					}
				}
				else {
					addImage(reader.result);
					//addImageResource(reader.result);
				}
			}
			reader.readAsDataURL(f);
		}
	}

	function initAframe() {
		aframe.AFRAME.registerComponent('cursor-listener', {
			init: function () {
				this.el.addEventListener('mouseenter', function (evt) {
					chosenObj = this;
				});
				this.el.addEventListener('mouseleave', function (evt) {
					chosenObj = null;
				});
			}
		});

		$(aframe).on("keydown", function (e) {
			if (isEditing()) return;
			if (e.keyCode == 32 || e.keyCode == 27) {
				toggleAframe();
			}
		});

		var inspector = false;

		// check for inspector, and hide inspect button
		setInterval(function () {
			if (hasInspector() != inspector) {
				toggleInspector();
			}
		}, 1000);

		// inspect button
		$("#inspect").click(function () {
			if (!$(".toggle-edit", aframe.document).length) {
				aframe.postMessage("INJECT_AFRAME_INSPECTOR", window.location);
				setTimeout(function () {
					$(".toggle-edit", aframe.document).click(toggleInspector);
				}, 500);
			}
			else {
				$(".toggle-edit", aframe.document)[0].click();
			}
		});

		function toggleInspector() {
			inspector = !inspector;

			$("#arview").toggleClass("fullscreen", inspector);

			$(".toggle-edit", aframe.document).toggle(inspector);

			if (inspector) {
				oldLayer2D = $(layer2D).prop("checked");
				oldLayer3D = $(layer3D).prop("checked");
				oldLayerAR = $(layerAR).prop("checked");
			}

			$(layer2D).prop("disabled", inspector);
			$(layer2D).prop("checked", !inspector ? oldLayer2D : false).change(); // need to call change handler manually after prop
			$(layer3D).prop("checked", !inspector ? oldLayer3D : true).change();
			$(layer3D).prop("disabled", inspector);
			$(layerAR).prop("checked", !inspector ? oldLayerAR : false).change();
			$(layerAR).prop("disabled", inspector);
		}

		$("#box").click(function () {
			var box = aframe.document.createElement("a-box");
			box.setAttribute("material", "");
			box.setAttribute("click-drag", "");
			box.setAttribute("cursor-listener", "");
			//box.setAttribute("position", "0 " + Math.round((offset += 10) / 10) + " 0");
			box.setAttribute("position", "0 0 0");
			box.setAttribute("material", "opacity: " + getOpacity());
			box.setAttribute("color", getColor());
			ascene.appendChild(box);
			console.log(box);
		});

		window.draggingLock = aframe.draggingLock = false;

		aframe.document.addEventListener("dragstart", function () {
			draggingLock = true;
			acamera.setAttribute("look-controls-enabled", "false");
		});

		aframe.document.addEventListener("dragend", function () {
			acamera.setAttribute("look-controls-enabled", "true");
			draggingLock = false;
		});

		acamera.addEventListener("componentchanged", function (e) {
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

			updatePlanes();
		});

		var updatePlanesLock = false;

		function updatePlanes() {
			if (updatePlanesLock) return;
			updatePlanesLock = true;
			try {
				// TODO this gets triggered a lot when the camera is controlled remotely, need to check whether we need it here
				var planes = aframe.document.getElementsByTagName("a-plane");
				//console.log(planes);
				for (var i = 0; i < planes.length; ++i) {
					if (!planes[i].id == "marker" || !planes[i].userData || !planes[i].userData.vid) {
						continue;
					}
					var vid = planes[i].userData.vid;
					var duration = vid.userData.duration;

					var t1 = planes[i].getAttribute("position"),
						t2 = acamera.getAttribute("position");
					var p1 = new aframe.THREE.Vector3(t1.x, t1.y, t1.z),
						p2 = new aframe.THREE.Vector3(t2.x, t2.y, t2.z);
					var normVec = (p2.clone()).sub(p1);
					var angle;
					if (normVec.x == 0 && normVec.y == 0) {
						//angle = 0;
						angle = Math.PI / 2;
					}
					else {
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
						if (angle > Math.PI)
							angle -= Math.PI;
						//						var timeFrame = angle / Math.PI * duration;
						//						if (Math.abs(timeFrame - planes[i].userData.lastFrame) > 0.1) {
						//							// seek the vid
						//							vid.currentTime = parseFloat(timeFrame);
						//							planes[i].userData.lastFrame = timeFrame;
						//							console.log("seeking", vid.currentTime);
						//						}
						var percent = Math.floor(angle / Math.PI * 100);
						if (percent != planes[i].userData.lastFrame) {
							planes[i].userData.lastFrame = percent;
							var tempCanvas = document.createElement("canvas");
							tempCanvas.width = planes[i].userData.vid.userData.largeCanvas.userData.width;
							tempCanvas.height = planes[i].userData.vid.userData.largeCanvas.userData.height;
							var tempContext = tempCanvas.getContext("2d");
							tempContext.drawImage(planes[i].userData.vid.userData.largeCanvas, 0, percent * tempCanvas.height, tempCanvas.width, tempCanvas.height);
							planes[i].src = tempCanvas;
						}
						//						if (Math.abs(timeFrame - planes[i].userData.lastFrame) > 0.1) {
						//							// seek the vid
						//							//vid.currentTime = parseFloat(timeFrame);
						//							planes[i].userData.lastFrame = timeFrame;
						//							console.log("seeking", vid.currentTime);
						//						}
					}
					catch (e) {
						console.warn(e);
					}
				}
			}
			finally {
				updatePlanesLock = false;
			}
		}

		/*[].forEach.call(ascene.querySelectorAll("[click-drag]"), function (el) {
		    console.log("click-drag", el);
		    el.addEventListener("componentchanged", function (e) {
		        if (e.detail.name == "position") {
		            protoar("componentchanged", {
		                target: "#" + e.target.id,
		                position: el.getAttribute("position")
		            });
		        }
		    });
		});*/
	}

	function initFcanvas() {
		setMode("draw");
		setColor("#000000");

		$("#select-mode").click(function () {
			setMode("select");
			console.log("test");
		});

		$("#draw-mode").click(function () {
			setMode("draw");
		});

		$("#line-mode").click(function () {
			setMode("line");
		});

		$("#rect-mode").click(function () {
			setMode("rect");
		});

		$("#text-mode").click(function () {
			setMode("text");
		});

		/* draw mode tools */
		$(".color-picker").click(function () {
			setColor(this.value);
		});

		$("#color").change(function () {
			setColor(this.value);
		});

		$("#opacity").click(function () {
			console.log('setting opacity');
			setOpacity(this.value);
		});

		/* select mode tools */
		$("#delete").click(function () {
			if (fcanvas.getActiveGroup()) {
				fcanvas.getActiveGroup().forEachObject(function (o) {
					fcanvas.remove(o)
				});
				fcanvas.discardActiveGroup().renderAll();
			}
			else fcanvas.remove(fcanvas.getActiveObject());
		});

		/* rotate object */
		$("#rotate").click(function () {
			var sel = fcanvas.getActiveObject();
			if (sel) {
				var curAngle = sel.getAngle();
				sel.setAngle(curAngle + 90);
				fcanvas.renderAll();
			}
		});

		/* image file import */
		$("#upload").on("change", function (e) {
			setMode("select");

			var file = e.target.files[0];
			var reader = new FileReader();
			reader.onload = function (f) {
				var data = f.target.result;
				addImage(data);
				//addImageResource(data);
			};
			reader.readAsDataURL(file);
		});

		$("#export").click(function () {
			vc.toBlob(function (blob) {
				saveAs(blob);
			});
		});

		var isDown, line, rect, origX, origY;

		fcanvas.on('mouse:down', function (o) {
			isDown = true;
			var pointer = fcanvas.getPointer(o.e);
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
				fcanvas.add(line);
			}
			else if (mode == "rect") {
				origX = pointer.x;
				origY = pointer.y;
				var pointer = fcanvas.getPointer(o.e);
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
				fcanvas.add(rect);
			}
			else if (mode == "text") {
				var customtxt = new fabric.IText("Type Here", {
					fontFamily: "Arial",
					left: pointer.x,
					top: pointer.y,
					fontSize: 15,
					fill: getColor(),
					opacity: getOpacity(),
					cursorDuration: 500,
				});
				fcanvas.add(customtxt).setActiveObject(customtxt);
				fcanvas.renderAll();
			}
		});

		// handle fabricjs events
		fcanvas.on("path:created", function (e) {
			e.path.set("opacity", getOpacity());
			fcanvas.renderAll();
		});

		fcanvas.on('mouse:move', function (o) {
			if (!isDown) return;
			if (mode == "line") {
				var pointer = fcanvas.getPointer(o.e);
				line.set({
					x2: pointer.x,
					y2: pointer.y
				});
				fcanvas.renderAll();
			}
			else if (mode == "rect") {
				var pointer = fcanvas.getPointer(o.e);

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

				fcanvas.renderAll();
			}
		});

		fcanvas.on('mouse:up', function (o) {
			isDown = false;

			if (mode == "text") {
				setMode("select");
			}
		});

		fcanvas.on('object:selected', function (e) {
			var o = e.target;
			$("#color").prop("value", o.get("type") == "path" ? o.get("stroke") : o.get("fill"));
			$("#opacity").prop("value", o.get("opacity"));
		});

		// set up fcanvas using fabric.js
		fcanvas.freeDrawingBrush.width = 5;
		//fabric.Object.prototype.transparentCorners = false;
	}

	function updateDevices() {
		$("#device-select").empty();
		for (var deviceId in XD.devices) {
			var device = XD.devices[deviceId];
			if (device.type == "kinect" || device.location && device.location.startsWith(window.location)) {
				var label = deviceId == XD.deviceId ? "this device" : device.type.length > 8 ? device.type.substr(0, 8) + "..." : device.type;
				$('<option></option>', {
						value: deviceId
					})
					.css("background", deviceId)
					.text(label)
					.appendTo("#device-select");
			}
		}
	}

	/*function addCamera(camera) {
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

	function setRoom(value) {
		room = value;
		localStorage.setItem("room", room);
		$("#room").val(room);

		arcamera.srcObject = null;

		webrtc = new WebRTC({
			room: room,
			stream: vc.captureStream(),
			onstream: function (stream) {
				arcamera.srcObject = stream;
			},
			ondata: protoarHandler,
			log: logWebRTC
		});
	}

	function initResources() {
		$("#remove-resource").click(function () {
			var $resource = $("#resources .selected");
			if ($resource.length) {
				setCaptureSource(ccamera.video);
				$resource.detach();
			}
			else {
				if (confirm("Are you sure you want to empty the entire resource collection?")) {
					setCaptureSource(ccamera.video);
					$("#resources").empty();
				}
			}
		});

		$("#download-resource").click(function () {
			var $selected = $("#resources .selected");
			if (!$selected.length) {
				$selected = $("#resources").children();
			}
			$selected.each(function (index, resource) {
				var canvas = document.createElement("canvas");
				canvas.width = resource.videoWidth || resource.naturalWidth;
				canvas.height = resource.videoHeight || resource.naturalHeight;
				var ctx = canvas.getContext("2d");
				ctx.drawImage(resource, 0, 0);
				canvas.toBlob(function (blob) {
					saveAs(blob, "res" + index);
				});
			});
		});
	}

	var largeCanvas;
	var largeContext;

	function initCapture() {
		// init cameras
		Cameras.forEach(function (device, index) {
			$("#ccamera-select").append(`<option value="${device.deviceId}">${device.label}</option>`);
		});

		$("#ccamera-select").change(function () {
			var value = $(this).val();
			if (value == "select") return;
			if (value == "view") {
				setCaptureSource(vc);
			}
			else if (value == "remote") {
				setCaptureSource(arcamera);
			}
			else {
				setCaptureCamera($("option:selected", this).index() - 3); // 0 = (camera) 1 = screeen 2 = remote
			}
			$(this).val("select");
		});

		$("#snapshot").click(function () {
			if (boundary.checked) {
				addImageResource(bc.toDataURL());
			}
			else {
				addImageResource(cc.toDataURL());
			}
		});

		$(boundary).change(function (event) {
			var checkbox = event.target;
			if (checkbox.checked) {
				bmax = Math.min(cc.width, cc.height);
				br = bmax * parseFloat(bsize.value);
				bc.width = br * 2;
				bc.height = br * 2;
			}
		});

		$('#boundary-size').change(function (event) {
			$(boundary).prop("checked", true);
			var slider = event.target;
			bmax = Math.min(cc.width, cc.height);
			br = bmax * parseFloat(bsize.value);
			bc.width = br * 2;
			bc.height = br * 2;
		});

		function handleDataAvailable(event) {
			if (event.data && event.data.size > 0) {
				var blob = event.data;
				console.log(blob);
				addVideoResource(blob);
			}
		}

		function handleStop(event) {
			console.log('Recorder stopped: ', event);
		}

		var record = $("#record").html(),
			timeout;

		$("#record").click(function () {
			if ($(this).html() == record) {
				largeCanvas = document.createElement("canvas");
				if (boundary.checked) {
					stream = bc.captureStream();
					largeCanvas.width = bc.width;
					largeCanvas.height = bc.height * 100;
					largeCanvas.userData = {
						width: bc.width,
						height: bc.height
					};
				}
				else {
					stream = cc.captureStream();
					largeCanvas.width = cc.width;
					largeCanvas.height = cc.height * 100;
					largeCanvas.userData = {
						width: cc.width,
						height: cc.height
					};
				}
				//largeContext = largeCanvas.getContext("2d");

				var options = {
					mimeType: 'video/webm'
				};
				try {
					mediaRecorder = new MediaRecorder(stream, options);
				}
				catch (e0) {
					console.log('Unable to create MediaRecorder with options Object: ', e0);
					try {
						options = {
							mimeType: 'video/webm,codecs=vp9'
						};
						mediaRecorder = new MediaRecorder(stream, options);
					}
					catch (e1) {
						console.log('Unable to create MediaRecorder with options Object: ', e1);
						try {
							options = 'video/vp8'; // Chrome 47
							mediaRecorder = new MediaRecorder(stream, options);
						}
						catch (e2) {
							alert('MediaRecorder is not supported by this browser.\n\n' +
								'Try Chrome 47 or later, with Experimental Web Platform features enabled from chrome://flags.');
							console.error('Exception while creating MediaRecorder:', e2);
							return;
						}
					}
				}
				mediaRecorder.onstop = handleStop;
				mediaRecorder.ondataavailable = handleDataAvailable;

				var countdown = 10;
				console.log("recording started");
				mediaRecorder.start();
				protoar("start", {
					important: true
				});
				var countFrame = 0;
				var smallStep = function () {
					largeContext = largeCanvas.getContext("2d");
					if (countFrame % 10 == 0) {
						$("#record").html('<i class="fa fa-circle" style="color: #f00"></i> ' + countdown--);
						if (countdown == -1) {
							$("#record").click();
							return;
						}
					}
					if (boundary.checked) {
						largeContext.drawImage(bc, 0, ((9 - countdown) * 10 + countFrame) * bc.height, bc.width, bc.height);
					}
					else {
						largeContext.drawImage(cc, 0, ((9 - countdown) * 10 + countFrame) * cc.height, cc.width, cc.height);
					}
					countFrame++;
					timeout = setTimeout(smallStep, 100);
				};
				smallStep();
				//				(function step() {
				//					$("#record").html('<i class="fa fa-circle" style="color: #f00"></i> ' + countdown--);
				//					if (countdown == 0) {
				//						$("#record").click();
				//					}
				//					else {
				//						timeout = setTimeout(step, 1000);
				//					}
				//				})();
			}
			else {
				timeout = clearTimeout(timeout);
				mediaRecorder.stop();
				protoar("stop", {
					important: true
				});
				//addImageResource(cc.toDataURL());
				$(this).html(record);
			}
		});

		$("#filter-color").on("change", function () {
			fcolor = hexToRgb(this.value);
			$(filter).prop("checked", true);
		});

		$("#filter-tolerance").on("change", function () {
			$(filter).prop("checked", true);
		});

		$(cc).on({
			click: function (e) {
				$(filter).prop("checked", true);

				var color = "#ffffff",
					offset = $(this).offset(),
					x = (e.pageX - offset.left) * cc.width / cc.clientWidth, // adjust coordinates if render size different from client size
					y = (e.clientY - offset.top) * cc.height / cc.clientHeight,
					data = cc.getContext('2d').getImageData(x, y, 1, 1).data,
					color = rgbToHex(data[0], data[1], data[2]);

				$("#filter-color").prop("value", color);
				fcolor = hexToRgb(color);
			},
			dragstart: function (e) {
				console.log('cc clicked');
				if (boundary.checked) {
					captureDataUrl = bc.toDataURL();
				}
				else {
					captureDataUrl = cc.toDataURL();
				}
			}
		});

		// enable dragging on capture fcanvas
		cc.draggable = "true";
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
			// console.log(tempcamera.getWorldDirection());
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
		case "snapshot":
		case "record":
			setCaptureSource(arcamera);
			setTimeout(function () {
				$("#" + e.action).click()
			}, 100); // give it some time to switch cameras
			break;
		default:
			console.log("unknown protoar action", e.action);
		}
	}

	/* helper functions */

	function hasInspector() {
		var el = $(".toggle-edit", aframe.document);
		return el.length == 1 && el.text().startsWith("Back");
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
		resize(vc, w, h);
		resize(arcamera, w, h);
		resize(aframe, w, h);
		//resize(ascene, w, h);
		//resize(acanvas, w, h);
		resize(fcanvasEl, w, h);

		fcanvas.setWidth(w);
		fcanvas.setHeight(h);
		fcanvas.calcOffset();
		fcanvas.renderAll();
	}

	/* toggles 2D layer and focus on Aframe/main window accordingly for keyboard input */
	function toggleAframe() {
		$(layer2D).click();
		if (layer2D.checked) {
			setTimeout(function () {
				$(window).focus().click();
			}, 100);
		}
		else {
			setTimeout(function () {
				$(aframe).focus().click();
			}, 100);
		}
	}

	function setMode(value) {
		console.log("mode", value);

		$(".specific-tools").hide();
		mode = value;
		$("#" + mode + "-tools").show();

		$(".mode.selected").removeClass("selected");
		$("#" + mode + "-mode").addClass("selected");

		// set free drawing mode
		fcanvas.isDrawingMode = mode === "draw";

		// set selection according to drawing mode
		fcanvas.selection = mode == "select";

		// unselect everything on the fcanvas
		selectAll(mode == "select");
		fcanvas.deactivateAll()
		fcanvas.renderAll();
	}

	function isEditing() {
		var o = fcanvas.getActiveObject();
		return o && o.get("type") == "i-text";
	}

	function setColor(value) {
		$("#color").prop("value", value);
		if (fcanvas.freeDrawingBrush) {
			fcanvas.freeDrawingBrush.color = value;
		}

		updateSelection(function (o) {
			if (!o) return;
			var attr = o.get("type") == "path" ? "stroke" : "fill";
			o.set(attr, value);
		});
	}

	function rgb2gray(r, g, b) {
		var gray = 0.299 * r + 0.587 * g + 0.114 * b;
		return gray;
	}

	function setCaptureCamera(value) {
		ccamera = new Camera({
			camera: value
		});
		ccamera.video.onloadedmetadata = function () {
			setCaptureSource(ccamera.video);
		};
	}

	function setCaptureSource(value) {
		src = value;
		var w = src.videoWidth || src.naturalWidth || src.width,
			h = src.videoHeight || src.naturalHeight || src.height;
		resize(cc, w, h, false);
		resize(cc2, w, h, false);
	}

	function getColor() {
		return $("#color").prop("value");
	}

	function setOpacity(value) {
		updateSelection(function (o) {
			if (!o) return;
			o.set("opacity", value);
		});
	}

	function getOpacity() {
		return $("#opacity").prop("value");
	}

	function addImage(data) {
		fabric.Image.fromURL(data, function (Img) {
			Img.set({
				left: offset += 10,
				top: offset,
				opacity: getOpacity()
			});
			fcanvas.add(Img).setActiveObject(Img).renderAll();
		});
	}

	function selectAll(selectable) {
		fcanvas.deactivateAll();

		var objs = fcanvas.getObjects().map(function (o) {
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
		fcanvas.discardActiveObject();
		fcanvas.setActiveGroup(group.setCoords()).renderAll();
	}

	function updateSelection(update) {
		if (fcanvas.getActiveGroup()) {
			fcanvas.getActiveGroup().forEachObject(update);
		}
		else {
			update(fcanvas.getActiveObject());
		}
		fcanvas.renderAll();
	}

	var rescnt = 0;

	function addImageResource(img) {
		var resource = $(`<img id="${rescnt++}" src="${img}" />`);

		resource.on({
			click: function () {
				if (!$(this).hasClass("selected")) {
					$(".selected").removeClass("selected"); // unselect old one
					$(this).addClass("selected");

					setCaptureSource(this);
				}
				else {
					$(this).removeClass("selected");

					setCaptureSource(ccamera.video);
				}
			},
			dragstart: function () {
				var canvas = document.createElement("canvas");
				canvas.width = vc.width;
				canvas.height = vc.height;

				var ctx = canvas.getContext("2d");
				ctx.drawImage(this, 0, 0);

				//				captureDataUrl = toDataURL(vc);
				captureDataUrl = toDataURL(canvas);
			}
		});

		$("#resources").append(resource);
	}

	function toDataURL(src) {
		var canvas = document.createElement("canvas");
		canvas.width = vc.width;
		canvas.height = vc.height;

		var ctx = canvas.getContext("2d");
		ctx.drawImage(src, 0, 0);

		return canvas.toDataURL();
	}

	function addVideoResource(blob) {
		//var video = document.createElement('video');
		var buffer = new Blob([blob], {
			type: "video/webm"
		});
		var video = $(`<video id="${rescnt++}" autoplay loop muted draggable="true" src="${window.URL.createObjectURL(buffer)}"/>`);
		video[0].userData = {
			blob: buffer,
			duration: null,
			largeCanvas: largeCanvas
		};

		video.on({
			click: function () {
				if (!$(this).hasClass("selected")) {
					$(".selected").removeClass("selected"); // unselect old one
					$(this).addClass("selected");

					setCaptureSource(this);
				}
				else {
					$(this).removeClass("selected");

					setCaptureSource(ccamera.video);
				}
			},
			dragstart: function () {
				/*drag the video into the canvas*/
				console.log("dragging video");
				videoDragged = this;
				videoDragged.userData.duration = this.duration;
			}
		});

		$("#resources").append(video);
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

	var vcctx = vc.getContext("2d");
	vcctx.fillStyle = "#000000";

	var bctx = bc.getContext('2d');

	function animate() {
		animateVC();

		animateCC();
	}

	function animateVC() {
		requestAnimationFrame(animateVC);
		// prepare vc
		vcctx.fillRect(0, 0, vc.width, vc.height);

		if (layerAR.checked) {
			//vcctx.drawImage(arcamera, 0, 0); // doesn't work

			vcctx.drawImage(arcamera, 0, 0, arcamera.videoWidth, arcamera.videoHeight, 0, 0, vc.width, vc.height); // need this to draw the video image with the resolution of the vc (under poor streaming conditions the video may be streamed with more compression and lower resolution, which we need to counteract!)
		}
		else {
			vcctx.clearRect(0, 0, vc.width, vc.height);
		}

		if (layer3D.checked) {
			vcctx.drawImage(avideo, 0, 0, avideo.videoWidth, avideo.videoHeight, 0, 0, vc.width, vc.height); // can't draw acanvas, but can draw its stream on avideo
		}

		if (layer2D.checked) {
			vcctx.drawImage(fcanvasEl, 0, 0, fcanvasEl.width, fcanvasEl.height, 0, 0, vc.width, vc.height);
		}
	}

	function animateCC() {
		requestAnimationFrame(animateCC);
		var w = cc.width,
			h = cc.height;

		// prepare ccanvas
		ccctx.clearRect(0, 0, w, h);
		cc2ctx.clearRect(0, 0, w, h);

		if (!src || !w || !h) return; // nothing to render if no capture source

		// apply the filter to the capture source (including camera video, or image and video resources)
		cc2ctx.drawImage(src, 0, 0);

		var image = cc2ctx.getImageData(0, 0, w, h),
			bmp = image.data;

		function within(value, target) {
			return Math.abs(value - target) <= ftolerance.value;
		}

		if (filter.checked) {
			for (var x = 0; x < cc.width; ++x) {
				for (var y = 0; y < cc.height; ++y) {
					var i = (x + y * cc.width) * 4;
					if (boundary.checked) {
						if (x < cc.width / 2 - br || x > cc.width / 2 + br || y < cc.height / 2 - br || y > cc.height / 2 + br) {
							var r = bmp[i],
								g = bmp[i + 1],
								b = bmp[i + 2];
							var gray = rgb2gray(r, g, b) / 3;
							bmp[i] = gray;
							bmp[i + 1] = gray;
							bmp[i + 2] = gray;
						}
						else {
							var r = bmp[i],
								g = bmp[i + 1],
								b = bmp[i + 2];

							if (within(r, fcolor.r) && within(g, fcolor.g) && within(b, fcolor.b)) {
								bmp[i + 3] = 0;
							}
						}
					}
					else {
						var r = bmp[i],
							g = bmp[i + 1],
							b = bmp[i + 2];

						if (within(r, fcolor.r) && within(g, fcolor.g) && within(b, fcolor.b)) {
							bmp[i + 3] = 0;
						}
					}
				}
			}
		}

		else if (boundary.checked) {
			for (var x = 0; x < cc.width; ++x) {
				if (x < cc.width / 2 - br || x > cc.width / 2 + br) {
					for (var y = 0; y < cc.height; ++y) {
						var idx = (x + y * cc.width) * 4;
						var r = bmp[idx],
							g = bmp[idx + 1],
							b = bmp[idx + 2];
						var gray = rgb2gray(r, g, b) / 3;
						bmp[idx] = gray;
						bmp[idx + 1] = gray;
						bmp[idx + 2] = gray;
					}
				}
				else {
					for (var y = 0; y < cc.height; ++y) {
						if (y < cc.height / 2 - br || y > cc.height / 2 + br) {
							var idx = (x + y * cc.width) * 4;
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
		ccctx.putImageData(image, 0, 0);
		if (boundary.checked) {
			bctx.clearRect(0, 0, br * 2, br * 2);
			bctx.drawImage(cc, cc.width / 2 - br, cc.height / 2 - br, br * 2, br * 2, 0, 0, br * 2, br * 2);
		}
	}
});
