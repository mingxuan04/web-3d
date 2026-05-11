import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080820);

const container = document.getElementById('canvas-container');
const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

let currentModel = null;
let pivotGroup = new THREE.Group();
scene.add(pivotGroup);
let isWireframe = false;
let isLightOn = true;
let isRotating = true;
let isDragging = false;
let targetZoom = 5;
let currentZoom = 5;
let targetCamY = 0;
let targetRotX = 0, targetRotY = 0, targetRotZ = 0;
let cameraViewActive = false;
let inertiaVelocity = { x: 0, y: 0, z: 0 };
const INERTIA_DAMPING = 0.95;
const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true, transparent: true, opacity: 0.8 });
const originalMaterials = new Map();

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const light1 = new THREE.PointLight(0xffeedd, 3, 100);
light1.castShadow = true;
scene.add(light1);

const light2 = new THREE.PointLight(0x88aaff, 2, 100);
scene.add(light2);

const light3 = new THREE.PointLight(0xffddff, 1.5, 80);
scene.add(light3);

const light4 = new THREE.DirectionalLight(0xffffff, 2.5);
scene.add(light4);

// Floating particles
const particlesGeom = new THREE.BufferGeometry();
const particlesCount = 300;
const positions = new Float32Array(particlesCount * 3);
for (let i = 0; i < particlesCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 12;
    positions[i + 1] = (Math.random() - 0.5) * 10;
    positions[i + 2] = (Math.random() - 0.5) * 6;
}
particlesGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particlesMat = new THREE.PointsMaterial({
    color: 0x4488ff,
    size: 0.015,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const particles = new THREE.Points(particlesGeom, particlesMat);
scene.add(particles);

// Glow ring platform
const ringGeom = new THREE.TorusGeometry(1.1, 0.008, 16, 100);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, depthWrite: false });
const ring = new THREE.Mesh(ringGeom, ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -2.3;
scene.add(ring);

const ring2Geom = new THREE.TorusGeometry(1.4, 0.005, 16, 100);
const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.25, depthWrite: false });
const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
ring2.rotation.x = -Math.PI / 2;
ring2.position.y = -2.28;
scene.add(ring2);

function setupControls() {
    let lastX = 0, lastY = 0;
    const rotationSpeed = 0.005;

    container.addEventListener('contextmenu', (e) => e.preventDefault());

    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        cameraViewActive = false;
        document.querySelectorAll('.cam-view-btn').forEach(b => b.classList.remove('active'));
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        inertiaVelocity.x = 0;
        inertiaVelocity.y = 0;
        inertiaVelocity.z = 0;
        container.style.cursor = 'grabbing';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging || !pivotGroup) return;
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;

        inertiaVelocity.y = deltaX * rotationSpeed;
        inertiaVelocity.x = deltaY * rotationSpeed;
        inertiaVelocity.z = (deltaX + deltaY) * rotationSpeed * 0.3;

        const euler = new THREE.Euler(inertiaVelocity.x, inertiaVelocity.y, inertiaVelocity.z, 'XYZ');
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        pivotGroup.quaternion.premultiply(quaternion);

        lastX = e.clientX;
        lastY = e.clientY;
    });

    const endDrag = () => {
        isDragging = false;
        container.style.cursor = 'grab';
    };
    container.addEventListener('mouseup', endDrag);
    container.addEventListener('mouseleave', endDrag);

    // Touch support
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            inertiaVelocity.x = 0;
            inertiaVelocity.y = 0;
            inertiaVelocity.z = 0;
        }
    });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging || !currentModel || e.touches.length !== 1) return;
        const deltaX = e.touches[0].clientX - lastX;
        const deltaY = e.touches[0].clientY - lastY;

        inertiaVelocity.y = deltaX * rotationSpeed;
        inertiaVelocity.x = deltaY * rotationSpeed;
        inertiaVelocity.z = (deltaX + deltaY) * rotationSpeed * 0.3;

        const euler = new THREE.Euler(inertiaVelocity.x, inertiaVelocity.y, inertiaVelocity.z, 'XYZ');
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        pivotGroup.quaternion.premultiply(quaternion);

        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    });

    container.addEventListener('touchend', () => { isDragging = false; });

    // Scroll to zoom - gentle lerp approach
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        targetZoom += e.deltaY * 0.005;
        targetZoom = Math.max(2.5, Math.min(12, targetZoom));
    });

    container.style.cursor = 'grab';
}

function prepareModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    model.traverse((child) => {
        if (child.isMesh && child.material) {
            const oldMat = child.material;
            child.material = new THREE.MeshStandardMaterial({
                map: oldMat.map || null,
                color: oldMat.color ? oldMat.color.clone() : 0xffffff,
                metalness: 0.4,
                roughness: 0.3
            });
        }
    });
}

const modelList = [
    { value: 'coca_cola_bottle', name: 'Coca Cola (Bottle)', camY: -1.7, zoom: 5 },
    { value: 'just_a_sip_of_the_hmm_-_bottle', name: 'Just A Sip (Bottle)', camY: -0.9, zoom: 3.0 },
    { value: 'soda_cans', name: 'Soda Cans', camY: -1.5, zoom: 5 },
    { value: 'diet_soda', name: 'Diet Soda', camY: -1.6, zoom: 5 }
];
let currentModelIdx = 0;

const loader = new GLTFLoader();

function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('active', show);
}

function loadModel(modelName, idx) {
    if (currentModel) {
        pivotGroup.remove(currentModel);
        originalMaterials.clear();
    }

    showLoading(true);

    const modelPath = `models/${modelName}.glb`;

    loader.load(
        modelPath,
        function (gltf) {
            currentModel = gltf.scene;
            prepareModel(currentModel);

            if (isWireframe) {
                currentModel.traverse((child) => {
                    if (child.isMesh) {
                        originalMaterials.set(child, child.material);
                        child.material = wireframeMaterial;
                    }
                });
            }

            pivotGroup.add(currentModel);
            pivotGroup.position.set(0, -1.8, 0);
            pivotGroup.rotation.set(0, 0, 0);

            const cfg = modelList[idx != null ? idx : 0];
            targetZoom = cfg.zoom;
            targetCamY = cfg.camY;

            showLoading(false);
        },
        function (xhr) {
            // progress
        },
        function (error) {
            console.error(`Failed to load model: ${modelName}`, error);
            showLoading(false);
            alert(`Model file not found! Please ensure the file exists at: ${modelPath}`);
        }
    );
}

loadModel('coca_cola_bottle', 0);

document.getElementById('model-select').addEventListener('change', (e) => {
    const idx = modelList.findIndex(m => m.value === e.target.value);
    if (idx >= 0) currentModelIdx = idx;
    loadModel(e.target.value, idx);
});

document.getElementById('btn-prev').addEventListener('click', () => {
    currentModelIdx = (currentModelIdx - 1 + modelList.length) % modelList.length;
    document.getElementById('model-select').value = modelList[currentModelIdx].value;
    loadModel(modelList[currentModelIdx].value, currentModelIdx);
});

document.getElementById('btn-next').addEventListener('click', () => {
    currentModelIdx = (currentModelIdx + 1) % modelList.length;
    document.getElementById('model-select').value = modelList[currentModelIdx].value;
    loadModel(modelList[currentModelIdx].value, currentModelIdx);
});

document.getElementById('btn-wireframe').addEventListener('click', function () {
    isWireframe = !isWireframe;
    this.classList.toggle('active', isWireframe);
    if (!currentModel) return;
    currentModel.traverse((child) => {
        if (child.isMesh) {
            if (isWireframe) {
                originalMaterials.set(child, child.material);
                child.material = wireframeMaterial;
            } else {
                const original = originalMaterials.get(child);
                if (original) child.material = original;
            }
        }
    });
});

document.getElementById('btn-light').addEventListener('click', function () {
    isLightOn = !isLightOn;
    this.classList.toggle('active', isLightOn);
    [light1, light2, light3, light4].forEach(l => { l.visible = isLightOn; });
});

document.querySelectorAll('.cam-view-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.cam-view-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        cameraViewActive = true;
        inertiaVelocity.x = 0;
        inertiaVelocity.y = 0;
        inertiaVelocity.z = 0;
        switch (this.dataset.view) {
            case 'front':
                targetRotX = 0; targetRotY = 0; targetRotZ = 0;
                break;
            case 'back':
                targetRotX = 0; targetRotY = Math.PI; targetRotZ = 0;
                break;
            case 'top':
                targetRotX = -Math.PI / 2; targetRotY = 0; targetRotZ = 0;
                break;
            case 'bottom':
                targetRotX = Math.PI / 2; targetRotY = 0; targetRotZ = 0;
                break;
        }
    });
});

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function updateLightsToCamera() {
    if (!camera) return;

    const mainLightPos = new THREE.Vector3(-3, 4, 3);
    mainLightPos.applyQuaternion(camera.quaternion);
    mainLightPos.add(camera.position);
    light1.position.copy(mainLightPos);

    const fillLightPos = new THREE.Vector3(4, 2, 2);
    fillLightPos.applyQuaternion(camera.quaternion);
    fillLightPos.add(camera.position);
    light2.position.copy(fillLightPos);

    const rimPos = new THREE.Vector3(0, 1, -4);
    rimPos.applyQuaternion(camera.quaternion);
    rimPos.add(camera.position);
    light3.position.copy(rimPos);

    const topPos = new THREE.Vector3(0, 5, 0);
    topPos.applyQuaternion(camera.quaternion);
    topPos.add(camera.position);
    light4.position.copy(topPos);
    light4.target.position.set(0, 0, 0);
}

function animate() {
    requestAnimationFrame(animate);

    if (currentModel && pivotGroup) {
        if (cameraViewActive) {
            pivotGroup.rotation.x += (targetRotX - pivotGroup.rotation.x) * 0.12;
            pivotGroup.rotation.y += (targetRotY - pivotGroup.rotation.y) * 0.12;
            pivotGroup.rotation.z += (targetRotZ - pivotGroup.rotation.z) * 0.12;
            if (Math.abs(targetRotX - pivotGroup.rotation.x) < 0.001 &&
                Math.abs(targetRotY - pivotGroup.rotation.y) < 0.001 &&
                Math.abs(targetRotZ - pivotGroup.rotation.z) < 0.001) {
                pivotGroup.rotation.set(targetRotX, targetRotY, targetRotZ);
                cameraViewActive = false;
            }
        } else if (!isDragging && (inertiaVelocity.x !== 0 || inertiaVelocity.y !== 0 || inertiaVelocity.z !== 0)) {
            const euler = new THREE.Euler(inertiaVelocity.x, inertiaVelocity.y, inertiaVelocity.z, 'XYZ');
            const quaternion = new THREE.Quaternion().setFromEuler(euler);
            pivotGroup.quaternion.premultiply(quaternion);

            inertiaVelocity.x *= INERTIA_DAMPING;
            inertiaVelocity.y *= INERTIA_DAMPING;
            inertiaVelocity.z *= INERTIA_DAMPING;

            if (Math.abs(inertiaVelocity.x) < 0.0001 && Math.abs(inertiaVelocity.y) < 0.0001 && Math.abs(inertiaVelocity.z) < 0.0001) {
                inertiaVelocity.x = 0;
                inertiaVelocity.y = 0;
                inertiaVelocity.z = 0;
            }
        } else if (isRotating) {
            pivotGroup.rotation.y += 0.01;
        }
    }

    currentZoom += (targetZoom - currentZoom) * 0.1;
    camera.position.z = currentZoom;
    camera.position.y += (targetCamY - camera.position.y) * 0.08;

    particles.rotation.y += 0.0003;
    particles.rotation.x += 0.0002;
    ring.rotation.z += 0.003;
    ring2.rotation.z -= 0.002;
    ring.material.opacity = 0.3 + Math.sin(Date.now() * 0.002) * 0.15;
    ring2.material.opacity = 0.2 + Math.cos(Date.now() * 0.0025) * 0.1;

    updateLightsToCamera();
    renderer.render(scene, camera);
}

setupControls();
animate();

// ========== Music Player ==========
const audio = new Audio('res/music.flac');
audio.volume = 0.7;

const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev-track');
const btnNext = document.getElementById('btn-next-track');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressThumb = document.getElementById('progress-thumb');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const trackTitle = document.getElementById('track-title');
const eqBars = document.querySelectorAll('.eq-bar');

let isPlaying = false;
let eqAnimId = null;

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgress() {
    const pct = (audio.currentTime / audio.duration) * 100 || 0;
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;
    currentTimeEl.textContent = formatTime(audio.currentTime);
}

function animateEqualizer() {
    if (!isPlaying) return;
    eqBars.forEach((bar, i) => {
        const h = 3 + Math.sin(Date.now() * 0.008 + i * 1.2) * 10 + Math.random() * 18;
        const clamped = Math.max(3, Math.min(34, h));
        bar.style.height = `${clamped}px`;
    });
    eqAnimId = requestAnimationFrame(animateEqualizer);
}

function resetEqualizer() {
    if (eqAnimId) { cancelAnimationFrame(eqAnimId); eqAnimId = null; }
    eqBars.forEach(bar => { bar.style.height = '4px'; });
}

btnPlay.addEventListener('click', () => {
    if (isPlaying) {
        audio.pause();
        btnPlay.innerHTML = '<i class="fas fa-play"></i>';
        btnPlay.classList.remove('playing');
        isPlaying = false;
        resetEqualizer();
        trackTitle.textContent = 'Music Track';
    } else {
        audio.play().then(() => {
            btnPlay.innerHTML = '<i class="fas fa-pause"></i>';
            btnPlay.classList.add('playing');
            isPlaying = true;
            trackTitle.textContent = 'Music Track';
            animateEqualizer();
        }).catch(err => {
            console.warn('Audio play failed:', err);
        });
    }
});

audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
});
audio.addEventListener('ended', () => {
    btnPlay.innerHTML = '<i class="fas fa-play"></i>';
    btnPlay.classList.remove('playing');
    isPlaying = false;
    resetEqualizer();
    trackTitle.textContent = 'Music Track';
    progressFill.style.width = '0%';
    progressThumb.style.left = '0%';
    currentTimeEl.textContent = '0:00';
});

progressBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
    updateProgress();
});

volumeSlider.addEventListener('input', () => {
    const vol = volumeSlider.value / 100;
    audio.volume = vol;
    if (vol === 0) {
        volumeIcon.className = 'fas fa-volume-mute';
    } else if (vol < 0.5) {
        volumeIcon.className = 'fas fa-volume-down';
    } else {
        volumeIcon.className = 'fas fa-volume-up';
    }
});

btnPrev.addEventListener('click', () => {
    audio.currentTime = 0;
    updateProgress();
});

btnNext.addEventListener('click', () => {
    audio.currentTime = 0;
    updateProgress();
});

// Navigation
const navLinks = document.querySelectorAll('#top-nav a');
const appContainer = document.getElementById('app-container');
const pageContent = document.getElementById('page-content');
const pageSections = document.querySelectorAll('.page-section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        navLinks.forEach(nav => nav.classList.remove('active'));
        e.target.classList.add('active');

        const targetId = e.target.id;

        if (targetId === 'nav-home') {
            appContainer.style.display = 'flex';
            pageContent.style.display = 'none';
        } else {
            appContainer.style.display = 'none';
            pageContent.style.display = 'block';

            pageSections.forEach(sec => sec.style.display = 'none');

            if (targetId === 'nav-about') document.getElementById('content-about').style.display = 'block';
            if (targetId === 'nav-reference') document.getElementById('content-reference').style.display = 'block';
            if (targetId === 'nav-sitemap') document.getElementById('content-sitemap').style.display = 'block';
            if (targetId === 'nav-originality') document.getElementById('content-originality').style.display = 'block';
        }
    });
});
