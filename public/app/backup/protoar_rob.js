var hideArToolKitWebcam = true,
	logXD = false,
	logWebRTC = false;

console.error = function (msg) {
	alert("Error: " + msg);
}

require(["jquery", "webrtc", "xd"], true).then(init);

function init() {

	/* ARToolKit stuff */

	var arToolKit = initArToolKit();
	console.log(arToolKit);

	// get the camera from ARToolKit
	var webrtc,
		webcam = arToolKit.source.domElement;

	webcam.onloadedmetadata = function () {
		webrtc = new WebRTC({
			video: vcVideo,
			room: room,
			stream: webcam.srcObject,
			onstream: function () {
				// hide camera to make things faster
				if (hideArToolKitWebcam) {
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

	// video used for receiving stream with all layers
	var vcVideo = document.createElement("video");
	vcVideo.setAttribute("autoplay", "");
	vcVideo.onloadedmetadata = function () {
		vc.width = vcVideo.videoWidth;
		vc.height = vcVideo.videoHeight;
	};

	// canvas used for rendering video with all layers
	var vc = document.querySelector("#vcanvas");

	/* XD stuff */

	if (logXD) {
		XD.log = console.log;
	}

	XD.on("devices", function () {
		$("#menu").css("background-color", XD.deviceId);
	});

	XD.on("protoar", protoarHandler);

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

		console.log("protoar", action, data);
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
		case "start":
			$("#record").html(recording);
			break;
		case "stop":
			$("#record").html(record);
			break;
		default:
			console.log("unknown protoar action", e.action);
		}
	}

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
						protoar("record", {
							important: true
						});
						$("#record").html(recording);
						timeout = clearTimeout(timeout);
					}, 1000);
				}, 1000);
			}, 1000);
		}
		else {
			protoar("record", {
				important: true
			});
		}
	});

	$("#reload").click(function () {
		window.location.reload();
	});

	/* animate function */

	var vcctx = vc.getContext("2d");

	function animate() {
		requestAnimationFrame(animate);

		vcctx.drawImage(vcVideo, 0, 0); // becomes too small when video stream is using lower resolution for bandwidth

		vcctx.drawImage(vcVideo, 0, 0, vcVideo.videoWidth, vcVideo.videoHeight, 0, 0, vc.width, vc.height);
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
		window.addEventListener('resize', function () {
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
		onRenderFcts.push(function () {
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

		var oldPosition;

		setInterval(function () {
			smoothedControls.update(markerRoot);

			protoar("camerachanged", {
				position: markerRoot.position,
				rotation: markerRoot.rotation
			});
		}, 1000 / 60);

		/*onRenderFcts.push(function (delta) {
		    smoothedControls.update(markerRoot);
		    if (markerRoot && (markerRoot.position && markerRoot.position.equals(oldPosition)) || (markerRoot.rotation && markerRoot.rotation.equals(oldRotation))) return;
		    //console.log(markerRoot.rotation);
		    //console.log(markerRoot.rotation);
		    protoar("camerachanged", {
		        position: markerRoot.position,
		        rotation: markerRoot.rotation
		    });
		    oldPosition = markerRoot.position;
		    oldRotation = markerRoot.rotation;
		});*/

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
			onRenderFcts.forEach(function (onRenderFct) {
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