import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "../vendor/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "../vendor/examples/jsm/loaders/GLTFLoader.js";
import { holocodeGalleryScenes } from "./scenes.js?v=20260530-floor-align-box";

const viewers = [
  ["#holocode-gallery-viewer", holocodeGalleryScenes],
];

for (const [selector, scenes] of viewers) {
  const root = document.querySelector(selector);
  if (root && scenes.length) {
    initViewer(root, scenes);
  }
}

function initViewer(root, scenes) {
  const canvas = root.querySelector("[data-viewer-canvas]");
  const sceneList = root.querySelector("[data-viewer-scenes]");
  const methodList = root.querySelector("[data-viewer-methods]");
  const titleEl = root.querySelector("[data-viewer-title]");
  const descEl = root.querySelector("[data-viewer-description]");
  const statusEl = root.querySelector("[data-viewer-status]");
  const resetButton = root.querySelector("[data-viewer-reset]");

  if (!canvas || !sceneList || !methodList || !titleEl || !descEl || !statusEl) {
    return;
  }

  let activeScene = scenes[0];
  let activeVariant = findInitialVariant(activeScene);
  let renderer = null;
  let world = null;
  let camera = null;
  let controls = null;
  let modelRoot = null;
  let gridRoot = null;
  let loader = null;
  let currentObject = null;
  let lastFrame = null;
  let viewerReady = false;

  titleEl.textContent = activeScene.title;
  descEl.textContent = activeScene.description;
  if (resetButton) resetButton.disabled = true;
  buildSceneList();
  buildMethodList();
  updateActiveButtons();

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = "WebGL is unavailable in this browser.";
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  world = new THREE.Scene();
  world.background = new THREE.Color(0xf7f9fb);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;

  modelRoot = new THREE.Group();
  world.add(modelRoot);

  gridRoot = new THREE.Group();
  world.add(gridRoot);

  world.add(new THREE.HemisphereLight(0xffffff, 0x5d6672, 1.8));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(4, 7, 5);
  world.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
  fillLight.position.set(-5, 3, -4);
  world.add(fillLight);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("./static/interactive/vendor/examples/jsm/libs/draco/");
  loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  viewerReady = true;
  loadVariant(activeVariant);

  resetButton?.addEventListener("click", () => frameCurrentObject());

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(world, camera);
  });

  function buildSceneList() {
    sceneList.innerHTML = "";
    for (const item of scenes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "interactive-thumb";
      button.dataset.sceneId = item.id;
      button.innerHTML = `
        <img src="${item.thumb}" alt="">
        <span>${item.title}</span>
      `;
      button.addEventListener("click", () => selectScene(item.id));
      sceneList.appendChild(button);
    }
  }

  function buildMethodList() {
    methodList.innerHTML = "";
    methodList.hidden = activeScene.variants.length <= 1;
    for (const variant of activeScene.variants) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "interactive-method";
      button.dataset.variantId = variant.id;
      button.textContent = variant.label;
      button.disabled = !isVariantAvailable(variant);
      if (variant.note) {
        button.title = variant.note;
      }
      button.addEventListener("click", () => selectVariant(variant.id));
      methodList.appendChild(button);
    }
  }

  function selectScene(sceneId, preferredVariantId) {
    const nextScene = scenes.find((item) => item.id === sceneId);
    if (!nextScene) return;
    activeScene = nextScene;
    activeVariant =
      activeScene.variants.find((item) => item.id === preferredVariantId && isVariantAvailable(item)) ||
      findInitialVariant(activeScene);
    titleEl.textContent = activeScene.title;
    descEl.textContent = activeScene.description;
    buildMethodList();
    updateActiveButtons();
    if (viewerReady) {
      loadVariant(activeVariant);
    } else {
      statusEl.textContent = "WebGL is unavailable in this browser.";
    }
  }

  function selectVariant(variantId) {
    const nextVariant = activeScene.variants.find((item) => item.id === variantId);
    if (!nextVariant) return;
    if (!isVariantAvailable(nextVariant)) {
      statusEl.textContent = nextVariant.note || `${nextVariant.label} mesh is not available.`;
      return;
    }
    activeVariant = nextVariant;
    updateActiveButtons();
    if (viewerReady) {
      loadVariant(activeVariant);
    } else {
      statusEl.textContent = "WebGL is unavailable in this browser.";
    }
  }

  function updateActiveButtons() {
    sceneList.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sceneId === activeScene.id);
    });
    methodList.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.variantId === activeVariant.id);
    });
  }

  function loadVariant(variant) {
    if (!variant || !isVariantAvailable(variant)) {
      statusEl.textContent = variant?.note || "Mesh is not available.";
      return;
    }

    if (variant.objectsUrl) {
      loadObjectSet(variant);
      return;
    }

    const loadId = `${activeScene.id}:${variant.id}:${Date.now()}`;
    lastFrame = loadId;
    statusEl.textContent = `Loading ${variant.label}...`;
    if (resetButton) resetButton.disabled = true;
    clearModel();

    loader.load(
      variant.model,
      (gltf) => {
        if (lastFrame !== loadId) return;
        currentObject = gltf.scene;
        prepareObjectMaterials(currentObject);
        alignObjectFloor(currentObject, activeScene);
        modelRoot.add(currentObject);
        frameCurrentObject();
        statusEl.textContent = `${activeScene.title} · ${variant.label}`;
        if (resetButton) resetButton.disabled = false;
      },
      (event) => {
        if (!event.total || lastFrame !== loadId) return;
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        statusEl.textContent = `Loading ${variant.label} ${pct}%`;
      },
      (error) => {
        console.error(error);
        if (lastFrame === loadId) {
          statusEl.textContent = `Could not load ${variant.label}`;
        }
      }
    );
  }

  async function loadObjectSet(variant) {
    const loadId = `${activeScene.id}:${variant.id}:${Date.now()}`;
    lastFrame = loadId;
    statusEl.textContent = `Loading ${variant.label} metadata...`;
    if (resetButton) resetButton.disabled = true;
    clearModel();

    try {
      const response = await fetch(variant.objectsUrl);
      if (!response.ok) {
        throw new Error(`Could not fetch ${variant.objectsUrl}`);
      }
      const metadata = await response.json();
      const objects = metadata.objects || [];
      const objectGroup = new THREE.Group();
      let loaded = 0;

      await Promise.all(
        objects.map(async (item) => {
          const gltf = await loader.loadAsync(`${variant.objectModelBase}${item.id}.glb`);
          const object = gltf.scene;
          applyObjectTransform(object, item);
          prepareObjectMaterials(object);
          objectGroup.add(object);
          loaded += 1;
          if (lastFrame === loadId) {
            statusEl.textContent = `Loading ${variant.label} ${loaded}/${objects.length}`;
          }
        })
      );

      if (lastFrame !== loadId) {
        disposeObject(objectGroup);
        return;
      }
      currentObject = objectGroup;
      alignObjectFloor(currentObject, activeScene);
      modelRoot.add(currentObject);
      frameCurrentObject();
      statusEl.textContent = `${activeScene.title} · ${variant.label}`;
      if (resetButton) resetButton.disabled = false;
    } catch (error) {
      console.error(error);
      if (lastFrame === loadId) {
        statusEl.textContent = `Could not load ${variant.label}`;
      }
    }
  }

  function clearModel() {
    if (currentObject) {
      modelRoot.remove(currentObject);
      disposeObject(currentObject);
      currentObject = null;
    }
    gridRoot.clear();
  }

  function frameCurrentObject() {
    if (!currentObject) return;
    currentObject.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(currentObject);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    currentObject.position.sub(center);
    currentObject.updateMatrixWorld(true);

    const framedBox = new THREE.Box3().setFromObject(currentObject);
    const size = framedBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))) * 1.65;

    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 1000;
    camera.position.set(distance * 0.8, distance * 0.48, distance * 0.9);
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.minDistance = maxDim * 0.08;
    controls.maxDistance = distance * 8;
    controls.update();

    gridRoot.clear();
    const gridSize = Math.max(2, maxDim * 1.15);
    const grid = new THREE.GridHelper(gridSize, 20, 0x8f98a3, 0xd2d8df);
    grid.position.y = estimateGroundY(currentObject, framedBox, activeScene.floorQuantile);
    gridRoot.add(grid);
  }

  function resize() {
    const parent = canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function findInitialVariant(scene) {
  return scene.variants.find((variant) => isVariantAvailable(variant)) || scene.variants[0];
}

function isVariantAvailable(variant) {
  return Boolean(variant && !variant.disabled && (variant.model || variant.objectsUrl));
}

function applyObjectTransform(object, item) {
  const translation = item.translation?.[0] || [0, 0, 0];
  const rotation = item.rotation?.[0] || [0, 0, 0, 1];
  const scale = item.scale?.[0] || [1, 1, 1];
  object.position.set(translation[0], translation[1], translation[2]);
  object.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  object.scale.set(scale[0], scale[1], scale[2]);
}

function prepareObjectMaterials(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          material.side = THREE.DoubleSide;
          if (material.color && !material.map && !material.vertexColors && material.color.getHex() === 0x000000) {
            material.color.set(0xb8b1a6);
            material.roughness = 0.72;
          }
        }
      }
    }
  });
}

function estimateGroundY(object, box, quantile) {
  if (!quantile || quantile <= 0) {
    return box.min.y;
  }

  const values = [];
  const point = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    const position = child.geometry?.attributes?.position;
    if (!child.isMesh || !position) return;
    const step = Math.max(1, Math.ceil(position.count / 12000));
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      values.push(point.y);
    }
  });

  if (!values.length) {
    return box.min.y;
  }

  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * quantile)));
  return values[index];
}

function alignObjectFloor(object, sceneConfig) {
  if (!sceneConfig?.alignFloor) {
    return;
  }

  object.updateMatrixWorld(true);
  const points = collectSampledWorldPoints(object, 60000);
  if (points.length < 12) {
    return;
  }

  const yLimit = quantile(points.map((point) => point.y), sceneConfig.floorFitQuantile || 0.08);
  const floorPoints = points.filter((point) => point.y <= yLimit);
  const plane = fitPlaneY(floorPoints);
  if (!plane) {
    return;
  }

  const normal = new THREE.Vector3(-plane.a, 1, -plane.b).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const angleDeg = THREE.MathUtils.radToDeg(normal.angleTo(up));
  const maxAngle = sceneConfig.maxFloorTiltDeg || 25;
  if (angleDeg < 0.25 || angleDeg > maxAngle) {
    return;
  }

  object.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(normal, up));
  object.updateMatrixWorld(true);
}

function collectSampledWorldPoints(object, maxPoints) {
  const points = [];
  const point = new THREE.Vector3();
  let totalVertices = 0;

  object.traverse((child) => {
    const position = child.geometry?.attributes?.position;
    if (child.isMesh && position) {
      totalVertices += position.count;
    }
  });

  const step = Math.max(1, Math.ceil(totalVertices / maxPoints));
  object.traverse((child) => {
    const position = child.geometry?.attributes?.position;
    if (!child.isMesh || !position) return;
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      points.push(point.clone());
    }
  });

  return points;
}

function quantile(values, q) {
  if (!values.length) {
    return 0;
  }
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * q)));
  return values[index];
}

function fitPlaneY(points) {
  if (points.length < 3) {
    return null;
  }

  let sx = 0;
  let sz = 0;
  let sy = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  let sxy = 0;
  let szy = 0;

  for (const point of points) {
    sx += point.x;
    sz += point.z;
    sy += point.y;
    sxx += point.x * point.x;
    szz += point.z * point.z;
    sxz += point.x * point.z;
    sxy += point.x * point.y;
    szy += point.z * point.y;
  }

  const count = points.length;
  const det =
    sxx * (szz * count - sz * sz) -
    sxz * (sxz * count - sz * sx) +
    sx * (sxz * sz - szz * sx);

  if (Math.abs(det) < 1e-8) {
    return null;
  }

  const detA =
    sxy * (szz * count - sz * sz) -
    sxz * (szy * count - sz * sy) +
    sx * (szy * sz - szz * sy);
  const detB =
    sxx * (szy * count - sz * sy) -
    sxy * (sxz * count - sz * sx) +
    sx * (sxz * sy - szy * sx);
  const detC =
    sxx * (szz * sy - szy * sz) -
    sxz * (sxz * sy - szy * sx) +
    sxy * (sxz * sz - szz * sx);

  return {
    a: detA / det,
    b: detB / det,
    c: detC / det,
  };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}
