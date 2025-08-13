// --- Three.js Setup ---
let scene, camera, renderer, sphereMesh;
let container = document.getElementById('container');
let textureLoader = new THREE.TextureLoader();
let currentImageTexture;
let originalImageCanvas;
let imageWidth, imageHeight;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 1;

    renderer = new THREE.WebGLRenderer({ antialiasing: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const sphereMaterial = new THREE.MeshBasicMaterial({
        side: THREE.FrontSide,
        transparent: true,
        opacity: 1
    });

    const sphereGeometry = new THREE.SphereGeometry(0.5, 64, 64);
    sphereGeometry.scale(-1, 1, 1);
    sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphereMesh);

    const equatorMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const equatorPoints = [];
    const radius = 0.5;
    for (let i = 0; i <= 360; i++) {
        const theta = THREE.MathUtils.degToRad(i);
        equatorPoints.push(new THREE.Vector3(
            radius * Math.cos(theta),
            0,
            radius * Math.sin(theta)
        ));
    }
    const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorLine = new THREE.Line(equatorGeometry, equatorMaterial);
    sphereMesh.add(equatorLine);

    const meridianMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const meridianPoints = [];
    for (let i = -90; i <= 90; i++) {
        const phi = THREE.MathUtils.degToRad(i);
        meridianPoints.push(new THREE.Vector3(
            radius * Math.cos(phi),
            radius * Math.sin(phi),
            0
        ));
    }
    const meridianGeometry = new THREE.BufferGeometry().setFromPoints(meridianPoints);
    const meridianLine = new THREE.Line(meridianGeometry, meridianMaterial);
    sphereMesh.add(meridianLine);

    loadTexture(document.getElementById('imageUrl').value);

    function onDocumentMouseDown(event) {
        isDragging = true;
        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }

    function onDocumentMouseUp() {
        isDragging = false;
    }

    function onDocumentMouseMove(event) {
        if (!isDragging) return;
        const deltaMove = {
            x: event.clientX - previousMousePosition.x,
            y: event.clientY - previousMousePosition.y
        };

        const rotationSpeed = 0.005;
        sphereMesh.rotation.y += deltaMove.x * rotationSpeed;
        sphereMesh.rotation.x += deltaMove.y * rotationSpeed;

        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }

    container.addEventListener('mousedown', onDocumentMouseDown, false);
    container.addEventListener('mouseup', onDocumentMouseUp, false);
    container.addEventListener('mousemove', onDocumentMouseMove, false);

    window.addEventListener('resize', onWindowResize, false);
    document.getElementById('loadImageBtn').addEventListener('click', () => {
        loadTexture(document.getElementById('imageUrl').value);
    });

    const controls = ['horizontalCoverage', 'verticalCoverageTop', 'verticalCoverageBottom', 'flipHorizontal', 'cropLeft', 'cropRight', 'cropTop', 'cropBottom'];
    controls.forEach(id => {
        const element = document.getElementById(id);
        if (id.includes('Coverage')) {
            element.addEventListener('input', () => {
                document.getElementById(id + 'Value').innerText = `${element.value}°`;
                updateProjection();
            });
        } else if (element.type === 'range') {
            element.addEventListener('input', () => {
                document.getElementById(id + 'Value').innerText = `${element.value}%`;
                updateProjection();
            });
        } else {
            element.addEventListener('change', updateProjection);
        }
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadImage);

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function loadTexture(url) {
    textureLoader.load(
        url,
        (texture) => {
            currentImageTexture = texture;
            originalImageCanvas = document.createElement('canvas');
            const context = originalImageCanvas.getContext('2d');
            const img = texture.image;
            originalImageCanvas.width = img.width;
            originalImageCanvas.height = img.height;
            context.drawImage(img, 0, 0);
            imageWidth = img.width;
            imageHeight = img.height;
            updateProjection();
        },
        undefined,
        (err) => {
            console.error('An error happened while loading the texture.', err);
        }
    );
}

function updateProjection() {
    if (!currentImageTexture) return;

    const horizontalCoverageDegrees = parseFloat(document.getElementById('horizontalCoverage').value);
    const verticalCoverageTopDegrees = parseFloat(document.getElementById('verticalCoverageTop').value);
    const verticalCoverageBottomDegrees = parseFloat(document.getElementById('verticalCoverageBottom').value);
    const flipHorizontal = document.getElementById('flipHorizontal').checked;
    const cropLeft = parseFloat(document.getElementById('cropLeft').value) / 100;
    const cropRight = parseFloat(document.getElementById('cropRight').value) / 100;
    const cropTop = parseFloat(document.getElementById('cropTop').value) / 100;
    const cropBottom = parseFloat(document.getElementById('cropBottom').value) / 100;

    // --- Stage 1: Crop the source image ---
    const croppedCanvas = document.createElement('canvas');
    const croppedContext = croppedCanvas.getContext('2d');
    const cropX = imageWidth * cropLeft;
    const cropY = imageHeight * cropTop;
    const cropWidth = imageWidth - (imageWidth * cropLeft + imageWidth * cropRight);
    const cropHeight = imageHeight - (imageHeight * cropTop + imageHeight * cropBottom);
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    croppedContext.drawImage(originalImageCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const newTexture = new THREE.CanvasTexture(croppedCanvas);
    newTexture.wrapS = THREE.RepeatWrapping;
    newTexture.wrapT = THREE.ClampToEdgeWrapping;
    newTexture.minFilter = THREE.LinearFilter;
    newTexture.magFilter = THREE.LinearFilter;

    // --- Stage 2: Adjust sphere geometry for coverage ---
    const horizontalCoverageRadians = THREE.MathUtils.degToRad(horizontalCoverageDegrees);
    const verticalCoverageTopRadians = THREE.MathUtils.degToRad(verticalCoverageTopDegrees);
    const verticalCoverageBottomRadians = THREE.MathUtils.degToRad(verticalCoverageBottomDegrees);

    const phiStart = Math.PI/2 - verticalCoverageTopRadians;
    const phiLength = verticalCoverageTopRadians + verticalCoverageBottomRadians;

    const finalPhiLength = Math.min(phiLength, Math.PI);
    const finalPhiStart = Math.max(0, phiStart);

    const newSphereGeometry = new THREE.SphereGeometry(0.5, 64, 64, 0, horizontalCoverageRadians, finalPhiStart, finalPhiLength);
    newSphereGeometry.scale(-1, 1, 1);

    if (flipHorizontal) {
        const uvAttribute = newSphereGeometry.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
            let u = uvAttribute.getX(i);
            uvAttribute.setX(i, 1 - u);
        }
        uvAttribute.needsUpdate = true;
    }

    sphereMesh.geometry.dispose();
    sphereMesh.geometry = newSphereGeometry;

    if (sphereMesh.material.map) {
        sphereMesh.material.map.dispose();
    }
    sphereMesh.material.map = newTexture;
    sphereMesh.material.needsUpdate = true;
}

function downloadImage() {
    if (!currentImageTexture) {
        alert("Please load an image first.");
        return;
    }

    const downloadWidth = 4096;
    const downloadHeight = 4096;
    const padding = 1.05; // Added padding factor

    const downloadRenderer = new THREE.WebGLRenderer({ antialiasing: true, preserveDrawingBuffer: true });
    downloadRenderer.setSize(downloadWidth, downloadHeight);

    const containerAspect = container.clientWidth / container.clientHeight;

    const downloadCamera = new THREE.PerspectiveCamera(
        camera.fov,
        downloadWidth / downloadHeight,
        camera.near,
        camera.far
    );
    
    let newFOV = camera.fov;
    if (containerAspect > 1) {
        newFOV = (Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / containerAspect) * 2);
    } else {
        newFOV = (Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * containerAspect) * 2);
    }
    
    // Apply padding to the calculated FOV
    downloadCamera.fov = THREE.MathUtils.radToDeg(newFOV) * padding;

    downloadCamera.position.copy(camera.position);
    downloadCamera.rotation.copy(camera.rotation);
    downloadCamera.updateProjectionMatrix();

    const downloadScene = scene.clone();
    downloadRenderer.render(downloadScene, downloadCamera);

    const imgData = downloadRenderer.domElement.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = 'spherical-projection.png';
    link.href = imgData;
    link.click();

    downloadRenderer.dispose();
}

init();